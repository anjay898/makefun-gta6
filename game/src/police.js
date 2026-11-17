// The Solara Bay PD: how the wanted level turns into police cars that chase the player,
// officers on foot who try to make an arrest, and roadblocks at three stars and up.
// This module steers police cars; the world resolves their collisions afterwards, the
// same way it does for every other car.

import { CAR, PLAYER, WANTED } from './config.js';
import { randomRoadPoint } from './city.js';
import { pick, range } from './random.js';

const PURSUIT_TURN = 3.1;
const ROADBLOCK_EVERY = 14;
const ROADBLOCK_LIFE = 22;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function freeCar(state) {
  for (const car of state.cars) if (!car.active) return car;
  return null;
}

function freePed(state) {
  for (const ped of state.peds) if (!ped.active) return ped;
  return null;
}

/** How many police cars the current wanted level calls for. */
export function policeCarCount(stars) {
  if (stars <= 0) return 0;
  return Math.min(2 + stars, 7);
}

export function spawnPoliceCar(world) {
  const { state, random } = world;
  const car = freeCar(state);
  if (!car) return null;
  const player = state.player;
  let point = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomRoadPoint(world.city, random);
    const d = Math.hypot(candidate.x - player.x, candidate.y - player.y);
    if (d > 650 && d < 1100) { point = candidate; break; }
  }
  if (!point) point = randomRoadPoint(world.city, random);
  car.active = true;
  car.driver = 'police';
  car.mode = 'chase';
  car.blockT = 0;
  car.x = point.x;
  car.y = point.y;
  car.angle = Math.atan2(player.y - point.y, player.x - point.x);
  car.speed = 200;
  car.vx = 0;
  car.vy = 0;
  car.hp = 100;
  car.color = '#20242c';
  car.legFrom = null;
  car.legTo = null;
  car.cruise = 0;
  car.wait = 0;
  return car;
}

function spawnCopPed(world) {
  const { state, random } = world;
  const ped = freePed(state);
  if (!ped) return null;
  const player = state.player;
  const angle = range(random, 0, Math.PI * 2);
  ped.active = true;
  ped.kind = 'cop';
  ped.x = player.x + Math.cos(angle) * range(random, 320, 480);
  ped.y = player.y + Math.sin(angle) * range(random, 320, 480);
  ped.angle = angle;
  ped.speed = range(random, 150, 185);
  ped.hp = 60;
  ped.color = '#2a4a7a';
  ped.state = 'chase';
  ped.fleeT = 0;
  ped.targetX = player.x;
  ped.targetY = player.y;
  ped.attackCooldown = 0;
  return ped;
}

function placeRoadblock(world) {
  const { state } = world;
  const player = state.player;
  const heading = player.inCar ? player.carAngle : player.angle;
  const aheadX = player.x + Math.cos(heading) * 560;
  const aheadY = player.y + Math.sin(heading) * 560;
  const perp = heading + Math.PI / 2;
  let placed = 0;
  for (const offset of [-52, 52]) {
    const car = freeCar(state);
    if (!car) break;
    car.active = true;
    car.driver = 'police';
    car.mode = 'block';
    car.blockT = ROADBLOCK_LIFE;
    car.x = aheadX + Math.cos(perp) * offset;
    car.y = aheadY + Math.sin(perp) * offset;
    car.angle = perp;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    car.hp = 100;
    car.color = '#20242c';
    car.legFrom = null;
    car.legTo = null;
    car.cruise = 0;
    car.wait = 0;
    placed += 1;
  }
  return placed;
}

function stepPoliceCar(world, car, dt) {
  const player = world.state.player;
  if (car.mode === 'block') {
    car.blockT -= dt;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    if (car.blockT <= 0) car.mode = 'chase';
    return;
  }
  const px = player.inCar ? player.carX : player.x;
  const py = player.inCar ? player.carY : player.y;
  const pvx = player.inCar ? player.carVx : 0;
  const pvy = player.inCar ? player.carVy : 0;
  const tx = px + pvx * 0.45;
  const ty = py + pvy * 0.45;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const turn = wrapAngle(desired - car.angle);
  const maxTurn = PURSUIT_TURN * dt;
  car.angle += Math.max(-maxTurn, Math.min(maxTurn, turn));
  const stars = world.state.wanted.stars;
  const want = Math.min(300 + stars * 42, CAR.maxSpeed - 40);
  const align = Math.cos(turn);
  const targetSpeed = align < 0.3 ? want * 0.35 : want;
  car.speed += Math.max(-420 * dt, Math.min(420 * dt, targetSpeed - car.speed));
  if (car.speed < 0) car.speed = 0;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
}

function stepCopPed(world, ped, dt) {
  const player = world.state.player;
  const dx = player.x - ped.x;
  const dy = player.y - ped.y;
  const dist = Math.hypot(dx, dy);
  ped.attackCooldown -= dt;
  if (!player.inCar && dist < 44 && ped.attackCooldown <= 0) {
    ped.attackCooldown = 1.1;
    world.damagePlayer(8, 'cop');
    world.addEvent(64);
  }
  if (dist > 8) {
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / dist) * ped.speed * dt;
    ped.y += (dy / dist) * ped.speed * dt;
  }
  if (dist < 46 && !player.inCar) {
    world.state.arrestT += dt;
    if (world.state.arrestT >= PLAYER.arrestTime) world.bust();
  }
}

/** One step of the whole police response: spawn, chase, roadblock, arrest, decay. */
export function stepPolice(world, dt) {
  const { state } = world;
  const wanted = state.wanted;
  wanted.stars = Math.min(WANTED.maxStars, Math.floor(wanted.heat / WANTED.heatPerStar));
  const stars = wanted.stars;

  let cars = 0;
  let cops = 0;
  for (const car of state.cars) if (car.active && car.driver === 'police') cars += 1;
  for (const ped of state.peds) if (ped.active && ped.kind === 'cop') cops += 1;

  const wantCars = policeCarCount(stars);
  if (cars < wantCars) {
    const spawnBudget = stars >= 4 ? 2 : 1;
    for (let i = 0; i < spawnBudget && cars < wantCars; i += 1) {
      if (spawnPoliceCar(world)) cars += 1;
    }
  }
  const wantCops = stars >= 2 ? Math.min(stars - 1, 4) : 0;
  if (cops < wantCops && !state.player.inCar) {
    if (spawnCopPed(world)) cops += 1;
  }

  state.roadblockT -= dt;
  if (stars >= 3 && state.roadblockT <= 0) {
    state.roadblockT = ROADBLOCK_EVERY;
    placeRoadblock(world);
  }

  let nearest = -1;
  for (const car of state.cars) {
    if (!car.active || car.driver !== 'police') continue;
    stepPoliceCar(world, car, dt);
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (nearest < 0 || d < nearest) nearest = d;
  }
  state.siren = stars > 0 ? nearest : -1;

  let touchingCop = false;
  for (const ped of state.peds) {
    if (!ped.active || ped.kind !== 'cop') continue;
    const d = Math.hypot(ped.x - state.player.x, ped.y - state.player.y);
    if (d > 1500) { ped.active = false; continue; }
    if (d < 46 && !state.player.inCar) touchingCop = true;
    stepCopPed(world, ped, dt);
  }
  if (!touchingCop) state.arrestT = Math.max(0, state.arrestT - dt * 2);

  if (stars === 0) {
    for (const car of state.cars) {
      if (!car.active || car.driver !== 'police') continue;
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d > 1500) car.active = false;
    }
  }
}
