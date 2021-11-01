/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { TerminalIcon } from 'vs/platform/terminal/common/terminal';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';


export function argsMatch(args1: string | string[] | undefined, args2: string | string[] | undefined): boolean {
	if (!args1 && !args2) {
		return true;
	} else if (typeof args1 === 'string' && typeof args2 === 'string') {
		return args1 === args2;
	} else if (Array.isArray(args1) && Array.isArray(args2)) {
		if (args1.length !== args2.length) {
			return false;
		}
		for (let i = 0; i < args1.length; i++) {
			if (args1[i] !== args2[i]) {
				return false;
			}
		}
		return true;
	}
	return false;
}

export function iconsEqual(iconOne?: TerminalIcon, iconTwo?: TerminalIcon): boolean {
	if (!iconOne && !iconTwo) {
		return true;
	} else if (!iconOne || !iconTwo) {
		return false;
	}

	if (ThemeIcon.isThemeIcon(iconOne) && ThemeIcon.isThemeIcon(iconTwo)) {
		return iconOne.id === iconTwo.id && iconOne.color === iconTwo.color;
	}
	if (typeof iconOne === 'object' && iconOne && 'light' in iconOne && 'dark' in iconOne
		&& typeof iconTwo === 'object' && iconTwo && 'light' in iconTwo && 'dark' in iconTwo) {
		const castedIcon = (iconOne as { light: unknown, dark: unknown });
		const castedIconTwo = (iconTwo as { light: unknown, dark: unknown });
		if ((URI.isUri(castedIcon.light) || isUriComponents(castedIcon.light)) && (URI.isUri(castedIcon.dark) || isUriComponents(castedIcon.dark))
			&& (URI.isUri(castedIconTwo.light) || isUriComponents(castedIconTwo.light)) && (URI.isUri(castedIconTwo.dark) || isUriComponents(castedIconTwo.dark))) {
			return castedIcon.light.path === castedIconTwo.light.path && castedIcon.dark.path === castedIconTwo.dark.path;
		}
	}
	if ((URI.isUri(iconOne) && URI.isUri(iconTwo)) || (isUriComponents(iconOne) || isUriComponents(iconTwo))) {
		const castedIcon = (iconOne as { scheme: unknown, path: unknown });
		const castedIconTwo = (iconTwo as { scheme: unknown, path: unknown });
		return castedIcon.path === castedIconTwo.path && castedIcon.scheme === castedIconTwo.scheme;
	}

	return false;
}


export function isUriComponents(thing: unknown): thing is UriComponents {
	if (!thing) {
		return false;
	}
	return typeof (<any>thing).path === 'string' &&
		typeof (<any>thing).scheme === 'string';
}
