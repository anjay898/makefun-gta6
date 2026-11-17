// Street traffic and pedestrians. Traffic cars drive leg by leg between intersections
// on the right-hand side of the road, the way the city is laid out: they slow for the
// car ahead, stop for a car already in the intersection, and creep forward after waiting
// a while, so a jam clears instead of deadlocking. Pedestrians stroll the sidewalks and
// run when a shot goes off nearby. The player's own car is never in this pool — this
// module only touches cars whose driver is 'traffic' or 'parked'.

import { CAR_COLORS, PED_COLORS } from './config.js';
import { HORIZONTAL_YS, ROAD_HALF, VERTICAL_XS, nearestIntersection, randomRoadPoint } from './city.js';
import { intRange, pick, range } from './random.js';

const LANE = 14;
const TURN_RATE = 3.4;
const STOP_LINE = 132;
const CREEP_AFTER = 2.5;
const CREEP_SPEED = 46;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function nodeAt(ix, iy) {
  if (ix < 0 || ix >= VERTICAL_XS.length || iy < 0 || iy >= HORIZONTAL_YS.length) return null;
  return { x: VERTICAL_XS[ix], y: HORIZONTAL_YS[iy] };
}

function nodeIndex(node) {
  return { ix: VERTICAL_XS.indexOf(node.x), iy: HORIZONTAL_YS.indexOf(node.y) };
}

/** The intersections one step away from a node, in random order. */
function neighbours(random, node) {
  const { ix, iy } = nodeIndex(node);
  const out = [];
  const a = nodeAt(ix + 1, iy);
  const b = nodeAt(ix - 1, iy);
  const c = nodeAt(ix, iy + 1);
  const d = nodeAt(ix, iy - 1);
  if (a) out.push(a);
  if (b) out.push(b);
  if (c) out.push(c);
  if (d) out.push(d);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/** Pick the next leg from a node, preferring not to turn straight back. */
function pickNextLeg(random, from, to) {
  const options = neighbours(random, to);
  const straight = options.find((n) => n.x - to.x === to.x - from.x && n.y - to.y === to.y - from.y);
  if (straight && random() < 0.55) return straight;
  const noUTurn = options.filter((n) => !(n.x === from.x && n.y === from.y));
  if (noUTurn.length > 0) return pick(random, noUTurn);
  return options[0] || from;
}

/** The point a car aims for: the far end of its leg, shifted to the right-hand lane. */
function legTarget(car) {
  const dx = car.legTo.x - car.legFrom.x;
  const dy = car.legTo.y - car.legFrom.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { x: car.legTo.x - uy * LANE, y: car.legTo.y + ux * LANE };
}

function freeCar(state) {
  for (const car of state.cars) if (!car.active) return car;
  return null;
}

export function spawnTrafficCars(world, count) {
  const { state, random } = world;
  let made = 0;
  for (let n = 0; n < count; n += 1) {
    const car = freeCar(state);
    if (!car) break;
    const from = pick(random, world.city.intersections);
    const to = pick(random, neighbours(random, from));
    if (!to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    car.active = true;
    car.driver = 'traffic';
    car.x = from.x + (dx / len) * 70 - (dy / len) * LANE;
    car.y = from.y + (dy / len) * 70 + (dx / len) * LANE;
    car.angle = Math.atan2(dy, dx);
    car.speed = range(random, 60, 140);
    car.vx = 0;
    car.vy = 0;
    car.hp = 100;
    car.color = pick(random, CAR_COLORS);
    car.legFrom = { x: from.x, y: from.y };
    car.legTo = { x: to.x, y: to.y };
    car.cruise = range(random, 150, 215);
    car.wait = 0;
    made += 1;
  }
  return made;
}

export function spawnParkedCars(world, count) {
  const { state, random } = world;
  let made = 0;
  for (let n = 0; n < count; n += 1) {
    const car = freeCar(state);
    if (!car) break;
    const point = randomRoadPoint(world.city, random);
    let angle;
    let px = point.x;
    let py = point.y;
    const nearVertical = VERTICAL_XS.find((vx) => Math.abs(point.x - vx) <= ROAD_HALF);
    if (nearVertical !== undefined) {
      const side = range(random, 0, 1) < 0.5 ? 1 : -1;
      px = nearVertical + side * (ROAD_HALF - 16);
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const nearHorizontal = HORIZONTAL_YS.find((hy) => Math.abs(point.y - hy) <= ROAD_HALF);
      const side = range(random, 0, 1) < 0.5 ? 1 : -1;
      py = (nearHorizontal ?? point.y) + side * (ROAD_HALF - 16);
      angle = side > 0 ? Math.PI : 0;
    }
    car.active = true;
    car.driver = 'parked';
    car.x = px;
    car.y = py;
    car.angle = angle;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    car.hp = 100;
    car.color = pick(random, CAR_COLORS);
    car.legFrom = null;
    car.legTo = null;
    car.cruise = 0;
    car.wait = 0;
    made += 1;
  }
  return made;
}

function carAheadOnLeg(world, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let closest = null;
  let closestGap = Infinity;
  for (const other of world.state.cars) {
    if (!other.active || other === car) continue;
    const rx = other.x - car.x;
    const ry = other.y - car.y;
    const along = rx * fx + ry * fy;
    if (along < 8 || along > 120) continue;
    const side = Math.abs(-rx * fy + ry * fx);
    if (side > 42) continue;
    if (along < closestGap) { closestGap = along; closest = other; }
  }
  return { car: closest, gap: closestGap };
}

function intersectionBusy(world, car) {
  const target = car.legTo;
  for (const other of world.state.cars) {
    if (!other.active || other === car) continue;
    const d = Math.hypot(other.x - target.x, other.y - target.y);
    if (d < 78) return true;
  }
  return false;
}

function stepTrafficCar(world, car, dt) {
  const target = legTarget(car);
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  let want = car.cruise;

  const ahead = carAheadOnLeg(world, car);
  if (ahead.car) {
    if (ahead.gap < 52) want = 0;
    else want = Math.min(want, Math.max(0, ahead.car.speed));
  }
  if (dist < STOP_LINE && intersectionBusy(world, car)) {
    car.wait += dt;
    want = car.wait > CREEP_AFTER ? CREEP_SPEED : 0;
  } else {
    car.wait = 0;
  }

  const desired = Math.atan2(dy, dx);
  const turn = wrapAngle(desired - car.angle);
  const maxTurn = TURN_RATE * dt;
  car.angle += Math.max(-maxTurn, Math.min(maxTurn, turn));
  car.speed += Math.max(-260 * dt, Math.min(260 * dt, want - car.speed));
  if (car.speed < 0) car.speed = 0;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;

  if (dist < 36) {
    const next = pickNextLeg(world.random, car.legFrom, car.legTo);
    car.legFrom = { x: car.legTo.x, y: car.legTo.y };
    car.legTo = { x: next.x, y: next.y };
  }
}

export function spawnPedestrians(world, count) {
  const { state, random } = world;
  let made = 0;
  for (let n = 0; n < count; n += 1) {
    let ped = null;
    for (const p of state.peds) if (!p.active) { ped = p; break; }
    if (!ped) break;
    const point = randomRoadPoint(world.city, random);
    ped.active = true;
    ped.kind = 'ped';
    ped.x = point.x;
    ped.y = point.y;
    ped.angle = range(random, 0, Math.PI * 2);
    ped.speed = range(random, 52, 84);
    ped.hp = 100;
    ped.color = pick(random, PED_COLORS);
    ped.state = 'walk';
    ped.fleeT = 0;
    ped.targetX = point.x;
    ped.targetY = point.y;
    ped.attackCooldown = 0;
    made += 1;
  }
  return made;
}

function pickPedTarget(world, ped) {
  const node = nearestIntersection(world.city, ped.x, ped.y);
  const options = neighbours(world.random, node);
  const next = options.length > 0 ? pick(world.random, options) : node;
  const side = world.random() < 0.5 ? 1 : -1;
  const vertical = Math.abs(next.x - node.x) < 1;
  if (vertical) {
    ped.targetX = node.x + side * (ROAD_HALF + 12);
    ped.targetY = next.y;
  } else {
    ped.targetX = next.x;
    ped.targetY = node.y + side * (ROAD_HALF + 12);
  }
}

function stepPedestrian(world, ped, dt) {
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    if (ped.fleeT <= 0) ped.state = 'walk';
  }
  const dx = ped.targetX - ped.x;
  const dy = ped.targetY - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 24) {
    if (ped.state === 'walk') pickPedTarget(world, ped);
    else { ped.targetX = ped.x + range(world.random, -300, 300); ped.targetY = ped.y + range(world.random, -300, 300); }
    return;
  }
  const speed = ped.state === 'flee' ? 210 : ped.speed;
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / dist) * speed * dt;
  ped.y += (dy / dist) * speed * dt;
}

/** One step for every traffic car and pedestrian. The player's car is never touched here. */
export function stepTraffic(world, dt) {
  const { state, random } = world;
  const player = state.player;
  for (const car of state.cars) {
    if (!car.active || car.driver !== 'traffic') continue;
    const far = Math.hypot(car.x - player.x, car.y - player.y);
    if (far > 1500) {
      const point = randomRoadPoint(world.city, random);
      const node = nearestIntersection(world.city, point.x, point.y);
      const next = pick(random, neighbours(random, node)) || node;
      car.x = node.x;
      car.y = node.y;
      car.legFrom = { x: node.x, y: node.y };
      car.legTo = { x: next.x, y: next.y };
      car.angle = Math.atan2(next.y - node.y, next.x - node.x);
      car.speed = 80;
      car.wait = 0;
      continue;
    }
    stepTrafficCar(world, car, dt);
  }
  for (const ped of state.peds) {
    if (!ped.active || ped.kind !== 'ped') continue;
    const far = Math.hypot(ped.x - player.x, ped.y - player.y);
    if (far > 1400) {
      const point = randomRoadPoint(world.city, random);
      ped.x = point.x;
      ped.y = point.y;
      pickPedTarget(world, ped);
      continue;
    }
    stepPedestrian(world, ped, dt);
  }
}

/** Make every nearby pedestrian run away from a point (a gunshot, a crash). */
export function scarePeds(world, x, y, radius) {
  for (const ped of world.state.peds) {
    if (!ped.active || ped.kind !== 'ped') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d > radius) continue;
    const away = Math.atan2(ped.y - y, ped.x - x);
    ped.state = 'flee';
    ped.fleeT = 3;
    ped.targetX = ped.x + Math.cos(away) * 420;
    ped.targetY = ped.y + Math.sin(away) * 420;
  }
}
