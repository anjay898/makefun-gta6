# LOW TIDE — Solara Bay

[![make.fun gta6-01](https://img.shields.io/badge/make.fun-gta6--01-ffb03a)](https://make.fun/c/gta6-01)

An original open-world crime game that runs offline in a desktop browser from its
own static files. No Rockstar assets, names or characters — Solara Bay, Mara Velez
and every street are invented for this game.

## Play

Serve `game/` with any static server and open `game/index.html`, for example:

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

## The game

Mara Velez, a disgraced harbour pilot, comes home to Solara Bay to find her
brother — and gets pulled into a fight over the city's smuggling routes.

- **Open city** — drive and walk a 4800×3600 sun-soaked coastal city: avenues,
  parks, a beach and the marina, with day/night light and headlights after dark.
- **Traffic & pedestrians** — cars follow the road grid and brake for each other;
  pedestrians stroll the sidewalks and run from gunfire.
- **Steal cars** — walk up to any car, press **E**, pull the driver out and drive.
- **Wanted level** — crimes raise 0–5 stars; Solara Bay police cruisers chase,
  ram and shoot back. Break line of sight and stay quiet to cool off.
- **Missions & story** — three chained missions: *First Tide* (a pickup for
  Rico), *Hot Pursuit* (stop the courier van), *The Big Haul* (the marina
  warehouse heist). Cash stashes and weapon pickups are hidden around the city.
- **Combat** — fists, pistol and SMG, mouse aim, with police and pedestrians
  reacting to every shot.
- **HUD & minimap** — money, health, wanted stars, weapon and ammo, speed,
  clock, street name, objective marker and a live minimap.
- **Save** — progress autosaves; **Continue** on the title screen picks up
  where you left off (localStorage).

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot / drive (W throttle, S brake/reverse, A/D steer) |
| Shift | Sprint on foot |
| Mouse | Aim |
| Click | Shoot / punch |
| E | Steal nearest car / exit car |
| Q | Switch weapon |
| P / Esc | Pause |
| M | Mute |

## Screenshots

`?shot=start|play|chase|end&seed=1` stages a deterministic scene rendered by the
game itself (title, street driving, police chase, story complete) — see
`shots.json`.

## License

MIT — see `LICENSE`.
