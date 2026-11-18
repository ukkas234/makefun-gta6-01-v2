// vehicles.js — Solmara car definitions, meshes and arcade driving physics.
// Original code written for the gta6-01 ("Make GTA 6") entry. City: Solmara.
// A car faces +z in its local space; heading is rotation about Y, 0 = facing +z
// (south), PI/2 = facing +x (east). Forward on the ground is (sin h, cos h).
import * as THREE from '../vendor/three.module.js';

/** City half-size in metres (roads run -260..260); cars are clamped inside it. */
export const CITY_LIMIT = 258;

/**
 * Four car types. topSpeed in m/s, accel in m/s^2, brake is the braking
 * deceleration, turn is the steering rate at full lock, length/width in metres.
 */
export const CAR_TYPES = {
  sedan: {
    topSpeed: 38, accel: 14, brake: 30, turn: 2.1,
    color: 0x3a7bd5, length: 4.4, width: 1.9, height: 1.35,
  },
  taxi: {
    topSpeed: 36, accel: 13, brake: 30, turn: 2.1,
    color: 0xf7c948, length: 4.4, width: 1.9, height: 1.35,
  },
  muscle: {
    topSpeed: 48, accel: 19, brake: 32, turn: 1.9,
    color: 0xc0392b, length: 4.7, width: 2.0, height: 1.25,
  },
  van: {
    topSpeed: 28, accel: 9, brake: 26, turn: 1.7,
    color: 0x7f8c8d, length: 5.4, width: 2.1, height: 1.9,
  },
};

/** Maximum reverse speed in m/s. */
export const REVERSE_TOP_SPEED = 12;

function box(w, h, d, color, x, y, z, opts) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.35,
    ...(opts || {}),
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Build the visible car. `type` is a CAR_TYPES key, `color` overrides the
 * type's default paint. Returns a THREE.Group facing +z (front at +z) with a
 * blob shadow underneath and its wheels in userData.wheels for spin.
 */
export function createCarMesh(type, color) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  const paint = color === undefined ? def.color : color;
  const group = new THREE.Group();
  const L = def.length;
  const W = def.width;

  // Main body.
  const body = box(W, 0.55, L, paint, 0, 0.62, 0);
  group.add(body);
  // Cabin: set back a little so the bonnet reads at the front.
  const cabinH = type === 'van' ? 0.75 : 0.5;
  const cabinL = type === 'van' ? L * 0.62 : L * 0.45;
  const cabin = box(W * 0.82, cabinH, cabinL, 0x1c2733, 0, 1.12, type === 'van' ? 0.1 : -L * 0.08, {
    roughness: 0.15,
    metalness: 0.6,
  });
  group.add(cabin);
  // Taxi roof sign.
  if (type === 'taxi') {
    const sign = box(0.7, 0.18, 0.3, 0xffd34d, 0, 1.48, -L * 0.08, {
      emissive: 0xcc9900, emissiveIntensity: 0.6,
    });
    group.add(sign);
  }

  // Wheels: cylinders turned so their axis runs across the car.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.7 });
  const wheelZ = L * 0.32;
  const wheelX = W / 2 - 0.05;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      const tyre = new THREE.Mesh(wheelGeo, wheelMat);
      tyre.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      wheel.add(tyre);
      wheel.add(hub);
      wheel.position.set(sx * wheelX, 0.34, sz * wheelZ);
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  // Headlights (front, +z) and taillights (rear, -z).
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2b0, emissive: 0xffe27a, emissiveIntensity: 0.9, roughness: 0.3,
  });
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lampMat);
    lamp.position.set(sx * (W / 2 - 0.35), 0.62, L / 2 + 0.01);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xcc2222, emissive: 0x881111, emissiveIntensity: 0.7, roughness: 0.3,
  });
  for (const sx of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    tail.position.set(sx * (W / 2 - 0.35), 0.62, -L / 2 - 0.01);
    group.add(tail);
  }

  // Blob shadow: a dark circle plane under the car (renderer shadows stay off).
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(L, W) * 0.62, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, L / Math.max(L, W), 1);
  shadow.position.y = 0.02;
  group.add(shadow);

  group.userData.wheels = wheels;
  group.userData.type = type;
  return group;
}

/**
 * Create a car object. `type` is a CAR_TYPES key, `color` optional. The mesh
 * is created and positioned but NOT added to a scene — the caller adds it.
 * Fields match the spec contract: mesh, x, z, heading, speed, type, color,
 * isPlayer, isPolice.
 */
export function createCar(type, x, z, heading, color) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  const paint = color === undefined ? def.color : color;
  const mesh = createCarMesh(type, paint);
  const car = {
    mesh,
    x,
    z,
    heading,
    speed: 0,
    type,
    color: paint,
    isPlayer: false,
    isPolice: false,
    topSpeed: def.topSpeed,
    accel: def.accel,
    brake: def.brake,
    turn: def.turn,
    length: def.length,
    width: def.width,
  };
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return car;
}

/** Snap a point to the nearest road centreline of the spec grid (52 m pitch). */
function snapToGrid(x, z) {
  const snap = (v) => Math.max(-260, Math.min(260, Math.round(v / 52) * 52));
  // Keep the coordinate nearer a road line, snap the other one too.
  return { x: snap(x), z: snap(z) };
}

/**
 * Arcade driving. `controls` is { throttle, steer, brake, handbrake, reverse,
 * reset }: throttle -1..1 (negative = reverse) or 0..1 with reverse=true,
 * steer -1..1 (positive = right), brake 0..1, handbrake boolean, reset
 * boolean (R: flip/reset the car onto the nearest road, heading aligned).
 * `city` may be null; when present its collideCircle(x, z, radius) blocks
 * buildings and its nearestRoadPoint(x, z) is used for resets.
 */
export function driveCar(car, dt, controls, city) {
  const def = CAR_TYPES[car.type] || CAR_TYPES.sedan;
  const c = controls || {};
  dt = Math.min(dt, 0.05);

  // R: flip / reset onto the nearest road, facing along it.
  if (c.reset) {
    let px = car.x;
    let pz = car.z;
    let heading = car.heading;
    if (city && typeof city.nearestRoadPoint === 'function') {
      const p = city.nearestRoadPoint(car.x, car.z);
      if (p) { px = p.x; pz = p.z; }
      // Align to the nearer road axis.
      const dx = Math.abs(car.x - px);
      const dz = Math.abs(car.z - pz);
      heading = dx > dz ? (car.x >= px ? Math.PI / 2 : -Math.PI / 2) : (car.z >= pz ? 0 : Math.PI);
    } else {
      const s = snapToGrid(car.x, car.z);
      px = s.x;
      pz = s.z;
      heading = Math.abs(car.x - px) > Math.abs(car.z - pz)
        ? (car.x >= px ? Math.PI / 2 : -Math.PI / 2)
        : (car.z >= pz ? 0 : Math.PI);
    }
    car.x = px;
    car.z = pz;
    car.heading = heading;
    car.speed = 0;
    car.mesh.position.set(px, 0, pz);
    car.mesh.rotation.y = heading;
    return;
  }

  const throttle = c.throttle || 0;
  const brake = c.brake || 0;
  const steer = Math.max(-1, Math.min(1, c.steer || 0));
  const handbrake = !!c.handbrake;
  const reversing = c.reverse || throttle < 0;

  // Longitudinal: accelerate, brake, drag, handbrake.
  if (throttle > 0 && !reversing) {
    car.speed += def.accel * throttle * dt;
  } else if (throttle < 0 || reversing) {
    const rev = Math.abs(throttle) || 1;
    if (car.speed > 0.5) {
      // Pressing reverse while moving forward acts as a brake first.
      car.speed -= def.brake * rev * dt;
    } else {
      car.speed -= def.accel * 0.6 * rev * dt;
    }
  }
  if (brake > 0) {
    const decel = def.brake * brake;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - decel * dt);
    else car.speed = Math.min(0, car.speed + decel * dt);
  }
  if (handbrake) {
    car.speed -= car.speed * 4.5 * dt;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  } else {
    // Aerodynamic drag + rolling resistance.
    car.speed -= car.speed * 0.25 * dt + Math.sign(car.speed) * 1.2 * dt;
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  }
  car.speed = Math.max(-REVERSE_TOP_SPEED, Math.min(def.topSpeed, car.speed));

  // Steering: stronger at low speed, sharper with the handbrake, reversed
  // when backing up.
  const speedFactor = Math.min(1, Math.abs(car.speed) / 8 + 0.25);
  const turnRate = def.turn * (handbrake ? 1.7 : 1) * speedFactor;
  if (car.speed !== 0) {
    car.heading += steer * turnRate * dt * (car.speed >= 0 ? 1 : -1);
  }

  // Integrate position, with building collision and city bounds.
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const radius = Math.max(car.width, car.length) * 0.45;
  let blocked = false;
  if (city && typeof city.collideCircle === 'function') {
    blocked = city.collideCircle(nx, nz, radius);
  }
  if (!blocked && Math.abs(nx) <= CITY_LIMIT && Math.abs(nz) <= CITY_LIMIT) {
    car.x = nx;
    car.z = nz;
  } else if (!blocked) {
    // Ran into the city edge: clamp and scrub speed.
    car.x = Math.max(-CITY_LIMIT, Math.min(CITY_LIMIT, nx));
    car.z = Math.max(-CITY_LIMIT, Math.min(CITY_LIMIT, nz));
    car.speed *= 0.4;
  } else {
    // Hit a building: bounce back a little, keep most of the speed loss.
    car.speed *= -0.2;
  }

  // Sync the mesh and spin the wheels.
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const wheels = car.mesh.userData.wheels;
  if (wheels) {
    const spin = (car.speed * dt) / 0.34;
    for (const wheel of wheels) wheel.rotation.x += spin;
  }
}
