// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows Mara, the city is painted from the map data, and the HUD, the minimap and
// the menus are drawn on top. Nothing here changes the simulation.

import { CAR, PALETTE, PLAYER, VIEW, WEAPONS, WORLD } from './config.js';
import { BEACH, HORIZONTAL_YS, ROAD_HALF, VERTICAL_XS } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HELP = 'help';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

const MINIMAP = { w: 208, h: 156, pad: 14 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function nightFactor(minutes) {
  if (minutes >= 19 * 60 || minutes < 5 * 60 + 30) return 1;
  if (minutes >= 18 * 60 && minutes < 19 * 60) return (minutes - 18 * 60) / 60;
  if (minutes >= 5 * 60 + 30 && minutes < 6 * 60 + 30) return 1 - (minutes - (5 * 60 + 30)) / 60;
  return 0;
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, bold) {
    const key = `${size}:${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${'system-ui, -apple-system, "Segoe UI", sans-serif'}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawGround(city) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    context.fillStyle = PALETTE.grassDark;
    for (let gx = 0; gx < WORLD.width; gx += 240) {
      for (let gy = 0; gy < WORLD.height; gy += 240) {
        if (((gx / 240 + gy / 240) % 2) === 0) context.fillRect(gx, gy, 120, 120);
      }
    }
    context.fillStyle = PALETTE.sand;
    context.fillRect(BEACH.eastX, 0, WORLD.width - BEACH.eastX, WORLD.height);
    context.fillRect(0, BEACH.southY, WORLD.width, WORLD.height - BEACH.southY);
    context.fillStyle = PALETTE.water;
    context.fillRect(BEACH.waterX, 0, WORLD.width - BEACH.waterX, WORLD.height);
    context.fillRect(0, BEACH.waterY, WORLD.width, WORLD.height - BEACH.waterY);
    context.fillStyle = PALETTE.waterDeep;
    for (let wy = 40; wy < WORLD.height; wy += 160) {
      context.fillRect(BEACH.waterX + 18, wy, 60, 6);
      context.fillRect(BEACH.waterX + 90, wy + 80, 60, 6);
    }
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
      for (const tree of park.trees) {
        context.fillStyle = '#3d6b32';
        context.beginPath();
        context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#5d9e4a';
        context.beginPath();
        context.arc(tree.x - 3, tree.y - 3, tree.r * 0.65, 0, Math.PI * 2);
        context.fill();
      }
    }
    for (const landmark of city.landmarks) {
      if (landmark.kind === 'plaza') {
        context.fillStyle = PALETTE.plaza;
        context.fillRect(landmark.x0, landmark.y0, landmark.x1 - landmark.x0, landmark.y1 - landmark.y0);
        context.fillStyle = '#4a7a9e';
        context.beginPath();
        context.arc(landmark.x, landmark.y, 34, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#7fc4e0';
        context.beginPath();
        context.arc(landmark.x, landmark.y, 24, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawRoads() {
    context.fillStyle = PALETTE.sidewalk;
    for (const vx of VERTICAL_XS) context.fillRect(vx - ROAD_HALF - 10, 0, (ROAD_HALF + 10) * 2, WORLD.height);
    for (const hy of HORIZONTAL_YS) context.fillRect(0, hy - ROAD_HALF - 10, WORLD.width, (ROAD_HALF + 10) * 2);
    context.fillStyle = PALETTE.road;
    for (const vx of VERTICAL_XS) context.fillRect(vx - ROAD_HALF, 0, ROAD_HALF * 2, WORLD.height);
    for (const hy of HORIZONTAL_YS) context.fillRect(0, hy - ROAD_HALF, WORLD.width, ROAD_HALF * 2);
    context.fillStyle = PALETTE.lane;
    for (const vx of VERTICAL_XS) {
      for (let y = 30; y < WORLD.height; y += 64) context.fillRect(vx - 2, y, 4, 30);
    }
    for (const hy of HORIZONTAL_YS) {
      for (let x = 30; x < WORLD.width; x += 64) context.fillRect(x, hy - 2, 30, 4);
    }
  }

  function drawBuildings(city, night) {
    for (const b of city.buildings) {
      context.fillStyle = '#00000033';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.14)';
      context.fillRect(b.x, b.y, b.w, 10);
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 36));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const hash = (b.x * 31 + b.y * 17 + cx * 7 + cy * 13) % 100;
          const lit = night > 0.4 ? hash < 62 : hash < 18;
          context.fillStyle = lit ? '#ffd94d' : 'rgba(20,26,36,0.55)';
          context.fillRect(b.x + 10 + cx * ((b.w - 20) / cols), b.y + 12 + cy * ((b.h - 20) / rows), 12, 14);
        }
      }
      if (b.landmark === 'hospital') {
        context.fillStyle = '#e5534b';
        context.fillRect(b.x + b.w / 2 - 16, b.y + b.h / 2 - 5, 32, 10);
        context.fillRect(b.x + b.w / 2 - 5, b.y + b.h / 2 - 16, 10, 32);
      }
      if (b.landmark === 'fort') {
        context.fillStyle = '#5a4a3a';
        context.fillRect(b.x + b.w / 2 - 8, b.y - 26, 16, 26);
      }
    }
    for (const c of city.crates) {
      context.fillStyle = '#a87c4a';
      context.fillRect(c.x, c.y, c.w, c.h);
      context.strokeStyle = '#6a4a2a';
      context.lineWidth = 2;
      context.strokeRect(c.x, c.y, c.w, c.h);
      context.beginPath();
      context.moveTo(c.x, c.y);
      context.lineTo(c.x + c.w, c.y + c.h);
      context.stroke();
    }
  }

  function drawPickup(pk) {
    const bob = Math.sin(pk.bobT * 3) * 3;
    const y = pk.y + bob;
    if (pk.kind === 'money') {
      context.fillStyle = '#2a7a3a';
      context.fillRect(pk.x - 11, y - 7, 22, 14);
      context.fillStyle = '#f2c230';
      text('$', pk.x, y + 5, 13, '#f2c230', 'center', true);
    } else if (pk.kind === 'health') {
      context.fillStyle = '#f4f1e4';
      context.fillRect(pk.x - 11, y - 11, 22, 22);
      context.fillStyle = '#e5534b';
      context.fillRect(pk.x - 3, y - 8, 6, 16);
      context.fillRect(pk.x - 8, y - 3, 16, 6);
    } else if (pk.kind === 'pistol') {
      context.fillStyle = '#2c2f36';
      context.fillRect(pk.x - 12, y - 5, 24, 10);
      context.fillStyle = '#ffd94d';
      context.fillRect(pk.x - 12, y - 5, 6, 10);
    } else {
      context.fillStyle = '#1d3f7a';
      context.fillRect(pk.x - 13, y - 6, 26, 12);
      context.fillStyle = '#ffd94d';
      text('SMG', pk.x, y + 4, 10, '#ffd94d', 'center', true);
    }
  }

  function drawPed(ped, time) {
    const blink = ped.invuln > 0 && Math.floor(time * 10) % 2 === 0;
    if (blink) return;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(ped.x, ped.y + 10, 10, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8c39a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 5, 0, Math.PI * 2);
    context.fill();
    if (ped.kind === 'cop') {
      context.fillStyle = '#1d3f7a';
      context.fillRect(ped.x - 7, ped.y - 15, 14, 5);
    }
    if (ped.kind === 'guard') {
      context.fillStyle = '#111111';
      context.fillRect(ped.x - 7, ped.y - 15, 14, 5);
      context.strokeStyle = '#222222';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(ped.x, ped.y);
      context.lineTo(ped.x + Math.cos(ped.angle) * 20, ped.y + Math.sin(ped.angle) * 20);
      context.stroke();
    }
  }

  function drawCar(car, time, night) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 8);
    context.fill();
    context.fillStyle = '#16181d';
    context.fillRect(-CAR.length / 2 + 2, -CAR.width / 2 - 3, 12, 7);
    context.fillRect(-CAR.length / 2 + 2, CAR.width / 2 - 4, 12, 7);
    context.fillRect(CAR.length / 2 - 14, -CAR.width / 2 - 3, 12, 7);
    context.fillRect(CAR.length / 2 - 14, CAR.width / 2 - 4, 12, 7);
    context.fillStyle = car.color;
    roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 9);
    context.fill();
    context.fillStyle = 'rgba(20,28,40,0.85)';
    context.fillRect(-6, -CAR.width / 2 + 4, 16, CAR.width - 8);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(-CAR.length / 2 + 6, -CAR.width / 2 + 3, 8, CAR.width - 6);
    if (car.driver === 'police') {
      context.fillStyle = '#f4f1e4';
      context.fillRect(-14, -CAR.width / 2, 22, CAR.width);
      const flash = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#3d7bd6';
      context.fillRect(-10, -6, 12, 5);
      context.fillStyle = flash ? '#3d7bd6' : '#ff3b30';
      context.fillRect(-10, 1, 12, 5);
      context.fillStyle = '#1d3f7a';
      text('PD', 0, 5, 11, '#1d3f7a', 'center', true);
    }
    if (night > 0.4) {
      context.fillStyle = PALETTE.headlight;
      context.beginPath();
      context.moveTo(CAR.length / 2, -10);
      context.lineTo(CAR.length / 2 + 120, -34);
      context.lineTo(CAR.length / 2 + 120, 34);
      context.lineTo(CAR.length / 2, 10);
      context.closePath();
      context.fill();
      context.fillStyle = '#fff6c9';
      context.fillRect(CAR.length / 2 - 2, -11, 4, 5);
      context.fillRect(CAR.length / 2 - 2, 6, 4, 5);
    }
    context.restore();
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.invuln > 0 && Math.floor(time * 12) % 2 === 0) return;
    if (p.inCar) return;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.ellipse(p.x, p.y + 10, 12, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2a1a12';
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 4, p.y + Math.sin(p.angle) * 4, 6, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#1d1d1d';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
    context.stroke();
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(p.x, p.y, PLAYER.radius + 3, p.angle - 0.6, p.angle + 0.6);
    context.stroke();
  }

  function drawMissionMarker(state, time) {
    const m = state.mission;
    if (!m.objective) return;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    const { x, y } = m.objective;
    context.fillStyle = 'rgba(255, 217, 77, 0.13)';
    context.fillRect(x - 30, y - 260, 60, 260);
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.mission;
    const s = 16 * pulse;
    context.fillRect(-s / 2, -s / 2, s, s);
    context.restore();
    context.fillStyle = PALETTE.mission;
    context.beginPath();
    context.arc(x, y, 5, 0, Math.PI * 2);
    context.fill();
    text(m.objective.label, x, y - 42, 15, PALETTE.mission, 'center', true);
  }

  function drawWorld(world, time) {
    const state = world.state;
    const city = world.city;
    const cam = state.camera;
    const night = nightFactor(state.clock.minutes);
    const x0 = cam.x - 80;
    const y0 = cam.y - 80;
    const x1 = cam.x + VIEW.width + 80;
    const y1 = cam.y + VIEW.height + 80;
    context.save();
    context.translate(-cam.x, -cam.y);
    drawGround(city);
    drawRoads();
    drawBuildings(city, night);
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      if (pk.x < x0 || pk.x > x1 || pk.y < y0 || pk.y > y1) continue;
      drawPickup(pk);
    }
    for (const ped of state.peds) {
      if (!ped.active) continue;
      if (ped.x < x0 || ped.x > x1 || ped.y < y0 || ped.y > y1) continue;
      drawPed(ped, time);
    }
    for (const car of state.cars) {
      if (!car.active) continue;
      if (car.x < x0 || car.x > x1 || car.y < y0 || car.y > y1) continue;
      drawCar(car, time, night);
    }
    drawPlayer(state, time);
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.fillStyle = '#ffe98a';
      context.fillRect(b.x - 3, b.y - 3, 6, 6);
    }
    for (const pt of state.particles) {
      if (!pt.active) continue;
      context.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    drawMissionMarker(state, time);
    if (night > 0.05) {
      context.fillStyle = `rgba(8, 14, 38, ${0.42 * night})`;
      context.fillRect(cam.x, cam.y, VIEW.width, VIEW.height);
      for (const lamp of city.lamps) {
        if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
        context.fillStyle = 'rgba(255, 220, 130, 0.85)';
        context.beginPath();
        context.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'rgba(255, 220, 130, 0.18)';
        context.beginPath();
        context.arc(lamp.x, lamp.y, 16, 0, Math.PI * 2);
        context.fill();
      }
    } else if (state.clock.minutes >= 17 * 60 && state.clock.minutes < 19 * 60) {
      context.fillStyle = PALETTE.dusk;
      context.fillRect(cam.x, cam.y, VIEW.width, VIEW.height);
    }
    context.restore();
  }

  function drawMinimap(state) {
    const mx = VIEW.width - MINIMAP.w - MINIMAP.pad;
    const my = VIEW.height - MINIMAP.h - MINIMAP.pad;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(10, 14, 22, 0.82)';
    context.fillRect(mx - 4, my - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.strokeRect(mx - 4, my - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.save();
    context.beginPath();
    context.rect(mx, my, MINIMAP.w, MINIMAP.h);
    context.clip();
    context.fillStyle = '#2b5f7d';
    context.fillRect(mx + BEACH.waterX * sx, my, MINIMAP.w, MINIMAP.h);
    context.fillRect(mx, my + BEACH.waterY * sy, MINIMAP.w, MINIMAP.h);
    context.fillStyle = '#e3cd96';
    context.fillRect(mx + BEACH.eastX * sx, my, (WORLD.width - BEACH.eastX) * sx, MINIMAP.h);
    context.fillRect(mx, my + BEACH.southY * sy, MINIMAP.w, (WORLD.height - BEACH.southY) * sy);
    context.fillStyle = '#6f9e57';
    context.fillRect(mx, my, MINIMAP.w, MINIMAP.h);
    context.strokeStyle = '#3a3e46';
    context.lineWidth = 2;
    for (const vx of VERTICAL_XS) {
      context.beginPath();
      context.moveTo(mx + vx * sx, my);
      context.lineTo(mx + vx * sx, my + MINIMAP.h);
      context.stroke();
    }
    for (const hy of HORIZONTAL_YS) {
      context.beginPath();
      context.moveTo(mx, my + hy * sy);
      context.lineTo(mx + MINIMAP.w, my + hy * sy);
      context.stroke();
    }
    for (const car of state.cars) {
      if (!car.active) continue;
      context.fillStyle = car.driver === 'police' ? '#ff5a4e' : 'rgba(230,230,230,0.75)';
      context.fillRect(mx + car.x * sx - 1.5, my + car.y * sy - 1.5, 3, 3);
    }
    const m = state.mission;
    if (m.objective) {
      context.fillStyle = PALETTE.mission;
      context.save();
      context.translate(mx + m.objective.x * sx, my + m.objective.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    const p = state.player;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#111111';
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  function drawHud(state, ui, street) {
    const p = state.player;
    const wanted = state.wanted;
    text(`$${p.money.toLocaleString('en-US')}`, 22, 40, 30, PALETTE.gold, 'left', true);
    const mission = state.mission;
    if (mission.objective) {
      const px = p.inCar ? p.carX : p.x;
      const py = p.inCar ? p.carY : p.y;
      const dist = Math.round(Math.hypot(mission.objective.x - px, mission.objective.y - py));
      const names = ['First Tide', 'Hot Pursuit', 'The Big Haul'];
      const name = names[mission.index] || 'Free Roam';
      let line = `${name} — ${mission.objective.label} · ${dist}m`;
      if (mission.stage === 'escape') line += ` · ${Math.ceil(mission.timer)}s`;
      if (mission.stage === 'hold') line += ` · hold ${Math.ceil(mission.holdT)}s`;
      text(line, 22, 66, 16, PALETTE.text, 'left');
    } else if (mission.stage === 'done') {
      text('Story complete — free roam Solara Bay', 22, 66, 16, PALETTE.gold, 'left');
    }
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < wanted.stars ? '★' : '☆';
    text(stars, VIEW.width - 22, 40, 30, wanted.stars > 0 ? PALETTE.wanted : '#5a6270', 'right', true);
    const dayPart = nightFactor(state.clock.minutes) > 0.5 ? 'NIGHT' : 'DAY';
    text(`${clockText(state.clock.minutes)} · ${dayPart}`, VIEW.width - 22, 66, 16, PALETTE.text, 'right');
    text(street || '', VIEW.width - 22, 88, 15, PALETTE.muted, 'right');
    const hpW = 210;
    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.fillRect(22, VIEW.height - 52, hpW, 16);
    context.fillStyle = p.hp > 30 ? PALETTE.health : PALETTE.healthLow;
    context.fillRect(22, VIEW.height - 52, hpW * (p.hp / 100), 16);
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.lineWidth = 1;
    context.strokeRect(22, VIEW.height - 52, hpW, 16);
    text(`HP ${Math.ceil(p.hp)}`, 22, VIEW.height - 58, 14, PALETTE.text, 'left', true);
    const def = WEAPONS[p.weapon];
    const ammoText = p.weapon === 'fists' ? '' : ` · ${p.ammo[p.weapon]} ammo`;
    text(`${def.name}${ammoText}`, 22, VIEW.height - 20, 16, PALETTE.text, 'left');
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.carSpeed) * 0.14);
      text(`${mph} mph`, VIEW.width - MINIMAP.w - MINIMAP.pad, VIEW.height - MINIMAP.h - MINIMAP.pad - 12, 22, PALETTE.text, 'left', true);
    }
    if (state.bannerT > 0 && state.banner) {
      context.globalAlpha = clamp(state.bannerT, 0, 1);
      text(state.banner, VIEW.width / 2, 116, 20, PALETTE.mission, 'center', true);
      context.globalAlpha = 1;
    }
    if (state.player.hurtFlash > 0) {
      context.fillStyle = `rgba(229, 83, 75, ${state.player.hurtFlash * 0.35})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (state.elapsed < 16 && state.mission.index === 0 && state.mission.stage === 'goto') {
      text('WASD move · E enter / steal car · Click shoot · Q switch weapon · P pause', VIEW.width / 2, VIEW.height - 20, 14, PALETTE.muted, 'center');
    }
    if (ui.muted) text('MUTED (M)', VIEW.width / 2, 24, 13, PALETTE.muted, 'center');
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, titleColor) {
    const width = 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH + 70;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 74, 52, titleColor || PALETTE.text, 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 128 + i * lineH, 19, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 34, 20, PALETTE.gold, 'center');
  }

  function drawTitle(state, ui) {
    context.fillStyle = 'rgba(8, 12, 20, 0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    text('LOW TIDE', VIEW.width / 2, 168, 92, PALETTE.text, 'center', true);
    text('S O L A R A   B A Y', VIEW.width / 2, 214, 26, PALETTE.gold, 'center', true);
    text('Mara Velez came back to Solara Bay with nothing but a name to clear.', VIEW.width / 2, 258, 18, PALETTE.muted, 'center');
    const items = ['New Game', ui.saveExists ? 'Continue' : null, 'How to Play'].filter(Boolean);
    for (let i = 0; i < items.length; i += 1) {
      const selected = i === ui.menuIndex;
      text(`${selected ? '▶ ' : '   '}${items[i]}`, VIEW.width / 2, 330 + i * 44, 24, selected ? PALETTE.gold : PALETTE.text, 'center', selected);
    }
    text('WASD / Arrows move · E enter or steal a car · Mouse aims, click shoots · Q weapon · P pause · M mute', VIEW.width / 2, 560, 15, PALETTE.muted, 'center');
    text('An original game. No Rockstar names, art, music or places.', VIEW.width / 2, 590, 14, PALETTE.muted, 'center');
  }

  function drawHelp() {
    context.fillStyle = 'rgba(8, 12, 20, 0.72)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    drawPanel('How to Play', [
      'Move on foot with WASD or the arrow keys. Hold Shift to run.',
      'Walk up to a car and press E to get in. Press E near a moving car to steal it —',
      'the driver gets pulled out, and the police will notice.',
      'Aim with the mouse, click to shoot. Q switches between fists, pistol and SMG.',
      'Stars show your wanted level. Lose the police, or the heat fades when you lay low.',
      'Follow the yellow marker: three jobs for Rook pay $500, $900 and $2,000.',
      'Pickups: green cash, white health, pistol and SMG crates. The game saves itself.',
    ], 'Press Enter or click to go back');
  }

  function drawPaused() {
    context.fillStyle = 'rgba(8, 12, 20, 0.6)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    drawPanel('Paused', ['The city waits for you.', 'Your progress is saved.'], 'Press P to resume');
  }

  function drawOver(state) {
    context.fillStyle = 'rgba(20, 6, 6, 0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    drawPanel('WASTED', ['Mara is down. The hospital patched her up — for a fee.', `Money kept: $${state.player.money.toLocaleString('en-US')}`], 'Press Enter to get back up', '#e5534b');
  }

  function drawBusted(state) {
    context.fillStyle = 'rgba(6, 10, 26, 0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    drawPanel('BUSTED', ['Solara Bay PD took you in. They kept a cut of your cash.', `Money kept: $${state.player.money.toLocaleString('en-US')}`], 'Press Enter to walk free', '#5a8de0');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(world, screen, ui) {
    const state = world.state;
    const time = state.elapsed;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawWorld(world, time);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui, world.streetName());
    if (screen === SCREEN_HELP) drawHelp();
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state);
    else if (screen === SCREEN_BUSTED) drawBusted(state);
  }

  /** Convert a pointer position in the page to world coordinates under the camera. */
  function toWorld(clientX, clientY, camera) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    const py = (clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
    return { x: (px - view.x) / view.scale + camera.x, y: (py - view.y) / view.scale + camera.y };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, toWorld };
}
