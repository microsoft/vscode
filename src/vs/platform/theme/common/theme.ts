/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Color scheme used by the OS and by color themes.
 */
export enum ColorScheme {
	DARK = 'dark',
	LIGHT = 'light',
	HIGH_CONTRAST_DARK = 'hcDark',
	HIGH_CONTRAST_LIGHT = 'hcLight'
}

export enum ThemeTypeSelector {
	VS = 'vs',
	VS_DARK = 'vs-dark',
	HC_BLACK = 'hc-black',
	HC_LIGHT = 'hc-light'
}


export function isHighContrast(scheme: ColorScheme): boolean {
	return scheme === ColorScheme.HIGH_CONTRAST_DARK || scheme === ColorScheme.HIGH_CONTRAST_LIGHT;
}

export function isDark(scheme: ColorScheme): boolean {
	return scheme === ColorScheme.DARK || scheme === ColorScheme.HIGH_CONTRAST_DARK;
}
