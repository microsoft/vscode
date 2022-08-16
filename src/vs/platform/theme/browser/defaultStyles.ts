/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IKeybindingLabelStyles } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { ColorIdentifier, keybindingLabelBackground, keybindingLabelBorder, keybindingLabelBottomBorder, keybindingLabelForeground, asCssValue, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
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
