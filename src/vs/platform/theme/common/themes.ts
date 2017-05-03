/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function isLightTheme(themeId: string) {
	return /vs($| )/.test(themeId);
}

export function isDarkTheme(themeId: string) {
	return /vs-dark($| )/.test(themeId);
}

export function isHighContrastTheme(themeId: string) {
	return /hc-black($| )/.test(themeId);
}