/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'vs/base/common/path';
import * as Json from 'vs/base/common/json';
import { Color } from 'vs/base/common/color';
import { ExtensionData, ITokenColorCustomizations, ITokenColorizationRule, IColorTheme, IColorMap, IThemeExtensionPoint, VS_LIGHT_THEME, VS_HC_THEME, IColorCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { convertSettings } from 'vs/workbench/services/themes/common/themeCompatibility';
import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';
import * as resources from 'vs/base/common/resources';
import { Extensions, IColorRegistry, ColorIdentifier, editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ThemeType } from 'vs/platform/theme/common/themeService';
import { Registry } from 'vs/platform/registry/common/platform';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { parse as parsePList } from 'vs/workbench/services/themes/common/plistParser';
import { startsWith } from 'vs/base/common/strings';

let colorRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);

const tokenGroupToScopesMap = {
	comments: ['comment'],
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

	private themeTokenColors: ITokenColorizationRule[] = [];
	private customTokenColors: ITokenColorizationRule[] = [];
	private colorMap: IColorMap = {};
	private customColorMap: IColorMap = {};

	private constructor(id: string, label: string, settingsId: string) {
		this.id = id;
		this.label = label;
		this.settingsId = settingsId;
		this.isLoaded = false;
	}

	get tokenColors(): ITokenColorizationRule[] {
		const result: ITokenColorizationRule[] = [];

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

		function addRule(rule: ITokenColorizationRule) {
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

	public getDefault(colorId: ColorIdentifier): Color | undefined {
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

	public ensureLoaded(fileService: IFileService): Promise<void> {
		return !this.isLoaded ? this.load(fileService) : Promise.resolve(undefined);
	}

	public reload(fileService: IFileService): Promise<void> {
		return this.load(fileService);
	}

	private load(fileService: IFileService): Promise<void> {
		if (!this.location) {
			return Promise.resolve(undefined);
		}
		this.themeTokenColors = [];
		this.colorMap = {};
		return _loadColorTheme(fileService, this.location, this.themeTokenColors, this.colorMap).then(_ => {
			this.isLoaded = true;
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

function _loadColorTheme(fileService: IFileService, themeLocation: URI, resultRules: ITokenColorizationRule[], resultColors: IColorMap): Promise<any> {
	if (resources.extname(themeLocation) === '.json') {
		return fileService.readFile(themeLocation).then(content => {
			let errors: Json.ParseError[] = [];
			let contentValue = Json.parse(content.value.toString(), errors);
			if (errors.length > 0) {
				return Promise.reject(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
			}
			let includeCompletes: Promise<any> = Promise.resolve(null);
			if (contentValue.include) {
				includeCompletes = _loadColorTheme(fileService, resources.joinPath(resources.dirname(themeLocation), contentValue.include), resultRules, resultColors);
			}
			return includeCompletes.then(_ => {
				if (Array.isArray(contentValue.settings)) {
					convertSettings(contentValue.settings, resultRules, resultColors);
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
						return _loadSyntaxTokens(fileService, resources.joinPath(resources.dirname(themeLocation), tokenColors), resultRules, {});
					} else {
						return Promise.reject(new Error(nls.localize({ key: 'error.invalidformat.tokenColors', comment: ['{0} will be replaced by a path. Values in quotes should not be translated.'] }, "Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file", themeLocation.toString())));
					}
				}
				return null;
			});
		});
	} else {
		return _loadSyntaxTokens(fileService, themeLocation, resultRules, resultColors);
	}
}

function _loadSyntaxTokens(fileService: IFileService, themeLocation: URI, resultRules: ITokenColorizationRule[], resultColors: IColorMap): Promise<any> {
	return fileService.readFile(themeLocation).then(content => {
		try {
			let contentValue = parsePList(content.value.toString());
			let settings: ITokenColorizationRule[] = contentValue.settings;
			if (!Array.isArray(settings)) {
				return Promise.reject(new Error(nls.localize('error.plist.invalidformat', "Problem parsing tmTheme file: {0}. 'settings' is not array.")));
			}
			convertSettings(settings, resultRules, resultColors);
			return Promise.resolve(null);
		} catch (e) {
			return Promise.reject(new Error(nls.localize('error.cannotparse', "Problems parsing tmTheme file: {0}", e.message)));
		}
	}, error => {
		return Promise.reject(new Error(nls.localize('error.cannotload', "Problems loading tmTheme file {0}: {1}", themeLocation.toString(), error.message)));
	});
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