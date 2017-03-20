/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfiguration as IEditorConfiguration, DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, ITerminalConfigHelper, ITerminalFont, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { Platform } from 'vs/base/common/platform';

interface IFullTerminalConfiguration {
	terminal: {
		integrated: ITerminalConfiguration;
	};
}

const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * Encapsulates terminal configuration logic, the primary purpose of this file is so that platform
 * specific test cases can be written.
 */
export class TerminalConfigHelper implements ITerminalConfigHelper {
	public panelContainer: HTMLElement;

	private _charMeasureElement: HTMLElement;
	private _lastFontMeasurement: ITerminalFont;

	public constructor(
		private _platform: Platform,
		@IConfigurationService private _configurationService: IConfigurationService) {
	}

	public get config(): ITerminalConfiguration {
		return this._configurationService.getConfiguration<IFullTerminalConfiguration>().terminal.integrated;
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

		// Bounding client rect was invalid, use last font measurement if available.
		if (this._lastFontMeasurement && !rect.width && !rect.height) {
			return this._lastFontMeasurement;
		}

		this._lastFontMeasurement = {
			fontFamily,
			fontSize: fontSize + 'px',
			lineHeight,
			charWidth: rect.width,
			charHeight: rect.height
		};
		return this._lastFontMeasurement;
	}

	/**
	 * Gets the font information based on the terminal.integrated.fontFamily
	 * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
	 */
	public getFont(): ITerminalFont {
		const config = this._configurationService.getConfiguration();
		const editorConfig = (<IEditorConfiguration>config).editor;
		const terminalConfig = this.config;

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

	public mergeDefaultShellPathAndArgs(shell: IShellLaunchConfig): void {
		const config = this.config;
		shell.executable = '';
		shell.args = [];
		if (config && config.shell && config.shellArgs) {
			if (this._platform === Platform.Windows) {
				shell.executable = config.shell.windows;
				shell.args = config.shellArgs.windows;
			} else if (this._platform === Platform.Mac) {
				shell.executable = config.shell.osx;
				shell.args = config.shellArgs.osx;
			} else if (this._platform === Platform.Linux) {
				shell.executable = config.shell.linux;
				shell.args = config.shellArgs.linux;
			}
		}
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