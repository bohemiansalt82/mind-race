// vrc-gamepad.js — read the Virtual RC (VRC) USB dongle through the standard
// Gamepad API. No WebHID, no driver: Chrome already exposes the dongle as a
// (non-standard, mapping "") gamepad with 3 axes + 2 buttons.
//
// Drop this file into your game, call pollVRC() once per frame, and read
// vrcGamepad.steering / .throttle (-1..1).
//
//   import { pollVRC, vrcGamepad } from './vrc-gamepad.js';
//   function update() {
//     pollVRC();
//     car.steering = vrcGamepad.steering;   // -1 (left) .. +1 (right)
//     car.throttle = vrcGamepad.throttle;   // -1 .. +1
//     requestAnimationFrame(update);
//   }
//   update();
//
// Gamepads only appear after the first input, so move a stick / press a button
// once. (The browser also fires a 'gamepadconnected' event you can listen for.)

// ---- config — tweak these after confirming on the test page ----------------
export const vrcConfig = {
  // Identify the dongle among all connected gamepads (Chrome id contains the
  // vendor/product, e.g. "Virtual RC USB (Vendor: 07c0 Product: 1125)").
  matchId: (id) => /07c0|virtual rc/i.test(id),

  steerAxis: 0, // axis that moves when you turn the wheel
  throttleAxis: 1, // axis that moves when you pull the throttle
  auxAxis: 2, // 3rd channel (optional)

  invertSteer: false, // set true if left/right is reversed
  invertThrottle: false, // set true if forward/back is reversed

  deadzone: 0.04, // ignore tiny jitter around center

  // Some RC throttles rest at one end instead of center. If you'd rather have
  // throttle as 0..1 (rest = 0, full = 1) instead of -1..1, set this true.
  throttleUnipolar: false,
};

// ---- live state — read this every frame ------------------------------------
export const vrcGamepad = {
  connected: false,
  steering: 0, // -1..1
  throttle: 0, // -1..1  (or 0..1 if throttleUnipolar)
  aux: 0, // -1..1
  buttons: [false, false],
  id: null,
};

function applyDeadzone(v, dz) {
  return Math.abs(v) < dz ? 0 : v;
}

// Call once per animation frame. Returns vrcGamepad for convenience.
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

  const steer = applyDeadzone(gp.axes[vrcConfig.steerAxis] ?? 0, vrcConfig.deadzone);
  let throttle = applyDeadzone(gp.axes[vrcConfig.throttleAxis] ?? 0, vrcConfig.deadzone);
  const aux = gp.axes[vrcConfig.auxAxis] ?? 0;

  vrcGamepad.steering = steer * (vrcConfig.invertSteer ? -1 : 1);
  if (vrcConfig.invertThrottle) throttle = -throttle;
  vrcGamepad.throttle = vrcConfig.throttleUnipolar ? (throttle + 1) / 2 : throttle;
  vrcGamepad.aux = aux;
  vrcGamepad.buttons = (gp.buttons || []).map((b) => b.pressed);

  return vrcGamepad;
}
