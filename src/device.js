// Shared device discovery + open logic for the Virtual RC (VRC) USB dongle.
import { usb, getDeviceList } from 'usb';

// Virtual Racing Industries bv — "Virtual RC USB"
export const VID = 0x07c0; // 1984
export const PID = 0x1125; // 4389

export function findDongle() {
  return getDeviceList().find(
    (d) => d.deviceDescriptor.idVendor === VID && d.deviceDescriptor.idProduct === PID
  );
}

// Open the dongle, select its (only) configuration, and claim the first
// interface that has an interrupt/bulk IN endpoint. Returns everything a
// reader needs: { device, iface, inEndpoint, outEndpoint }.
//
// On macOS the dongle is a vendor-specific device that no kernel driver
// claims, so userspace (libusb via node-usb) can grab the interface directly.
export function openDongle() {
  const device = findDongle();
  if (!device) {
    throw new Error(
      `VRC dongle not found (looking for VID 0x${VID.toString(16)} / PID 0x${PID.toString(16)}). Is it plugged in?`
    );
  }

  device.open();

  // Ensure a configuration is active (the dongle has exactly one).
  if (!device.configDescriptor) {
    throw new Error('No configuration descriptor on device.');
  }

  let chosen = null;
  for (const iface of device.interfaces) {
    // On macOS there is usually no kernel driver to detach, but guard anyway.
    try {
      if (iface.isKernelDriverActive()) iface.detachKernelDriver();
    } catch {
      /* not supported / not needed on macOS */
    }

    const inEndpoint = iface.endpoints.find(
      (e) => e.direction === 'in' && (e.transferType === usb.LIBUSB_TRANSFER_TYPE_INTERRUPT || e.transferType === usb.LIBUSB_TRANSFER_TYPE_BULK)
    );
    const outEndpoint = iface.endpoints.find(
      (e) => e.direction === 'out' && (e.transferType === usb.LIBUSB_TRANSFER_TYPE_INTERRUPT || e.transferType === usb.LIBUSB_TRANSFER_TYPE_BULK)
    );

    if (inEndpoint) {
      iface.claim();
      chosen = { iface, inEndpoint, outEndpoint };
      break;
    }
  }

  if (!chosen) {
    device.close();
    throw new Error('No interface with a readable IN endpoint found on the dongle.');
  }

  return { device, ...chosen };
}

export function describeDevice(device) {
  const dd = device.deviceDescriptor;
  const lines = [];
  lines.push(`idVendor:  0x${dd.idVendor.toString(16).padStart(4, '0')} (${dd.idVendor})`);
  lines.push(`idProduct: 0x${dd.idProduct.toString(16).padStart(4, '0')} (${dd.idProduct})`);
  lines.push(`bcdDevice: 0x${dd.bcdDevice.toString(16)}`);
  lines.push(`class/subclass/protocol: ${dd.bDeviceClass}/${dd.bDeviceSubClass}/${dd.bDeviceProtocol}`);
  const cfg = device.configDescriptor;
  if (cfg) {
    lines.push(`config interfaces: ${cfg.bNumInterfaces}`);
    for (const ifaceAlts of cfg.interfaces) {
      for (const alt of ifaceAlts) {
        lines.push(
          `  iface #${alt.bInterfaceNumber} alt ${alt.bAlternateSetting} ` +
            `class ${alt.bInterfaceClass}/${alt.bInterfaceSubClass}/${alt.bInterfaceProtocol} ` +
            `endpoints ${alt.bNumEndpoints}`
        );
        for (const ep of alt.endpoints) {
          const dir = ep.bEndpointAddress & 0x80 ? 'IN ' : 'OUT';
          const types = ['control', 'isochronous', 'bulk', 'interrupt'];
          lines.push(
            `    ep 0x${ep.bEndpointAddress.toString(16)} ${dir} ${types[ep.bmAttributes & 0x03]} maxPacket ${ep.wMaxPacketSize}`
          );
        }
      }
    }
  }
  return lines.join('\n');
}
