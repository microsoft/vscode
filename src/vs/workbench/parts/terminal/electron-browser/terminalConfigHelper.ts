/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfiguration as IEditorConfiguration, DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, ITerminalConfigHelper, ITerminalFont, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
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
		'#00BC00', // green
		'#949800', // yellow
		'#0451a5', // blue
		'#bc05bc', // magenta
		'#0598bc', // cyan
		'#555555', // white
		'#666666', // bright black
		'#cd3131', // bright red
		'#14CE14', // bright green
		'#b5ba00', // bright yellow
		'#0451a5', // bright blue
		'#bc05bc', // bright magenta
		'#0598bc', // bright cyan
		'#a5a5a5'  // bright white
	],
	'vs-dark': [
		'#000000', // black
		'#cd3131', // red
		'#0DBC79', // green
		'#e5e510', // yellow
		'#2472c8', // blue
		'#bc3fbc', // magenta
		'#11a8cd', // cyan
		'#e5e5e5', // white
		'#666666', // bright black
		'#f14c4c', // bright red
		'#23d18b', // bright green
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
		const style = this._charMeasureElement.style;
		style.display = 'block';
		style.fontFamily = fontFamily;
		style.fontSize = fontSize + 'px';
		style.lineHeight = lineHeight.toString(10);
		this._charMeasureElement.innerText = 'X';
		const rect = this._charMeasureElement.getBoundingClientRect();
		style.display = 'none';
		const charWidth = rect.width;
		const charHeight = rect.height;
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
		const config = this._configurationService.getConfiguration();
		const editorConfig = (<IEditorConfiguration>config).editor;
		const terminalConfig = (<ITerminalConfiguration>config).terminal.integrated;

		const fontFamily = terminalConfig.fontFamily || editorConfig.fontFamily;
		let fontSize = this._toInteger(terminalConfig.fontSize, 0);
		if (fontSize <= 0) {
			fontSize = DefaultConfig.editor.fontSize;
		}
		let lineHeight = terminalConfig.lineHeight <= 0 ? DEFAULT_LINE_HEIGHT : terminalConfig.lineHeight;
		if (!lineHeight) {
			lineHeight = DEFAULT_LINE_HEIGHT;
		}

		return this._measureFont(fontFamily, fontSize, lineHeight);
	}

	public getFontLigaturesEnabled(): boolean {
		const terminalConfig = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return terminalConfig.terminal.integrated.fontLigatures;
	}

	public getFlowControl(): boolean {
		const terminalConfig = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return terminalConfig.terminal.integrated.flowControl;
	}

	public getCursorBlink(): boolean {
		const terminalConfig = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return terminalConfig.terminal.integrated.cursorBlinking;
	}

	public getCursorStyle(): string {
		const terminalConfig = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return terminalConfig.terminal.integrated.cursorStyle;
	}

	public getRightClickCopyPaste(): boolean {
		const config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.rightClickCopyPaste;
	}

	public getCommandsToSkipShell(): string[] {
		const config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.commandsToSkipShell;
	}

	public mergeDefaultShellPathAndArgs(shell: IShellLaunchConfig): IShellLaunchConfig {
		const config = this._configurationService.getConfiguration<ITerminalConfiguration>();

		shell.executable = '';
		shell.args = [];

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
		const config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.scrollback;
	}

	public isSetLocaleVariables(): boolean {
		const config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.setLocaleVariables;
	}

	public getCwd(): string {
		const config = this._configurationService.getConfiguration<ITerminalConfiguration>();
		return config.terminal.integrated.cwd;
	}

	private _toInteger(source: any, minimum?: number): number {
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