/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Paths from 'vs/base/common/paths';
import * as Json from 'vs/base/common/json';
import { Color } from 'vs/base/common/color';
import { ExtensionData, ITokenColorCustomizations, ITokenColorizationRule, IColorTheme, IColorMap, IThemeExtensionPoint, VS_LIGHT_THEME, VS_HC_THEME } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { convertSettings } from 'vs/workbench/services/themes/electron-browser/themeCompatibility';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';

import * as pfs from 'vs/base/node/pfs';

import { Extensions, IColorRegistry, ColorIdentifier, editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ThemeType } from 'vs/platform/theme/common/themeService';
import { Registry } from 'vs/platform/registry/common/platform';
import { WorkbenchThemeService, IColorCustomizations } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';

let colorRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);

const tokenGroupToScopesMap: { [setting: string]: string[] } = {
	comments: ['comment'],
	strings: ['string'],
	keywords: ['keyword', 'keyword.control', 'storage', 'storage.type'],
	numbers: ['constant.numeric'],
	types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
	functions: ['entity.name.function', 'support.function'],
	variables: ['variable']
};

export class ColorThemeData implements IColorTheme {

	private constructor() {
	}

	id: string;
	label: string;
	settingsId: string;
	description?: string;
	isLoaded: boolean;
	path?: string;
	extensionData: ExtensionData;

	get tokenColors(): ITokenColorizationRule[] {
		// Add the custom colors after the theme colors
		// so that they will override them
		return this.themeTokenColors.concat(this.customTokenColors);
	}

	private themeTokenColors: ITokenColorizationRule[] = [];
	private customTokenColors: ITokenColorizationRule[] = [];
	private colorMap: IColorMap = {};
	private customColorMap: IColorMap = {};

	public getColor(colorId: ColorIdentifier, useDefault?: boolean): Color {
		let color = this.customColorMap[colorId];
		if (color) {
			return color;
		}
		color = this.colorMap[colorId];
		if (useDefault !== false && types.isUndefined(color)) {
			color = this.getDefault(colorId);
		}
		return color;
	}

	public getDefault(colorId: ColorIdentifier): Color {
		return colorRegistry.resolveDefaultColor(colorId, this);
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
		if (this.themeTokenColors && this.themeTokenColors.length) {
			updateDefaultRuleSettings(this.themeTokenColors[0], this);
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
		// first add the non-theme specific settings
		this.addCustomTokenColors(customTokenColors);

		// append theme specific settings. Last rules will win.
		const themeSpecificTokenColors = customTokenColors[`[${this.settingsId}]`] as ITokenColorCustomizations;
		if (types.isObject(themeSpecificTokenColors)) {
			this.addCustomTokenColors(themeSpecificTokenColors);
		}
	}

	private addCustomTokenColors(customTokenColors: ITokenColorCustomizations) {
		// Put the general customizations such as comments, strings, etc. first so that
		// they can be overridden by specific customizations like "string.interpolated"
		for (let tokenGroup in tokenGroupToScopesMap) {
			let value = customTokenColors[tokenGroup];
			if (value) {
				let settings = typeof value === 'string' ? { foreground: value } : value;
				let scopes = tokenGroupToScopesMap[tokenGroup];
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

	public ensureLoaded(themeService: WorkbenchThemeService): TPromise<void> {
		if (!this.isLoaded) {
			if (this.path) {
				return _loadColorThemeFromFile(this.path, this.themeTokenColors, this.colorMap).then(_ => {
					this.isLoaded = true;
					this.sanitizeTokenColors();
				});
			}
		}
		return TPromise.as(null);
	}

	/**
	 * Place the default settings first and add the token-info rules
	 */
	private sanitizeTokenColors() {
		let hasDefaultTokens = false;
		let updatedTokenColors: ITokenColorizationRule[] = [updateDefaultRuleSettings({ settings: {} }, this)];
		this.themeTokenColors.forEach(rule => {
			if (rule.scope && rule.settings) {
				if (rule.scope === 'token.info-token') {
					hasDefaultTokens = true;
				}
				updatedTokenColors.push(rule);
			}
		});
		if (!hasDefaultTokens) {
			updatedTokenColors.push(...defaultThemeColors[this.type]);
		}
		this.themeTokenColors = updatedTokenColors;
	}

	toStorageData() {
		let colorMapData = {};
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
			colorMap: colorMapData
		});
	}

	hasEqualData(other: ColorThemeData) {
		return objects.equals(this.colorMap, other.colorMap) && objects.equals(this.tokenColors, other.tokenColors);
	}

	get type(): ThemeType {
		let baseTheme = this.id.split(' ')[0];
		switch (baseTheme) {
			case VS_LIGHT_THEME: return 'light';
			case VS_HC_THEME: return 'hc';
			default: return 'dark';
		}
	}

	// constructors

	static createUnloadedTheme(id: string): ColorThemeData {
		let themeData = new ColorThemeData();
		themeData.id = id;
		themeData.label = '';
		themeData.settingsId = null;
		themeData.isLoaded = false;
		themeData.themeTokenColors = [{ settings: {} }];
		return themeData;
	}

	static createLoadedEmptyTheme(id: string, settingsId: string): ColorThemeData {
		let themeData = new ColorThemeData();
		themeData.id = id;
		themeData.label = '';
		themeData.settingsId = settingsId;
		themeData.isLoaded = true;
		themeData.themeTokenColors = [{ settings: {} }];
		return themeData;
	}

	static fromStorageData(input: string): ColorThemeData {
		try {
			let data = JSON.parse(input);
			let theme = new ColorThemeData();
			for (let key in data) {
				switch (key) {
					case 'colorMap':
						let colorMapData = data[key];
						for (let id in colorMapData) {
							theme.colorMap[id] = Color.fromHex(colorMapData[id]);
						}
						break;
					case 'themeTokenColors':
					case 'id': case 'label': case 'settingsId': case 'extensionData':
						theme[key] = data[key];
						break;
				}
			}
			return theme;
		} catch (e) {
			return null;
		}
	}

	static fromExtensionTheme(theme: IThemeExtensionPoint, normalizedAbsolutePath: string, extensionData: ExtensionData): ColorThemeData {
		let baseTheme: string = theme['uiTheme'] || 'vs-dark';

		let themeSelector = toCSSSelector(extensionData.extensionId + '-' + Paths.normalize(theme.path));
		let themeData = new ColorThemeData();
		themeData.id = `${baseTheme} ${themeSelector}`;
		themeData.label = theme.label || Paths.basename(theme.path);
		themeData.settingsId = theme.id || themeData.label;
		themeData.description = theme.description;
		themeData.path = normalizedAbsolutePath;
		themeData.extensionData = extensionData;
		themeData.isLoaded = false;
		return themeData;
	}
}



function toCSSSelector(str: string) {
	str = str.replace(/[^_\-a-zA-Z0-9]/g, '-');
	if (str.charAt(0).match(/[0-9\-]/)) {
		str = '_' + str;
	}
	return str;
}

function _loadColorThemeFromFile(themePath: string, resultRules: ITokenColorizationRule[], resultColors: IColorMap): TPromise<any> {
	if (Paths.extname(themePath) === '.json') {
		return pfs.readFile(themePath).then(content => {
			let errors: Json.ParseError[] = [];
			let contentValue = Json.parse(content.toString(), errors);
			if (errors.length > 0) {
				return TPromise.wrapError(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
			}
			let includeCompletes = TPromise.as(null);
			if (contentValue.include) {
				includeCompletes = _loadColorThemeFromFile(Paths.join(Paths.dirname(themePath), contentValue.include), resultRules, resultColors);
			}
			return includeCompletes.then(_ => {
				if (Array.isArray(contentValue.settings)) {
					convertSettings(contentValue.settings, resultRules, resultColors);
					return null;
				}
				let colors = contentValue.colors;
				if (colors) {
					if (typeof colors !== 'object') {
						return TPromise.wrapError(new Error(nls.localize({ key: 'error.invalidformat.colors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'colors' is not of type 'object'.", themePath)));
					}
					// new JSON color themes format
					for (let colorId in colors) {
						let colorHex = colors[colorId];
						if (typeof colorHex === 'string') { // ignore colors tht are null
							resultColors[colorId] = Color.fromHex(colors[colorId]);
						}
					}
				}
				let tokenColors = contentValue.tokenColors;
				if (tokenColors) {
					if (Array.isArray(tokenColors)) {
						resultRules.push(...tokenColors);
						return null;
					} else if (typeof tokenColors === 'string') {
						return _loadSyntaxTokensFromFile(Paths.join(Paths.dirname(themePath), tokenColors), resultRules, {});
					} else {
						return TPromise.wrapError(new Error(nls.localize({ key: 'error.invalidformat.tokenColors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file", themePath)));
					}
				}
				return null;
			});
		});
	} else {
		return _loadSyntaxTokensFromFile(themePath, resultRules, resultColors);
	}
}

let pListParser: Thenable<{ parse(content: string) }>;
function getPListParser() {
	return pListParser || import('fast-plist');
}

function _loadSyntaxTokensFromFile(themePath: string, resultRules: ITokenColorizationRule[], resultColors: IColorMap): TPromise<any> {
	return pfs.readFile(themePath).then(content => {
		return getPListParser().then(parser => {
			try {
				let contentValue = parser.parse(content.toString());
				let settings: ITokenColorizationRule[] = contentValue.settings;
				if (!Array.isArray(settings)) {
					return TPromise.wrapError(new Error(nls.localize('error.plist.invalidformat', "Problem parsing tmTheme file: {0}. 'settings' is not array.")));
				}
				convertSettings(settings, resultRules, resultColors);
				return TPromise.as(null);
			} catch (e) {
				return TPromise.wrapError(new Error(nls.localize('error.cannotparse', "Problems parsing tmTheme file: {0}", e.message)));
			}
		});
	}, error => {
		return TPromise.wrapError(new Error(nls.localize('error.cannotload', "Problems loading tmTheme file {0}: {1}", themePath, error.message)));
	});
}

function updateDefaultRuleSettings(defaultRule: ITokenColorizationRule, theme: ColorThemeData): ITokenColorizationRule {
	let foreground = theme.getColor(editorForeground) || theme.getDefault(editorForeground);
	let background = theme.getColor(editorBackground) || theme.getDefault(editorBackground);
	defaultRule.settings.foreground = Color.Format.CSS.formatHexA(foreground);
	defaultRule.settings.background = Color.Format.CSS.formatHexA(background);
	return defaultRule;
}

let defaultThemeColors: { [baseTheme: string]: ITokenColorizationRule[] } = {
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