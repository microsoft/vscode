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
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { EditorFontLigatures } from '../../../../editor/common/config/editorOptions.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../editor/common/config/fontInfo.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import * as colorRegistry from '../../../../platform/theme/common/colorRegistry.js';
import { getSizeRegistry, sizeValueToCss } from '../../../../platform/theme/common/sizeRegistry.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
let WebviewThemeDataProvider = class WebviewThemeDataProvider extends Disposable {
    constructor(_themeService, _configurationService) {
        super();
        this._themeService = _themeService;
        this._configurationService = _configurationService;
        this._cachedWebViewThemeData = undefined;
        this._onThemeDataChanged = this._register(new Emitter());
        this.onThemeDataChanged = this._onThemeDataChanged.event;
        this._register(this._themeService.onDidColorThemeChange(() => {
            this._reset();
        }));
        const webviewConfigurationKeys = ['editor.fontFamily', 'editor.fontWeight', 'editor.fontSize', 'editor.fontLigatures', 'accessibility.underlineLinks'];
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (webviewConfigurationKeys.some(key => e.affectsConfiguration(key))) {
                this._reset();
            }
        }));
    }
    getTheme() {
        return this._themeService.getColorTheme();
    }
    getWebviewThemeData() {
        if (!this._cachedWebViewThemeData) {
            const configuration = this._configurationService.getValue('editor');
            const editorFontFamily = configuration.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
            const editorFontWeight = configuration.fontWeight || EDITOR_FONT_DEFAULTS.fontWeight;
            const editorFontSize = configuration.fontSize || EDITOR_FONT_DEFAULTS.fontSize;
            const editorFontLigatures = new EditorFontLigatures().validate(configuration.fontLigatures);
            const linkUnderlines = this._configurationService.getValue('accessibility.underlineLinks');
            const theme = this._themeService.getColorTheme();
            const exportedColors = colorRegistry.getColorRegistry().getColors().reduce((colors, entry) => {
                const color = theme.getColor(entry.id);
                if (color) {
                    colors['vscode-' + entry.id.replace('.', '-')] = color.toString();
                }
                return colors;
            }, {});
            const sizeRegistry = getSizeRegistry();
            const exportedSizes = sizeRegistry.getSizes().reduce((sizes, entry) => {
                const sizeValue = sizeRegistry.resolveDefaultSize(entry.id, theme);
                if (sizeValue) {
                    sizes['vscode-' + entry.id.replace(/\./g, '-')] = sizeValueToCss(sizeValue);
                }
                return sizes;
            }, {});
            const styles = {
                'vscode-font-family': DEFAULT_FONT_FAMILY,
                'vscode-font-weight': 'normal',
                'vscode-font-size': '13px',
                'vscode-editor-font-family': editorFontFamily,
                'vscode-editor-font-weight': editorFontWeight,
                'vscode-editor-font-size': editorFontSize + 'px',
                'text-link-decoration': linkUnderlines ? 'underline' : 'none',
                ...exportedColors,
                ...exportedSizes,
                'vscode-editor-font-feature-settings': editorFontLigatures,
            };
            const activeTheme = ApiThemeClassName.fromTheme(theme);
            this._cachedWebViewThemeData = { styles, activeTheme, themeLabel: theme.label, themeId: theme.settingsId };
        }
        return this._cachedWebViewThemeData;
    }
    _reset() {
        this._cachedWebViewThemeData = undefined;
        this._onThemeDataChanged.fire();
    }
};
WebviewThemeDataProvider = __decorate([
    __param(0, IWorkbenchThemeService),
    __param(1, IConfigurationService)
], WebviewThemeDataProvider);
export { WebviewThemeDataProvider };
var ApiThemeClassName;
(function (ApiThemeClassName) {
    ApiThemeClassName["light"] = "vscode-light";
    ApiThemeClassName["dark"] = "vscode-dark";
    ApiThemeClassName["highContrast"] = "vscode-high-contrast";
    ApiThemeClassName["highContrastLight"] = "vscode-high-contrast-light";
})(ApiThemeClassName || (ApiThemeClassName = {}));
(function (ApiThemeClassName) {
    function fromTheme(theme) {
        switch (theme.type) {
            case ColorScheme.LIGHT: return ApiThemeClassName.light;
            case ColorScheme.DARK: return ApiThemeClassName.dark;
            case ColorScheme.HIGH_CONTRAST_DARK: return ApiThemeClassName.highContrast;
            case ColorScheme.HIGH_CONTRAST_LIGHT: return ApiThemeClassName.highContrastLight;
        }
    }
    ApiThemeClassName.fromTheme = fromTheme;
})(ApiThemeClassName || (ApiThemeClassName = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvdGhlbWVpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQWtCLG1CQUFtQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDeEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxLQUFLLGFBQWEsTUFBTSxvREFBb0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RSxPQUFPLEVBQXdCLHNCQUFzQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFVakgsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBT3ZELFlBQ3lCLGFBQXNELEVBQ3ZELHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUhpQyxrQkFBYSxHQUFiLGFBQWEsQ0FBd0I7UUFDdEMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQVA3RSw0QkFBdUIsR0FBaUMsU0FBUyxDQUFDO1FBRXpELHdCQUFtQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNE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