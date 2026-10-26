/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../../../../base/common/color.js';
import { localize } from '../../../../../../../nls.js';
import { foreground, registerColor } from '../../../../../../../platform/theme/common/colorRegistry.js';

// The GitHub Copilot brand gradient, from mint to purple. High contrast themes drop
// the fill, so the badge reads as an outlined pill in the regular foreground.

export const chatFusionBadgeGradientStart = registerColor(
	'chat.fusionBadgeGradientStart',
	{ dark: '#94f6ed', light: '#94f6ed', hcDark: Color.transparent, hcLight: Color.transparent },
	localize('chat.fusionBadgeGradientStart', "Start color of the gradient behind the Copilot Fusion badge (discount or Recommended) in the model picker."));

export const chatFusionBadgeGradientEnd = registerColor(
	'chat.fusionBadgeGradientEnd',
	{ dark: '#a685f3', light: '#a685f3', hcDark: Color.transparent, hcLight: Color.transparent },
	localize('chat.fusionBadgeGradientEnd', "End color of the gradient behind the Copilot Fusion badge (discount or Recommended) in the model picker."));

export const chatFusionBadgeForeground = registerColor(
	'chat.fusionBadgeForeground',
	{ dark: '#1f1f1f', light: '#1f1f1f', hcDark: foreground, hcLight: foreground },
	localize('chat.fusionBadgeForeground', "Foreground color of the Copilot Fusion badge (discount or Recommended) in the model picker."));
