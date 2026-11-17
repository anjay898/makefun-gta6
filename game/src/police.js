// The Solara Bay police. Wanted stars decide how many cruisers hunt the player;
// cruisers steer toward the player, ram on contact, and their officers shoot when the
// player is on foot. Break line of sight and stay quiet and the heat cools off.

import { CAR, PALETTE, WANTED, WORLD } from './config.js';
import { angleDiff, clamp, distance, pick } from './random.js';
import { collideCar, hitsBuilding } from './city.js';
import { addHeat, damagePlayer, makeCar } from './world.js';

const COP_COLOR = '#2b4fd9';

/** How many cruisers the current wanted level calls for. */
export function wantedCopCount(stars) {
  return Math.min(stars, WANTED.maxCops);
}

function spawnCop(world, random) {
  const p = world.player;
  const a = random() * Math.PI * 2;
  const dist = 700 + random() * 300;
  let x = clamp(p.x + Math.cos(a) * dist, 80, WORLD.width - 80);
  let y = clamp(p.y + Math.sin(a) * dist, 80, WORLD.height - 120);
  // Prefer spawning on a road: slide to the nearest road centreline.
  const car = makeCar(random, x, y, 0, 'police', COP_COLOR);
  car.driver = 'cop';
  car.targetSpeed = WANTED.copSpeed;
  car.shootTimer = 1 + random();
  car.searchTimer = 0;
  return car;
}

export function updatePolice(world, dt) {
  const { random } = world;
  const stars = world.wanted.stars;
  const p = world.player;
  const cops = world.cars.filter((c) => c.kind === 'police');

  // Reinforce to the wanted level, a few at a time — but only while the trail is
  // fresh (30 s after the last crime) or a cruiser still has the player in sight.
  // After that the heat has to cool off on its own.
  const trailFresh = world.time - world.wanted.lastHeat < 30;
  const anyCopNear = cops.some((c) => distance(c.x, c.y, p.x, p.y) < 600);
  if (cops.length < wantedCopCount(stars) && (trailFresh || anyCopNear)) {
    for (let i = 0; i < 2 && world.cars.filter((c) => c.kind === 'police').length < wantedCopCount(stars); i += 1) {
      world.cars.push(spawnCop(world, random));
    }
  }
  // Too many cruisers (wanted fell): the extras give up and drive away.
  if (cops.length > wantedCopCount(stars)) {
    let extra = cops.length - wantedCopCount(stars);
    for (const cop of cops) {
      if (extra <= 0) break;
      cop.leaving = true;
      extra -= 1;
    }
  }

  for (const cop of world.cars.filter((c) => c.kind === 'police')) {
    cop.shootTimer = (cop.shootTimer ?? 1) - dt;
    cop.ramTimer = Math.max(0, (cop.ramTimer ?? 0) - dt);
    cop.arrestTimer = Math.max(0, (cop.arrestTimer ?? 0) - dt);
    cop.lostTimer = cop.lostTimer ?? 0;
    const dist = distance(cop.x, cop.y, p.x, p.y);
    // A cruiser that cannot find the player for 10 s gives up the chase.
    if (dist > 650) cop.lostTimer += dt;
    else cop.lostTimer = 0;
    if (cop.lostTimer > 10) cop.leaving = true;
    if (cop.leaving) {
      // Drive off in a straight line; despawn far away.
      cop.speed = Math.min(cop.speed + 200 * dt, 300);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      if (dist > 1200) {
        cop.kind = 'gone';
      }
      continue;
    }
    // Pursuit steering: aim at the player, with a little prediction.
    const px = p.inCar ? p.inCar.x + Math.cos(p.inCar.angle) * (p.inCar.speed * 0.35) : p.x;
    const py = p.inCar ? p.inCar.y + Math.sin(p.inCar.angle) * (p.inCar.speed * 0.35) : p.y;
    const wantAngle = Math.atan2(py - cop.y, px - cop.x);
    const turn = clamp(angleDiff(cop.angle, wantAngle), -2.4 * dt, 2.4 * dt);
    cop.angle += turn;
    const targetSpeed = dist > 120 ? WANTED.copSpeed : WANTED.copSpeed * 0.75;
    cop.speed += clamp(targetSpeed - cop.speed, -400 * dt, 320 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    cop.x = clamp(cop.x, 20, WORLD.width - 20);
    cop.y = clamp(cop.y, 20, WORLD.height - 70);
    const fixed = collideCar(world.city, cop.x, cop.y, cop.angle);
    if (fixed.hit) cop.speed *= 0.6;
    cop.x = fixed.x;
    cop.y = fixed.y;

    // Officers shoot when the player is on foot and close.
    if (!p.inCar && dist < 430 && cop.shootTimer <= 0) {
      cop.shootTimer = 0.9 + random() * 0.7;
      const a = Math.atan2(p.y - cop.y, p.x - cop.x) + (random() - 0.5) * 0.35;
      world.bullets.push({
        x: cop.x + Math.cos(a) * 24, y: cop.y + Math.sin(a) * 24,
        vx: Math.cos(a) * 820, vy: Math.sin(a) * 820,
        life: 0.6, damage: 8, from: 'cop',
      });
    }
    // Ramming a player car hurts the driver.
    if (p.inCar && dist < 46) {
      damagePlayer(world, 4, 'rammed by police');
      p.inCar.speed *= 0.92;
    }
    // Standing on the player's toes on foot: the arrest, once a second at most.
    if (!p.inCar && dist < 30 && stars >= 1 && (cop.arrestTimer ?? 0) <= 0) {
      damagePlayer(world, 10, 'arrested by police');
      cop.arrestTimer = 1.0;
    }
  }
  // Wrecks stay as scenery; 'gone' cruisers that drove away are removed.
  world.cars = world.cars.filter((c) => c.kind !== 'gone');
}
