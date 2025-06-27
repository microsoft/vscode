/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export class ThemeColor {

		/**
		 * Returns the hexadecimal representation of this theme color when resolved
		 * against the currently active color theme.
		 * 
		 * @returns A promise that resolves to the hexadecimal color string (e.g., '#FF0000' for red), 
		 * or undefined if the color cannot be resolved in the current theme.
		 */
		asHex(): Promise<string | undefined>;
	}
}