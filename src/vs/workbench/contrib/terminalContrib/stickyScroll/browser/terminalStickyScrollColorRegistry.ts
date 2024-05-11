/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorUtils';

export const terminalStickyScrollBackground = registerColor('terminalStickyScroll.background', {
	light: null,
	dark: null,
	hcDark: null,
	hcLight: null
}, localize('terminalStickyScroll.background', 'The background color of the sticky scroll overlay in the terminal.'));

export const terminalStickyScrollHoverBackground = registerColor('terminalStickyScrollHover.background', {
	dark: '#2A2D2E',
	light: '#F0F0F0',
	hcDark: null,
	hcLight: Color.fromHex('#0F4A85').transparent(0.1)
}, localize('terminalStickyScrollHover.background', 'The background color of the sticky scroll overlay in the terminal when hovered.'));
