/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Color } from '../../../../base/common/color.js';
import { registerColor } from '../colorUtils.js';

export const colorText = registerColor('color.text',
	{ dark: '#CCCCCC', light: '#616161', hcDark: '#FFFFFF', hcLight: '#292929' },
	nls.localize('color.text', "Default text on neutral surfaces."));

export const colorTextStrong = registerColor('color.text.strong',
	{ dark: '#FFFFFF', light: '#000000', hcDark: '#FFFFFF', hcLight: '#000000' },
	nls.localize('color.text.strong', "High-emphasis text that needs maximum legibility."));

export const colorTextDisabled = registerColor('color.text.disabled',
	{ dark: '#CCCCCC80', light: '#61616180', hcDark: '#A5A5A5', hcLight: '#7F7F7F' },
	nls.localize('color.text.disabled', "Text for unavailable interactions, not supporting descriptions."));

export const colorTextError = registerColor('color.text.error',
	{ dark: '#F48771', light: '#A1260D', hcDark: '#F48771', hcLight: '#B5200D' },
	nls.localize('color.text.error', "Text explaining a failure or a problem that needs attention."));

export const colorTextLink = registerColor('color.text.link',
	{ dark: '#3794FF', light: '#006AB1', hcDark: '#21A6FF', hcLight: '#0F4A85' },
	nls.localize('color.text.link', "Text that navigates to another location."));

export const colorTextOnAccent = registerColor('color.text.onAccent',
	Color.white,
	nls.localize('color.text.onAccent', "Text on a strong accent background. Check contrast with the actual background."));

export const colorIcon = registerColor('color.icon',
	{ dark: '#C5C5C5', light: '#424242', hcDark: '#FFFFFF', hcLight: '#292929' },
	nls.localize('color.icon', "Icons without a semantic status."));

export const colorIconError = registerColor('color.icon.error',
	{ dark: '#F14C4C', light: '#E51400', hcDark: '#F48771', hcLight: '#B5200D' },
	nls.localize('color.icon.error', "An icon indicating a failure. Pair it with a meaningful label."));

export const colorIconWarning = registerColor('color.icon.warning',
	{ dark: '#CCA700', light: '#BF8803', hcDark: '#FFD370', hcLight: '#895503' },
	nls.localize('color.icon.warning', "An icon indicating caution or a risk."));

export const colorIconInfo = registerColor('color.icon.info',
	{ dark: '#59A4F9', light: '#0063D3', hcDark: '#59A4F9', hcLight: '#0063D3' },
	nls.localize('color.icon.info', "An icon indicating useful information."));

export const colorIconSuccess = registerColor('color.icon.success',
	{ dark: '#73C991', light: '#007100', hcDark: '#73C991', hcLight: '#007100' },
	nls.localize('color.icon.success', "An icon confirming a successful outcome, not a call to action."));

export const colorBackgroundCanvas = registerColor('color.background.canvas',
	{ dark: '#1E1E1E', light: '#FFFFFF', hcDark: Color.black, hcLight: Color.white },
	nls.localize('color.background.canvas', "The main content surface."));

export const colorBackgroundRaised = registerColor('color.background.raised',
	{ dark: '#252526', light: '#F3F3F3', hcDark: '#0C141F', hcLight: Color.white },
	nls.localize('color.background.raised', "A supporting surface above the main content."));

export const colorBackgroundEditable = registerColor('color.background.editable',
	{ dark: '#3C3C3C', light: Color.white, hcDark: Color.black, hcLight: Color.white },
	nls.localize('color.background.editable', "A surface for entering or choosing a value."));

export const colorBackgroundAccent = registerColor('color.background.accent',
	{ dark: '#0E639C', light: '#007ACC', hcDark: Color.black, hcLight: '#0F4A85' },
	nls.localize('color.background.accent', "Strong emphasis for a leading action. Do not use it to imply success or selection."));

export const colorBackgroundError = registerColor('color.background.error',
	{ dark: '#5A1D1D', light: '#F2DEDE', hcDark: Color.black, hcLight: Color.white },
	nls.localize('color.background.error', "A surface containing a message about a failure."));

export const colorBackgroundWarning = registerColor('color.background.warning',
	{ dark: '#352A05', light: '#F6F5D2', hcDark: Color.black, hcLight: Color.white },
	nls.localize('color.background.warning', "A surface containing a caution or risk message."));

export const colorBackgroundInfo = registerColor('color.background.info',
	{ dark: '#063B49', light: '#D6ECF2', hcDark: Color.black, hcLight: Color.white },
	nls.localize('color.background.info', "A surface containing useful contextual information."));

export const colorBorderFocus = registerColor('color.border.focus',
	{ dark: '#007FD4', light: '#0090F1', hcDark: '#F38518', hcLight: '#006BBD' },
	nls.localize('color.border.focus', "A boundary indicating where keyboard input goes."));

export const colorBorderContrast = registerColor('color.border.contrast',
	{ dark: null, light: null, hcDark: '#6FC3DF', hcLight: '#0F4A85' },
	nls.localize('color.border.contrast', "An additional surface boundary when the theme needs more contrast."));

export const colorBorderError = registerColor('color.border.error',
	{ dark: '#BE1100', light: '#BE1100', hcDark: colorBorderContrast, hcLight: colorBorderContrast },
	nls.localize('color.border.error', "A boundary indicating a value or message that needs correction."));

export const colorBorderWarning = registerColor('color.border.warning',
	{ dark: '#B89500', light: '#B89500', hcDark: colorBorderContrast, hcLight: colorBorderContrast },
	nls.localize('color.border.warning', "A boundary indicating a caution or risk."));

export const colorBorderInfo = registerColor('color.border.info',
	{ dark: '#007ACC', light: '#007ACC', hcDark: colorBorderContrast, hcLight: colorBorderContrast },
	nls.localize('color.border.info', "A boundary identifying contextual information."));
