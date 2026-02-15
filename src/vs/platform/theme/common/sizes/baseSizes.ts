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
