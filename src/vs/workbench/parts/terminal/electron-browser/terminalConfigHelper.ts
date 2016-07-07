/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {Platform} from 'vs/base/common/platform';
import {IConfiguration} from 'vs/editor/common/config/defaultConfig';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITerminalConfiguration} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {Builder} from 'vs/base/browser/builder';

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

export interface ITerminalFont {
	fontFamily: string;
	fontSize: string;
	lineHeight: string;
	charWidth: number;
	charHeight: number;
}

export interface IShell {
	executable: string;
	args: string[];
}

/**
 * Encapsulates terminal configuration logic, the primary purpose of this file is so that platform
 * specific test cases can be written.
 */
export class TerminalConfigHelper {
	private charMeasureElement: HTMLElement;

	public constructor(
		private platform: Platform,
		private configurationService: IConfigurationService,
		private panelContainer: Builder) {
	}

	public getTheme(baseThemeId: string): string[] {
		return DEFAULT_ANSI_COLORS[baseThemeId];
	}

	private measureFont(fontFamily: string, fontSize: string, lineHeight: string): ITerminalFont {
		// Create charMeasureElement if it hasn't been created or if it was orphaned by its parent
		if (!this.charMeasureElement || !this.charMeasureElement.parentElement) {
			this.charMeasureElement = this.panelContainer.div().getHTMLElement();
		}
		let style = this.charMeasureElement.style;
		style.display = 'inline';
		style.fontFamily = fontFamily;
		style.fontSize = fontSize;
		style.lineHeight = lineHeight;
		this.charMeasureElement.innerText = 'X';
		let rect = this.charMeasureElement.getBoundingClientRect();
		style.display = 'none';
		let charWidth = Math.ceil(rect.width);
		let charHeight = Math.ceil(rect.height);
		return {
			fontFamily,
			fontSize,
			lineHeight,
			charWidth,
			charHeight
		};
	}

	/**
	 * Gets the font information based on the terminal.integrated.fontFamily,
	 * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
	 */
	public getFont(): ITerminalFont {
		let terminalConfig = this.configurationService.getConfiguration<ITerminalConfiguration>().terminal.integrated;
		let editorConfig = this.configurationService.getConfiguration<IConfiguration>();

		let fontFamily = terminalConfig.fontFamily || editorConfig.editor.fontFamily;
		let fontSize = this.toInteger(terminalConfig.fontSize, 0) || editorConfig.editor.fontSize;
		let lineHeight = this.toInteger(terminalConfig.lineHeight, 0);

		return this.measureFont(fontFamily, fontSize + 'px', lineHeight === 0 ? 'normal' : lineHeight + 'px');
	}

	public getFontLigaturesEnabled(): boolean {
		return this.configurationService.getConfiguration<ITerminalConfiguration>().terminal.integrated.fontLigatures;
	}

	public getCursorBlink(): boolean {
		let editorConfig = this.configurationService.getConfiguration<IConfiguration>();
		return editorConfig.editor.cursorBlinking === 'blink';
	}

	public getShell(): IShell {
		let config = this.configurationService.getConfiguration<ITerminalConfiguration>();
		let shell: IShell = {
			executable: '',
			args: []
		};
		if (this.platform === Platform.Windows) {
			shell.executable = config.terminal.integrated.shell.windows;
		} else if (this.platform === Platform.Mac) {
			shell.executable = config.terminal.integrated.shell.osx;
			shell.args = config.terminal.integrated.shellArgs.osx;
		} else if (this.platform === Platform.Linux) {
			shell.executable = config.terminal.integrated.shell.linux;
			shell.args = config.terminal.integrated.shellArgs.linux;
		}
		return shell;
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
}