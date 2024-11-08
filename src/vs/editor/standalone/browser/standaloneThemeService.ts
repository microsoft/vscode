/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { addMatchMediaChangeListener } from '../../../base/browser/browser.js';
import { Color } from '../../../base/common/color.js';
import { Emitter } from '../../../base/common/event.js';
import { TokenizationRegistry } from '../../common/languages.js';
import { FontStyle, TokenMetadata } from '../../common/encodedTokenAttributes.js';
import { ITokenThemeRule, TokenTheme, generateTokensCSSForColorMap } from '../../common/languages/supports/tokenization.js';
import { BuiltinTheme, IStandaloneTheme, IStandaloneThemeData, IStandaloneThemeService } from '../common/standaloneTheme.js';
import { hc_black, hc_light, vs, vs_dark } from '../common/themes.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { asCssVariableName, ColorIdentifier, Extensions, IColorRegistry } from '../../../platform/theme/common/colorRegistry.js';
import { Extensions as ThemingExtensions, ICssStyleCollector, IFileIconTheme, IProductIconTheme, IThemingRegistry, ITokenStyle } from '../../../platform/theme/common/themeService.js';
import { IDisposable, Disposable } from '../../../base/common/lifecycle.js';
import { ColorScheme, isDark, isHighContrast } from '../../../platform/theme/common/theme.js';
import { getIconsStyleSheet, UnthemedProductIconTheme } from '../../../platform/theme/browser/iconsStyleSheet.js';
import { mainWindow } from '../../../base/browser/window.js';

export const VS_LIGHT_THEME_NAME = 'vs';
export const VS_DARK_THEME_NAME = 'vs-dark';
export const HC_BLACK_THEME_NAME = 'hc-black';
export const HC_LIGHT_THEME_NAME = 'hc-light';

const colorRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);
const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);

class StandaloneTheme implements IStandaloneTheme {

	public readonly id: string;
	public readonly themeName: string;

	private readonly themeData: IStandaloneThemeData;
	private colors: Map<string, Color> | null;
	private readonly defaultColors: { [colorId: string]: Color | undefined };
	private _tokenTheme: TokenTheme | null;

	constructor(name: string, standaloneThemeData: IStandaloneThemeData) {
		this.themeData = standaloneThemeData;
		const base = standaloneThemeData.base;
		if (name.length > 0) {
			if (isBuiltinTheme(name)) {
				this.id = name;
			} else {
				this.id = base + ' ' + name;
			}
			this.themeName = name;
		} else {
			this.id = base;
			this.themeName = base;
		}
		this.colors = null;
		this.defaultColors = Object.create(null);
		this._tokenTheme = null;
	}

	public get label(): string {
		return this.themeName;
	}

	public get base(): string {
		return this.themeData.base;
	}

	public notifyBaseUpdated() {
		if (this.themeData.inherit) {
			this.colors = null;
			this._tokenTheme = null;
		}
	}

	private getColors(): Map<string, Color> {
		if (!this.colors) {
			const colors = new Map<string, Color>();
			for (const id in this.themeData.colors) {
				colors.set(id, Color.fromHex(this.themeData.colors[id]));
			}
			if (this.themeData.inherit) {
				const baseData = getBuiltinRules(this.themeData.base);
				for (const id in baseData.colors) {
					if (!colors.has(id)) {
						colors.set(id, Color.fromHex(baseData.colors[id]));
					}
				}
			}
			this.colors = colors;
		}
		return this.colors;
	}

	public getColor(colorId: ColorIdentifier, useDefault?: boolean): Color | undefined {
		const color = this.getColors().get(colorId);
		if (color) {
			return color;
		}
		if (useDefault !== false) {
			return this.getDefault(colorId);
		}
		return undefined;
	}

	private getDefault(colorId: ColorIdentifier): Color | undefined {
		let color = this.defaultColors[colorId];
		if (color) {
			return color;
		}
		color = colorRegistry.resolveDefaultColor(colorId, this);
		this.defaultColors[colorId] = color;
		return color;
	}

	public defines(colorId: ColorIdentifier): boolean {
		return this.getColors().has(colorId);
	}

	public get type(): ColorScheme {
		switch (this.base) {
			case VS_LIGHT_THEME_NAME: return ColorScheme.LIGHT;
			case HC_BLACK_THEME_NAME: return ColorScheme.HIGH_CONTRAST_DARK;
			case HC_LIGHT_THEME_NAME: return ColorScheme.HIGH_CONTRAST_LIGHT;
			default: return ColorScheme.DARK;
		}
	}

	public get tokenTheme(): TokenTheme {
		if (!this._tokenTheme) {
			let rules: ITokenThemeRule[] = [];
			let encodedTokensColors: string[] = [];
			if (this.themeData.inherit) {
				const baseData = getBuiltinRules(this.themeData.base);
				rules = baseData.rules;
				if (baseData.encodedTokensColors) {
					encodedTokensColors = baseData.encodedTokensColors;
				}
			}
			// Pick up default colors from `editor.foreground` and `editor.background` if available
			const editorForeground = this.themeData.colors['editor.foreground'];
			const editorBackground = this.themeData.colors['editor.background'];
			if (editorForeground || editorBackground) {
				const rule: ITokenThemeRule = { token: '' };
				if (editorForeground) {
					rule.foreground = editorForeground;
				}
				if (editorBackground) {
					rule.background = editorBackground;
				}
				rules.push(rule);
			}
			rules = rules.concat(this.themeData.rules);
			if (this.themeData.encodedTokensColors) {
				encodedTokensColors = this.themeData.encodedTokensColors;
			}
			this._tokenTheme = TokenTheme.createFromRawTokenTheme(rules, encodedTokensColors);
		}
		return this._tokenTheme;
	}

	public getTokenStyleMetadata(type: string, modifiers: string[], modelLanguage: string): ITokenStyle | undefined {
		// use theme rules match
		const style = this.tokenTheme._match([type].concat(modifiers).join('.'));
		const metadata = style.metadata;
		const foreground = TokenMetadata.getForeground(metadata);
		const fontStyle = TokenMetadata.getFontStyle(metadata);
		return {
			foreground: foreground,
			italic: Boolean(fontStyle & FontStyle.Italic),
			bold: Boolean(fontStyle & FontStyle.Bold),
			underline: Boolean(fontStyle & FontStyle.Underline),
			strikethrough: Boolean(fontStyle & FontStyle.Strikethrough)
		};
	}

	public get tokenColorMap(): string[] {
		return [];
	}

	public readonly semanticHighlighting = false;
}

function isBuiltinTheme(themeName: string): themeName is BuiltinTheme {
	return (
		themeName === VS_LIGHT_THEME_NAME
		|| themeName === VS_DARK_THEME_NAME
		|| themeName === HC_BLACK_THEME_NAME
		|| themeName === HC_LIGHT_THEME_NAME
	);
}

function getBuiltinRules(builtinTheme: BuiltinTheme): IStandaloneThemeData {
	switch (builtinTheme) {
		case VS_LIGHT_THEME_NAME:
			return vs;
		case VS_DARK_THEME_NAME:
			return vs_dark;
		case HC_BLACK_THEME_NAME:
			return hc_black;
		case HC_LIGHT_THEME_NAME:
			return hc_light;
	}
}

function newBuiltInTheme(builtinTheme: BuiltinTheme): StandaloneTheme {
	const themeData = getBuiltinRules(builtinTheme);
	return new StandaloneTheme(builtinTheme, themeData);
}

export class StandaloneThemeService extends Disposable implements IStandaloneThemeService {

	declare readonly _serviceBrand: undefined;

	private readonly _onColorThemeChange = this._register(new Emitter<IStandaloneTheme>());
	public readonly onDidColorThemeChange = this._onColorThemeChange.event;

	private readonly _onFileIconThemeChange = this._register(new Emitter<IFileIconTheme>());
	public readonly onDidFileIconThemeChange = this._onFileIconThemeChange.event;

	private readonly _onProductIconThemeChange = this._register(new Emitter<IProductIconTheme>());
	public readonly onDidProductIconThemeChange = this._onProductIconThemeChange.event;

	private readonly _environment: IEnvironmentService = Object.create(null);
	private readonly _knownThemes: Map<string, StandaloneTheme>;
	private _autoDetectHighContrast: boolean;
	private _codiconCSS: string;
	private _themeCSS: string;
	private _allCSS: string;
	private _globalStyleElement: HTMLStyleElement | null;
	private _styleElements: HTMLStyleElement[];
	private _colorMapOverride: Color[] | null;
	private _theme!: IStandaloneTheme;

	private _builtInProductIconTheme = new UnthemedProductIconTheme();

	constructor() {
		super();

		this._autoDetectHighContrast = true;

		this._knownThemes = new Map<string, StandaloneTheme>();
		this._knownThemes.set(VS_LIGHT_THEME_NAME, newBuiltInTheme(VS_LIGHT_THEME_NAME));
		this._knownThemes.set(VS_DARK_THEME_NAME, newBuiltInTheme(VS_DARK_THEME_NAME));
		this._knownThemes.set(HC_BLACK_THEME_NAME, newBuiltInTheme(HC_BLACK_THEME_NAME));
		this._knownThemes.set(HC_LIGHT_THEME_NAME, newBuiltInTheme(HC_LIGHT_THEME_NAME));

		const iconsStyleSheet = this._register(getIconsStyleSheet(this));

		this._codiconCSS = iconsStyleSheet.getCSS();
		this._themeCSS = '';
		this._allCSS = `${this._codiconCSS}\n${this._themeCSS}`;
		this._globalStyleElement = null;
		this._styleElements = [];
		this._colorMapOverride = null;
		this.setTheme(VS_LIGHT_THEME_NAME);
		this._onOSSchemeChanged();

		this._register(iconsStyleSheet.onDidChange(() => {
			this._codiconCSS = iconsStyleSheet.getCSS();
			this._updateCSS();
		}));

		addMatchMediaChangeListener(mainWindow, '(forced-colors: active)', () => {
			this._onOSSchemeChanged();
		});
	}

	public registerEditorContainer(domNode: HTMLElement): IDisposable {
		if (dom.isInShadowDOM(domNode)) {
			return this._registerShadowDomContainer(domNode);
		}
		return this._registerRegularEditorContainer();
	}

	private _registerRegularEditorContainer(): IDisposable {
		if (!this._globalStyleElement) {
			this._globalStyleElement = dom.createStyleSheet(undefined, style => {
				style.className = 'monaco-colors';
				style.textContent = this._allCSS;
			});
			this._styleElements.push(this._globalStyleElement);
		}
		return Disposable.None;
	}

	private _registerShadowDomContainer(domNode: HTMLElement): IDisposable {
		const styleElement = dom.createStyleSheet(domNode, style => {
			style.className = 'monaco-colors';
			style.textContent = this._allCSS;
		});
		this._styleElements.push(styleElement);
		return {
			dispose: () => {
				for (let i = 0; i < this._styleElements.length; i++) {
					if (this._styleElements[i] === styleElement) {
						this._styleElements.splice(i, 1);
						return;
					}
				}
			}
		};
	}

	public defineTheme(themeName: string, themeData: IStandaloneThemeData): void {
		if (!/^[a-z0-9\-]+$/i.test(themeName)) {
			throw new Error('Illegal theme name!');
		}
		if (!isBuiltinTheme(themeData.base) && !isBuiltinTheme(themeName)) {
			throw new Error('Illegal theme base!');
		}
		// set or replace theme
		this._knownThemes.set(themeName, new StandaloneTheme(themeName, themeData));

		if (isBuiltinTheme(themeName)) {
			this._knownThemes.forEach(theme => {
				if (theme.base === themeName) {
					theme.notifyBaseUpdated();
				}
			});
		}
		if (this._theme.themeName === themeName) {
			this.setTheme(themeName); // refresh theme
		}
	}

	public getColorTheme(): IStandaloneTheme {
		return this._theme;
	}

	public setColorMapOverride(colorMapOverride: Color[] | null): void {
		this._colorMapOverride = colorMapOverride;
		this._updateThemeOrColorMap();
	}

	public setTheme(themeName: string): void {
		let theme: StandaloneTheme | undefined;
		if (this._knownThemes.has(themeName)) {
			theme = this._knownThemes.get(themeName);
		} else {
			theme = this._knownThemes.get(VS_LIGHT_THEME_NAME);
		}
		this._updateActualTheme(theme);
	}

	private _updateActualTheme(desiredTheme: IStandaloneTheme | undefined): void {
		if (!desiredTheme || this._theme === desiredTheme) {
			// Nothing to do
			return;
		}
		this._theme = desiredTheme;
		this._updateThemeOrColorMap();
	}

	private _onOSSchemeChanged() {
		if (this._autoDetectHighContrast) {
			const wantsHighContrast = mainWindow.matchMedia(`(forced-colors: active)`).matches;
			if (wantsHighContrast !== isHighContrast(this._theme.type)) {
				// switch to high contrast or non-high contrast but stick to dark or light
				let newThemeName;
				if (isDark(this._theme.type)) {
					newThemeName = wantsHighContrast ? HC_BLACK_THEME_NAME : VS_DARK_THEME_NAME;
				} else {
					newThemeName = wantsHighContrast ? HC_LIGHT_THEME_NAME : VS_LIGHT_THEME_NAME;
				}
				this._updateActualTheme(this._knownThemes.get(newThemeName));
			}
		}
	}

	public setAutoDetectHighContrast(autoDetectHighContrast: boolean): void {
		this._autoDetectHighContrast = autoDetectHighContrast;
		this._onOSSchemeChanged();
	}

	private _updateThemeOrColorMap(): void {
		const cssRules: string[] = [];
		const hasRule: { [rule: string]: boolean } = {};
		const ruleCollector: ICssStyleCollector = {
			addRule: (rule: string) => {
				if (!hasRule[rule]) {
					cssRules.push(rule);
					hasRule[rule] = true;
				}
			}
		};
		themingRegistry.getThemingParticipants().forEach(p => p(this._theme, ruleCollector, this._environment));

		const colorVariables: string[] = [];
		for (const item of colorRegistry.getColors()) {
			const color = this._theme.getColor(item.id, true);
			if (color) {
				colorVariables.push(`${asCssVariableName(item.id)}: ${color.toString()};`);
			}
		}
		ruleCollector.addRule(`.monaco-editor, .monaco-diff-editor, .monaco-component { ${colorVariables.join('\n')} }`);

		const colorMap = this._colorMapOverride || this._theme.tokenTheme.getColorMap();
		ruleCollector.addRule(generateTokensCSSForColorMap(colorMap));

		this._themeCSS = cssRules.join('\n');
		this._updateCSS();

		TokenizationRegistry.setColorMap(colorMap);
		this._onColorThemeChange.fire(this._theme);
	}

	private _updateCSS(): void {
		this._allCSS = `${this._codiconCSS}\n${this._themeCSS}`;
		this._styleElements.forEach(styleElement => styleElement.textContent = this._allCSS);
	}

	public getFileIconTheme(): IFileIconTheme {
		return {
			hasFileIcons: false,
			hasFolderIcons: false,
			hidesExplorerArrows: false
		};
	}

	public getProductIconTheme(): IProductIconTheme {
		return this._builtInProductIconTheme;
	}

}
