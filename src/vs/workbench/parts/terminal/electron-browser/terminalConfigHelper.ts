/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {getBaseThemeId} from 'vs/platform/theme/common/themes';
import {Platform} from 'vs/base/common/platform';
import {IConfiguration} from 'vs/editor/common/config/defaultConfig';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITerminalConfiguration} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';

const DEFAULT_ANSI_COLORS = {
	'hc-black': [
		'#000000', // black
		'#cd0000', // red
		'#00cd00', // green
		'#cdcd00', // yellow
		'#0000ee', // blue
		'#cd00cd', // magenta
		'#00cdcd', // cyan
		'#e5e5e5', // white
		'#7f7f7f', // bright black
		'#ff0000', // bright red
		'#00ff00', // bright green
		'#ffff00', // bright yellow
		'#5c5cff', // bright blue
		'#ff00ff', // bright magenta
		'#00ffff', // bright cyan
		'#ffffff'  // bright white
	],
	'vs': [
		'#000000', // black
		'#cd3131', // red
		'#008000', // green
		'#949800', // yellow
		'#0451a5', // blue
		'#bc05bc', // magenta
		'#0598bc', // cyan
		'#555555', // white
		'#666666', // bright black
		'#cd3131', // bright red
		'#00aa00', // bright green
		'#b5ba00', // bright yellow
		'#0451a5', // bright blue
		'#bc05bc', // bright magenta
		'#0598bc', // bright cyan
		'#a5a5a5'  // bright white
	],
	'vs-dark': [
		'#000000', // black
		'#cd3131', // red
		'#09885a', // green
		'#e5e510', // yellow
		'#2472c8', // blue
		'#bc3fbc', // magenta
		'#11a8cd', // cyan
		'#e5e5e5', // white
		'#666666', // bright black
		'#f14c4c', // bright red
		'#17a773', // bright green
		'#f5f543', // bright yellow
		'#3b8eea', // bright blue
		'#d670d6', // bright magenta
		'#29b8db', // bright cyan
		'#e5e5e5'  // bright white
	]
};

/**
 * Encapsulates terminal configuration logic, the primary purpose of this file is so that platform
 * specific test cases can be written.
 */
export class TerminalConfigHelper {
	public constructor(
		private platform: Platform,
		private configurationService: IConfigurationService,
		private themeService: IThemeService) {
	}

	public getTheme(): string[] {
		let baseThemeId = getBaseThemeId(this.themeService.getTheme());
		return DEFAULT_ANSI_COLORS[baseThemeId];
	}

	/**
	 * Set the terminal font to `terminal.integrated.fontFamily` if it is set, otherwise fallback to
	 * `editor.fontFamily`.
	 */
	public getFontFamily(): string {
		let terminalConfig = this.configurationService.getConfiguration<ITerminalConfiguration>();
		let fontFamily = terminalConfig.terminal.integrated.fontFamily;
		if (!fontFamily) {
			let editorConfig = this.configurationService.getConfiguration<IConfiguration>();
			fontFamily = editorConfig.editor.fontFamily;
		}
		return fontFamily;
	}

	public getShell(): string {
		let config = this.configurationService.getConfiguration<ITerminalConfiguration>();
		if (this.platform === Platform.Windows) {
			return config.terminal.integrated.shell.windows;
		}
		if (this.platform === Platform.Mac) {
			return config.terminal.integrated.shell.osx;
		}
		return config.terminal.integrated.shell.linux;
	}
}