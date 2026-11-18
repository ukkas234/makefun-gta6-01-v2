// Solmara — player.js
// createPlayer(scene, city): Danny Reyes on foot, third person.
//   Movement is relative to the camera orbit (mouse drag orbits camYaw /
//   camPitch around the player); WASD / arrows move, Shift runs, Space jumps,
//   F punches, Q draws or holsters the pistol, left click shoots when armed
//   (hitscan — the main loop reads justFired and does the raycast) or punches
//   when unarmed. Health, takeDamage, setPosition and getState per contract.
//
// Heading convention (shared with vehicles/render): forward = (sin h, 0, cos h)
// in world xz, so h = 0 faces south (+z) and h = PI/2 faces east (+x).
// The mesh is a low-poly box character, clearly visible, with a blob shadow
// (renderer shadows stay off). While driving (onFoot === false, car set) the
// mesh is hidden and x/z follow the car; the main loop drives the car.
import * as THREE from '../vendor/three.module.js';
import { PISTOL, PLAYER } from './config.js';

const WALK_SPEED = PLAYER.walkSpeed;
const RUN_SPEED = PLAYER.runSpeed;
const JUMP_SPEED = PLAYER.jumpSpeed;
const GRAVITY = PLAYER.gravity;
const RADIUS = PLAYER.radius;
const PUNCH_TIME = PLAYER.punchCooldown;
const PUNCH_RANGE = PLAYER.punchRange;
const CITY_LIMIT = 258;

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function buildMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f4d5a }); // dark teal jacket
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e3a55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const shoe = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const gunMetal = new THREE.MeshLambertMaterial({ color: 0x111111 });

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  // Legs (pivot at the hip so they can swing while walking).
  const legL = box(0.16, 0.8, 0.18, jeans, -0.11, 0.4, 0);
  const legR = box(0.16, 0.8, 0.18, jeans, 0.11, 0.4, 0);
  legL.geometry.translate(0, -0.4, 0);
  legR.geometry.translate(0, -0.4, 0);
  legL.position.y = 0.8;
  legR.position.y = 0.8;
  box(0.17, 0.08, 0.3, shoe, -0.11, 0.04, 0.04);
  box(0.17, 0.08, 0.3, shoe, 0.11, 0.04, 0.04);
  // Torso, head, hair.
  box(0.52, 0.62, 0.3, jacket, 0, 1.11, 0);
  box(0.3, 0.28, 0.28, skin, 0, 1.58, 0);
  box(0.32, 0.1, 0.3, hair, 0, 1.74, 0);
  // Arms (pivot at the shoulder).
  const armL = box(0.13, 0.58, 0.15, jacket, -0.33, 1.32, 0);
  const armR = box(0.13, 0.58, 0.15, jacket, 0.33, 1.32, 0);
  armL.geometry.translate(0, -0.26, 0);
  armR.geometry.translate(0, -0.26, 0);
  armL.position.y = 1.38;
  armR.position.y = 1.38;
  // Pistol in the right hand, only visible while armed.
  const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), gunMetal);
  pistol.position.set(0.33, 1.02, 0.18);
  pistol.visible = false;
  group.add(pistol);
  // Muzzle flash: a brief bright plane at the barrel, shown on firing.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.35),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  flash.position.set(0.33, 1.05, 0.42);
  flash.visible = false;
  group.add(flash);

  // Blob shadow: a dark circle on the ground under the player.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;

  return { group, legL, legR, armL, armR, pistol, flash, shadow };
}

export function createPlayer(scene, city) {
  const parts = buildMesh();
  const mesh = parts.group;
  scene.add(mesh);
  scene.add(parts.shadow);

  const player = {
    mesh,
    x: 0,
    z: 8,
    y: 0,
    heading: 0,
    speed: 0,
    health: PLAYER.maxHealth,
    onFoot: true,
    car: null,
    // Camera orbit (mouse drag) and combat state, read by render/main.
    camYaw: 0,
    camPitch: 0.32,
    armed: false,
    justFired: false,
    justPunched: false,
    punchActive: false,
    dead: false,
  };

  let vx = 0;
  let vz = 0;
  let vy = 0;
  let grounded = true;
  let walkPhase = 0;
  let punchTimer = 0;
  let shootTimer = 0;
  let flashTimer = 0;
  let hurtTimer = 0;

  function setPosition(x, z) {
    player.x = x;
    player.z = z;
    player.y = 0;
    vy = 0;
    vx = 0;
    vz = 0;
    grounded = true;
    mesh.position.set(x, 0, z);
    parts.shadow.position.set(x, 0.02, z);
  }

  function takeDamage(amount) {
    if (player.dead || !player.onFoot) return player.health;
    player.health = Math.max(0, player.health - amount);
    hurtTimer = 0.25;
    if (player.health <= 0) player.dead = true;
    return player.health;
  }

  function tryMove(nx, nz) {
    // Axis-separated collision so the player slides along building walls.
    const blocked = (x, z) => city && typeof city.collideCircle === 'function'
      && city.collideCircle(x, z, RADIUS);
    if (!blocked(nx, player.z)) player.x = nx;
    if (!blocked(player.x, nz)) player.z = nz;
    player.x = Math.max(-CITY_LIMIT, Math.min(CITY_LIMIT, player.x));
    player.z = Math.max(-CITY_LIMIT, Math.min(CITY_LIMIT, player.z));
  }

  function update(dt, input, cityArg) {
    const world = cityArg || city;
    player.justFired = false;
    player.justPunched = false;

    // In a car the character is inside it: hide the mesh, follow the car.
    if (!player.onFoot) {
      mesh.visible = false;
      parts.shadow.visible = false;
      if (player.car) {
        player.x = player.car.x;
        player.z = player.car.z;
        player.heading = player.car.heading;
      }
      return;
    }
    mesh.visible = true;
    parts.shadow.visible = true;

    // --- Camera orbit from mouse drag ---
    if (input) {
      player.camYaw -= (input.mouseDX || 0) * 0.005;
      player.camPitch = Math.max(
        0.05,
        Math.min(1.1, player.camPitch + (input.mouseDY || 0) * 0.004),
      );
      // --- Draw / holster the pistol ---
      if (input.pressed && input.pressed('KeyQ')) {
        player.armed = !player.armed;
      }
      // --- Left click: shoot when armed, punch when unarmed ---
      if (input.consumeClick && input.consumeClick()) {
        if (player.armed) {
          // Pistol rate limit from config; extra clicks inside the cooldown
          // are dropped, not queued.
          if (shootTimer <= 0) {
            player.justFired = true;
            shootTimer = PISTOL.cooldown;
            flashTimer = 0.07;
          }
        } else if (punchTimer <= 0) {
          punchTimer = PUNCH_TIME;
          player.justPunched = true;
        }
      }
      // --- F punches ---
      if (input.pressed && input.pressed('KeyF') && punchTimer <= 0) {
        punchTimer = PUNCH_TIME;
        player.justPunched = true;
      }
    }
    player.punchActive = punchTimer > PUNCH_TIME - 0.15 && punchTimer > 0;
    if (punchTimer > 0) punchTimer -= dt;
    if (shootTimer > 0) shootTimer -= dt;
    if (flashTimer > 0) flashTimer -= dt;
    if (hurtTimer > 0) hurtTimer -= dt;

    // --- Movement, relative to the camera orbit yaw ---
    let mx = 0;
    let mz = 0;
    if (input && input.keys) {
      const k = input.keys;
      const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
        - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
        - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const fx = Math.sin(player.camYaw);
      const fz = Math.cos(player.camYaw);
      // Right vector for a viewer behind the player: (-cos, sin) in xz.
      const rx = -Math.cos(player.camYaw);
      const rz = Math.sin(player.camYaw);
      mx = fx * fwd + rx * strafe;
      mz = fz * fwd + rz * strafe;
    }
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
    }
    const running = input && input.keys
      && (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));
    const targetSpeed = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
    // Exponential approach to the target velocity: smooth starts/stops,
    // frame-rate independent.
    const k = 1 - Math.exp(-10 * dt);
    vx += (mx * targetSpeed - vx) * k;
    vz += (mz * targetSpeed - vz) * k;
    player.speed = Math.hypot(vx, vz);
    tryMove(player.x + vx * dt, player.z + vz * dt);

    // Face the direction of travel.
    if (player.speed > 0.5) {
      const targetHeading = Math.atan2(vx, vz);
      player.heading = angleLerp(player.heading, targetHeading, 1 - Math.exp(-12 * dt));
    }

    // --- Jump (edge-triggered Space) ---
    if (input && input.pressed && input.pressed('Space') && grounded) {
      vy = JUMP_SPEED;
      grounded = false;
    }
    if (!grounded) {
      vy -= GRAVITY * dt;
      player.y += vy * dt;
      if (player.y <= 0) {
        player.y = 0;
        vy = 0;
        grounded = true;
      }
    }

    // --- Pose: mesh, walk swing, punch, muzzle flash, hurt blink ---
    mesh.position.set(player.x, player.y, player.z);
    mesh.rotation.y = player.heading;
    parts.shadow.position.set(player.x, 0.02, player.z);
    parts.shadow.material.opacity = 0.32 * Math.max(0.4, 1 - player.y * 0.25);

    walkPhase += player.speed * dt * 1.6;
    const swing = moving ? Math.sin(walkPhase) * 0.6 : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.8;
    if (punchTimer > 0) {
      // Right arm thrusts forward during the punch.
      const p = 1 - punchTimer / PUNCH_TIME; // 0 -> 1 over the swing
      parts.armR.rotation.x = -Math.sin(p * Math.PI) * 1.5;
    } else if (player.armed) {
      // Aiming pose: right arm raised forward with the pistol.
      parts.armR.rotation.x = -1.2;
      parts.armL.rotation.x = -0.6;
    } else {
      parts.armR.rotation.x = swing * 0.8;
    }
    parts.pistol.visible = player.armed;
    parts.flash.visible = flashTimer > 0;
    if (parts.flash.visible) parts.flash.rotation.z = Math.random() * Math.PI;
    mesh.visible = hurtTimer <= 0 || Math.floor(hurtTimer * 20) % 2 === 0;
  }

  function getState() {
    return {
      x: player.x, z: player.z, y: player.y,
      heading: player.heading, speed: player.speed,
      health: player.health, onFoot: player.onFoot, car: player.car,
      armed: player.armed, dead: player.dead,
      camYaw: player.camYaw, camPitch: player.camPitch,
      punching: player.punchActive, justFired: player.justFired,
      justPunched: player.justPunched,
    };
  }

  setPosition(0, 8);
  // Return the live player object itself (not a spread copy): main, police and
  // missions read player.x / player.health etc. every frame and must see
  // the current values.
  Object.assign(player, { update, takeDamage, setPosition, getState });
  Object.defineProperty(player, 'punchRange', { get() { return PUNCH_RANGE; } });
  return player;
}
