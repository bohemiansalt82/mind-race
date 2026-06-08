// vrc-gamepad.js — read the Virtual RC (VRC) USB dongle through the standard
// Gamepad API, using a receiver-style calibration (neutral / throttle / left /
// right). No WebHID, no driver: Chrome exposes the dongle as a (non-standard)
// gamepad with 3 axes + 2 buttons.
//
// Get a calibration from calibrate.html (it saves to localStorage and prints a
// JSON object), then:
//
//   import { pollVRC, vrcGamepad, setCalibration } from './vrc-gamepad.js';
//   setCalibration(myCalibration);          // the object from calibrate.html
//   function update() {
//     pollVRC();
//     car.steering = vrcGamepad.steering;   // -1 (left) .. +1 (right)
//     car.throttle = vrcGamepad.throttle;   // +1 accel .. -1 brake, 0 neutral
//     requestAnimationFrame(update);
//   }
//   update();
//
// If a calibration is saved in localStorage under 'vrcCalibration', it is
// loaded automatically — so often you don't even pass one in.

const STORAGE_KEY = 'vrcCalibration';

// Default: identify the dongle, and a raw fallback if no calibration exists.
export const vrcConfig = {
  matchId: (id) => /07c0|virtual rc/i.test(id),
  deadzone: 0.04,
  // fallback axes if uncalibrated
  steerAxis: 0,
  throttleAxis: 1,
  auxAxis: 2,
};

// calibration shape (produced by calibrate.html):
//   { steerAxis, throttleAxis,
//     steer:    { center, left, right },
//     throttle: { center, full } }
let calibration = null;

export function setCalibration(cal) {
  calibration = cal;
}

export function loadSavedCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) calibration = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return calibration;
}

export function getCalibration() {
  return calibration;
}

// Auto-load on import (browser only).
if (typeof localStorage !== 'undefined') loadSavedCalibration();

export const vrcGamepad = {
  connected: false,
  calibrated: false,
  steering: 0, // -1..1
  throttle: 0, // -1..1 (0 = neutral, + = accel, - = brake)
  aux: 0,
  buttons: [false, false],
  id: null,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Map a steering axis value to -1..1 given calibrated center/left/right.
// Works regardless of axis direction or asymmetric travel.
function mapSteer(v, { center, left, right }) {
  const a = v - center;
  const dr = right - center;
  const dl = left - center;
  if (a === 0 || (dr === 0 && dl === 0)) return 0;
  if (dr !== 0 && Math.sign(a) === Math.sign(dr)) return clamp(a / dr, 0, 1);
  if (dl !== 0 && Math.sign(a) === Math.sign(dl)) return -clamp(a / dl, 0, 1);
  return 0;
}

// Map throttle to -1..1: 0 at neutral, +1 at full accel, brake goes negative.
function mapThrottle(v, { center, full }) {
  if (full === center) return 0;
  return clamp((v - center) / (full - center), -1, 1);
}

function applyDeadzone(v, dz) {
  return Math.abs(v) < dz ? 0 : v;
}

// Call once per animation frame.
export function pollVRC() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) {
    if (p && vrcConfig.matchId(p.id)) {
      gp = p;
      break;
    }
  }
  if (!gp) {
    vrcGamepad.connected = false;
    return vrcGamepad;
  }
  vrcGamepad.connected = true;
  vrcGamepad.id = gp.id;

  if (calibration) {
    vrcGamepad.calibrated = true;
    const s = mapSteer(gp.axes[calibration.steerAxis] ?? 0, calibration.steer);
    const t = mapThrottle(gp.axes[calibration.throttleAxis] ?? 0, calibration.throttle);
    vrcGamepad.steering = applyDeadzone(s, vrcConfig.deadzone);
    vrcGamepad.throttle = applyDeadzone(t, vrcConfig.deadzone);
  } else {
    // Uncalibrated raw fallback (assumes centered axes).
    vrcGamepad.calibrated = false;
    vrcGamepad.steering = applyDeadzone(gp.axes[vrcConfig.steerAxis] ?? 0, vrcConfig.deadzone);
    vrcGamepad.throttle = applyDeadzone(gp.axes[vrcConfig.throttleAxis] ?? 0, vrcConfig.deadzone);
    vrcGamepad.aux = gp.axes[vrcConfig.auxAxis] ?? 0;
  }

  vrcGamepad.buttons = (gp.buttons || []).map((b) => b.pressed);
  return vrcGamepad;
}
