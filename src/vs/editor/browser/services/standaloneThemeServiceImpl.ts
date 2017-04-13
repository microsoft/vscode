/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TokenTheme, ITokenThemeRule, generateTokensCSSForColorMap } from 'vs/editor/common/modes/supports/tokenization';
import { IStandaloneThemeService, BuiltinTheme, IStandaloneThemeData, IStandaloneTheme, IColors } from 'vs/editor/common/services/standaloneThemeService';
import { vs, vs_dark, hc_black } from 'vs/editor/common/standalone/themes';
import * as dom from 'vs/base/browser/dom';
import { TokenizationRegistry } from 'vs/editor/common/modes';
import { Color } from 'vs/base/common/color';
import { Extensions, IColorRegistry, ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { Extensions as ThemingExtensions, IThemingRegistry, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { Registry } from 'vs/platform/platform';
import Event, { Emitter } from 'vs/base/common/event';

const VS_THEME_NAME = 'vs';
const VS_DARK_THEME_NAME = 'vs-dark';
const HC_BLACK_THEME_NAME = 'hc-black';

const colorRegistry = <IColorRegistry>Registry.as(Extensions.ColorContribution);
const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);

class StandaloneTheme implements IStandaloneTheme {
	id: string;
	selector: string;
	private rules: ITokenThemeRule[];
	base: string;
	private colors: { [colorId: string]: Color };
	private defaultColors: { [colorId: string]: Color };
	private _tokenTheme: TokenTheme;

	constructor(base: string, name: string, colors: IColors, rules: ITokenThemeRule[]) {
		if (name.length > 0) {
			this.id = base + ' ' + name;
			this.selector = base + '.' + name;
		} else {
			this.id = base;
			this.selector = base;
		}
		this.base = base;
		this.rules = rules;
		this.colors = {};
		for (let id in colors) {
			this.colors[id] = Color.fromHex(colors[id]);
		}
		this.defaultColors = {};
	}

	public getColor(colorId: ColorIdentifier, useDefault?: boolean): Color {
		if (this.colors.hasOwnProperty(colorId)) {
			return this.colors[colorId];
		}
		if (useDefault !== false) {
			return this.getDefault(colorId);
		}
		return null;
	}

	private getDefault(colorId: ColorIdentifier): Color {
		if (this.defaultColors.hasOwnProperty(colorId)) {
			return this.defaultColors[colorId];
		}
		let color = colorRegistry.resolveDefaultColor(colorId, this);
		this.defaultColors[colorId] = color;
		return color;
	}

	public isDefault(colorId: ColorIdentifier): boolean {
		if (!this.colors.hasOwnProperty(colorId)) {
			return true;
		}
		let color = this.colors[colorId];
		let defaultValue = this.getDefault(colorId);
		return color ? !!defaultValue : color.equals(defaultValue);
	}

	public get type() {
		switch (this.base) {
			case VS_THEME_NAME: return 'light';
			case HC_BLACK_THEME_NAME: return 'hc';
			default: return 'dark';
		}
	}

	public get tokenTheme(): TokenTheme {
		if (!this._tokenTheme) {
			this._tokenTheme = TokenTheme.createFromRawTokenTheme(this.rules);
		}
		return this._tokenTheme;
	}
}

function isBuiltinTheme(themeName: string): themeName is BuiltinTheme {
	return (
		themeName === VS_THEME_NAME
		|| themeName === VS_DARK_THEME_NAME
		|| themeName === HC_BLACK_THEME_NAME
	);
}

function getBuiltinRules(builtinTheme: BuiltinTheme): IStandaloneThemeData {
	switch (builtinTheme) {
		case VS_THEME_NAME:
			return vs;
		case VS_DARK_THEME_NAME:
			return vs_dark;
		case HC_BLACK_THEME_NAME:
			return hc_black;
	}
}

function newBuiltInTheme(builtinTheme: BuiltinTheme): StandaloneTheme {
	let themeData = getBuiltinRules(builtinTheme);
	return new StandaloneTheme(builtinTheme, '', themeData.colors, themeData.rules);
}

export class StandaloneThemeServiceImpl implements IStandaloneThemeService {

	_serviceBrand: any;

	private _knownThemes: Map<string, StandaloneTheme>;
	private _styleElement: HTMLStyleElement;
	private _theme: IStandaloneTheme;
	private _onThemeChange: Emitter<IStandaloneTheme>;


	constructor() {
		this._onThemeChange = new Emitter<IStandaloneTheme>();

		this._knownThemes = new Map<string, StandaloneTheme>();
		this._knownThemes.set(VS_THEME_NAME, newBuiltInTheme(VS_THEME_NAME));
		this._knownThemes.set(VS_DARK_THEME_NAME, newBuiltInTheme(VS_DARK_THEME_NAME));
		this._knownThemes.set(HC_BLACK_THEME_NAME, newBuiltInTheme(HC_BLACK_THEME_NAME));
		this._styleElement = dom.createStyleSheet();
		this._styleElement.className = 'monaco-colors';
		this.setTheme(VS_THEME_NAME);
	}

	public get onThemeChange(): Event<IStandaloneTheme> {
		return this._onThemeChange.event;
	}

	public defineTheme(themeName: string, themeData: IStandaloneThemeData): void {
		if (!/^[a-z0-9\-]+$/i.test(themeName) || isBuiltinTheme(themeName)) {
			throw new Error('Illegal theme name!');
		}
		if (!isBuiltinTheme(themeData.base)) {
			throw new Error('Illegal theme base!');
		}

		let rules: ITokenThemeRule[] = [];
		let colors: IColors = {};
		if (themeData.inherit) {
			let baseData = getBuiltinRules(themeData.base);
			rules = rules.concat(baseData.rules);
			for (let id in baseData.colors) {
				colors[id] = baseData.colors[id];
			}
		}
		rules = rules.concat(themeData.rules);
		for (let id in themeData.colors) {
			colors[id] = themeData.colors[id];
		}

		this._knownThemes.set(themeName, new StandaloneTheme(themeData.base, themeName, colors, rules));
	}

	public getTheme(): IStandaloneTheme {
		return this._theme;
	}

	public setTheme(themeName: string): string {
		let theme: StandaloneTheme;
		if (this._knownThemes.has(themeName)) {
			theme = this._knownThemes.get(themeName);
		} else {
			theme = this._knownThemes.get(VS_THEME_NAME);
		}
		this._theme = theme;

		let cssRules = [];
		let hasRule = {};
		let ruleCollector: ICssStyleCollector = {
			addRule: (rule: string) => {
				if (!hasRule[rule]) {
					cssRules.push(rule);
					hasRule[rule] = true;
				}
			}
		};
		themingRegistry.getThemingParticipants().forEach(p => p(theme, ruleCollector));

		let tokenTheme = theme.tokenTheme;
		let colorMap = tokenTheme.getColorMap();
		ruleCollector.addRule(generateTokensCSSForColorMap(colorMap));

		this._styleElement.innerHTML = cssRules.join('\n');

		TokenizationRegistry.setColorMap(colorMap);
		this._onThemeChange.fire(theme);

		return theme.id;
	}
}
