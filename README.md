# Solmara — Open-World Crime Sandbox

An original open-world crime game built for the **gta6-01 ("Make GTA 6")**
competition on make.fun (program/v1, pot $1,666). No Rockstar IP anywhere:
the city is Solmara, the protagonist is Danny Reyes, and all art, story and
sound are original.

## What it is

Explore a 10×10-block coastal city on foot and by car. Steal cars, dodge
traffic, lose the cops on a 0–5 star wanted system, punch and shoot, and run
five story missions (M1 First Wheels → M5 The Big One, a $1,500 bank job),
plus 10 hidden packages worth $50 each. Day/night cycle, live minimap, HUD,
saves in the browser, WebAudio-synthesised sound. Free roam is always open.

## How to run

No build step, no network — plain ES modules served as static files:

```sh
node serve.ts
# game/ is on http://localhost:8080 — open http://localhost:8080/ in a desktop browser
```

Or serve the `game/` folder with any static server
(`python3 -m http.server`, `npx serve game`, …) and open `index.html`.
Keyboard + mouse. Best on desktop Chrome/Edge/Firefox.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse drag | Orbit camera |
| Shift | Run / handbrake in a car |
| Space | Jump / handbrake in a car |
| E | Enter, exit or steal a car (hold E at the bank vault in M5) |
| Q | Draw / holster pistol |
| Left click | Shoot (armed) / punch (unarmed) |
| F | Punch |
| R | Flip / reset car |
| Esc / P | Pause |
| M | Mute |

## Screenshots (staged, deterministic)

Append a query to the URL; the game stages the scene and sets
`window.__shotReady` when painted:

- `?shot=start&seed=1` — title screen
- `?shot=drive&seed=1` — daytime driving through the city
- `?shot=chase&seed=1` — police chase at 3 stars, dusk
- `?shot=night&seed=1` — night neon, mission-complete moment

## Layout

- `game/index.html`, `game/style.css` — page, screens, HUD styling
- `game/src/` — `config`, `random`, `textures`, `city`, `render`, `input`,
  `player`, `vehicles`, `traffic`, `police`, `missions`, `hud`, `audio`,
  `save`, `shots`, `main` (boot + loop + glue)
- `game/vendor/three.module.js` — three.js (MIT), vendored
- `main.ts`, `serve.ts`, `vendor/makefun-game.ts` — competition starter plumbing (unmodified)

Save data lives in `localStorage` under `solmara-save-v1` (money, finished
missions, found packages, best, muted).
