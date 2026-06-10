/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerSize, sizeForAllThemes } from '../sizeUtils.js';

// ------ Font Sizes

export const bodyFontSize = registerSize('bodyFontSize',
	sizeForAllThemes(13, 'px'),
	nls.localize('bodyFontSize', "Base font size. This size is used if not overridden by a component."));

export const bodyFontSizeSmall = registerSize('bodyFontSize.small',
	sizeForAllThemes(12, 'px'),
	nls.localize('bodyFontSizeSmall', "Small font size for secondary content."));

export const bodyFontSizeXSmall = registerSize('bodyFontSize.xSmall',
	sizeForAllThemes(11, 'px'),
	nls.localize('bodyFontSizeXSmall', "Extra small font size for less prominent content."));

export const codiconFontSize = registerSize('codiconFontSize',
	sizeForAllThemes(16, 'px'),
	nls.localize('codiconFontSize', "Base font size for codicons."));

export const codiconFontSizeCompact = registerSize('codiconFontSize.compact',
	sizeForAllThemes(12, 'px'),
	nls.localize('codiconFontSizeCompact', "Compact font size for codicons."));

// ------ Corner Radii

export const cornerRadiusMedium = registerSize('cornerRadius.medium',
	sizeForAllThemes(6, 'px'),
	nls.localize('cornerRadiusMedium', "Base corner radius for UI elements."));

export const cornerRadiusXSmall = registerSize('cornerRadius.xSmall',
	sizeForAllThemes(2, 'px'),
	nls.localize('cornerRadiusXSmall', "Extra small corner radius for very compact UI elements."));

export const cornerRadiusSmall = registerSize('cornerRadius.small',
	sizeForAllThemes(4, 'px'),
	nls.localize('cornerRadiusSmall', "Small corner radius for compact UI elements."));

export const cornerRadiusLarge = registerSize('cornerRadius.large',
	sizeForAllThemes(8, 'px'),
	nls.localize('cornerRadiusLarge', "Large corner radius for prominent UI elements."));

export const cornerRadiusXLarge = registerSize('cornerRadius.xLarge',
	sizeForAllThemes(12, 'px'),
	nls.localize('cornerRadiusXLarge', "Extra large corner radius for very prominent UI elements."));

export const cornerRadiusCircle = registerSize('cornerRadius.circle',
	sizeForAllThemes(9999, 'px'),
	nls.localize('cornerRadiusCircle', "Circular corner radius for fully rounded UI elements."));

// ------ Stroke Thickness

export const strokeThickness = registerSize('strokeThickness',
	sizeForAllThemes(1, 'px'),
	nls.localize('strokeThickness', "Base stroke thickness for borders and outlines."));

// ------ Spacing ramp
//
// A fixed ramp of spacing tokens used for padding, margins and gaps. Numeric tokens
// encode the value in tenths of a pixel (e.g. `size200` is 20px). `sizeNone`
// represents 0px, matching the design system's spacing ramp.

export const spacingNone = registerSize('spacing.sizeNone',
	sizeForAllThemes(0, 'px'),
	nls.localize('spacingNone', "No spacing (0px)."));

export const spacingSize20 = registerSize('spacing.size20',
	sizeForAllThemes(2, 'px'),
	nls.localize('spacingSize20', "Spacing of 2px."));

export const spacingSize40 = registerSize('spacing.size40',
	sizeForAllThemes(4, 'px'),
	nls.localize('spacingSize40', "Spacing of 4px."));

export const spacingSize60 = registerSize('spacing.size60',
	sizeForAllThemes(6, 'px'),
	nls.localize('spacingSize60', "Spacing of 6px."));

export const spacingSize80 = registerSize('spacing.size80',
	sizeForAllThemes(8, 'px'),
	nls.localize('spacingSize80', "Spacing of 8px."));

export const spacingSize100 = registerSize('spacing.size100',
	sizeForAllThemes(10, 'px'),
	nls.localize('spacingSize100', "Spacing of 10px."));

export const spacingSize120 = registerSize('spacing.size120',
	sizeForAllThemes(12, 'px'),
	nls.localize('spacingSize120', "Spacing of 12px."));

export const spacingSize160 = registerSize('spacing.size160',
	sizeForAllThemes(16, 'px'),
	nls.localize('spacingSize160', "Spacing of 16px."));

export const spacingSize200 = registerSize('spacing.size200',
	sizeForAllThemes(20, 'px'),
	nls.localize('spacingSize200', "Spacing of 20px."));

export const spacingSize240 = registerSize('spacing.size240',
	sizeForAllThemes(24, 'px'),
	nls.localize('spacingSize240', "Spacing of 24px."));

export const spacingSize280 = registerSize('spacing.size280',
	sizeForAllThemes(28, 'px'),
	nls.localize('spacingSize280', "Spacing of 28px."));

export const spacingSize320 = registerSize('spacing.size320',
	sizeForAllThemes(32, 'px'),
	nls.localize('spacingSize320', "Spacing of 32px."));

export const spacingSize360 = registerSize('spacing.size360',
	sizeForAllThemes(36, 'px'),
	nls.localize('spacingSize360', "Spacing of 36px."));

export const spacingSize400 = registerSize('spacing.size400',
	sizeForAllThemes(40, 'px'),
	nls.localize('spacingSize400', "Spacing of 40px."));
