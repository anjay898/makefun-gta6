// The renderer: one canvas, top-down. It paints the city (beach, parks, roads, blocks
// of sun-soaked buildings), every car, pedestrian and bullet, the mission marker and
// its beacon, day/night light with headlights, and the whole HUD — money, health,
// wanted stars, weapon, speed, objective, feed, clock and minimap — plus the title,
// pause, game-over and story-complete screens.

import { CAR, FONT, PALETTE, ROADS, WEAPONS, WORLD } from './config.js';
import { clamp, lerp } from './random.js';
import { LANDMARKS, streetNameAt } from './city.js';
import { nightFactor } from './world.js';
import { MISSION_NAMES } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_STORY = 'story';

const VIEW_W = 1280;
const VIEW_H = 720;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }

  function viewTransform() {
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    const ox = (canvas.width - VIEW_W * scale) / 2;
    const oy = (canvas.height - VIEW_H * scale) / 2;
    return { scale, ox, oy };
  }

  function worldToScreen(camera, sx, sy) {
    const t = viewTransform();
    const vx = sx - (camera.x - VIEW_W / 2);
    const vy = sy - (camera.y - VIEW_H / 2);
    return { x: t.ox + vx * t.scale, y: t.oy + vy * t.scale, scale: t.scale };
  }

  function drawBuilding(b, camera, t, night) {
    const x = t.ox + (b.x - (camera.x - VIEW_W / 2)) * t.scale;
    const y = t.oy + (b.y - (camera.y - VIEW_H / 2)) * t.scale;
    const w = b.w * t.scale;
    const h = b.h * t.scale;
    if (x + w < 0 || y + h < 0 || x > canvas.width || y > canvas.height) return;
    ctx.fillStyle = b.wall;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(x + 3 * t.scale, y + 3 * t.scale, w - 6 * t.scale, h - 6 * t.scale);
    // Windows: a grid of small lit-or-dark panes.
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const lit = night > 0.4 && ((i * 7 + j * 13 + b.x) % 3 === 0);
        ctx.fillStyle = lit ? '#ffd76a' : 'rgba(20, 30, 40, 0.55)';
        ctx.fillRect(x + 8 * t.scale + i * ((w - 16 * t.scale) / cols), y + 8 * t.scale + j * ((h - 16 * t.scale) / rows), 7 * t.scale, 9 * t.scale);
      }
    }
  }

  function drawCar(car, camera, t, night, time) {
    const p = worldToScreen(camera, car.x, car.y);
    const s = t.scale;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(car.angle);
    // Headlight cones at night.
    if (night > 0.3 && car.kind !== 'wreck') {
      ctx.fillStyle = `rgba(255, 240, 170, ${0.14 * night})`;
      ctx.beginPath();
      ctx.moveTo(CAR.length / 2 * s, -10 * s);
      ctx.lineTo((CAR.length / 2 + 130) * s, -42 * s);
      ctx.lineTo((CAR.length / 2 + 130) * s, 42 * s);
      ctx.lineTo(CAR.length / 2 * s, 10 * s);
      ctx.closePath();
      ctx.fill();
    }
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect((-CAR.length / 2 + 3) * s, (-CAR.width / 2 + 3) * s, CAR.length * s, CAR.width * s);
    // Body.
    ctx.fillStyle = car.kind === 'wreck' ? '#3a3a3a' : car.color;
    roundRect(ctx, (-CAR.length / 2) * s, (-CAR.width / 2) * s, CAR.length * s, CAR.width * s, 7 * s);
    ctx.fill();
    // Windshield + rear window.
    ctx.fillStyle = 'rgba(20, 40, 60, 0.85)';
    ctx.fillRect((CAR.length * 0.12) * s, (-CAR.width / 2 + 3) * s, 12 * s, (CAR.width - 6) * s);
    ctx.fillRect((-CAR.length * 0.32) * s, (-CAR.width / 2 + 3) * s, 9 * s, (CAR.width - 6) * s);
    // Wheels.
    ctx.fillStyle = '#111111';
    const wy = (CAR.width / 2 - 1) * s;
    ctx.fillRect((-CAR.length * 0.32) * s, -wy - 3 * s, 12 * s, 5 * s);
    ctx.fillRect((-CAR.length * 0.32) * s, wy - 2 * s, 12 * s, 5 * s);
    ctx.fillRect((CAR.length * 0.28) * s, -wy - 3 * s, 12 * s, 5 * s);
    ctx.fillRect((CAR.length * 0.28) * s, wy - 2 * s, 12 * s, 5 * s);
    // Police light bar, flashing.
    if (car.kind === 'police') {
      const phase = Math.floor(time * 6) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-4 * s, (-CAR.width / 2 + 2) * s, 8 * s, 6 * s);
      ctx.fillStyle = phase ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-4 * s, (CAR.width / 2 - 8) * s, 8 * s, 6 * s);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${9 * s}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3 * s);
    }
    if (car.kind === 'mission') {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${9 * s}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('COURIER', 0, 3 * s);
    }
    // Smoke when damaged.
    if (car.health < 45 && car.kind !== 'wreck') {
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc((-CAR.length / 2) * s, 0, (6 + Math.sin(time * 9) * 2) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(ped, camera, t, time) {
    const p = worldToScreen(camera, ped.x, ped.y);
    const s = t.scale;
    if (p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) return;
    if (ped.dead) {
      ctx.fillStyle = 'rgba(120, 30, 30, 0.8)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 12 * s, 7 * s, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const bob = Math.sin(time * 10 + ped.id) * 1.5 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4 * s, 9 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(ped.angle) * 3 * s, p.y + Math.sin(ped.angle) * 3 * s + bob, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(world, camera, t, time) {
    const p = world.player;
    if (p.inCar) return;
    const s = t.scale;
    const pos = worldToScreen(camera, p.x, p.y);
    if (p.invulnerable > 0 && Math.floor(time * 10) % 2 === 0) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 5 * s, 11 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 12 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b30';
    ctx.beginPath();
    ctx.arc(4 * s, 0, 6 * s, 0, Math.PI * 2);
    ctx.fill();
    // Direction tick.
    ctx.fillStyle = PALETTE.player;
    ctx.fillRect(10 * s, -2 * s, 10 * s, 4 * s);
    ctx.restore();
    // Aim line when armed.
    if (p.weapon !== 'fists') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + Math.cos(p.angle) * 46 * s, pos.y + Math.sin(p.angle) * 46 * s);
      ctx.stroke();
    }
  }

  function drawWorld(world, camera, t, time) {
    const night = nightFactor(world);
    const camX = camera.x - VIEW_W / 2;
    const camY = camera.y - VIEW_H / 2;
    // Ground.
    ctx.fillStyle = night > 0.5 ? '#2e4a2e' : PALETTE.grass;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Beach + water at the south edge.
    const beach = worldToScreen(camera, 0, WORLD.height - 260);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, beach.y, canvas.width, (260) * t.scale);
    const water = worldToScreen(camera, 0, WORLD.height - 60);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, water.y, canvas.width, 60 * t.scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2 * t.scale;
    for (let i = 0; i < 6; i += 1) {
      const wy = water.y + 12 * t.scale + i * 8 * t.scale;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.lineTo(x, wy + Math.sin(x * 0.02 + time * 2 + i) * 2 * t.scale);
      }
      ctx.stroke();
    }
    // Parks.
    for (const park of world.city.parks) {
      const p0 = worldToScreen(camera, park.x, park.y);
      ctx.fillStyle = night > 0.5 ? '#2a4a28' : PALETTE.park;
      ctx.fillRect(p0.x, p0.y, park.w * t.scale, park.h * t.scale);
    }
    // Roads: asphalt + sidewalks + centre dashes.
    ctx.fillStyle = PALETTE.road;
    for (const vx of ROADS.vertical) {
      const p0 = worldToScreen(camera, vx - ROADS.width / 2, 0);
      ctx.fillRect(p0.x, 0, ROADS.width * t.scale, canvas.height);
    }
    for (const hy of ROADS.horizontal) {
      const p0 = worldToScreen(camera, 0, hy - ROADS.width / 2);
      ctx.fillRect(0, p0.y, canvas.width, ROADS.width * t.scale);
    }
    ctx.fillStyle = PALETTE.sidewalk;
    for (const vx of ROADS.vertical) {
      const p0 = worldToScreen(camera, vx - ROADS.width / 2 - 10, 0);
      ctx.fillRect(p0.x, 0, 10 * t.scale, canvas.height);
      const p1 = worldToScreen(camera, vx + ROADS.width / 2, 0);
      ctx.fillRect(p1.x, 0, 10 * t.scale, canvas.height);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    ctx.setLineDash([18 * t.scale, 16 * t.scale]);
    ctx.lineWidth = 3 * t.scale;
    for (const vx of ROADS.vertical) {
      const p0 = worldToScreen(camera, vx, 0);
      ctx.beginPath();
      ctx.moveTo(p0.x, 0);
      ctx.lineTo(p0.x, canvas.height);
      ctx.stroke();
    }
    for (const hy of ROADS.horizontal) {
      const p0 = worldToScreen(camera, 0, hy);
      ctx.beginPath();
      ctx.moveTo(0, p0.y);
      ctx.lineTo(canvas.width, p0.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Trees.
    for (const tree of world.city.trees) {
      const p0 = worldToScreen(camera, tree.x, tree.y);
      if (p0.x < -20 || p0.y < -20 || p0.x > canvas.width + 20 || p0.y > canvas.height + 20) continue;
      ctx.fillStyle = night > 0.5 ? '#1f3d1f' : '#3d7a34';
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, tree.r * t.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    // Buildings.
    for (const b of world.city.buildings) drawBuilding(b, camera, t, night);
    for (const b of world.city.landmarkBuildings) drawBuilding(b, camera, t, night);
    // Landmark labels.
    ctx.font = `bold ${13 * t.scale}px ${FONT}`;
    ctx.textAlign = 'center';
    for (const key of Object.keys(LANDMARKS)) {
      const lm = LANDMARKS[key];
      const p0 = worldToScreen(camera, lm.x, lm.y - 70);
      if (p0.x < 0 || p0.y < 0 || p0.x > canvas.width || p0.y > canvas.height) continue;
      ctx.fillStyle = 'rgba(16, 24, 32, 0.75)';
      const w = ctx.measureText(lm.label).width + 16 * t.scale;
      roundRect(ctx, p0.x - w / 2, p0.y - 11 * t.scale, w, 22 * t.scale, 5 * t.scale);
      ctx.fill();
      ctx.fillStyle = '#f4f1e8';
      ctx.fillText(lm.label, p0.x, p0.y + 4 * t.scale);
    }
    // Cash stashes + pickups.
    for (const pk of world.pickups) {
      const p0 = worldToScreen(camera, pk.x, pk.y);
      if (p0.x < -20 || p0.y < -20 || p0.x > canvas.width + 20 || p0.y > canvas.height + 20) continue;
      const pulse = 1 + Math.sin(time * 5) * 0.15;
      ctx.fillStyle = pk.kind === 'cash' ? '#6fce62' : pk.kind === 'ammo' ? '#e8c33d' : pk.kind === 'health' ? '#ffffff' : '#ffb03a';
      ctx.save();
      ctx.translate(p0.x, p0.y);
      ctx.scale(pulse, pulse);
      ctx.fillRect(-9 * t.scale, -9 * t.scale, 18 * t.scale, 18 * t.scale);
      ctx.fillStyle = '#101820';
      ctx.font = `bold ${11 * t.scale}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'cash' ? '$' : pk.kind === 'ammo' ? 'A' : pk.kind === 'health' ? '+' : 'W', 0, 4 * t.scale);
      ctx.restore();
    }
    // Mission crates.
    const m = world.mission;
    if (m && m.crates) {
      for (const crate of m.crates) {
        if (crate.taken) continue;
        const p0 = worldToScreen(camera, crate.x, crate.y);
        ctx.fillStyle = '#8a5a2e';
        ctx.fillRect(p0.x - 11 * t.scale, p0.y - 11 * t.scale, 22 * t.scale, 22 * t.scale);
        ctx.strokeStyle = '#e8c33d';
        ctx.lineWidth = 2 * t.scale;
        ctx.strokeRect(p0.x - 11 * t.scale, p0.y - 11 * t.scale, 22 * t.scale, 22 * t.scale);
      }
      if (m.holdTarget) {
        const p0 = worldToScreen(camera, m.holdTarget.x, m.holdTarget.y - 26);
        ctx.fillStyle = 'rgba(16,24,32,0.8)';
        ctx.fillRect(p0.x - 30 * t.scale, p0.y - 9 * t.scale, 60 * t.scale, 8 * t.scale);
        ctx.fillStyle = '#6fce62';
        ctx.fillRect(p0.x - 30 * t.scale, p0.y - 9 * t.scale, 60 * t.scale * clamp(m.holdTimer / 2, 0, 1), 8 * t.scale);
      }
    }
    // Cars, peds, player, bullets, particles.
    for (const car of world.cars) drawCar(car, camera, t, night, time);
    for (const ped of world.peds) drawPed(ped, camera, t, time);
    drawPlayer(world, camera, t, time);
    for (const b of world.bullets) {
      const p0 = worldToScreen(camera, b.x, b.y);
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, 3 * t.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pt of world.particles) {
      const p0 = worldToScreen(camera, pt.x, pt.y);
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, pt.size * t.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Mission marker: pulsing diamond + light beacon.
    if (m && m.marker) {
      const p0 = worldToScreen(camera, m.marker.x, m.marker.y);
      const pulse = 1 + Math.sin(time * 4) * 0.2;
      if (p0.x >= -40 && p0.y >= -40 && p0.x <= canvas.width + 40 && p0.y <= canvas.height + 40) {
        ctx.fillStyle = 'rgba(255, 176, 58, 0.18)';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - 90 * t.scale);
        ctx.lineTo(p0.x + 22 * t.scale, p0.y);
        ctx.lineTo(p0.x - 22 * t.scale, p0.y);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.translate(p0.x, p0.y);
        ctx.rotate(Math.PI / 4);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ffb03a';
        ctx.fillRect(-10 * t.scale, -10 * t.scale, 20 * t.scale, 20 * t.scale);
        ctx.strokeStyle = '#101820';
        ctx.lineWidth = 2 * t.scale;
        ctx.strokeRect(-10 * t.scale, -10 * t.scale, 20 * t.scale, 20 * t.scale);
        ctx.restore();
      } else {
        // Off-screen: an edge arrow pointing at the objective.
        const dx = m.marker.x - camera.x;
        const dy = m.marker.y - camera.y;
        const a = Math.atan2(dy, dx);
        const ex = canvas.width / 2 + Math.cos(a) * (Math.min(canvas.width, canvas.height) / 2 - 40);
        const ey = canvas.height / 2 + Math.sin(a) * (Math.min(canvas.width, canvas.height) / 2 - 40);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = '#ffb03a';
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffb03a';
        ctx.font = `bold 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(Math.hypot(dx, dy))}m`, ex, ey + 28);
      }
    }
    // Night overlay.
    if (night > 0) {
      ctx.fillStyle = `rgba(8, 16, 40, ${0.42 * night})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Hurt flash.
    if (world.player.hurtFlash > 0) {
      ctx.fillStyle = `rgba(229, 83, 75, ${world.player.hurtFlash * 0.5})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawMinimap(world) {
    const mw = 210;
    const mh = 158;
    const mx = canvas.width - mw - 16;
    const my = 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = 'rgba(16, 24, 32, 0.82)';
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, mx, my, mw, mh, 4);
    ctx.clip();
    ctx.fillStyle = '#2e4a2e';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(mx, my + (WORLD.height - 260) * sy, mw, 260 * sy);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(mx, my + (WORLD.height - 60) * sy, mw, 60 * sy);
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = 3;
    for (const vx of ROADS.vertical) {
      ctx.beginPath();
      ctx.moveTo(mx + vx * sx, my);
      ctx.lineTo(mx + vx * sx, my + mh);
      ctx.stroke();
    }
    for (const hy of ROADS.horizontal) {
      ctx.beginPath();
      ctx.moveTo(mx, my + hy * sy);
      ctx.lineTo(mx + mw, my + hy * sy);
      ctx.stroke();
    }
    const p = world.player;
    if (world.mission && world.mission.marker) {
      ctx.fillStyle = '#ffb03a';
      ctx.beginPath();
      ctx.arc(mx + world.mission.marker.x * sx, my + world.mission.marker.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of world.cars) {
      if (car.kind !== 'police') continue;
      ctx.fillStyle = '#ff2e2e';
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = '#f4f1e8';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SOLARA BAY', mx, my + mh + 20);
  }

  function drawHud(world, ui) {
    const p = world.player;
    const s = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    ctx.textAlign = 'left';
    // Money + health, top left.
    ctx.fillStyle = 'rgba(16, 24, 32, 0.82)';
    roundRect(ctx, 14, 14, 250 * s, 64 * s, 8);
    ctx.fill();
    ctx.fillStyle = '#6fce62';
    ctx.font = `bold ${24 * s}px ${FONT}`;
    ctx.fillText(`$${p.money.toLocaleString('en-US')}`, 26 * s, 40 * s);
    ctx.fillStyle = '#e5534b';
    ctx.fillRect(26 * s, 50 * s, 150 * s, 10 * s);
    ctx.fillStyle = '#6fce62';
    ctx.fillRect(26 * s, 50 * s, 150 * s * clamp(p.health / 100, 0, 1), 10 * s);
    ctx.fillStyle = '#f4f1e8';
    ctx.font = `${12 * s}px ${FONT}`;
    ctx.fillText(`HP ${Math.ceil(p.health)}`, 182 * s, 59 * s);
    // Wanted stars, top centre.
    const stars = world.wanted.stars;
    ctx.fillStyle = 'rgba(16, 24, 32, 0.82)';
    roundRect(ctx, canvas.width / 2 - 95 * s, 14, 190 * s, 40 * s, 8);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      drawStar(canvas.width / 2 - 70 * s + i * 35 * s, 34, 12 * s, i < stars ? '#ffd76a' : 'rgba(255,255,255,0.25)');
    }
    // Clock + street, under the stars.
    const hh = Math.floor(world.clock);
    const mm = Math.floor((world.clock - hh) * 60);
    ctx.fillStyle = '#f4f1e8';
    ctx.font = `${13 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  •  ${streetNameAt(p.x, p.y)}`, canvas.width / 2, 74 * s);
    // Objective, under money.
    if (world.mission && world.mission.objective) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(16, 24, 32, 0.82)';
      const text = world.mission.objective;
      ctx.font = `${13 * s}px ${FONT}`;
      const w = Math.min(canvas.width - 40, ctx.measureText(text).width + 24 * s);
      roundRect(ctx, 14, 86 * s, w, 30 * s, 8);
      ctx.fill();
      ctx.fillStyle = '#ffb03a';
      ctx.fillText(`◆ ${text}`, 26 * s, 106 * s);
    }
    // Weapon + ammo, bottom left.
    const def = WEAPONS[p.weapon];
    ctx.fillStyle = 'rgba(16, 24, 32, 0.82)';
    roundRect(ctx, 14, canvas.height - 54 * s, 210 * s, 40 * s, 8);
    ctx.fill();
    ctx.fillStyle = '#f4f1e8';
    ctx.font = `bold ${15 * s}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(def.name, 26 * s, canvas.height - 28 * s);
    if (p.weapon !== 'fists') {
      ctx.fillStyle = '#a8b0b8';
      ctx.font = `${13 * s}px ${FONT}`;
      ctx.fillText(`${p.magAmmo} / ${p.ammo}`, 150 * s, canvas.height - 28 * s);
    }
    // Speed, bottom right.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.32);
      ctx.fillStyle = 'rgba(16, 24, 32, 0.82)';
      roundRect(ctx, canvas.width - 150 * s, canvas.height - 54 * s, 136 * s, 40 * s, 8);
      ctx.fill();
      ctx.fillStyle = '#f4f1e8';
      ctx.font = `bold ${22 * s}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${kmh}`, canvas.width - 52 * s, canvas.height - 26 * s);
      ctx.font = `${12 * s}px ${FONT}`;
      ctx.fillStyle = '#a8b0b8';
      ctx.fillText('km/h', canvas.width - 24 * s, canvas.height - 26 * s);
      ctx.textAlign = 'left';
    }
    // Feed messages, bottom centre-left.
    ctx.textAlign = 'left';
    ctx.font = `${13 * s}px ${FONT}`;
    world.feed.forEach((line, i) => {
      const alpha = 1 - i * 0.16;
      ctx.fillStyle = `rgba(244, 241, 232, ${alpha})`;
      ctx.fillText(line, 26 * s, canvas.height - 70 * s - i * 18 * s);
    });
    // Mission banner.
    if (ui.banner) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(16, 24, 32, 0.88)';
      const bw = Math.min(560, canvas.width - 80);
      roundRect(ctx, canvas.width / 2 - bw / 2, 110, bw, 54, 10);
      ctx.fill();
      ctx.fillStyle = '#ffb03a';
      ctx.font = `bold ${24 * s}px ${FONT}`;
      ctx.fillText(ui.banner, canvas.width / 2, 146);
    }
    // Controls hint.
    ctx.fillStyle = 'rgba(244, 241, 232, 0.55)';
    ctx.font = `${12 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('WASD move/drive  •  Mouse aim  •  Click shoot/punch  •  E steal/exit car  •  Q weapon  •  P pause  •  M mute', canvas.width / 2, canvas.height - 10);
    drawMinimap(world);
  }

  function drawStar(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawTitle(world, ui) {
    const t = viewTransform();
    drawWorld(world, world.camera, t, ui.time);
    ctx.fillStyle = 'rgba(10, 18, 30, 0.62)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb03a';
    ctx.font = `bold ${Math.min(96, canvas.width / 9)}px ${FONT}`;
    ctx.fillText('LOW TIDE', cx, canvas.height * 0.30);
    ctx.fillStyle = '#f4f1e8';
    ctx.font = `${Math.min(30, canvas.width / 28)}px ${FONT}`;
    ctx.fillText('S O L A R A   B A Y', cx, canvas.height * 0.30 + 44);
    ctx.fillStyle = '#a8b0b8';
    ctx.font = `16px ${FONT}`;
    ctx.fillText('Mara Velez came home for her brother. The city had other plans.', cx, canvas.height * 0.30 + 76);
    const items = ui.hasSave
      ? ['▶  NEW GAME', '↻  CONTINUE — $' + ui.saveMoney + '  •  ' + ui.saveMission, 'HOW TO PLAY']
      : ['▶  NEW GAME', 'HOW TO PLAY'];
    items.forEach((item, i) => {
      const y = canvas.height * 0.52 + i * 46;
      const selected = i === ui.menuIndex;
      if (selected) {
        ctx.fillStyle = 'rgba(255, 176, 58, 0.9)';
        roundRect(ctx, cx - 210, y - 26, 420, 38, 8);
        ctx.fill();
        ctx.fillStyle = '#101820';
      } else {
        ctx.fillStyle = '#f4f1e8';
      }
      ctx.font = `bold ${20 * Math.min(1.4, canvas.width / 900)}px ${FONT}`;
      ctx.fillText(item, cx, y);
    });
    ctx.fillStyle = 'rgba(244, 241, 232, 0.75)';
    ctx.font = '14px ' + FONT;
    ctx.fillText('WASD move / drive  •  Mouse aim  •  Click shoot  •  E steal a car  •  Q switch weapon  •  P pause', cx, canvas.height * 0.52 + items.length * 46 + 18);
    ctx.fillText('Steal cars, dodge the Solara Bay police, run three story missions, and keep the tide on your side.', cx, canvas.height * 0.52 + items.length * 46 + 42);
    ctx.fillStyle = 'rgba(244, 241, 232, 0.45)';
    ctx.font = '12px ' + FONT;
    ctx.fillText('An original game — Solara Bay, Mara Velez and every street are invented for LOW TIDE.', cx, canvas.height - 22);
  }

  function drawOverlayPanel(title, lines, accent) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.fillStyle = 'rgba(10, 18, 30, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(16, 24, 32, 0.95)';
    roundRect(ctx, cx - 300, cy - 150, 600, 300, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(title, cx, cy - 96);
    ctx.fillStyle = '#f4f1e8';
    ctx.font = '17px ' + FONT;
    lines.forEach((line, i) => ctx.fillText(line, cx, cy - 52 + i * 30));
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  return {
    resize,
    draw(world, screen, ui) {
      resize();
      const t = viewTransform();
      const time = ui.time ?? 0;
      if (screen === SCREEN_TITLE) {
        drawTitle(world, ui);
        return;
      }
      drawWorld(world, world.camera, t, time);
      if (screen === SCREEN_PLAY) {
        drawHud(world, ui);
        return;
      }
      drawHud(world, ui);
      if (screen === SCREEN_PAUSED) {
        drawOverlayPanel('PAUSED', ['Press P or click to keep playing.', 'Progress autosaves as you play.'], '#ffb03a');
      } else if (screen === SCREEN_OVER) {
        drawOverlayPanel(world.busted ? 'BUSTED' : 'WASTED', [
          world.busted ? 'The Solara Bay police hauled you in.' : 'Solara Bay keeps moving without you.',
          `Money: $${world.player.money.toLocaleString('en-US')}  •  Missions done: ${world.stats.missionsDone}/3`,
          'Press Space or click to wake up at the hospital.',
        ], '#e5534b');
      } else if (screen === SCREEN_STORY) {
        drawOverlayPanel('STORY COMPLETE', [
          'Mara Velez owns the tide now. Solara Bay is yours.',
          `Money: $${world.player.money.toLocaleString('en-US')}  •  Cars stolen: ${world.stats.carsStolen}  •  Earned: $${world.stats.earned.toLocaleString('en-US')}`,
          'Press Space or click to keep exploring the city.',
        ], '#6fce62');
      }
    },
  };
}
