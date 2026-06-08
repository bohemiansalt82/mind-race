// HID access for the Virtual RC (VRC) dongle, the macOS-correct way.
//
// On macOS the dongle enumerates as a standard HID joystick (usage page 1,
// usage 4), so the kernel's AppleUserHIDEventDriver owns the USB interface and
// libusb can't claim it (LIBUSB_ERROR_ACCESS). HIDAPI / node-hid opens the
// device through IOHIDManager *non-exclusively*, reading input reports
// alongside the kernel driver — which is exactly what we want.
import HID from 'node-hid';

export const VID = 0x07c0; // Virtual Racing Industries bv
export const PID = 0x1125; // Virtual RC USB

// Interface 0 = 3-axis joystick (steering / throttle / aux + 2 buttons).
// Interface 1 = 64-button report.
export const IFACE_JOYSTICK = 0;
export const IFACE_BUTTONS = 1;

export function findHidPath(iface = IFACE_JOYSTICK) {
  const matches = HID.devices().filter(
    (d) => d.vendorId === VID && d.productId === PID && d.interface === iface
  );
  if (matches.length === 0) return null;
  // An interface can surface as several usage collections sharing one path.
  return matches[0].path;
}

export function openJoystick() {
  const path = findHidPath(IFACE_JOYSTICK);
  if (!path) {
    throw new Error(
      `VRC dongle joystick interface not found (VID 0x${VID.toString(16)} / PID 0x${PID.toString(16)}). Is it plugged in?`
    );
  }
  return new HID.HID(path);
}

// Decode a 7-byte interface-0 input report into normalized channels.
//   bytes 0-1  X  0..2047   bytes 2-3  Y  0..2047   bytes 4-5  Z  0..2047
//   byte  6    buttons (bit0, bit1)
export const AXIS_MAX = 2047;

export function decodeJoystick(buf) {
  if (buf.length < 7) return null;
  const x = buf.readUInt16LE(0) & 0x7ff;
  const y = buf.readUInt16LE(2) & 0x7ff;
  const z = buf.readUInt16LE(4) & 0x7ff;
  const buttons = buf[6];
  return {
    raw: { x, y, z, buttons },
    // normalized to -1..1 (centered) and 0..1
    norm: {
      x: (x / AXIS_MAX) * 2 - 1,
      y: (y / AXIS_MAX) * 2 - 1,
      z: (z / AXIS_MAX) * 2 - 1,
    },
    buttons: [Boolean(buttons & 0x01), Boolean(buttons & 0x02)],
  };
}
