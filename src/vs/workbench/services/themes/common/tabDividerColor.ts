/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { TAB_BORDER, TAB_DIVIDER } from '../../../common/theme.js';
import { ColorThemeData } from './colorThemeData.js';

/**
 * `tab.divider` defaults to `tab.border`, but a theme that defines `tab.divider` masks that fallback.
 * Returns the customized `tab.border` when the user customized it without customizing `tab.divider`,
 * so the dividers keep following the user's border; otherwise `undefined`.
 */
export function resolveTabDividerBorderCustomization(theme: ColorThemeData): Color | undefined {
	if (theme.getColorCustomization(TAB_DIVIDER) || !theme.getColorCustomization(TAB_BORDER)) {
		return undefined;
	}
	return theme.getColor(TAB_BORDER);
}
