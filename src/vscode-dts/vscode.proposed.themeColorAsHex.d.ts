/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ColorTheme {

		/**
		 * Returns the hexadecimal representation of the given theme color when resolved
		 * against this color theme.
		 * 
		 * @param themeColor The theme color to resolve
		 * @returns A promise that resolves to the hexadecimal color string (e.g., '#FF0000' for red), 
		 * or undefined if the color cannot be resolved in this theme.
		 */
		getHexFromThemeColor(themeColor: ThemeColor): Promise<string | undefined>;
	}
}