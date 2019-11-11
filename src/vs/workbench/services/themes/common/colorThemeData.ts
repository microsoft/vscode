/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'vs/base/common/path';
import * as Json from 'vs/base/common/json';
import { Color } from 'vs/base/common/color';
import { ExtensionData, ITokenColorCustomizations, ITextMateThemingRule, IColorTheme, IColorMap, IThemeExtensionPoint, VS_LIGHT_THEME, VS_HC_THEME, IColorCustomizations, IExperimentalTokenStyleCustomizations, ITokenColorizationSetting } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { convertSettings } from 'vs/workbench/services/themes/common/themeCompatibility';
import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';
import * as resources from 'vs/base/common/resources';
import { Extensions as ColorRegistryExtensions, IColorRegistry, ColorIdentifier, editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ThemeType } from 'vs/platform/theme/common/themeService';
import { Registry } from 'vs/platform/registry/common/platform';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { URI } from 'vs/base/common/uri';
import { parse as parsePList } from 'vs/workbench/services/themes/common/plistParser';
import { startsWith } from 'vs/base/common/strings';
import { TokenStyle, TokenClassification, ProbeScope, TokenStylingRule, getTokenClassificationRegistry } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { MatcherWithPriority, Matcher, createMatchers } from 'vs/workbench/services/themes/common/textMateScopeMatcher';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';

let colorRegistry = Registry.as<IColorRegistry>(ColorRegistryExtensions.ColorContribution);

let tokenClassificationRegistry = getTokenClassificationRegistry();

const tokenGroupToScopesMap = {
	comments: ['comment', 'punctuation.definition.comment'],
	strings: ['string'],
	keywords: ['keyword - keyword.operator', 'keyword.control', 'storage', 'storage.type'],
	numbers: ['constant.numeric'],
	types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
	functions: ['entity.name.function', 'support.function'],
	variables: ['variable', 'entity.name.variable']
};


export class ColorThemeData implements IColorTheme {

	id: string;
	label: string;
	settingsId: string;
	description?: string;
	isLoaded: boolean;
	location?: URI;
	watch?: boolean;
	extensionData?: ExtensionData;

	private themeTokenColors: ITextMateThemingRule[] = [];
	private customTokenColors: ITextMateThemingRule[] = [];
	private colorMap: IColorMap = {};
	private customColorMap: IColorMap = {};

	private tokenStylingRules: TokenStylingRule[] | undefined = undefined;
	private customTokenStylingRules: TokenStylingRule[] = [];

	private themeTokenScopeMatchers: Matcher<ProbeScope>[] | undefined;
	private customTokenScopeMatchers: Matcher<ProbeScope>[] | undefined;

	private constructor(id: string, label: string, settingsId: string) {
		this.id = id;
		this.label = label;
		this.settingsId = settingsId;
		this.isLoaded = false;
	}

	get tokenColors(): ITextMateThemingRule[] {
		const result: ITextMateThemingRule[] = [];

		// the default rule (scope empty) is always the first rule. Ignore all other default rules.
		const foreground = this.getColor(editorForeground) || this.getDefault(editorForeground)!;
		const background = this.getColor(editorBackground) || this.getDefault(editorBackground)!;
		result.push({
			settings: {
				foreground: Color.Format.CSS.formatHexA(foreground),
				background: Color.Format.CSS.formatHexA(background)
			}
		});

		let hasDefaultTokens = false;

		function addRule(rule: ITextMateThemingRule) {
			if (rule.scope && rule.settings) {
				if (rule.scope === 'token.info-token') {
					hasDefaultTokens = true;
				}
				result.push(rule);
			}
		}

		this.themeTokenColors.forEach(addRule);
		// Add the custom colors after the theme colors
		// so that they will override them
		this.customTokenColors.forEach(addRule);

		if (!hasDefaultTokens) {
			defaultThemeColors[this.type].forEach(addRule);
		}
		return result;
	}

	public getColor(colorId: ColorIdentifier, useDefault?: boolean): Color | undefined {
		let color: Color | undefined = this.customColorMap[colorId];
		if (color) {
			return color;
		}
		color = this.colorMap[colorId];
		if (useDefault !== false && types.isUndefined(color)) {
			color = this.getDefault(colorId);
		}
		return color;
	}

	public getTokenStyle(tokenClassification: TokenClassification, useDefault?: boolean): TokenStyle | undefined {
		// todo: cache results
		return tokenClassificationRegistry.resolveTokenStyle(tokenClassification, this.tokenStylingRules, this.customTokenStylingRules, this);
	}

	public getDefault(colorId: ColorIdentifier): Color | undefined {
		return colorRegistry.resolveDefaultColor(colorId, this);
	}

	public getDefaultTokenStyle(tokenClassification: TokenClassification): TokenStyle | undefined {
		return tokenClassificationRegistry.resolveTokenStyle(tokenClassification, undefined, [], this);
	}

	public resolveScopes(scopes: ProbeScope[]): TokenStyle | undefined {

		if (!this.themeTokenScopeMatchers) {
			this.themeTokenScopeMatchers = this.themeTokenColors.map(getScopeMatcher);
		}
		if (!this.customTokenScopeMatchers) {
			this.customTokenScopeMatchers = this.customTokenColors.map(getScopeMatcher);
		}

		for (let scope of scopes) {
			let foreground: string | undefined = undefined;
			let fontStyle: string | undefined = undefined;
			let foregroundScore = -1;
			let fontStyleScore = -1;

			function findTokenStyleForScopeInScopes(scopeMatchers: Matcher<ProbeScope>[], tokenColors: ITextMateThemingRule[]) {
				for (let i = 0; i < scopeMatchers.length; i++) {
					const score = scopeMatchers[i](scope);
					if (score >= 0) {
						const settings = tokenColors[i].settings;
						if (score >= foregroundScore && settings.foreground) {
							foreground = settings.foreground;
						}
						if (score >= fontStyleScore && types.isString(settings.fontStyle)) {
							fontStyle = settings.fontStyle;
						}
					}
				}
			}
			findTokenStyleForScopeInScopes(this.themeTokenScopeMatchers, this.themeTokenColors);
			findTokenStyleForScopeInScopes(this.customTokenScopeMatchers, this.customTokenColors);
			if (foreground !== undefined || fontStyle !== undefined) {
				return getTokenStyle(foreground, fontStyle);
			}
		}
		return undefined;
	}

	public defines(colorId: ColorIdentifier): boolean {
		return this.customColorMap.hasOwnProperty(colorId) || this.colorMap.hasOwnProperty(colorId);
	}

	public setCustomColors(colors: IColorCustomizations) {
		this.customColorMap = {};
		this.overwriteCustomColors(colors);

		const themeSpecificColors = colors[`[${this.settingsId}]`] as IColorCustomizations;
		if (types.isObject(themeSpecificColors)) {
			this.overwriteCustomColors(themeSpecificColors);
		}
	}

	private overwriteCustomColors(colors: IColorCustomizations) {
		for (let id in colors) {
			let colorVal = colors[id];
			if (typeof colorVal === 'string') {
				this.customColorMap[id] = Color.fromHex(colorVal);
			}
		}
	}

	public setCustomTokenColors(customTokenColors: ITokenColorCustomizations) {
		this.customTokenColors = [];
		this.customTokenScopeMatchers = undefined;
		// first add the non-theme specific settings
		this.addCustomTokenColors(customTokenColors);

		// append theme specific settings. Last rules will win.
		const themeSpecificTokenColors = customTokenColors[`[${this.settingsId}]`] as ITokenColorCustomizations;
		if (types.isObject(themeSpecificTokenColors)) {
			this.addCustomTokenColors(themeSpecificTokenColors);
		}
	}

	public setCustomTokenStyleRules(tokenStylingRules: IExperimentalTokenStyleCustomizations) {
		this.tokenStylingRules = [];
		readCustomTokenStyleRules(tokenStylingRules, this.tokenStylingRules);

		const themeSpecificColors = tokenStylingRules[`[${this.settingsId}]`] as IExperimentalTokenStyleCustomizations;
		if (types.isObject(themeSpecificColors)) {
			readCustomTokenStyleRules(themeSpecificColors, this.tokenStylingRules);
		}
	}

	private addCustomTokenColors(customTokenColors: ITokenColorCustomizations) {
		// Put the general customizations such as comments, strings, etc. first so that
		// they can be overridden by specific customizations like "string.interpolated"
		for (let tokenGroup in tokenGroupToScopesMap) {
			const group = <keyof typeof tokenGroupToScopesMap>tokenGroup; // TS doesn't type 'tokenGroup' properly
			let value = customTokenColors[group];
			if (value) {
				let settings = typeof value === 'string' ? { foreground: value } : value;
				let scopes = tokenGroupToScopesMap[group];
				for (let scope of scopes) {
					this.customTokenColors.push({ scope, settings });
				}
			}
		}

		// specific customizations
		if (Array.isArray(customTokenColors.textMateRules)) {
			for (let rule of customTokenColors.textMateRules) {
				if (rule.scope && rule.settings) {
					this.customTokenColors.push(rule);
				}
			}
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
		this.themeTokenScopeMatchers = undefined;

		const result = {
			colors: {},
			textMateRules: [],
			stylingRules: undefined
		};
		return _loadColorTheme(extensionResourceLoaderService, this.location, result).then(_ => {
			this.isLoaded = true;
			this.tokenStylingRules = result.stylingRules;
			this.colorMap = result.colors;
			this.themeTokenColors = result.textMateRules;
		});
	}

	toStorageData() {
		let colorMapData: { [key: string]: string } = {};
		for (let key in this.colorMap) {
			colorMapData[key] = Color.Format.CSS.formatHexA(this.colorMap[key], true);
		}
		// no need to persist custom colors, they will be taken from the settings
		return JSON.stringify({
			id: this.id,
			label: this.label,
			settingsId: this.settingsId,
			selector: this.id.split(' ').join('.'), // to not break old clients
			themeTokenColors: this.themeTokenColors,
			extensionData: this.extensionData,
			colorMap: colorMapData,
			watch: this.watch
		});
	}

	hasEqualData(other: ColorThemeData) {
		return objects.equals(this.colorMap, other.colorMap) && objects.equals(this.themeTokenColors, other.themeTokenColors);
	}

	get baseTheme(): string {
		return this.id.split(' ')[0];
	}

	get type(): ThemeType {
		switch (this.baseTheme) {
			case VS_LIGHT_THEME: return 'light';
			case VS_HC_THEME: return 'hc';
			default: return 'dark';
		}
	}

	// constructors

	static createUnloadedTheme(id: string): ColorThemeData {
		let themeData = new ColorThemeData(id, '', '__' + id);
		themeData.isLoaded = false;
		themeData.themeTokenColors = [];
		themeData.watch = false;
		return themeData;
	}

	static createLoadedEmptyTheme(id: string, settingsId: string): ColorThemeData {
		let themeData = new ColorThemeData(id, '', settingsId);
		themeData.isLoaded = true;
		themeData.themeTokenColors = [];
		themeData.watch = false;
		return themeData;
	}

	static fromStorageData(input: string): ColorThemeData | undefined {
		try {
			let data = JSON.parse(input);
			let theme = new ColorThemeData('', '', '');
			for (let key in data) {
				switch (key) {
					case 'colorMap':
						let colorMapData = data[key];
						for (let id in colorMapData) {
							theme.colorMap[id] = Color.fromHex(colorMapData[id]);
						}
						break;
					case 'themeTokenColors':
					case 'id': case 'label': case 'settingsId': case 'extensionData': case 'watch':
						(theme as any)[key] = data[key];
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
	if (startsWith(path, './')) {
		path = path.substr(2);
	}
	let str = `${extensionId}-${path}`;

	//remove all characters that are not allowed in css
	str = str.replace(/[^_\-a-zA-Z0-9]/g, '-');
	if (str.charAt(0).match(/[0-9\-]/)) {
		str = '_' + str;
	}
	return str;
}

function _loadColorTheme(extensionResourceLoaderService: IExtensionResourceLoaderService, themeLocation: URI, result: { textMateRules: ITextMateThemingRule[], colors: IColorMap, stylingRules: TokenStylingRule[] | undefined }): Promise<any> {
	if (resources.extname(themeLocation) === '.json') {
		return extensionResourceLoaderService.readExtensionResource(themeLocation).then(content => {
			let errors: Json.ParseError[] = [];
			let contentValue = Json.parse(content, errors);
			if (errors.length > 0) {
				return Promise.reject(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
			} else if (Json.getNodeType(contentValue) !== 'object') {
				return Promise.reject(new Error(nls.localize('error.invalidformat', "Invalid format for JSON theme file: Object expected.")));
			}
			let includeCompletes: Promise<any> = Promise.resolve(null);
			if (contentValue.include) {
				includeCompletes = _loadColorTheme(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), contentValue.include), result);
			}
			return includeCompletes.then(_ => {
				if (Array.isArray(contentValue.settings)) {
					convertSettings(contentValue.settings, result);
					return null;
				}
				let colors = contentValue.colors;
				if (colors) {
					if (typeof colors !== 'object') {
						return Promise.reject(new Error(nls.localize({ key: 'error.invalidformat.colors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'colors' is not of type 'object'.", themeLocation.toString())));
					}
					// new JSON color themes format
					for (let colorId in colors) {
						let colorHex = colors[colorId];
						if (typeof colorHex === 'string') { // ignore colors tht are null
							result.colors[colorId] = Color.fromHex(colors[colorId]);
						}
					}
				}
				let tokenColors = contentValue.tokenColors;
				if (tokenColors) {
					if (Array.isArray(tokenColors)) {
						result.textMateRules.push(...tokenColors);
						return null;
					} else if (typeof tokenColors === 'string') {
						return _loadSyntaxTokens(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), tokenColors), result);
					} else {
						return Promise.reject(new Error(nls.localize({ key: 'error.invalidformat.tokenColors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file", themeLocation.toString())));
					}
				}
				let tokenStylingRules = contentValue.tokenStylingRules;
				if (tokenStylingRules && typeof tokenStylingRules === 'object') {
					result.stylingRules = readCustomTokenStyleRules(tokenStylingRules, result.stylingRules);
				}
				return null;
			});
		});
	} else {
		return _loadSyntaxTokens(extensionResourceLoaderService, themeLocation, result);
	}
}

function _loadSyntaxTokens(extensionResourceLoaderService: IExtensionResourceLoaderService, themeLocation: URI, result: { textMateRules: ITextMateThemingRule[], colors: IColorMap }): Promise<any> {
	return extensionResourceLoaderService.readExtensionResource(themeLocation).then(content => {
		try {
			let contentValue = parsePList(content);
			let settings: ITextMateThemingRule[] = contentValue.settings;
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

let defaultThemeColors: { [baseTheme: string]: ITextMateThemingRule[] } = {
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
	'hc': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#008000' } },
		{ scope: 'token.error-token', settings: { foreground: '#FF0000' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	],
};

const noMatch = (_scope: ProbeScope) => -1;

function nameMatcher(identifers: string[], scope: ProbeScope): number {
	function findInIdents(s: string, lastIndent: number): number {
		for (let i = lastIndent - 1; i >= 0; i--) {
			if (scopesAreMatching(s, identifers[i])) {
				return i;
			}
		}
		return -1;
	}
	if (scope.length < identifers.length) {
		return -1;
	}
	let lastScopeIndex = scope.length - 1;
	let lastIdentifierIndex = findInIdents(scope[lastScopeIndex--], identifers.length);
	if (lastIdentifierIndex >= 0) {
		const score = (lastIdentifierIndex + 1) * 0x10000 + scope.length;
		while (lastScopeIndex >= 0) {
			lastIdentifierIndex = findInIdents(scope[lastScopeIndex--], lastIdentifierIndex);
			if (lastIdentifierIndex === -1) {
				return -1;
			}
		}
		return score;
	}
	return -1;
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
		for (let rs of ruleScope) {
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

function getTokenStyle(foreground: string | undefined, fontStyle: string | undefined): TokenStyle {
	let foregroundColor = undefined;
	if (foreground !== undefined) {
		foregroundColor = Color.fromHex(foreground);
	}
	let bold, underline, italic;
	if (fontStyle !== undefined) {
		fontStyle = fontStyle.trim();
		if (fontStyle.length === 0) {
			bold = italic = underline = false;
		} else {
			const expression = /-?italic|-?bold|-?underline/g;
			let match;
			while ((match = expression.exec(fontStyle))) {
				switch (match[0]) {
					case 'bold': bold = true; break;
					case '-bold': bold = false; break;
					case 'italic': italic = true; break;
					case '-italic': italic = false; break;
					case 'underline': underline = true; break;
					case '-underline': underline = false; break;
				}
			}
		}
	}
	return new TokenStyle(foregroundColor, bold, underline, italic);

}

function readCustomTokenStyleRules(tokenStylingRuleSection: IExperimentalTokenStyleCustomizations, result: TokenStylingRule[] = []) {
	for (let key in tokenStylingRuleSection) {
		if (key[0] !== '[') {
			const classification = tokenClassificationRegistry.getTokenClassificationFromString(key);
			if (classification) {
				const settings = tokenStylingRuleSection[key];
				let style: TokenStyle | undefined;
				if (typeof settings === 'string') {
					style = getTokenStyle(settings, undefined);
				} else if (isTokenColorizationSetting(settings)) {
					style = getTokenStyle(settings.foreground, settings.fontStyle);
				}
				if (style) {
					result.push(tokenClassificationRegistry.getTokenStylingRule(classification, style));
				}
			}
		}
	}
	return result;
}

function isTokenColorizationSetting(style: any): style is ITokenColorizationSetting {
	return style && (style.foreground || style.fontStyle);
}
