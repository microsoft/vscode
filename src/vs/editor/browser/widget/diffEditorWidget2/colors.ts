/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';

export const diffMoveBorder = registerColor(
	'diffEditor.move.border',
	{ dark: '#8b8b8b9c', light: '#8b8b8b9c', hcDark: '#8b8b8b9c', hcLight: '#8b8b8b9c', },
	localize('diffEditor.move.border', 'The border color for text that got moved in the diff editor.')
);

export const diffMoveBorderActive = registerColor(
	'diffEditor.moveActive.border',
	{ dark: '#FFA500', light: '#FFA500', hcDark: '#FFA500', hcLight: '#FFA500', },
	localize('diffEditor.moveActive.border', 'The active border color for text that got moved in the diff editor.')
);
