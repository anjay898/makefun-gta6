// Save and load: the whole campaign state (money, health, mission, position, clock,
// stats) lives in localStorage under one key, so Continue on the title screen picks
// up exactly where the player left off.

import { SAVE_KEY } from './config.js';

export function saveGame(world) {
  try {
    const p = world.player;
    const data = {
      version: 1,
      money: p.money,
      health: p.health,
      weapon: p.weapon,
      ammo: p.ammo,
      magAmmo: p.magAmmo,
      x: p.inCar ? p.inCar.x : p.x,
      y: p.inCar ? p.inCar.y : p.y,
      clock: world.clock,
      time: world.time,
      missionIndex: world.mission.index,
      missionDone: world.mission.done,
      stats: world.stats,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
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
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function applySave(world, data) {
  const p = world.player;
  p.money = data.money;
  p.health = data.health;
  p.weapon = data.weapon;
  p.ammo = data.ammo;
  p.magAmmo = data.magAmmo;
  p.x = data.x;
  p.y = data.y;
  p.inCar = null;
  world.clock = data.clock;
  world.time = data.time;
  world.mission.index = data.missionIndex;
  world.mission.done = data.missionDone.slice();
  world.mission.stage = 0;
  world.mission.van = null;
  world.mission.crates = [];
  world.stats = { ...world.stats, ...data.stats };
  world.camera.x = p.x;
  world.camera.y = p.y;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage off: nothing to clear.
  }
}
