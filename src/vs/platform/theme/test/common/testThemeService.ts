/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, Emitter } from 'vs/base/common/event';
import { IThemeService, ITheme, DARK } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';

export class TestTheme implements ITheme {

	constructor(private colors: { [id: string]: string; } = {}, public type = DARK) {
	}

	getColor(color: string, useDefault?: boolean): Color {
		let value = this.colors[color];
		if (value) {
			return Color.fromHex(value);
		}
		return void 0;
	}

	defines(color: string): boolean {
		throw new Error('Method not implemented.');
	}
}

export class TestThemeService implements IThemeService {

	_serviceBrand: any;
	_theme: ITheme;
	_onThemeChange = new Emitter<ITheme>();

	constructor(theme = new TestTheme()) {
		this._theme = theme;
	}

	getTheme(): ITheme {
		return this._theme;
	}

	setTheme(theme: ITheme) {
		this._theme = theme;
		this.fireThemeChange();
	}

	fireThemeChange() {
		this._onThemeChange.fire(this._theme);
	}

	public get onThemeChange(): Event<ITheme> {
		return this._onThemeChange.event;
	}
}
