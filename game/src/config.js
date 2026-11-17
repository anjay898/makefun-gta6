// LOW TIDE — Solara Bay. Every tuning number, name and colour in one place, so the
// rest of the game never hard-codes a magic value. The city is a fixed 4800 by 3600
// world; the renderer shows a 1280 by 720 window of it, scaled to the browser.

export const WORLD = { width: 4800, height: 3600 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The logical window the renderer paints; it is scaled to fit the real canvas. */
export const VIEW = { width: 1280, height: 720 };

/** Where a save lives between visits (this browser only). */
export const SAVE_KEY = 'lowtide.save.v1';

export const PLAYER = {
  radius: 13,
  walkSpeed: 265,
  runSpeed: 345,
  hp: 100,
  /** Seconds of mercy after any hit, so a crash or a beating can never kill in one frame. */
  hurtCooldown: 0.9,
  /** Seconds a police officer must stay touching the player on foot to make the arrest. */
  arrestTime: 1.2,
  stealRange: 78,
  pickupRange: 30,
};

export const CAR = {
  length: 66,
  width: 30,
  accel: 430,
  brake: 760,
  reverseMax: 170,
  /** Top speed of the fastest street car, in world units a second. */
  maxSpeed: 580,
  turnRate: 2.7,
  /** How fast the velocity vector is pulled toward the car's heading (the drift feel). */
  grip: 5.2,
  hp: 100,
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 14, range: 42, rate: 0.34, bulletSpeed: 0, spread: 0, auto: false },
  pistol: { name: 'Pistol', damage: 26, range: 460, rate: 0.27, bulletSpeed: 980, spread: 0.02, auto: false, startAmmo: 36 },
  smg: { name: 'SMG', damage: 13, range: 400, rate: 0.085, bulletSpeed: 1050, spread: 0.06, auto: true, startAmmo: 120 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg'];

export const WANTED = {
  maxStars: 5,
  heatPerStar: 25,
  stealHeat: 15,
  killPedHeat: 25,
  killCopHeat: 40,
  shotHeat: 4,
  /** Seconds of quiet before the heat starts to fall. */
  decayDelay: 12,
  decayRate: 2.5,
};

export const MISSIONS = [
  {
    id: 'first-tide',
    name: 'First Tide',
    payout: 500,
    giver: 'Rook',
    brief: 'Rook needs a package lifted off the Harbor Docks and brought to the hideout. No noise, no witnesses.',
    target: { x: 450, y: 3225, label: 'Harbor Docks' },
    deliver: { x: 600, y: 2325, label: 'Hideout' },
  },
  {
    id: 'hot-pursuit',
    name: 'Hot Pursuit',
    payout: 900,
    giver: 'Rook',
    brief: 'The pickup was tagged. Solara Bay PD is on you — three stars and climbing. Break away to the Old Fort, then lose them and reach the hideout.',
    flee: { x: 2400, y: 525, label: 'Old Fort' },
    target: { x: 600, y: 2325, label: 'Hideout' },
    escapeSeconds: 90,
  },
  {
    id: 'big-haul',
    name: 'The Big Haul',
    payout: 2000,
    giver: 'Rook',
    brief: 'One last job: hold the Marina vault for twenty seconds while the crew cracks it, then run the cash home.',
    target: { x: 4200, y: 975, label: 'Marina Vault' },
    holdSeconds: 20,
    deliver: { x: 600, y: 2325, label: 'Hideout' },
  },
];

/** How many of each thing can exist at once; the pools are allocated once, at boot. */
export const POOLS = { cars: 40, peds: 48, bullets: 96, particles: 320, pickups: 14 };

export const CLOCK = { startMinutes: 8 * 60, minutesPerSecond: 0.5, nightStart: 19 * 60, nightEnd: 6 * 60 };

export const PALETTE = {
  backdrop: '#0e1420',
  grass: '#6f9e57',
  grassDark: '#5d8a4a',
  park: '#4f7d43',
  sand: '#e3cd96',
  water: '#2b7d9c',
  waterDeep: '#1f5f7d',
  road: '#3a3e46',
  roadEdge: '#2c2f36',
  sidewalk: '#8f959e',
  lane: '#e6dfc2',
  plaza: '#c9b183',
  buildingRoof: '#4a4f58',
  panel: 'rgba(13, 18, 28, 0.88)',
  panelEdge: '#f2c230',
  text: '#f4f1e4',
  muted: '#9aa3ad',
  gold: '#f2c230',
  player: '#e85d3d',
  playerDark: '#7a2d1d',
  police: '#3d7bd6',
  policeDark: '#1d3f7a',
  taxi: '#f2c230',
  health: '#58c96b',
  healthLow: '#e5534b',
  wanted: '#ff5a4e',
  mission: '#ffd94d',
  night: 'rgba(8, 14, 38, 0.42)',
  dusk: 'rgba(64, 32, 64, 0.18)',
  headlight: 'rgba(255, 236, 160, 0.16)',
};

/** A few car paint jobs, picked per car at spawn. */
export const CAR_COLORS = ['#c94f43', '#4f7ec9', '#e8e4d2', '#3f3f46', '#7fb069', '#d9a441', '#8a6fc9', '#5bc0be'];

/** Pedestrian shirt colours, picked per pedestrian at spawn. */
export const PED_COLORS = ['#e8b4b8', '#a8c686', '#f2d398', '#9db8d2', '#d2a679', '#b8a8d2', '#8fc1b5', '#e0e0e0'];

/** The avenues run north-south, the streets east-west. */
export const AVENUES = ['Harbor Ave', 'Coral Ave', 'Palmetto Ave', 'Solara Ave', 'Bayview Ave', 'Tidepool Ave', 'Marina Ave', 'Sunset Ave'];
export const STREETS = ['North Shore St', 'Pelican St', 'Tradewind St', 'Plaza St', 'Juniper St', 'Lagoon St', 'Boardwalk St', 'South Beach St'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
