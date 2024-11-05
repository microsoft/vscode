/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorTheme } from '../../platform/theme/common/themeService.js';
import { ColorIdentifier } from '../../platform/theme/common/colorRegistry.js';
import { Color } from '../../base/common/color.js';
import { ColorScheme } from '../../platform/theme/common/theme.js';

export class EditorTheme {

	private _theme: IColorTheme;

	public get type(): ColorScheme {
		return this._theme.type;
	}

	public get value(): IColorTheme {
		return this._theme;
	}

	constructor(theme: IColorTheme) {
		this._theme = theme;
	}

	public update(theme: IColorTheme): void {
		this._theme = theme;
	}

	public getColor(color: ColorIdentifier): Color | undefined {
		return this._theme.getColor(color);
	}
}
