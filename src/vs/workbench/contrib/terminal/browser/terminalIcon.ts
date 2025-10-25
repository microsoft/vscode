/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../base/common/hash.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionTerminalProfile, ITerminalProfile } from '../../../../platform/terminal/common/terminal.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';
import { ColorScheme, isDark } from '../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ITerminalInstance } from './terminal.js';
import { ITerminalProfileResolverService } from '../common/terminal.js';
import { ansiColorMap } from '../common/terminalColorRegistry.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';


export function getColorClass(colorKey: string): string;
export function getColorClass(profile: ITerminalProfile): string;
export function getColorClass(terminal: ITerminalInstance): string | undefined;
export function getColorClass(extensionTerminalProfile: IExtensionTerminalProfile): string | undefined;
export function getColorClass(terminalOrColorKey: ITerminalInstance | IExtensionTerminalProfile | ITerminalProfile | string): string | undefined {
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

export function getStandardColors(colorTheme: IColorTheme): string[] {
	const standardColors: string[] = [];

	for (const colorKey in ansiColorMap) {
		const color = colorTheme.getColor(colorKey);
		if (color && !colorKey.toLowerCase().includes('bright')) {
			standardColors.push(colorKey);
		}
	}
	return standardColors;
}

export function createColorStyleElement(colorTheme: IColorTheme): IDisposable {
	const disposable = new DisposableStore();
	const standardColors = getStandardColors(colorTheme);
	const styleElement = createStyleSheet(undefined, undefined, disposable);
	let css = '';
	for (const colorKey of standardColors) {
		const colorClass = getColorClass(colorKey);
		const color = colorTheme.getColor(colorKey);
		if (color) {
			css += (
				`.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon)` +
				`{ color: ${color} !important; }`
			);
		}
	}
	styleElement.textContent = css;
	return disposable;
}

export function getColorStyleContent(colorTheme: IColorTheme, editor?: boolean): string {
	const standardColors = getStandardColors(colorTheme);
	let css = '';
	for (const colorKey of standardColors) {
		const colorClass = getColorClass(colorKey);
		const color = colorTheme.getColor(colorKey);
		if (color) {
			if (editor) {
				css += (
					`.monaco-workbench .show-file-icons .predefined-file-icon.terminal-tab.${colorClass}::before,` +
					`.monaco-workbench .show-file-icons .file-icon.terminal-tab.${colorClass}::before` +
					`{ color: ${color} !important; }`
				);
			} else {
				css += (
					`.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon)` +
					`{ color: ${color} !important; }`
				);
			}
		}
	}
	return css;
}

export function getUriClasses(terminal: ITerminalInstance | IExtensionTerminalProfile | ITerminalProfile, colorScheme: ColorScheme, extensionContributed?: boolean): string[] | undefined {
	const icon = terminal.icon;
	if (!icon) {
		return undefined;
	}
	const iconClasses: string[] = [];
	let uri = undefined;

	if (extensionContributed) {
		if (typeof icon === 'string' && (icon.startsWith('$(') || getIconRegistry().getIcon(icon))) {
			return iconClasses;
		} else if (typeof icon === 'string') {
			uri = URI.parse(icon);
		}
	}

	if (icon instanceof URI) {
		uri = icon;
	} else if (icon instanceof Object && 'light' in icon && 'dark' in icon) {
		uri = isDark(colorScheme) ? icon.dark : icon.light;
	}
	if (uri instanceof URI) {
		const uriIconKey = hash(uri.path).toString(36);
		const className = `terminal-uri-icon-${uriIconKey}`;
		iconClasses.push(className);
		iconClasses.push(`terminal-uri-icon`);
	}
	return iconClasses;
}

export function getIconId(accessor: ServicesAccessor, terminal: ITerminalInstance | IExtensionTerminalProfile | ITerminalProfile): string {
	if (!terminal.icon || (terminal.icon instanceof Object && !('id' in terminal.icon))) {
		return accessor.get(ITerminalProfileResolverService).getDefaultIcon().id;
	}
	return typeof terminal.icon === 'string' ? terminal.icon : terminal.icon.id;
}
