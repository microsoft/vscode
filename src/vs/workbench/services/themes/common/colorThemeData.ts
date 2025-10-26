/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../base/common/path.js';
import * as Json from '../../../../base/common/json.js';
import { Color } from '../../../../base/common/color.js';
import { ExtensionData, ITokenColorCustomizations, ITextMateThemingRule, IWorkbenchColorTheme, IColorMap, IThemeExtensionPoint, IColorCustomizations, ISemanticTokenRules, ISemanticTokenColorizationSetting, ISemanticTokenColorCustomizations, IThemeScopableCustomizations, IThemeScopedCustomizations, THEME_SCOPE_CLOSE_PAREN, THEME_SCOPE_OPEN_PAREN, themeScopeRegex, THEME_SCOPE_WILDCARD } from './workbenchThemeService.js';
import { convertSettings } from './themeCompatibility.js';
import * as nls from '../../../../nls.js';
import * as types from '../../../../base/common/types.js';
import * as resources from '../../../../base/common/resources.js';
import { Extensions as ColorRegistryExtensions, IColorRegistry, ColorIdentifier, editorBackground, editorForeground, DEFAULT_COLOR_CONFIG_VALUE } from '../../../../platform/theme/common/colorRegistry.js';
import { ITokenStyle, getThemeTypeSelector } from '../../../../platform/theme/common/themeService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { getParseErrorMessage } from '../../../../base/common/jsonErrorMessages.js';
import { URI } from '../../../../base/common/uri.js';
import { parse as parsePList } from './plistParser.js';
import { TokenStyle, SemanticTokenRule, ProbeScope, getTokenClassificationRegistry, TokenStyleValue, TokenStyleData, parseClassifierString } from '../../../../platform/theme/common/tokenClassificationRegistry.js';
import { MatcherWithPriority, Matcher, createMatchers } from './textMateScopeMatcher.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { CharCode } from '../../../../base/common/charCode.js';
import { StorageScope, IStorageService, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ThemeConfiguration } from './themeConfiguration.js';
import { ColorScheme, ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';
import { ColorId, FontStyle, MetadataConsts } from '../../../../editor/common/encodedTokenAttributes.js';
import { toStandardTokenType } from '../../../../editor/common/languages/supports/tokenization.js';

const colorRegistry = Registry.as<IColorRegistry>(ColorRegistryExtensions.ColorContribution);

const tokenClassificationRegistry = getTokenClassificationRegistry();

const tokenGroupToScopesMap = {
	comments: ['comment', 'punctuation.definition.comment'],
	strings: ['string', 'meta.embedded.assembly'],
	keywords: ['keyword - keyword.operator', 'keyword.control', 'storage', 'storage.type'],
	numbers: ['constant.numeric'],
	types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
	functions: ['entity.name.function', 'support.function'],
	variables: ['variable', 'entity.name.variable']
};


export type TokenStyleDefinition = SemanticTokenRule | ProbeScope[] | TokenStyleValue;
export type TokenStyleDefinitions = { [P in keyof TokenStyleData]?: TokenStyleDefinition | undefined };

export type TextMateThemingRuleDefinitions = { [P in keyof TokenStyleData]?: ITextMateThemingRule | undefined; } & { scope?: ProbeScope };

interface IColorOrDefaultMap {
	[id: string]: Color | typeof DEFAULT_COLOR_CONFIG_VALUE;
}

export class ColorThemeData implements IWorkbenchColorTheme {

	static readonly STORAGE_KEY = 'colorThemeData';

	id: string;
	label: string;
	settingsId: string;
	description?: string;
	isLoaded: boolean;
	location?: URI; // only set for extension from the registry, not for themes restored from the storage
	watch?: boolean;
	extensionData?: ExtensionData;

	private themeSemanticHighlighting: boolean | undefined;
	private customSemanticHighlighting: boolean | undefined;
	private customSemanticHighlightingDeprecated: boolean | undefined;

	private themeTokenColors: ITextMateThemingRule[] = [];
	private customTokenColors: ITextMateThemingRule[] = [];
	private colorMap: IColorMap = {};
	private customColorMap: IColorOrDefaultMap = {};

	private semanticTokenRules: SemanticTokenRule[] = [];
	private customSemanticTokenRules: SemanticTokenRule[] = [];

	private themeTokenScopeMatchers: Matcher<ProbeScope>[] | undefined;
	private customTokenScopeMatchers: Matcher<ProbeScope>[] | undefined;

	private textMateThemingRules: ITextMateThemingRule[] | undefined = undefined; // created on demand
	private tokenColorIndex: TokenColorIndex | undefined = undefined; // created on demand

	private constructor(id: string, label: string, settingsId: string) {
		this.id = id;
		this.label = label;
		this.settingsId = settingsId;
		this.isLoaded = false;
	}

	get semanticHighlighting(): boolean {
		if (this.customSemanticHighlighting !== undefined) {
			return this.customSemanticHighlighting;
		}
		if (this.customSemanticHighlightingDeprecated !== undefined) {
			return this.customSemanticHighlightingDeprecated;
		}
		return !!this.themeSemanticHighlighting;
	}

	get tokenColors(): ITextMateThemingRule[] {
		if (!this.textMateThemingRules) {
			const result: ITextMateThemingRule[] = [];

			// the default rule (scope empty) is always the first rule. Ignore all other default rules.
			const foreground = this.getColor(editorForeground) || this.getDefault(editorForeground)!;
			const background = this.getColor(editorBackground) || this.getDefault(editorBackground)!;
			result.push({
				settings: {
					foreground: normalizeColor(foreground),
					background: normalizeColor(background)
				}
			});

			let hasDefaultTokens = false;

			function addRule(rule: ITextMateThemingRule) {
				if (rule.scope && rule.settings) {
					if (rule.scope === 'token.info-token') {
						hasDefaultTokens = true;
					}
					result.push({ scope: rule.scope, settings: { foreground: normalizeColor(rule.settings.foreground), background: normalizeColor(rule.settings.background), fontStyle: rule.settings.fontStyle } });
				}
			}

			this.themeTokenColors.forEach(addRule);
			// Add the custom colors after the theme colors
			// so that they will override them
			this.customTokenColors.forEach(addRule);

			if (!hasDefaultTokens) {
				defaultThemeColors[this.type].forEach(addRule);
			}
			this.textMateThemingRules = result;
		}
		return this.textMateThemingRules;
	}

	public getColor(colorId: ColorIdentifier, useDefault?: boolean): Color | undefined {
		const customColor = this.customColorMap[colorId];
		if (customColor instanceof Color) {
			return customColor;
		}
		if (customColor === undefined) { /* !== DEFAULT_COLOR_CONFIG_VALUE */
			const color = this.colorMap[colorId];
			if (color !== undefined) {
				return color;
			}
		}
		if (useDefault !== false) {
			return this.getDefault(colorId);
		}
		return undefined;
	}

	private getTokenStyle(type: string, modifiers: string[], language: string, useDefault = true, definitions: TokenStyleDefinitions = {}): TokenStyle | undefined {
		const result: any = {
			foreground: undefined,
			bold: undefined,
			underline: undefined,
			strikethrough: undefined,
			italic: undefined
		};
		const score = {
			foreground: -1,
			bold: -1,
			underline: -1,
			strikethrough: -1,
			italic: -1
		};

		function _processStyle(matchScore: number, style: TokenStyle, definition: TokenStyleDefinition) {
			if (style.foreground && score.foreground <= matchScore) {
				score.foreground = matchScore;
				result.foreground = style.foreground;
				definitions.foreground = definition;
			}
			for (const p of ['bold', 'underline', 'strikethrough', 'italic']) {
				const property = p as keyof TokenStyle;
				const info = style[property];
				if (info !== undefined) {
					if (score[property] <= matchScore) {
						score[property] = matchScore;
						result[property] = info;
						definitions[property] = definition;
					}
				}
			}
		}
		function _processSemanticTokenRule(rule: SemanticTokenRule) {
			const matchScore = rule.selector.match(type, modifiers, language);
			if (matchScore >= 0) {
				_processStyle(matchScore, rule.style, rule);
			}
		}

		this.semanticTokenRules.forEach(_processSemanticTokenRule);
		this.customSemanticTokenRules.forEach(_processSemanticTokenRule);

		let hasUndefinedStyleProperty = false;
		for (const k in score) {
			const key = k as keyof TokenStyle;
			if (score[key] === -1) {
				hasUndefinedStyleProperty = true;
			} else {
				score[key] = Number.MAX_VALUE; // set it to the max, so it won't be replaced by a default
			}
		}
		if (hasUndefinedStyleProperty) {
			for (const rule of tokenClassificationRegistry.getTokenStylingDefaultRules()) {
				const matchScore = rule.selector.match(type, modifiers, language);
				if (matchScore >= 0) {
					let style: TokenStyle | undefined;
					if (rule.defaults.scopesToProbe) {
						style = this.resolveScopes(rule.defaults.scopesToProbe);
						if (style) {
							_processStyle(matchScore, style, rule.defaults.scopesToProbe);
						}
					}
					if (!style && useDefault !== false) {
						const tokenStyleValue = rule.defaults[this.type];
						style = this.resolveTokenStyleValue(tokenStyleValue);
						if (style) {
							_processStyle(matchScore, style, tokenStyleValue!);
						}
					}
				}
			}
		}
		return TokenStyle.fromData(result);

	}

	/**
	 * @param tokenStyleValue Resolve a tokenStyleValue in the context of a theme
	 */
	public resolveTokenStyleValue(tokenStyleValue: TokenStyleValue | undefined): TokenStyle | undefined {
		if (tokenStyleValue === undefined) {
			return undefined;
		} else if (typeof tokenStyleValue === 'string') {
			const { type, modifiers, language } = parseClassifierString(tokenStyleValue, '');
			return this.getTokenStyle(type, modifiers, language);
		} else if (typeof tokenStyleValue === 'object') {
			return tokenStyleValue;
		}
		return undefined;
	}

	public getTokenColorIndex(): TokenColorIndex {
		// collect all colors that tokens can have
		if (!this.tokenColorIndex) {
			const index = new TokenColorIndex();
			this.tokenColors.forEach(rule => {
				index.add(rule.settings.foreground);
				index.add(rule.settings.background);
			});

			this.semanticTokenRules.forEach(r => index.add(r.style.foreground));
			tokenClassificationRegistry.getTokenStylingDefaultRules().forEach(r => {
				const defaultColor = r.defaults[this.type];
				if (defaultColor && typeof defaultColor === 'object') {
					index.add(defaultColor.foreground);
				}
			});
			this.customSemanticTokenRules.forEach(r => index.add(r.style.foreground));

			this.tokenColorIndex = index;
		}
		return this.tokenColorIndex;
	}

	public get tokenColorMap(): string[] {
		return this.getTokenColorIndex().asArray();
	}

	public getTokenStyleMetadata(typeWithLanguage: string, modifiers: string[], defaultLanguage: string, useDefault = true, definitions: TokenStyleDefinitions = {}): ITokenStyle | undefined {
		const { type, language } = parseClassifierString(typeWithLanguage, defaultLanguage);
		const style = this.getTokenStyle(type, modifiers, language, useDefault, definitions);
		if (!style) {
			return undefined;
		}

		return {
			foreground: this.getTokenColorIndex().get(style.foreground),
			bold: style.bold,
			underline: style.underline,
			strikethrough: style.strikethrough,
			italic: style.italic,
		};
	}

	public getTokenStylingRuleScope(rule: SemanticTokenRule): 'setting' | 'theme' | undefined {
		if (this.customSemanticTokenRules.indexOf(rule) !== -1) {
			return 'setting';
		}
		if (this.semanticTokenRules.indexOf(rule) !== -1) {
			return 'theme';
		}
		return undefined;
	}

	public getDefault(colorId: ColorIdentifier): Color | undefined {
		return colorRegistry.resolveDefaultColor(colorId, this);
	}


	public resolveScopes(scopes: ProbeScope[], definitions?: TextMateThemingRuleDefinitions): TokenStyle | undefined {

		if (!this.themeTokenScopeMatchers) {
			this.themeTokenScopeMatchers = this.themeTokenColors.map(getScopeMatcher);
		}
		if (!this.customTokenScopeMatchers) {
			this.customTokenScopeMatchers = this.customTokenColors.map(getScopeMatcher);
		}

		for (const scope of scopes) {
			let foreground: string | undefined = undefined;
			let fontStyle: string | undefined = undefined;
			let foregroundScore = -1;
			let fontStyleScore = -1;
			let fontStyleThemingRule: ITextMateThemingRule | undefined = undefined;
			let foregroundThemingRule: ITextMateThemingRule | undefined = undefined;

			function findTokenStyleForScopeInScopes(scopeMatchers: Matcher<ProbeScope>[], themingRules: ITextMateThemingRule[]) {
				for (let i = 0; i < scopeMatchers.length; i++) {
					const score = scopeMatchers[i](scope);
					if (score >= 0) {
						const themingRule = themingRules[i];
						const settings = themingRules[i].settings;
						if (score >= foregroundScore && settings.foreground) {
							foreground = settings.foreground;
							foregroundScore = score;
							foregroundThemingRule = themingRule;
						}
						if (score >= fontStyleScore && types.isString(settings.fontStyle)) {
							fontStyle = settings.fontStyle;
							fontStyleScore = score;
							fontStyleThemingRule = themingRule;
						}
					}
				}
			}
			findTokenStyleForScopeInScopes(this.themeTokenScopeMatchers, this.themeTokenColors);
			findTokenStyleForScopeInScopes(this.customTokenScopeMatchers, this.customTokenColors);
			if (foreground !== undefined || fontStyle !== undefined) {
				if (definitions) {
					definitions.foreground = foregroundThemingRule;
					definitions.bold = definitions.italic = definitions.underline = definitions.strikethrough = fontStyleThemingRule;
					definitions.scope = scope;
				}

				return TokenStyle.fromSettings(foreground, fontStyle);
			}
		}
		return undefined;
	}

	public defines(colorId: ColorIdentifier): boolean {
		const customColor = this.customColorMap[colorId];
		if (customColor instanceof Color) {
			return true;
		}
		return customColor === undefined /* !== DEFAULT_COLOR_CONFIG_VALUE */ && this.colorMap.hasOwnProperty(colorId);
	}

	public setCustomizations(settings: ThemeConfiguration) {
		this.setCustomColors(settings.colorCustomizations);
		this.setCustomTokenColors(settings.tokenColorCustomizations);
		this.setCustomSemanticTokenColors(settings.semanticTokenColorCustomizations);
	}

	public setCustomColors(colors: IColorCustomizations) {
		this.customColorMap = {};
		this.overwriteCustomColors(colors);

		const themeSpecificColors = this.getThemeSpecificColors(colors) as IColorCustomizations;
		if (types.isObject(themeSpecificColors)) {
			this.overwriteCustomColors(themeSpecificColors);
		}

		this.tokenColorIndex = undefined;
		this.textMateThemingRules = undefined;
		this.customTokenScopeMatchers = undefined;
	}

	private overwriteCustomColors(colors: IColorCustomizations) {
		for (const id in colors) {
			const colorVal = colors[id];
			if (colorVal === DEFAULT_COLOR_CONFIG_VALUE) {
				this.customColorMap[id] = DEFAULT_COLOR_CONFIG_VALUE;
			} else if (typeof colorVal === 'string') {
				this.customColorMap[id] = Color.fromHex(colorVal);
			}
		}
	}

	public setCustomTokenColors(customTokenColors: ITokenColorCustomizations) {
		this.customTokenColors = [];
		this.customSemanticHighlightingDeprecated = undefined;

		// first add the non-theme specific settings
		this.addCustomTokenColors(customTokenColors);

		// append theme specific settings. Last rules will win.
		const themeSpecificTokenColors = this.getThemeSpecificColors(customTokenColors) as ITokenColorCustomizations;
		if (types.isObject(themeSpecificTokenColors)) {
			this.addCustomTokenColors(themeSpecificTokenColors);
		}

		this.tokenColorIndex = undefined;
		this.textMateThemingRules = undefined;
		this.customTokenScopeMatchers = undefined;
	}

	public setCustomSemanticTokenColors(semanticTokenColors: ISemanticTokenColorCustomizations | undefined) {
		this.customSemanticTokenRules = [];
		this.customSemanticHighlighting = undefined;

		if (semanticTokenColors) {
			this.customSemanticHighlighting = semanticTokenColors.enabled;
			if (semanticTokenColors.rules) {
				this.readSemanticTokenRules(semanticTokenColors.rules);
			}
			const themeSpecificColors = this.getThemeSpecificColors(semanticTokenColors) as ISemanticTokenColorCustomizations;
			if (types.isObject(themeSpecificColors)) {
				if (themeSpecificColors.enabled !== undefined) {
					this.customSemanticHighlighting = themeSpecificColors.enabled;
				}
				if (themeSpecificColors.rules) {
					this.readSemanticTokenRules(themeSpecificColors.rules);
				}
			}
		}

		this.tokenColorIndex = undefined;
		this.textMateThemingRules = undefined;
	}

	public isThemeScope(key: string): boolean {
		return key.charAt(0) === THEME_SCOPE_OPEN_PAREN && key.charAt(key.length - 1) === THEME_SCOPE_CLOSE_PAREN;
	}

	public isThemeScopeMatch(themeId: string): boolean {
		const themeIdFirstChar = themeId.charAt(0);
		const themeIdLastChar = themeId.charAt(themeId.length - 1);
		const themeIdPrefix = themeId.slice(0, -1);
		const themeIdInfix = themeId.slice(1, -1);
		const themeIdSuffix = themeId.slice(1);
		return themeId === this.settingsId
			|| (this.settingsId.includes(themeIdInfix) && themeIdFirstChar === THEME_SCOPE_WILDCARD && themeIdLastChar === THEME_SCOPE_WILDCARD)
			|| (this.settingsId.startsWith(themeIdPrefix) && themeIdLastChar === THEME_SCOPE_WILDCARD)
			|| (this.settingsId.endsWith(themeIdSuffix) && themeIdFirstChar === THEME_SCOPE_WILDCARD);
	}

	public getThemeSpecificColors(colors: IThemeScopableCustomizations): IThemeScopedCustomizations | undefined {
		let themeSpecificColors: IThemeScopedCustomizations | undefined;
		for (const key in colors) {
			const scopedColors = colors[key];
			if (this.isThemeScope(key) && scopedColors instanceof Object && !Array.isArray(scopedColors)) {
				const themeScopeList = key.match(themeScopeRegex) || [];
				for (const themeScope of themeScopeList) {
					const themeId = themeScope.substring(1, themeScope.length - 1);
					if (this.isThemeScopeMatch(themeId)) {
						if (!themeSpecificColors) {
							themeSpecificColors = {};
						}
						const scopedThemeSpecificColors = scopedColors as IThemeScopedCustomizations;
						for (const subkey in scopedThemeSpecificColors) {
							const originalColors = themeSpecificColors[subkey];
							const overrideColors = scopedThemeSpecificColors[subkey];
							if (Array.isArray(originalColors) && Array.isArray(overrideColors)) {
								themeSpecificColors[subkey] = originalColors.concat(overrideColors);
							} else if (overrideColors) {
								themeSpecificColors[subkey] = overrideColors;
							}
						}
					}
				}
			}
		}
		return themeSpecificColors;
	}

	private readSemanticTokenRules(tokenStylingRuleSection: ISemanticTokenRules) {
		for (const key in tokenStylingRuleSection) {
			if (!this.isThemeScope(key)) { // still do this test until experimental settings are gone
				try {
					const rule = readSemanticTokenRule(key, tokenStylingRuleSection[key]);
					if (rule) {
						this.customSemanticTokenRules.push(rule);
					}
				} catch (e) {
					// invalid selector, ignore
				}
			}
		}
	}

	private addCustomTokenColors(customTokenColors: ITokenColorCustomizations) {
		// Put the general customizations such as comments, strings, etc. first so that
		// they can be overridden by specific customizations like "string.interpolated"
		for (const tokenGroup in tokenGroupToScopesMap) {
			const group = <keyof typeof tokenGroupToScopesMap>tokenGroup; // TS doesn't type 'tokenGroup' properly
			const value = customTokenColors[group];
			if (value) {
				const settings = typeof value === 'string' ? { foreground: value } : value;
				const scopes = tokenGroupToScopesMap[group];
				for (const scope of scopes) {
					this.customTokenColors.push({ scope, settings });
				}
			}
		}

		// specific customizations
		if (Array.isArray(customTokenColors.textMateRules)) {
			for (const rule of customTokenColors.textMateRules) {
				if (rule.scope && rule.settings) {
					this.customTokenColors.push(rule);
				}
			}
		}
		if (customTokenColors.semanticHighlighting !== undefined) {
			this.customSemanticHighlightingDeprecated = customTokenColors.semanticHighlighting;
		}
	}

	public ensureLoaded(extensionResourceLoaderService: IExtensionResourceLoaderService): Promise<void> {
		return !this.isLoaded ? this.load(extensionResourceLoaderService) : Promise.resolve(undefined);
	}

	public reload(extensionResourceLoaderService: IExtensionResourceLoaderService): Promise<void> {
		return this.load(extensionResourceLoaderService);
	}

	private load(extensionResourceLoaderService: IExtensionResourceLoaderService): Promise<void> {
		if (!this.location) {
			return Promise.resolve(undefined);
		}
		this.themeTokenColors = [];
		this.clearCaches();

		const result = {
			colors: {},
			textMateRules: [],
			semanticTokenRules: [],
			semanticHighlighting: false
		};
		return _loadColorTheme(extensionResourceLoaderService, this.location, result).then(_ => {
			this.isLoaded = true;
			this.semanticTokenRules = result.semanticTokenRules;
			this.colorMap = result.colors;
			this.themeTokenColors = result.textMateRules;
			this.themeSemanticHighlighting = result.semanticHighlighting;
		});
	}

	public clearCaches() {
		this.tokenColorIndex = undefined;
		this.textMateThemingRules = undefined;
		this.themeTokenScopeMatchers = undefined;
		this.customTokenScopeMatchers = undefined;
	}

	toStorage(storageService: IStorageService) {
		const colorMapData: { [key: string]: string } = {};
		for (const key in this.colorMap) {
			colorMapData[key] = Color.Format.CSS.formatHexA(this.colorMap[key], true);
		}
		// no need to persist custom colors, they will be taken from the settings
		const value = JSON.stringify({
			id: this.id,
			label: this.label,
			settingsId: this.settingsId,
			themeTokenColors: this.themeTokenColors.map(tc => ({ settings: tc.settings, scope: tc.scope })), // don't persist names
			semanticTokenRules: this.semanticTokenRules.map(SemanticTokenRule.toJSONObject),
			extensionData: ExtensionData.toJSONObject(this.extensionData),
			themeSemanticHighlighting: this.themeSemanticHighlighting,
			colorMap: colorMapData,
			watch: this.watch
		});

		// roam persisted color theme colors. Don't enable for icons as they contain references to fonts and images.
		storageService.store(ColorThemeData.STORAGE_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	get themeTypeSelector(): ThemeTypeSelector {
		return this.classNames[0] as ThemeTypeSelector;
	}

	get classNames(): string[] {
		return this.id.split(' ');
	}

	get type(): ColorScheme {
		switch (this.themeTypeSelector) {
			case ThemeTypeSelector.VS: return ColorScheme.LIGHT;
			case ThemeTypeSelector.HC_BLACK: return ColorScheme.HIGH_CONTRAST_DARK;
			case ThemeTypeSelector.HC_LIGHT: return ColorScheme.HIGH_CONTRAST_LIGHT;
			default: return ColorScheme.DARK;
		}
	}

	// constructors

	static createUnloadedThemeForThemeType(themeType: ColorScheme, colorMap?: { [id: string]: string }): ColorThemeData {
		return ColorThemeData.createUnloadedTheme(getThemeTypeSelector(themeType), colorMap);
	}

	static createUnloadedTheme(id: string, colorMap?: { [id: string]: string }): ColorThemeData {
		const themeData = new ColorThemeData(id, '', '__' + id);
		themeData.isLoaded = false;
		themeData.themeTokenColors = [];
		themeData.watch = false;
		if (colorMap) {
			for (const id in colorMap) {
				themeData.colorMap[id] = Color.fromHex(colorMap[id]);
			}
		}
		return themeData;
	}

	static createLoadedEmptyTheme(id: string, settingsId: string): ColorThemeData {
		const themeData = new ColorThemeData(id, '', settingsId);
		themeData.isLoaded = true;
		themeData.themeTokenColors = [];
		themeData.watch = false;
		return themeData;
	}

	static fromStorageData(storageService: IStorageService): ColorThemeData | undefined {
		const input = storageService.get(ColorThemeData.STORAGE_KEY, StorageScope.PROFILE);
		if (!input) {
			return undefined;
		}
		try {
			const data = JSON.parse(input);
			const theme = new ColorThemeData('', '', '');
			for (const key in data) {
				switch (key) {
					case 'colorMap': {
						const colorMapData = data[key];
						for (const id in colorMapData) {
							theme.colorMap[id] = Color.fromHex(colorMapData[id]);
						}
						break;
					}
					case 'themeTokenColors':
					case 'id': case 'label': case 'settingsId': case 'watch': case 'themeSemanticHighlighting':
						// eslint-disable-next-line local/code-no-any-casts
						(theme as any)[key] = data[key];
						break;
					case 'semanticTokenRules': {
						const rulesData = data[key];
						if (Array.isArray(rulesData)) {
							for (const d of rulesData) {
								const rule = SemanticTokenRule.fromJSONObject(tokenClassificationRegistry, d);
								if (rule) {
									theme.semanticTokenRules.push(rule);
								}
							}
						}
						break;
					}
					case 'location':
						// ignore, no longer restore
						break;
					case 'extensionData':
						theme.extensionData = ExtensionData.fromJSONObject(data.extensionData);
						break;
				}
			}
			if (!theme.id || !theme.settingsId) {
				return undefined;
			}
			return theme;
		} catch (e) {
			return undefined;
		}
	}

	static fromExtensionTheme(theme: IThemeExtensionPoint, colorThemeLocation: URI, extensionData: ExtensionData): ColorThemeData {
		const baseTheme: string = theme['uiTheme'] || 'vs-dark';
		const themeSelector = toCSSSelector(extensionData.extensionId, theme.path);
		const id = `${baseTheme} ${themeSelector}`;
		const label = theme.label || basename(theme.path);
		const settingsId = theme.id || label;
		const themeData = new ColorThemeData(id, label, settingsId);
		themeData.description = theme.description;
		themeData.watch = theme._watch === true;
		themeData.location = colorThemeLocation;
		themeData.extensionData = extensionData;
		themeData.isLoaded = false;
		return themeData;
	}
}

function toCSSSelector(extensionId: string, path: string) {
	if (path.startsWith('./')) {
		path = path.substr(2);
	}
	let str = `${extensionId}-${path}`;

	//remove all characters that are not allowed in css
	str = str.replace(/[^_a-zA-Z0-9-]/g, '-');
	if (str.charAt(0).match(/[0-9-]/)) {
		str = '_' + str;
	}
	return str;
}

async function _loadColorTheme(extensionResourceLoaderService: IExtensionResourceLoaderService, themeLocation: URI, result: { textMateRules: ITextMateThemingRule[]; colors: IColorMap; semanticTokenRules: SemanticTokenRule[]; semanticHighlighting: boolean }): Promise<any> {
	if (resources.extname(themeLocation) === '.json') {
		const content = await extensionResourceLoaderService.readExtensionResource(themeLocation);
		const errors: Json.ParseError[] = [];
		const contentValue = Json.parse(content, errors);
		if (errors.length > 0) {
			return Promise.reject(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
		} else if (Json.getNodeType(contentValue) !== 'object') {
			return Promise.reject(new Error(nls.localize('error.invalidformat', "Invalid format for JSON theme file: Object expected.")));
		}
		if (contentValue.include) {
			await _loadColorTheme(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), contentValue.include), result);
		}
		if (Array.isArray(contentValue.settings)) {
			convertSettings(contentValue.settings, result);
			return null;
		}
		result.semanticHighlighting = result.semanticHighlighting || contentValue.semanticHighlighting;
		const colors = contentValue.colors;
		if (colors) {
			if (typeof colors !== 'object') {
				return Promise.reject(new Error(nls.localize({ key: 'error.invalidformat.colors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'colors' is not of type 'object'.", themeLocation.toString())));
			}
			// new JSON color themes format
			for (const colorId in colors) {
				const colorVal = colors[colorId];
				if (colorVal === DEFAULT_COLOR_CONFIG_VALUE) { // ignore colors that are set to to default
					delete result.colors[colorId];
				} else if (typeof colorVal === 'string') {
					result.colors[colorId] = Color.fromHex(colors[colorId]);
				}
			}
		}
		const tokenColors = contentValue.tokenColors;
		if (tokenColors) {
			if (Array.isArray(tokenColors)) {
				result.textMateRules.push(...tokenColors);
			} else if (typeof tokenColors === 'string') {
				await _loadSyntaxTokens(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), tokenColors), result);
			} else {
				return Promise.reject(new Error(nls.localize({ key: 'error.invalidformat.tokenColors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file", themeLocation.toString())));
			}
		}
		const semanticTokenColors = contentValue.semanticTokenColors;
		if (semanticTokenColors && typeof semanticTokenColors === 'object') {
			for (const key in semanticTokenColors) {
				try {
					const rule = readSemanticTokenRule(key, semanticTokenColors[key]);
					if (rule) {
						result.semanticTokenRules.push(rule);
					}
				} catch (e) {
					return Promise.reject(new Error(nls.localize({ key: 'error.invalidformat.semanticTokenColors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'semanticTokenColors' contains a invalid selector", themeLocation.toString())));
				}
			}
		}
	} else {
		return _loadSyntaxTokens(extensionResourceLoaderService, themeLocation, result);
	}
}

function _loadSyntaxTokens(extensionResourceLoaderService: IExtensionResourceLoaderService, themeLocation: URI, result: { textMateRules: ITextMateThemingRule[]; colors: IColorMap }): Promise<any> {
	return extensionResourceLoaderService.readExtensionResource(themeLocation).then(content => {
		try {
			const contentValue = parsePList(content);
			const settings: ITextMateThemingRule[] = contentValue.settings;
			if (!Array.isArray(settings)) {
				return Promise.reject(new Error(nls.localize('error.plist.invalidformat', "Problem parsing tmTheme file: {0}. 'settings' is not array.")));
			}
			convertSettings(settings, result);
			return Promise.resolve(null);
		} catch (e) {
			return Promise.reject(new Error(nls.localize('error.cannotparse', "Problems parsing tmTheme file: {0}", e.message)));
		}
	}, error => {
		return Promise.reject(new Error(nls.localize('error.cannotload', "Problems loading tmTheme file {0}: {1}", themeLocation.toString(), error.message)));
	});
}

const defaultThemeColors: { [baseTheme: string]: ITextMateThemingRule[] } = {
	'light': [
		{ scope: 'token.info-token', settings: { foreground: '#316bcd' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#cd3131' } },
		{ scope: 'token.debug-token', settings: { foreground: '#800080' } }
	],
	'dark': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#f44747' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	],
	'hcLight': [
		{ scope: 'token.info-token', settings: { foreground: '#316bcd' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#cd3131' } },
		{ scope: 'token.debug-token', settings: { foreground: '#800080' } }
	],
	'hcDark': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#008000' } },
		{ scope: 'token.error-token', settings: { foreground: '#FF0000' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	]
};

const noMatch = (_scope: ProbeScope) => -1;

function nameMatcher(identifiers: string[], scopes: ProbeScope): number {
	if (scopes.length < identifiers.length) {
		return -1;
	}

	let score: number | undefined = undefined;
	const every = identifiers.every((identifier) => {
		for (let i = scopes.length - 1; i >= 0; i--) {
			if (scopesAreMatching(scopes[i], identifier)) {
				score = (i + 1) * 0x10000 + identifier.length;
				return true;
			}
		}
		return false;
	});
	return every && score !== undefined ? score : -1;
}
function scopesAreMatching(thisScopeName: string, scopeName: string): boolean {
	if (!thisScopeName) {
		return false;
	}
	if (thisScopeName === scopeName) {
		return true;
	}
	const len = scopeName.length;
	return thisScopeName.length > len && thisScopeName.substr(0, len) === scopeName && thisScopeName[len] === '.';
}

function getScopeMatcher(rule: ITextMateThemingRule): Matcher<ProbeScope> {
	const ruleScope = rule.scope;
	if (!ruleScope || !rule.settings) {
		return noMatch;
	}
	const matchers: MatcherWithPriority<ProbeScope>[] = [];
	if (Array.isArray(ruleScope)) {
		for (const rs of ruleScope) {
			createMatchers(rs, nameMatcher, matchers);
		}
	} else {
		createMatchers(ruleScope, nameMatcher, matchers);
	}

	if (matchers.length === 0) {
		return noMatch;
	}
	return (scope: ProbeScope) => {
		let max = matchers[0].matcher(scope);
		for (let i = 1; i < matchers.length; i++) {
			max = Math.max(max, matchers[i].matcher(scope));
		}
		return max;
	};
}

function readSemanticTokenRule(selectorString: string, settings: ISemanticTokenColorizationSetting | string | boolean | undefined): SemanticTokenRule | undefined {
	const selector = tokenClassificationRegistry.parseTokenSelector(selectorString);
	let style: TokenStyle | undefined;
	if (typeof settings === 'string') {
		style = TokenStyle.fromSettings(settings, undefined);
	} else if (isSemanticTokenColorizationSetting(settings)) {
		style = TokenStyle.fromSettings(settings.foreground, settings.fontStyle, settings.bold, settings.underline, settings.strikethrough, settings.italic);
	}
	if (style) {
		return { selector, style };
	}
	return undefined;
}

function isSemanticTokenColorizationSetting(style: any): style is ISemanticTokenColorizationSetting {
	return style && (types.isString(style.foreground) || types.isString(style.fontStyle) || types.isBoolean(style.italic)
		|| types.isBoolean(style.underline) || types.isBoolean(style.strikethrough) || types.isBoolean(style.bold));
}

export function findMetadata(colorThemeData: ColorThemeData, captureNames: string[], languageId: number, bracket: boolean): number {
	let metadata = 0;

	metadata |= (languageId << MetadataConsts.LANGUAGEID_OFFSET);

	const definitions: TextMateThemingRuleDefinitions = {};
	const tokenStyle = colorThemeData.resolveScopes([captureNames], definitions);

	if (captureNames.length > 0) {
		const standardToken = toStandardTokenType(captureNames[captureNames.length - 1]);
		metadata |= (standardToken << MetadataConsts.TOKEN_TYPE_OFFSET);
	}

	const fontStyle = definitions.foreground?.settings.fontStyle || definitions.bold?.settings.fontStyle;
	if (fontStyle?.includes('italic')) {
		metadata |= FontStyle.Italic | MetadataConsts.ITALIC_MASK;
	}
	if (fontStyle?.includes('bold')) {
		metadata |= FontStyle.Bold | MetadataConsts.BOLD_MASK;
	}
	if (fontStyle?.includes('underline')) {
		metadata |= FontStyle.Underline | MetadataConsts.UNDERLINE_MASK;
	}
	if (fontStyle?.includes('strikethrough')) {
		metadata |= FontStyle.Strikethrough | MetadataConsts.STRIKETHROUGH_MASK;
	}

	const foreground = tokenStyle?.foreground;
	const tokenStyleForeground = (foreground !== undefined) ? colorThemeData.getTokenColorIndex().get(foreground) : ColorId.DefaultForeground;
	metadata |= tokenStyleForeground << MetadataConsts.FOREGROUND_OFFSET;

	if (bracket) {
		metadata |= MetadataConsts.BALANCED_BRACKETS_MASK;
	}

	return metadata;
}

class TokenColorIndex {

	private _lastColorId: number;
	private _id2color: string[];
	private _color2id: { [color: string]: number };

	constructor() {
		this._lastColorId = 0;
		this._id2color = [];
		this._color2id = Object.create(null);
	}

	public add(color: string | Color | undefined): number {
		color = normalizeColor(color);
		if (color === undefined) {
			return 0;
		}

		let value = this._color2id[color];
		if (value) {
			return value;
		}
		value = ++this._lastColorId;
		this._color2id[color] = value;
		this._id2color[value] = color;
		return value;
	}

	public get(color: string | Color | undefined): number {
		color = normalizeColor(color);
		if (color === undefined) {
			return 0;
		}
		const value = this._color2id[color];
		if (value) {
			return value;
		}
		console.log(`Color ${color} not in index.`);
		return 0;
	}

	public asArray(): string[] {
		return this._id2color.slice(0);
	}

}

function normalizeColor(color: string | Color | undefined | null): string | undefined {
	if (!color) {
		return undefined;
	}
	if (typeof color !== 'string') {
		color = Color.Format.CSS.formatHexA(color, true);
	}
	const len = color.length;
	if (color.charCodeAt(0) !== CharCode.Hash || (len !== 4 && len !== 5 && len !== 7 && len !== 9)) {
		return undefined;
	}
	const result = [CharCode.Hash];

	for (let i = 1; i < len; i++) {
		const upper = hexUpper(color.charCodeAt(i));
		if (!upper) {
			return undefined;
		}
		result.push(upper);
		if (len === 4 || len === 5) {
			result.push(upper);
		}
	}

	if (result.length === 9 && result[7] === CharCode.F && result[8] === CharCode.F) {
		result.length = 7;
	}
	return String.fromCharCode(...result);
}

function hexUpper(charCode: CharCode): number {
	if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9 || charCode >= CharCode.A && charCode <= CharCode.F) {
		return charCode;
	} else if (charCode >= CharCode.a && charCode <= CharCode.f) {
		return charCode - CharCode.a + CharCode.A;
	}
	return 0;
}
