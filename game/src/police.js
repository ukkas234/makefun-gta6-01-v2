// police.js — Solmara wanted system: police cars that chase and ram, and
// on-foot officers who chase the player and bust them up close.
// Original code written for the gta6-01 ("Make GTA 6") entry.
import * as THREE from '../vendor/three.module.js';
import { createCar, driveCar } from './vehicles.js';
import { ROAD_COORDS } from './traffic.js';

/** Wanted decay: one star per this many seconds while no cop is within 60 m. */
export const WANTED_DECAY_SECONDS = 20;
export const WANTED_HIDDEN_DIST = 60;
/** An officer within this distance of the on-foot player for this long busts them. */
export const BUST_DIST = 2;
export const BUST_TIME = 2;
export const MAX_WANTED = 5;

const COP_RUN_SPEED = 5.6;
const POLICE_CHASE_SPEED = 42;

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** Nearest road centreline point to (x, z) on the spec grid. */
function nearestRoadPointGrid(x, z) {
  const snap = (v) => {
    let best = ROAD_COORDS[0];
    for (const c of ROAD_COORDS) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
    return best;
  };
  // Snap the coordinate that is already nearer a road line.
  const sx = snap(x);
  const sz = snap(z);
  return Math.abs(x - sx) < Math.abs(z - sz) ? { x: sx, z } : { x, z: sz };
}

/** A simple box-character officer: dark uniform, head, cap, legs. */
function createCopMesh() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: 0x1a2f5a, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9996b, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), uniform);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.58;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), dark);
  cap.position.y = 1.78;
  group.add(cap);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), dark);
    leg.position.set(sx * 0.14, 0.31, 0);
    group.add(leg);
  }
  // Badge glint.
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xaa8800, emissiveIntensity: 0.5 }),
  );
  badge.position.set(-0.14, 1.2, 0.17);
  group.add(badge);

  // Blob shadow.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  return group;
}

/** Red/blue flashing light bar mounted on a police car's roof. */
function addLightBar(car) {
  const bar = new THREE.Group();
  const redMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 1 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x0000cc, emissive: 0x0000ff, emissiveIntensity: 1 });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.3), redMat);
  red.position.x = -0.32;
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.3), blueMat);
  blue.position.x = 0.32;
  bar.add(red);
  bar.add(blue);
  bar.position.set(0, 1.45, -0.1);
  car.mesh.add(bar);
  car.lightBar = { redMat, blueMat, phase: 0 };
  return car;
}

/**
 * Create the wanted system. `scene` is the THREE scene, `city` the city
 * object (nearestRoadPoint/collideCircle used when present, spec grid
 * otherwise). Returns { wanted, addWanted(n), update(dt, player, cars),
 * reset(), nearestCopDist(x, z), cars, cops }.
 * update() returns true in the exact frame the player is BUSTED.
 * `player` is the player object ({x, z, heading, health, onFoot, car,
 * takeDamage}); `cars` is the traffic car list (used for avoidance).
 */
export function createPolice(scene, city, random) {
  const rnd = random || Math.random;
  const state = {
    wanted: 0,
    cars: [],
    cops: [],
    decayTimer: 0,
    bustTimer: 0,
    flashTime: 0,
  };

  function roadPointNear(x, z, dist) {
    let base;
    if (city && typeof city.nearestRoadPoint === 'function') {
      base = city.nearestRoadPoint(x, z) || { x, z };
    } else {
      base = nearestRoadPointGrid(x, z);
    }
    // Push the spawn point `dist` away from the player along a random road axis.
    const axis = rnd() < 0.5 ? 'x' : 'z';
    const dir = rnd() < 0.5 ? -1 : 1;
    let px = base.x;
    let pz = base.z;
    if (axis === 'x') px = Math.max(-250, Math.min(250, base.x + dir * dist));
    else pz = Math.max(-250, Math.min(250, base.z + dir * dist));
    if (city && typeof city.nearestRoadPoint === 'function') {
      const snapped = city.nearestRoadPoint(px, pz);
      if (snapped) { px = snapped.x; pz = snapped.z; }
    } else {
      const s = nearestRoadPointGrid(px, pz);
      px = s.x; pz = s.z;
    }
    return { x: px, z: pz };
  }

  function spawnPoliceCar(player) {
    const spot = roadPointNear(player.x, player.z, 45 + rnd() * 25);
    const heading = Math.atan2(player.x - spot.x, player.z - spot.z);
    const car = createCar('sedan', spot.x, spot.z, heading, 0x14181d);
    car.isPolice = true;
    car.stuckTimer = 0;
    car.reverseTimer = 0;
    car.ramCooldown = 0;
    addLightBar(car);
    scene.add(car.mesh);
    state.cars.push(car);
    return car;
  }

  function spawnCop(player) {
    const angle = rnd() * Math.PI * 2;
    const dist = 25 + rnd() * 15;
    const x = Math.max(-255, Math.min(255, player.x + Math.cos(angle) * dist));
    const z = Math.max(-255, Math.min(255, player.z + Math.sin(angle) * dist));
    const mesh = createCopMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cop = { mesh, x, z, heading: 0, speed: COP_RUN_SPEED };
    state.cops.push(cop);
    return cop;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = state.cars.indexOf(car);
    if (i >= 0) state.cars.splice(i, 1);
  }

  function removeCop(cop) {
    scene.remove(cop.mesh);
    const i = state.cops.indexOf(cop);
    if (i >= 0) state.cops.splice(i, 1);
  }

  function addWanted(n) {
    state.wanted = Math.max(0, Math.min(MAX_WANTED, state.wanted + n));
    state.decayTimer = 0;
  }

  function reset() {
    state.wanted = 0;
    state.decayTimer = 0;
    state.bustTimer = 0;
    while (state.cars.length) removeCar(state.cars[0]);
    while (state.cops.length) removeCop(state.cops[0]);
  }

  function nearestCopDist(x, z) {
    let best = Infinity;
    for (const car of state.cars) best = Math.min(best, Math.hypot(car.x - x, car.z - z));
    for (const cop of state.cops) best = Math.min(best, Math.hypot(cop.x - x, cop.z - z));
    return best;
  }

  function update(dt, player, cars) {
    dt = Math.min(dt, 0.05);
    state.flashTime += dt;
    let busted = false;

    // Wanted decay: one star per 20 s while no cop is within 60 m.
    if (state.wanted > 0) {
      if (nearestCopDist(player.x, player.z) > WANTED_HIDDEN_DIST) {
        state.decayTimer += dt;
        if (state.decayTimer >= WANTED_DECAY_SECONDS) {
          state.wanted = Math.max(0, state.wanted - 1);
          state.decayTimer = 0;
        }
      } else {
        state.decayTimer = 0;
      }
    }

    // Match the number of police cars to the wanted level (max 5 cars).
    while (state.cars.length < state.wanted) spawnPoliceCar(player);
    while (state.cars.length > state.wanted) removeCar(state.cars[state.cars.length - 1]);

    // On-foot officers: only while the player is on foot and wanted.
    const wantCops = player.onFoot && state.wanted > 0 ? Math.min(state.wanted, 3) : 0;
    while (state.cops.length < wantCops) spawnCop(player);
    while (state.cops.length > wantCops) removeCop(state.cops[state.cops.length - 1]);

    // Flash the light bars: red and blue alternate twice a second.
    const phase = Math.floor(state.flashTime * 4) % 2 === 0;
    for (const car of state.cars) {
      if (!car.lightBar) continue;
      car.lightBar.redMat.emissiveIntensity = phase ? 2.2 : 0.15;
      car.lightBar.blueMat.emissiveIntensity = phase ? 0.15 : 2.2;
    }

    // Police cars: chase the player, ram the player's car, avoid traffic.
    for (const car of [...state.cars]) {
      car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      const steerErr = clampAngle(desired - car.heading);

      let throttle = 1;
      let steer = Math.max(-1, Math.min(1, steerErr * 2.2));
      let brake = 0;

      // Ease off when right on top of an on-foot player so a cop can get out.
      if (player.onFoot && dist < 10) {
        throttle = 0;
        brake = 1;
      }
      // Don't pile into traffic: brake if a car is directly ahead.
      if (cars) {
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        for (const other of cars) {
          const ox = other.x - car.x;
          const oz = other.z - car.z;
          const od = Math.hypot(ox, oz);
          if (od < 9 && od > 0.01 && (ox * fx + oz * fz) / od > 0.75) {
            throttle = 0;
            brake = 1;
            break;
          }
        }
      }

      // Stuck detection: throttling but barely moving means a building is in
      // the way — reverse out with a turn, then resume the chase.
      if (car.reverseTimer > 0) {
        car.reverseTimer -= dt;
        driveCar(car, dt, { throttle: -0.7, steer: -steer, brake: 0, handbrake: false }, city);
      } else {
        const ox = car.x;
        const oz = car.z;
        driveCar(car, dt, { throttle, steer, brake, handbrake: false }, city);
        const moved = Math.hypot(car.x - ox, car.z - oz);
        if (throttle > 0 && Math.abs(car.speed) < 1 && moved < 0.05) {
          car.stuckTimer += dt;
          if (car.stuckTimer > 1.2) {
            car.reverseTimer = 0.9;
            car.stuckTimer = 0;
          }
        } else {
          car.stuckTimer = 0;
        }
      }

      // Ram: contact with the player's car shoves it and hurts the player.
      const playerCar = !player.onFoot && player.car ? player.car : null;
      if (playerCar && car.ramCooldown <= 0) {
        const d = Math.hypot(playerCar.x - car.x, playerCar.z - car.z);
        if (d < 3.2) {
          car.ramCooldown = 1;
          playerCar.speed *= 0.45;
          playerCar.heading += (rnd() - 0.5) * 0.35;
          if (typeof player.takeDamage === 'function') player.takeDamage(5);
        }
      }
    }

    // On-foot officers: run at the player; busted if one stays within 2 m
    // of the on-foot player for 2 continuous seconds.
    let closestCop = Infinity;
    for (const cop of [...state.cops]) {
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      closestCop = Math.min(closestCop, dist);
      if (dist > 120) {
        removeCop(cop);
        continue;
      }
      // Cops cannot catch a driving player; they keep running at the car.
      cop.heading = Math.atan2(dx, dz);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      // Simple leg swing so the chase reads as running.
      cop.mesh.position.y = Math.abs(Math.sin(state.flashTime * 10 + cop.x)) * 0.06;
    }

    if (player.onFoot && state.cops.length > 0 && closestCop <= BUST_DIST) {
      state.bustTimer += dt;
      if (state.bustTimer >= BUST_TIME) {
        busted = true;
        state.bustTimer = 0;
      }
    } else {
      state.bustTimer = 0;
    }

    return busted;
  }

  return {
    get wanted() { return state.wanted; },
    set wanted(v) { state.wanted = Math.max(0, Math.min(MAX_WANTED, v)); },
    addWanted,
    update,
    reset,
    nearestCopDist,
    cars: state.cars,
    cops: state.cops,
  };
}
