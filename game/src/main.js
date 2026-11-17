// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between five screens: title, play, paused, game over
// and story complete. Progress autosaves while playing.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_GAMEOVER, EVENT_MISSION_DONE, EVENT_STORY_DONE,
  createWorld, resetWorld, respawn, stepWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_WEAPON, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { applySave, clearSave, hasSave, loadSave, saveGame } from './save.js';
import { MISSION_NAMES } from './missions.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_SECONDS = 10;
const VIEW_W = 1280;
const VIEW_H = 720;
const IDLE = { mx: 0, my: 0, aimX: 0, aimY: 0, fire: false, enterPressed: false, weaponPressed: false, sprint: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { time: world.time, banner: scene.banner, hasSave: false, menuIndex: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let menuIndex = 0;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let banner = null;
  let bannerTimer = 0;
  let pendingActions = 0;

  const saved = loadSave();
  const menuItems = () => (saved ? ['new', 'continue', 'howto'] : ['new', 'howto']);

  function announce(message) {
    status.textContent = message;
  }

  function menuLabel(item) {
    if (item === 'new') return '▶  NEW GAME';
    if (item === 'continue') {
      const m = saved.missionIndex >= MISSION_NAMES.length ? 'Story complete' : MISSION_NAMES[saved.missionIndex];
      return `↻  CONTINUE — $${saved.money}  •  ${m}`;
    }
    return 'HOW TO PLAY';
  }

  function startNew() {
    clearSave();
    resetWorld(world);
    screen = SCREEN_PLAY;
    announce('Playing. Follow the yellow marker to Rico.');
  }

  function startContinue() {
    resetWorld(world);
    applySave(world, saved);
    if (saved.missionIndex >= MISSION_NAMES.length) {
      world.mission.objective = 'Story complete — Solara Bay is yours.';
    }
    screen = SCREEN_PLAY;
    announce('Continuing your game in Solara Bay.');
  }

  function chooseMenu() {
    const item = menuItems()[menuIndex];
    if (item === 'new') startNew();
    else if (item === 'continue') startContinue();
    else {
      announce('WASD to move and drive. Mouse to aim. Click to shoot or punch. E to steal or exit a car. Q to switch weapon. P to pause.');
    }
  }

  /** Convert the mouse's CSS-pixel position to world coordinates. */
  function mouseToWorld() {
    const rect = canvas.getBoundingClientRect();
    const mouse = input.mouse();
    const scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    const ox = (rect.width - VIEW_W * scale) / 2;
    const oy = (rect.height - VIEW_H * scale) / 2;
    return {
      x: world.camera.x - VIEW_W / 2 + (mouse.x - ox) / scale,
      y: world.camera.y - VIEW_H / 2 + (mouse.y - oy) / scale,
    };
  }

  function controls() {
    const move = input.movement();
    const aim = mouseToWorld();
    return {
      mx: move.mx,
      my: move.my,
      aimX: aim.x,
      aimY: aim.y,
      fire: input.mouse().down,
      enterPressed: false,
      weaponPressed: false,
      sprint: input.sprint(),
    };
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) chooseMenu();
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        respawn(world);
        screen = SCREEN_PLAY;
        announce('You wake up at the hospital. The mission restarts.');
      }
      return;
    }
    if (screen === SCREEN_STORY) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Free roam — Solara Bay is yours.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        saveGame(world);
        announce('Paused. Progress saved.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    pendingActions |= actions;
  }

  function step() {
    const c = controls();
    c.enterPressed = Boolean(pendingActions & ACTION_ENTER);
    c.weaponPressed = Boolean(pendingActions & ACTION_WEAPON);
    pendingActions = 0;
    const beforeAmmo = world.player.magAmmo;
    const beforePunch = world.player.punchCooldown;
    const events = stepWorld(world, c, STEP);
    if (world.player.magAmmo < beforeAmmo) audio.gunshot();
    if (world.player.punchCooldown > beforePunch) audio.punch();
    if (events & EVENT_MISSION_DONE) {
      banner = 'MISSION COMPLETE';
      bannerTimer = 4;
      audio.missionDone();
      saveGame(world);
    }
    if (events & EVENT_STORY_DONE) {
      screen = SCREEN_STORY;
      audio.missionDone();
      saveGame(world);
      announce('Story complete! Solara Bay is yours.');
    } else if (events & EVENT_GAMEOVER) {
      screen = SCREEN_OVER;
      audio.gameOver();
      announce(world.busted ? 'Busted!' : 'Wasted!');
    }
    if (bannerTimer > 0) {
      bannerTimer -= STEP;
      if (bannerTimer <= 0) banner = null;
    }
    saveTimer += STEP;
    if (saveTimer >= AUTOSAVE_SECONDS) {
      saveTimer = 0;
      saveGame(world);
    }
    const speed = world.player.inCar ? Math.abs(world.player.inCar.speed) : 0;
    audio.update(speed, world.wanted.stars);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else {
      if (screen === SCREEN_TITLE) {
        // Attract mode: the city lives behind the title, one step a frame.
        stepWorld(world, IDLE, STEP);
      }
      accumulator = 0;
    }
    const ui = {
      time: world.time,
      banner,
      hasSave: hasSave(),
      saveMoney: saved ? saved.money : 0,
      saveMission: saved ? (saved.missionIndex >= MISSION_NAMES.length ? 'Story complete' : MISSION_NAMES[saved.missionIndex]) : '',
      menuIndex,
      menuLabel,
    };
    renderer.draw(world, screen, ui);
  }

  // Arrow keys move the title menu; any key unlocks audio on first gesture.
  window.addEventListener('keydown', (event) => {
    audio.unlock();
    if (screen !== SCREEN_TITLE) return;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      menuIndex = (menuIndex + menuItems().length - 1) % menuItems().length;
      event.preventDefault();
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      menuIndex = (menuIndex + 1) % menuItems().length;
      event.preventDefault();
    }
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(world);
      announce('Paused.');
    }
  });

  announce('LOW TIDE — Solara Bay. Press Space or click to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
