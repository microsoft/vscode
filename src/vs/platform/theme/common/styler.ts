/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputForeground, ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable } from "vs/base/common/lifecycle";

export interface IThemable {
	style(colors: { [name: string]: ColorIdentifier }): void;
}

export function attachStyler(themeService: IThemeService, widget: IThemable, optionsMapping: { [optionsKey: string]: ColorIdentifier }): IDisposable {
	function applyStyles(theme: ITheme): void {
		const styles = Object.create(null);
		for (let key in optionsMapping) {
			styles[key] = theme.getColor(optionsMapping[key]);
		}

		widget.style(styles);
	}

	applyStyles(themeService.getTheme());

	return themeService.onThemeChange(applyStyles);
}

export function attachInputBoxStyler(widget: IThemable, themeService: IThemeService): IDisposable {
	return attachStyler(themeService, widget, { inputBackground, inputForeground });
}