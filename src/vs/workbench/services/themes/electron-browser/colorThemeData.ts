/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Paths = require('vs/base/common/paths');
import Json = require('vs/base/common/json');
import { Color } from 'vs/base/common/color';
import { ExtensionData, ITokenColorizationRule, IColorTheme, IColorMap, IThemeExtensionPoint, VS_LIGHT_THEME, VS_HC_THEME } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { convertSettings } from 'vs/workbench/services/themes/electron-browser/themeCompatibility';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';

import * as plist from 'fast-plist';
import pfs = require('vs/base/node/pfs');

import { Extensions, IColorRegistry, ColorIdentifier, editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ThemeType } from 'vs/platform/theme/common/themeService';
import { Registry } from 'vs/platform/platform';
import { WorkbenchThemeService } from "vs/workbench/services/themes/electron-browser/workbenchThemeService";

let colorRegistry = <IColorRegistry>Registry.as(Extensions.ColorContribution);

export class ColorThemeData implements IColorTheme {

	constructor(private themeService: WorkbenchThemeService) {
	}

	id: string;
	type: ThemeType;
	label: string;
	settingsId: string;
	description?: string;
	selector: string;
	tokenColors?: ITokenColorizationRule[];
	isLoaded: boolean;
	path?: string;
	extensionData: ExtensionData;
	colorMap: IColorMap = {};
	defaultColorMap: IColorMap = {};


	public getColor(colorId: ColorIdentifier, useDefault?: boolean): Color {
		let customColor = this.themeService.getCustomColor(colorId);
		if (customColor) {
			return customColor;
		}
		let color = this.colorMap[colorId];
		if (useDefault !== false && types.isUndefined(color)) {
			color = this.getDefault(colorId);
		}
		return color;
	}

	private getDefault(colorId: ColorIdentifier): Color {
		let color = this.defaultColorMap[colorId];
		if (types.isUndefined(color)) {
			color = colorRegistry.resolveDefaultColor(colorId, this);
			this.defaultColorMap[colorId] = color;
		}
		return color;
	}

	public isDefault(colorId: ColorIdentifier): boolean {
		let color = this.colorMap[colorId];
		if (types.isUndefined(color)) {
			return true;
		}
		let defaultValue = this.getDefault(colorId);
		return color === null ? defaultValue === null : color.equals(defaultValue);
	}

	public ensureLoaded(themeService: WorkbenchThemeService): TPromise<void> {
		if (!this.isLoaded) {
			this.tokenColors = [];
			this.colorMap = {};
			this.defaultColorMap = {};
			if (this.path) {
				return _loadColorThemeFromFile(this.path, this.tokenColors, this.colorMap, this.type).then(type => {
					this.type = type;
					this.isLoaded = true;
					_completeTokenColors(this);
				});
			}
		}
		return TPromise.as(null);
	}

	toThemeFile() {
		if (!this.isLoaded) {
			return '';
		}
		let content = { name: this.label, colors: {}, tokenColors: this.tokenColors };
		for (let key in this.colorMap) {
			content.colors[key] = this.colorMap[key].toRGBAHex(true);
		}
		return JSON.stringify(content, null, '\t');
	}

	toStorageData() {
		let colorMapData = {};
		for (let key in this.colorMap) {
			colorMapData[key] = this.colorMap[key].toRGBAHex(true);
		}
		return JSON.stringify({
			id: this.id,
			type: this.type,
			label: this.label,
			settingsId: this.settingsId,
			selector: this.selector,
			tokenColors: this.tokenColors,
			extensionData: this.extensionData,
			colorMap: colorMapData
		});
	}

	hasEqualData(other: ColorThemeData) {
		return objects.equals(this.colorMap, other.colorMap) && objects.equals(this.tokenColors, other.tokenColors);
	}
}

export function fromStorageData(themeService: WorkbenchThemeService, input: string): ColorThemeData {
	let data = JSON.parse(input);
	let theme = new ColorThemeData(themeService);
	for (let key in data) {
		if (key !== 'colorMap') {
			theme[key] = data[key];
		} else {
			let colorMapData = data[key];
			for (let id in colorMapData) {
				theme.colorMap[id] = Color.fromHex(colorMapData[id]);
			}
		}
	}
	if (!theme.type) {
		theme.type = baseThemeToType(theme.id);
	}
	return theme;
}

export function fromExtensionTheme(themeService: WorkbenchThemeService, theme: IThemeExtensionPoint, normalizedAbsolutePath: string, extensionData: ExtensionData): ColorThemeData {
	let baseTheme = theme['uiTheme'] || 'vs-dark';

	let themeSelector = toCSSSelector(extensionData.extensionId + '-' + Paths.normalize(theme.path));
	let themeData = new ColorThemeData(themeService);
	themeData.id = `${baseTheme} ${themeSelector}`;
	themeData.type = baseThemeToType(baseTheme);
	themeData.label = theme.label || Paths.basename(theme.path);
	themeData.settingsId = theme.id || themeData.label;
	themeData.selector = `${baseTheme}.${themeSelector}`;
	themeData.description = theme.description;
	themeData.path = normalizedAbsolutePath;
	themeData.extensionData = extensionData;
	themeData.isLoaded = false;
	return themeData;
}

function baseThemeToType(themeId: string): ThemeType {
	let baseTheme = themeId.split(' ')[0];
	switch (baseTheme) {
		case VS_LIGHT_THEME: return 'light';
		case VS_HC_THEME: return 'hc';
		default: return 'dark';
	}
}

function toCSSSelector(str: string) {
	str = str.replace(/[^_\-a-zA-Z0-9]/g, '-');
	if (str.charAt(0).match(/[0-9\-]/)) {
		str = '_' + str;
	}
	return str;
}

function _loadColorThemeFromFile(themePath: string, resultRules: ITokenColorizationRule[], resultColors: IColorMap, defaultType: ThemeType): TPromise<ThemeType> {
	if (Paths.extname(themePath) === '.json') {
		return pfs.readFile(themePath).then(content => {
			let errors: Json.ParseError[] = [];
			let contentValue = Json.parse(content.toString(), errors);
			if (errors.length > 0) {
				return TPromise.wrapError<ThemeType>(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => Json.getParseErrorMessage(e.error)).join(', '))));
			}
			let includeCompletes = TPromise.as(defaultType);
			if (contentValue.include) {
				includeCompletes = _loadColorThemeFromFile(Paths.join(Paths.dirname(themePath), contentValue.include), resultRules, resultColors, defaultType);
			}
			return includeCompletes.then(type => {
				if (Array.isArray(contentValue.settings)) {
					convertSettings(contentValue.settings, resultRules, resultColors);
					return type;
				}
				let themeType = contentValue.type;
				if (themeType !== 'light' && themeType !== 'dark' && themeType !== 'hc') {
					return TPromise.wrapError<ThemeType>(new Error(nls.localize({ key: 'error.invalidformat.type', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'type' must be 'light', 'dark' or 'hc'", themePath)));
				}
				type = themeType;

				let colors = contentValue.colors;
				if (colors) {
					if (typeof colors !== 'object') {
						return TPromise.wrapError<ThemeType>(new Error(nls.localize({ key: 'error.invalidformat.colors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'colors' is not of type 'object'.", themePath)));
					}
					// new JSON color themes format
					for (let colorId in colors) {
						let colorHex = Color.fromHex(colors[colorId], null);
						if (colorHex) { // ignore invalid colors
							resultColors[colorId] = colorHex;
						}
					}
				}
				let tokenColors = contentValue.tokenColors;
				if (tokenColors) {
					if (Array.isArray(tokenColors)) {
						resultRules.push(...tokenColors);
					} else if (typeof tokenColors === 'string') {
						return _loadSyntaxTokensFromFile(Paths.join(Paths.dirname(themePath), tokenColors), resultRules, {}, type);
					} else {
						return TPromise.wrapError<ThemeType>(new Error(nls.localize({ key: 'error.invalidformat.tokenColors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a text mate theme file", themePath)));
					}
				}
				return type;
			});
		});
	} else {
		return _loadSyntaxTokensFromFile(themePath, resultRules, resultColors, defaultType);
	}
}

function _loadSyntaxTokensFromFile(themePath: string, resultRules: ITokenColorizationRule[], resultColors: IColorMap, type: ThemeType): TPromise<ThemeType> {
	return pfs.readFile(themePath).then(content => {
		try {
			let contentValue = plist.parse(content.toString());
			let settings: ITokenColorizationRule[] = contentValue.settings;
			if (!Array.isArray(settings)) {
				return TPromise.wrapError<ThemeType>(new Error(nls.localize('error.plist.invalidformat', "Problem parsing tmTheme file: {0}. 'settings' is not array.")));
			}
			convertSettings(settings, resultRules, resultColors);
			return TPromise.as(type);
		} catch (e) {
			return TPromise.wrapError<ThemeType>(new Error(nls.localize('error.cannotparse', "Problems parsing tmTheme file: {0}", e.message)));
		}
	}, error => {
		return TPromise.wrapError<ThemeType>(new Error(nls.localize('error.cannotload', "Problems loading tmTheme file {0}: {1}", themePath, error.message)));
	});
}
/**
 * Make sure that the token colors contain the default fore and background
 */
function _completeTokenColors(theme: ColorThemeData) {
	let hasDefaultTokens = false;
	theme.tokenColors.forEach(rule => {
		if (!rule.scope) {
			if (!rule.settings.background) {
				rule.settings.background = theme.getColor(editorBackground).toRGBAHex();
			}
			if (!rule.settings.foreground) {
				rule.settings.foreground = theme.getColor(editorForeground).toRGBAHex();
			}
		} else if (rule.scope === 'token.info-token') {
			hasDefaultTokens = true;
		}
	});
	if (!hasDefaultTokens) {
		theme.tokenColors.push(...defaultThemeColors[theme.type]);
	}
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