/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://wicg.github.io/webusb/

export interface UsbDeviceData {
	readonly deviceClass: number;
	readonly deviceProtocol: number;
	readonly deviceSubclass: number;
	readonly deviceVersionMajor: number;
	readonly deviceVersionMinor: number;
	readonly deviceVersionSubminor: number;
	readonly manufacturerName?: string;
	readonly productId: number;
	readonly productName?: string;
	readonly serialNumber?: string;
	readonly usbVersionMajor: number;
	readonly usbVersionMinor: number;
	readonly usbVersionSubminor: number;
	readonly vendorId: number;
}

export async function requestUsbDevice(options?: { filters?: unknown[] }): Promise<UsbDeviceData | undefined> {
	const usb = (navigator as any).usb;
	if (!usb) {
		return undefined;
	}

	const device = await usb.requestDevice({ filters: options?.filters ?? [] });
	if (!device) {
		return undefined;
	}

	return {
		deviceClass: device.deviceClass,
		deviceProtocol: device.deviceProtocol,
		deviceSubclass: device.deviceSubclass,
		deviceVersionMajor: device.deviceVersionMajor,
		deviceVersionMinor: device.deviceVersionMinor,
		deviceVersionSubminor: device.deviceVersionSubminor,
		manufacturerName: device.manufacturerName,
		productId: device.productId,
		productName: device.productName,
		serialNumber: device.serialNumber,
		usbVersionMajor: device.usbVersionMajor,
		usbVersionMinor: device.usbVersionMinor,
		usbVersionSubminor: device.usbVersionSubminor,
		vendorId: device.vendorId,
	};
}

// https://wicg.github.io/serial/

export interface SerialPortData {
	readonly usbVendorId?: number | undefined;
	readonly usbProductId?: number | undefined;
}

export async function requestSerialPort(options?: { filters?: unknown[] }): Promise<SerialPortData | undefined> {
	const serial = (navigator as any).serial;
	if (!serial) {
		return undefined;
	}

	const port = await serial.requestPort({ filters: options?.filters ?? [] });
	if (!port) {
		return undefined;
	}

	const info = port.getInfo();
	return {
		usbVendorId: info.usbVendorId,
		usbProductId: info.usbProductId
	};
}
