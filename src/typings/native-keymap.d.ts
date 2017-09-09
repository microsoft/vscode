/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'native-keymap' {

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
		withShift: string;
		withAltGr: string;
		withShiftAltGr: string;
		valueIsDeadKey: boolean;
		withShiftIsDeadKey: boolean;
		withAltGrIsDeadKey: boolean;
		withShiftAltGrIsDeadKey: boolean;
	}
	export interface IMacKeyboardMapping {
		[code: string]: IMacKeyMapping;
	}

	export type IKeyboardMapping = IWindowsKeyboardMapping | ILinuxKeyboardMapping | IMacKeyboardMapping;

	export function getKeyMap(): IKeyboardMapping;

	/* __GDPR__FRAGMENT__
	   "IKeyboardLayoutInfo" : {
		  "name" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		  "id": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		  "text": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	   }
	 */
	export interface IWindowsKeyboardLayoutInfo {
		name: string;
		id: string;
		text: string;
	}

	/* __GDPR__FRAGMENT__
	   "IKeyboardLayoutInfo" : {
		  "model" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		  "layout": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		  "variant": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		  "options": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		  "rules": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	   }
	 */
	export interface ILinuxKeyboardLayoutInfo {
		model: string;
		layout: string;
		variant: string;
		options: string;
		rules: string;
	}

	/* __GDPR__FRAGMENT__
	   "IKeyboardLayoutInfo" : {
		  "id" : { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" },
		  "lang": { "endPoint": "none", "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	   }
	 */
	export interface IMacKeyboardLayoutInfo {
		id: string;
		lang: string;
	}

	export type IKeyboardLayoutInfo = IWindowsKeyboardLayoutInfo | ILinuxKeyboardLayoutInfo | IMacKeyboardLayoutInfo;

	export function getCurrentKeyboardLayout(): IKeyboardLayoutInfo;

	export function onDidChangeKeyboardLayout(callback: () => void): void;

	export function isISOKeyboard(): boolean;
}