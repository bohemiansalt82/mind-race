// vrc-webhid.js — read the Virtual RC (VRC) USB dongle from a browser game.
//
// The dongle (VID 0x07C0 / PID 0x1125) is a standard HID joystick. Chrome and
// Edge can open it directly with the WebHID API — no native app, no driver, no
// DriverKit. This module connects, decodes the channels, and exposes them.
//
// Requires a secure context (https:// or http://localhost) and a Chromium
// browser. WebHID is NOT available in Safari or Firefox.
//
// Usage in your game:
//
//   import { connectVRC, vrc } from './vrc-webhid.js';
//   button.onclick = () => connectVRC();          // must be a user gesture
//   function loop() {
//     // poll the latest values every frame:
//     const steering = vrc.norm.x;   // -1..1
//     const throttle = vrc.norm.y;   // -1..1
//     requestAnimationFrame(loop);
//   }
//   // or listen for updates:
//   window.addEventListener('vrc-channels', (e) => console.log(e.detail));

export const VID = 0x07c0;
export const PID = 0x1125;
export const AXIS_MAX = 2047;

// Latest decoded state. Read this every frame from your game loop.
// Also published as window.vrc for non-module / console use.
export const vrc = {
  connected: false,
  raw: { x: 0, y: 0, z: 0, buttons: 0 },
  norm: { x: 0, y: 0, z: 0 }, // each axis mapped to -1..1
  unit: { x: 0, y: 0, z: 0 }, // each axis mapped to 0..1
  buttons: [false, false],
  buttons64: [], // interface #1: up to 64 buttons
  updatedAt: 0,
};
if (typeof window !== 'undefined') window.vrc = vrc;

function emit(name, detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

// Decode interface #0 (7 bytes): [X u16le][Y u16le][Z u16le][buttons].
function decodeJoystick(view) {
  const x = view.getUint16(0, true) & 0x7ff;
  const y = view.getUint16(2, true) & 0x7ff;
  const z = view.getUint16(4, true) & 0x7ff;
  const buttons = view.getUint8(6);
  vrc.raw = { x, y, z, buttons };
  vrc.unit = { x: x / AXIS_MAX, y: y / AXIS_MAX, z: z / AXIS_MAX };
  vrc.norm = {
    x: (x / AXIS_MAX) * 2 - 1,
    y: (y / AXIS_MAX) * 2 - 1,
    z: (z / AXIS_MAX) * 2 - 1,
  };
  vrc.buttons = [Boolean(buttons & 0x01), Boolean(buttons & 0x02)];
  vrc.updatedAt = performance.now();
  emit('vrc-channels', { ...vrc });
}

// Decode interface #1 (8 bytes): 64 buttons, one bit each.
function decodeButtons(view) {
  const bits = [];
  for (let byte = 0; byte < view.byteLength; byte++) {
    const v = view.getUint8(byte);
    for (let b = 0; b < 8; b++) bits.push(Boolean(v & (1 << b)));
  }
  vrc.buttons64 = bits;
  vrc.updatedAt = performance.now();
  emit('vrc-buttons', { buttons64: bits });
}

function handleInputReport(event) {
  const { data } = event; // DataView of the report payload (no report ID)
  // Interface #0 reports are 7 bytes; interface #1 (64 buttons) are 8.
  if (data.byteLength === 7) decodeJoystick(data);
  else if (data.byteLength >= 8) decodeButtons(data);
}

let openDevices = [];

// Must be called from a user gesture (click/keydown), per WebHID rules.
export async function connectVRC() {
  if (!('hid' in navigator)) {
    throw new Error('WebHID not supported. Use Chrome or Edge (not Safari/Firefox).');
  }

  // Reuse a previously granted device if present; otherwise prompt.
  let devices = (await navigator.hid.getDevices()).filter(
    (d) => d.vendorId === VID && d.productId === PID
  );
  if (devices.length === 0) {
    devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: VID, productId: PID }],
    });
  }
  if (!devices || devices.length === 0) {
    throw new Error('No VRC dongle selected.');
  }

  openDevices = [];
  for (const device of devices) {
    if (!device.opened) await device.open();
    device.addEventListener('inputreport', handleInputReport);
    openDevices.push(device);
  }
  vrc.connected = true;
  emit('vrc-connected', { devices: devices.map((d) => d.productName) });

  navigator.hid.addEventListener('disconnect', (e) => {
    if (e.device.vendorId === VID && e.device.productId === PID) {
      vrc.connected = false;
      emit('vrc-disconnected', {});
    }
  });

  return devices;
}

export async function disconnectVRC() {
  for (const device of openDevices) {
    device.removeEventListener('inputreport', handleInputReport);
    if (device.opened) await device.close();
  }
  openDevices = [];
  vrc.connected = false;
  emit('vrc-disconnected', {});
}
