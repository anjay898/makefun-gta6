// Traffic and pedestrians. Traffic cars drive the road grid in the right-hand lane,
// turn at intersections, and brake for the car ahead; pedestrians stroll the sidewalks
// and run from gunfire. Both keep the city feeling alive while the player is elsewhere.

import { CAR, PEDS, ROADS, TRAFFIC, WORLD } from './config.js';
import { clamp, distance, intBetween, pick } from './random.js';
import { collideCar, collideCircle, hitsBuilding, nearestRoad, onRoad } from './city.js';
import { makeCar, makePed, spawnParticles } from './world.js';

const LANE = ROADS.width / 2 - 24;

/** Lane-centre offset for a car on a road: right-hand traffic. */
function laneOffset(road, dir) {
  if (road === 'h') return dir > 0 ? LANE : -LANE;
  return dir > 0 ? -LANE : LANE;
}

function spawnTrafficCar(world, random) {
  const vertical = random() < 0.5;
  let x = 0;
  let y = 0;
  let road = 'h';
  let roadAt = 0;
  let dir = random() < 0.5 ? 1 : -1;
  if (vertical) {
    road = 'v';
    roadAt = pick(random, ROADS.vertical);
    x = roadAt + laneOffset('v', dir);
    y = 150 + random() * (WORLD.height - 300);
  } else {
    road = 'h';
    roadAt = pick(random, ROADS.horizontal);
    y = roadAt + laneOffset('h', dir);
    x = 150 + random() * (WORLD.width - 300);
  }
  const car = makeCar(random, x, y, road === 'h' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), 'traffic');
  car.road = road;
  car.roadAt = roadAt;
  car.dir = dir;
  car.targetSpeed = TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
  car.speed = car.targetSpeed;
  return car;
}

export function createTraffic(world) {
  const { random } = world;
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    world.cars.push(spawnTrafficCar(world, random));
  }
  for (let i = 0; i < PEDS.count; i += 1) {
    const ped = spawnPed(world, random);
    world.peds.push(ped);
  }
}

function spawnPed(world, random) {
  const vertical = random() < 0.5;
  const ped = makePed(random, 0, 0);
  if (vertical) {
    ped.road = 'v';
    ped.roadAt = pick(random, ROADS.vertical);
    ped.dir = random() < 0.5 ? 1 : -1;
    ped.lane = (random() < 0.5 ? 1 : -1) * (ROADS.width / 2 + 12);
    ped.x = ped.roadAt + ped.lane;
    ped.y = 150 + random() * (WORLD.height - 300);
  } else {
    ped.road = 'h';
    ped.roadAt = pick(random, ROADS.horizontal);
    ped.dir = random() < 0.5 ? 1 : -1;
    ped.lane = (random() < 0.5 ? 1 : -1) * (ROADS.width / 2 + 12);
    ped.y = ped.roadAt + ped.lane;
    ped.x = 150 + random() * (WORLD.width - 300);
  }
  return ped;
}

/** At an intersection, maybe turn onto the crossing road (right-hand lanes). */
function maybeTurn(world, car) {
  const { random } = world;
  const crossings = car.road === 'h' ? ROADS.vertical : ROADS.horizontal;
  let nearest = null;
  let nearestD = 1e9;
  for (const c of crossings) {
    const pos = car.road === 'h' ? car.x : car.y;
    const d = Math.abs(pos - c);
    if (d < nearestD) {
      nearestD = d;
      nearest = c;
    }
  }
  if (nearest === null || nearestD > 30) return;
  // Only decide once per intersection: the car must be close to the centre.
  const along = car.road === 'h' ? car.x : car.y;
  if (Math.abs(along - nearest) > 26) return;
  if (random() > TRAFFIC.turnChance) return;
  const turnLeft = random() < 0.5;
  const newDir = turnLeft ? -car.dir : car.dir;
  if (car.road === 'h') {
    car.road = 'v';
    car.roadAt = nearest;
    car.dir = newDir;
    car.y = car.roadAt + laneOffset('v', car.dir);
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.road = 'h';
    car.roadAt = nearest;
    car.dir = newDir;
    car.x = car.roadAt + laneOffset('h', car.dir);
    car.angle = car.dir > 0 ? 0 : Math.PI;
  }
}

function updateTrafficCar(world, car, dt) {
  // A car the player is driving answers to the player, not to traffic AI.
  if (car.kind !== 'traffic' || car.driver === 'player') return;
  // Brake for the car ahead in the same lane, and yield to anything directly in
  // front of the nose (cross traffic in an intersection, a police cruiser): a car
  // that keeps pushing into a blocked intersection is how a jam starts.
  let blocked = false;
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of world.cars) {
    if (other === car || other.kind === 'wreck') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01 || d > 95) continue;
    const ahead = dx * hx + dy * hy;
    const lateral = Math.abs(-dx * hy + dy * hx);
    if (ahead > 0 && ahead / d > 0.7 && lateral < 32) { blocked = true; break; }
    const sameRoad = other.road === car.road && other.roadAt === car.roadAt && other.dir === car.dir;
    if (!sameRoad) continue;
    const along = car.road === 'h' ? other.x - car.x : other.y - car.y;
    if (along * car.dir > 0 && along * car.dir < TRAFFIC.gap) { blocked = true; break; }
  }
  const want = blocked ? 0 : car.targetSpeed;
  if (blocked) car.blockedTime = (car.blockedTime ?? 0) + dt;
  else car.blockedTime = 0;
  // A car blocked for more than a couple of seconds creeps forward slowly instead
  // of waiting forever: two cars yielding to each other is a deadlock, not traffic.
  const creeping = blocked && car.blockedTime > 2.5;
  const speedTarget = creeping ? 55 : want;
  car.speed += clamp(speedTarget - car.speed, -260 * dt, 180 * dt);
  if (car.speed < 0.5 && blocked) car.stuck += dt;
  else car.stuck = 0;
  if (car.stuck > 4) {
    // Nudge around a jam: hop to the neighbouring lane for a moment.
    car.stuck = 0;
    if (car.road === 'h') car.y += car.dir > 0 ? -46 : 46;
    else car.x += car.dir > 0 ? 46 : -46;
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  maybeTurn(world, car);
  // Wrap around the far edge so traffic never runs dry.
  if (car.x < 60) { car.x = WORLD.width - 80; }
  if (car.x > WORLD.width - 60) { car.x = 80; }
  if (car.y < 60) { car.y = WORLD.height - 90; }
  if (car.y > WORLD.height - 80) { car.y = 80; }
  const fixed = collideCar(world.city, car.x, car.y, car.angle);
  car.x = fixed.x;
  car.y = fixed.y;
}

function updatePed(world, ped, dt) {
  if (ped.dead) return;
  if (ped.state === 'flee') {
    const a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
    ped.angle = a;
    const speed = 150;
    let nx = ped.x + Math.cos(a) * speed * dt;
    let ny = ped.y + Math.sin(a) * speed * dt;
    nx = clamp(nx, 20, WORLD.width - 20);
    ny = clamp(ny, 20, WORLD.height - 70);
    const fixed = collideCircle(world.city, nx, ny, 10);
    ped.x = fixed.x;
    ped.y = fixed.y;
    ped.walkTimer -= dt;
    if (ped.walkTimer <= 0) {
      ped.state = 'walk';
      ped.walkTimer = 2 + world.random() * 4;
    }
    return;
  }
  ped.walkTimer -= dt;
  if (ped.walkTimer <= 0) {
    ped.walkTimer = 2 + world.random() * 5;
    // At an intersection, sometimes turn onto the crossing street.
    const crossings = ped.road === 'h' ? ROADS.vertical : ROADS.horizontal;
    const pos = ped.road === 'h' ? ped.x : ped.y;
    let near = false;
    for (const c of crossings) if (Math.abs(pos - c) < 60) { near = true; break; }
    if (near && world.random() < 0.4) {
      ped.road = ped.road === 'h' ? 'v' : 'h';
      const roads = ped.road === 'h' ? ROADS.horizontal : ROADS.vertical;
      ped.roadAt = roads.reduce((best, r) => (Math.abs((ped.road === 'h' ? ped.y : ped.x) - r) < Math.abs((ped.road === 'h' ? ped.y : ped.x) - best) ? r : best));
      ped.dir = world.random() < 0.5 ? 1 : -1;
      ped.lane = (world.random() < 0.5 ? 1 : -1) * (ROADS.width / 2 + 12);
    } else if (world.random() < 0.25) {
      ped.dir *= -1;
    }
  }
  const speed = ped.speed;
  let nx = ped.x;
  let ny = ped.y;
  if (ped.road === 'h') {
    nx += ped.dir * speed * dt;
    ny = ped.roadAt + ped.lane;
    ped.angle = ped.dir > 0 ? 0 : Math.PI;
  } else {
    ny += ped.dir * speed * dt;
    nx = ped.roadAt + ped.lane;
    ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  nx = clamp(nx, 20, WORLD.width - 20);
  ny = clamp(ny, 20, WORLD.height - 70);
  const fixed = collideCircle(world.city, nx, ny, 10);
  ped.x = fixed.x;
  ped.y = fixed.y;
  if (ped.x <= 25 || ped.x >= WORLD.width - 25 || ped.y <= 25 || ped.y >= WORLD.height - 75) ped.dir *= -1;
}

export function updateTraffic(world, dt) {
  for (const car of world.cars) updateTrafficCar(world, car, dt);
  for (const ped of world.peds) updatePed(world, ped, dt);
  // Keep the streets populated: replace peds that wandered off or died, far from the player.
  const alive = world.peds.filter((p) => !p.dead).length;
  if (alive < PEDS.count) {
    const p = world.player;
    for (let tries = 0; tries < 8 && world.peds.filter((q) => !q.dead).length < PEDS.count; tries += 1) {
      const ped = spawnPed(world, world.random);
      if (distance(ped.x, ped.y, p.x, p.y) > 500) world.peds.push(ped);
    }
  }
  // Replace traffic cars that became wrecks, far from the player.
  const driving = world.cars.filter((c) => c.kind === 'traffic').length;
  if (driving < TRAFFIC.count) {
    const p = world.player;
    for (let tries = 0; tries < 8 && world.cars.filter((c) => c.kind === 'traffic').length < TRAFFIC.count; tries += 1) {
      const car = spawnTrafficCar(world, world.random);
      if (distance(car.x, car.y, p.x, p.y) > 600) world.cars.push(car);
    }
  }
}
