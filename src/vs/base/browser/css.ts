/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The only valid way to add a CSSStyleSheet to the application. Use this after importing a CSS file
 * via type-assertion.
 *
 * @param sheet
 */
export function registerStyleSheet(sheet: CSSStyleSheet) {
	if (sheet instanceof CSSStyleSheet) {
		document.adoptedStyleSheets.push(sheet);
	}
}
