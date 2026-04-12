/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export async function requestUsbDevice(options) {
    const usb = navigator.usb;
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
export async function requestSerialPort(options) {
    const serial = navigator.serial;
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
export async function requestHidDevice(options) {
    const hid = navigator.hid;
    if (!hid) {
        return undefined;
    }
    const devices = await hid.requestDevice({ filters: options?.filters ?? [] });
    if (!devices.length) {
        return undefined;
    }
    const device = devices[0];
    return {
        opened: device.opened,
        vendorId: device.vendorId,
        productId: device.productId,
        productName: device.productName,
        collections: device.collections
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2aWNlQWNjZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL2RldmljZUFjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQTBDaEcsTUFBTSxDQUFDLEtBQUssVUFBVSxnQkFBZ0IsQ0FBQyxPQUFpQztJQUN2RSxNQUFNLEdBQUcsR0FBSSxTQUF1QyxDQUFDLEdBQUcsQ0FBQztJQUN6RCxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDVixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM1RSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDYixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsT0FBTztRQUNOLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztRQUMvQixjQUFjLEVBQUUsTUFBTSxDQUFDLGNBQWM7UUFDckMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxjQUFjO1FBQ3JDLGtCQUFrQixFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7UUFDN0Msa0JBQWtCLEVBQUUsTUFBTSxDQUFDLGtCQUFrQjtRQUM3QyxxQkFBcUIsRUFBRSxNQUFNLENBQUMscUJBQXFCO1FBQ25ELGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7UUFDekMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTO1FBQzNCLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztRQUMvQixZQUFZLEVBQUUsTUFBTSxDQUFDLFlBQVk7UUFDakMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxlQUFlO1FBQ3ZDLGVBQWUsRUFBRSxNQUFNLENBQUMsZUFBZTtRQUN2QyxrQkFBa0IsRUFBRSxNQUFNLENBQUMsa0JBQWtCO1FBQzdDLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUTtLQUN6QixDQUFDO0FBQ0gsQ0FBQztBQXNCRCxNQUFNLENBQUMsS0FBSyxVQUFVLGlCQUFpQixDQUFDLE9BQWlDO0lBQ3hFLE1BQU0sTUFBTSxHQUFJLFNBQTZDLENBQUMsTUFBTSxDQUFDO0lBQ3JFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNiLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzNFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNYLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDNUIsT0FBTztRQUNOLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztRQUM3QixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVk7S0FDL0IsQ0FBQztBQUNILENBQUM7QUF3QkQsTUFBTSxDQUFDLEtBQUssVUFBVSxnQkFBZ0IsQ0FBQyxPQUFpQztJQUN2RSxNQUFNLEdBQUcsR0FBSSxTQUF1QyxDQUFDLEdBQUcsQ0FBQztJQUN6RCxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDVixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQUcsTUFBTSxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM3RSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3JCLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUIsT0FBTztRQUNOLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtRQUNyQixRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVE7UUFDekIsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTO1FBQzNCLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztRQUMvQixXQUFXLEVBQUUsTUFBTSxDQUFDLFdBQVc7S0FDL0IsQ0FBQztBQUNILENBQUMifQ==