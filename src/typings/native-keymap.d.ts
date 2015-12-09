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

}