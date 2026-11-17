[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun rank](https://make.fun/badge/gta6-01/anjay898/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun reward](https://make.fun/badge/gta6-01/anjay898/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# LOW TIDE — Solara Bay

An original open-world crime game for make.fun's **gta6-01** bounty ("Make GTA 6").
See the bounty at https://make.fun/bounty/gta6-01.
Vanilla JavaScript + Canvas 2D, no libraries, no network — the whole game is static
files under `game/` and plays offline in desktop Chrome.

Mara Velez came back to Solara Bay with nothing but a name to clear. Explore the
city on foot or by car, take on three jobs for her fixer Rook, and stay ahead of the
Solara Bay PD.

## What is in the game

- **A city to explore** — Solara Bay is 4800×3600: eight avenues, eight streets, a
  plaza, an old fort, harbor docks, a marina, a hospital and a police HQ, plus a beach
  and open water along the east and south edges. Day turns to night; car headlights
  and street lamps come on after dark.
- **On foot and by car** — walk, run, get in any parked car, or steal a moving one
  (the driver gets pulled out, and the police will notice).
- **Traffic and pedestrians** — cars drive the road grid, yield at intersections and
  queue behind each other; pedestrians stroll the sidewalks and run from gunfire.
- **Wanted level** — 0 to 5 stars. Police cars chase and ram, officers on foot try
  to arrest you, and roadblocks go up at three stars. Lay low and the heat fades.
- **Missions and a story** — three chained jobs for Rook: *First Tide* ($500),
  *Hot Pursuit* ($900) and *The Big Haul* ($2,000), with a vault hold-out and an
  escape in the middle.
- **Combat** — fists, pistol and SMG, with ammo, muzzle flash and enemy guards who
  shoot back. Cars explode when their health runs out.
- **HUD and minimap** — money, health, wanted stars, weapon and ammo, speed, clock,
  street name, mission objective with distance, and a live minimap.
- **Start screen and save** — New Game / Continue / How to Play, autosave to
  localStorage, and a save on pause, mission complete, death or arrest.
- **Sound** — synthesised with WebAudio: engine hum, two-tone sirens, shots,
  pickups and mission jingles. `M` mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move / drive (Shift to run) |
| Mouse | Aim (on foot) |
| Click | Shoot / punch |
| E | Enter, exit or steal a car |
| Q | Switch weapon |
| Space / Enter | Confirm (menus) |
| P / Esc | Pause |
| M | Mute |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static file server. `?shot=start|play|chase|end&seed=1`
stages a deterministic screenshot scene instead of the title screen.

## Layout

```
game/
  index.html        the page (loads src/main.js)
  src/
    config.js       tuning, names, colours, missions
    random.js       seeded generator
    city.js         the map: roads, blocks, landmarks, queries
    world.js        the simulation: player, cars, combat, pickups
    traffic.js      AI cars and pedestrians
    police.js       wanted response, pursuit, roadblocks, arrests
    missions.js     the three-job story state machine
    render.js       canvas drawing, HUD, minimap, menus
    audio.js        WebAudio sound effects
    save.js         localStorage save / load
    input.js        keyboard and pointer input
    shots.js        deterministic screenshot scenes
    main.js         boot, the fixed-step loop, screens
```

## License

MIT — see `LICENSE`. Every name, character, place and story beat is original;
nothing is taken from Rockstar Games or any other commercial game.

---
Entered on [make.fun](https://make.fun/?ref=xwewnr0f&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards
