/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';


export const interactiveResponseBackground = registerColor(
	'interactive.responseBackground',
	{ dark: new Color(new RGBA(255, 255, 255, 0.03)), light: new Color(new RGBA(0, 0, 0, 0.03)), hcDark: null, hcLight: null, },
	localize('interactive.responseBackground', 'The resting background color of an interactive response.')
);

export const interactiveResponseActiveBackground = registerColor(
	'interactive.responseActiveBackground',
	{ dark: new Color(new RGBA(255, 255, 255, 0.10)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: null, hcLight: null, },
	localize('interactive.responseActiveBackground', 'The active background color of an interactive response. Used when the response shows a fade out animation on load.')
);

export const interactiveResponseBorder = registerColor(
	'interactive.responseBorder',
	{ dark: new Color(new RGBA(255, 255, 255, 0.10)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: null, hcLight: null, },
	localize('interactive.responseBorder', 'The border color of an interactive response.')
);
