/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../editor/common/config/fontInfo.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DEFAULT_BOLD_FONT_WEIGHT, DEFAULT_FONT_WEIGHT, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, MAXIMUM_FONT_WEIGHT, MINIMUM_FONT_WEIGHT, MINIMUM_LETTER_SPACING, TERMINAL_CONFIG_SECTION } from '../common/terminal.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { isString } from '../../../../base/common/types.js';
import { clamp } from '../../../../base/common/numbers.js';
// #region TerminalConfigurationService
let TerminalConfigurationService = class TerminalConfigurationService extends Disposable {
    get config() { return this._config; }
    get defaultLocation() {
        if (this.config.defaultLocation === "editor" /* TerminalLocationConfigValue.Editor */) {
            return TerminalLocation.Editor;
        }
        return TerminalLocation.Panel;
    }
    get onConfigChanged() { return this._onConfigChanged.event; }
    constructor(_configurationService) {
        super();
        this._configurationService = _configurationService;
        this._onConfigChanged = this._register(new Emitter());
        this._fontMetrics = this._register(new TerminalFontMetrics(this, this._configurationService));
        this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
                this._updateConfig();
            }
        }));
    }
    setPanelContainer(panelContainer) { return this._fontMetrics.setPanelContainer(panelContainer); }
    configFontIsMonospace() { return this._fontMetrics.configFontIsMonospace(); }
    getFont(w, xtermCore, excludeDimensions) { return this._fontMetrics.getFont(w, xtermCore, excludeDimensions); }
    _updateConfig() {
        const configValues = { ...this._configurationService.getValue(TERMINAL_CONFIG_SECTION) };
        configValues.fontWeight = this._normalizeFontWeight(configValues.fontWeight, DEFAULT_FONT_WEIGHT);
        configValues.fontWeightBold = this._normalizeFontWeight(configValues.fontWeightBold, DEFAULT_BOLD_FONT_WEIGHT);
        this._config = configValues;
        this._onConfigChanged.fire();
    }
    _normalizeFontWeight(input, defaultWeight) {
        if (input === 'normal' || input === 'bold') {
            return input;
        }
        return clampInt(input, MINIMUM_FONT_WEIGHT, MAXIMUM_FONT_WEIGHT, defaultWeight);
    }
};
TerminalConfigurationService = __decorate([
    __param(0, IConfigurationService)
], TerminalConfigurationService);
export { TerminalConfigurationService };
// #endregion TerminalConfigurationService
// #region TerminalFontMetrics
var FontConstants;
(function (FontConstants) {
    FontConstants[FontConstants["MinimumFontSize"] = 6] = "MinimumFontSize";
    FontConstants[FontConstants["MaximumFontSize"] = 100] = "MaximumFontSize";
})(FontConstants || (FontConstants = {}));
export class TerminalFontMetrics extends Disposable {
    constructor(_terminalConfigurationService, _configurationService) {
        super();
        this._terminalConfigurationService = _terminalConfigurationService;
        this._configurationService = _configurationService;
        this.linuxDistro = 1 /* LinuxDistro.Unknown */;
        this._register(toDisposable(() => this._charMeasureElement?.remove()));
    }
    setPanelContainer(panelContainer) {
        this._panelContainer = panelContainer;
    }
    configFontIsMonospace() {
        const fontSize = 15;
        const fontFamily = this._terminalConfigurationService.config.fontFamily || this._configurationService.getValue('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
        const iRect = this._getBoundingRectFor('i', fontFamily, fontSize);
        const wRect = this._getBoundingRectFor('w', fontFamily, fontSize);
        // Check for invalid bounds, there is no reason to believe the font is not monospace
        if (!iRect || !wRect || !iRect.width || !wRect.width) {
            return true;
        }
        return iRect.width === wRect.width;
    }
    /**
     * Gets the font information based on the terminal.integrated.fontFamily
     * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
     */
    getFont(w, xtermCore, excludeDimensions) {
        const editorConfig = this._configurationService.getValue('editor');
        let fontFamily = this._terminalConfigurationService.config.fontFamily || editorConfig.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily || 'monospace';
        let fontSize = clampInt(this._terminalConfigurationService.config.fontSize, 6 /* FontConstants.MinimumFontSize */, 100 /* FontConstants.MaximumFontSize */, EDITOR_FONT_DEFAULTS.fontSize);
        // Work around bad font on Fedora/Ubuntu
        if (!this._terminalConfigurationService.config.fontFamily) {
            if (this.linuxDistro === 2 /* LinuxDistro.Fedora */) {
                fontFamily = '\'DejaVu Sans Mono\'';
            }
            if (this.linuxDistro === 3 /* LinuxDistro.Ubuntu */) {
                fontFamily = '\'Ubuntu Mono\'';
                // Ubuntu mono is somehow smaller, so set fontSize a bit larger to get the same perceived size.
                fontSize = clampInt(fontSize + 2, 6 /* FontConstants.MinimumFontSize */, 100 /* FontConstants.MaximumFontSize */, EDITOR_FONT_DEFAULTS.fontSize);
            }
        }
        // Always fallback to monospace, otherwise a proportional font may become the default
        fontFamily += ', monospace';
        // Always fallback to AppleBraille on macOS, otherwise braille will render with filled and
        // empty circles in all 8 positions, instead of just filled circles
        // See https://github.com/microsoft/vscode/issues/174521
        if (isMacintosh) {
            fontFamily += ', AppleBraille';
        }
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
    _createCharMeasureElementIfNecessary() {
        if (!this._panelContainer) {
            throw new Error('Cannot measure element when terminal is not attached');
        }
        // Create charMeasureElement if it hasn't been created or if it was orphaned by its parent
        if (!this._charMeasureElement || !this._charMeasureElement.parentElement) {
            this._charMeasureElement = document.createElement('div');
            this._panelContainer.appendChild(this._charMeasureElement);
        }
        return this._charMeasureElement;
    }
    _getBoundingRectFor(char, fontFamily, fontSize) {
        let charMeasureElement;
        try {
            charMeasureElement = this._createCharMeasureElementIfNecessary();
        }
        catch {
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
    _measureFont(w, fontFamily, fontSize, letterSpacing, lineHeight) {
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
            }
            else {
                const deviceCharWidth = Math.floor(rect.width * w.devicePixelRatio);
                const deviceCellWidth = deviceCharWidth + Math.round(letterSpacing);
                const cssCellWidth = deviceCellWidth / w.devicePixelRatio;
                this._lastFontMeasurement.charWidth = cssCellWidth - Math.round(letterSpacing) / w.devicePixelRatio;
            }
        }
        return this._lastFontMeasurement;
    }
}
// #endregion TerminalFontMetrics
// #region Utils
function clampInt(source, minimum, maximum, fallback) {
    if (source === null || source === undefined) {
        return fallback;
    }
    const r = isString(source) ? parseInt(source, 10) : source;
    if (isNaN(r)) {
        return fallback;
    }
    return clamp(r, minimum, maximum);
}
// #endregion Utils
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFaEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLG1CQUFtQixFQUFFLHNCQUFzQixFQUFFLG1CQUFtQixFQUFzQyxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxzQkFBc0IsRUFBRSx1QkFBdUIsRUFBc0IsTUFBTSx1QkFBdUIsQ0FBQztBQUN0UixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGdCQUFnQixFQUErQixNQUFNLGtEQUFrRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFM0QsdUNBQXVDO0FBRWhDLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsVUFBVTtJQU0zRCxJQUFJLE1BQU0sS0FBSyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBRXJDLElBQUksZUFBZTtRQUNsQixJQUFJLElBQUksQ0FBQyxNQUFNLENB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