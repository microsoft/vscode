/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerSize, sizeForAllThemes } from '../sizeUtils.js';

// ------ Font Sizes

/** @deprecated Use {@link fontSizeBody1} instead. */
export const bodyFontSize = registerSize('bodyFontSize',
	sizeForAllThemes(13, 'px'),
	nls.localize('bodyFontSize', "Base font size. This size is used if not overridden by a component."),
	nls.localize('bodyFontSize.deprecated', "Deprecated: use `fontSize.body1` instead."));

/** @deprecated Use {@link fontSizeLabel1} instead. */
export const bodyFontSizeSmall = registerSize('bodyFontSize.small',
	sizeForAllThemes(12, 'px'),
	nls.localize('bodyFontSizeSmall', "Small font size for secondary content."),
	nls.localize('bodyFontSizeSmall.deprecated', "Deprecated: use `fontSize.label1` instead."));

/** @deprecated Use {@link fontSizeBody2} instead. */
export const bodyFontSizeXSmall = registerSize('bodyFontSize.xSmall',
	sizeForAllThemes(11, 'px'),
	nls.localize('bodyFontSizeXSmall', "Extra small font size for less prominent content."),
	nls.localize('bodyFontSizeXSmall.deprecated', "Deprecated: use `fontSize.body2` instead."));

// ------ Font ramp
//
// A generic font-size ramp (headings, body and labels) mirroring the agents
// window ramp. "Strong" variants are NOT separate size tokens: reuse the
// matching size token paired with `fontWeight.semiBold` (600). Regular text
// pairs with `fontWeight.regular` (400).

export const fontSizeHeading1 = registerSize('fontSize.heading1',
	sizeForAllThemes(26, 'px'),
	nls.localize('fontSizeHeading1', "Heading 1 font size (largest heading)."));

export const fontSizeHeading2 = registerSize('fontSize.heading2',
	sizeForAllThemes(18, 'px'),
	nls.localize('fontSizeHeading2', "Heading 2 font size (title)."));

export const fontSizeHeading3 = registerSize('fontSize.heading3',
	sizeForAllThemes(13, 'px'),
	nls.localize('fontSizeHeading3', "Heading 3 font size (subtitle)."));

export const fontSizeBody1 = registerSize('fontSize.body1',
	sizeForAllThemes(13, 'px'),
	nls.localize('fontSizeBody1', "Primary body font size."));

export const fontSizeBody2 = registerSize('fontSize.body2',
	sizeForAllThemes(11, 'px'),
	nls.localize('fontSizeBody2', "Secondary body font size."));

export const fontSizeLabel1 = registerSize('fontSize.label1',
	sizeForAllThemes(12, 'px'),
	nls.localize('fontSizeLabel1', "Label 1 font size (section title, tabs)."));

export const fontSizeLabel2 = registerSize('fontSize.label2',
	sizeForAllThemes(11, 'px'),
	nls.localize('fontSizeLabel2', "Label 2 font size (metadata)."));

export const fontSizeLabel3 = registerSize('fontSize.label3',
	sizeForAllThemes(10, 'px'),
	nls.localize('fontSizeLabel3', "Label 3 font size (badge)."));

// ------ Font weights
//
// A two-weight ramp (regular/semiBold). "Strong" emphasis reuses the matching
// font-size token paired with `fontWeight.semiBold`.

export const fontWeightRegular = registerSize('fontWeight.regular',
	sizeForAllThemes(400, ''),
	nls.localize('fontWeightRegular', "Regular font weight (400) for body, labels and metadata."));

export const fontWeightSemiBold = registerSize('fontWeight.semiBold',
	sizeForAllThemes(600, ''),
	nls.localize('fontWeightSemiBold', "SemiBold font weight (600) for headings and strong emphasis."));

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
