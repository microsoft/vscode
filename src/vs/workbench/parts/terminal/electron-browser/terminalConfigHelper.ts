/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfiguration, DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, ITerminalConfigHelper, ITerminalFont, IShell } from 'vs/workbench/parts/terminal/common/terminal';
import { Platform } from 'vs/base/common/platform';

const DEFAULT_LINE_HEIGHT = 1.2;

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
export class TerminalConfigHelper implements ITerminalConfigHelper {
	public panelContainer: HTMLElement;

	private _charMeasureElement: HTMLElement;

	public constructor(
		private _platform: Platform,
		@IConfigurationService private _configurationService: IConfigurationService) {
	}

	public getTheme(baseThemeId: string): string[] {
		return DEFAULT_ANSI_COLORS[baseThemeId];
	}

	private _measureFont(fontFamily: string, fontSize: number, lineHeight: number): ITerminalFont {
		// Create charMeasureElement if it hasn't been created or if it was orphaned by its parent
		if (!this._charMeasureElement || !this._charMeasureElement.parentElement) {
			this._charMeasureElement = document.createElement('div');
			this.panelContainer.appendChild(this._charMeasureElement);
		}
		let style = this._charMeasureElement.style;
		style.display = 'block';
		style.fontFamily = fontFamily;
		style.fontSize = fontSize + 'px';
		style.height = Math.floor(lineHeight * fontSize) + 'px';
		this._charMeasureElement.innerText = 'X';
		let rect = this._charMeasureElement.getBoundingClientRect();
		style.display = 'none';
		let charWidth = Math.ceil(rect.width);
		let charHeight = Math.ceil(rect.height);
		return {
			fontFamily,
			fontSize: fontSize + 'px',
			lineHeight,
			charWidth,
			charHeight
		};
	}

	/**
	 * Gets the font information based on the terminal.integrated.fontFamily
	 * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
	 */
	public getFont(): ITerminalFont {
		let terminalConfig = this._configurationService.getConfiguration<ITerminalConfiguration>().terminal.integrated;
		let editorConfig = this._configurationService.getConfiguration<IConfiguration>();

		let fontFamily = terminalConfig.fontFamily || editorConfig.editor.fontFamily;
		let fontSize = this.toInteger(terminalConfig.fontSize, 0) || editorConfig.editor.fontSize;
		if (fontSize <= 0) {
			fontSize = DefaultConfig.editor.fontSize;
		}
		let lineHeight = terminalConfig.lineHeight <= 0 ? DEFAULT_LINE_HEIGHT : terminalConfig.lineHeight;

		return this._measureFont(fontFamily, fontSize, lineHeight);
	}

	public getFontLigaturesEnabled(): boolean {
		let terminalConfig = this._configurationService.getConfiguration<ITerminalConfiguration>().terminal.integrated;
		return terminalConfig.fontLigatures;
	}

	public getCursorBlink(): boolean {
		let terminalConfig = this._configurationService.getConfiguration<ITerminalConfiguration>().terminal.integrated;
		return terminalConfig.cursorBlinking;
	}

	public getShell(): IShell {
		let config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		let shell: IShell = {
			executable: '',
			args: []
		};
		const integrated = config && config.terminal && config.terminal.integrated;
		if (integrated && integrated.shell && integrated.shellArgs) {
			if (this._platform === Platform.Windows) {
				shell.executable = integrated.shell.windows;
				shell.args = integrated.shellArgs.windows;
			} else if (this._platform === Platform.Mac) {
				shell.executable = integrated.shell.osx;
				shell.args = integrated.shellArgs.osx;
			} else if (this._platform === Platform.Linux) {
				shell.executable = integrated.shell.linux;
				shell.args = integrated.shellArgs.linux;
			}
		}
		return shell;
	}

	public getScrollback(): number {
		let config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.scrollback;
	}

	public isSetLocaleVariables(): boolean {
		let config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.setLocaleVariables;
	}

	private toInteger(source: any, minimum?: number): number {
		let r = parseInt(source, 10);
		if (isNaN(r)) {
			r = 0;
		}
		if (typeof minimum === 'number') {
			r = Math.max(minimum, r);
		}
		return r;
	}

	public getCommandsToSkipShell(): string[] {
		let config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.commandsToSkipShell;
	}
}