/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';

export const multiDiffEditorHeaderBackground = registerColor(
	'multiDiffEditor.headerBackground',
	{ dark: '#808080', light: '#b4b4b4', hcDark: '#808080', hcLight: '#b4b4b4', },
	localize('multiDiffEditor.headerBackground', 'The background color of the diff editor\'s header')
);

export const multiDiffEditorBackground = registerColor(
	'multiDiffEditor.background',
	{ dark: '#000000', light: '#e5e5e5', hcDark: '#000000', hcLight: '#e5e5e5', },
	localize('multiDiffEditor.background', 'The background color of the multi file diff editor')
);

export const multiDiffEditorBorder = registerColor(
	'multiDiffEditor.border',
	{ dark: 'sideBarSectionHeader.border', light: '#cccccc', hcDark: 'sideBarSectionHeader.border', hcLight: '#cccccc', },
	localize('multiDiffEditor.border', 'The border color of the multi file diff editor')
);

