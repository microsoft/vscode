/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IButtonStyles } from '../../../base/browser/ui/button/button.js';
import { IKeybindingLabelStyles } from '../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ColorIdentifier, keybindingLabelBackground, keybindingLabelBorder, keybindingLabelBottomBorder, keybindingLabelForeground, asCssVariable, widgetShadow, buttonForeground, buttonSeparator, buttonBackground, buttonHoverBackground, buttonSecondaryForeground, buttonSecondaryBackground, buttonSecondaryHoverBackground, buttonBorder, progressBarBackground, inputActiveOptionBorder, inputActiveOptionForeground, inputActiveOptionBackground, editorWidgetBackground, editorWidgetForeground, contrastBorder, checkboxBorder, checkboxBackground, checkboxForeground, problemsErrorIconForeground, problemsWarningIconForeground, problemsInfoIconForeground, inputBackground, inputForeground, inputBorder, textLinkForeground, inputValidationInfoBorder, inputValidationInfoBackground, inputValidationInfoForeground, inputValidationWarningBorder, inputValidationWarningBackground, inputValidationWarningForeground, inputValidationErrorBorder, inputValidationErrorBackground, inputValidationErrorForeground, listFilterWidgetBackground, listFilterWidgetNoMatchesOutline, listFilterWidgetOutline, listFilterWidgetShadow, badgeBackground, badgeForeground, breadcrumbsBackground, breadcrumbsForeground, breadcrumbsFocusForeground, breadcrumbsActiveSelectionForeground, activeContrastBorder, listActiveSelectionBackground, listActiveSelectionForeground, listActiveSelectionIconForeground, listDropOverBackground, listFocusAndSelectionOutline, listFocusBackground, listFocusForeground, listFocusOutline, listHoverBackground, listHoverForeground, listInactiveFocusBackground, listInactiveFocusOutline, listInactiveSelectionBackground, listInactiveSelectionForeground, listInactiveSelectionIconForeground, tableColumnsBorder, tableOddRowsBackgroundColor, treeIndentGuidesStroke, asCssVariableWithDefault, editorWidgetBorder, focusBorder, pickerGroupForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, selectBackground, selectBorder, selectForeground, selectListBackground, treeInactiveIndentGuidesStroke, menuBorder, menuForeground, menuBackground, menuSelectionForeground, menuSelectionBackground, menuSelectionBorder, menuSeparatorBackground, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, listDropBetweenBackground, radioActiveBackground, radioActiveForeground, radioInactiveBackground, radioInactiveForeground, radioInactiveBorder, radioInactiveHoverBackground, radioActiveBorder } from '../common/colorRegistry.js';
import { IProgressBarStyles } from '../../../base/browser/ui/progressbar/progressbar.js';
import { ICheckboxStyles, IToggleStyles } from '../../../base/browser/ui/toggle/toggle.js';
import { IDialogStyles } from '../../../base/browser/ui/dialog/dialog.js';
import { IInputBoxStyles } from '../../../base/browser/ui/inputbox/inputBox.js';
import { IFindWidgetStyles } from '../../../base/browser/ui/tree/abstractTree.js';
import { ICountBadgeStyles } from '../../../base/browser/ui/countBadge/countBadge.js';
import { IBreadcrumbsWidgetStyles } from '../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { IListStyles } from '../../../base/browser/ui/list/listWidget.js';
import { ISelectBoxStyles } from '../../../base/browser/ui/selectBox/selectBox.js';
import { Color } from '../../../base/common/color.js';
import { IMenuStyles } from '../../../base/browser/ui/menu/menu.js';
import { IRadioStyles } from '../../../base/browser/ui/radio/radio.js';

export type IStyleOverride<T> = {
	[P in keyof T]?: ColorIdentifier | undefined;
};

function overrideStyles<T extends { [P in keyof T]: string | undefined }>(override: IStyleOverride<T>, styles: T) {
	const result: { [P in keyof T]: string | undefined } = { ...styles };
	for (const key in override) {
		const val = override[key];
		result[key] = val !== undefined ? asCssVariable(val) : undefined;
	}
	return result;
}

export const defaultKeybindingLabelStyles: IKeybindingLabelStyles = {
	keybindingLabelBackground: asCssVariable(keybindingLabelBackground),
	keybindingLabelForeground: asCssVariable(keybindingLabelForeground),
	keybindingLabelBorder: asCssVariable(keybindingLabelBorder),
	keybindingLabelBottomBorder: asCssVariable(keybindingLabelBottomBorder),
	keybindingLabelShadow: asCssVariable(widgetShadow)
};

export function getKeybindingLabelStyles(override: IStyleOverride<IKeybindingLabelStyles>): IKeybindingLabelStyles {
	return overrideStyles(override, defaultKeybindingLabelStyles);
}

export const defaultButtonStyles: IButtonStyles = {
	buttonForeground: asCssVariable(buttonForeground),
	buttonSeparator: asCssVariable(buttonSeparator),
	buttonBackground: asCssVariable(buttonBackground),
	buttonHoverBackground: asCssVariable(buttonHoverBackground),
	buttonSecondaryForeground: asCssVariable(buttonSecondaryForeground),
	buttonSecondaryBackground: asCssVariable(buttonSecondaryBackground),
	buttonSecondaryHoverBackground: asCssVariable(buttonSecondaryHoverBackground),
	buttonBorder: asCssVariable(buttonBorder),
};

export function getButtonStyles(override: IStyleOverride<IButtonStyles>): IButtonStyles {
	return overrideStyles(override, defaultButtonStyles);
}

export const defaultProgressBarStyles: IProgressBarStyles = {
	progressBarBackground: asCssVariable(progressBarBackground)
};

export function getProgressBarStyles(override: IStyleOverride<IProgressBarStyles>): IProgressBarStyles {
	return overrideStyles(override, defaultProgressBarStyles);
}

export const defaultToggleStyles: IToggleStyles = {
	inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
	inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
	inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground)
};

export const defaultRadioStyles: IRadioStyles = {
	activeForeground: asCssVariable(radioActiveForeground),
	activeBackground: asCssVariable(radioActiveBackground),
	activeBorder: asCssVariable(radioActiveBorder),
	inactiveForeground: asCssVariable(radioInactiveForeground),
	inactiveBackground: asCssVariable(radioInactiveBackground),
	inactiveBorder: asCssVariable(radioInactiveBorder),
	inactiveHoverBackground: asCssVariable(radioInactiveHoverBackground),
};

export function getToggleStyles(override: IStyleOverride<IToggleStyles>): IToggleStyles {
	return overrideStyles(override, defaultToggleStyles);
}

export const defaultCheckboxStyles: ICheckboxStyles = {
	checkboxBackground: asCssVariable(checkboxBackground),
	checkboxBorder: asCssVariable(checkboxBorder),
	checkboxForeground: asCssVariable(checkboxForeground)
};

export function getCheckboxStyles(override: IStyleOverride<ICheckboxStyles>): ICheckboxStyles {
	return overrideStyles(override, defaultCheckboxStyles);
}

export const defaultDialogStyles: IDialogStyles = {
	dialogBackground: asCssVariable(editorWidgetBackground),
	dialogForeground: asCssVariable(editorWidgetForeground),
	dialogShadow: asCssVariable(widgetShadow),
	dialogBorder: asCssVariable(contrastBorder),
	errorIconForeground: asCssVariable(problemsErrorIconForeground),
	warningIconForeground: asCssVariable(problemsWarningIconForeground),
	infoIconForeground: asCssVariable(problemsInfoIconForeground),
	textLinkForeground: asCssVariable(textLinkForeground)
};

export function getDialogStyle(override: IStyleOverride<IDialogStyles>): IDialogStyles {
	return overrideStyles(override, defaultDialogStyles);
}

export const defaultInputBoxStyles: IInputBoxStyles = {
	inputBackground: asCssVariable(inputBackground),
	inputForeground: asCssVariable(inputForeground),
	inputBorder: asCssVariable(inputBorder),
	inputValidationInfoBorder: asCssVariable(inputValidationInfoBorder),
	inputValidationInfoBackground: asCssVariable(inputValidationInfoBackground),
	inputValidationInfoForeground: asCssVariable(inputValidationInfoForeground),
	inputValidationWarningBorder: asCssVariable(inputValidationWarningBorder),
	inputValidationWarningBackground: asCssVariable(inputValidationWarningBackground),
	inputValidationWarningForeground: asCssVariable(inputValidationWarningForeground),
	inputValidationErrorBorder: asCssVariable(inputValidationErrorBorder),
	inputValidationErrorBackground: asCssVariable(inputValidationErrorBackground),
	inputValidationErrorForeground: asCssVariable(inputValidationErrorForeground)
};

export function getInputBoxStyle(override: IStyleOverride<IInputBoxStyles>): IInputBoxStyles {
	return overrideStyles(override, defaultInputBoxStyles);
}

export const defaultFindWidgetStyles: IFindWidgetStyles = {
	listFilterWidgetBackground: asCssVariable(listFilterWidgetBackground),
	listFilterWidgetOutline: asCssVariable(listFilterWidgetOutline),
	listFilterWidgetNoMatchesOutline: asCssVariable(listFilterWidgetNoMatchesOutline),
	listFilterWidgetShadow: asCssVariable(listFilterWidgetShadow),
	inputBoxStyles: defaultInputBoxStyles,
	toggleStyles: defaultToggleStyles
};

export const defaultCountBadgeStyles: ICountBadgeStyles = {
	badgeBackground: asCssVariable(badgeBackground),
	badgeForeground: asCssVariable(badgeForeground),
	badgeBorder: asCssVariable(contrastBorder)
};

export function getCountBadgeStyle(override: IStyleOverride<ICountBadgeStyles>): ICountBadgeStyles {
	return overrideStyles(override, defaultCountBadgeStyles);
}

export const defaultBreadcrumbsWidgetStyles: IBreadcrumbsWidgetStyles = {
	breadcrumbsBackground: asCssVariable(breadcrumbsBackground),
	breadcrumbsForeground: asCssVariable(breadcrumbsForeground),
	breadcrumbsHoverForeground: asCssVariable(breadcrumbsFocusForeground),
	breadcrumbsFocusForeground: asCssVariable(breadcrumbsFocusForeground),
	breadcrumbsFocusAndSelectionForeground: asCssVariable(breadcrumbsActiveSelectionForeground)
};

export function getBreadcrumbsWidgetStyles(override: IStyleOverride<IBreadcrumbsWidgetStyles>): IBreadcrumbsWidgetStyles {
	return overrideStyles(override, defaultBreadcrumbsWidgetStyles);
}

export const defaultListStyles: IListStyles = {
	listBackground: undefined,
	listInactiveFocusForeground: undefined,
	listFocusBackground: asCssVariable(listFocusBackground),
	listFocusForeground: asCssVariable(listFocusForeground),
	listFocusOutline: asCssVariable(listFocusOutline),
	listActiveSelectionBackground: asCssVariable(listActiveSelectionBackground),
	listActiveSelectionForeground: asCssVariable(listActiveSelectionForeground),
	listActiveSelectionIconForeground: asCssVariable(listActiveSelectionIconForeground),
	listFocusAndSelectionOutline: asCssVariable(listFocusAndSelectionOutline),
	listFocusAndSelectionBackground: asCssVariable(listActiveSelectionBackground),
	listFocusAndSelectionForeground: asCssVariable(listActiveSelectionForeground),
	listInactiveSelectionBackground: asCssVariable(listInactiveSelectionBackground),
	listInactiveSelectionIconForeground: asCssVariable(listInactiveSelectionIconForeground),
	listInactiveSelectionForeground: asCssVariable(listInactiveSelectionForeground),
	listInactiveFocusBackground: asCssVariable(listInactiveFocusBackground),
	listInactiveFocusOutline: asCssVariable(listInactiveFocusOutline),
	listHoverBackground: asCssVariable(listHoverBackground),
	listHoverForeground: asCssVariable(listHoverForeground),
	listDropOverBackground: asCssVariable(listDropOverBackground),
	listDropBetweenBackground: asCssVariable(listDropBetweenBackground),
	listSelectionOutline: asCssVariable(activeContrastBorder),
	listHoverOutline: asCssVariable(activeContrastBorder),
	treeIndentGuidesStroke: asCssVariable(treeIndentGuidesStroke),
	treeInactiveIndentGuidesStroke: asCssVariable(treeInactiveIndentGuidesStroke),
	treeStickyScrollBackground: undefined,
	treeStickyScrollBorder: undefined,
	treeStickyScrollShadow: asCssVariable(scrollbarShadow),
	tableColumnsBorder: asCssVariable(tableColumnsBorder),
	tableOddRowsBackgroundColor: asCssVariable(tableOddRowsBackgroundColor),
};

export function getListStyles(override: IStyleOverride<IListStyles>): IListStyles {
	return overrideStyles(override, defaultListStyles);
}

export const defaultSelectBoxStyles: ISelectBoxStyles = {
	selectBackground: asCssVariable(selectBackground),
	selectListBackground: asCssVariable(selectListBackground),
	selectForeground: asCssVariable(selectForeground),
	decoratorRightForeground: asCssVariable(pickerGroupForeground),
	selectBorder: asCssVariable(selectBorder),
	focusBorder: asCssVariable(focusBorder),
	listFocusBackground: asCssVariable(quickInputListFocusBackground),
	listInactiveSelectionIconForeground: asCssVariable(quickInputListFocusIconForeground),
	listFocusForeground: asCssVariable(quickInputListFocusForeground),
	listFocusOutline: asCssVariableWithDefault(activeContrastBorder, Color.transparent.toString()),
	listHoverBackground: asCssVariable(listHoverBackground),
	listHoverForeground: asCssVariable(listHoverForeground),
	listHoverOutline: asCssVariable(activeContrastBorder),
	selectListBorder: asCssVariable(editorWidgetBorder),
	listBackground: undefined,
	listActiveSelectionBackground: undefined,
	listActiveSelectionForeground: undefined,
	listActiveSelectionIconForeground: undefined,
	listFocusAndSelectionBackground: undefined,
	listDropOverBackground: undefined,
	listDropBetweenBackground: undefined,
	listInactiveSelectionBackground: undefined,
	listInactiveSelectionForeground: undefined,
	listInactiveFocusBackground: undefined,
	listInactiveFocusOutline: undefined,
	listSelectionOutline: undefined,
	listFocusAndSelectionForeground: undefined,
	listFocusAndSelectionOutline: undefined,
	listInactiveFocusForeground: undefined,
	tableColumnsBorder: undefined,
	tableOddRowsBackgroundColor: undefined,
	treeIndentGuidesStroke: undefined,
	treeInactiveIndentGuidesStroke: undefined,
	treeStickyScrollBackground: undefined,
	treeStickyScrollBorder: undefined,
	treeStickyScrollShadow: undefined
};

export function getSelectBoxStyles(override: IStyleOverride<ISelectBoxStyles>): ISelectBoxStyles {
	return overrideStyles(override, defaultSelectBoxStyles);
}

export const defaultMenuStyles: IMenuStyles = {
	shadowColor: asCssVariable(widgetShadow),
	borderColor: asCssVariable(menuBorder),
	foregroundColor: asCssVariable(menuForeground),
	backgroundColor: asCssVariable(menuBackground),
	selectionForegroundColor: asCssVariable(menuSelectionForeground),
	selectionBackgroundColor: asCssVariable(menuSelectionBackground),
	selectionBorderColor: asCssVariable(menuSelectionBorder),
	separatorColor: asCssVariable(menuSeparatorBackground),
	scrollbarShadow: asCssVariable(scrollbarShadow),
	scrollbarSliderBackground: asCssVariable(scrollbarSliderBackground),
	scrollbarSliderHoverBackground: asCssVariable(scrollbarSliderHoverBackground),
	scrollbarSliderActiveBackground: asCssVariable(scrollbarSliderActiveBackground)
};

export function getMenuStyles(override: IStyleOverride<IMenuStyles>): IMenuStyles {
	return overrideStyles(override, defaultMenuStyles);
}
