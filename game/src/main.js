// Solmara — main.js (glue)
// Boot + fixed 60-steps-per-second loop + screens (title / play / pause /
// over) + the glue between the 14 game modules. Written from the spec;
// every module is used through its own contract, nothing is rewritten here.
//
// Heading convention (shared by player/vehicles/render): forward on the
// ground is (sin h, cos h) in (x, z), so h = 0 faces south (+z) and
// h = PI faces north (-z). The chase camera (render.follow) sits behind
// and above the player/car, never side-on.
//
// ?seed=N fixes the city/traffic layout. ?shot=start|drive|chase|night
// (&seed=N) stages that deterministic scene, paints twice and sets
// window.__shotReady instead of running the loop.
import * as THREE from '../vendor/three.module.js';
import { CITY, CLOCK, MISSIONS, PEDS, PISTOL, PLAYER, STEP, TRAFFIC, WANTED } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld3D } from './render.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createCar, driveCar } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { MISSIONS as MISSION_LIST, createMissionManager } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, saveSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

// ---------------------------------------------------------------- boot
const rng = createRandom(seed);
const world = createWorld3D(canvas);
const city = createCity(world.scene, rng);
const player = createPlayer(world.scene, city);
const traffic = createTraffic(world.scene, city, TRAFFIC.count, rng);
const police = createPolice(world.scene, city, rng);
const hud = createHUD();
const audio = createAudio();

let saveData = loadSave();
let screen = 'title'; // 'title' | 'play' | 'pause' | 'over'
let clock = CLOCK.startHour;
let money = saveData.money > 0 || saveData.finishedMissions.length > 0
  ? saveData.money
  : MISSIONS.startMoney;
let overKind = null; // 'busted' | 'wasted' | 'story'
let resetCarFlag = false;
let ramCooldown = 0;
let copHitCooldown = 0;

if (saveData.muted) audio.setMuted(true);

// Player starts on the southern road, facing north into the city.
player.setPosition(city.spawnPoints.player.x, city.spawnPoints.player.z);
player.heading = Math.PI;
player.camYaw = Math.PI;

// Parked cars near the spawn point, so stealing is possible immediately.
const parkedCars = [];
for (const spot of city.spawnPoints.parkedCars) {
  const car = createCar(spot.type, spot.x, spot.z, spot.heading);
  world.scene.add(car.mesh);
  parkedCars.push(car);
}

// ---------------------------------------------------------------- marker
const markerGroup = new THREE.Group();
{
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 15;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  );
  diamond.position.y = 4;
  markerGroup.add(beam);
  markerGroup.add(diamond);
  markerGroup.userData.diamond = diamond;
  markerGroup.visible = false;
  world.scene.add(markerGroup);
}
let markerPos = null;
function spawnMarker(x, z) {
  markerPos = { x, z };
  markerGroup.position.set(x, 0, z);
  markerGroup.visible = true;
}
function clearMarker() {
  markerPos = null;
  markerGroup.visible = false;
}

// ---------------------------------------------------------------- pedestrians
// No dedicated pedestrians module exists, so the glue owns them: simple
// box walkers on the sidewalks who wander, and flee gunshots and near cars.
const PED_COLORS = [0xd8a05a, 0x7ea8c9, 0xc97e7e, 0x8fc9a3, 0xb8b0a4, 0x9a7ec9];
const peds = [];
function makePedMesh(color) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3a55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  box(0.16, 0.75, 0.18, pants, -0.11, 0.38, 0);
  box(0.16, 0.75, 0.18, pants, 0.11, 0.38, 0);
  box(0.5, 0.6, 0.28, shirt, 0, 1.05, 0);
  box(0.28, 0.26, 0.26, skin, 0, 1.5, 0);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  return group;
}
function randomPedTarget() {
  // Sidewalk-ish: near a block centre, off the road lines.
  const bx = (Math.floor(rng() * 10) - 5) * CITY.step + CITY.step / 2;
  const bz = (Math.floor(rng() * 10) - 5) * CITY.step + CITY.step / 2;
  return {
    x: bx + (rng() * 2 - 1) * 14,
    z: bz + (rng() * 2 - 1) * 14,
  };
}
for (let i = 0; i < PEDS.count; i += 1) {
  const t = randomPedTarget();
  const mesh = makePedMesh(PED_COLORS[i % PED_COLORS.length]);
  mesh.position.set(t.x, 0, t.z);
  world.scene.add(mesh);
  const target = randomPedTarget();
  peds.push({
    mesh, x: t.x, z: t.z, heading: rng() * Math.PI * 2,
    targetX: target.x, targetZ: target.z,
    speed: PEDS.walkSpeed, flee: 0, fleeX: 0, fleeZ: 0,
  });
}
function updatePeds(dt) {
  for (const ped of peds) {
    let tx = ped.targetX;
    let tz = ped.targetZ;
    let speed = PEDS.walkSpeed;
    if (ped.flee > 0) {
      ped.flee -= dt;
      tx = ped.fleeX;
      tz = ped.fleeZ;
      speed = PEDS.fleeSpeed;
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      if (ped.flee <= 0) {
        const t = randomPedTarget();
        ped.targetX = t.x;
        ped.targetZ = t.z;
      }
      continue;
    }
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - ped.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    ped.heading += Math.max(-3 * dt, Math.min(3 * dt, dh));
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    if (!city.collideCircle(nx, nz, 0.5) && Math.abs(nx) < 258 && Math.abs(nz) < 258) {
      ped.x = nx;
      ped.z = nz;
    } else {
      const t = randomPedTarget();
      ped.targetX = t.x;
      ped.targetZ = t.z;
    }
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(performance.now() / 90 + ped.x)) * 0.04, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}
function scarePeds(x, z, radius) {
  for (const ped of peds) {
    const d = Math.hypot(ped.x - x, ped.z - z);
    if (d < radius) {
      const away = Math.atan2(ped.x - x, ped.z - z);
      ped.flee = 3;
      ped.fleeX = ped.x + Math.sin(away) * 30;
      ped.fleeZ = ped.z + Math.cos(away) * 30;
    }
  }
}

// ---------------------------------------------------------------- game object
// The object the mission manager (and shots) work with.
const input = createInput(canvas);
const game = {
  player,
  city,
  traffic,
  police,
  hud,
  audio,
  input,
  world,
  peds,
  parkedCars,
  get money() { return money; },
  save: saveData,
  holdE: false,
  marker: null,
  setObjective(text) { hud.setObjective(text); },
  addMoney(n) {
    money = Math.max(0, money + n);
    persistSave();
  },
  showMessage(text) { hud.showMessage(text); },
  spawnMarker(x, z) { spawnMarker(x, z); game.marker = markerPos; },
  clearMarker() { clearMarker(); game.marker = null; },
  saveSave(data) { persistSave(data); },
  onStoryComplete() {
    overKind = 'story';
    setScreen('over');
    audio.sting();
  },
};

function persistSave(extra) {
  const data = {
    money,
    finishedMissions: missions ? missions.completed : saveData.finishedMissions,
    foundPackages: missions ? missions.foundPackages : saveData.foundPackages,
    best: Math.max(saveData.best || 0, money),
    muted: audio.muted,
    ...(extra || {}),
  };
  saveData = { ...saveData, ...data };
  game.save = saveData;
  saveSave(data);
}

let missions = createMissionManager(game);
game.missions = missions;

// ---------------------------------------------------------------- screens
const titleEl = document.getElementById('screen-title');
const pauseEl = document.getElementById('screen-pause');
const overEl = document.getElementById('screen-over');
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const respawnBtn = document.getElementById('btn-respawn');

function setScreen(next) {
  screen = next;
  titleEl.classList.toggle('hidden', next !== 'title');
  pauseEl.classList.toggle('hidden', next !== 'pause');
  overEl.classList.toggle('hidden', next !== 'over');
  if (next === 'over') {
    if (overKind === 'busted') {
      overTitle.textContent = 'BUSTED';
      overText.textContent = `The police caught Danny. You lost $${WANTED.bustFine}.`;
      respawnBtn.textContent = 'Respawn at the police station';
    } else if (overKind === 'wasted') {
      overTitle.textContent = 'WASTED';
      overText.textContent = `Danny is down. Hospital bill: $${WANTED.wasteFine}.`;
      respawnBtn.textContent = 'Respawn at the hospital';
    } else {
      overTitle.textContent = 'STORY COMPLETE';
      overText.textContent = 'Danny pulled off The Big One and walked away with $1,500. Solmara is yours — keep playing in free roam.';
      respawnBtn.textContent = 'Keep playing (free roam)';
    }
  }
  if (next === 'title') refreshMissionLists();
  if (next === 'pause') refreshMissionLists();
}

function announce(message) {
  statusEl.textContent = message;
}

function resetRun() {
  police.reset();
  clearMarker();
  game.marker = null;
  player.health = PLAYER.maxHealth;
  player.dead = false;
  player.armed = false;
  if (player.car) {
    player.car.isPlayer = false;
    player.car.speed = 0;
    parkedCars.push(player.car);
    player.car = null;
  }
  player.onFoot = true;
  player.setPosition(city.spawnPoints.player.x, city.spawnPoints.player.z);
  player.heading = Math.PI;
  player.camYaw = Math.PI;
  clock = CLOCK.startHour;
  world.setTimeOfDay(clock);
  hud.setMission('');
  hud.setObjective('Free roam — open the pause menu to start a mission');
}

function newGame() {
  try { saveSave({ money: MISSIONS.startMoney, finishedMissions: [], foundPackages: [], best: 0, muted: audio.muted }); } catch { /* storage off */ }
  saveData = loadSave();
  game.save = saveData;
  money = MISSIONS.startMoney;
  resetRun();
  // The manager snapshots finished missions at construction, so a new
  // game needs a fresh one built from the cleared save.
  missions = createMissionManager(game);
  game.missions = missions;
  refreshMissionLists();
  setScreen('play');
  audio.click();
  missions.start(0);
  announce('New game. Mission 1: First Wheels.');
}

function continueGame() {
  saveData = loadSave();
  game.save = saveData;
  money = saveData.money > 0 || saveData.finishedMissions.length > 0
    ? saveData.money
    : MISSIONS.startMoney;
  resetRun();
  setScreen('play');
  audio.click();
  hud.showMessage(`Welcome back, Danny. $${money} in your pocket.`);
  announce('Continuing.');
}

function respawn() {
  const spot = overKind === 'busted'
    ? city.spawnPoints.policeStation
    : overKind === 'wasted'
      ? city.spawnPoints.hospital
      : { x: player.x, z: player.z };
  if (overKind === 'busted' || overKind === 'wasted') {
    player.health = PLAYER.maxHealth;
    player.dead = false;
    if (player.car) {
      player.car.isPlayer = false;
      player.car.speed = 0;
      parkedCars.push(player.car);
      player.car = null;
    }
    player.onFoot = true;
    player.setPosition(spot.x, spot.z);
    player.heading = Math.PI;
    player.camYaw = Math.PI;
    police.reset();
    clearMarker();
    game.marker = null;
  }
  overKind = null;
  setScreen('play');
  audio.click();
  announce('Playing.');
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  persistSave();
  for (const btn of document.querySelectorAll('[data-mute-btn]')) {
    btn.textContent = audio.muted ? 'Sound: OFF (M)' : 'Sound: ON (M)';
  }
  hud.showMessage(audio.muted ? 'Sound muted.' : 'Sound on.');
}

// Mission lists on the title and pause screens (rebuilt when shown).
function refreshMissionLists() {
  const open = new Set(missions.available());
  for (const listId of ['title-missions', 'pause-missions']) {
    const list = document.getElementById(listId);
    if (!list) continue;
    list.innerHTML = '';
    MISSION_LIST.forEach((m, i) => {
      const done = missions.isComplete(m.id);
      const row = document.createElement('div');
      row.className = 'mission-row';
      const label = document.createElement('span');
      label.textContent = `${done ? '✓ ' : ''}${m.title} — $${m.reward}${done ? ' (done)' : ''}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = done ? 'Replay' : 'Start';
      btn.disabled = !done && !open.has(i);
      btn.addEventListener('click', () => {
        audio.click();
        if (screen !== 'play') {
          resetRun();
          setScreen('play');
        }
        missions.start(i);
      });
      row.append(label, btn);
      list.appendChild(row);
    });
  }
}

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
document.getElementById('btn-resume').addEventListener('click', () => { setScreen('play'); audio.click(); });
document.getElementById('btn-quit-title').addEventListener('click', () => { setScreen('title'); audio.click(); });
respawnBtn.addEventListener('click', respawn);
for (const btn of document.querySelectorAll('[data-mute-btn]')) {
  btn.addEventListener('click', toggleMute);
  btn.textContent = audio.muted ? 'Sound: OFF (M)' : 'Sound: ON (M)';
}
document.getElementById('btn-controls').addEventListener('click', (e) => {
  const panel = document.getElementById('controls-panel');
  panel.classList.toggle('hidden');
  e.currentTarget.textContent = panel.classList.contains('hidden') ? 'Controls' : 'Hide controls';
  audio.click();
});

// Leaving the tab pauses a running game.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') setScreen('pause');
});

// ---------------------------------------------------------------- enter / steal
function nearestStealableCar(x, z, maxDist) {
  let best = null;
  let bestDist = maxDist;
  const consider = (car) => {
    if (!car || car.isPolice) return;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestDist) { bestDist = d; best = car; }
  };
  for (const car of traffic.cars) consider(car);
  for (const car of parkedCars) consider(car);
  return best;
}

function handleEnterKey() {
  if (screen !== 'play') return;
  if (player.onFoot) {
    const car = nearestStealableCar(player.x, player.z, 4.5);
    if (!car) {
      hud.showMessage('No car close enough — walk up to one and press E.');
      return;
    }
    const wasTraffic = traffic.cars.includes(car);
    if (wasTraffic) traffic.cars.splice(traffic.cars.indexOf(car), 1);
    else parkedCars.splice(parkedCars.indexOf(car), 1);
    car.isPlayer = true;
    player.car = car;
    player.onFoot = false;
    // Seen stealing? A witness (pedestrian close by) or any cop nearby.
    const seen = peds.some((p) => Math.hypot(p.x - player.x, p.z - player.z) < 25)
      || police.nearestCopDist(player.x, player.z) < 60;
    if (seen) {
      police.addWanted(WANTED.stealSeen);
      hud.showMessage(wasTraffic ? 'Carjacked — and seen! +1 star.' : 'Stolen — and seen! +1 star.');
    } else {
      hud.showMessage(wasTraffic ? 'Carjacked. The driver ran off.' : 'You took the car.');
    }
    audio.click();
  } else {
    const car = player.car;
    if (!car) { player.onFoot = true; return; }
    car.isPlayer = false;
    car.speed = 0;
    player.car = null;
    player.onFoot = true;
    // Step out to the side of the car.
    const px = car.x + Math.cos(car.heading) * 2.6;
    const pz = car.z - Math.sin(car.heading) * 2.6;
    player.setPosition(px, pz);
    player.heading = car.heading;
    player.camYaw = car.heading;
    parkedCars.push(car);
    audio.click();
  }
}

// ---------------------------------------------------------------- combat
function hitscanShot() {
  audio.shot();
  police.addWanted(WANTED.shooting);
  scarePeds(player.x, player.z, PISTOL.noiseRadius);
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const ox = player.x;
  const oz = player.z;
  // Closest target whose circle the ray passes through, within range.
  let best = null;
  let bestT = PISTOL.range;
  const consider = (tx, tz, radius, kind, ref) => {
    const dx = tx - ox;
    const dz = tz - oz;
    const t = dx * fx + dz * fz; // distance along the ray
    if (t < 0 || t > bestT) return;
    const px = ox + fx * t;
    const pz = oz + fz * t;
    if (Math.hypot(tx - px, tz - pz) <= radius) { bestT = t; best = { kind, ref }; }
  };
  for (const car of traffic.cars) consider(car.x, car.z, 2.2, 'car', car);
  for (const car of police.cars) consider(car.x, car.z, 2.2, 'policeCar', car);
  for (const cop of police.cops) consider(cop.x, cop.z, 0.6, 'cop', cop);
  for (const ped of peds) consider(ped.x, ped.z, 0.6, 'ped', ped);
  if (!best) return;
  if (best.kind === 'ped') {
    police.addWanted(WANTED.hitPedestrian);
    scarePeds(best.ref.x, best.ref.z, 30);
    hud.showMessage('You hit a pedestrian! +1 star.');
  } else if (best.kind === 'cop') {
    hud.showMessage('You hit an officer! The heat is on.');
  } else if (best.kind === 'policeCar') {
    police.addWanted(WANTED.ramPolice);
    hud.showMessage('You shot a police car! +1 star.');
  } else {
    hud.showMessage('Hit the car.');
  }
}

function punchHit() {
  audio.punch();
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const targets = [];
  for (const ped of peds) targets.push({ x: ped.x, z: ped.z, radius: 0.7, kind: 'ped', ref: ped });
  for (const cop of police.cops) targets.push({ x: cop.x, z: cop.z, radius: 0.7, kind: 'cop', ref: cop });
  for (const t of targets) {
    const dx = t.x - player.x;
    const dz = t.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > PLAYER.punchRange + t.radius) continue;
    if (d > 0.01 && (dx * fx + dz * fz) / d < 0.3) continue; // must be roughly ahead
    if (t.kind === 'ped') {
      police.addWanted(WANTED.hitPedestrian);
      scarePeds(t.ref.x, t.ref.z, 30);
      hud.showMessage('You punched a pedestrian! +1 star.');
    } else {
      hud.showMessage('You punched an officer!');
    }
    return;
  }
}

// ---------------------------------------------------------------- fixed step
function step(dt) {
  clock = (clock + dt * CLOCK.hoursPerSecond) % 24;
  world.setTimeOfDay(clock);

  player.update(dt, input, city);

  // Driving.
  if (!player.onFoot && player.car) {
    const k = input.keys;
    const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
      - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
      - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const handbrake = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight');
    driveCar(player.car, dt, {
      throttle, steer, brake: 0, handbrake, reset: resetCarFlag,
    }, city);
    resetCarFlag = false;
  }

  traffic.update(dt, player);
  updatePeds(dt);

  // Police chase; returns true the frame the player is busted.
  const busted = police.update(dt, player, traffic.cars);
  if (busted && player.onFoot) {
    money = Math.max(0, money - WANTED.bustFine);
    persistSave();
    overKind = 'busted';
    setScreen('over');
    announce('Busted.');
    return;
  }

  // Contact damage from police (the police module only rams the car and
  // only busts on foot, so the main loop owns health loss from contact).
  ramCooldown = Math.max(0, ramCooldown - dt);
  copHitCooldown = Math.max(0, copHitCooldown - dt);
  if (!player.onFoot && player.car && ramCooldown <= 0) {
    for (const copCar of police.cars) {
      if (Math.hypot(copCar.x - player.car.x, copCar.z - player.car.z) < 3.2) {
        player.health = Math.max(0, player.health - 12);
        ramCooldown = 0.8;
        hud.showMessage('Police rammed your car!');
        break;
      }
    }
  }
  if (player.onFoot && copHitCooldown <= 0) {
    for (const cop of police.cops) {
      if (Math.hypot(cop.x - player.x, cop.z - player.z) < 1.2) {
        player.health = Math.max(0, player.health - 8);
        copHitCooldown = 0.8;
        hud.showMessage('An officer is beating you down!');
        break;
      }
    }
  }

  // Combat results (flags are set by player.update this step).
  if (player.justFired) hitscanShot();
  if (player.justPunched) punchHit();

  // Missions (includes hidden packages + story completion).
  missions.update(dt);

  // Wasted.
  if (player.health <= 0 && !player.dead) {
    player.dead = true;
    money = Math.max(0, money - WANTED.wasteFine);
    persistSave();
    overKind = 'wasted';
    setScreen('over');
    announce('Wasted.');
    return;
  }

  // Marker pulse.
  if (markerGroup.visible) {
    markerGroup.rotation.y += dt * 1.5;
    markerGroup.userData.diamond.position.y = 4 + Math.sin(performance.now() / 300) * 0.5;
  }

  // Audio: engine follows the car, siren follows the heat.
  const driving = !player.onFoot && player.car;
  audio.engine(driving ? Math.abs(player.car.speed) / player.car.topSpeed : 0, driving && screen === 'play');
  audio.siren(police.wanted > 0 && screen === 'play');
}

function hudState() {
  return {
    health: player.health,
    wanted: police.wanted,
    money,
    speed: !player.onFoot && player.car ? Math.abs(player.car.speed) : player.speed,
    clock,
    armed: player.armed,
    muted: audio.muted,
    screen,
    minimap: {
      player: { x: player.x, z: player.z, heading: player.heading },
      cars: [...traffic.cars, ...parkedCars, ...(!player.onFoot && player.car ? [player.car] : [])],
      police: police.cars,
      pedestrians: peds,
      marker: markerPos,
      north: 0,
    },
  };
}

// ---------------------------------------------------------------- frame loop
function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleDiscreteInput() {
    if (input.pressed('KeyM')) toggleMute();
    if (input.pressed('Escape') || input.pressed('KeyP')) {
      if (screen === 'play') { setScreen('pause'); announce('Paused.'); }
      else if (screen === 'pause') { setScreen('play'); announce('Playing.'); }
    }
    if (input.pressed('KeyE')) handleEnterKey();
    if (input.pressed('KeyR') && !player.onFoot && player.car) resetCarFlag = true;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleDiscreteInput();

    if (screen === 'play') {
      accumulator += dt;
      while (accumulator >= STEP && screen === 'play') {
        step(STEP);
        accumulator -= STEP;
      }
      if (screen !== 'play') accumulator = 0;
    } else if (screen === 'title') {
      // Attract mode: the city stays alive behind the title screen.
      accumulator += dt;
      while (accumulator >= STEP) {
        clock = (clock + STEP * CLOCK.hoursPerSecond * 0.5) % 24;
        world.setTimeOfDay(clock);
        traffic.update(STEP, player);
        updatePeds(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }

    world.follow(player, dt);
    world.update(dt);
    hud.update(hudState());
    input.update();
  }

  setScreen('title');
  refreshMissionLists();
  announce('Solmara. New Game or Continue.');
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- shot mode
function runShot(name) {
  const staged = stageShot(name, game);
  // stageShot sets the world's time of day; sync the HUD clock to it.
  clock = world.timeOfDay;
  setScreen(staged.screen);
  if (staged.screen === 'title') refreshMissionLists();
  // Settle the chase camera behind the player/car, then paint twice.
  for (let i = 0; i < 10; i += 1) world.follow(player, 1);
  let painted = 0;
  function paint() {
    world.update(0);
    hud.update(hudState());
    painted += 1;
    if (painted < 2) {
      requestAnimationFrame(paint);
    } else {
      window.__shotReady = true;
      // Keep repainting (render only, no simulation): a WebGL canvas does
      // not preserve its drawing buffer, so a screenshot taken after the
      // flag needs a freshly presented frame to capture.
      requestAnimationFrame(function repaint() {
        world.update(0);
        requestAnimationFrame(repaint);
      });
    }
  }
  requestAnimationFrame(paint);
}

if (shotName) runShot(shotName);
else runGame();
