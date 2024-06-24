/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

// Import the effects we need
import { Color, RGBA } from 'vs/base/common/color';
import { registerColor, oneOf } from 'vs/platform/theme/common/colorUtils';

// Import the colors we need
import { editorWidgetBackground, editorWidgetForeground } from 'vs/platform/theme/common/colors/editorColors';
import { listActiveSelectionBackground, listActiveSelectionForeground, listActiveSelectionIconForeground } from 'vs/platform/theme/common/colors/listColors';


export const quickInputBackground = registerColor('quickInput.background',
	{ dark: editorWidgetBackground, light: editorWidgetBackground, hcDark: editorWidgetBackground, hcLight: editorWidgetBackground },
	nls.localize('pickerBackground', "Quick picker background color. The quick picker widget is the container for pickers like the command palette."));

export const quickInputForeground = registerColor('quickInput.foreground',
	{ dark: editorWidgetForeground, light: editorWidgetForeground, hcDark: editorWidgetForeground, hcLight: editorWidgetForeground },
	nls.localize('pickerForeground', "Quick picker foreground color. The quick picker widget is the container for pickers like the command palette."));

export const quickInputTitleBackground = registerColor('quickInputTitle.background',
	{ dark: new Color(new RGBA(255, 255, 255, 0.105)), light: new Color(new RGBA(0, 0, 0, 0.06)), hcDark: '#000000', hcLight: Color.white },
	nls.localize('pickerTitleBackground', "Quick picker title background color. The quick picker widget is the container for pickers like the command palette."));

export const pickerGroupForeground = registerColor('pickerGroup.foreground',
	{ dark: '#3794FF', light: '#0066BF', hcDark: Color.white, hcLight: '#0F4A85' },
	nls.localize('pickerGroupForeground', "Quick picker color for grouping labels."));

export const pickerGroupBorder = registerColor('pickerGroup.border',
	{ dark: '#3F3F46', light: '#CCCEDB', hcDark: Color.white, hcLight: '#0F4A85' },
	nls.localize('pickerGroupBorder', "Quick picker color for grouping borders."));

export const _deprecatedQuickInputListFocusBackground = registerColor('quickInput.list.focusBackground',
	{ dark: null, light: null, hcDark: null, hcLight: null }, '', undefined,
	nls.localize('quickInput.list.focusBackground deprecation', "Please use quickInputList.focusBackground instead"));

export const quickInputListFocusForeground = registerColor('quickInputList.focusForeground',
	{ dark: listActiveSelectionForeground, light: listActiveSelectionForeground, hcDark: listActiveSelectionForeground, hcLight: listActiveSelectionForeground },
	nls.localize('quickInput.listFocusForeground', "Quick picker foreground color for the focused item."));

export const quickInputListFocusIconForeground = registerColor('quickInputList.focusIconForeground',
	{ dark: listActiveSelectionIconForeground, light: listActiveSelectionIconForeground, hcDark: listActiveSelectionIconForeground, hcLight: listActiveSelectionIconForeground },
	nls.localize('quickInput.listFocusIconForeground', "Quick picker icon foreground color for the focused item."));

export const quickInputListFocusBackground = registerColor('quickInputList.focusBackground',
	{ dark: oneOf(_deprecatedQuickInputListFocusBackground, listActiveSelectionBackground), light: oneOf(_deprecatedQuickInputListFocusBackground, listActiveSelectionBackground), hcDark: null, hcLight: null },
	nls.localize('quickInput.listFocusBackground', "Quick picker background color for the focused item."));
