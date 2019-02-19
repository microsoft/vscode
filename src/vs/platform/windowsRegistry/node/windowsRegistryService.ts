/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowsRegistryService, WindowsRegistryHive, IWindowsRegistryItem } from 'vs/platform/windowsRegistry/common/windowsRegistry';
import { isWindows } from 'vs/base/common/platform';

export class WindowsRegistryService implements IWindowsRegistryService {
	_serviceBrand: any;

	constructor() {
		if (!isWindows) {
			return;
		}
	}

	getValue(hive: WindowsRegistryHive, key: string, name: string): Promise<IWindowsRegistryItem> {
		if (!isWindows) {
			throw new Error('Can only be called on Windows.');
		}

		return new Promise<IWindowsRegistryItem>(async (resolve, reject) => {
			const Registry = await import('winreg');

			function getHive(h) {
				switch (h) {
					case WindowsRegistryHive.HKEY_CLASSES_ROOT:
						return Registry.HKCR;
					case WindowsRegistryHive.HKEY_CURRENT_CONFIG:
						return Registry.HKCC;
					case WindowsRegistryHive.HKEY_CURRENT_USER:
						return Registry.HKCU;
					case WindowsRegistryHive.HKEY_LOCAL_MACHINE:
						return Registry.HKLM;
					case WindowsRegistryHive.HKEY_USERS:
						return Registry.HKU;
					default:
						throw new Error('Invalid registry hive specified.');
				}
			}

			const reg = new Registry({
				hive: getHive(hive),
				key: key
			});

			reg.get(name, (err, res) => {
				if (err) {
					reject(err);
				} else {
					resolve({
						hive: hive,
						key: res.key,
						name: res.name,
						value: res.value,
						type: res.type
					});
				}
			});
		});
	}
}