// LOW TIDE — Solara Bay. Every tuning number and colour in one place.
// The world is a fixed 4800x3600 open city; the camera follows the player and the
// renderer scales to the window, so no rule below depends on the screen size.

export const STEP = 1 / 60;
export const WORLD = { width: 4800, height: 3600 };

/** Road centrelines: vertical avenues and horizontal streets, 100 px wide. */
export const ROADS = {
  width: 100,
  vertical: [300, 900, 1500, 2100, 2700, 3300, 3900, 4500],
  horizontal: [300, 900, 1500, 2100, 2700, 3300],
};

export const STREET_NAMES = {
  vertical: ['Palma Ave', 'Coral Blvd', 'Heron St', 'Marina Way', 'Sol St', 'Lagoon Rd', 'Pier Ave', 'Sunset Dr'],
  horizontal: ['Bayfront St', 'Tide St', 'Gull St', 'Anchor Rd', 'Breeze Ave', 'Harbor Ln'],
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 300,
  health: 100,
  punchDamage: 12,
  punchRange: 34,
  punchArc: 1.1,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 460,
  maxReverse: 160,
  steer: 2.6,
  grip: 3.2,
  health: 100,
};

export const TRAFFIC = { count: 26, speedMin: 130, speedMax: 210, gap: 78, turnChance: 0.22 };
export const PEDS = { count: 46, speedMin: 34, speedMax: 62 };

export const WANTED = {
  maxStars: 5,
  decayQuietSeconds: 18,
  decayStepSeconds: 7,
  copSpeed: 430,
  maxCops: 6,
  /** Heat points added by each crime; stars are heat bands. */
  heat: { stealCar: 25, killPed: 30, shoot: 8, killCop: 45, ramCop: 15, missionHeat: 40 },
  starAt: [0, 20, 45, 75, 110, 150],
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 34, rate: 0.32, auto: false },
  pistol: { name: 'P9 Pistol', damage: 26, range: 460, rate: 0.22, auto: false, bulletSpeed: 900, mag: 12 },
  smg: { name: 'Stinger SMG', damage: 14, range: 380, rate: 0.08, auto: true, bulletSpeed: 950, mag: 30 },
};

export const MONEY = { start: 120, mission1: 500, mission2: 900, mission3: 2000, stash: 150, fare: 80 };

export const DAY_LENGTH = 360; // seconds of play per full day/night cycle

export const PALETTE = {
  skyDay: '#7ec8e3',
  skyNight: '#0d1b2e',
  grass: '#5da24a',
  park: '#4c8f3e',
  sand: '#e8d29a',
  water: '#2e7fa8',
  road: '#3a3f47',
  roadLine: '#e8d44d',
  sidewalk: '#b8b0a0',
  buildingRoof: ['#c96f4a', '#d9a05b', '#7fa8a0', '#b5533c', '#e0cfa8', '#8a6f9e', '#5b7fa6', '#d98a7a'],
  buildingWall: ['#e8dcc8', '#f2e6d0', '#d9c8a8', '#cbb8a0'],
  carColors: ['#d94f3d', '#3d7fd9', '#e8c33d', '#4caf6d', '#e8e8e8', '#2b2b30', '#c97bb8', '#e07b2e', '#7fb3d9', '#8a5a2e'],
  player: '#f2c94c',
  cop: '#2b4fd9',
  hud: '#101820',
  text: '#f4f1e8',
  muted: '#a8b0b8',
  accent: '#ffb03a',
  danger: '#e5534b',
  good: '#6fce62',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'lowtide.solara.save.v1';
