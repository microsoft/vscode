/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { editorWidgetBorder, focusBorder, inputBackground, inputBorder, inputForeground, listHoverBackground, registerColor, selectBackground, selectBorder, selectForeground, checkboxBackground, checkboxBorder, checkboxForeground, transparent } from 'vs/platform/theme/common/colorRegistry';
import { PANEL_BORDER } from 'vs/workbench/common/theme';

// General setting colors
export const settingsHeaderForeground = registerColor('settings.headerForeground', { light: '#444444', dark: '#e7e7e7', hc: '#ffffff' }, localize('headerForeground', "The foreground color for a section header or active title."));
export const modifiedItemIndicator = registerColor('settings.modifiedItemIndicator', {
	light: new Color(new RGBA(102, 175, 224)),
	dark: new Color(new RGBA(12, 125, 157)),
	hc: new Color(new RGBA(0, 73, 122))
}, localize('modifiedItemForeground', "The color of the modified setting indicator."));
export const settingsHeaderBorder = registerColor('settings.headerBorder', { dark: PANEL_BORDER, light: PANEL_BORDER, hc: PANEL_BORDER }, localize('settingsHeaderBorder', "The color of the header container border."));
export const settingsSashBorder = registerColor('settings.sashBorder', { dark: PANEL_BORDER, light: PANEL_BORDER, hc: PANEL_BORDER }, localize('settingsSashBorder', "The color of the Settings editor splitview sash border."));

// Enum control colors
export const settingsSelectBackground = registerColor(`settings.dropdownBackground`, { dark: selectBackground, light: selectBackground, hc: selectBackground }, localize('settingsDropdownBackground', "Settings editor dropdown background."));
export const settingsSelectForeground = registerColor('settings.dropdownForeground', { dark: selectForeground, light: selectForeground, hc: selectForeground }, localize('settingsDropdownForeground', "Settings editor dropdown foreground."));
export const settingsSelectBorder = registerColor('settings.dropdownBorder', { dark: selectBorder, light: selectBorder, hc: selectBorder }, localize('settingsDropdownBorder', "Settings editor dropdown border."));
export const settingsSelectListBorder = registerColor('settings.dropdownListBorder', { dark: editorWidgetBorder, light: editorWidgetBorder, hc: editorWidgetBorder }, localize('settingsDropdownListBorder', "Settings editor dropdown list border. This surrounds the options and separates the options from the description."));

// Bool control colors
export const settingsCheckboxBackground = registerColor('settings.checkboxBackground', { dark: checkboxBackground, light: checkboxBackground, hc: checkboxBackground }, localize('settingsCheckboxBackground', "Settings editor checkbox background."));
export const settingsCheckboxForeground = registerColor('settings.checkboxForeground', { dark: checkboxForeground, light: checkboxForeground, hc: checkboxForeground }, localize('settingsCheckboxForeground', "Settings editor checkbox foreground."));
export const settingsCheckboxBorder = registerColor('settings.checkboxBorder', { dark: checkboxBorder, light: checkboxBorder, hc: checkboxBorder }, localize('settingsCheckboxBorder', "Settings editor checkbox border."));

// Text control colors
export const settingsTextInputBackground = registerColor('settings.textInputBackground', { dark: inputBackground, light: inputBackground, hc: inputBackground }, localize('textInputBoxBackground', "Settings editor text input box background."));
export const settingsTextInputForeground = registerColor('settings.textInputForeground', { dark: inputForeground, light: inputForeground, hc: inputForeground }, localize('textInputBoxForeground', "Settings editor text input box foreground."));
export const settingsTextInputBorder = registerColor('settings.textInputBorder', { dark: inputBorder, light: inputBorder, hc: inputBorder }, localize('textInputBoxBorder', "Settings editor text input box border."));

// Number control colors
export const settingsNumberInputBackground = registerColor('settings.numberInputBackground', { dark: inputBackground, light: inputBackground, hc: inputBackground }, localize('numberInputBoxBackground', "Settings editor number input box background."));
export const settingsNumberInputForeground = registerColor('settings.numberInputForeground', { dark: inputForeground, light: inputForeground, hc: inputForeground }, localize('numberInputBoxForeground', "Settings editor number input box foreground."));
export const settingsNumberInputBorder = registerColor('settings.numberInputBorder', { dark: inputBorder, light: inputBorder, hc: inputBorder }, localize('numberInputBoxBorder', "Settings editor number input box border."));

export const focusedRowBackground = registerColor('settings.focusedRowBackground', {
	dark: transparent(listHoverBackground, .6),
	light: transparent(listHoverBackground, .6),
	hc: null
}, localize('focusedRowBackground', "The background color of a settings row when focused."));

export const rowHoverBackground = registerColor('settings.rowHoverBackground', {
	dark: transparent(listHoverBackground, .3),
	light: transparent(listHoverBackground, .3),
	hc: null
}, localize('settings.rowHoverBackground', "The background color of a settings row when hovered."));

export const focusedRowBorder = registerColor('settings.focusedRowBorder', {
	dark: Color.white.transparent(0.12),
	light: Color.black.transparent(0.12),
	hc: focusBorder
}, localize('settings.focusedRowBorder', "The color of the row's top and bottom border when the row is focused."));
