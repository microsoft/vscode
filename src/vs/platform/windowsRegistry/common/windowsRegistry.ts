/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export enum WindowsRegistryHive {
	HKEY_CURRENT_USER,
	HKEY_CLASSES_ROOT,
	HKEY_LOCAL_MACHINE,
	HKEY_USERS,
	HKEY_CURRENT_CONFIG
}

export interface IWindowsRegistryItem {
	hive: WindowsRegistryHive;
	key: string;
	name: string;
	value: string;
	type: string;
}

export const IWindowsRegistryService = createDecorator<IWindowsRegistryService>('windowsRegistryService');

export interface IWindowsRegistryService {
	_serviceBrand: any;

	getValue(hive: WindowsRegistryHive, key: string, name: string): Promise<IWindowsRegistryItem>;
}