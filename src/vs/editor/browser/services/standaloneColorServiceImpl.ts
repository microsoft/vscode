/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Theme, IThemeRule } from 'vs/editor/common/modes/supports/tokenization';
import { IStandaloneColorService, BuiltinTheme, ITheme } from 'vs/editor/common/services/standaloneColorService';
import { vs, vs_dark, hc_black } from 'vs/editor/common/standalone/themes';
import * as dom from 'vs/base/browser/dom';
import { TokenizationRegistry } from 'vs/editor/common/modes';

class KnownTheme {
	cssClassName: string;
	rules: IThemeRule[];

	constructor(cssClassName: string, rules: IThemeRule[]) {
		this.cssClassName = cssClassName;
		this.rules = rules;
	}
}

const VS_THEME_NAME = 'vs';
const VS_DARK_THEME_NAME = 'vs-dark';
const HC_BLACK_THEME_NAME = 'hc-black';

function isBuiltinTheme(themeName: string): themeName is BuiltinTheme {
	return (
		themeName === VS_THEME_NAME
		|| themeName === VS_DARK_THEME_NAME
		|| themeName === HC_BLACK_THEME_NAME
	);
}

function getBuiltinRules(builtinTheme: BuiltinTheme): IThemeRule[] {
	switch (builtinTheme) {
		case VS_THEME_NAME:
			return vs;
		case VS_DARK_THEME_NAME:
			return vs_dark;
		case HC_BLACK_THEME_NAME:
			return hc_black;
	}
}

export class StandaloneColorServiceImpl implements IStandaloneColorService {

	_serviceBrand: any;

	private _knownThemes: Map<string, KnownTheme>;
	private _styleElement: HTMLStyleElement;
	private _theme: Theme;

	constructor() {
		this._knownThemes = new Map<string, KnownTheme>();
		this._knownThemes.set(VS_THEME_NAME, new KnownTheme(VS_THEME_NAME, getBuiltinRules(VS_THEME_NAME)));
		this._knownThemes.set(VS_DARK_THEME_NAME, new KnownTheme(VS_DARK_THEME_NAME, getBuiltinRules(VS_DARK_THEME_NAME)));
		this._knownThemes.set(HC_BLACK_THEME_NAME, new KnownTheme(HC_BLACK_THEME_NAME, getBuiltinRules(HC_BLACK_THEME_NAME)));
		this._styleElement = dom.createStyleSheet();
		this._styleElement.className = 'monaco-tokens-styles';
		this.setTheme(VS_THEME_NAME);
	}

	private static _generateCSS(colorMap: string[]): string {
		let rules: string[] = [];
		for (let i = 1, len = colorMap.length; i < len; i++) {
			let color = colorMap[i];
			rules[i] = `.mtk${i} { color: #${color}; }`;
		}
		rules.push('.mtki { font-style: italic; }');
		rules.push('.mtkb { font-weight: bold; }');
		rules.push('.mtku { text-decoration: underline; }');
		return rules.join('\n');
	}

	public defineTheme(themeName: string, themeData: ITheme): void {
		if (!/^[a-z0-9\-]+$/i.test(themeName) || isBuiltinTheme(themeName)) {
			throw new Error('Illegal theme name!');
		}
		if (!isBuiltinTheme(themeData.base)) {
			throw new Error('Illegal theme base!');
		}

		let cssClassName = themeData.base + ' ' + themeName;

		let rules: IThemeRule[] = [];
		if (themeData.inherit) {
			rules = rules.concat(getBuiltinRules(themeData.base));
		}
		rules = rules.concat(themeData.rules);

		this._knownThemes.set(themeName, new KnownTheme(cssClassName, rules));
	}

	public getTheme(): Theme {
		return this._theme;
	}

	public setTheme(themeName: string): string {
		let themeData: KnownTheme;
		if (this._knownThemes.has(themeName)) {
			themeData = this._knownThemes.get(themeName);
		} else {
			themeData = this._knownThemes.get(VS_THEME_NAME);
		}


		this._theme = Theme.createFromRawTheme(themeData.rules);
		let colorMap = this._theme.getColorMap();
		let cssRules = StandaloneColorServiceImpl._generateCSS(colorMap);
		this._styleElement.innerHTML = cssRules;

		TokenizationRegistry.setColorMap(colorMap);

		return themeData.cssClassName;
	}
}
