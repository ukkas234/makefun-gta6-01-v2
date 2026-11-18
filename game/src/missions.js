// Solmara — missions. Original story, no Rockstar IP.
// Five sequential story missions plus 10 hidden packages ($50 each).
// Contract (spec): each mission has id, title, briefing, reward,
// start(game), update(dt, game), isDone(). createMissionManager(game)
// returns { active, start(index), update(dt), available }.
// The game object passed in has: player, city, traffic, police, hud,
// audio, save, setObjective, addMoney, showMessage, spawnMarker(x, z, label),
// clearMarker. Optional extras honoured when present: game.input (for the
// hold-E vault in M5), game.saveSave / game.save (for persistence).

export const MISSION_REWARDS = { M1: 200, M2: 350, M3: 400, M4: 500, M5: 1500 };
export const PACKAGE_REWARD = 50;

// Garage / bank / safehouse are road intersections (roads run every 52 m,
// -260..260), so every marker is reachable by car.
export const GARAGE = { x: 104, z: 156 };
export const SAFEHOUSE = { x: 208, z: -156 };
export const BANK = { x: -156, z: 156 };
export const BRIEFCASE = { x: -104, z: 52 };
export const DELIVERY_POINTS = [
  { x: -156, z: -52, label: 'Drop 1/3' },
  { x: 52, z: 104, label: 'Drop 2/3' },
  { x: -52, z: -208, label: 'Drop 3/3' },
];

// Ten hidden packages, tucked just off road intersections (sidewalk corners).
export const PACKAGES = [
  { x: -240, z: -240 }, { x: 240, z: -180 }, { x: -180, z: 60 },
  { x: 60, z: -240 }, { x: 180, z: 180 }, { x: -60, z: 240 },
  { x: 240, z: 60 }, { x: -240, z: 120 }, { x: 120, z: -120 },
  { x: 0, z: 240 },
];

function dist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function playerPos(game) {
  const p = game.player || {};
  return { x: p.x || 0, z: p.z || 0 };
}

function inCar(game) {
  const p = game.player || {};
  return Boolean(p.car) || p.onFoot === false;
}

function setObj(game, text) {
  if (typeof game.setObjective === 'function') game.setObjective(text);
  else if (game.hud && typeof game.hud.setObjective === 'function') game.hud.setObjective(text);
}

function say(game, text) {
  if (typeof game.showMessage === 'function') game.showMessage(text);
  else if (game.hud && typeof game.hud.showMessage === 'function') game.hud.showMessage(text);
}

function mark(game, x, z, label) {
  if (typeof game.spawnMarker === 'function') game.spawnMarker(x, z, label);
}

function unmark(game) {
  if (typeof game.clearMarker === 'function') game.clearMarker();
}

function missionBase(id, title, briefing, reward) {
  return {
    id, title, briefing, reward,
    _done: false,
    _failed: false,
    _stage: 0,
    _timer: 0,
    _count: 0,
    _hold: 0,
    isDone() { return this._done; },
  };
}

const M1 = missionBase(
  'M1', 'First Wheels',
  'Steal any car and drive it to the garage. Danny needs wheels before anything else.',
  MISSION_REWARDS.M1,
);
M1.start = function (game) {
  this._done = false; this._failed = false; this._stage = 0;
  mark(game, GARAGE.x, GARAGE.z, 'Garage');
  setObj(game, 'Steal a car (E), then drive to the garage');
  say(game, 'M1 First Wheels: steal a car and bring it to the garage.');
};
M1.update = function (dt, game) {
  const p = playerPos(game);
  if (this._stage === 0 && inCar(game)) {
    this._stage = 1;
    setObj(game, 'Drive to the garage');
  }
  if (this._stage === 1 && dist(p.x, p.z, GARAGE.x, GARAGE.z) < 9) {
    this._done = true;
  }
};

const M2 = missionBase(
  'M2', 'Hot Deliveries',
  'Deliver 3 packages across Solmara within 150 seconds. Fast driving, no excuses.',
  MISSION_REWARDS.M2,
);
M2.start = function (game) {
  this._done = false; this._failed = false; this._stage = 0;
  this._timer = 150; this._count = 0;
  const t = DELIVERY_POINTS[0];
  mark(game, t.x, t.z, t.label);
  setObj(game, 'Deliver package 1/3 — 150s on the clock');
  say(game, 'M2 Hot Deliveries: 3 drops, 150 seconds. Go!');
};
M2.update = function (dt, game) {
  this._timer -= dt;
  const p = playerPos(game);
  const t = DELIVERY_POINTS[this._count];
  if (t && dist(p.x, p.z, t.x, t.z) < 7) {
    this._count += 1;
    if (game.audio && typeof game.audio.pickup === 'function') game.audio.pickup();
    if (this._count >= DELIVERY_POINTS.length) { this._done = true; return; }
    const next = DELIVERY_POINTS[this._count];
    mark(game, next.x, next.z, next.label);
    setObj(game, `Deliver package ${this._count + 1}/3 — ${Math.ceil(this._timer)}s left`);
    say(game, `Package ${this._count} delivered. ${DELIVERY_POINTS.length - this._count} to go.`);
    return;
  }
  if (this._timer <= 0) {
    this._failed = true;
    say(game, 'M2 failed: out of time. Try again from the pause menu.');
  } else if (this._count < DELIVERY_POINTS.length) {
    setObj(game, `Deliver package ${this._count + 1}/3 — ${Math.ceil(this._timer)}s left`);
  }
};

const M3 = missionBase(
  'M3', 'Lose the Heat',
  'The cops are on you at 2 stars. Break line of sight and stay hidden until the heat dies down.',
  MISSION_REWARDS.M3,
);
M3.start = function (game) {
  this._done = false; this._failed = false; this._stage = 0;
  if (game.police) {
    if (typeof game.police.addWanted === 'function') game.police.addWanted(2);
    else game.police.wanted = 2;
  }
  setObj(game, 'Lose the cops — get to 0 stars');
  say(game, 'M3 Lose the Heat: 2 stars. Hide until the wanted level clears.');
};
M3.update = function (dt, game) {
  const wanted = game.police ? (game.police.wanted || 0) : 0;
  if (wanted <= 0) this._done = true;
};

const M4 = missionBase(
  'M4', 'The Pickup',
  'Grab the briefcase on foot, then lose the 2-star chase and get to the safehouse.',
  MISSION_REWARDS.M4,
);
M4.start = function (game) {
  this._done = false; this._failed = false; this._stage = 0;
  mark(game, BRIEFCASE.x, BRIEFCASE.z, 'Briefcase');
  setObj(game, 'Drive to the briefcase, then pick it up on foot');
  say(game, 'M4 The Pickup: grab the briefcase on foot.');
};
M4.update = function (dt, game) {
  const p = playerPos(game);
  if (this._stage === 0) {
    if (dist(p.x, p.z, BRIEFCASE.x, BRIEFCASE.z) < 4 && !inCar(game)) {
      this._stage = 1;
      if (game.audio && typeof game.audio.pickup === 'function') game.audio.pickup();
      if (game.police) {
        if (typeof game.police.addWanted === 'function') game.police.addWanted(2);
        else game.police.wanted = 2;
      }
      mark(game, SAFEHOUSE.x, SAFEHOUSE.z, 'Safehouse');
      setObj(game, 'Briefcase grabbed! Lose the cops, get to the safehouse');
      say(game, 'Briefcase secured — 2 stars! Get to the safehouse.');
    }
  } else if (dist(p.x, p.z, SAFEHOUSE.x, SAFEHOUSE.z) < 9) {
    this._done = true;
  }
};

const M5 = missionBase(
  'M5', 'The Big One',
  'The bank job. Get inside on foot, hold E for 3 seconds to crack the vault, then escape a 3-star chase to the safehouse. $1,500 if you make it.',
  MISSION_REWARDS.M5,
);
M5.start = function (game) {
  this._done = false; this._failed = false; this._stage = 0; this._hold = 0;
  mark(game, BANK.x, BANK.z, 'Bank');
  setObj(game, 'Drive to the bank, then go in on foot');
  say(game, 'M5 The Big One: the bank job. No turning back.');
};
M5.update = function (dt, game) {
  const p = playerPos(game);
  if (this._stage === 0) {
    if (dist(p.x, p.z, BANK.x, BANK.z) < 6) {
      this._stage = 1; this._hold = 0;
      setObj(game, 'Inside the bank — hold E for 3s to take the cash');
      say(game, 'At the vault. Hold E to take the cash.');
    }
  } else if (this._stage === 1) {
    const inside = dist(p.x, p.z, BANK.x, BANK.z) < 6 && !inCar(game);
    // Hold-E detection: the spec's game object carries no input field, so
    // honour game.input.keys (a Set of codes) when main wires it in; if no
    // input is exposed at all, standing at the vault counts as holding.
    const input = game.input;
    let holding = true;
    if (input && input.keys && typeof input.keys.has === 'function') {
      holding = input.keys.has('KeyE');
    } else if (input && typeof input.pressed === 'function') {
      holding = true; // edge-triggered input cannot report a hold; fall back to standing
    } else if (typeof game.holdE === 'boolean') {
      holding = game.holdE;
    }
    if (inside && holding) {
      this._hold += dt;
      setObj(game, `Taking the cash… ${Math.min(3, this._hold).toFixed(1)}s / 3s`);
      if (this._hold >= 3) {
        this._stage = 2;
        if (game.police) {
          if (typeof game.police.addWanted === 'function') game.police.addWanted(3);
          else game.police.wanted = 3;
        }
        mark(game, SAFEHOUSE.x, SAFEHOUSE.z, 'Safehouse');
        setObj(game, 'Cash taken! 3 stars — escape to the safehouse');
        say(game, 'Cash taken — 3 stars! Get to the safehouse.');
      }
    } else {
      this._hold = 0;
      if (inside) setObj(game, 'Inside the bank — hold E for 3s to take the cash');
    }
  } else if (dist(p.x, p.z, SAFEHOUSE.x, SAFEHOUSE.z) < 9) {
    this._done = true;
  }
};

export const MISSIONS = [M1, M2, M3, M4, M5];

export function createMissionManager(game) {
  const save = game.save || {};
  const completed = new Set(Array.isArray(save.finishedMissions) ? save.finishedMissions : []);
  const foundPackages = new Set(Array.isArray(save.foundPackages) ? save.foundPackages : []);
  let active = null;

  function persist() {
    if (typeof game.saveSave === 'function') {
      game.saveSave({
        money: game.money,
        finishedMissions: [...completed],
        foundPackages: [...foundPackages],
      });
    }
  }

  function available() {
    // Sequential unlock: mission i is open when all before it are done.
    const open = [];
    for (let i = 0; i < MISSIONS.length; i += 1) {
      if (i === 0 || completed.has(MISSIONS[i - 1].id)) open.push(i);
      else break;
    }
    return open;
  }

  function start(index) {
    if (!Number.isInteger(index) || index < 0 || index >= MISSIONS.length) return false;
    if (!available().includes(index)) {
      say(game, `${MISSIONS[index].title} is locked — finish the previous job first.`);
      return false;
    }
    if (active) unmark(game);
    active = MISSIONS[index];
    active.start(game);
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission(active.title);
    return true;
  }

  function checkPackages() {
    const p = playerPos(game);
    for (let i = 0; i < PACKAGES.length; i += 1) {
      if (foundPackages.has(i)) continue;
      if (dist(p.x, p.z, PACKAGES[i].x, PACKAGES[i].z) < 3) {
        foundPackages.add(i);
        if (typeof game.addMoney === 'function') game.addMoney(PACKAGE_REWARD);
        if (game.audio && typeof game.audio.pickup === 'function') game.audio.pickup();
        say(game, `Hidden package found! +$${PACKAGE_REWARD} (${foundPackages.size}/10)`);
        persist();
      }
    }
  }

  function update(dt) {
    checkPackages();
    if (!active) return;
    active.update(dt, game);
    if (typeof active.isDone === 'function' ? active.isDone() : active.isDone) {
      const done = active;
      completed.add(done.id);
      if (typeof game.addMoney === 'function') game.addMoney(done.reward);
      if (game.audio && typeof game.audio.sting === 'function') game.audio.sting();
      if (game.hud && typeof game.hud.flash === 'function') {
        game.hud.flash(`Mission complete: ${done.title}  +$${done.reward}`);
      }
      say(game, `Mission complete: ${done.title} — +$${done.reward}.`);
      unmark(game);
      // Reaching the end of a job clears the heat (safehouse / job done):
      // without this, M4's 2 stars would stack onto M5's 3 and cap at 5.
      if (game.police) {
        if (typeof game.police.reset === 'function') game.police.reset();
        else game.police.wanted = 0;
      }
      setObj(game, 'Free roam — open the pause menu to replay a mission');
      active = null;
      persist();
      if (done.id === 'M5' && typeof game.onStoryComplete === 'function') game.onStoryComplete();
    } else if (active._failed) {
      unmark(game);
      setObj(game, 'Mission failed — open the pause menu to retry');
      active = null;
    }
  }

  return {
    get active() { return active; },
    start,
    update,
    available,
    get completed() { return [...completed]; },
    get foundPackages() { return [...foundPackages]; },
    packages: PACKAGES,
    get packagesFound() { return foundPackages.size; },
    isComplete(id) { return completed.has(id); },
  };
}
