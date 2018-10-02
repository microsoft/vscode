/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITheme } from 'vs/platform/theme/common/themeService';
import { editorBackground, ColorDefaults, ColorValue } from 'vs/platform/theme/common/colorRegistry';

export function getExtraColor(theme: ITheme, colorId: string, defaults: ColorDefaults & { extra_dark: string }): ColorValue {
	const color = theme.getColor(colorId);
	if (color) {
		return color;
	}

	if (theme.type === 'dark') {
		const background = theme.getColor(editorBackground);
		if (background && background.getRelativeLuminance() < 0.004) {
			return defaults.extra_dark;
		}
	}

	return defaults[theme.type];
}