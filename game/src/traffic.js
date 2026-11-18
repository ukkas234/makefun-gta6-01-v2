// traffic.js — Solmara ambient traffic: AI cars that follow the road grid,
// turn at intersections and stop when a car ahead is close.
// Original code written for the gta6-01 ("Make GTA 6") entry.
import { createCar, driveCar } from './vehicles.js';

/** Road centrelines of the spec grid: -260..260 in steps of 52 metres. */
export const ROAD_COORDS = [-260, -208, -156, -104, -52, 0, 52, 104, 156, 208, 260];
export const CITY_LIMIT = 260;

const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'muscle', 'van'];
const TRAFFIC_COLORS = [0x3a7bd5, 0xd8d8d8, 0x2e8b57, 0x8e44ad, 0xe67e22, 0xeeeeee];

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** Heading for a car travelling along `axis` ('x' or 'z') in direction `dir`. */
function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

/** Is `v` within `tol` of an intersection coordinate? Returns that coordinate or null. */
function nearIntersectionCoord(v, tol) {
  for (const c of ROAD_COORDS) {
    if (Math.abs(v - c) <= tol) return c;
  }
  return null;
}

/**
 * Create ambient traffic. `scene` is the THREE scene, `city` the city object
 * from the city module (its roadGraph/isOnRoad are used when present, the
 * spec grid is the fallback), `count` the number of AI cars, `random` an
 * optional seeded rng (defaults to Math.random).
 * Returns { cars, update(dt, player), nearestCar(x, z, maxDist) }.
 * Each car is a vehicles.js car object plus ai: { axis, dir, road, cruise, turnCooldown }.
 */
export function createTraffic(scene, city, count, random) {
  const rnd = random || Math.random;
  const cars = [];

  function randomRoadSpot(minPlayerDist) {
    for (let tries = 0; tries < 40; tries += 1) {
      const axis = rnd() < 0.5 ? 'x' : 'z';
      const road = pick(ROAD_COORDS, rnd);
      const along = -240 + rnd() * 480;
      const x = axis === 'x' ? along : road;
      const z = axis === 'x' ? road : along;
      if (minPlayerDist && Math.hypot(x, z) < minPlayerDist) continue;
      if (city && typeof city.isOnRoad === 'function' && !city.isOnRoad(x, z)) continue;
      return { axis, road, x, z };
    }
    return { axis: 'x', road: 0, x: -200, z: 0 };
  }

  function spawnCar() {
    let spot = randomRoadSpot(25);
    // Keep spawns spread out: a car dropped on top of another one jams the
    // whole lane, because every car behind it stops for the car ahead.
    for (let tries = 0; tries < 12; tries += 1) {
      const clash = cars.some((other) => Math.hypot(other.x - spot.x, other.z - spot.z) < 14);
      if (!clash) break;
      spot = randomRoadSpot(25);
    }
    const dir = rnd() < 0.5 ? -1 : 1;
    const type = pick(TRAFFIC_TYPES, rnd);
    const color = type === 'taxi' ? 0xf7c948 : pick(TRAFFIC_COLORS, rnd);
    const car = createCar(type, spot.x, spot.z, headingFor(spot.axis, dir), color);
    car.ai = {
      axis: spot.axis,
      dir,
      road: spot.road,
      cruise: 8 + rnd() * 6, // 8..14 m/s cruise speed
      turnCooldown: 0,
      stopped: false,
    };
    scene.add(car.mesh);
    cars.push(car);
    return car;
  }

  for (let i = 0; i < count; i += 1) spawnCar();

  /**
   * Is there a car close ahead of `car`? Checks the other traffic cars and,
   * when the player is driving, the player's car. "Ahead" means within 10 m,
   * mostly in front, and in the same lane (within ~3 m sideways).
   */
  function carAhead(car, playerCar) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let nearest = Infinity;
    const consider = (ox, oz) => {
      const dx = ox - car.x;
      const dz = oz - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 10 || dist < 0.01) return;
      const forward = (dx * fx + dz * fz) / dist;
      const sideways = Math.abs(dx * fz - dz * fx);
      if (forward > 0.6 && sideways < 3) nearest = Math.min(nearest, dist);
    };
    for (const other of cars) {
      if (other !== car) consider(other.x, other.z);
    }
    if (playerCar) consider(playerCar.x, playerCar.z);
    return nearest;
  }

  /**
   * Advance traffic one step. `player` is the player object ({x, z, car,
   * onFoot}) or a plain {x, z} position; the player's car (when driving) is
   * treated as an obstacle the AI stops behind.
   */
  function update(dt, player) {
    const playerCar = player && player.car && !player.onFoot ? player.car : null;
    for (const car of cars) {
      const ai = car.ai;
      ai.turnCooldown = Math.max(0, ai.turnCooldown - dt);

      // Stop when a car ahead is close; otherwise cruise.
      const aheadDist = carAhead(car, playerCar);
      const targetSpeed = aheadDist < 9 ? 0 : ai.cruise;
      const throttle = car.speed < targetSpeed ? 1 : 0;
      const brake = car.speed > targetSpeed ? 1 : 0;
      driveCar(car, dt, { throttle, steer: 0, brake, handbrake: false }, city);

      // Re-pin the car to its road centreline: driveCar moves it along its
      // heading, so snap the cross-axis coordinate back to the road.
      if (ai.axis === 'x') car.z = ai.road;
      else car.x = ai.road;
      car.mesh.position.set(car.x, 0, car.z);

      // At an intersection, sometimes turn onto the cross road.
      const along = ai.axis === 'x' ? car.x : car.z;
      const cross = nearIntersectionCoord(along, 2.5);
      if (cross !== null && ai.turnCooldown <= 0) {
        const atEdge = Math.abs(along) > 245;
        if (atEdge || rnd() < 0.35) {
          // Turn: new axis, new road line = this intersection, random direction.
          const newAxis = ai.axis === 'x' ? 'z' : 'x';
          const newDir = rnd() < 0.5 ? -1 : 1;
          if (newAxis === 'x') car.z = cross;
          else car.x = cross;
          ai.axis = newAxis;
          ai.dir = newDir;
          ai.road = cross;
          car.heading = headingFor(newAxis, newDir);
          car.mesh.rotation.y = car.heading;
          ai.turnCooldown = 2;
        } else {
          ai.turnCooldown = 1;
        }
      }

      // City edge: never drive off the map — turn around at the last road.
      const pos = ai.axis === 'x' ? car.x : car.z;
      if (Math.abs(pos) > CITY_LIMIT - 4 && ((pos > 0) === (ai.dir > 0))) {
        ai.dir *= -1;
        car.heading = headingFor(ai.axis, ai.dir);
        car.mesh.rotation.y = car.heading;
      }
    }
  }

  /** Nearest traffic car within maxDist of (x, z), or null. */
  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  return { cars, update, nearestCar };
}
