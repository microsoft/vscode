/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Theme, IThemeRule } from 'vs/editor/common/modes/supports/tokenization';
import { IStandaloneColorService } from 'vs/editor/common/services/standaloneColorService';
import { vs, vs_dark, hc_black } from 'vs/editor/common/standalone/themes';
import * as dom from 'vs/base/browser/dom';
import { TokenizationRegistry } from 'vs/editor/common/modes';

export class StandaloneColorServiceImpl implements IStandaloneColorService {

	_serviceBrand: any;

	private _theme: Theme;
	private _styleElement: HTMLStyleElement;

	constructor() {
		this._styleElement = dom.createStyleSheet();
		this.setTheme('vs');
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

	public getTheme(): Theme {
		return this._theme;
	}

	public setTheme(themeName: string): void {
		let themeRules: IThemeRule[] = null;
		switch (themeName) {
			case 'vs':
				themeRules = vs;
				break;
			case 'vs-dark':
				themeRules = vs_dark;
				break;
			case 'hc-black':
				themeRules = hc_black;
				break;
			default:
				themeRules = [];
		}
		console.log(themeRules);
		this._theme = Theme.createFromRawTheme(themeRules);
		let colorMap = this._theme.getColorMap();
		let cssRules = StandaloneColorServiceImpl._generateCSS(colorMap);
		this._styleElement.innerHTML = cssRules;

		TokenizationRegistry.setColorMap(colorMap);
	}
}
