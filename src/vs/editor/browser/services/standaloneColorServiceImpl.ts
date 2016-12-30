/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { Theme } from 'vs/editor/common/modes/supports/tokenization';
import { IStandaloneColorService } from 'vs/editor/common/services/standaloneColorService';
import { vs } from 'vs/editor/common/standalone/themes';
import * as dom from 'vs/base/browser/dom';

export class StandaloneColorServiceImpl implements IStandaloneColorService {

	_serviceBrand: any;

	private _onThemeChanged: Emitter<void> = new Emitter<void>();
	public onThemeChanged: Event<void> = this._onThemeChanged.event;

	private _theme: Theme;
	private _styleElement: HTMLStyleElement;

	constructor() {
		this._theme = Theme.createFromRawTheme(vs);
		this._styleElement = dom.createStyleSheet();

		let colorMap = this._theme.getColorMap();
		let rules: string[] = [];
		for (let i = 0, len = colorMap.length; i < len; i++) {
			let color = colorMap[i];
			rules[i] = `.mtk${i} { color: #${color}; }`;
		}
		rules.push('.mtki { font-style: italic; }');
		rules.push('.mtkb { font-weight: bold; }');
		rules.push('.mtku { text-decoration: underline; }');

		this._styleElement.innerHTML = rules.join('\n');
	}

	public getTheme(): Theme {
		return this._theme;
	}
}
