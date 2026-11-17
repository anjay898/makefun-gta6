// The story: three chained jobs for Rook, Mara's fixer. Each mission is a small state
// machine — go somewhere, pick something up, hold a spot, lose the police, bring it
// home — and pays out when its last objective is reached. A failed escape can be
// retried from the hideout; the story ends when the third job pays out.

import { MISSIONS } from './config.js';

const ARRIVE_RADIUS = 78;
const HOLD_RADIUS = 260;

function setObjective(world, x, y, label) {
  world.state.mission.objective = { x, y, label };
}

export function currentMission(world) {
  const index = world.state.mission.index;
  return index < MISSIONS.length ? MISSIONS[index] : null;
}

/** Begin mission `index` from its first objective. */
export function startMission(world, index) {
  const mission = MISSIONS[index];
  const m = world.state.mission;
  m.index = index;
  m.started = true;
  m.complete = false;
  if (index === 0) {
    m.stage = 'goto';
    setObjective(world, mission.target.x, mission.target.y, mission.target.label);
    world.setBanner(`MISSION: ${mission.name} — ${mission.brief}`);
  } else if (index === 1) {
    m.stage = 'flee';
    m.timer = mission.escapeSeconds;
    world.setHeat(75);
    setObjective(world, mission.flee.x, mission.flee.y, mission.flee.label);
    world.setBanner(`MISSION: ${mission.name} — ${mission.brief}`);
  } else if (index === 2) {
    m.stage = 'goto';
    m.guardsSpawned = false;
    setObjective(world, mission.target.x, mission.target.y, mission.target.label);
    world.setBanner(`MISSION: ${mission.name} — ${mission.brief}`);
  }
}

function completeMission(world) {
  const mission = currentMission(world);
  const m = world.state.mission;
  if (!mission) return;
  world.addMoney(mission.payout);
  world.setBanner(`+$${mission.payout} — ${mission.name} complete`);
  world.saveSoon();
  const next = m.index + 1;
  if (next >= MISSIONS.length) {
    m.index = next;
    m.stage = 'done';
    m.objective = null;
    m.complete = true;
    world.setBanner('STORY COMPLETE — Solara Bay is yours, Mara.');
    return;
  }
  m.stage = 'idle';
  m.objective = null;
  m.idleT = 3;
  m.nextIndex = next;
}

function failMission(world) {
  const m = world.state.mission;
  world.setHeat(0);
  world.setBanner('MISSION FAILED — get back to the hideout to try again');
  m.stage = 'retry';
  setObjective(world, 600, 2325, 'Hideout — retry Hot Pursuit');
}

function distanceToObjective(world) {
  const p = world.state.player;
  const o = world.state.mission.objective;
  if (!o) return Infinity;
  const px = p.inCar ? p.carX : p.x;
  const py = p.inCar ? p.carY : p.y;
  return Math.hypot(o.x - px, o.y - py);
}

/** One step of the mission state machine. */
export function updateMissions(world, dt) {
  const m = world.state.mission;
  const mission = currentMission(world);
  if (!mission) return;
  if (m.stage === 'idle') {
    m.idleT -= dt;
    if (m.idleT <= 0) startMission(world, m.nextIndex);
    return;
  }
  if (m.stage === 'goto') {
    if (distanceToObjective(world) < ARRIVE_RADIUS) {
      if (m.index === 0) {
        m.stage = 'pickup';
        m.pickupT = 0.8;
        world.setBanner('Package secured — take it to the hideout');
      } else if (m.index === 2) {
        m.stage = 'hold';
        m.holdT = mission.holdSeconds;
        world.setHeat(50);
        world.setBanner(`Hold the vault — ${mission.holdSeconds} seconds while the crew cracks it`);
        if (!m.guardsSpawned) {
          m.guardsSpawned = true;
          for (const [gx, gy] of [[4040, 880], [4360, 880], [4040, 1080], [4360, 1080]]) {
            world.spawnGuard(gx, gy);
          }
        }
      }
    }
    return;
  }
  if (m.stage === 'pickup') {
    m.pickupT -= dt;
    if (m.pickupT <= 0) {
      m.stage = 'deliver';
      setObjective(world, mission.deliver.x, mission.deliver.y, mission.deliver.label);
    }
    return;
  }
  if (m.stage === 'deliver') {
    if (distanceToObjective(world) < ARRIVE_RADIUS) completeMission(world);
    return;
  }
  if (m.stage === 'flee') {
    m.timer -= dt;
    if (distanceToObjective(world) < ARRIVE_RADIUS) {
      m.stage = 'escape';
      setObjective(world, mission.target.x, mission.target.y, mission.target.label);
      world.setBanner('Broke away — now lose them and get to the hideout');
      return;
    }
    if (m.timer <= 0) failMission(world);
    return;
  }
  if (m.stage === 'escape') {
    m.timer -= dt;
    if (distanceToObjective(world) < ARRIVE_RADIUS) {
      world.setHeat(0);
      completeMission(world);
      return;
    }
    if (m.timer <= 0) failMission(world);
    return;
  }
  if (m.stage === 'hold') {
    if (distanceToObjective(world) < HOLD_RADIUS) {
      m.holdT -= dt;
      if (m.holdT <= 0) {
        m.stage = 'deliver';
        setObjective(world, mission.deliver.x, mission.deliver.y, mission.deliver.label);
        world.setBanner('Vault cracked — run the cash to the hideout');
      }
    }
    return;
  }
  if (m.stage === 'retry') {
    if (distanceToObjective(world) < 90) startMission(world, m.index);
  }
}
