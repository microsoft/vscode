/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';

// Import the effects we need
import { Color } from '../../../../base/common/color.js';
import { registerColor, transparent } from '../colorUtils.js';

// Import the colors we need
import { contrastBorder, focusBorder } from './baseColors.js';


// ----- sash

export const sashHoverBorder = registerColor('sash.hoverBorder',
	focusBorder,
	nls.localize('sashActiveBorder', "Border color of active sashes."));


// ----- badge

export const badgeBackground = registerColor('badge.background',
	{ dark: '#4D4D4D', light: '#C4C4C4', hcDark: Color.black, hcLight: '#0F4A85' },
	nls.localize('badgeBackground', "Badge background color. Badges are small information labels, e.g. for search results count."));

export const badgeForeground = registerColor('badge.foreground',
	{ dark: Color.white, light: '#333', hcDark: Color.white, hcLight: Color.white },
	nls.localize('badgeForeground', "Badge foreground color. Badges are small information labels, e.g. for search results count."));

export const activityWarningBadgeForeground = registerColor('activityWarningBadge.foreground',
	{ dark: Color.black.lighten(0.2), light: Color.white, hcDark: null, hcLight: Color.black.lighten(0.2) },
	nls.localize('activityWarningBadge.foreground', 'Foreground color of the warning activity badge'));

export const activityWarningBadgeBackground = registerColor('activityWarningBadge.background',
	{ dark: '#CCA700', light: '#BF8803', hcDark: null, hcLight: '#CCA700' },
	nls.localize('activityWarningBadge.background', 'Background color of the warning activity badge'));

export const activityErrorBadgeForeground = registerColor('activityErrorBadge.foreground',
	{ dark: Color.black.lighten(0.2), light: Color.white, hcDark: null, hcLight: Color.black.lighten(0.2) },
	nls.localize('activityErrorBadge.foreground', 'Foreground color of the error activity badge'));

export const activityErrorBadgeBackground = registerColor('activityErrorBadge.background',
	{ dark: '#F14C4C', light: '#E51400', hcDark: null, hcLight: '#F14C4C' },
	nls.localize('activityErrorBadge.background', 'Background color of the error activity badge'));


// ----- scrollbar

export const scrollbarShadow = registerColor('scrollbar.shadow',
	{ dark: '#000000', light: '#DDDDDD', hcDark: null, hcLight: null },
	nls.localize('scrollbarShadow', "Scrollbar shadow to indicate that the view is scrolled."));

export const scrollbarSliderBackground = registerColor('scrollbarSlider.background',
	{ dark: Color.fromHex('#797979').transparent(0.4), light: Color.fromHex('#646464').transparent(0.4), hcDark: transparent(contrastBorder, 0.6), hcLight: transparent(contrastBorder, 0.4) },
	nls.localize('scrollbarSliderBackground', "Scrollbar slider background color."));

export const scrollbarSliderHoverBackground = registerColor('scrollbarSlider.hoverBackground',
	{ dark: Color.fromHex('#646464').transparent(0.7), light: Color.fromHex('#646464').transparent(0.7), hcDark: transparent(contrastBorder, 0.8), hcLight: transparent(contrastBorder, 0.8) },
	nls.localize('scrollbarSliderHoverBackground', "Scrollbar slider background color when hovering."));

export const scrollbarSliderActiveBackground = registerColor('scrollbarSlider.activeBackground',
	{ dark: Color.fromHex('#BFBFBF').transparent(0.4), light: Color.fromHex('#000000').transparent(0.6), hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('scrollbarSliderActiveBackground', "Scrollbar slider background color when clicked on."));


// ----- progress bar

export const progressBarBackground = registerColor('progressBar.background',
	{ dark: Color.fromHex('#0E70C0'), light: Color.fromHex('#0E70C0'), hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('progressBarBackground', "Background color of the progress bar that can show for long running operations."));

// ----- chart

export const chartLine = registerColor('chart.line',
	{ dark: '#236B8E', light: '#236B8E', hcDark: '#236B8E', hcLight: '#236B8E' },
	nls.localize('chartLine', "Line color for the chart."));

export const chartAxis = registerColor('chart.axis',
	{ dark: Color.fromHex('#BFBFBF').transparent(0.4), light: Color.fromHex('#000000').transparent(0.6), hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('chartAxis', "Axis color for the chart."));

export const chartGuide = registerColor('chart.guide',
	{ dark: Color.fromHex('#BFBFBF').transparent(0.2), light: Color.fromHex('#000000').transparent(0.2), hcDark: contrastBorder, hcLight: contrastBorder },
	nls.localize('chartGuide', "Guide line for the chart."));
