// Solmara — every tuning number, colour and key binding in one place.
// The city is a fixed 10x10 block grid; nothing below depends on the screen size.

/** City layout: 10 blocks of 40 m, roads 12 m wide, grid step 52 m. */
export const CITY = {
  blocks: 10,
  blockSize: 40,
  roadWidth: 12,
  step: 52,
  /** Half the full city extent: roads run from -260 to +260 on both axes. */
  half: 260,
  /** Coast: sand starts at the south edge, water beyond it. */
  beachStart: 260,
  beachDepth: 44,
  waterStart: 304,
  /** Low-poly hills ring the city beyond this radius. */
  hillsStart: 300,
};

/** Building generation bounds. */
export const BUILDINGS = {
  minPerBlock: 1,
  maxPerBlock: 4,
  minHeight: 8,
  maxHeight: 60,
  /** Fraction of a block a building footprint may cover (per axis). */
  minFootprint: 0.32,
  maxFootprint: 0.62,
};

/** Fixed simulation step: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Key bindings (KeyboardEvent.code values). */
export const KEYS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  runAlt: 'ShiftRight',
  jump: 'Space',
  punch: 'KeyF',
  weapon: 'KeyQ',
  enter: 'KeyE',
  resetCar: 'KeyR',
  mute: 'KeyM',
  pause: 'KeyP',
  pauseAlt: 'Escape',
  confirm: 'Enter',
};

/** On-foot player tuning. */
export const PLAYER = {
  walkSpeed: 5,
  runSpeed: 9,
  jumpSpeed: 7,
  gravity: 22,
  radius: 0.45,
  maxHealth: 100,
  punchRange: 1.8,
  punchDamage: 25,
  punchCooldown: 0.45,
  /** Seconds a police officer must stay within bust range to bust the player. */
  bustHoldTime: 2,
  bustRange: 2,
};

/** Pistol tuning (hitscan, infinite ammo). */
export const PISTOL = {
  damage: 34,
  range: 60,
  cooldown: 0.28,
  /** How far a gunshot is heard: pedestrians flee, wanted rises. */
  noiseRadius: 45,
};

/** Wanted system. */
export const WANTED = {
  max: 5,
  /** Seconds hidden (no police within this range) before losing one star. */
  decayTime: 20,
  hiddenRange: 60,
  /** Wanted gained per offence. */
  stealSeen: 1,
  hitPedestrian: 1,
  shooting: 1,
  ramPolice: 1,
  /** Fines on bust / waste. */
  bustFine: 100,
  wasteFine: 50,
  /** Police cars on the street per wanted star (capped). */
  carsPerStar: 1,
  maxPoliceCars: 4,
  /** On-foot officers per wanted star (capped). */
  officersPerStar: 1,
  maxOfficers: 3,
};

/** Police behaviour. */
export const POLICE = {
  carTopSpeed: 34,
  carAccel: 14,
  ramDamage: 12,
  officerSpeed: 6.2,
  officerDamage: 8,
  officerHitCooldown: 0.8,
  /** Distance at which a chase is abandoned when wanted is 0. */
  giveUpRange: 120,
};

/** Traffic tuning. */
export const TRAFFIC = {
  count: 14,
  cruiseSpeed: 9,
  maxSpeed: 13,
  /** Stop if the car ahead is closer than this. */
  followGap: 7,
  /** How far ahead traffic looks for a car to follow. */
  lookAhead: 16,
};

/** Pedestrian tuning. */
export const PEDS = {
  count: 24,
  walkSpeed: 1.4,
  fleeSpeed: 4.2,
  fleeRadius: 18,
};

/** Mission rewards and timers. */
export const MISSIONS = {
  rewards: { m1: 200, m2: 350, m3: 400, m4: 500, m5: 1500 },
  m2TimeLimit: 150,
  m2Deliveries: 3,
  m5HoldTime: 3,
  packageValue: 50,
  packageCount: 10,
  startMoney: 150,
};

/** Day/night clock: game hours, 24-hour clock starting at 10:00. */
export const CLOCK = {
  startHour: 10,
  /** Game hours per real second (a full day in ~4 minutes). */
  hoursPerSecond: 0.1,
  dayStart: 6,
  duskStart: 17.5,
  nightStart: 19,
  dawnStart: 5,
};

/** Palette: daytime Solmara — warm coast, grey asphalt, pastel facades. */
export const PALETTE = {
  skyDay: '#7ec8f2',
  skyDusk: '#e88a4f',
  skyNight: '#0b1026',
  fogDay: '#a8c8dd',
  fogNight: '#0b1026',
  asphalt: '#33363b',
  asphaltLine: '#d8c95a',
  sidewalk: '#9a9a92',
  grass: '#5d9b4a',
  sand: '#e0c98f',
  water: '#2e7fb8',
  waterDeep: '#1b5a8a',
  sun: '#fff2cf',
  streetlight: '#ffd98a',
  neonPink: '#ff4fd8',
  neonCyan: '#37e6ff',
  neonYellow: '#ffe14d',
  hudText: '#eef1f5',
  hudPanel: 'rgba(12, 16, 24, 0.72)',
  health: '#3ddc5f',
  wantedStar: '#ffd23d',
};

/** Facade paint variants (base colour + trim) for canvas facades. */
export const FACADE_VARIANTS = [
  { base: '#c9a37e', trim: '#8a6b4d' },
  { base: '#7e9cc9', trim: '#4d648a' },
  { base: '#b8b0a4', trim: '#7d7468' },
  { base: '#c97e7e', trim: '#8a4d4d' },
  { base: '#8fc9a3', trim: '#4d8a68' },
  { base: '#d8c98a', trim: '#97894d' },
];

/** Neon sign texts used around the city. */
export const NEON_SIGNS = [
  { text: 'SOLMARA', color: '#ff4fd8' },
  { text: 'HOTEL', color: '#37e6ff' },
  { text: 'CASINO', color: '#ffe14d' },
  { text: 'BAR', color: '#ff4fd8' },
  { text: 'PIZZA', color: '#ffe14d' },
  { text: '24H', color: '#37e6ff' },
];

/** Save key in localStorage. */
export const SAVE_KEY = 'solmara-save-v1';

/** System font stack only — no web fonts, no network requests. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
