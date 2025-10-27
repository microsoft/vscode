/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { networkInterfaces } from 'os';
import { TernarySearchTree } from '../common/ternarySearchTree.js';
import * as uuid from '../common/uuid.js';
import { getMac } from './macAddress.js';
import { isWindows } from '../common/platform.js';

// http://www.techrepublic.com/blog/data-center/mac-address-scorecard-for-common-virtual-machine-platforms/
// VMware ESX 3, Server, Workstation, Player	00-50-56, 00-0C-29, 00-05-69
// Microsoft Hyper-V, Virtual Server, Virtual PC	00-03-FF
// Parallels Desktop, Workstation, Server, Virtuozzo	00-1C-42
// Virtual Iron 4	00-0F-4B
// Red Hat Xen	00-16-3E
// Oracle VM	00-16-3E
// XenSource	00-16-3E
// Novell Xen	00-16-3E
// Sun xVM VirtualBox	08-00-27
export const virtualMachineHint: { value(): number } = new class {

	private _virtualMachineOUIs?: TernarySearchTree<string, boolean>;
	private _value?: number;

	private _isVirtualMachineMacAddress(mac: string): boolean {
		if (!this._virtualMachineOUIs) {
			this._virtualMachineOUIs = TernarySearchTree.forStrings<boolean>();

			// dash-separated
			this._virtualMachineOUIs.set('00-50-56', true);
			this._virtualMachineOUIs.set('00-0C-29', true);
			this._virtualMachineOUIs.set('00-05-69', true);
			this._virtualMachineOUIs.set('00-03-FF', true);
			this._virtualMachineOUIs.set('00-1C-42', true);
			this._virtualMachineOUIs.set('00-16-3E', true);
			this._virtualMachineOUIs.set('08-00-27', true);

			// colon-separated
			this._virtualMachineOUIs.set('00:50:56', true);
			this._virtualMachineOUIs.set('00:0C:29', true);
			this._virtualMachineOUIs.set('00:05:69', true);
			this._virtualMachineOUIs.set('00:03:FF', true);
			this._virtualMachineOUIs.set('00:1C:42', true);
			this._virtualMachineOUIs.set('00:16:3E', true);
			this._virtualMachineOUIs.set('08:00:27', true);
		}
		return !!this._virtualMachineOUIs.findSubstr(mac);
	}

	value(): number {
		if (this._value === undefined) {
			let vmOui = 0;
			let interfaceCount = 0;

			const interfaces = networkInterfaces();
			for (const name in interfaces) {
				const networkInterface = interfaces[name];
				if (networkInterface) {
					for (const { mac, internal } of networkInterface) {
						if (!internal) {
							interfaceCount += 1;
							if (this._isVirtualMachineMacAddress(mac.toUpperCase())) {
								vmOui += 1;
							}
						}
					}
				}
			}
			this._value = interfaceCount > 0
				? vmOui / interfaceCount
				: 0;
		}

		return this._value;
	}
};

let machineId: Promise<string>;
export async function getMachineId(errorLogger: (error: Error) => void): Promise<string> {
	if (!machineId) {
		machineId = (async () => {
			const id = await getMacMachineId(errorLogger);

			return id || uuid.generateUuid(); // fallback, generate a UUID
		})();
	}

	return machineId;
}

async function getMacMachineId(errorLogger: (error: Error) => void): Promise<string | undefined> {
	try {
		const crypto = await import('crypto');
		const macAddress = getMac();
		return crypto.createHash('sha256').update(macAddress, 'utf8').digest('hex');
	} catch (err) {
		errorLogger(err);
		return undefined;
	}
}

const SQM_KEY: string = 'Software\\Microsoft\\SQMClient';
export async function getSqmMachineId(errorLogger: (error: Error) => void): Promise<string> {
	if (isWindows) {
		const Registry = await import('@vscode/windows-registry');
		try {
			return Registry.GetStringRegKey('HKEY_LOCAL_MACHINE', SQM_KEY, 'MachineId') || '';
		} catch (err) {
			errorLogger(err);
			return '';
		}
	}
	return '';
}

export async function getDevDeviceId(errorLogger: (error: Error) => void): Promise<string> {
	try {
		const deviceIdPackage = await import('@vscode/deviceid');
		const id = await deviceIdPackage.getDeviceId();
		return id;
	} catch (err) {
		errorLogger(err);
		return uuid.generateUuid();
	}
}
