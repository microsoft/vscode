/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IProgressState } from '@xterm/addon-progress';
import { Codicon } from '../../../../base/common/codicons.js';
import { Color } from '../../../../base/common/color.js';
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
import { isString } from '../../../../base/common/types.js';


export function getColorClass(colorKey: string): string;
export function getColorClass(profile: ITerminalProfile): string;
export function getColorClass(terminal: ITerminalInstance): string | undefined;
export function getColorClass(extensionTerminalProfile: IExtensionTerminalProfile): string | undefined;
export function getColorClass(terminalOrColorKey: ITerminalInstance | IExtensionTerminalProfile | ITerminalProfile | string): string | undefined {
	let color = undefined;
	if (isString(terminalOrColorKey)) {
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
	const styleElement = createStyleSheet(undefined, undefined, disposable);
	styleElement.textContent = getColorStyleContent(colorTheme);
	return disposable;
}

export function getIconColorStyle(colorClass: string, color: Color): string {
	const iconSelector = '.codicon:first-child:not(.action-label):not(.file-icon)';
	return (
		`.monaco-workbench .${colorClass}:not(.single-terminal-tab) ${iconSelector},` +
		`.monaco-workbench .${colorClass}.single-terminal-tab:not(.alt-command) > ${iconSelector}` +
		`{ color: ${color} !important; }`
	);
}

export function getTerminalProgressIcon(progressState: IProgressState | undefined): ThemeIcon | undefined {
	switch (progressState?.state) {
		case 2: return Codicon.error;
		case 3: return ThemeIcon.modify(Codicon.loading, 'spin');
		case 4: return Codicon.alert;
		default: return undefined;
	}
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
				css += getIconColorStyle(colorClass, color);
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
		if (isString(icon) && (icon.startsWith('$(') || getIconRegistry().getIcon(icon))) {
			return iconClasses;
		} else if (isString(icon)) {
			uri = URI.parse(icon);
		}
	}

	if (URI.isUri(icon)) {
		uri = icon;
	} else if (!ThemeIcon.isThemeIcon(icon) && !isString(icon)) {
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
	if (isString(terminal.icon)) {
		return terminal.icon;
	}
	if (ThemeIcon.isThemeIcon(terminal.icon)) {
		return terminal.icon.id;
	}
	return accessor.get(ITerminalProfileResolverService).getDefaultIcon().id;
}
