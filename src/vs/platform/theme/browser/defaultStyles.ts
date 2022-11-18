/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IButtonStyles } from 'vs/base/browser/ui/button/button';
import { IKeybindingLabelStyles } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { ColorIdentifier, keybindingLabelBackground, keybindingLabelBorder, keybindingLabelBottomBorder, keybindingLabelForeground, asCssValue, widgetShadow, buttonForeground, buttonSeparator, buttonBackground, buttonHoverBackground, buttonSecondaryForeground, buttonSecondaryBackground, buttonSecondaryHoverBackground, buttonBorder, progressBarBackground, inputActiveOptionBorder, inputActiveOptionForeground, inputActiveOptionBackground, editorWidgetBackground, editorWidgetForeground, contrastBorder, checkboxBorder, checkboxBackground, checkboxForeground, problemsErrorIconForeground, problemsWarningIconForeground, problemsInfoIconForeground, inputBackground, inputForeground, inputBorder, textLinkForeground, inputValidationInfoBorder, inputValidationInfoBackground, inputValidationInfoForeground, inputValidationWarningBorder, inputValidationWarningBackground, inputValidationWarningForeground, inputValidationErrorBorder, inputValidationErrorBackground, inputValidationErrorForeground, listFilterWidgetBackground, listFilterWidgetNoMatchesOutline, listFilterWidgetOutline, listFilterWidgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { IProgressBarStyles } from 'vs/base/browser/ui/progressbar/progressbar';
import { ICheckboxStyles, IToggleStyles } from 'vs/base/browser/ui/toggle/toggle';
import { IDialogStyles } from 'vs/base/browser/ui/dialog/dialog';
import { IInputBoxStyles } from 'vs/base/browser/ui/inputbox/inputBox';
import { IFindWidgetStyles } from 'vs/base/browser/ui/tree/abstractTree';

export type IStyleOverride<T> = {
	[P in keyof T]?: ColorIdentifier;
};

export const defaultKeybindingLabelStyles = getKeybindingLabelStyles({});

export function getKeybindingLabelStyles(override: IStyleOverride<IKeybindingLabelStyles>): IKeybindingLabelStyles {
	return {
		keybindingLabelBackground: asCssValue(override.keybindingLabelBackground ?? keybindingLabelBackground),
		keybindingLabelForeground: asCssValue(override.keybindingLabelForeground ?? keybindingLabelForeground),
		keybindingLabelBorder: asCssValue(override.keybindingLabelBorder ?? keybindingLabelBorder),
		keybindingLabelBottomBorder: asCssValue(override.keybindingLabelBottomBorder ?? keybindingLabelBottomBorder),
		keybindingLabelShadow: asCssValue(override.keybindingLabelShadow ?? widgetShadow)
	};
}
export const defaultButtonStyles: IButtonStyles = getButtonStyles({});

export function getButtonStyles(override: IStyleOverride<IButtonStyles>): IButtonStyles {
	return {
		buttonForeground: asCssValue(override.buttonForeground ?? buttonForeground),
		buttonSeparator: asCssValue(override.buttonSeparator ?? buttonSeparator),
		buttonBackground: asCssValue(override.buttonBackground ?? buttonBackground),
		buttonHoverBackground: asCssValue(override.buttonHoverBackground ?? buttonHoverBackground),
		buttonSecondaryForeground: asCssValue(override.buttonSecondaryForeground ?? buttonSecondaryForeground),
		buttonSecondaryBackground: asCssValue(override.buttonSecondaryBackground ?? buttonSecondaryBackground),
		buttonSecondaryHoverBackground: asCssValue(override.buttonSecondaryHoverBackground ?? buttonSecondaryHoverBackground),
		buttonBorder: asCssValue(override.buttonBorder ?? buttonBorder),
	};
}

export const defaultProgressBarStyles: IProgressBarStyles = getProgressBarStyles({});

export function getProgressBarStyles(override: IStyleOverride<IProgressBarStyles>): IProgressBarStyles {
	return {
		progressBarBackground: asCssValue(override.progressBarBackground ?? progressBarBackground)
	};
}

export const defaultToggleStyles: IToggleStyles = getToggleStyles({});

export function getToggleStyles(override: IStyleOverride<IToggleStyles>): IToggleStyles {
	return {
		inputActiveOptionBorder: asCssValue(override.inputActiveOptionBorder ?? inputActiveOptionBorder),
		inputActiveOptionForeground: asCssValue(override.inputActiveOptionForeground ?? inputActiveOptionForeground),
		inputActiveOptionBackground: asCssValue(override.inputActiveOptionBackground ?? inputActiveOptionBackground)
	};
}

export const defaultCheckboxStyles: ICheckboxStyles = getCheckboxStyles({});

export function getCheckboxStyles(override: IStyleOverride<ICheckboxStyles>): ICheckboxStyles {
	return {
		checkboxBackground: asCssValue(override.checkboxBackground ?? checkboxBackground),
		checkboxBorder: asCssValue(override.checkboxBorder ?? checkboxBorder),
		checkboxForeground: asCssValue(override.checkboxForeground ?? checkboxForeground)
	};
}

export type IDialogStyleOverrides = IStyleOverride<IDialogStyles>;

export const defaultDialogStyles = getDialogStyle({});

export function getDialogStyle(override: IStyleOverride<IDialogStyles>): IDialogStyles {
	return {
		dialogBackground: asCssValue(override.dialogBackground ?? editorWidgetBackground),
		dialogForeground: asCssValue(override.dialogForeground ?? editorWidgetForeground),
		dialogShadow: asCssValue(override.dialogShadow ?? widgetShadow),
		dialogBorder: asCssValue(override.dialogBorder ?? contrastBorder),
		errorIconForeground: asCssValue(override.errorIconForeground ?? problemsErrorIconForeground),
		warningIconForeground: asCssValue(override.warningIconForeground ?? problemsWarningIconForeground),
		infoIconForeground: asCssValue(override.infoIconForeground ?? problemsInfoIconForeground),
		textLinkForeground: asCssValue(override.textLinkForeground ?? textLinkForeground)
	};
}

export const defaultInputBoxStyles = getInputBoxStyle({});

export function getInputBoxStyle(override: IStyleOverride<IInputBoxStyles>): IInputBoxStyles {
	return {
		inputBackground: asCssValue(override.inputBackground ?? inputBackground),
		inputForeground: asCssValue(override.inputForeground ?? inputForeground),
		inputBorder: asCssValue(override.inputBorder ?? inputBorder),
		inputValidationInfoBorder: asCssValue(override.inputValidationInfoBorder ?? inputValidationInfoBorder),
		inputValidationInfoBackground: asCssValue(override.inputValidationInfoBackground ?? inputValidationInfoBackground),
		inputValidationInfoForeground: asCssValue(override.inputValidationInfoForeground ?? inputValidationInfoForeground),
		inputValidationWarningBorder: asCssValue(override.inputValidationWarningBorder ?? inputValidationWarningBorder),
		inputValidationWarningBackground: asCssValue(override.inputValidationWarningBackground ?? inputValidationWarningBackground),
		inputValidationWarningForeground: asCssValue(override.inputValidationWarningForeground ?? inputValidationWarningForeground),
		inputValidationErrorBorder: asCssValue(override.inputValidationErrorBorder ?? inputValidationErrorBorder),
		inputValidationErrorBackground: asCssValue(override.inputValidationErrorBackground ?? inputValidationErrorBackground),
		inputValidationErrorForeground: asCssValue(override.inputValidationErrorForeground ?? inputValidationErrorForeground)
	};
}

export const defaultFindWidgetStyles: IFindWidgetStyles = {
	listFilterWidgetBackground: asCssValue(listFilterWidgetBackground),
	listFilterWidgetOutline: asCssValue(listFilterWidgetOutline),
	listFilterWidgetNoMatchesOutline: asCssValue(listFilterWidgetNoMatchesOutline),
	listFilterWidgetShadow: asCssValue(listFilterWidgetShadow),
	inputBoxStyles: defaultInputBoxStyles,
	toggleStyles: defaultToggleStyles
};
