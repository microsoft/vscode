/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IButtonStyles } from 'vs/base/browser/ui/button/button';
import { IKeybindingLabelStyles } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { ColorIdentifier, keybindingLabelBackground, keybindingLabelBorder, keybindingLabelBottomBorder, keybindingLabelForeground, asCssValue, widgetShadow, buttonForeground, buttonSeparator, buttonBackground, buttonHoverBackground, buttonSecondaryForeground, buttonSecondaryBackground, buttonSecondaryHoverBackground, buttonBorder, progressBarBackground } from 'vs/platform/theme/common/colorRegistry';
import { IProgressBarStyles } from 'vs/base/browser/ui/progressbar/progressbar';
import { IStyleOverrides } from 'vs/platform/theme/common/styler';


export interface IKeybindingLabelStyleOverrides extends IStyleOverrides {
	keybindingLabelBackground?: ColorIdentifier;
	keybindingLabelForeground?: ColorIdentifier;
	keybindingLabelBorder?: ColorIdentifier;
	keybindingLabelBottomBorder?: ColorIdentifier;
	keybindingLabelShadow?: ColorIdentifier;
}

export function getKeybindingLabelStyles(style?: IKeybindingLabelStyleOverrides): IKeybindingLabelStyles {
	return {
		keybindingLabelBackground: asCssValue(style?.keybindingLabelBackground || keybindingLabelBackground),
		keybindingLabelForeground: asCssValue(style?.keybindingLabelForeground || keybindingLabelForeground),
		keybindingLabelBorder: asCssValue(style?.keybindingLabelBorder || keybindingLabelBorder),
		keybindingLabelBottomBorder: asCssValue(style?.keybindingLabelBottomBorder || keybindingLabelBottomBorder),
		keybindingLabelShadow: asCssValue(style?.keybindingLabelShadow || widgetShadow)
	};
}

export interface IButtonStyleOverrides extends IStyleOverrides {
	readonly buttonForeground?: ColorIdentifier;
	readonly buttonSeparator?: ColorIdentifier;
	readonly buttonBackground?: ColorIdentifier;
	readonly buttonHoverBackground?: ColorIdentifier;
	readonly buttonSecondaryForeground?: ColorIdentifier;
	readonly buttonSecondaryBackground?: ColorIdentifier;
	readonly buttonSecondaryHoverBackground?: ColorIdentifier;
	readonly buttonBorder?: ColorIdentifier;
}


export const defaultButtonStyles: IButtonStyles = getButtonStyles({});

export function getButtonStyles(style: IButtonStyleOverrides): IButtonStyles {
	return {
		buttonForeground: asCssValue(style.buttonForeground || buttonForeground),
		buttonSeparator: asCssValue(style.buttonSeparator || buttonSeparator),
		buttonBackground: asCssValue(style.buttonBackground || buttonBackground),
		buttonHoverBackground: asCssValue(style.buttonHoverBackground || buttonHoverBackground),
		buttonSecondaryForeground: asCssValue(style.buttonSecondaryForeground || buttonSecondaryForeground),
		buttonSecondaryBackground: asCssValue(style.buttonSecondaryBackground || buttonSecondaryBackground),
		buttonSecondaryHoverBackground: asCssValue(style.buttonSecondaryHoverBackground || buttonSecondaryHoverBackground),
		buttonBorder: asCssValue(style.buttonBorder || buttonBorder),
	};
}

export interface IProgressBarStyleOverrides extends IStyleOverrides {
	progressBarBackground?: ColorIdentifier;
}

export function getProgressBarStyles(style?: IProgressBarStyleOverrides): IProgressBarStyles {
	return {
		progressBarBackground: asCssValue(style?.progressBarBackground || progressBarBackground)
	};
}
