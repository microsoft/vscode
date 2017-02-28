/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'native-keymap' {

	export interface INativeKeyMap {
		key_code: string;
		value: string;
		withShift: string;
		withAltGr: string;
		withShiftAltGr: string;
	}

	export function getKeyMap(): INativeKeyMap[];

	export interface IWindowsKeyboardLayoutInfo {
		name: string;
		id: string;
		text: string;
	}

	export interface ILinuxKeyboardLayoutInfo {
		model: string;
		layout: string;
		variant: string;
		options: string;
		rules: string;
	}

	export interface IMacKeyboardLayoutInfo {
		id: string;
		lang: string;
	}

	export function getCurrentKeyboardLayout(): IWindowsKeyboardLayoutInfo | ILinuxKeyboardLayoutInfo | IMacKeyboardLayoutInfo;
}