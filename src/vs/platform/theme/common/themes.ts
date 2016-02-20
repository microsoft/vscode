/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

export enum BaseTheme {
	VS,
	VS_DARK,
	HIGH_CONTRAST
}

export const ComponentType =  {
	COLOR: 'color',
	ICON: 'icon'
};

export function getBaseThemes(includeHighContrast: boolean): BaseTheme[] {
	if (includeHighContrast) {
		return [BaseTheme.VS, BaseTheme.VS_DARK, BaseTheme.HIGH_CONTRAST];
	}
	return [BaseTheme.VS, BaseTheme.VS_DARK];
}

export function hasBaseTheme(themeId: string): boolean {
	let themeIdParts = themeId.split(' ');
	let notFound = getBaseThemes(true).every(baseThemeId => {
		return themeIdParts.indexOf(toId(baseThemeId)) === -1;
	});
	return notFound === false;
}

export function isBaseThemeOnly(themeId: string): boolean {
	let themeIdParts = themeId.split(' ');
	if (themeIdParts.length > 1) {
		return false;
	}
	let baseThemes = getBaseThemes(true).map(i => toId(i));
	return baseThemes.indexOf(themeId) > -1;
}

export function stripBaseTheme(themeId: string, separator: string = ' '): string {
	let themeIdParts = themeId.split(separator);
	let baseThemes = getBaseThemes(true).map(i => toId(i));
	let newParts = [];
	themeIdParts.forEach(themePart => {
		if (baseThemes.indexOf(themePart) === -1) {
			newParts.push(themePart);
		}
	});
	return newParts.join(separator);
}

export function toId(theme: BaseTheme): string {
	switch (theme) {
		case BaseTheme.VS:
			return 'vs';
		case BaseTheme.VS_DARK:
			return 'vs-dark';
	}
	return 'hc-black';
}

export function toLabel(theme: BaseTheme): string {
	switch (theme) {
		case BaseTheme.VS:
			return nls.localize('theme.vs', 'Light (Visual Studio)');
		case BaseTheme.VS_DARK:
			return nls.localize('theme.vs-dark', 'Dark (Visual Studio)');
	}
	return nls.localize('theme.hc', 'High Contrast');
}

export function isLightTheme(themeId: string) {
	return /vs($| )/.test(themeId);
}

export function getSyntaxThemeId(themeId: string) {
	return themeId.split(' ')[1];
}

export function getBaseThemeId(themeId: string) {
	return themeId.split(' ')[0];
}
