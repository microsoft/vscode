/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { ScanCode, ScanCodeUtils } from '../../../base/common/keyCodes.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IKeyboardEvent } from '../../keybinding/common/keybinding.js';
import { IKeyboardMapper } from './keyboardMapper.js';

export const IKeyboardLayoutService = createDecorator<IKeyboardLayoutService>('keyboardLayoutService');

export interface IWindowsKeyMapping {
	vkey: string;
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;
}
export interface IWindowsKeyboardMapping {
	[code: string]: IWindowsKeyMapping;
}
export interface ILinuxKeyMapping {
	value: string;
	withShift: string;
	withAltGr: string;
	withShiftAltGr: string;
}
export interface ILinuxKeyboardMapping {
	[code: string]: ILinuxKeyMapping;
}
export interface IMacKeyMapping {
	value: string;
	valueIsDeadKey: boolean;
	withShift: string;
	withShiftIsDeadKey: boolean;
	withAltGr: string;
	withAltGrIsDeadKey: boolean;
	withShiftAltGr: string;
	withShiftAltGrIsDeadKey: boolean;
}
export interface IMacKeyboardMapping {
	[code: string]: IMacKeyMapping;
}

export type IMacLinuxKeyMapping = IMacKeyMapping | ILinuxKeyMapping;
export type IMacLinuxKeyboardMapping = IMacKeyboardMapping | ILinuxKeyboardMapping;
export type IKeyboardMapping = IWindowsKeyboardMapping | ILinuxKeyboardMapping | IMacKeyboardMapping;

export interface IWindowsKeyboardLayoutInfo {
	name: string;
	id: string;
	text: string;
}

export interface ILinuxKeyboardLayoutInfo {
	model: string;
	group: number;
	layout: string;
	variant: string;
	options: string;
	rules: string;
}

export interface IMacKeyboardLayoutInfo {
	id: string;
	lang: string;
	localizedName?: string;
}

export type IKeyboardLayoutInfo = (IWindowsKeyboardLayoutInfo | ILinuxKeyboardLayoutInfo | IMacKeyboardLayoutInfo) & { isUserKeyboardLayout?: boolean; isUSStandard?: true };

export interface IKeyboardLayoutService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeKeyboardLayout: Event<void>;

	getRawKeyboardMapping(): IKeyboardMapping | null;
	getCurrentKeyboardLayout(): IKeyboardLayoutInfo | null;
	getAllKeyboardLayouts(): IKeyboardLayoutInfo[];
	getKeyboardMapper(): IKeyboardMapper;
	validateCurrentKeyboardMapping(keyboardEvent: IKeyboardEvent): void;
}

export function areKeyboardLayoutsEqual(a: IKeyboardLayoutInfo | null, b: IKeyboardLayoutInfo | null): boolean {
	if (!a || !b) {
		return false;
	}

	if ((<IWindowsKeyboardLayoutInfo>a).name && (<IWindowsKeyboardLayoutInfo>b).name && (<IWindowsKeyboardLayoutInfo>a).name === (<IWindowsKeyboardLayoutInfo>b).name) {
		return true;
	}

	if ((<IMacKeyboardLayoutInfo>a).id && (<IMacKeyboardLayoutInfo>b).id && (<IMacKeyboardLayoutInfo>a).id === (<IMacKeyboardLayoutInfo>b).id) {
		return true;
	}

	if ((<ILinuxKeyboardLayoutInfo>a).model &&
		(<ILinuxKeyboardLayoutInfo>b).model &&
		(<ILinuxKeyboardLayoutInfo>a).model === (<ILinuxKeyboardLayoutInfo>b).model &&
		(<ILinuxKeyboardLayoutInfo>a).layout === (<ILinuxKeyboardLayoutInfo>b).layout
	) {
		return true;
	}

	return false;
}

export function parseKeyboardLayoutDescription(layout: IKeyboardLayoutInfo | null): { label: string; description: string } {
	if (!layout) {
		return { label: '', description: '' };
	}

	if ((<IWindowsKeyboardLayoutInfo>layout).name) {
		// windows
		const windowsLayout = <IWindowsKeyboardLayoutInfo>layout;
		return {
			label: windowsLayout.text,
			description: ''
		};
	}

	if ((<IMacKeyboardLayoutInfo>layout).id) {
		const macLayout = <IMacKeyboardLayoutInfo>layout;
		if (macLayout.localizedName) {
			return {
				label: macLayout.localizedName,
				description: ''
			};
		}

		if (/^com\.apple\.keylayout\./.test(macLayout.id)) {
			return {
				label: macLayout.id.replace(/^com\.apple\.keylayout\./, '').replace(/-/, ' '),
				description: ''
			};
		}
		if (/^.*inputmethod\./.test(macLayout.id)) {
			return {
				label: macLayout.id.replace(/^.*inputmethod\./, '').replace(/[-\.]/, ' '),
				description: `Input Method (${macLayout.lang})`
			};
		}

		return {
			label: macLayout.lang,
			description: ''
		};
	}

	const linuxLayout = <ILinuxKeyboardLayoutInfo>layout;

	return {
		label: linuxLayout.layout,
		description: ''
	};
}

export function getKeyboardLayoutId(layout: IKeyboardLayoutInfo): string {
	if ((<IWindowsKeyboardLayoutInfo>layout).name) {
		return (<IWindowsKeyboardLayoutInfo>layout).name;
	}

	if ((<IMacKeyboardLayoutInfo>layout).id) {
		return (<IMacKeyboardLayoutInfo>layout).id;
	}

	return (<ILinuxKeyboardLayoutInfo>layout).layout;
}

function windowsKeyMappingEquals(a: IWindowsKeyMapping, b: IWindowsKeyMapping): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return (
		a.vkey === b.vkey
		&& a.value === b.value
		&& a.withShift === b.withShift
		&& a.withAltGr === b.withAltGr
		&& a.withShiftAltGr === b.withShiftAltGr
	);
}

export function windowsKeyboardMappingEquals(a: IWindowsKeyboardMapping | null, b: IWindowsKeyboardMapping | null): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	for (let scanCode = 0; scanCode < ScanCode.MAX_VALUE; scanCode++) {
		const strScanCode = ScanCodeUtils.toString(scanCode);
		const aEntry = a[strScanCode];
		const bEntry = b[strScanCode];
		if (!windowsKeyMappingEquals(aEntry, bEntry)) {
			return false;
		}
	}
	return true;
}

function macLinuxKeyMappingEquals(a: IMacLinuxKeyMapping, b: IMacLinuxKeyMapping): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return (
		a.value === b.value
		&& a.withShift === b.withShift
		&& a.withAltGr === b.withAltGr
		&& a.withShiftAltGr === b.withShiftAltGr
	);
}

export function macLinuxKeyboardMappingEquals(a: IMacLinuxKeyboardMapping | null, b: IMacLinuxKeyboardMapping | null): boolean {
	if (!a && !b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	for (let scanCode = 0; scanCode < ScanCode.MAX_VALUE; scanCode++) {
		const strScanCode = ScanCodeUtils.toString(scanCode);
		const aEntry = a[strScanCode];
		const bEntry = b[strScanCode];
		if (!macLinuxKeyMappingEquals(aEntry, bEntry)) {
			return false;
		}
	}
	return true;
}
