// Print the VRC dongle's USB descriptor tree (endpoints, interfaces, etc.).
// This is read-only: it opens the device just long enough to dump descriptors.
import { findDongle, describeDevice } from './device.js';

const device = findDongle();
if (!device) {
  console.error('VRC dongle not found. Is it plugged in?');
  process.exit(1);
}

device.open();
console.log('Virtual RC USB dongle\n---------------------');
console.log(describeDevice(device));
device.close();
