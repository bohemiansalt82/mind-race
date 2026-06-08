# vrc-dongle

macOS CLI to connect to and read the **Virtual RC (VRC) USB dongle**
(Virtual Racing Industries bv, VID `0x07C0` / PID `0x1125`) — the dongle that
brings an RC transmitter into the VRC racing simulator.

## What we found

- macOS **does** enumerate the dongle. It is a **standard HID joystick**
  (`PrimaryUsagePage = 1`, `PrimaryUsage = 4`), so the kernel driver
  `AppleUserHIDEventDriver` claims it automatically.
- Because the kernel owns the USB interface, **libusb / node-usb cannot claim
  it** (`LIBUSB_ERROR_ACCESS`). The correct macOS path is **HIDAPI**
  (`node-hid` → `IOHIDManager`), which reads input reports **non-exclusively**,
  alongside the kernel driver.

### USB layout (from the HID report descriptors)

Interface | Usage | Report | Meaning
--------- | ----- | ------ | -------
**#0** | Generic Desktop / Joystick (1/4) | 7 bytes | 3 axes + 2 buttons
**#1** | Generic Desktop (1/0) | 8 bytes | 64 buttons

**Interface #0 report (the one you want):**

```
byte 0-1  X axis   uint16 LE, 0..2047   (CH1, e.g. steering)
byte 2-3  Y axis   uint16 LE, 0..2047   (CH2, e.g. throttle)
byte 4-5  Z axis   uint16 LE, 0..2047   (CH3, aux)
byte 6    buttons  bit0 = B1, bit1 = B2
```

## Setup

```bash
cd vrc-dongle
npm install
```

Requires Node (tested on v16) and the dongle plugged in.

## Commands

```bash
npm run monitor      # live decoded channel bars (start here)
npm run read         # raw hex dump of interface 0 reports
npm run read 1       # raw hex dump of interface 1 (64 buttons)
npm run list         # USB descriptor tree (endpoints/interfaces)  [node-usb]
npm run descriptor   # decoded HID report descriptors             [node-usb]
```

## Use it in a browser game (recommended — no native app needed)

Since the target is a browser game, the cleanest path is the **WebHID API**:
Chrome/Edge open the dongle directly by VID/PID and read its reports — the same
thing the Node CLI does, but inside the page. No driver, no DriverKit, no signing.

```bash
npm run web        # serves the demo at http://localhost:5180
```

Open <http://localhost:5180> in **Chrome or Edge** (not Safari/Firefox), click
**동글 연결**, and pick *Virtual RC USB* in the browser's device picker. The
channel bars move as you work the transmitter.

### Drop it into your game

`web/vrc-webhid.js` is a standalone ES module:

```js
import { connectVRC, vrc } from './vrc-webhid.js';

connectButton.onclick = () => connectVRC();   // must be a user gesture

function loop() {
  const steering = vrc.norm.x;   // -1 .. 1
  const throttle = vrc.norm.y;   // -1 .. 1
  const aux      = vrc.norm.z;   // -1 .. 1
  const [b1, b2] = vrc.buttons;
  requestAnimationFrame(loop);
}
loop();

// or event-driven:
window.addEventListener('vrc-channels', (e) => { /* e.detail */ });
```

WebHID needs a **secure context** (`https://` or `http://localhost`) and only
works in Chromium browsers.

## Status

- [x] Connect to the dongle and read raw reports (Node CLI, via HIDAPI)
- [x] Decode the 3 channels + buttons
- [x] Read the dongle from a browser game (WebHID module + demo page)

### If you ever need it as a *native* macOS controller instead

The dongle already appears to macOS as a generic HID **joystick** (usage 4), but
many native macOS games only see controllers through Apple's **GameController**
framework (MFi/Xbox/PlayStation gamepads), not generic HID joysticks. Options
then would be: map to keyboard/mouse (driver-free), or build a signed DriverKit
virtual-gamepad system extension (Apple Developer account + notarization). Not
needed for a browser game.
