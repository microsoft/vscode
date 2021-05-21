/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { hash } from 'vs/base/common/hash';
import { URI } from 'vs/base/common/uri';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';


export function getColorClass(terminal: ITerminalInstance): string | undefined {
	let color = undefined;
	if (terminal.color) {
		color = terminal.color;
	} else if (ThemeIcon.isThemeIcon(terminal.icon) && terminal.icon.color) {
		color = terminal.icon.color.id.replace('.', '_');
	}
	if (color) {
		return `terminal-icon-${color}`;
	}
	return undefined;
}

export function getUriClasses(terminal: ITerminalInstance, colorScheme: ColorScheme): string[] | undefined {
	const icon = terminal.icon;
	if (!icon) {
		return undefined;
	}
	const iconClasses: string[] = [];
	let uri = undefined;
	if (icon instanceof URI) {
		uri = icon;
	} else if (icon instanceof Object && 'light' in icon && 'dark' in icon) {
		uri = colorScheme === ColorScheme.LIGHT ? icon.light : icon.dark;
	}
	if (uri instanceof URI) {
		const uriIconKey = hash(uri.path).toString(36);
		const className = `terminal-uri-icon-${uriIconKey}`;
		iconClasses.push(className);
		iconClasses.push(`terminal-uri-icon`);
	}
	return iconClasses;
}

export function getIconId(terminal: ITerminalInstance): string {
	if (!terminal.icon || (terminal.icon instanceof Object && !('id' in terminal.icon))) {
		return Codicon.terminal.id;
	}
	return terminal.icon.id;
}
