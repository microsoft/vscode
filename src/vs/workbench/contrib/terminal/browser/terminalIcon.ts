/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon, iconRegistry } from 'vs/base/common/codicons';
import { hash } from 'vs/base/common/hash';
import { URI } from 'vs/base/common/uri';
import { IExtensionTerminalProfile } from 'vs/platform/terminal/common/terminal';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';


export function getColorClass(colorKey: string): string;
export function getColorClass(terminal: ITerminalInstance): string | undefined;
export function getColorClass(extensionTerminalProfile: IExtensionTerminalProfile): string | undefined;
export function getColorClass(terminalOrColorKey: ITerminalInstance | IExtensionTerminalProfile | string): string | undefined {
	let color = undefined;
	if (typeof terminalOrColorKey === 'string') {
		color = terminalOrColorKey;
	} else if (terminalOrColorKey.color) {
		color = terminalOrColorKey.color.replace(/\./g, '_');
	} else if (ThemeIcon.isThemeIcon(terminalOrColorKey.icon) && terminalOrColorKey.icon.color) {
		color = terminalOrColorKey.icon.color.id.replace(/\./g, '_');
	}
	if (color) {
		return `terminal-icon-${color.replace(/\./g, '_')}`;
	}
	return undefined;
}

export function getUriClasses(terminal: ITerminalInstance | IExtensionTerminalProfile, colorScheme: ColorScheme, extensionContributed?: boolean): string[] | undefined {
	const icon = terminal.icon;
	if (!icon) {
		return undefined;
	}
	const iconClasses: string[] = [];
	let uri = undefined;

	if (extensionContributed) {
		if (typeof icon === 'string' && (icon.startsWith('$(') || iconRegistry.get(icon))) {
			return iconClasses;
		} else if (typeof icon === 'string') {
			uri = URI.parse(icon);
		}
	}

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

export function getIconId(terminal: ITerminalInstance | IExtensionTerminalProfile): string {
	if (!terminal.icon || (terminal.icon instanceof Object && !('id' in terminal.icon))) {
		return Codicon.terminal.id;
	}
	return typeof terminal.icon === 'string' ? terminal.icon : terminal.icon.id;
}
