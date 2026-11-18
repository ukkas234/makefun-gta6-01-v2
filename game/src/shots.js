// Solmara — shots.js
// stageShot(name, game): deterministic staged scenes for the four
// screenshots (?shot=start|drive|chase|night&seed=N). Each scene positions
// the player, cars, police and time of day at fixed coordinates, steps the
// live simulation forward just enough for the chase to read, and returns
// the screen the shot is taken on. The main loop does not run in shot
// mode; main.js paints twice afterwards and sets window.__shotReady.
import { createCar } from './vehicles.js';

function putPlayerInCar(game, type, x, z, heading, color) {
  const { player, world } = game;
  if (player.car) {
    player.car.isPlayer = false;
    player.car.speed = 0;
    game.parkedCars.push(player.car);
    player.car = null;
  }
  const car = createCar(type, x, z, heading, color);
  world.scene.add(car.mesh);
  car.isPlayer = true;
  player.car = car;
  player.onFoot = false;
  player.x = x;
  player.z = z;
  player.heading = heading;
  player.camYaw = heading;
  return car;
}

function putPlayerOnFoot(game, x, z, heading) {
  const { player } = game;
  if (player.car) {
    player.car.isPlayer = false;
    player.car.speed = 0;
    game.parkedCars.push(player.car);
    player.car = null;
  }
  player.onFoot = true;
  player.setPosition(x, z);
  player.heading = heading;
  player.camYaw = heading;
}

/**
 * Stage the named shot. Returns { screen } — 'title' for the start shot,
 * 'play' for the rest. Unknown names fall back to 'start'.
 */
export function stageShot(name, game) {
  const { player, world, police, traffic, hud, missions } = game;

  // Common reset: a clean, deterministic base for every shot.
  police.reset();
  player.health = 100;
  player.dead = false;
  player.armed = false;
  game.clearMarker();
  hud.setMission('');
  hud.setObjective('Free roam — open the pause menu to start a mission');

  if (name === 'drive') {
    // Daytime driving through the city: muscle car heading north up a
    // central road, traffic around it, bright midday light.
    world.setTimeOfDay(13);
    putPlayerInCar(game, 'muscle', 0, 104, Math.PI, 0xc0392b);
    // Two traffic cars on the same road, one ahead and one behind, so the
    // street reads as alive.
    if (traffic.cars[0]) {
      traffic.cars[0].x = 0;
      traffic.cars[0].z = 52;
      traffic.cars[0].heading = Math.PI;
      traffic.cars[0].mesh.position.set(0, 0, 52);
      traffic.cars[0].mesh.rotation.y = Math.PI;
    }
    if (traffic.cars[1]) {
      traffic.cars[1].x = 52;
      traffic.cars[1].z = 104;
      traffic.cars[1].heading = 0;
      traffic.cars[1].mesh.position.set(52, 0, 104);
      traffic.cars[1].mesh.rotation.y = 0;
    }
    hud.setObjective('Free roam — open the pause menu to start a mission');
    hud.showMessage('Solmara — drive anywhere. Press E near a car to steal it.');
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // Police chase at 3 stars, dusk: the player flees north in a sedan
    // while police cars close in from behind with flashing light bars.
    world.setTimeOfDay(17.75);
    putPlayerInCar(game, 'sedan', 0, 156, Math.PI, 0x3a7bd5);
    police.wanted = 3;
    // Step the chase forward so the police cars (spawned 80-110 m away)
    // are visibly closing in, lights flashing, instead of dots on the
    // horizon. The player is driving, so no bust can trigger.
    for (let i = 0; i < 240; i += 1) {
      police.update(1 / 60, player, traffic.cars);
      traffic.update(1 / 60, player);
    }
    hud.setObjective('Lose the cops — get to 0 stars');
    hud.showMessage('3 stars! The whole department is on you.');
    return { screen: 'play' };
  }

  if (name === 'night') {
    // Night neon with a mission-complete moment: the player stands by the
    // car in a downtown intersection under lit windows and neon signs.
    world.setTimeOfDay(21.5);
    putPlayerInCar(game, 'muscle', 52, 52, Math.PI, 0xc0392b);
    hud.setMission('First Wheels');
    hud.setObjective('Free roam — open the pause menu to start a mission');
    hud.flash('Mission complete: First Wheels  +$200');
    hud.showMessage('Mission complete: First Wheels — +$200.');
    return { screen: 'play' };
  }

  // 'start' (and anything unknown): the title screen over the live city.
  world.setTimeOfDay(10);
  putPlayerOnFoot(game, 8, 252, Math.PI);
  return { screen: 'title' };
}
