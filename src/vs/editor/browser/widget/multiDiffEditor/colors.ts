/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerColor, editorBackground } from '../../../../platform/theme/common/colorRegistry.js';

export const multiDiffEditorHeaderBackground = registerColor(
	'multiDiffEditor.headerBackground',
	{ dark: '#262626', light: 'tab.inactiveBackground', hcDark: 'tab.inactiveBackground', hcLight: 'tab.inactiveBackground', },
	localize('multiDiffEditor.headerBackground', 'The background color of the diff editor\'s header')
);

export const multiDiffEditorBackground = registerColor(
	'multiDiffEditor.background',
	editorBackground,
	localize('multiDiffEditor.background', 'The background color of the multi file diff editor')
);

export const multiDiffEditorBorder = registerColor(
	'multiDiffEditor.border',
	{ dark: 'sideBarSectionHeader.border', light: '#cccccc', hcDark: 'sideBarSectionHeader.border', hcLight: '#cccccc', },
	localize('multiDiffEditor.border', 'The border color of the multi file diff editor')
);

