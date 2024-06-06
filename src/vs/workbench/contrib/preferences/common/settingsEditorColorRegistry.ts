/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { editorWidgetBorder, focusBorder, inputBackground, inputBorder, inputForeground, listHoverBackground, registerColor, selectBackground, selectBorder, selectForeground, checkboxBackground, checkboxBorder, checkboxForeground, transparent } from 'vs/platform/theme/common/colorRegistry';
import { PANEL_BORDER } from 'vs/workbench/common/theme';

// General setting colors
export const settingsHeaderForeground = registerColor('settings.headerForeground', { light: '#444444', dark: '#e7e7e7', hcDark: '#ffffff', hcLight: '#292929' }, localize('headerForeground', "The foreground color for a section header or active title."));
export const settingsHeaderHoverForeground = registerColor('settings.settingsHeaderHoverForeground', transparent(settingsHeaderForeground, 0.7), localize('settingsHeaderHoverForeground', "The foreground color for a section header or hovered title."));
export const modifiedItemIndicator = registerColor('settings.modifiedItemIndicator', {
	light: new Color(new RGBA(102, 175, 224)),
	dark: new Color(new RGBA(12, 125, 157)),
	hcDark: new Color(new RGBA(0, 73, 122)),
	hcLight: new Color(new RGBA(102, 175, 224)),
}, localize('modifiedItemForeground', "The color of the modified setting indicator."));
export const settingsHeaderBorder = registerColor('settings.headerBorder', PANEL_BORDER, localize('settingsHeaderBorder', "The color of the header container border."));
export const settingsSashBorder = registerColor('settings.sashBorder', PANEL_BORDER, localize('settingsSashBorder', "The color of the Settings editor splitview sash border."));

// Enum control colors
export const settingsSelectBackground = registerColor(`settings.dropdownBackground`, selectBackground, localize('settingsDropdownBackground', "Settings editor dropdown background."));
export const settingsSelectForeground = registerColor('settings.dropdownForeground', selectForeground, localize('settingsDropdownForeground', "Settings editor dropdown foreground."));
export const settingsSelectBorder = registerColor('settings.dropdownBorder', selectBorder, localize('settingsDropdownBorder', "Settings editor dropdown border."));
export const settingsSelectListBorder = registerColor('settings.dropdownListBorder', editorWidgetBorder, localize('settingsDropdownListBorder', "Settings editor dropdown list border. This surrounds the options and separates the options from the description."));

// Bool control colors
export const settingsCheckboxBackground = registerColor('settings.checkboxBackground', checkboxBackground, localize('settingsCheckboxBackground', "Settings editor checkbox background."));
export const settingsCheckboxForeground = registerColor('settings.checkboxForeground', checkboxForeground, localize('settingsCheckboxForeground', "Settings editor checkbox foreground."));
export const settingsCheckboxBorder = registerColor('settings.checkboxBorder', checkboxBorder, localize('settingsCheckboxBorder', "Settings editor checkbox border."));

// Text control colors
export const settingsTextInputBackground = registerColor('settings.textInputBackground', inputBackground, localize('textInputBoxBackground', "Settings editor text input box background."));
export const settingsTextInputForeground = registerColor('settings.textInputForeground', inputForeground, localize('textInputBoxForeground', "Settings editor text input box foreground."));
export const settingsTextInputBorder = registerColor('settings.textInputBorder', inputBorder, localize('textInputBoxBorder', "Settings editor text input box border."));

// Number control colors
export const settingsNumberInputBackground = registerColor('settings.numberInputBackground', inputBackground, localize('numberInputBoxBackground', "Settings editor number input box background."));
export const settingsNumberInputForeground = registerColor('settings.numberInputForeground', inputForeground, localize('numberInputBoxForeground', "Settings editor number input box foreground."));
export const settingsNumberInputBorder = registerColor('settings.numberInputBorder', inputBorder, localize('numberInputBoxBorder', "Settings editor number input box border."));

export const focusedRowBackground = registerColor('settings.focusedRowBackground', {
	dark: transparent(listHoverBackground, .6),
	light: transparent(listHoverBackground, .6),
	hcDark: null,
	hcLight: null,
}, localize('focusedRowBackground', "The background color of a settings row when focused."));

export const rowHoverBackground = registerColor('settings.rowHoverBackground', {
	dark: transparent(listHoverBackground, .3),
	light: transparent(listHoverBackground, .3),
	hcDark: null,
	hcLight: null
}, localize('settings.rowHoverBackground', "The background color of a settings row when hovered."));

export const focusedRowBorder = registerColor('settings.focusedRowBorder', focusBorder, localize('settings.focusedRowBorder', "The color of the row's top and bottom border when the row is focused."));
