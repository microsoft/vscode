/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { registerSize, size, sizeForAllThemes } from '../sizeUtils.js';

// ------ Font Sizes

export const fontSize = registerSize('fontSize',
	sizeForAllThemes(13, 'px'),
	nls.localize('fontSize', "Base font size. This size is used if not overridden by a component."));

export const fontSizeSmall = registerSize('fontSize.small',
	sizeForAllThemes(11, 'px'),
	nls.localize('fontSizeSmall', "Small font size for secondary content."));

export const fontSizeLarge = registerSize('fontSize.large',
	sizeForAllThemes(16, 'px'),
	nls.localize('fontSizeLarge', "Large font size for headings and prominent content."));

// ------ Line Heights

export const lineHeight = registerSize('lineHeight',
	sizeForAllThemes(1.5, 'em'),
	nls.localize('lineHeight', "Base line height. This height is used if not overridden by a component."));

export const lineHeightCompact = registerSize('lineHeight.compact',
	sizeForAllThemes(1.3, 'em'),
	nls.localize('lineHeightCompact', "Compact line height for dense content."));

export const lineHeightRelaxed = registerSize('lineHeight.relaxed',
	sizeForAllThemes(1.8, 'em'),
	nls.localize('lineHeightRelaxed', "Relaxed line height for readable content."));

// ------ Letter Spacing

export const letterSpacing = registerSize('letterSpacing',
	sizeForAllThemes(0, 'px'),
	nls.localize('letterSpacing', "Base letter spacing. This spacing is used if not overridden by a component."));

export const letterSpacingWide = registerSize('letterSpacing.wide',
	sizeForAllThemes(0.5, 'px'),
	nls.localize('letterSpacingWide', "Wide letter spacing for headings."));

// ------ Corner Radii

export const cornerRadius = registerSize('cornerRadius',
	{ dark: size(3, 'px'), light: size(3, 'px'), hcDark: size(0, 'px'), hcLight: size(0, 'px') },
	nls.localize('cornerRadius', "Base corner radius for UI elements."));

export const cornerRadiusSmall = registerSize('cornerRadius.small',
	{ dark: size(2, 'px'), light: size(2, 'px'), hcDark: size(0, 'px'), hcLight: size(0, 'px') },
	nls.localize('cornerRadiusSmall', "Small corner radius for compact UI elements."));

export const cornerRadiusLarge = registerSize('cornerRadius.large',
	{ dark: size(6, 'px'), light: size(6, 'px'), hcDark: size(0, 'px'), hcLight: size(0, 'px') },
	nls.localize('cornerRadiusLarge', "Large corner radius for prominent UI elements."));

// ------ Stroke Thickness

export const strokeThickness = registerSize('strokeThickness',
	sizeForAllThemes(1, 'px'),
	nls.localize('strokeThickness', "Base stroke thickness for borders and outlines."));

export const strokeThicknessThick = registerSize('strokeThickness.thick',
	sizeForAllThemes(2, 'px'),
	nls.localize('strokeThicknessThick', "Thick stroke for emphasized borders."));

export const strokeThicknessFocus = registerSize('strokeThickness.focus',
	{ dark: size(1, 'px'), light: size(1, 'px'), hcDark: size(2, 'px'), hcLight: size(2, 'px') },
	nls.localize('strokeThicknessFocus', "Stroke thickness for focus indicators."));
