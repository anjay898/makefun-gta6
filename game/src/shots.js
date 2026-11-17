// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (follow the road ahead, brake into a turn, never pick a waypoint behind
// the car), so the frame is what a short game really looks like and the same seed
// always gives the same frame.

import { STEP } from './config.js';
import { HORIZONTAL_YS, VERTICAL_XS, isOnRoad, nearestIntersection, nextIntersectionAhead } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 30;
const END_SECONDS = 6;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function idleInput() {
  return { moveX: 0, moveY: 0, up: false, down: false, left: false, right: false, run: false, interact: false, fire: false, firePressed: false, cycleWeapon: false };
}

/** Put Mara in the parked car nearest to her, the way the E key would. */
function putPlayerInNearestCar(world) {
  const p = world.state.player;
  let best = null;
  let bestD = Infinity;
  for (const car of world.state.cars) {
    if (!car.active || car.driver !== 'parked') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  best.driver = 'player';
  p.inCar = true;
  p.carIndex = world.state.cars.indexOf(best);
  p.carX = best.x;
  p.carY = best.y;
  p.carAngle = best.angle;
  p.x = best.x;
  p.y = best.y;
  return true;
}

/** The intersections one step away from a node. */
function neighboursOf(node) {
  const ix = VERTICAL_XS.indexOf(node.x);
  const iy = HORIZONTAL_YS.indexOf(node.y);
  const out = [];
  if (ix + 1 < VERTICAL_XS.length) out.push({ x: VERTICAL_XS[ix + 1], y: node.y });
  if (ix - 1 >= 0) out.push({ x: VERTICAL_XS[ix - 1], y: node.y });
  if (iy + 1 < HORIZONTAL_YS.length) out.push({ x: node.x, y: HORIZONTAL_YS[iy + 1] });
  if (iy - 1 >= 0) out.push({ x: node.x, y: HORIZONTAL_YS[iy - 1] });
  return out;
}

/** The next leg from a node, preferring straight on, never a U-turn unless forced. */
function pickNextLeg(random, from, to) {
  const options = neighboursOf(to);
  const straight = options.find((n) => n.x - to.x === to.x - from.x && n.y - to.y === to.y - from.y);
  if (straight && random() < 0.55) return straight;
  const noUTurn = options.filter((n) => !(n.x === from.x && n.y === from.y));
  if (noUTurn.length > 0) return noUTurn[Math.floor(random() * noUTurn.length)];
  return options[0] || from;
}

/**
 * A driving autopilot that follows the road grid leg by leg, the way the traffic
 * cars do: it aims at the far end of its current leg, shifted to the right-hand
 * lane, brakes early for a turn, and never picks a waypoint behind the car.
 */
export function createAutopilot(world) {
  const car = world.playerCar();
  const ap = { stuck: 0, reverse: 0, legFrom: null, legTo: null };
  if (car) {
    ap.legFrom = nearestIntersection(world.city, car.x, car.y);
    ap.legTo = nextIntersectionAhead(world.city, car.x, car.y, car.angle) || ap.legFrom;
  }
  return ap;
}

/** One step of the autopilot: the input that keeps the car on the road. */
export function driveInput(world, ap) {
  const car = world.playerCar();
  const input = idleInput();
  if (!car) return input;
  if (!ap.legFrom || !ap.legTo) {
    ap.legFrom = nearestIntersection(world.city, car.x, car.y);
    ap.legTo = nextIntersectionAhead(world.city, car.x, car.y, car.angle) || ap.legFrom;
  }
  const dxTo = ap.legTo.x - car.x;
  const dyTo = ap.legTo.y - car.y;
  const distTo = Math.hypot(dxTo, dyTo);
  if (distTo < 55) {
    const next = pickNextLeg(world.random, ap.legFrom, ap.legTo);
    ap.legFrom = ap.legTo;
    ap.legTo = next;
  }
  const ldx = ap.legTo.x - ap.legFrom.x;
  const ldy = ap.legTo.y - ap.legFrom.y;
  const llen = Math.hypot(ldx, ldy) || 1;
  const ux = ldx / llen;
  const uy = ldy / llen;
  const tx = ap.legTo.x - uy * 14;
  const ty = ap.legTo.y + ux * 14;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  const steer = clamp(diff * 2.4, -1, 1);
  input.left = steer < -0.08;
  input.right = steer > 0.08;
  // Speed control by target speed, never by holding the brake: a junction at the
  // map's edge forces a turn, so the car slows for it, but the brake is only ever
  // held while the car is above its target speed — holding it at a standstill
  // would put the car in reverse and send it backwards off the road.
  const straightNext = { x: ap.legTo.x + (ap.legTo.x - ap.legFrom.x), y: ap.legTo.y + (ap.legTo.y - ap.legFrom.y) };
  const straightExists = VERTICAL_XS.includes(straightNext.x) && HORIZONTAL_YS.includes(straightNext.y);
  const mustTurn = !straightExists;
  const offRoad = !isOnRoad(world.city, car.x, car.y);
  let targetSpeed = 280;
  if (Math.abs(diff) > 0.75) targetSpeed = 90;
  else if (mustTurn && distTo < 260) targetSpeed = 130;
  else if (distTo < 130 && Math.abs(diff) > 0.3) targetSpeed = 140;
  if (offRoad) targetSpeed = Math.min(targetSpeed, 150);
  if (car.speed > targetSpeed + 10) {
    input.down = true;
  } else if (car.speed < targetSpeed) {
    input.up = true;
  }
  if (ap.reverse > 0) {
    ap.reverse -= STEP;
    input.up = false;
    input.down = true;
    input.left = steer > 0.08;
    input.right = steer < -0.08;
  } else if (input.up && Math.abs(car.speed) < 25) {
    ap.stuck += STEP;
    if (ap.stuck > 1.5) {
      ap.stuck = 0;
      ap.reverse = 0.8;
    }
  } else {
    ap.stuck = 0;
  }
  return input;
}

/**
 * Set `world` to the named scene and return the screen to draw over it. Any unknown
 * name stages the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'play') {
    world.setClock(13 * 60);
    state.player.money = 250;
    world.giveWeapon('pistol');
    putPlayerInNearestCar(world);
    const ap = createAutopilot(world);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, driveInput(world, ap));
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    world.setClock(19 * 60 + 45);
    state.player.money = 1200;
    world.giveWeapon('smg');
    putPlayerInNearestCar(world);
    world.setHeat(100);
    const ap = createAutopilot(world);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      world.step(STEP, driveInput(world, ap));
    }
    // The scene is a chase at full heat: re-light the wanted level for the frame.
    world.setHeat(100);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'end') {
    world.setClock(18 * 60 + 20);
    state.player.money = 3450;
    state.mission.index = 3;
    state.mission.stage = 'done';
    state.mission.objective = null;
    state.mission.complete = true;
    world.teleportPlayer(4620, 1800);
    world.setBanner('THE BIG HAUL — COMPLETE · +$2,000');
    state.bannerT = 6;
    for (let i = 0; i < END_SECONDS / STEP; i += 1) {
      if (i % 24 === 0) {
        const colors = ['#ffd94d', '#ff5a4e', '#5bc0be', '#f2a6ff'];
        world.spawnBurst(
          state.player.x + (world.random() - 0.5) * 700,
          state.player.y - 120 - world.random() * 160,
          16, colors[Math.floor(world.random() * colors.length)], 200, 1.1, 5,
        );
      }
      world.step(STEP, idleInput());
    }
    return { screen: SCREEN_PLAY };
  }
  world.setClock(8 * 60);
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    world.step(STEP, idleInput());
  }
  return { screen: SCREEN_TITLE };
}
