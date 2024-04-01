/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { isLinux } from 'vs/base/common/platform';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfigHelper, ITerminalConfigurationService, LinuxDistro } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, ITerminalFont, MINIMUM_LETTER_SPACING } from 'vs/workbench/contrib/terminal/common/terminal';

const enum FontConstants {
	MinimumFontSize = 6,
	MaximumFontSize = 100,
}

/**
 * Encapsulates terminal configuration logic, the primary purpose of this file is so that platform
 * specific test cases can be written.
 */
export class TerminalConfigHelper extends Disposable implements ITerminalConfigHelper {
	panelContainer: HTMLElement | undefined;

	private _charMeasureElement: HTMLElement | undefined;
	private _lastFontMeasurement: ITerminalFont | undefined;
	protected _linuxDistro: LinuxDistro = LinuxDistro.Unknown;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
	) {
		super();
		if (isLinux) {
			if (navigator.userAgent.includes('Ubuntu')) {
				this._linuxDistro = LinuxDistro.Ubuntu;
			} else if (navigator.userAgent.includes('Fedora')) {
				this._linuxDistro = LinuxDistro.Fedora;
			}
		}
	}

	configFontIsMonospace(): boolean {
		const fontSize = 15;
		const fontFamily = this._terminalConfigurationService.config.fontFamily || this._configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		const iRect = this._getBoundingRectFor('i', fontFamily, fontSize);
		const wRect = this._getBoundingRectFor('w', fontFamily, fontSize);

		// Check for invalid bounds, there is no reason to believe the font is not monospace
		if (!iRect || !wRect || !iRect.width || !wRect.width) {
			return true;
		}

		return iRect.width === wRect.width;
	}

	private _createCharMeasureElementIfNecessary(): HTMLElement {
		if (!this.panelContainer) {
			throw new Error('Cannot measure element when terminal is not attached');
		}
		// Create charMeasureElement if it hasn't been created or if it was orphaned by its parent
		if (!this._charMeasureElement || !this._charMeasureElement.parentElement) {
			this._charMeasureElement = document.createElement('div');
			this.panelContainer.appendChild(this._charMeasureElement);
		}
		return this._charMeasureElement;
	}

	private _getBoundingRectFor(char: string, fontFamily: string, fontSize: number): ClientRect | DOMRect | undefined {
		let charMeasureElement: HTMLElement;
		try {
			charMeasureElement = this._createCharMeasureElementIfNecessary();
		} catch {
			return undefined;
		}
		const style = charMeasureElement.style;
		style.display = 'inline-block';
		style.fontFamily = fontFamily;
		style.fontSize = fontSize + 'px';
		style.lineHeight = 'normal';
		charMeasureElement.innerText = char;
		const rect = charMeasureElement.getBoundingClientRect();
		style.display = 'none';

		return rect;
	}

	private _measureFont(w: Window, fontFamily: string, fontSize: number, letterSpacing: number, lineHeight: number): ITerminalFont {
		const rect = this._getBoundingRectFor('X', fontFamily, fontSize);

		// Bounding client rect was invalid, use last font measurement if available.
		if (this._lastFontMeasurement && (!rect || !rect.width || !rect.height)) {
			return this._lastFontMeasurement;
		}

		this._lastFontMeasurement = {
			fontFamily,
			fontSize,
			letterSpacing,
			lineHeight,
			charWidth: 0,
			charHeight: 0
		};

		if (rect && rect.width && rect.height) {
			this._lastFontMeasurement.charHeight = Math.ceil(rect.height);
			// Char width is calculated differently for DOM and the other renderer types. Refer to
			// how each renderer updates their dimensions in xterm.js
			if (this._terminalConfigurationService.config.gpuAcceleration === 'off') {
				this._lastFontMeasurement.charWidth = rect.width;
			} else {
				const deviceCharWidth = Math.floor(rect.width * w.devicePixelRatio);
				const deviceCellWidth = deviceCharWidth + Math.round(letterSpacing);
				const cssCellWidth = deviceCellWidth / w.devicePixelRatio;
				this._lastFontMeasurement.charWidth = cssCellWidth - Math.round(letterSpacing) / w.devicePixelRatio;
			}
		}

		return this._lastFontMeasurement;
	}

	/**
	 * Gets the font information based on the terminal.integrated.fontFamily
	 * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
	 */
	getFont(w: Window, xtermCore?: IXtermCore, excludeDimensions?: boolean): ITerminalFont {
		const editorConfig = this._configurationService.getValue<IEditorOptions>('editor');

		let fontFamily = this._terminalConfigurationService.config.fontFamily || editorConfig.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		let fontSize = this._clampInt(this._terminalConfigurationService.config.fontSize, FontConstants.MinimumFontSize, FontConstants.MaximumFontSize, EDITOR_FONT_DEFAULTS.fontSize);

		// Work around bad font on Fedora/Ubuntu
		if (!this._terminalConfigurationService.config.fontFamily) {
			if (this._linuxDistro === LinuxDistro.Fedora) {
				fontFamily = '\'DejaVu Sans Mono\'';
			}
			if (this._linuxDistro === LinuxDistro.Ubuntu) {
				fontFamily = '\'Ubuntu Mono\'';

				// Ubuntu mono is somehow smaller, so set fontSize a bit larger to get the same perceived size.
				fontSize = this._clampInt(fontSize + 2, FontConstants.MinimumFontSize, FontConstants.MaximumFontSize, EDITOR_FONT_DEFAULTS.fontSize);
			}
		}

		// Always fallback to monospace, otherwise a proportional font may become the default
		fontFamily += ', monospace';

		const letterSpacing = this._terminalConfigurationService.config.letterSpacing ? Math.max(Math.floor(this._terminalConfigurationService.config.letterSpacing), MINIMUM_LETTER_SPACING) : DEFAULT_LETTER_SPACING;
		const lineHeight = this._terminalConfigurationService.config.lineHeight ? Math.max(this._terminalConfigurationService.config.lineHeight, 1) : DEFAULT_LINE_HEIGHT;

		if (excludeDimensions) {
			return {
				fontFamily,
				fontSize,
				letterSpacing,
				lineHeight
			};
		}

		// Get the character dimensions from xterm if it's available
		if (xtermCore?._renderService?._renderer.value) {
			const cellDims = xtermCore._renderService.dimensions.css.cell;
			if (cellDims?.width && cellDims?.height) {
				return {
					fontFamily,
					fontSize,
					letterSpacing,
					lineHeight,
					charHeight: cellDims.height / lineHeight,
					charWidth: cellDims.width - Math.round(letterSpacing) / w.devicePixelRatio
				};
			}
		}

		// Fall back to measuring the font ourselves
		return this._measureFont(w, fontFamily, fontSize, letterSpacing, lineHeight);
	}

	private _clampInt<T>(source: any, minimum: number, maximum: number, fallback: T): number | T {
		let r = parseInt(source, 10);
		if (isNaN(r)) {
			return fallback;
		}
		if (typeof minimum === 'number') {
			r = Math.max(minimum, r);
		}
		if (typeof maximum === 'number') {
			r = Math.min(maximum, r);
		}
		return r;
	}
}
