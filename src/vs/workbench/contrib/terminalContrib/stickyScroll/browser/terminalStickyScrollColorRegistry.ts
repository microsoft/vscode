/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { registerColor } from '../../../../../platform/theme/common/colorUtils.js';

export const terminalStickyScrollBackground = registerColor('terminalStickyScroll.background', null, localize('terminalStickyScroll.background', 'The background color of the sticky scroll overlay in the terminal.'));

export const terminalStickyScrollHoverBackground = registerColor('terminalStickyScrollHover.background', {
	dark: '#2A2D2E',
	light: '#F0F0F0',
	hcDark: '#E48B39',
	hcLight: '#0f4a85'
}, localize('terminalStickyScrollHover.background', 'The background color of the sticky scroll overlay in the terminal when hovered.'));

registerColor('terminalStickyScroll.border', {
	dark: null,
	light: null,
	hcDark: '#6fc3df',
	hcLight: '#0f4a85'
}, localize('terminalStickyScroll.border', 'The border of the sticky scroll overlay in the terminal.'));
