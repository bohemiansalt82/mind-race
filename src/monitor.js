// Live decoded view of the VRC dongle's channels (macOS, via HIDAPI).
//
// Usage: node src/monitor.js
import { openJoystick, decodeJoystick, AXIS_MAX } from './hid.js';

const BAR_WIDTH = 30;

let dev;
try {
  dev = openJoystick();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

function bar(value, max) {
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

function pct(value, max) {
  return ((value / max) * 100).toFixed(1).padStart(5) + '%';
}

let firstDraw = true;
function render(x, y, z, buttons) {
  const lines = [
    'VRC dongle — live channels   (Ctrl-C to stop)',
    '',
    `  CH1 / X  [${bar(x, AXIS_MAX)}] ${String(x).padStart(4)}  ${pct(x, AXIS_MAX)}`,
    `  CH2 / Y  [${bar(y, AXIS_MAX)}] ${String(y).padStart(4)}  ${pct(y, AXIS_MAX)}`,
    `  CH3 / Z  [${bar(z, AXIS_MAX)}] ${String(z).padStart(4)}  ${pct(z, AXIS_MAX)}`,
    '',
    `  Buttons  B1:${buttons & 0x01 ? '●' : '○'}  B2:${buttons & 0x02 ? '●' : '○'}`,
  ];
  if (!firstDraw) process.stdout.write(`\x1b[${lines.length}A`);
  firstDraw = false;
  process.stdout.write(lines.map((l) => '\x1b[2K' + l).join('\n') + '\n');
}

render(0, 0, 0, 0);

dev.on('data', (buf) => {
  const d = decodeJoystick(buf);
  if (!d) return;
  render(d.raw.x, d.raw.y, d.raw.z, d.raw.buttons);
});
dev.on('error', (err) => {
  console.error('\nHID error:', err.message);
  process.exit(1);
});

function shutdown() {
  try {
    dev.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
