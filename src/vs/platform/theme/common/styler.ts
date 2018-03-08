/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { focusBorder, inputBackground, inputForeground, ColorIdentifier, selectForeground, selectBackground, selectListBackground, selectBorder, inputBorder, foreground, editorBackground, contrastBorder, inputActiveOptionBorder, listFocusBackground, listFocusForeground, listActiveSelectionBackground, listActiveSelectionForeground, listInactiveSelectionForeground, listInactiveSelectionBackground, listInactiveFocusForeground, listInactiveFocusBackground, listHoverBackground, listHoverForeground, listDropBackground, pickerGroupBorder, pickerGroupForeground, widgetShadow, inputValidationInfoBorder, inputValidationInfoBackground, inputValidationWarningBorder, inputValidationWarningBackground, inputValidationErrorBorder, inputValidationErrorBackground, activeContrastBorder, buttonForeground, buttonBackground, buttonHoverBackground, ColorFunction, lighten, badgeBackground, badgeForeground, progressBarBackground } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable } from 'vs/base/common/lifecycle';

export type styleFn = (colors: { [name: string]: ColorIdentifier }) => void;

export interface IStyleOverrides {
	[color: string]: ColorIdentifier;
}

export interface IThemable {
	style: styleFn;
}

export interface IColorMapping {
	[optionsKey: string]: ColorIdentifier | ColorFunction | undefined;
}

export function attachStyler<T extends IColorMapping>(themeService: IThemeService, optionsMapping: T, widgetOrCallback: IThemable | styleFn): IDisposable {
	function applyStyles(theme: ITheme): void {
		const styles = Object.create(null);
		for (let key in optionsMapping) {
			const value = optionsMapping[key as string];
			if (typeof value === 'string') {
				styles[key] = theme.getColor(value);
			} else if (typeof value === 'function') {
				styles[key] = value(theme);
			}
		}

		if (typeof widgetOrCallback === 'function') {
			widgetOrCallback(styles);
		} else {
			widgetOrCallback.style(styles);
		}
	}

	applyStyles(themeService.getTheme());

	return themeService.onThemeChange(applyStyles);
}

export interface ICheckboxStyleOverrides extends IStyleOverrides {
	inputActiveOptionBorderColor?: ColorIdentifier;
}

export function attachCheckboxStyler(widget: IThemable, themeService: IThemeService, style?: ICheckboxStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		inputActiveOptionBorder: (style && style.inputActiveOptionBorderColor) || inputActiveOptionBorder
	} as ICheckboxStyleOverrides, widget);
}

export interface IBadgeStyleOverrides extends IStyleOverrides {
	badgeBackground?: ColorIdentifier;
	badgeForeground?: ColorIdentifier;
}

export function attachBadgeStyler(widget: IThemable, themeService: IThemeService, style?: IBadgeStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		badgeBackground: (style && style.badgeBackground) || badgeBackground,
		badgeForeground: (style && style.badgeForeground) || badgeForeground,
		badgeBorder: contrastBorder
	} as IBadgeStyleOverrides, widget);
}

export interface IInputBoxStyleOverrides extends IStyleOverrides {
	inputBackground?: ColorIdentifier;
	inputForeground?: ColorIdentifier;
	inputBorder?: ColorIdentifier;
	inputActiveOptionBorder?: ColorIdentifier;
	inputValidationInfoBorder?: ColorIdentifier;
	inputValidationInfoBackground?: ColorIdentifier;
	inputValidationWarningBorder?: ColorIdentifier;
	inputValidationWarningBackground?: ColorIdentifier;
	inputValidationErrorBorder?: ColorIdentifier;
	inputValidationErrorBackground?: ColorIdentifier;
}

export function attachInputBoxStyler(widget: IThemable, themeService: IThemeService, style?: IInputBoxStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		inputValidationInfoBorder: (style && style.inputValidationInfoBorder) || inputValidationInfoBorder,
		inputValidationInfoBackground: (style && style.inputValidationInfoBackground) || inputValidationInfoBackground,
		inputValidationWarningBorder: (style && style.inputValidationWarningBorder) || inputValidationWarningBorder,
		inputValidationWarningBackground: (style && style.inputValidationWarningBackground) || inputValidationWarningBackground,
		inputValidationErrorBorder: (style && style.inputValidationErrorBorder) || inputValidationErrorBorder,
		inputValidationErrorBackground: (style && style.inputValidationErrorBackground) || inputValidationErrorBackground
	} as IInputBoxStyleOverrides, widget);
}

export interface ISelectBoxStyleOverrides extends IStyleOverrides, IListStyleOverrides {
	selectBackground?: ColorIdentifier;
	selectListBackground?: ColorIdentifier;
	selectForeground?: ColorIdentifier;
	selectBorder?: ColorIdentifier;
	focusBorder?: ColorIdentifier;
}

export function attachSelectBoxStyler(widget: IThemable, themeService: IThemeService, style?: ISelectBoxStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		selectBackground: (style && style.selectBackground) || selectBackground,
		selectListBackground: (style && style.selectListBackground) || selectListBackground,
		selectForeground: (style && style.selectForeground) || selectForeground,
		selectBorder: (style && style.selectBorder) || selectBorder,
		focusBorder: (style && style.focusBorder) || focusBorder,
		listFocusBackground: (style && style.listFocusBackground) || listFocusBackground,
		listFocusForeground: (style && style.listFocusForeground) || listFocusForeground,
		listFocusOutline: (style && style.listFocusOutline) || activeContrastBorder,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listHoverForeground: (style && style.listHoverForeground) || listHoverForeground,
		listHoverOutline: (style && style.listFocusOutline) || activeContrastBorder
	} as ISelectBoxStyleOverrides, widget);
}

export function attachFindInputBoxStyler(widget: IThemable, themeService: IThemeService, style?: IInputBoxStyleOverrides): IDisposable {
	return attachStyler(themeService, {
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
	} as IInputBoxStyleOverrides, widget);
}

export interface IQuickOpenStyleOverrides extends IListStyleOverrides, IInputBoxStyleOverrides, IProgressBarStyleOverrides {
	foreground?: ColorIdentifier;
	background?: ColorIdentifier;
	borderColor?: ColorIdentifier;
	widgetShadow?: ColorIdentifier;
	pickerGroupForeground?: ColorIdentifier;
	pickerGroupBorder?: ColorIdentifier;
}

export function attachQuickOpenStyler(widget: IThemable, themeService: IThemeService, style?: IQuickOpenStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		foreground: (style && style.foreground) || foreground,
		background: (style && style.background) || editorBackground,
		borderColor: style && style.borderColor || contrastBorder,
		widgetShadow: style && style.widgetShadow || widgetShadow,
		progressBarBackground: style && style.progressBarBackground || progressBarBackground,
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
		listFocusForeground: (style && style.listFocusForeground) || listFocusForeground,
		listActiveSelectionBackground: (style && style.listActiveSelectionBackground) || lighten(listActiveSelectionBackground, 0.1),
		listActiveSelectionForeground: (style && style.listActiveSelectionForeground) || listActiveSelectionForeground,
		listFocusAndSelectionBackground: style && style.listFocusAndSelectionBackground || listActiveSelectionBackground,
		listFocusAndSelectionForeground: (style && style.listFocusAndSelectionForeground) || listActiveSelectionForeground,
		listInactiveSelectionBackground: (style && style.listInactiveSelectionBackground) || listInactiveSelectionBackground,
		listInactiveSelectionForeground: (style && style.listInactiveSelectionForeground) || listInactiveSelectionForeground,
		listInactiveFocusBackground: (style && style.listInactiveFocusBackground) || listInactiveFocusBackground,
		listInactiveFocusForeground: (style && style.listInactiveFocusForeground) || listInactiveFocusForeground,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listHoverForeground: (style && style.listHoverForeground) || listHoverForeground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || activeContrastBorder,
		listSelectionOutline: (style && style.listSelectionOutline) || activeContrastBorder,
		listHoverOutline: (style && style.listHoverOutline) || activeContrastBorder
	} as IQuickOpenStyleOverrides, widget);
}

export interface IListStyleOverrides extends IStyleOverrides {
	listFocusBackground?: ColorIdentifier;
	listFocusForeground?: ColorIdentifier;
	listActiveSelectionBackground?: ColorIdentifier;
	listActiveSelectionForeground?: ColorIdentifier;
	listFocusAndSelectionBackground?: ColorIdentifier;
	listFocusAndSelectionForeground?: ColorIdentifier;
	listInactiveSelectionBackground?: ColorIdentifier;
	listInactiveSelectionForeground?: ColorIdentifier;
	listInactiveFocusBackground?: ColorIdentifier;
	listInactiveFocusForeground?: ColorIdentifier;
	listHoverBackground?: ColorIdentifier;
	listHoverForeground?: ColorIdentifier;
	listDropBackground?: ColorIdentifier;
	listFocusOutline?: ColorIdentifier;
	listInactiveFocusOutline?: ColorIdentifier;
	listSelectionOutline?: ColorIdentifier;
	listHoverOutline?: ColorIdentifier;
}

export function attachListStyler(widget: IThemable, themeService: IThemeService, style?: IListStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		listFocusBackground: (style && style.listFocusBackground) || listFocusBackground,
		listFocusForeground: (style && style.listFocusForeground) || listFocusForeground,
		listActiveSelectionBackground: (style && style.listActiveSelectionBackground) || lighten(listActiveSelectionBackground, 0.1),
		listActiveSelectionForeground: (style && style.listActiveSelectionForeground) || listActiveSelectionForeground,
		listFocusAndSelectionBackground: style && style.listFocusAndSelectionBackground || listActiveSelectionBackground,
		listFocusAndSelectionForeground: (style && style.listFocusAndSelectionForeground) || listActiveSelectionForeground,
		listInactiveSelectionBackground: (style && style.listInactiveSelectionBackground) || listInactiveSelectionBackground,
		listInactiveSelectionForeground: (style && style.listInactiveSelectionForeground) || listInactiveSelectionForeground,
		listInactiveFocusBackground: (style && style.listInactiveFocusBackground) || listInactiveFocusBackground,
		listInactiveFocusForeground: (style && style.listInactiveFocusForeground) || listInactiveFocusForeground,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listHoverForeground: (style && style.listHoverForeground) || listHoverForeground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || activeContrastBorder,
		listSelectionOutline: (style && style.listSelectionOutline) || activeContrastBorder,
		listHoverOutline: (style && style.listHoverOutline) || activeContrastBorder,
		listInactiveFocusOutline: style && style.listInactiveFocusOutline // not defined by default, only opt-in
	} as IListStyleOverrides, widget);
}

export interface IButtonStyleOverrides extends IStyleOverrides {
	buttonForeground?: ColorIdentifier;
	buttonBackground?: ColorIdentifier;
	buttonHoverBackground?: ColorIdentifier;
}

export function attachButtonStyler(widget: IThemable, themeService: IThemeService, style?: IButtonStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		buttonForeground: (style && style.buttonForeground) || buttonForeground,
		buttonBackground: (style && style.buttonBackground) || buttonBackground,
		buttonHoverBackground: (style && style.buttonHoverBackground) || buttonHoverBackground,
		buttonBorder: contrastBorder
	} as IButtonStyleOverrides, widget);
}

export interface IProgressBarStyleOverrides extends IStyleOverrides {
	progressBarBackground?: ColorIdentifier;
}

export function attachProgressBarStyler(widget: IThemable, themeService: IThemeService, style?: IProgressBarStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		progressBarBackground: (style && style.progressBarBackground) || progressBarBackground
	} as IProgressBarStyleOverrides, widget);
}

export function attachStylerCallback(themeService: IThemeService, colors: { [name: string]: ColorIdentifier }, callback: styleFn): IDisposable {
	return attachStyler(themeService, colors, callback);
}