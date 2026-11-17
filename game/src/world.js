// The world: the one simulation that every other module reads and writes. It owns the
// player's state, the pools of cars, pedestrians, bullets, particles and pickups, the
// wanted level, the clock and the camera, and advances them one fixed step at a time.
// Drawing lives in render.js, sound in audio.js — this file never touches the screen
// or the browser, so the same code runs headless in a test.

import {
  CAR, CLOCK, PLAYER, POOLS, VIEW, WANTED, WEAPONS, WEAPON_ORDER, WORLD,
} from './config.js';
import { buildCity, isBeach, isBlocked, randomRoadPoint, streetNameAt } from './city.js';
import { intRange, pick, range } from './random.js';
import { scarePeds, spawnParkedCars, spawnPedestrians, spawnTrafficCars, stepTraffic } from './traffic.js';
import { stepPolice } from './police.js';
import { startMission, updateMissions } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_SHOT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_MISSION = 4;
export const EVENT_DIED = 8;
export const EVENT_BUSTED = 16;
export const EVENT_STEAL = 32;
export const EVENT_HIT = 64;
export const EVENT_CRASH = 128;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Circle against a building or crate rectangle: true when they overlap. */
function circleHitsSolid(city, x, y, r) {
  if (x - r < 8 || y - r < 8 || x + r > WORLD.width - 8 || y + r > WORLD.height - 8) return true;
  if (x + r >= 4740 || y + r >= 3560) return true;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
  }
  for (let i = 0; i < city.crates.length; i += 1) {
    const c = city.crates[i];
    const cx = clamp(x, c.x, c.x + c.w);
    const cy = clamp(y, c.y, c.y + c.h);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
  }
  return false;
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    player: {
      x: city.playerSpawn.x, y: city.playerSpawn.y, angle: -Math.PI / 2,
      hp: PLAYER.hp, money: 0, weapon: 'fists',
      ammo: { pistol: WEAPONS.pistol.startAmmo, smg: 0 },
      hasSmg: false, inCar: false, carIndex: -1,
      carX: 0, carY: 0, carAngle: 0, carVx: 0, carVy: 0, carSpeed: 0,
      invuln: 0, fireT: 0, hurtFlash: 0, dead: false, busted: false,
    },
    cars: [], peds: [], bullets: [], particles: [], pickups: [],
    wanted: { heat: 0, stars: 0, lastCrime: -999 },
    clock: { minutes: CLOCK.startMinutes },
    camera: { x: 0, y: 0 },
    mission: { index: 0, stage: 'idle', objective: null, timer: 0, holdT: 0, pickupT: 0, idleT: 0, nextIndex: 0, guardsSpawned: false, started: false, complete: false },
    arrestT: 0, roadblockT: 10, siren: -1,
    banner: '', bannerT: 0, elapsed: 0, pickupSpawnT: 0, savePending: false,
    events: 0,
  };
  for (let i = 0; i < POOLS.cars; i += 1) {
    state.cars.push({ active: false, driver: 'parked', mode: 'chase', blockT: 0, x: 0, y: 0, angle: 0, speed: 0, vx: 0, vy: 0, hp: CAR.hp, color: '#888888', legFrom: null, legTo: null, cruise: 0, wait: 0, prevX: 0, prevY: 0 });
  }
  for (let i = 0; i < POOLS.peds; i += 1) {
    state.peds.push({ active: false, kind: 'ped', x: 0, y: 0, angle: 0, speed: 0, hp: 100, color: '#cccccc', state: 'walk', fleeT: 0, targetX: 0, targetY: 0, attackCooldown: 0, shootT: 0, downT: 0 });
  }
  for (let i = 0; i < POOLS.bullets; i += 1) {
    state.bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, friendly: true });
  }
  for (let i = 0; i < POOLS.particles; i += 1) {
    state.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#ffffff', size: 3, gravity: 0 });
  }
  for (let i = 0; i < POOLS.pickups; i += 1) {
    state.pickups.push({ active: false, kind: 'money', x: 0, y: 0, amount: 0, bobT: 0 });
  }

  const world = {
    random, city, state,
    reset, step, addEvent, addHeat, setHeat, addMoney, setBanner, saveSoon,
    damagePlayer, bust, respawn, teleportPlayer, spawnGuard, spawnPickup,
    spawnParticle, spawnBurst, isNight, streetName, giveWeapon, setClock,
    playerCar,
  };

  function addEvent(flag) {
    state.events |= flag;
  }

  function setBanner(text) {
    state.banner = text;
    state.bannerT = 4.5;
  }

  function saveSoon() {
    state.savePending = true;
  }

  function addMoney(amount) {
    state.player.money += amount;
  }

  function addHeat(amount, reason) {
    if (amount <= 0) return;
    state.wanted.heat = Math.min(WANTED.maxStars * WANTED.heatPerStar, state.wanted.heat + amount);
    state.wanted.lastCrime = state.elapsed;
  }

  function setHeat(value) {
    state.wanted.heat = clamp(value, 0, WANTED.maxStars * WANTED.heatPerStar);
    if (value > 0) state.wanted.lastCrime = state.elapsed;
  }

  function isNight() {
    const m = state.clock.minutes;
    return m >= CLOCK.nightStart || m < CLOCK.nightEnd;
  }

  function streetName() {
    const p = state.player;
    if (isBeach(city, p.x, p.y)) return 'Solara Beach';
    return streetNameAt(city, p.x, p.y);
  }

  function setClock(minutes) {
    state.clock.minutes = ((minutes % 1440) + 1440) % 1440;
  }

  function giveWeapon(id) {
    const p = state.player;
    if (id === 'smg') {
      p.hasSmg = true;
      p.ammo.smg += 60;
      p.weapon = 'smg';
    } else if (id === 'pistol') {
      p.ammo.pistol += 24;
      if (p.weapon === 'fists') p.weapon = 'pistol';
    }
  }

  function playerCar() {
    const p = state.player;
    if (!p.inCar || p.carIndex < 0) return null;
    const car = state.cars[p.carIndex];
    return car && car.active ? car : null;
  }

  function spawnParticle(x, y, vx, vy, life, color, size, gravity) {
    for (const pt of state.particles) {
      if (pt.active) continue;
      pt.active = true;
      pt.x = x; pt.y = y; pt.vx = vx; pt.vy = vy;
      pt.life = life; pt.maxLife = life; pt.color = color; pt.size = size; pt.gravity = gravity || 0;
      return pt;
    }
    return null;
  }

  function spawnBurst(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = range(random, speed * 0.3, speed);
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, range(random, life * 0.5, life), color, range(random, size * 0.6, size * 1.4), 60);
    }
  }

  function spawnPickup(kind, x, y, amount) {
    for (const pk of state.pickups) {
      if (pk.active) continue;
      pk.active = true;
      pk.kind = kind;
      pk.x = x; pk.y = y; pk.amount = amount;
      pk.bobT = random() * Math.PI * 2;
      return pk;
    }
    return null;
  }

  function spawnGuard(x, y) {
    for (const ped of state.peds) {
      if (ped.active) continue;
      ped.active = true;
      ped.kind = 'guard';
      ped.x = x; ped.y = y;
      ped.angle = 0;
      ped.speed = 135;
      ped.hp = 50;
      ped.color = '#3a3a3a';
      ped.state = 'chase';
      ped.fleeT = 0;
      ped.targetX = x; ped.targetY = y;
      ped.attackCooldown = 0;
      ped.shootT = range(random, 0.4, 1.2);
      ped.downT = 0;
      return ped;
    }
    return null;
  }

  function damagePlayer(amount, source) {
    const p = state.player;
    if (p.dead || p.busted || p.invuln > 0) return false;
    p.hp -= amount;
    p.invuln = PLAYER.hurtCooldown;
    p.hurtFlash = 0.45;
    spawnBurst(p.x, p.y, 6, '#e5534b', 120, 0.5, 4);
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      addEvent(EVENT_DIED);
    }
    return true;
  }

  function bust() {
    const p = state.player;
    if (p.dead || p.busted) return;
    p.busted = true;
    addEvent(EVENT_BUSTED);
  }

  function respawn() {
    const p = state.player;
    const wasBusted = p.busted;
    p.hp = PLAYER.hp;
    p.dead = false;
    p.busted = false;
    p.invuln = 2;
    p.money = Math.floor(p.money * (wasBusted ? 0.85 : 0.9));
    setHeat(0);
    state.arrestT = 0;
    if (p.inCar) {
      const car = playerCar();
      if (car) car.driver = 'parked';
      p.inCar = false;
      p.carIndex = -1;
    }
    const spawn = wasBusted ? city.hqSpawn : city.hospitalSpawn;
    p.x = spawn.x;
    p.y = spawn.y;
    p.angle = -Math.PI / 2;
    for (const car of state.cars) if (car.active && car.driver === 'police') car.active = false;
    for (const ped of state.peds) if (ped.active && (ped.kind === 'cop' || ped.kind === 'guard')) ped.active = false;
    state.camera.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    state.camera.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
  }

  function teleportPlayer(x, y) {
    const p = state.player;
    if (p.inCar) {
      const car = playerCar();
      if (car) { car.x = x; car.y = y; }
      p.carX = x; p.carY = y;
    }
    p.x = x;
    p.y = y;
    state.camera.x = clamp(x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    state.camera.y = clamp(y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
  }

  function reset() {
    const p = state.player;
    p.x = city.playerSpawn.x;
    p.y = city.playerSpawn.y;
    p.angle = -Math.PI / 2;
    p.hp = PLAYER.hp;
    p.money = 0;
    p.weapon = 'fists';
    p.ammo = { pistol: WEAPONS.pistol.startAmmo, smg: 0 };
    p.hasSmg = false;
    p.inCar = false;
    p.carIndex = -1;
    p.carX = 0; p.carY = 0; p.carAngle = 0; p.carVx = 0; p.carVy = 0; p.carSpeed = 0;
    p.invuln = 0; p.fireT = 0; p.hurtFlash = 0;
    p.dead = false; p.busted = false;
    for (const car of state.cars) car.active = false;
    for (const ped of state.peds) ped.active = false;
    for (const b of state.bullets) b.active = false;
    for (const pt of state.particles) pt.active = false;
    for (const pk of state.pickups) pk.active = false;
    state.wanted.heat = 0;
    state.wanted.stars = 0;
    state.wanted.lastCrime = -999;
    state.clock.minutes = CLOCK.startMinutes;
    state.mission = { index: 0, stage: 'idle', objective: null, timer: 0, holdT: 0, pickupT: 0, idleT: 0, nextIndex: 0, guardsSpawned: false, started: false, complete: false };
    state.arrestT = 0;
    state.roadblockT = 10;
    state.siren = -1;
    state.banner = '';
    state.bannerT = 0;
    state.elapsed = 0;
    state.pickupSpawnT = 0;
    state.savePending = false;
    state.events = 0;
    state.camera.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    state.camera.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    spawnTrafficCars(world, 18);
    spawnParkedCars(world, 10);
    spawnPedestrians(world, 26);
    for (let i = 0; i < 8; i += 1) {
      const point = randomRoadPoint(city, random);
      const kind = pick(random, ['money', 'money', 'health', 'pistol', 'money', 'health']);
      spawnPickup(kind, point.x, point.y, kind === 'money' ? intRange(random, 20, 80) : kind === 'health' ? 40 : 24);
    }
    // One car of her own waits by the plaza, and the first job starts at once.
    const plazaCar = freePlayerCarNear(city.playerSpawn.x + 90, city.playerSpawn.y);
    if (plazaCar) {
      plazaCar.active = true;
      plazaCar.driver = 'parked';
      plazaCar.x = city.playerSpawn.x + 90;
      plazaCar.y = city.playerSpawn.y;
      plazaCar.angle = 0;
      plazaCar.speed = 0;
      plazaCar.vx = 0;
      plazaCar.vy = 0;
      plazaCar.hp = CAR.hp;
      plazaCar.color = '#c94f43';
    }
    startMission(world, 0);
  }

  function freePlayerCarNear() {
    for (const car of state.cars) if (!car.active) return car;
    return null;
  }

  function enterNearestCar() {
    const p = state.player;
    let best = null;
    let bestD = PLAYER.stealRange;
    for (let i = 0; i < state.cars.length; i += 1) {
      const car = state.cars[i];
      if (!car.active || car.driver === 'player') continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return false;
    if (best.driver === 'traffic') {
      for (const ped of state.peds) {
        if (ped.active) continue;
        ped.active = true;
        ped.kind = 'ped';
        ped.x = best.x + 46;
        ped.y = best.y + 30;
        ped.angle = 0;
        ped.speed = 80;
        ped.hp = 100;
        ped.color = pick(random, ['#e8b4b8', '#a8c686', '#f2d398']);
        ped.state = 'flee';
        ped.fleeT = 4;
        ped.targetX = ped.x + 300;
        ped.targetY = ped.y + 200;
        break;
      }
      addHeat(WANTED.stealHeat);
    }
    if (best.driver === 'police') addHeat(40);
    best.driver = 'player';
    p.inCar = true;
    p.carIndex = state.cars.indexOf(best);
    p.carX = best.x;
    p.carY = best.y;
    p.carAngle = best.angle;
    p.x = best.x;
    p.y = best.y;
    addEvent(EVENT_STEAL);
    return true;
  }

  function exitCar() {
    const p = state.player;
    const car = playerCar();
    if (!car) { p.inCar = false; p.carIndex = -1; return; }
    const perp = car.angle + Math.PI / 2;
    for (const side of [1, -1]) {
      const nx = car.x + Math.cos(perp) * 44 * side;
      const ny = car.y + Math.sin(perp) * 44 * side;
      if (!circleHitsSolid(city, nx, ny, PLAYER.radius + 2)) {
        p.x = nx; p.y = ny;
        car.driver = 'parked';
        p.inCar = false;
        p.carIndex = -1;
        return;
      }
    }
    p.x = car.x + 52;
    p.y = car.y;
    car.driver = 'parked';
    p.inCar = false;
    p.carIndex = -1;
  }

  function meleeAttack(aimAngle) {
    const p = state.player;
    p.fireT = WEAPONS.fists.rate;
    addEvent(EVENT_SHOT);
    scarePeds(world, p.x, p.y, 320);
    for (const ped of state.peds) {
      if (!ped.active) continue;
      const dx = ped.x - p.x;
      const dy = ped.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > WEAPONS.fists.range + 12) continue;
      if (Math.abs(wrapAngle(Math.atan2(dy, dx) - aimAngle)) > 1.15) continue;
      hurtPed(ped, WEAPONS.fists.damage);
      ped.x += (dx / (d || 1)) * 26;
      ped.y += (dy / (d || 1)) * 26;
    }
  }

  function shootWeapon(input) {
    const p = state.player;
    const def = WEAPONS[p.weapon];
    const aimAngle = input.aimX !== undefined
      ? Math.atan2(input.aimY - p.y, input.aimX - p.x)
      : p.angle;
    p.angle = aimAngle;
    if (p.weapon === 'fists') {
      meleeAttack(aimAngle);
      return;
    }
    if (p.ammo[p.weapon] <= 0) {
      p.weapon = 'fists';
      return;
    }
    p.ammo[p.weapon] -= 1;
    p.fireT = def.rate;
    const spread = (random() - 0.5) * 2 * def.spread;
    const a = aimAngle + spread;
    for (const b of state.bullets) {
      if (b.active) continue;
      b.active = true;
      b.x = p.x + Math.cos(a) * 22;
      b.y = p.y + Math.sin(a) * 22;
      b.vx = Math.cos(a) * def.bulletSpeed;
      b.vy = Math.sin(a) * def.bulletSpeed;
      b.life = def.range / def.bulletSpeed;
      b.damage = def.damage;
      b.friendly = true;
      break;
    }
    spawnParticle(p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26, Math.cos(a) * 60, Math.sin(a) * 60, 0.09, '#ffd94d', 5, 0);
    addEvent(EVENT_SHOT);
    addHeat(WANTED.shotHeat);
    scarePeds(world, p.x, p.y, 340);
  }

  function hurtPed(ped, damage) {
    ped.hp -= damage;
    spawnBurst(ped.x, ped.y, 5, '#e5534b', 110, 0.45, 4);
    if (ped.hp <= 0) {
      ped.active = false;
      if (ped.kind === 'cop') addHeat(WANTED.killCopHeat);
      else if (ped.kind === 'ped') addHeat(WANTED.killPedHeat);
      else addHeat(25);
      addEvent(EVENT_HIT);
      spawnBurst(ped.x, ped.y, 10, '#e5534b', 160, 0.7, 5);
    }
  }

  function explodeCar(car) {
    if (!car.active) return;
    spawnBurst(car.x, car.y, 22, '#ff7a2a', 260, 0.9, 6);
    spawnBurst(car.x, car.y, 14, '#3a3e46', 120, 1.4, 8);
    spawnBurst(car.x, car.y, 10, '#ffd94d', 320, 0.5, 5);
    car.active = false;
    addEvent(EVENT_CRASH);
    const p = state.player;
    if (car.driver === 'player') {
      p.inCar = false;
      p.carIndex = -1;
      p.x = car.x + 50;
      p.y = car.y;
      damagePlayer(30, 'explosion');
    }
  }

  function stepPlayerOnFoot(dt, input) {
    const p = state.player;
    const len = Math.hypot(input.moveX, input.moveY);
    let mx = 0;
    let my = 0;
    if (len > 0.01) {
      mx = input.moveX / len;
      my = input.moveY / len;
    }
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (input.aimX !== undefined && (input.fire || input.aimMoved)) {
      p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    } else if (len > 0.01) {
      p.angle = Math.atan2(my, mx);
    }
    const nx = p.x + mx * speed * dt;
    if (!circleHitsSolid(city, nx, p.y, PLAYER.radius)) p.x = nx;
    const ny = p.y + my * speed * dt;
    if (!circleHitsSolid(city, p.x, ny, PLAYER.radius)) p.y = ny;
    for (const car of state.cars) {
      if (!car.active) continue;
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 36 + PLAYER.radius && d > 0.01) {
        p.x = car.x + (dx / d) * (36 + PLAYER.radius);
        p.y = car.y + (dy / d) * (36 + PLAYER.radius);
      }
    }
    if (input.interact) enterNearestCar();
    if (input.cycleWeapon) {
      const order = WEAPON_ORDER.filter((id) => id === 'fists' || (id === 'pistol' && p.ammo.pistol > 0) || (id === 'smg' && p.hasSmg && p.ammo.smg > 0));
      const at = order.indexOf(p.weapon);
      p.weapon = order[(at + 1) % order.length] || 'fists';
    }
    p.fireT -= dt;
    if ((input.firePressed || (input.fire && WEAPONS[p.weapon].auto)) && p.fireT <= 0) {
      shootWeapon(input);
    }
  }

  function stepPlayerCar(dt, input) {
    const p = state.player;
    const car = playerCar();
    if (!car) { p.inCar = false; p.carIndex = -1; return; }
    if (input.up) car.speed += CAR.accel * dt;
    if (input.down) {
      if (car.speed > 4) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.accel * 0.45 * dt;
    }
    if (!input.up && !input.down) car.speed -= car.speed * 0.32 * dt;
    car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const sf = clamp(car.speed / 160, -1, 1);
    car.angle += steer * CAR.turnRate * dt * sf;
    const tx = Math.cos(car.angle) * car.speed;
    const ty = Math.sin(car.angle) * car.speed;
    const grip = Math.min(1, CAR.grip * dt);
    car.vx += (tx - car.vx) * grip;
    car.vy += (ty - car.vy) * grip;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    p.carX = car.x;
    p.carY = car.y;
    p.carAngle = car.angle;
    p.carVx = car.vx;
    p.carVy = car.vy;
    p.carSpeed = car.speed;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (input.interact) exitCar();
  }

  function stepGuards(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (!ped.active || ped.kind !== 'guard') continue;
      const dx = p.x - ped.x;
      const dy = p.y - ped.y;
      const dist = Math.hypot(dx, dy);
      ped.shootT -= dt;
      ped.attackCooldown -= dt;
      if (dist > 320) {
        ped.angle = Math.atan2(dy, dx);
        const nx = ped.x + (dx / dist) * ped.speed * dt;
        if (!circleHitsSolid(city, nx, ped.y, 12)) ped.x = nx;
        const ny = ped.y + (dy / dist) * ped.speed * dt;
        if (!circleHitsSolid(city, ped.x, ny, 12)) ped.y = ny;
      } else if (ped.shootT <= 0 && !p.dead && !p.busted) {
        ped.shootT = 0.9 + random() * 0.5;
        ped.angle = Math.atan2(dy, dx);
        const a = ped.angle + (random() - 0.5) * 0.16;
        for (const b of state.bullets) {
          if (b.active) continue;
          b.active = true;
          b.x = ped.x + Math.cos(a) * 22;
          b.y = ped.y + Math.sin(a) * 22;
          b.vx = Math.cos(a) * 700;
          b.vy = Math.sin(a) * 700;
          b.life = 0.7;
          b.damage = 7;
          b.friendly = false;
          break;
        }
        addEvent(EVENT_SHOT);
      }
    }
  }

  function stepBullets(dt) {
    const p = state.player;
    for (const b of state.bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || isBlocked(city, b.x, b.y)) {
        if (isBlocked(city, b.x, b.y)) spawnBurst(b.x, b.y, 3, '#ffd94d', 90, 0.25, 3);
        b.active = false;
        continue;
      }
      if (b.friendly) {
        let hit = false;
        for (const ped of state.peds) {
          if (!ped.active) continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 16) {
            hurtPed(ped, b.damage);
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const car of state.cars) {
            if (!car.active || car.driver === 'player') continue;
            if (Math.hypot(car.x - b.x, car.y - b.y) < 34) {
              car.hp -= b.damage;
              spawnBurst(b.x, b.y, 3, '#ffd94d', 90, 0.25, 3);
              if (car.hp <= 0) explodeCar(car);
              hit = true;
              break;
            }
          }
        }
        if (hit) b.active = false;
      } else if (!p.inCar && !p.dead && Math.hypot(p.x - b.x, p.y - b.y) < 16) {
        damagePlayer(b.damage, 'bullet');
        b.active = false;
      }
    }
  }

  function stepParticles(dt) {
    for (const pt of state.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.active = false; continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += pt.gravity * dt;
    }
  }

  function collectPickup(pk) {
    const p = state.player;
    pk.active = false;
    addEvent(EVENT_PICKUP);
    if (pk.kind === 'money') {
      addMoney(pk.amount);
    } else if (pk.kind === 'health') {
      p.hp = Math.min(PLAYER.hp, p.hp + pk.amount);
    } else if (pk.kind === 'pistol') {
      p.ammo.pistol += pk.amount;
      if (p.weapon === 'fists') p.weapon = 'pistol';
    } else if (pk.kind === 'smg') {
      p.hasSmg = true;
      p.ammo.smg += 60;
      p.weapon = 'smg';
    }
  }

  function stepPickups(dt) {
    const p = state.player;
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      pk.bobT += dt;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d < PLAYER.pickupRange + 6) collectPickup(pk);
    }
    state.pickupSpawnT -= dt;
    if (state.pickupSpawnT <= 0) {
      state.pickupSpawnT = 7;
      let activeCount = 0;
      for (const pk of state.pickups) if (pk.active) activeCount += 1;
      if (activeCount < 10) {
        const point = randomRoadPoint(city, random);
        const kind = pick(random, ['money', 'money', 'health', 'pistol', 'money', 'smg']);
        spawnPickup(kind, point.x, point.y, kind === 'money' ? intRange(random, 20, 80) : kind === 'health' ? 40 : 24);
      }
    }
  }

  /** The sample points of a car body, so a corner can never slip through a building edge. */
  function carSamplePoints(car) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const px = -fy;
    const py = fx;
    return [
      { x: car.x, y: car.y },
      { x: car.x + fx * 33, y: car.y + fy * 33 },
      { x: car.x - fx * 33, y: car.y - fy * 33 },
      { x: car.x + px * 15, y: car.y + py * 15 },
      { x: car.x - px * 15, y: car.y - py * 15 },
      { x: car.x + fx * 33 + px * 15, y: car.y + fy * 33 + py * 15 },
      { x: car.x + fx * 33 - px * 15, y: car.y + fy * 33 - py * 15 },
    ];
  }

  function carHitsBuilding(car) {
    const points = carSamplePoints(car);
    for (const pt of points) if (isBlocked(city, pt.x, pt.y)) return true;
    return false;
  }

  function resolveCarCollisions() {
    const p = state.player;
    for (const car of state.cars) {
      if (!car.active) continue;
      if (carHitsBuilding(car)) {
        const impact = Math.hypot(car.vx, car.vy);
        car.x = car.prevX;
        car.y = car.prevY;
        car.speed *= -0.18;
        car.vx *= -0.2;
        car.vy *= -0.2;
        if (car.driver === 'player') {
          if (impact > 260) {
            damagePlayer(Math.round((impact - 260) / 18), 'crash');
            addEvent(EVENT_CRASH);
            spawnBurst(car.x, car.y, 8, '#ffd94d', 140, 0.4, 4);
          } else if (impact > 90) {
            addEvent(EVENT_CRASH);
          }
        }
        if (impact > 200) {
          car.hp -= Math.round((impact - 200) / 12);
          if (car.hp <= 0) explodeCar(car);
        }
      }
    }
    for (let i = 0; i < state.cars.length; i += 1) {
      const a = state.cars[i];
      if (!a.active) continue;
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const b = state.cars[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 62 || d < 0.01) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (62 - d) / 2;
        const apx = a.x;
        const apy = a.y;
        const bpx = b.x;
        const bpy = b.y;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        // A shove must never push a car into a building or out of the map: undo it.
        if (carHitsBuilding(a)) { a.x = apx; a.y = apy; }
        if (carHitsBuilding(b)) { b.x = bpx; b.y = bpy; }
        const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
        if (rel > 200) {
          a.hp -= Math.round((rel - 200) / 14);
          b.hp -= Math.round((rel - 200) / 14);
          if (a.driver === 'player' || b.driver === 'player') {
            damagePlayer(Math.round((rel - 200) / 22), 'crash');
            addEvent(EVENT_CRASH);
            spawnBurst((a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffd94d', 150, 0.4, 4);
          }
          a.speed *= 0.7;
          b.speed *= 0.7;
          a.vx *= 0.7; a.vy *= 0.7;
          b.vx *= 0.7; b.vy *= 0.7;
          if (a.hp <= 0) explodeCar(a);
          if (b.hp <= 0) explodeCar(b);
        }
      }
    }
    // A fast car that runs a pedestrian down: the pedestrian goes down, the heat goes up.
    for (const car of state.cars) {
      if (!car.active || Math.hypot(car.vx, car.vy) < 60) continue;
      for (const ped of state.peds) {
        if (!ped.active) continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 34) {
          if (car.driver === 'player') {
            hurtPed(ped, 100);
            addEvent(EVENT_HIT);
          } else {
            ped.active = false;
            spawnBurst(ped.x, ped.y, 8, '#e5534b', 140, 0.6, 4);
          }
        }
      }
    }
  }

  function stepCamera(dt) {
    const p = state.player;
    const tx = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    const ty = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    const k = Math.min(1, 6 * dt);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
  }

  function updateWanted(dt) {
    const wanted = state.wanted;
    wanted.stars = Math.min(WANTED.maxStars, Math.floor(wanted.heat / WANTED.heatPerStar));
    if (wanted.heat <= 0) return;
    if (state.elapsed - wanted.lastCrime < WANTED.decayDelay) return;
    let nearestPolice = Infinity;
    for (const car of state.cars) {
      if (!car.active || car.driver !== 'police') continue;
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < nearestPolice) nearestPolice = d;
    }
    // The heat always fades once the player stops committing crimes — slowly while
    // the police are still on top of them, quickly once they have lost the trail.
    const rate = nearestPolice > 450 ? WANTED.decayRate : 0.8;
    wanted.heat = Math.max(0, wanted.heat - rate * dt);
  }

  /** Advance the whole simulation one fixed step. `input` is a plain object; see main.js. */
  function step(dt, input) {
    state.events = 0;
    state.elapsed += dt;
    state.clock.minutes = (state.clock.minutes + CLOCK.minutesPerSecond * dt) % 1440;
    if (state.bannerT > 0) state.bannerT -= dt;
    const p = state.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.fireT > 0) p.fireT -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (!p.dead && !p.busted) {
      for (const car of state.cars) {
        car.prevX = car.x;
        car.prevY = car.y;
      }
      if (p.inCar) stepPlayerCar(dt, input);
      else stepPlayerOnFoot(dt, input);
      stepTraffic(world, dt);
      stepPolice(world, dt);
      updateMissions(world, dt);
      stepGuards(dt);
      stepBullets(dt);
      stepPickups(dt);
      resolveCarCollisions();
      updateWanted(dt);
    }
    stepParticles(dt);
    stepCamera(dt);
    return state.events;
  }

  return world;
}
