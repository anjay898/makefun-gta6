// Solara Bay: the city itself. A seeded generator lays out blocks between the road
// grid, fills them with buildings, parks and trees, and marks the landmarks the story
// uses (the docks, the marina warehouse, Rico's bar, the safehouse, the hospital).
// It also answers the questions traffic and combat ask: is this point on a road, which
// road is nearest, and does this circle hit a building.

import { PALETTE, ROADS, STREET_NAMES, WORLD } from './config.js';
import { clamp, intBetween, pick } from './random.js';

export const LANDMARKS = {
  docks: { x: 420, y: 1500, label: "Rico's Bar" },
  marina: { x: 4420, y: 900, label: 'Marina Warehouse' },
  safehouse: { x: 2100, y: 2100, label: 'Safehouse' },
  hospital: { x: 3300, y: 2700, label: 'St. Anselm Hospital' },
  plaza: { x: 1500, y: 1500, label: 'Sol Plaza' },
  courierLoop: { x: 2700, y: 900, label: 'Courier Route' },
};

/** True when the point is on a road surface (inside the road width). */
export function onRoad(x, y) {
  const half = ROADS.width / 2;
  for (const vx of ROADS.vertical) if (Math.abs(x - vx) <= half) return true;
  for (const hy of ROADS.horizontal) if (Math.abs(y - hy) <= half) return true;
  return false;
}

/** Nearest road centreline distance and the road it belongs to. */
export function nearestRoad(x, y) {
  let best = { kind: 'v', index: 0, at: ROADS.vertical[0], dist: Math.abs(x - ROADS.vertical[0]) };
  for (let i = 0; i < ROADS.vertical.length; i += 1) {
    const d = Math.abs(x - ROADS.vertical[i]);
    if (d < best.dist) best = { kind: 'v', index: i, at: ROADS.vertical[i], dist: d };
  }
  for (let i = 0; i < ROADS.horizontal.length; i += 1) {
    const d = Math.abs(y - ROADS.horizontal[i]);
    if (d < best.dist) best = { kind: 'h', index: i, at: ROADS.horizontal[i], dist: d };
  }
  return best;
}

/** Name of the street the point is standing on (or nearest to). */
export function streetNameAt(x, y) {
  const r = nearestRoad(x, y);
  return r.kind === 'v' ? STREET_NAMES.vertical[r.index] : STREET_NAMES.horizontal[r.index];
}

/** Is the point inside the beach strip / water at the south edge? */
export function inWater(x, y) {
  return y > WORLD.height - 60;
}

export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const roadHalf = ROADS.width / 2;
  const vxs = [0, ...ROADS.vertical, WORLD.width];
  const hys = [0, ...ROADS.horizontal, WORLD.height];

  // Each cell between four roads is one block: a park, or 2-5 buildings with a yard.
  for (let bi = 0; bi < vxs.length - 1; bi += 1) {
    for (let bj = 0; bj < hys.length - 1; bj += 1) {
      const x0 = vxs[bi] + (bi === 0 ? 0 : roadHalf) + 14;
      const x1 = vxs[bi + 1] - (bi + 1 === vxs.length - 1 ? 0 : roadHalf) - 14;
      const y0 = hys[bj] + (bj === 0 ? 0 : roadHalf) + 14;
      const y1 = hys[bj + 1] - (bj + 1 === hys.length - 1 ? 0 : roadHalf) - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The south strip is the beach, the east strip the marina docks: no buildings there.
      if (y0 > WORLD.height - 260) continue;
      if (x0 > WORLD.width - 260 && y0 < 1200) continue;
      if (random() < 0.16) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = intBetween(random, 4, 9);
        for (let t = 0; t < n; t += 1) {
          trees.push({ x: x0 + 20 + random() * (x1 - x0 - 40), y: y0 + 20 + random() * (y1 - y0 - 40), r: 9 + random() * 7 });
        }
        continue;
      }
      const cols = random() < 0.5 ? 2 : 3;
      const rows = random() < 0.5 ? 1 : 2;
      const cw = (x1 - x0) / cols;
      const ch = (y1 - y0) / rows;
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (random() < 0.12) continue;
          const bw = cw * (0.55 + random() * 0.3);
          const bh = ch * (0.55 + random() * 0.3);
          const bx = x0 + c * cw + (cw - bw) / 2;
          const by = y0 + r * ch + (ch - bh) / 2;
          buildings.push({
            x: bx, y: by, w: bw, h: bh,
            roof: pick(random, PALETTE.buildingRoof),
            wall: pick(random, PALETTE.buildingWall),
            floors: intBetween(random, 1, 4),
          });
        }
      }
    }
  }

  // Landmark buildings sit on their blocks and are drawn with a sign.
  const landmarkBuildings = [
    { ...LANDMARKS.docks, w: 150, h: 100, roof: '#b5533c', wall: '#f2e6d0' },
    { ...LANDMARKS.marina, w: 190, h: 120, roof: '#5b7fa6', wall: '#e8dcc8' },
    { ...LANDMARKS.safehouse, w: 120, h: 90, roof: '#7fa8a0', wall: '#d9c8a8' },
    { ...LANDMARKS.hospital, w: 170, h: 110, roof: '#d9a05b', wall: '#f2e6d0' },
  ];

  return { buildings, parks, trees, landmarkBuildings };
}

/**
 * Push a circle out of every building it overlaps; returns the corrected position,
 * whether a hit happened, and the push that was applied.
 */
function pushCircle(city, x, y, radius) {
  let hit = false;
  let px = 0;
  let py = 0;
  const all = city.buildings.concat(city.landmarkBuildings);
  for (const b of all) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        px += (dx / d) * push;
        py += (dy / d) * push;
      } else {
        // Dead centre: push out along the smallest overlap.
        const left = x - b.x + radius;
        const right = b.x + b.w - x + radius;
        const top = y - b.y + radius;
        const bottom = b.y + b.h - y + radius;
        const m = Math.min(left, right, top, bottom);
        if (m === left) px -= left;
        else if (m === right) px += right;
        else if (m === top) py -= top;
        else py += bottom;
      }
    }
  }
  return { x: x + px, y: y + py, hit, px, py };
}

export function collideCircle(city, x, y, radius) {
  const res = pushCircle(city, x, y, radius);
  return { x: res.x, y: res.y, hit: res.hit };
}

/**
 * Push a car (a rectangle, checked at its centre, nose and tail) out of buildings,
 * so a diagonal car never visually clips a wall the way a single circle would let it.
 */
export function collideCar(city, x, y, angle) {
  let hit = false;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = [
    { dx: 0, dy: 0, r: 20 },
    { dx: cos * 22, dy: sin * 22, r: 14 },
    { dx: -cos * 22, dy: -sin * 22, r: 14 },
  ];
  for (const pt of points) {
    const res = pushCircle(city, x + pt.dx, y + pt.dy, pt.r);
    if (res.hit) {
      hit = true;
      x += res.px;
      y += res.py;
    }
  }
  return { x, y, hit };
}

/** True when a circle of this radius at (x, y) overlaps any building. */
export function hitsBuilding(city, x, y, radius) {
  const all = city.buildings.concat(city.landmarkBuildings);
  for (const b of all) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < radius * radius) return true;
  }
  return false;
}
