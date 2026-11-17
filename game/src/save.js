// Saving and loading through localStorage. The snapshot is small and plain: money,
// mission progress, position, health, weapons and the clock. Anything malformed is
// treated as no save at all, so a bad write can never strand the player.

import { SAVE_KEY } from './config.js';
import { startMission } from './missions.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(world) {
  try {
    const p = world.state.player;
    const snapshot = {
      v: 1,
      money: p.money,
      missionIndex: world.state.mission.index,
      x: Math.round(p.x),
      y: Math.round(p.y),
      hp: Math.round(p.hp),
      weapon: p.weapon,
      ammo: { pistol: p.ammo.pistol, smg: p.ammo.smg },
      hasSmg: p.hasSmg,
      clock: Math.round(world.state.clock.minutes),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    world.state.savePending = false;
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.money !== 'number' || typeof data.x !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Apply a snapshot onto a fresh world: position, money, health, weapons, mission. */
export function applySave(world, data) {
  const p = world.state.player;
  p.money = data.money;
  p.hp = Math.max(1, Math.min(100, data.hp || 100));
  p.weapon = data.weapon || 'fists';
  p.ammo = { pistol: data.ammo?.pistol ?? 0, smg: data.ammo?.smg ?? 0 };
  p.hasSmg = !!data.hasSmg;
  world.teleportPlayer(data.x, data.y);
  world.setClock(data.clock || 480);
  const index = Math.max(0, Math.min(2, data.missionIndex || 0));
  world.state.mission.index = index;
  if (index > 0) startMission(world, index);
}
