// Raw hex dump of the dongle's HID input reports (macOS, via HIDAPI).
//
// Usage:
//   node src/read-raw.js [interfaceNumber]   (default 0 = joystick, 1 = buttons)
//
// Prints every report; Ctrl-C to stop.
import HID from 'node-hid';
import { findHidPath } from './hid.js';

const iface = Number(process.argv[2] ?? 0);
const path = findHidPath(iface);
if (!path) {
  console.error(`VRC dongle interface #${iface} not found. Is it plugged in?`);
  process.exit(1);
}

const dev = new HID.HID(path);
console.log(`Reading interface #${iface} (${path}). Ctrl-C to stop.\n`);

dev.on('data', (buf) => {
  const hex = buf.toString('hex').replace(/(..)/g, '$1 ').trim();
  process.stdout.write(`${hex}\n`);
});
dev.on('error', (err) => {
  console.error('HID error:', err.message);
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
