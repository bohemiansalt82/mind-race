"use strict";
// Three.js scene objects
let scene, camera, renderer, clock;
let carGroup, bodyMesh, wheelMeshes = [], shadowMesh;

// game state
let track = null;
let trackName = 'circuit';
let started = false;
let raceLock = false;
let customLayout = null;
let freeLook = { on:false, drag:false, az:Math.PI, el:0.55, lx:0, ly:0 };

const W = () => window.innerWidth, H = () => window.innerHeight;

// input state
const keys = {};

// scene scale: 1 world unit = 0.1 m (decimetres), so geometry is real 1/10-scale
const UNIT = 10;
const CAR_H = 1.2;  // overall car height (world units) — for barrier sizing

// REAL 1/10-scale electric touring-car specs (SI: kg / N / m).
// Length params (a,b,wheelRadius,cgHeight) stay in WORLD units (dm).
const P = {
  klass: '1/10 4WD · 540 brushless',
  mass: 1.6,            // kg  (chassis + 2S LiPo)
  inertia: 0.022,      // kg·m²  yaw inertia (~box 360×190 mm)
  a: 1.00, b: 1.12,    // world units → CG→axle; b>a = slight front weight bias
  halfWidth: 0.7,      // world units → track width ~140 mm
  wheelRadius: 0.34,   // world units → 34 mm radius (68 mm tyre)
  cgHeight: 0.35,      // world units → 35 mm CG height
  engineForce: 15,     // N  peak drive force
  brakeForce: 30,      // N
  reverseForce: 9,     // N
  rrLong: 0.8,         // N per (m/s)  rolling resistance
  drag: 0.13,          // N per (m/s)²  aero drag
  maxRpm: 50000,       // brushless motor rpm (cosmetic)
  corneringStiffF: 16.0,
  corneringStiffR: 12.0,
  wtScale: 0.55        // weight-transfer scale
};

const SURFACE = {
  asphalt: { mu: 2.40, rr: 1.0,  driveMul:1.0,  color:0x2b2f36 },
  dirt:    { mu: 1.85, rr: 1.7,  driveMul:0.95, color:0x6e5333 },
  grass:   { mu: 1.10, rr: 4.2,  driveMul:0.75, color:0x35502c },
  curb:    { mu: 2.00, rr: 1.4,  driveMul:0.98, color:0xb33a3a }
};

// vehicle physics state
const car = {
  x:0, z:0, yaw:0,
  vx:0, vz:0,
  yawRate:0,
  rollVel:0, pitchVel:0, roll:0, pitch:0,
  steerVis:0, wheelSpin:0,
  engineRpm:0, gear:1,
  airborne:false, vy:0, y:0,
  surface:'asphalt'
};

// tunable setup (modified via UI sliders)
const setup = {
  maxSteer: 38 * Math.PI/180,
  rearGrip: 1.0,
  power: 1.0,
  susStiff: 0.5,
  drive: 'awd',
  camera: 'track',
  launchSmooth: 0.35,
  camHeight: 1.0
};

// DOM helper
const el = id => document.getElementById(id);

// HUD state
let lastDelta = 0;
let lapFlash = {lap:0, time:0, until:0};

// camera state
const camModes = ['track','full','car'];
let camLook = {x:0, y:0, z:0};

// physics loop
const physDT = 1/120;
let accum = 0;
