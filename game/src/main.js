// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, help, play, paused, wasted and
// busted. ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_DIED, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_MENU_DOWN, ACTION_MENU_UP, ACTION_MUTE,
  ACTION_PAUSE, ACTION_WEAPON, createInput,
} from './input.js';
import {
  SCREEN_BUSTED, SCREEN_HELP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer,
} from './render.js';
import { createAudio } from './audio.js';
import { applySave, hasSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
const AUTOSAVE_EVERY = 30;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

let screen = SCREEN_TITLE;
let menuIndex = 0;
let saveExists = hasSave();
let muted = false;
let autosaveT = AUTOSAVE_EVERY;
let prevMouseDown = false;
let lastTime = performance.now();
let accumulator = 0;

function menuItems() {
  return ['New Game', saveExists ? 'Continue' : null, 'How to Play'].filter(Boolean);
}

function setScreen(next) {
  screen = next;
  if (status) {
    status.textContent = next === SCREEN_TITLE
      ? 'Low Tide, Solara Bay. Press Enter to start.'
      : next === SCREEN_PLAY ? 'Playing Low Tide.' : next;
  }
}

function selectMenu() {
  const item = menuItems()[menuIndex];
  audio.ensure();
  audio.click();
  if (item === 'New Game') {
    world.reset();
    saveGame(world);
    saveExists = true;
    setScreen(SCREEN_PLAY);
  } else if (item === 'Continue') {
    const data = loadSave();
    world.reset();
    if (data) applySave(world, data);
    setScreen(SCREEN_PLAY);
  } else if (item === 'How to Play') {
    setScreen(SCREEN_HELP);
  }
}

function handleActions(actions) {
  if (actions & ACTION_MUTE) {
    muted = !muted;
    audio.setMuted(muted);
  }
  if (screen === SCREEN_TITLE) {
    const count = menuItems().length;
    if (actions & ACTION_MENU_UP) menuIndex = (menuIndex - 1 + count) % count;
    if (actions & ACTION_MENU_DOWN) menuIndex = (menuIndex + 1) % count;
    if (actions & ACTION_CONFIRM) selectMenu();
    return;
  }
  if (screen === SCREEN_HELP) {
    if (actions & ACTION_CONFIRM) setScreen(SCREEN_TITLE);
    return;
  }
  if (screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) {
      saveGame(world);
      setScreen(SCREEN_PAUSED);
    }
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) setScreen(SCREEN_PLAY);
    return;
  }
  if (screen === SCREEN_OVER || screen === SCREEN_BUSTED) {
    if (actions & ACTION_CONFIRM) {
      world.respawn();
      saveGame(world);
      setScreen(SCREEN_PLAY);
    }
  }
}

function buildGameInput(actions) {
  const move = input.move();
  const aim = renderer.toWorld(input.mouse.x, input.mouse.y, world.state.camera);
  const firePressed = input.mouse.down && !prevMouseDown;
  prevMouseDown = input.mouse.down;
  const aimMoved = input.mouse.moved;
  input.mouse.moved = false;
  return {
    moveX: move.x,
    moveY: move.y,
    up: input.held.up,
    down: input.held.down,
    left: input.held.left,
    right: input.held.right,
    run: input.held.run,
    interact: !!(actions & ACTION_INTERACT),
    fire: input.mouse.down,
    firePressed,
    aimX: aim.x,
    aimY: aim.y,
    aimMoved,
    cycleWeapon: !!(actions & ACTION_WEAPON),
  };
}

function handleEvents(events) {
  if (!events) return;
  if (events & EVENT_SHOT) audio.shoot(world.state.player.weapon);
  if (events & EVENT_PICKUP) audio.pickup();
  if (events & EVENT_MISSION) audio.jingle();
  if (events & EVENT_CRASH) audio.thud();
  if (events & EVENT_DIED) {
    audio.thud();
    setScreen(SCREEN_OVER);
  }
  if (events & EVENT_BUSTED) {
    audio.thud();
    setScreen(SCREEN_BUSTED);
  }
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, MAX_FRAME);
  lastTime = now;
  const actions = input.takeActions();
  handleActions(actions);
  if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
    const gameInput = screen === SCREEN_PLAY ? buildGameInput(actions) : {
      moveX: 0, moveY: 0, up: false, down: false, left: false, right: false, run: false,
      interact: false, fire: false, firePressed: false, cycleWeapon: false,
    };
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      accumulator -= STEP;
      guard += 1;
      handleEvents(world.step(STEP, gameInput));
    }
    if (guard >= 8) accumulator = 0;
    const p = world.state.player;
    audio.engine(p.inCar ? Math.min(1, Math.abs(p.carSpeed) / 580) : 0, p.inCar);
    audio.siren(world.state.siren < 0 ? -1 : Math.min(1, world.state.siren / 1200));
    autosaveT -= dt;
    if (autosaveT <= 0 || world.state.savePending) {
      autosaveT = AUTOSAVE_EVERY;
      saveGame(world);
    }
  }
  renderer.draw(world, screen, { menuIndex, saveExists, muted });
  window.requestAnimationFrame(frame);
}

if (shot) {
  const staged = stageShot(shot, world);
  renderer.draw(world, staged.screen, { menuIndex: 0, saveExists, muted });
  renderer.draw(world, staged.screen, { menuIndex: 0, saveExists, muted });
  window.__shotReady = true;
} else {
  world.reset();
  setScreen(SCREEN_TITLE);
  window.requestAnimationFrame(frame);
}
