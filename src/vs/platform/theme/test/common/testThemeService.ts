/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IThemeService, ITheme, DARK, IIconTheme } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';
import { TokenStyle, TokenClassification, ProbeScope } from 'vs/platform/theme/common/tokenClassificationRegistry';

export class TestTheme implements ITheme {

	constructor(private colors: { [id: string]: string; } = {}, public type = DARK) {
	}

	getColor(color: string, useDefault?: boolean): Color | undefined {
		let value = this.colors[color];
		if (value) {
			return Color.fromHex(value);
		}
		return undefined;
	}

	defines(color: string): boolean {
		throw new Error('Method not implemented.');
	}

	getTokenStyle(classification: TokenClassification, useDefault?: boolean | undefined): TokenStyle | undefined {
		throw new Error('Method not implemented.');
	}

	resolveScopes(scopes: ProbeScope[]): TokenStyle | undefined {
		throw new Error('Method not implemented.');
	}
}

export class TestIconTheme implements IIconTheme {
	hasFileIcons = false;
	hasFolderIcons = false;
	hidesExplorerArrows = false;
}

export class TestThemeService implements IThemeService {

	_serviceBrand: undefined;
	_theme: ITheme;
	_iconTheme: IIconTheme;
	_onThemeChange = new Emitter<ITheme>();
	_onIconThemeChange = new Emitter<IIconTheme>();

	constructor(theme = new TestTheme(), iconTheme = new TestIconTheme()) {
		this._theme = theme;
		this._iconTheme = iconTheme;
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

	getIconTheme(): IIconTheme {
		return this._iconTheme;
	}

	public get onIconThemeChange(): Event<IIconTheme> {
		return this._onIconThemeChange.event;
	}
}
