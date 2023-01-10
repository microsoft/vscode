/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IThemable, styleFn } from 'vs/base/common/styler';
import {
	activeContrastBorder,
	ColorIdentifier, ColorValue, editorWidgetBorder, focusBorder, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground,
	inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, inputValidationInfoBackground,
	inputValidationInfoBorder, inputValidationInfoForeground, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationWarningForeground,
	listActiveSelectionBackground, listActiveSelectionForeground, listActiveSelectionIconForeground, listDropBackground,
	listFocusBackground, listFocusForeground, listFocusOutline, listHoverBackground, listHoverForeground,
	listInactiveFocusBackground, listInactiveFocusOutline, listInactiveSelectionBackground, listInactiveSelectionForeground, listInactiveSelectionIconForeground,
	menuBackground, menuBorder, menuForeground, menuSelectionBackground, menuSelectionBorder, menuSelectionForeground, menuSeparatorBackground, pickerGroupForeground,
	quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, resolveColorValue, scrollbarShadow, scrollbarSliderActiveBackground,
	scrollbarSliderBackground, scrollbarSliderHoverBackground, selectBackground, selectBorder, selectForeground, selectListBackground, tableColumnsBorder, tableOddRowsBackgroundColor,
	treeIndentGuidesStroke, widgetShadow, listFocusAndSelectionOutline
} from 'vs/platform/theme/common/colorRegistry';
import { isHighContrast } from 'vs/platform/theme/common/theme';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';

export interface IStyleOverrides {
	[color: string]: ColorIdentifier | undefined;
}

export interface IColorMapping {
	[optionsKey: string]: ColorValue | undefined;
}

export interface IComputedStyles {
	[color: string]: Color | undefined;
}

export function computeStyles(theme: IColorTheme, styleMap: IColorMapping): IComputedStyles {
	const styles = Object.create(null) as IComputedStyles;
	for (const key in styleMap) {
		const value = styleMap[key];
		if (value) {
			styles[key] = resolveColorValue(value, theme);
		}
	}

	return styles;
}

export function attachStyler<T extends IColorMapping>(themeService: IThemeService, styleMap: T, widgetOrCallback: IThemable | styleFn): IDisposable {
	function applyStyles(): void {
		const styles = computeStyles(themeService.getColorTheme(), styleMap);

		if (typeof widgetOrCallback === 'function') {
			widgetOrCallback(styles);
		} else {
			widgetOrCallback.style(styles);
		}
	}

	applyStyles();

	return themeService.onDidColorThemeChange(applyStyles);
}

export interface ISelectBoxStyleOverrides extends IStyleOverrides, IListStyleOverrides {
	selectBackground?: ColorIdentifier;
	selectListBackground?: ColorIdentifier;
	selectForeground?: ColorIdentifier;
	decoratorRightForeground?: ColorIdentifier;
	selectBorder?: ColorIdentifier;
	focusBorder?: ColorIdentifier;
}

export function attachSelectBoxStyler(widget: IThemable, themeService: IThemeService, style?: ISelectBoxStyleOverrides): IDisposable {
	return attachStyler(themeService, {
		selectBackground: style?.selectBackground || selectBackground,
		selectListBackground: style?.selectListBackground || selectListBackground,
		selectForeground: style?.selectForeground || selectForeground,
		decoratorRightForeground: style?.pickerGroupForeground || pickerGroupForeground,
		selectBorder: style?.selectBorder || selectBorder,
		focusBorder: style?.focusBorder || focusBorder,
		listFocusBackground: style?.listFocusBackground || quickInputListFocusBackground,
		listInactiveSelectionIconForeground: style?.listInactiveSelectionIconForeground || quickInputListFocusIconForeground,
		listFocusForeground: style?.listFocusForeground || quickInputListFocusForeground,
		listFocusOutline: style?.listFocusOutline || ((theme: IColorTheme) => isHighContrast(theme.type) ? activeContrastBorder : Color.transparent),
		listHoverBackground: style?.listHoverBackground || listHoverBackground,
		listHoverForeground: style?.listHoverForeground || listHoverForeground,
		listHoverOutline: style?.listFocusOutline || activeContrastBorder,
		selectListBorder: style?.selectListBorder || editorWidgetBorder
	} as ISelectBoxStyleOverrides, widget);
}

export interface IListStyleOverrides extends IStyleOverrides {
	listBackground?: ColorIdentifier;
	listFocusBackground?: ColorIdentifier;
	listFocusForeground?: ColorIdentifier;
	listFocusOutline?: ColorIdentifier;
	listActiveSelectionBackground?: ColorIdentifier;
	listActiveSelectionForeground?: ColorIdentifier;
	listActiveSelectionIconForeground?: ColorIdentifier;
	listFocusAndSelectionOutline?: ColorIdentifier;
	listFocusAndSelectionBackground?: ColorIdentifier;
	listFocusAndSelectionForeground?: ColorIdentifier;
	listInactiveSelectionBackground?: ColorIdentifier;
	listInactiveSelectionIconForeground?: ColorIdentifier;
	listInactiveSelectionForeground?: ColorIdentifier;
	listInactiveFocusBackground?: ColorIdentifier;
	listInactiveFocusOutline?: ColorIdentifier;
	listHoverBackground?: ColorIdentifier;
	listHoverForeground?: ColorIdentifier;
	listDropBackground?: ColorIdentifier;
	listSelectionOutline?: ColorIdentifier;
	listHoverOutline?: ColorIdentifier;
	treeIndentGuidesStroke?: ColorIdentifier;
	tableColumnsBorder?: ColorIdentifier;
	tableOddRowsBackgroundColor?: ColorIdentifier;
}

export function attachListStyler(widget: IThemable, themeService: IThemeService, overrides?: IColorMapping): IDisposable {
	return attachStyler(themeService, { ...defaultListStyles, ...(overrides || {}) }, widget);
}

export const defaultListStyles: IColorMapping = {
	listFocusBackground,
	listFocusForeground,
	listFocusOutline,
	listActiveSelectionBackground,
	listActiveSelectionForeground,
	listActiveSelectionIconForeground,
	listFocusAndSelectionOutline,
	listFocusAndSelectionBackground: listActiveSelectionBackground,
	listFocusAndSelectionForeground: listActiveSelectionForeground,
	listInactiveSelectionBackground,
	listInactiveSelectionIconForeground,
	listInactiveSelectionForeground,
	listInactiveFocusBackground,
	listInactiveFocusOutline,
	listHoverBackground,
	listHoverForeground,
	listDropBackground,
	listSelectionOutline: activeContrastBorder,
	listHoverOutline: activeContrastBorder,
	treeIndentGuidesStroke,
	tableColumnsBorder,
	tableOddRowsBackgroundColor,
	inputActiveOptionBorder,
	inputActiveOptionForeground,
	inputActiveOptionBackground,
	inputBackground,
	inputForeground,
	inputBorder,
	inputValidationInfoBackground,
	inputValidationInfoForeground,
	inputValidationInfoBorder,
	inputValidationWarningBackground,
	inputValidationWarningForeground,
	inputValidationWarningBorder,
	inputValidationErrorBackground,
	inputValidationErrorForeground,
	inputValidationErrorBorder,
};

export function attachStylerCallback(themeService: IThemeService, colors: { [name: string]: ColorIdentifier }, callback: styleFn): IDisposable {
	return attachStyler(themeService, colors, callback);
}

export interface IMenuStyleOverrides extends IColorMapping {
	shadowColor?: ColorIdentifier;
	borderColor?: ColorIdentifier;
	foregroundColor?: ColorIdentifier;
	backgroundColor?: ColorIdentifier;
	selectionForegroundColor?: ColorIdentifier;
	selectionBackgroundColor?: ColorIdentifier;
	selectionBorderColor?: ColorIdentifier;
	separatorColor?: ColorIdentifier;
}

export const defaultMenuStyles = <IMenuStyleOverrides>{
	shadowColor: widgetShadow,
	borderColor: menuBorder,
	foregroundColor: menuForeground,
	backgroundColor: menuBackground,
	selectionForegroundColor: menuSelectionForeground,
	selectionBackgroundColor: menuSelectionBackground,
	selectionBorderColor: menuSelectionBorder,
	separatorColor: menuSeparatorBackground,
	scrollbarShadow: scrollbarShadow,
	scrollbarSliderBackground: scrollbarSliderBackground,
	scrollbarSliderHoverBackground: scrollbarSliderHoverBackground,
	scrollbarSliderActiveBackground: scrollbarSliderActiveBackground
};

export function attachMenuStyler(widget: IThemable, themeService: IThemeService, style?: IMenuStyleOverrides): IDisposable {
	return attachStyler(themeService, { ...defaultMenuStyles, ...style }, widget);
}
