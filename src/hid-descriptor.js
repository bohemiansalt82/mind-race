// Fetch and pretty-print the HID report descriptor for each interface.
//
// The dongle exposes two HID (class 3) interfaces. The HID *report descriptor*
// is the device telling us exactly what its input bytes mean (which usage page,
// which axes, bit sizes). Reading it beats guessing the channel layout.
import { findDongle } from './device.js';

const LIBUSB_RECIPIENT_INTERFACE = 0x01;
const LIBUSB_REQUEST_TYPE_STANDARD = 0x00;
const LIBUSB_ENDPOINT_IN = 0x80;
const GET_DESCRIPTOR = 0x06;
const HID_REPORT_DESCRIPTOR_TYPE = 0x22;

// Minimal HID report-descriptor item names for a readable dump.
const ITEM_NAMES = {
  // Main items
  0xa0: 'Collection',
  0xc0: 'End Collection',
  0x80: 'Input',
  0x90: 'Output',
  0xb0: 'Feature',
  // Global items
  0x04: 'Usage Page',
  0x14: 'Logical Minimum',
  0x24: 'Logical Maximum',
  0x34: 'Physical Minimum',
  0x44: 'Physical Maximum',
  0x54: 'Unit Exponent',
  0x64: 'Unit',
  0x74: 'Report Size',
  0x84: 'Report ID',
  0x94: 'Report Count',
  // Local items
  0x08: 'Usage',
  0x18: 'Usage Minimum',
  0x28: 'Usage Maximum',
};

const USAGE_PAGES = {
  0x01: 'Generic Desktop',
  0x02: 'Simulation Controls',
  0x09: 'Button',
  0x0c: 'Consumer',
};

function getDescriptor(device, ifaceNum, length) {
  return new Promise((resolve, reject) => {
    const bmRequestType = LIBUSB_ENDPOINT_IN | LIBUSB_REQUEST_TYPE_STANDARD | LIBUSB_RECIPIENT_INTERFACE;
    const wValue = (HID_REPORT_DESCRIPTOR_TYPE << 8) | 0x00;
    device.controlTransfer(bmRequestType, GET_DESCRIPTOR, wValue, ifaceNum, length, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

function decodeReportDescriptor(buf) {
  const out = [];
  let i = 0;
  let indent = 0;
  while (i < buf.length) {
    const prefix = buf[i];
    if (prefix === 0xfe) {
      // long item — skip
      const size = buf[i + 1];
      i += 3 + size;
      continue;
    }
    const sizeCode = prefix & 0x03;
    const dataLen = sizeCode === 3 ? 4 : sizeCode;
    const tag = prefix & 0xfc;
    let value = 0;
    for (let b = 0; b < dataLen; b++) value |= buf[i + 1 + b] << (8 * b);
    const name = ITEM_NAMES[tag] ?? `0x${tag.toString(16)}`;

    if (name === 'End Collection') indent = Math.max(0, indent - 1);
    let line = '  '.repeat(indent) + name;
    if (dataLen > 0) {
      line += ` = ${value} (0x${value.toString(16)})`;
      if (name === 'Usage Page' && USAGE_PAGES[value]) line += ` [${USAGE_PAGES[value]}]`;
    }
    out.push(line);
    if (name === 'Collection') indent += 1;

    i += 1 + dataLen;
  }
  return out.join('\n');
}

const device = findDongle();
if (!device) {
  console.error('VRC dongle not found. Is it plugged in?');
  process.exit(1);
}
device.open();

const cfg = device.configDescriptor;
for (const ifaceAlts of cfg.interfaces) {
  for (const alt of ifaceAlts) {
    const ifaceNum = alt.bInterfaceNumber;
    // The HID class descriptor (type 0x21) lives inside the interface's "extra"
    // bytes; byte offset 7..8 holds the report-descriptor length. Fall back to a
    // generous length if we can't parse it.
    let reportLen = 256;
    const extra = alt.extra;
    if (extra && extra.length >= 9 && extra[1] === 0x21) {
      reportLen = extra[7] | (extra[8] << 8);
    }
    try {
      const data = await getDescriptor(device, ifaceNum, reportLen);
      console.log(`\n===== Interface #${ifaceNum} — HID report descriptor (${data.length} bytes) =====`);
      console.log('raw:', data.toString('hex'));
      console.log('---');
      console.log(decodeReportDescriptor(data));
    } catch (err) {
      console.error(`Interface #${ifaceNum}: failed to read report descriptor:`, err.message);
    }
  }
}

device.close();
