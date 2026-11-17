// The story of LOW TIDE: three chained missions for Mara Velez, from a first favour
// for Rico to the marina heist. Each mission is a small state machine with an
// objective line, a world marker, and success/failure rules; failing a stage (timer,
// death) restarts that mission from its first stage.

import { LANDMARKS } from './city.js';
import { MONEY, WANTED } from './config.js';
import { clamp, distance } from './random.js';
import { addHeat, damageCar, giveMoney, makeCar, say } from './world.js';

export const EVENT_MISSION_DONE = 2;
export const EVENT_STORY_DONE = 4;

export const MISSION_NAMES = [
  '1 — First Tide',
  '2 — Hot Pursuit',
  '3 — The Big Haul',
];

const PICKUP = { x: 2700, y: 3300, label: 'Dead-drop alley' };
const DROP = { x: 1500, y: 2700, label: 'Drop point' };

const VAN_LOOP = [
  { x: 900, y: 900 }, { x: 3900, y: 900 }, { x: 3900, y: 2700 },
  { x: 900, y: 2700 },
];

export function createMissions(world) {
  return {
    index: 0,
    stage: 0,
    stageFailed: false,
    timer: 0,
    marker: { x: LANDMARKS.docks.x, y: LANDMARKS.docks.y, label: LANDMARKS.docks.label },
    objective: 'Meet Rico at his bar on Palma Ave — follow the yellow marker.',
    van: null,
    vanWaypoint: 0,
    crates: [],
    holdTimer: 0,
    holdTarget: null,
    done: [false, false, false],
  };
}

function playerPos(world) {
  const p = world.player;
  return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
}

function near(world, x, y, r) {
  const pos = playerPos(world);
  return distance(pos.x, pos.y, x, y) < r;
}

function setObjective(m, marker, objective) {
  m.marker = marker;
  m.objective = objective;
}

function completeMission(world, m, reward, reason) {
  m.done[m.index] = true;
  world.stats.missionsDone += 1;
  giveMoney(world, reward, reason);
  say(world, `Mission complete: ${MISSION_NAMES[m.index]}!`);
  m.index += 1;
  m.stage = 0;
  m.van = null;
  m.crates = [];
  if (m.index >= MISSION_NAMES.length) {
    setObjective(m, null, 'Story complete — Solara Bay is yours. Keep exploring, or start over.');
    return EVENT_MISSION_DONE | EVENT_STORY_DONE;
  }
  startMission(world, m);
  return EVENT_MISSION_DONE;
}

function startMission(world, m) {
  if (m.index === 0) {
    setObjective(m, { x: LANDMARKS.docks.x, y: LANDMARKS.docks.y, label: LANDMARKS.docks.label },
      'Meet Rico at his bar on Palma Ave — follow the yellow marker.');
    say(world, 'Rico: "Mara! You came back. One favour and the harbour forgets your name."');
  } else if (m.index === 1) {
    setObjective(m, { x: LANDMARKS.courierLoop.x, y: LANDMARKS.courierLoop.y, label: 'Courier route' },
      'A courier van runs the Coral Blvd loop. Intercept it — follow the yellow marker.');
    say(world, 'Rico: "A courier is moving my cargo across town. Stop that van, take the crate."');
  } else if (m.index === 2) {
    setObjective(m, { x: LANDMARKS.marina.x, y: LANDMARKS.marina.y, label: LANDMARKS.marina.label },
      'Hit the Marina Warehouse: grab all three crates, then lose the cops and reach the safehouse.');
    say(world, 'Rico: "Last one, Mara. Three crates in the marina warehouse. Then we are even."');
  }
}

function spawnVan(world, m) {
  const van = makeCar(world.random, 900, 900, 0, 'mission', '#e8e8e8');
  van.driver = 'npc';
  van.missionTag = 'courier';
  van.health = 60;
  van.speed = 0;
  m.van = van;
  m.vanWaypoint = 1;
  world.cars.push(van);
}

function updateVan(world, m, dt) {
  const van = m.van;
  if (!van || van.health <= 0) return;
  const target = VAN_LOOP[m.vanWaypoint];
  const dx = target.x - van.x;
  const dy = target.y - van.y;
  const d = Math.hypot(dx, dy);
  if (d < 60) {
    m.vanWaypoint = (m.vanWaypoint + 1) % VAN_LOOP.length;
    return;
  }
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - van.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  van.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
  van.speed += clamp(300 - van.speed, -300 * dt, 220 * dt);
  van.x += Math.cos(van.angle) * van.speed * dt;
  van.y += Math.sin(van.angle) * van.speed * dt;
}

function mission1(world, m, dt) {
  if (m.stage === 0) {
    if (near(world, LANDMARKS.docks.x, LANDMARKS.docks.y, 70)) {
      m.stage = 1;
      setObjective(m, { x: PICKUP.x, y: PICKUP.y, label: PICKUP.label },
        'Pick up the package at the dead-drop alley, south end of Sol St.');
      say(world, 'Rico: "Package is stashed in the alley off Sol St. Bring it back, no questions."');
    }
  } else if (m.stage === 1) {
    if (near(world, PICKUP.x, PICKUP.y, 60)) {
      m.stage = 2;
      setObjective(m, { x: LANDMARKS.docks.x, y: LANDMARKS.docks.y, label: LANDMARKS.docks.label },
        'Bring the package back to Rico at the bar.');
      say(world, 'Package secured. Get it back to Rico.');
    }
  } else if (m.stage === 2) {
    if (near(world, LANDMARKS.docks.x, LANDMARKS.docks.y, 70)) {
      return completeMission(world, m, MONEY.mission1, 'First Tide paid out');
    }
  }
  return 0;
}

function mission2(world, m, dt) {
  if (m.stage === 0) {
    if (near(world, LANDMARKS.courierLoop.x, LANDMARKS.courierLoop.y, 90)) {
      spawnVan(world, m);
      m.stage = 1;
      m.timer = 120;
      setObjective(m, null, 'Stop the courier van! Ram it or shoot it until it stalls.');
      say(world, 'There it is — the white courier van. Stop it before it finishes the loop!');
    }
  } else if (m.stage === 1) {
    m.timer -= dt;
    updateVan(world, m, dt);
    if (m.van) {
      setObjective(m, { x: m.van.x, y: m.van.y, label: 'Courier van' },
        `Stop the courier van! Ram it or shoot it. Time left: ${Math.max(0, Math.ceil(m.timer))}s`);
      if (m.van.health <= 0) {
        m.stage = 2;
        setObjective(m, { x: m.van.x, y: m.van.y, label: 'Courier van' },
          'Van stopped! Get out and grab the cargo crate.');
        say(world, 'Van stopped. Grab the cargo!');
      }
    }
    if (m.timer <= 0 && m.stage === 1) {
      say(world, 'Too slow — the courier finished its run. Rico is not happy. Try again.');
      m.stage = 0;
      if (m.van) { m.van.kind = 'traffic'; m.van.missionTag = null; m.van = null; }
      startMission(world, m);
    }
  } else if (m.stage === 2) {
    if (m.van && near(world, m.van.x, m.van.y, 60) && !world.player.inCar) {
      m.stage = 3;
      setObjective(m, { x: DROP.x, y: DROP.y, label: DROP.label },
        'Cargo in hand. Deliver it to the drop point on Anchor Rd.');
      say(world, 'Cargo grabbed. Deliver it to the drop point — and stay off the police radar.');
    }
  } else if (m.stage === 3) {
    if (near(world, DROP.x, DROP.y, 70)) {
      return completeMission(world, m, MONEY.mission2, 'Hot Pursuit paid out');
    }
  }
  return 0;
}

function mission3(world, m, dt) {
  if (m.stage === 0) {
    if (near(world, LANDMARKS.marina.x, LANDMARKS.marina.y, 90)) {
      m.stage = 1;
      m.crates = [
        { x: 4350, y: 820, taken: false },
        { x: 4500, y: 980, taken: false },
        { x: 4300, y: 1000, taken: false },
      ];
      addHeat(world, WANTED.heat.missionHeat);
      setObjective(m, { x: 4420, y: 920, label: 'Crates' },
        'Grab all 3 crates — stand next to one for 2 seconds. The cops are coming!');
      say(world, 'Alarm tripped! Grab the crates fast — the police are on their way.');
    }
  } else if (m.stage === 1) {
    // Hold near a crate to load it.
    const p = world.player;
    let holding = null;
    if (!p.inCar) {
      for (const crate of m.crates) {
        if (!crate.taken && distance(p.x, p.y, crate.x, crate.y) < 55) { holding = crate; break; }
      }
    }
    if (holding) {
      m.holdTimer += dt;
      m.holdTarget = holding;
      if (m.holdTimer >= 2) {
        holding.taken = true;
        m.holdTimer = 0;
        m.holdTarget = null;
        const left = m.crates.filter((c) => !c.taken).length;
        say(world, left > 0 ? `Crate loaded. ${left} to go!` : 'All crates loaded — run!');
        if (left === 0) {
          m.stage = 2;
          setObjective(m, { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, label: LANDMARKS.safehouse.label },
            'Escape to the safehouse on Marina Way. Lose the cops on the way!');
        }
      }
    } else {
      m.holdTimer = 0;
      m.holdTarget = null;
    }
    const left = m.crates.filter((c) => !c.taken).length;
    if (left > 0) setObjective(m, { x: 4420, y: 920, label: 'Crates' },
      `Grab the crates — ${left} left. Stand next to one for 2 seconds.`);
  } else if (m.stage === 2) {
    if (near(world, LANDMARKS.safehouse.x, LANDMARKS.safehouse.y, 80)) {
      return completeMission(world, m, MONEY.mission3, 'The Big Haul paid out');
    }
  }
  return 0;
}

export function updateMissions(world, dt) {
  const m = world.mission;
  if (!m || m.index >= MISSION_NAMES.length) return 0;
  if (m.stageFailed) {
    m.stageFailed = false;
    m.stage = 0;
    m.timer = 0;
    m.crates = [];
    m.holdTimer = 0;
    if (m.van) { m.van.kind = 'traffic'; m.van.missionTag = null; m.van = null; }
    startMission(world, m);
    say(world, 'Mission restarted from the beginning.');
    return 0;
  }
  if (m.index === 0) return mission1(world, m, dt);
  if (m.index === 1) return mission2(world, m, dt);
  return mission3(world, m, dt);
}
