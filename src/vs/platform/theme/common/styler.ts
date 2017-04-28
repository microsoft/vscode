/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputForeground, ColorIdentifier, selectForeground, selectBackground, selectBorder, inputBorder, foreground, editorBackground, contrastBorder, inputActiveOptionBorder, listFocusBackground, listActiveSelectionBackground, listActiveSelectionForeground, listInactiveSelectionBackground, listHoverBackground, listDropBackground, pickerGroupBorder, pickerGroupForeground, widgetShadow, inputValidationInfoBorder, inputValidationInfoBackground, inputValidationWarningBorder, inputValidationWarningBackground, inputValidationErrorBorder, inputValidationErrorBackground, activeContrastBorder, buttonForeground, buttonBackground, buttonHoverBackground, ColorFunction, lighten } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable } from 'vs/base/common/lifecycle';
import { SIDE_BAR_SECTION_HEADER_BACKGROUND } from 'vs/workbench/common/theme';

export interface IThemable {
	style(colors: { [name: string]: ColorIdentifier }): void;
}

export function attachStyler(themeService: IThemeService, widget: IThemable, optionsMapping: { [optionsKey: string]: ColorIdentifier | ColorFunction }): IDisposable {
	function applyStyles(theme: ITheme): void {
		const styles = Object.create(null);
		for (let key in optionsMapping) {
			const value = optionsMapping[key];
			if (typeof value === 'string') {
				styles[key] = theme.getColor(value);
			} else if (typeof value === 'function') {
				styles[key] = value(theme);
			}
		}

		widget.style(styles);
	}

	applyStyles(themeService.getTheme());

	return themeService.onThemeChange(applyStyles);
}

export function attachCheckboxStyler(widget: IThemable, themeService: IThemeService, style?: { inputActiveOptionBorderColor?: ColorIdentifier }): IDisposable {
	return attachStyler(themeService, widget, {
		inputActiveOptionBorder: (style && style.inputActiveOptionBorderColor) || inputActiveOptionBorder
	});
}

export function attachInputBoxStyler(widget: IThemable, themeService: IThemeService, style?:
	{
		inputBackground?: ColorIdentifier,
		inputForeground?: ColorIdentifier,
		inputBorder?: ColorIdentifier,
		inputValidationInfoBorder?: ColorIdentifier,
		inputValidationInfoBackground?: ColorIdentifier,
		inputValidationWarningBorder?: ColorIdentifier,
		inputValidationWarningBackground?: ColorIdentifier,
		inputValidationErrorBorder?: ColorIdentifier,
		inputValidationErrorBackground?: ColorIdentifier
	}): IDisposable {
	return attachStyler(themeService, widget, {
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		inputValidationInfoBorder: (style && style.inputValidationInfoBorder) || inputValidationInfoBorder,
		inputValidationInfoBackground: (style && style.inputValidationInfoBackground) || inputValidationInfoBackground,
		inputValidationWarningBorder: (style && style.inputValidationWarningBorder) || inputValidationWarningBorder,
		inputValidationWarningBackground: (style && style.inputValidationWarningBackground) || inputValidationWarningBackground,
		inputValidationErrorBorder: (style && style.inputValidationErrorBorder) || inputValidationErrorBorder,
		inputValidationErrorBackground: (style && style.inputValidationErrorBackground) || inputValidationErrorBackground
	});
}

export function attachSelectBoxStyler(widget: IThemable, themeService: IThemeService, style?: { selectBackground?: ColorIdentifier, selectForeground?: ColorIdentifier, selectBorder?: ColorIdentifier }): IDisposable {
	return attachStyler(themeService, widget, {
		selectBackground: (style && style.selectBackground) || selectBackground,
		selectForeground: (style && style.selectForeground) || selectForeground,
		selectBorder: (style && style.selectBorder) || selectBorder
	});
}

export function attachFindInputBoxStyler(widget: IThemable, themeService: IThemeService, style?:
	{
		inputBackground?: ColorIdentifier,
		inputForeground?: ColorIdentifier,
		inputBorder?: ColorIdentifier,
		inputActiveOptionBorder?: ColorIdentifier,
		inputValidationInfoBorder?: ColorIdentifier,
		inputValidationInfoBackground?: ColorIdentifier,
		inputValidationWarningBorder?: ColorIdentifier,
		inputValidationWarningBackground?: ColorIdentifier,
		inputValidationErrorBorder?: ColorIdentifier,
		inputValidationErrorBackground?: ColorIdentifier
	}): IDisposable {
	return attachStyler(themeService, widget, {
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		inputActiveOptionBorder: (style && style.inputActiveOptionBorder) || inputActiveOptionBorder,
		inputValidationInfoBorder: (style && style.inputValidationInfoBorder) || inputValidationInfoBorder,
		inputValidationInfoBackground: (style && style.inputValidationInfoBackground) || inputValidationInfoBackground,
		inputValidationWarningBorder: (style && style.inputValidationWarningBorder) || inputValidationWarningBorder,
		inputValidationWarningBackground: (style && style.inputValidationWarningBackground) || inputValidationWarningBackground,
		inputValidationErrorBorder: (style && style.inputValidationErrorBorder) || inputValidationErrorBorder,
		inputValidationErrorBackground: (style && style.inputValidationErrorBackground) || inputValidationErrorBackground
	});
}

export function attachQuickOpenStyler(widget: IThemable, themeService: IThemeService, style?: {
	foreground?: ColorIdentifier,
	background?: ColorIdentifier,
	borderColor?: ColorIdentifier,
	widgetShadow?: ColorIdentifier,
	inputBackground?: ColorIdentifier,
	inputForeground?: ColorIdentifier,
	inputBorder?: ColorIdentifier,
	inputValidationInfoBorder?: ColorIdentifier,
	inputValidationInfoBackground?: ColorIdentifier,
	inputValidationWarningBorder?: ColorIdentifier,
	inputValidationWarningBackground?: ColorIdentifier,
	inputValidationErrorBorder?: ColorIdentifier,
	inputValidationErrorBackground?: ColorIdentifier
	pickerGroupForeground?: ColorIdentifier,
	pickerGroupBorder?: ColorIdentifier,
	listFocusBackground?: ColorIdentifier,
	listActiveSelectionBackground?: ColorIdentifier,
	listActiveSelectionForeground?: ColorIdentifier,
	listFocusAndSelectionBackground?: ColorIdentifier,
	listFocusAndSelectionForeground?: ColorIdentifier,
	listInactiveSelectionBackground?: ColorIdentifier,
	listHoverBackground?: ColorIdentifier,
	listDropBackground?: ColorIdentifier,
	listFocusOutline?: ColorIdentifier,
	listSelectionOutline?: ColorIdentifier,
	listHoverOutline?: ColorIdentifier
}): IDisposable {
	return attachStyler(themeService, widget, {
		foreground: (style && style.foreground) || foreground,
		background: (style && style.background) || editorBackground,
		borderColor: style && style.borderColor || contrastBorder,
		widgetShadow: style && style.widgetShadow || widgetShadow,
		pickerGroupForeground: style && style.pickerGroupForeground || pickerGroupForeground,
		pickerGroupBorder: style && style.pickerGroupBorder || pickerGroupBorder,
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		inputValidationInfoBorder: (style && style.inputValidationInfoBorder) || inputValidationInfoBorder,
		inputValidationInfoBackground: (style && style.inputValidationInfoBackground) || inputValidationInfoBackground,
		inputValidationWarningBorder: (style && style.inputValidationWarningBorder) || inputValidationWarningBorder,
		inputValidationWarningBackground: (style && style.inputValidationWarningBackground) || inputValidationWarningBackground,
		inputValidationErrorBorder: (style && style.inputValidationErrorBorder) || inputValidationErrorBorder,
		inputValidationErrorBackground: (style && style.inputValidationErrorBackground) || inputValidationErrorBackground,
		listFocusBackground: (style && style.listFocusBackground) || listFocusBackground,
		listActiveSelectionBackground: (style && style.listActiveSelectionBackground) || lighten(listActiveSelectionBackground, 0.1),
		listActiveSelectionForeground: (style && style.listActiveSelectionForeground) || listActiveSelectionForeground,
		listFocusAndSelectionBackground: style && style.listFocusAndSelectionBackground || listActiveSelectionBackground,
		listFocusAndSelectionForeground: (style && style.listFocusAndSelectionForeground) || listActiveSelectionForeground,
		listInactiveSelectionBackground: (style && style.listInactiveSelectionBackground) || listInactiveSelectionBackground,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || activeContrastBorder,
		listSelectionOutline: (style && style.listSelectionOutline) || activeContrastBorder,
		listHoverOutline: (style && style.listHoverOutline) || activeContrastBorder
	});
}

export function attachListStyler(widget: IThemable, themeService: IThemeService, style?: {
	listFocusBackground?: ColorIdentifier,
	listActiveSelectionBackground?: ColorIdentifier,
	listActiveSelectionForeground?: ColorIdentifier,
	listFocusAndSelectionBackground?: ColorIdentifier,
	listFocusAndSelectionForeground?: ColorIdentifier,
	listInactiveFocusBackground?: ColorIdentifier,
	listInactiveSelectionBackground?: ColorIdentifier,
	listHoverBackground?: ColorIdentifier,
	listDropBackground?: ColorIdentifier,
	listFocusOutline?: ColorIdentifier,
	listInactiveFocusOutline?: ColorIdentifier,
	listSelectionOutline?: ColorIdentifier,
	listHoverOutline?: ColorIdentifier,
}): IDisposable {
	return attachStyler(themeService, widget, {
		listFocusBackground: (style && style.listFocusBackground) || listFocusBackground,
		listActiveSelectionBackground: (style && style.listActiveSelectionBackground) || lighten(listActiveSelectionBackground, 0.1),
		listActiveSelectionForeground: (style && style.listActiveSelectionForeground) || listActiveSelectionForeground,
		listFocusAndSelectionBackground: style && style.listFocusAndSelectionBackground || listActiveSelectionBackground,
		listFocusAndSelectionForeground: (style && style.listFocusAndSelectionForeground) || listActiveSelectionForeground,
		listInactiveFocusBackground: (style && style.listInactiveFocusBackground),
		listInactiveSelectionBackground: (style && style.listInactiveSelectionBackground) || listInactiveSelectionBackground,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || activeContrastBorder,
		listSelectionOutline: (style && style.listSelectionOutline) || activeContrastBorder,
		listHoverOutline: (style && style.listHoverOutline) || activeContrastBorder,
		listInactiveFocusOutline: style && style.listInactiveFocusOutline // not defined by default, only opt-in
	});
}

export function attachHeaderViewStyler(widget: IThemable, themeService: IThemeService, style?: { headerBackground?: ColorIdentifier, contrastBorder?: ColorIdentifier }): IDisposable {
	return attachStyler(themeService, widget, {
		headerBackground: (style && style.headerBackground) || SIDE_BAR_SECTION_HEADER_BACKGROUND,
		headerHighContrastBorder: (style && style.contrastBorder) || contrastBorder
	});
}

export function attachButtonStyler(widget: IThemable, themeService: IThemeService, style?: { buttonForeground?: ColorIdentifier, buttonBackground?: ColorIdentifier, buttonHoverBackground?: ColorIdentifier }): IDisposable {
	return attachStyler(themeService, widget, {
		buttonForeground: (style && style.buttonForeground) || buttonForeground,
		buttonBackground: (style && style.buttonBackground) || buttonBackground,
		buttonHoverBackground: (style && style.buttonHoverBackground) || buttonHoverBackground
	});
}