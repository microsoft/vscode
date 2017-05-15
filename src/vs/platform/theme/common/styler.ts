/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputForeground, ColorIdentifier, selectForeground, selectBackground, selectBorder, inputBorder, foreground, editorBackground, contrastBorder, inputActiveOptionBorder, listFocusBackground, listFocusForeground, listActiveSelectionBackground, listActiveSelectionForeground, listInactiveSelectionForeground, listInactiveSelectionBackground, listHoverBackground, listHoverForeground, listDropBackground, pickerGroupBorder, pickerGroupForeground, widgetShadow, inputValidationInfoBorder, inputValidationInfoBackground, inputValidationWarningBorder, inputValidationWarningBackground, inputValidationErrorBorder, inputValidationErrorBackground, activeContrastBorder, buttonForeground, buttonBackground, buttonHoverBackground, ColorFunction, lighten, badgeBackground, badgeForeground, progressBarBackground } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable } from 'vs/base/common/lifecycle';
import { SIDE_BAR_SECTION_HEADER_BACKGROUND } from 'vs/workbench/common/theme';

export type styleFn = (colors: { [name: string]: ColorIdentifier }) => void;

export interface IThemable {
	style: styleFn;
}

function doAttachStyler(themeService: IThemeService, optionsMapping: { [optionsKey: string]: ColorIdentifier | ColorFunction }, widgetOrCallback: IThemable | styleFn): IDisposable {
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

		if (typeof widgetOrCallback === 'function') {
			widgetOrCallback(styles);
		} else {
			widgetOrCallback.style(styles);
		}
	}

	applyStyles(themeService.getTheme());

	return themeService.onThemeChange(applyStyles);
}

export function attachCheckboxStyler(widget: IThemable, themeService: IThemeService, style?: { inputActiveOptionBorderColor?: ColorIdentifier }): IDisposable {
	return doAttachStyler(themeService, {
		inputActiveOptionBorder: (style && style.inputActiveOptionBorderColor) || inputActiveOptionBorder
	}, widget);
}

export function attachBadgeStyler(widget: IThemable, themeService: IThemeService, style?:
	{
		badgeBackground?: ColorIdentifier,
		badgeForeground?: ColorIdentifier
	}): IDisposable {
	return doAttachStyler(themeService, {
		badgeBackground: (style && style.badgeBackground) || badgeBackground,
		badgeForeground: (style && style.badgeForeground) || badgeForeground,
		badgeBorder: contrastBorder
	}, widget);
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
	return doAttachStyler(themeService, {
		inputBackground: (style && style.inputBackground) || inputBackground,
		inputForeground: (style && style.inputForeground) || inputForeground,
		inputBorder: (style && style.inputBorder) || inputBorder,
		inputValidationInfoBorder: (style && style.inputValidationInfoBorder) || inputValidationInfoBorder,
		inputValidationInfoBackground: (style && style.inputValidationInfoBackground) || inputValidationInfoBackground,
		inputValidationWarningBorder: (style && style.inputValidationWarningBorder) || inputValidationWarningBorder,
		inputValidationWarningBackground: (style && style.inputValidationWarningBackground) || inputValidationWarningBackground,
		inputValidationErrorBorder: (style && style.inputValidationErrorBorder) || inputValidationErrorBorder,
		inputValidationErrorBackground: (style && style.inputValidationErrorBackground) || inputValidationErrorBackground
	}, widget);
}

export function attachSelectBoxStyler(widget: IThemable, themeService: IThemeService, style?: { selectBackground?: ColorIdentifier, selectForeground?: ColorIdentifier, selectBorder?: ColorIdentifier }): IDisposable {
	return doAttachStyler(themeService, {
		selectBackground: (style && style.selectBackground) || selectBackground,
		selectForeground: (style && style.selectForeground) || selectForeground,
		selectBorder: (style && style.selectBorder) || selectBorder
	}, widget);
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
	return doAttachStyler(themeService, {
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
	}, widget);
}

export function attachQuickOpenStyler(widget: IThemable, themeService: IThemeService, style?: {
	foreground?: ColorIdentifier,
	background?: ColorIdentifier,
	borderColor?: ColorIdentifier,
	widgetShadow?: ColorIdentifier,
	progressBarBackground?: ColorIdentifier,
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
	listFocusForeground?: ColorIdentifier,
	listActiveSelectionBackground?: ColorIdentifier,
	listActiveSelectionForeground?: ColorIdentifier,
	listFocusAndSelectionBackground?: ColorIdentifier,
	listFocusAndSelectionForeground?: ColorIdentifier,
	listInactiveSelectionBackground?: ColorIdentifier,
	listInactiveSelectionForeground?: ColorIdentifier,
	listHoverBackground?: ColorIdentifier,
	listHoverForeground?: ColorIdentifier,
	listDropBackground?: ColorIdentifier,
	listFocusOutline?: ColorIdentifier,
	listSelectionOutline?: ColorIdentifier,
	listHoverOutline?: ColorIdentifier
}): IDisposable {
	return doAttachStyler(themeService, {
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
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listHoverForeground: (style && style.listHoverForeground) || listHoverForeground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || activeContrastBorder,
		listSelectionOutline: (style && style.listSelectionOutline) || activeContrastBorder,
		listHoverOutline: (style && style.listHoverOutline) || activeContrastBorder
	}, widget);
}

export function attachListStyler(widget: IThemable, themeService: IThemeService, style?: {
	listFocusBackground?: ColorIdentifier,
	listFocusForeground?: ColorIdentifier,
	listActiveSelectionBackground?: ColorIdentifier,
	listActiveSelectionForeground?: ColorIdentifier,
	listFocusAndSelectionBackground?: ColorIdentifier,
	listFocusAndSelectionForeground?: ColorIdentifier,
	listInactiveFocusBackground?: ColorIdentifier,
	listInactiveSelectionBackground?: ColorIdentifier,
	listInactiveSelectionForeground?: ColorIdentifier,
	listHoverBackground?: ColorIdentifier,
	listHoverForeground?: ColorIdentifier,
	listDropBackground?: ColorIdentifier,
	listFocusOutline?: ColorIdentifier,
	listInactiveFocusOutline?: ColorIdentifier,
	listSelectionOutline?: ColorIdentifier,
	listHoverOutline?: ColorIdentifier,
}): IDisposable {
	return doAttachStyler(themeService, {
		listFocusBackground: (style && style.listFocusBackground) || listFocusBackground,
		listFocusForeground: (style && style.listFocusForeground) || listFocusForeground,
		listActiveSelectionBackground: (style && style.listActiveSelectionBackground) || lighten(listActiveSelectionBackground, 0.1),
		listActiveSelectionForeground: (style && style.listActiveSelectionForeground) || listActiveSelectionForeground,
		listFocusAndSelectionBackground: style && style.listFocusAndSelectionBackground || listActiveSelectionBackground,
		listFocusAndSelectionForeground: (style && style.listFocusAndSelectionForeground) || listActiveSelectionForeground,
		listInactiveFocusBackground: (style && style.listInactiveFocusBackground),
		listInactiveSelectionBackground: (style && style.listInactiveSelectionBackground) || listInactiveSelectionBackground,
		listInactiveSelectionForeground: (style && style.listInactiveSelectionForeground) || listInactiveSelectionForeground,
		listHoverBackground: (style && style.listHoverBackground) || listHoverBackground,
		listHoverForeground: (style && style.listHoverForeground) || listHoverForeground,
		listDropBackground: (style && style.listDropBackground) || listDropBackground,
		listFocusOutline: (style && style.listFocusOutline) || activeContrastBorder,
		listSelectionOutline: (style && style.listSelectionOutline) || activeContrastBorder,
		listHoverOutline: (style && style.listHoverOutline) || activeContrastBorder,
		listInactiveFocusOutline: style && style.listInactiveFocusOutline // not defined by default, only opt-in
	}, widget);
}

export function attachHeaderViewStyler(widget: IThemable, themeService: IThemeService, options?: { noContrastBorder?: boolean }): IDisposable {
	return doAttachStyler(themeService, {
		headerBackground: SIDE_BAR_SECTION_HEADER_BACKGROUND,
		headerHighContrastBorder: (options && options.noContrastBorder) ? null : contrastBorder
	}, widget);
}

export function attachButtonStyler(widget: IThemable, themeService: IThemeService, style?: { buttonForeground?: ColorIdentifier, buttonBackground?: ColorIdentifier, buttonHoverBackground?: ColorIdentifier }): IDisposable {
	return doAttachStyler(themeService, {
		buttonForeground: (style && style.buttonForeground) || buttonForeground,
		buttonBackground: (style && style.buttonBackground) || buttonBackground,
		buttonHoverBackground: (style && style.buttonHoverBackground) || buttonHoverBackground,
		buttonBorder: contrastBorder
	}, widget);
}

export function attachProgressBarStyler(widget: IThemable, themeService: IThemeService, style?: { progressBarBackground?: ColorIdentifier }): IDisposable {
	return doAttachStyler(themeService, {
		progressBarBackground: (style && style.progressBarBackground) || progressBarBackground
	}, widget);
}

export function attachStylerCallback(themeService: IThemeService, colors: { [name: string]: ColorIdentifier }, callback: styleFn): IDisposable {
	return doAttachStyler(themeService, colors, callback);
}