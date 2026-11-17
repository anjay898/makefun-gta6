// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a small
// autopilot (a pure-pursuit driver that follows the road grid's lanes around a loop
// of intersections), so the frame is what a short game really looks like and the same
// seed always gives the same frame.

import { STEP } from './config.js';
import { addHeat, makeCar, stepWorld } from './world.js';
import { SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { angleDiff, clamp, distance } from './random.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 8;
const CHASE_SECONDS = 8;

/** The autopilot's loop around four intersections, in right-hand lanes. */
const ROUTE = [
  { x: 1100, y: 926 }, { x: 3800, y: 926 }, { x: 3874, y: 1000 },
  { x: 3874, y: 2600 }, { x: 3800, y: 2674 }, { x: 1000, y: 2674 },
  { x: 926, y: 2600 }, { x: 926, y: 1000 }, { x: 1000, y: 926 },
];

/** Idle controls: nothing pressed. */
function idleControls(world) {
  return { mx: 0, my: 0, aimX: world.player.x + 100, aimY: world.player.y, fire: false, enterPressed: false, weaponPressed: false, sprint: false };
}

/** Index of the route point nearest ahead of the car, so any start joins the loop. */
function nearestRouteIndex(car) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  let best = -1;
  let bestD = 1e18;
  for (let i = 0; i < ROUTE.length; i += 1) {
    const dx = ROUTE[i].x - car.x;
    const dy = ROUTE[i].y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) continue;
    // Only points roughly ahead of the car: no U-turns to join the loop.
    if ((dx * hx + dy * hy) / d < 0.2) continue;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best !== -1) return best;
  let near = 0;
  let nearD = 1e18;
  for (let i = 0; i < ROUTE.length; i += 1) {
    const d = distance(car.x, car.y, ROUTE[i].x, ROUTE[i].y);
    if (d < nearD) { nearD = d; near = i; }
  }
  return near;
}

/**
 * Pure-pursuit driving: steer toward the current route point, ease off the throttle
 * in a sharp turn, and cap the speed so the chase scene's cruisers stay in frame.
 */
function driveControls(world, speedCap) {
  const p = world.player;
  const car = p.inCar;
  const controls = idleControls(world);
  if (!car) return controls;
  if (car.pilotIndex === undefined) car.pilotIndex = nearestRouteIndex(car);
  const target = ROUTE[car.pilotIndex];
  if (distance(car.x, car.y, target.x, target.y) < 70) {
    car.pilotIndex = (car.pilotIndex + 1) % ROUTE.length;
  }
  const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angleDiff(car.angle, wantAngle);
  controls.mx = clamp(diff * 2.4, -1, 1);
  // Brake hard into a sharp turn (a slow car turns on a tight radius), coast
  // through a gentle one, and only floor it when the road ahead is straight.
  if (Math.abs(car.speed) > speedCap) controls.my = 0;
  else if (Math.abs(diff) > 0.9) controls.my = Math.abs(car.speed) > 80 ? 1 : 0;
  else if (Math.abs(diff) > 0.3) controls.my = 0;
  else controls.my = -1; // throttle (up)
  controls.aimX = car.x + Math.cos(car.angle) * 200;
  controls.aimY = car.y + Math.sin(car.angle) * 200;
  return controls;
}

/** Put the player in a car on the road, heading east, with no wanted level. */
function giveCar(world, x, y, color) {
  const car = makeCar(world.random, x, y, 0, 'traffic', color);
  car.driver = 'player';
  world.cars.push(car);
  world.player.inCar = car;
  world.player.x = car.x;
  world.player.y = car.y;
  return car;
}

/**
 * Set `world` to the named scene (start, play, chase or end) and return the screen
 * to draw over it, plus a banner line for the play/chase/end scenes.
 */
export function stageShot(name, world) {
  if (name === 'start') {
    world.camera.x = 2400;
    world.camera.y = 1500;
    for (let i = 0; i < START_SECONDS / STEP; i += 1) stepWorld(world, idleControls(world), STEP);
    world.camera.x = 2400;
    world.camera.y = 1500;
    return { screen: SCREEN_TITLE, banner: null };
  }
  if (name === 'chase') {
    // Player already in a car on Coral Blvd, four stars, two cruisers right behind.
    const car = giveCar(world, 1500, 926, '#d94f3d');
    world.player.weapon = 'pistol';
    world.player.magAmmo = 12;
    world.player.ammo = 48;
    world.player.money = 2840;
    addHeat(world, 130);
    for (let i = 0; i < 2; i += 1) {
      const cop = makeCar(world.random, car.x - 190 - i * 80, car.y + (i === 0 ? -40 : 40), 0, 'police', '#2b4fd9');
      cop.driver = 'cop';
      cop.speed = 380;
      world.cars.push(cop);
    }
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) stepWorld(world, driveControls(world, 280), STEP);
    return { screen: SCREEN_PLAY, banner: 'WANTED — 4 STARS' };
  }
  if (name === 'end') {
    // The Big Haul is done: story-complete screen with a fat wallet.
    world.mission.index = 3;
    world.mission.done = [true, true, true];
    world.mission.marker = null;
    world.mission.objective = 'Story complete — Solara Bay is yours.';
    world.player.money = 3680;
    world.player.health = 82;
    world.stats.missionsDone = 3;
    world.stats.earned = 3400;
    world.stats.carsStolen = 7;
    world.storyComplete = true;
    world.camera.x = world.player.x;
    world.camera.y = world.player.y;
    return { screen: SCREEN_STORY, banner: null };
  }
  // play: the player drives the loop through busy streets, mission marker live.
  giveCar(world, 1100, 926, '#3d7fd9');
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) stepWorld(world, driveControls(world, 300), STEP);
  return { screen: SCREEN_PLAY, banner: null };
}
