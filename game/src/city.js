// Solara Bay, the city itself: a grid of avenues and streets, the blocks between them
// filled with buildings, parks and landmarks, a beach and open water along the east and
// south edges. Everything is placed once from the seeded random generator, so the same
// seed always builds the same city. This module knows nothing about players or cars —
// it only answers questions about the map: is this point road, building or water, what
// street is it on, where is the nearest intersection.

import { WORLD } from './config.js';
import { chance, intRange, pick, range } from './random.js';

export const ROAD_HALF = 46;
export const VERTICAL_XS = [300, 900, 1500, 2100, 2700, 3300, 3900, 4500];
export const HORIZONTAL_YS = [300, 750, 1200, 1650, 2100, 2550, 3000, 3450];

/** Blocks with a landmark instead of ordinary buildings, keyed "col,row". */
const LANDMARKS = {
  '3,0': { name: 'Old Fort', kind: 'fort', x: 2400, y: 525 },
  '3,3': { name: 'Solara Plaza', kind: 'plaza', x: 2400, y: 1875 },
  '0,6': { name: 'Harbor Docks', kind: 'docks', x: 600, y: 3225 },
  '6,1': { name: 'Marina', kind: 'marina', x: 4200, y: 975 },
  '1,1': { name: 'Bayview Hospital', kind: 'hospital', x: 1200, y: 975 },
  '2,2': { name: 'Police HQ', kind: 'hq', x: 1800, y: 1425 },
  '0,4': { name: 'Hideout', kind: 'hideout', x: 600, y: 2325 },
};

const BUILDING_HUES = ['#7a6a8a', '#8a7a5a', '#5a7a8a', '#9a8a7a', '#6a7a5a', '#8a5a6a', '#5a5a6a', '#a08a6a', '#746a8f', '#8f7a6a'];

/** The beach and water strips along the east and south edges of the map. */
export const BEACH = { eastX: 4560, waterX: 4740, southY: 3500, waterY: 3560 };

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function buildCity(random) {
  const buildings = [];
  const parks = [];
  const landmarks = [];
  const crates = [];

  for (let col = 0; col < VERTICAL_XS.length - 1; col += 1) {
    for (let row = 0; row < HORIZONTAL_YS.length - 1; row += 1) {
      const key = `${col},${row}`;
      const x0 = VERTICAL_XS[col] + ROAD_HALF + 14;
      const y0 = HORIZONTAL_YS[row] + ROAD_HALF + 14;
      const x1 = VERTICAL_XS[col + 1] - ROAD_HALF - 14;
      const y1 = HORIZONTAL_YS[row + 1] - ROAD_HALF - 14;
      const landmark = LANDMARKS[key];
      if (landmark) {
        landmarks.push({ ...landmark, x0, y0, x1, y1 });
        if (landmark.kind === 'hospital' || landmark.kind === 'hq') {
          buildings.push({
            x: x0 + 60, y: y0 + 40, w: x1 - x0 - 120, h: y1 - y0 - 80,
            color: landmark.kind === 'hospital' ? '#e8e4d2' : '#5a6a8a', floors: 3, landmark: landmark.kind,
          });
        } else if (landmark.kind === 'fort') {
          buildings.push({ x: x0 + 130, y: y0 + 70, w: 120, h: 120, color: '#8a7a5a', floors: 2, landmark: 'fort' });
        } else if (landmark.kind === 'marina') {
          buildings.push({ x: x0 + 40, y: y0 + 30, w: 150, h: 110, color: '#5a7a8a', floors: 1, landmark: 'vault' });
          for (let i = 0; i < 5; i += 1) crates.push({ x: x0 + 60 + i * 52, y: y1 - 90, w: 34, h: 34 });
        } else if (landmark.kind === 'docks') {
          for (let i = 0; i < 6; i += 1) crates.push({ x: x0 + 40 + (i % 3) * 90, y: y0 + 40 + Math.floor(i / 3) * 90, w: 40, h: 40 });
        } else if (landmark.kind === 'hideout') {
          buildings.push({ x: x0 + 90, y: y0 + 60, w: 170, h: 130, color: '#6a5a4a', floors: 1, landmark: 'hideout' });
        }
        continue;
      }
      if (chance(random, 0.13)) {
        const park = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees: [] };
        const treeCount = intRange(random, 7, 14);
        for (let i = 0; i < treeCount; i += 1) {
          park.trees.push({ x: range(random, x0 + 24, x1 - 24), y: range(random, y0 + 24, y1 - 24), r: range(random, 12, 20) });
        }
        parks.push(park);
        continue;
      }
      const count = intRange(random, 1, 3);
      for (let n = 0; n < count; n += 1) {
        let placed = false;
        for (let attempt = 0; attempt < 7 && !placed; attempt += 1) {
          const w = range(random, 120, 250);
          const h = range(random, 100, 210);
          const b = {
            x: range(random, x0, Math.max(x0 + 1, x1 - w)),
            y: range(random, y0, Math.max(y0 + 1, y1 - h)),
            w, h,
            color: pick(random, BUILDING_HUES),
            floors: intRange(random, 1, 5),
            landmark: null,
          };
          const clash = buildings.some((other) => rectsOverlap(b, { x: other.x - 26, y: other.y - 26, w: other.w + 52, h: other.h + 52 }));
          if (!clash) {
            buildings.push(b);
            placed = true;
          }
        }
      }
    }
  }

  const intersections = [];
  for (const x of VERTICAL_XS) for (const y of HORIZONTAL_YS) intersections.push({ x, y });

  const lamps = [];
  for (const x of VERTICAL_XS) {
    for (let y = 150; y < WORLD.height; y += 300) lamps.push({ x: x + ROAD_HALF + 10, y });
  }
  for (const y of HORIZONTAL_YS) {
    for (let x = 150; x < WORLD.width; x += 300) lamps.push({ x, y: y + ROAD_HALF + 10 });
  }

  return {
    buildings, parks, landmarks, crates, intersections, lamps,
    playerSpawn: { x: 2400, y: 1875 },
    hospitalSpawn: { x: 1200, y: 1150 },
    hqSpawn: { x: 1800, y: 1600 },
    hideout: { x: 600, y: 2325 },
    docks: { x: 450, y: 3225 },
    marina: { x: 4200, y: 975 },
  };
}

/** True when the point is on a road surface (not the sidewalk). */
export function isOnRoad(city, x, y) {
  for (const vx of VERTICAL_XS) if (Math.abs(x - vx) <= ROAD_HALF) return true;
  for (const hy of HORIZONTAL_YS) if (Math.abs(y - hy) <= ROAD_HALF) return true;
  return false;
}

/** True when the point is sand or water along the map edges. */
export function isBeach(city, x, y) {
  return x >= BEACH.eastX || y >= BEACH.southY;
}

/** True when the point cannot be driven or walked on: water, outside the map, a building or a crate. */
export function isBlocked(city, x, y) {
  if (x < 8 || y < 8 || x > WORLD.width - 8 || y > WORLD.height - 8) return true;
  if (x >= BEACH.waterX || y >= BEACH.waterY) return true;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  for (let i = 0; i < city.crates.length; i += 1) {
    const c = city.crates[i];
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return true;
  }
  return false;
}

/** The street or avenue the point is nearest to, for the HUD's street name. */
export function streetNameAt(city, x, y) {
  let bestV = Infinity;
  let bestVx = 0;
  for (const vx of VERTICAL_XS) if (Math.abs(x - vx) < bestV) { bestV = Math.abs(x - vx); bestVx = vx; }
  let bestH = Infinity;
  let bestHy = 0;
  for (const hy of HORIZONTAL_YS) if (Math.abs(y - hy) < bestH) { bestH = Math.abs(y - hy); bestHy = hy; }
  const avenue = ['Harbor Ave', 'Coral Ave', 'Palmetto Ave', 'Solara Ave', 'Bayview Ave', 'Tidepool Ave', 'Marina Ave', 'Sunset Ave'][VERTICAL_XS.indexOf(bestVx)];
  const street = ['North Shore St', 'Pelican St', 'Tradewind St', 'Plaza St', 'Juniper St', 'Lagoon St', 'Boardwalk St', 'South Beach St'][HORIZONTAL_YS.indexOf(bestHy)];
  return bestV <= bestH ? avenue : street;
}

/** The intersection nearest to a point. */
export function nearestIntersection(city, x, y) {
  let best = city.intersections[0];
  let bestD = Infinity;
  for (const node of city.intersections) {
    const d = (node.x - x) * (node.x - x) + (node.y - y) * (node.y - y);
    if (d < bestD) { bestD = d; best = node; }
  }
  return best;
}

/** A random point on a road: an intersection, then a random distance along one of its legs. */
export function randomRoadPoint(city, random) {
  const node = pick(random, city.intersections);
  const dir = intRange(random, 0, 3);
  const dist = range(random, 90, 480);
  if (dir === 0) return { x: node.x + dist, y: node.y };
  if (dir === 1) return { x: node.x - dist, y: node.y };
  if (dir === 2) return { x: node.x, y: node.y + dist };
  return { x: node.x, y: node.y - dist };
}

/** The next intersection in the direction of an angle from a point on a road. */
export function nextIntersectionAhead(city, x, y, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = null;
  let bestScore = Infinity;
  for (const node of city.intersections) {
    const rx = node.x - x;
    const ry = node.y - y;
    const dist = Math.hypot(rx, ry);
    if (dist < 40 || dist > 1400) continue;
    const dot = (rx * dx + ry * dy) / dist;
    if (dot < 0.86) continue;
    const score = dist + (1 - dot) * 600;
    if (score < bestScore) { bestScore = score; best = node; }
  }
  // Nothing ahead (a diagonal heading after a turn): the nearest junction of all,
  // so the car turns back toward the grid instead of wandering off-road.
  return best || nearestIntersection(city, x, y);
}
