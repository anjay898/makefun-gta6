// LOW TIDE — the living world. Holds every entity (player, cars, pedestrians, police,
// bullets, particles, pickups), the wanted level, the clock and the mission state, and
// advances them one fixed step at a time. No DOM here: the same step runs in the
// browser and in the headless logic test.

import { CAR, DAY_LENGTH, MONEY, PALETTE, PLAYER, ROADS, WANTED, WEAPONS, WORLD } from './config.js';
import { buildCity, collideCar, collideCircle, hitsBuilding, inWater } from './city.js';
import { angleDiff, clamp, distance, intBetween, pick } from './random.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { updatePolice } from './police.js';
import { createMissions, updateMissions } from './missions.js';

export const EVENT_NONE = 0;
export const EVENT_GAMEOVER = 1;
export const EVENT_MISSION_DONE = 2;
export const EVENT_STORY_DONE = 4;

let nextCarId = 1;
let nextPedId = 1;

export function makeCar(random, x, y, angle, kind, color) {
  return {
    id: nextCarId, kind, color: color ?? pick(random, PALETTE.carColors),
    x, y, angle, speed: 0, health: CAR.health,
    driver: kind === 'traffic' ? 'npc' : 'none',
    // Traffic AI fields (used by traffic.js when kind is 'traffic').
    road: 'h', roadAt: 0, dir: 1, targetSpeed: 0, stuck: 0,
    // Mission fields.
    missionTag: null, smoke: 0,
  };
}

export function makePed(random, x, y) {
  return {
    id: nextPedId, x, y, angle: random() * Math.PI * 2,
    speed: 34 + random() * 28, color: pick(random, PALETTE.carColors),
    state: 'walk', fleeX: 0, fleeY: 0, dead: false, walkTimer: 2 + random() * 4,
    // Sidewalk walking fields.
    road: 'h', roadAt: 0, dir: 1, lane: 0,
  };
}

export function createWorld(random) {
  const city = buildCity(random);
  const world = {
    random, city,
    time: 0, clock: 9.0, // 09:00 on a sunny morning
    player: {
      x: 2100, y: 2250, angle: -Math.PI / 2, health: PLAYER.health,
      money: MONEY.start, weapon: 'fists', ammo: 0, magAmmo: 0,
      inCar: null, fireCooldown: 0, punchCooldown: 0, hurtFlash: 0,
      invulnerable: 0,
    },
    cars: [], peds: [], bullets: [], particles: [], pickups: [],
    wanted: { heat: 0, stars: 0, quiet: 0 },
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, earned: 0, shotsFired: 0 },
    mission: null,
    feed: [],
    camera: { x: 2100, y: 2250 },
    gameOver: false, storyComplete: false, busted: false,
    deathTimer: 0,
  };
  resetWorld(world);
  return world;
}

/** Fresh state for a new game (keeps the same city). */
export function resetWorld(world) {
  const { random } = world;
  world.time = 0;
  world.clock = 9.0;
  world.player.x = 2100;
  world.player.y = 2250;
  world.player.angle = -Math.PI / 2;
  world.player.health = PLAYER.health;
  world.player.money = MONEY.start;
  world.player.weapon = 'fists';
  world.player.ammo = 0;
  world.player.magAmmo = 0;
  world.player.inCar = null;
  world.player.fireCooldown = 0;
  world.player.invulnerable = 0;
  world.cars = [];
  world.peds = [];
  world.bullets = [];
  world.particles = [];
  world.pickups = [];
  world.wanted = { heat: 0, stars: 0, quiet: 0, lastHeat: -1e9 };
  world.stats = { kills: 0, carsStolen: 0, missionsDone: 0, earned: 0, shotsFired: 0 };
  world.feed = [];
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
  world.gameOver = false;
  world.storyComplete = false;
  world.busted = false;
  world.deathTimer = 0;
  createTraffic(world);
  world.mission = createMissions(world);
  spawnPickups(world);
  say(world, 'Welcome to Solara Bay. Find Rico at the bar — follow the yellow marker.');
}

export function say(world, text) {
  world.feed.push(text);
  if (world.feed.length > 5) world.feed.shift();
}

export function addHeat(world, amount) {
  const w = world.wanted;
  w.heat = clamp(w.heat + amount, 0, 220);
  w.quiet = 0;
  w.lastHeat = world.time;
  const stars = starsForHeat(w.heat);
  if (stars > w.stars) say(world, `Wanted level ${stars} — the Solara Bay police are on you!`);
  w.stars = stars;
}

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.starAt.length; i += 1) if (heat >= WANTED.starAt[i]) stars = i;
  return Math.min(stars, WANTED.maxStars);
}

export function giveMoney(world, amount, reason) {
  world.player.money += amount;
  world.stats.earned += amount;
  say(world, `+$${amount} — ${reason}`);
}

function spawnPickups(world) {
  const { random } = world;
  // Cash stashes hidden around the city, plus a pistol and ammo near the start.
  for (let i = 0; i < 10; i += 1) {
    let x = 0;
    let y = 0;
    do {
      x = 200 + random() * (WORLD.width - 400);
      y = 200 + random() * (WORLD.height - 400);
    } while (hitsBuilding(world.city, x, y, 30) || inWater(x, y));
    world.pickups.push({ x, y, kind: 'cash', amount: MONEY.stash });
  }
  world.pickups.push({ x: 2230, y: 2180, kind: 'weapon', weapon: 'pistol', amount: 0 });
  world.pickups.push({ x: 2260, y: 2320, kind: 'ammo', amount: 24 });
  world.pickups.push({ x: 1500, y: 1560, kind: 'health', amount: 50 });
  world.pickups.push({ x: 3300, y: 2760, kind: 'health', amount: 50 });
}

export function spawnParticles(world, x, y, count, color, speed = 160, life = 0.6) {
  const { random } = world;
  for (let i = 0; i < count; i += 1) {
    const a = random() * Math.PI * 2;
    const s = speed * (0.3 + random() * 0.7);
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.5 + random() * 0.5), maxLife: life, color, size: 2 + random() * 3,
    });
  }
}

export function explodeCar(world, car) {
  spawnParticles(world, car.x, car.y, 26, '#ff8c2e', 260, 0.9);
  spawnParticles(world, car.x, car.y, 18, '#3a3f47', 160, 1.4);
  spawnParticles(world, car.x, car.y, 10, '#e5534b', 200, 0.7);
  car.health = 0;
  car.speed = 0;
  if (car.driver === 'player') {
    world.player.inCar = null;
    world.player.x = car.x + 40;
    world.player.y = car.y;
    damagePlayer(world, 25, 'car explosion');
  }
  car.driver = 'none';
  car.kind = 'wreck';
}

export function damagePlayer(world, amount, cause) {
  const p = world.player;
  if (p.invulnerable > 0 || world.gameOver) return;
  p.health -= amount;
  p.hurtFlash = 0.35;
  if (p.health <= 0) {
    p.health = 0;
    world.gameOver = true;
    world.busted = world.wanted.stars >= 3;
    world.deathTimer = 0;
    say(world, world.busted ? 'Busted! The police hauled you in.' : 'You are down. Solara Bay keeps moving without you.');
  }
}

/** Respawn after death: hospital, a fine, wanted cleared, current mission stage restarts. */
export function respawn(world) {
  const p = world.player;
  const fine = Math.min(200, Math.floor(p.money * 0.25));
  p.money -= fine;
  p.health = PLAYER.health;
  p.x = 3300;
  p.y = 2760;
  p.angle = -Math.PI / 2;
  p.inCar = null;
  p.invulnerable = 3;
  world.wanted = { heat: 0, stars: 0, quiet: 0, lastHeat: -1e9 };
  // Clear police, keep the city and the story where it was.
  world.cars = world.cars.filter((c) => c.kind !== 'police');
  world.bullets = [];
  world.gameOver = false;
  world.mission.stageFailed = true;
  say(world, `You wake up at St. Anselm Hospital. Fine: $${fine}.`);
}

function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.kind === 'wreck') continue;
    const d = distance(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(world) {
  const p = world.player;
  const car = nearestCar(world, p.x, p.y, 70);
  if (!car) {
    say(world, 'No car close enough to take.');
    return;
  }
  if (car.kind === 'police') {
    say(world, 'That is a police cruiser — too hot to steal right now.');
    return;
  }
  if (car.driver === 'npc') {
    // Pull the driver out onto the sidewalk; they run.
    const ped = makePed(world.random, car.x + 30, car.y + 30);
    ped.state = 'flee';
    ped.fleeX = p.x;
    ped.fleeY = p.y;
    world.peds.push(ped);
    addHeat(world, WANTED.heat.stealCar);
    world.stats.carsStolen += 1;
    say(world, 'You yanked the driver out and took the car!');
  }
  car.driver = 'player';
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
}

function exitCar(world) {
  const p = world.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = 'none';
  p.inCar = null;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 40;
  p.y = car.y + Math.sin(side) * 40;
  const fixed = collideCircle(world.city, p.x, p.y, PLAYER.radius);
  p.x = fixed.x;
  p.y = fixed.y;
}

function shootWeapon(world, controls) {
  const p = world.player;
  const def = WEAPONS[p.weapon];
  if (p.fireCooldown > 0) return;
  if (p.weapon === 'fists') {
    p.punchCooldown = 0.25;
    p.fireCooldown = def.rate;
    // Melee arc in front of the player.
    const ax = p.x + Math.cos(p.angle) * PLAYER.punchRange;
    const ay = p.y + Math.sin(p.angle) * PLAYER.punchRange;
    for (const ped of world.peds) {
      if (ped.dead) continue;
      if (distance(ax, ay, ped.x, ped.y) < 30) hurtPed(world, ped, def.damage, 'player');
    }
    for (const car of world.cars) {
      if (car.kind === 'police' && distance(ax, ay, car.x, car.y) < 40) damageCar(world, car, def.damage);
    }
    return;
  }
  if (p.magAmmo <= 0) {
    if (p.ammo > 0) {
      const load = Math.min(def.mag, p.ammo);
      p.ammo -= load;
      p.magAmmo = load;
      say(world, `Reloaded the ${def.name}.`);
    } else {
      say(world, 'Out of ammo — find an ammo pickup (green box).');
    }
    p.fireCooldown = 0.5;
    return;
  }
  p.magAmmo -= 1;
  p.fireCooldown = def.rate;
  world.stats.shotsFired += 1;
  const spread = (world.random() - 0.5) * 0.06;
  const a = p.angle + spread;
  world.bullets.push({
    x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * def.bulletSpeed, vy: Math.sin(a) * def.bulletSpeed,
    life: def.range / def.bulletSpeed, damage: def.damage, from: 'player',
  });
  spawnParticles(world, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, 3, '#ffd76a', 120, 0.15);
  addHeat(world, WANTED.heat.shoot * 0.2);
}

export function hurtPed(world, ped, damage, cause) {
  if (ped.dead) return;
  ped.dead = true;
  ped.state = 'dead';
  world.stats.kills += 1;
  spawnParticles(world, ped.x, ped.y, 10, '#c0392b', 140, 0.7);
  if (cause === 'player') addHeat(world, WANTED.heat.killPed);
  // Nearby pedestrians flee.
  for (const other of world.peds) {
    if (!other.dead && distance(other.x, other.y, ped.x, ped.y) < 320) {
      other.state = 'flee';
      other.fleeX = ped.x;
      other.fleeY = ped.y;
    }
  }
}

export function damageCar(world, car, damage) {
  if (car.kind === 'wreck') return;
  car.health -= damage;
  car.smoke = Math.max(car.smoke, 0.5);
  spawnParticles(world, car.x, car.y, 5, '#888888', 120, 0.5);
  if (car.health <= 0) explodeCar(world, car);
}

function updateBullets(world, dt) {
  const p = world.player;
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) { b.life = 0; continue; }
    if (hitsBuilding(world.city, b.x, b.y, 2)) {
      spawnParticles(world, b.x, b.y, 4, '#ffd76a', 100, 0.2);
      b.life = 0;
      continue;
    }
    if (b.from === 'player') {
      for (const ped of world.peds) {
        if (!ped.dead && distance(b.x, b.y, ped.x, ped.y) < 13) {
          hurtPed(world, ped, b.damage, 'player');
          b.life = 0;
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of world.cars) {
        if (car.kind === 'wreck' || car.driver === 'player') continue;
        if (distance(b.x, b.y, car.x, car.y) < 30) {
          damageCar(world, car, b.damage);
          if (car.kind === 'police') addHeat(world, WANTED.heat.ramCop);
          b.life = 0;
          break;
        }
      }
    } else if (b.from === 'cop') {
      if (!p.inCar && distance(b.x, b.y, p.x, p.y) < 14) {
        damagePlayer(world, b.damage, 'police bullet');
        b.life = 0;
      } else if (p.inCar && distance(b.x, b.y, p.inCar.x, p.inCar.y) < 30) {
        damageCar(world, p.inCar, b.damage * 0.5);
        b.life = 0;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.life > 0);
}

function updateParticles(world, dt) {
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 1 - 2.4 * dt;
    pt.vy *= 1 - 2.4 * dt;
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);
}

function updatePickups(world) {
  const p = world.player;
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    if (distance(px, py, pk.x, pk.y) < 34) {
      pk.taken = true;
      if (pk.kind === 'cash') giveMoney(world, pk.amount, 'Cash stash found');
      else if (pk.kind === 'ammo') {
        p.ammo += pk.amount;
        say(world, `Picked up ${pk.amount} rounds.`);
      } else if (pk.kind === 'health') {
        p.health = Math.min(PLAYER.health, p.health + pk.amount);
        say(world, 'First-aid kit — health restored.');
      } else if (pk.kind === 'weapon') {
        p.weapon = pk.weapon;
        p.magAmmo = WEAPONS[pk.weapon].mag;
        p.ammo += 12;
        say(world, `Picked up a ${WEAPONS[pk.weapon].name}! Click to shoot, Q to switch.`);
      }
    }
  }
  world.pickups = world.pickups.filter((pk) => !pk.taken);
}

function updatePlayerOnFoot(world, controls, dt) {
  const p = world.player;
  const len = Math.hypot(controls.mx, controls.my) || 1;
  const speed = controls.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let nx = p.x + (controls.mx / len) * speed * dt * (controls.mx || controls.my ? 1 : 0);
  let ny = p.y + (controls.my / len) * speed * dt * (controls.mx || controls.my ? 1 : 0);
  nx = clamp(nx, 20, WORLD.width - 20);
  ny = clamp(ny, 20, WORLD.height - 70); // water at the south edge
  const fixed = collideCircle(world.city, nx, ny, PLAYER.radius);
  p.x = fixed.x;
  p.y = fixed.y;
  // Face the mouse.
  p.angle = Math.atan2(controls.aimY - p.y, controls.aimX - p.x);
  if (controls.enterPressed) enterCar(world);
  if (controls.fire) shootWeapon(world, controls);
  if (controls.weaponPressed) {
    p.weapon = p.weapon === 'fists' ? 'pistol' : p.weapon === 'pistol' ? 'smg' : 'fists';
    say(world, `Weapon: ${WEAPONS[p.weapon].name}`);
  }
}

function updatePlayerDriving(world, controls, dt) {
  const p = world.player;
  const car = p.inCar;
  const throttle = controls.my < 0 ? 1 : controls.my > 0 ? -0.7 : 0;
  const steerInput = controls.mx;
  const targetSteer = steerInput * CAR.steer * clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += targetSteer * dt;
  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= car.speed * 0.9 * dt;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 20, WORLD.width - 20);
  car.y = clamp(car.y, 20, WORLD.height - 70);
  const before = { x: car.x, y: car.y };
  const fixed = collideCar(world.city, car.x, car.y, car.angle);
  car.x = fixed.x;
  car.y = fixed.y;
  if (fixed.hit) {
    car.speed *= 0.55;
    if (Math.abs(car.speed) > 200) spawnParticles(world, car.x, car.y, 4, '#cccccc', 100, 0.4);
  }
  // Running over pedestrians.
  for (const ped of world.peds) {
    if (ped.dead) continue;
    if (distance(car.x, car.y, ped.x, ped.y) < 26 && Math.abs(car.speed) > 60) {
      hurtPed(world, ped, 100, 'player');
      car.speed *= 0.85;
    }
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  if (controls.enterPressed) exitCar(world);
  if (controls.fire) shootWeapon(world, controls);
  if (controls.weaponPressed) {
    p.weapon = p.weapon === 'fists' ? 'pistol' : p.weapon === 'pistol' ? 'smg' : 'fists';
    say(world, `Weapon: ${WEAPONS[p.weapon].name}`);
  }
}

function collideCars(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.kind === 'wreck' || b.kind === 'wreck') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= 52 || d <= 0.01) continue;
      const overlap = (52 - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      // Rear-end rule: the car behind matches the speed of the car ahead, instead
      // of both grinding to a halt. (Averaging the two speeds every step is what
      // used to lock a bumper-to-bumper platoon at a crawl.)
      const bAheadOfA = dx * Math.cos(a.angle) + dy * Math.sin(a.angle) > 0;
      const aAheadOfB = -dx * Math.cos(b.angle) - dy * Math.sin(b.angle) > 0;
      if (bAheadOfA && a.speed > b.speed) a.speed = b.speed;
      if (aAheadOfB && b.speed > a.speed) b.speed = a.speed;
      // A ram hurts the driver, but only once per hit (0.8 s cooldown per cruiser).
      if (a.kind === 'police' && b.driver === 'player' && (a.ramTimer ?? 0) <= 0) {
        damagePlayer(world, 6, 'rammed by police');
        a.ramTimer = 0.8;
      }
      if (b.kind === 'police' && a.driver === 'player' && (b.ramTimer ?? 0) <= 0) {
        damagePlayer(world, 6, 'rammed by police');
        b.ramTimer = 0.8;
      }
    }
  }
}

function updateWanted(world, dt) {
  const w = world.wanted;
  const p = world.player;
  let copNear = false;
  for (const car of world.cars) {
    if (car.kind === 'police' && distance(car.x, car.y, p.x, p.y) < 560) { copNear = true; break; }
  }
  if (w.stars > 0 && !copNear) {
    w.quiet += dt;
    if (w.quiet > WANTED.decayQuietSeconds) {
      w.heat = Math.max(0, w.heat - (dt / WANTED.decayStepSeconds) * 12);
      const stars = starsForHeat(w.heat);
      if (stars < w.stars) say(world, `Wanted level dropping — ${stars} star${stars === 1 ? '' : 's'}.`);
      w.stars = stars;
    }
  } else {
    w.quiet = 0;
  }
}

function updateClock(world, dt) {
  world.time += dt;
  world.clock = (9.0 + world.time / DAY_LENGTH * 24) % 24;
}

/** 0 = full day, 1 = deep night. */
export function nightFactor(world) {
  const c = world.clock;
  if (c >= 7 && c < 18) return 0;
  if (c >= 18 && c < 20) return (c - 18) / 2;
  if (c >= 20 || c < 5) return 1;
  return 1 - (c - 5) / 2;
}

/** Advance the whole world one fixed step. Returns event flags for the caller. */
export function stepWorld(world, controls, dt) {
  if (world.gameOver) {
    world.deathTimer += dt;
    updateParticles(world, dt);
    return EVENT_NONE;
  }
  const p = world.player;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);

  if (p.inCar) updatePlayerDriving(world, controls, dt);
  else updatePlayerOnFoot(world, controls, dt);

  updateTraffic(world, dt);
  updatePolice(world, dt);
  updateBullets(world, dt);
  updateParticles(world, dt);
  updatePickups(world);
  updateWanted(world, dt);
  updateClock(world, dt);
  collideCars(world);

  // Camera follows the player, clamped to the world.
  const cam = world.camera;
  cam.x += (p.x - cam.x) * Math.min(1, dt * 5);
  cam.y += (p.y - cam.y) * Math.min(1, dt * 5);

  let events = EVENT_NONE;
  const missionEvents = updateMissions(world, dt);
  if (missionEvents & EVENT_MISSION_DONE) events |= EVENT_MISSION_DONE;
  if (missionEvents & EVENT_STORY_DONE) {
    events |= EVENT_STORY_DONE;
    world.storyComplete = true;
  }
  if (world.gameOver) events |= EVENT_GAMEOVER;
  return events;
}
