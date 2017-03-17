/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Paths = require('vs/base/common/paths');
import Json = require('vs/base/common/json');
import { Color } from 'vs/base/common/color';
import { ExtensionData, ITokenColorizationRule, IColorTheme, IColorMap, VS_LIGHT_THEME, VS_HC_THEME } from 'vs/workbench/services/themes/common/themeService';
import { convertSettings } from 'vs/workbench/services/themes/electron-browser/themeCompatibility';
import { TPromise } from 'vs/base/common/winjs.base';
import { getBaseThemeId, getSyntaxThemeId, isDarkTheme, isLightTheme } from 'vs/platform/theme/common/themes';
import nls = require('vs/nls');
import * as types from 'vs/base/common/types';

import * as plist from 'fast-plist';
import pfs = require('vs/base/node/pfs');

import { Extensions, IColorRegistry, ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { ThemeType } from 'vs/platform/theme/common/themeService';
import { Registry } from 'vs/platform/platform';

let colorRegistry = <IColorRegistry>Registry.as(Extensions.ColorContribution);

export class ColorThemeData implements IColorTheme {

	id: string;
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

	public ensureLoaded(): TPromise<void> {
		if (!this.isLoaded) {
			let tokenColors = [];
			let colorMap = {};
			return _loadThemeDocument(this.getBaseThemeId(), this.path, tokenColors, colorMap).then(_ => {
				this.tokenColors = tokenColors;
				this.colorMap = colorMap;
				this.defaultColorMap = {};
				this.isLoaded = true;
			});
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
			label: this.label,
			settingsId: this.settingsId,
			selector: this.selector,
			tokenColors: this.tokenColors,
			isLoaded: true,
			extensionData: this.extensionData,
			colorMap: colorMapData
		});
	}

	get type(): ThemeType {
		switch (this.getBaseThemeId()) {
			case VS_LIGHT_THEME: return 'light';
			case VS_HC_THEME: return 'hc';
			default: return 'dark';
		}
	}

	isLightTheme() {
		return isLightTheme(this.id);
	}

	isDarkTheme() {
		return isDarkTheme(this.id);
	}

	getSyntaxThemeId() {
		return getSyntaxThemeId(this.id);
	}

	getBaseThemeId() {
		return getBaseThemeId(this.id);
	}
}

export function fromStorageData(input: string): ColorThemeData {
	let data = JSON.parse(input);
	let theme = new ColorThemeData();
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
	return theme;
}

let defaultThemeColors: { [baseTheme: string]: ITokenColorizationRule[] } = {
	'vs': [
		{ scope: 'token.info-token', settings: { foreground: '#316bcd' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#cd3131' } },
		{ scope: 'token.debug-token', settings: { foreground: 'purple' } }
	],
	'vs-dark': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#f44747' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	],
	'hc-black': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#008000' } },
		{ scope: 'token.error-token', settings: { foreground: '#FF0000' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	],
};

function _loadThemeDocument(baseTheme: string, themePath: string, resultRules: ITokenColorizationRule[], resultColors: IColorMap): TPromise<any> {
	return pfs.readFile(themePath).then(content => {
		if (resultRules.length === 0) {
			let defaultRules = defaultThemeColors[baseTheme] || [];
			resultRules.push(...defaultRules);
		}
		if (Paths.extname(themePath) === '.json') {
			let errors: Json.ParseError[] = [];
			let contentValue = Json.parse(content.toString(), errors);
			if (errors.length > 0) {
				return TPromise.wrapError(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => Json.getParseErrorMessage(e.error)).join(', '))));
			}
			let includeCompletes = TPromise.as(null);
			if (contentValue.include) {
				includeCompletes = _loadThemeDocument(baseTheme, Paths.join(Paths.dirname(themePath), contentValue.include), resultRules, resultColors);
			}
			return includeCompletes.then(_ => {
				if (Array.isArray(contentValue.settings)) {
					// legacy information
					convertSettings(contentValue.settings, resultRules, resultColors);
				} else {
					if (!Array.isArray(contentValue.tokenColors) && typeof contentValue.colors !== 'object') {
						return TPromise.wrapError(new Error(nls.localize({ key: 'error.invalidformat', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing JSON theme file: {0}. Expecting 'tokenColors' and 'colors'.", themePath)));
					}
					if (contentValue.tokenColors) {
						resultRules.push(...contentValue.tokenColors);
					}
					if (contentValue.colors) {
						for (let colorId in contentValue.colors) {
							let colorHex = contentValue.colors[colorId];
							resultColors[colorId] = Color.fromHex(colorHex);
						}
					}
				}
				return null;
			});
		}
		try {
			let contentValue = plist.parse(content.toString());
			let settings: ITokenColorizationRule[] = contentValue.settings;
			if (!Array.isArray(settings)) {
				return TPromise.wrapError(new Error(nls.localize('error.plist.invalidformat', "Problem parsing theme file: {0}. 'settings' is not array.")));
			}
			convertSettings(settings, resultRules, resultColors);
			return TPromise.as(null);
		} catch (e) {
			return TPromise.wrapError(new Error(nls.localize('error.cannotparse', "Problems parsing theme file: {0}", e.message)));
		}
	}, error => {
		return TPromise.wrapError(new Error(nls.localize('error.cannotload', "Problems loading theme file {0}: {1}", themePath, error.message)));
	});
}
