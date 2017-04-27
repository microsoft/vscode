/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputForeground, ColorIdentifier, selectForeground, selectBackground, selectBorder, inputBorder, foreground, editorBackground, highContrastBorder, inputActiveOptionBorder, listFocusBackground, listActiveSelectionBackground, listActiveSelectionForeground, listFocusAndSelectionBackground, listFocusAndSelectionForeground, listInactiveSelectionBackground, listHoverBackground, listDropBackground, pickerGroupBorder, pickerGroupForeground, widgetShadow, infoBorder, infoBackground, warningBorder, warningBackground, errorBorder, errorBackground, highContrastOutline, buttonForeground, buttonBackground, buttonHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable } from 'vs/base/common/lifecycle';
import { SIDE_BAR_SECTION_HEADER_BACKGROUND } from 'vs/workbench/common/theme';

export interface IThemable {
	style(colors: { [name: string]: ColorIdentifier }): void;
}

export function attachStyler(themeService: IThemeService, widget: IThemable, optionsMapping: { [optionsKey: string]: ColorIdentifier }): IDisposable {
	function applyStyles(theme: ITheme): void {
		const styles = Object.create(null);
		for (let key in optionsMapping) {
			styles[key] = theme.getColor(optionsMapping[key]);
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
		infoBorder?: ColorIdentifier,
		infoBackground?: ColorIdentifier,
		warningBorder?: ColorIdentifier,
		warningBackground?: ColorIdentifier,
		errorBorder?: ColorIdentifier,
		errorBackground?: ColorIdentifier
	}): IDisposable {
	return attachStyler(themeService, widget, {
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		infoBorder: (style && style.infoBorder) || infoBorder,
		infoBackground: (style && style.infoBackground) || infoBackground,
		warningBorder: (style && style.warningBorder) || warningBorder,
		warningBackground: (style && style.warningBackground) || warningBackground,
		errorBorder: (style && style.errorBorder) || errorBorder,
		errorBackground: (style && style.errorBackground) || errorBackground
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
		infoBorder?: ColorIdentifier,
		infoBackground?: ColorIdentifier,
		warningBorder?: ColorIdentifier,
		warningBackground?: ColorIdentifier,
		errorBorder?: ColorIdentifier,
		errorBackground?: ColorIdentifier
	}): IDisposable {
	return attachStyler(themeService, widget, {
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		inputActiveOptionBorder: (style && style.inputActiveOptionBorder) || inputActiveOptionBorder,
		infoBorder: (style && style.infoBorder) || infoBorder,
		infoBackground: (style && style.infoBackground) || infoBackground,
		warningBorder: (style && style.warningBorder) || warningBorder,
		warningBackground: (style && style.warningBackground) || warningBackground,
		errorBorder: (style && style.errorBorder) || errorBorder,
		errorBackground: (style && style.errorBackground) || errorBackground
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
	infoBorder?: ColorIdentifier,
	infoBackground?: ColorIdentifier,
	warningBorder?: ColorIdentifier,
	warningBackground?: ColorIdentifier,
	errorBorder?: ColorIdentifier,
	errorBackground?: ColorIdentifier
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
		borderColor: style && style.borderColor || highContrastBorder,
		widgetShadow: style && style.widgetShadow || widgetShadow,
		pickerGroupForeground: style && style.pickerGroupForeground || pickerGroupForeground,
		pickerGroupBorder: style && style.pickerGroupBorder || pickerGroupBorder,
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		infoBorder: (style && style.infoBorder) || infoBorder,
		infoBackground: (style && style.infoBackground) || infoBackground,
		warningBorder: (style && style.warningBorder) || warningBorder,
		warningBackground: (style && style.warningBackground) || warningBackground,
		errorBorder: (style && style.errorBorder) || errorBorder,
		errorBackground: (style && style.errorBackground) || errorBackground,
		listFocusBackground: (style && style.listFocusBackground) || listFocusBackground,
		listActiveSelectionBackground: (style && style.listActiveSelectionBackground) || listActiveSelectionBackground,
		listActiveSelectionForeground: (style && style.listActiveSelectionForeground) || listActiveSelectionForeground,
		listFocusAndSelectionBackground: (style && style.listFocusAndSelectionBackground) || listFocusAndSelectionBackground,
		listFocusAndSelectionForeground: (style && style.listFocusAndSelectionForeground) || listFocusAndSelectionForeground,
		listInactiveSelectionBackground: (style && style.listInactiveSelectionBackground) || listInactiveSelectionBackground,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || highContrastOutline,
		listSelectionOutline: (style && style.listSelectionOutline) || highContrastOutline,
		listHoverOutline: (style && style.listHoverOutline) || highContrastOutline
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
		listActiveSelectionBackground: (style && style.listActiveSelectionBackground) || listActiveSelectionBackground,
		listActiveSelectionForeground: (style && style.listActiveSelectionForeground) || listActiveSelectionForeground,
		listFocusAndSelectionBackground: (style && style.listFocusAndSelectionBackground) || listFocusAndSelectionBackground,
		listFocusAndSelectionForeground: (style && style.listFocusAndSelectionForeground) || listFocusAndSelectionForeground,
		listInactiveFocusBackground: (style && style.listInactiveFocusBackground),
		listInactiveSelectionBackground: (style && style.listInactiveSelectionBackground) || listInactiveSelectionBackground,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || highContrastOutline,
		listSelectionOutline: (style && style.listSelectionOutline) || highContrastOutline,
		listHoverOutline: (style && style.listHoverOutline) || highContrastOutline,
		listInactiveFocusOutline: style && style.listInactiveFocusOutline // not defined by default, only opt-in
	});
}

export function attachHeaderViewStyler(widget: IThemable, themeService: IThemeService, style?: { headerBackground?: ColorIdentifier, highContrastBorder?: ColorIdentifier }): IDisposable {
	return attachStyler(themeService, widget, {
		headerBackground: (style && style.headerBackground) || SIDE_BAR_SECTION_HEADER_BACKGROUND,
		headerHighContrastBorder: (style && style.highContrastBorder) || highContrastBorder
	});
}

export function attachButtonStyler(widget: IThemable, themeService: IThemeService, style?: { buttonForeground?: ColorIdentifier, buttonBackground?: ColorIdentifier, buttonHoverBackground?: ColorIdentifier }): IDisposable {
	return attachStyler(themeService, widget, {
		buttonForeground: (style && style.buttonForeground) || buttonForeground,
		buttonBackground: (style && style.buttonBackground) || buttonBackground,
		buttonHoverBackground: (style && style.buttonHoverBackground) || buttonHoverBackground
	});
}