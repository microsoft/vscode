/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../../../base/common/color.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { diffRemoved, diffInsertedLine, diffInserted, editorHoverBorder, editorHoverStatusBarBackground, buttonBackground, buttonForeground, buttonSecondaryBackground, buttonSecondaryForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { registerColor, transparent, asCssVariable, lighten, darken } from '../../../../../../platform/theme/common/colorUtils.js';
import { InlineEditTabAction } from './inlineEditsViewInterface.js';

export const originalBackgroundColor = registerColor(
	'inlineEdit.originalBackground',
	Color.transparent,
	localize('inlineEdit.originalBackground', 'Background color for the original text in inline edits.'),
	true
);
export const modifiedBackgroundColor = registerColor(
	'inlineEdit.modifiedBackground',
	Color.transparent,
	localize('inlineEdit.modifiedBackground', 'Background color for the modified text in inline edits.'),
	true
);

export const originalChangedLineBackgroundColor = registerColor(
	'inlineEdit.originalChangedLineBackground',
	Color.transparent,
	localize('inlineEdit.originalChangedLineBackground', 'Background color for the changed lines in the original text of inline edits.'),
	true
);

export const originalChangedTextOverlayColor = registerColor(
	'inlineEdit.originalChangedTextBackground',
	diffRemoved,
	localize('inlineEdit.originalChangedTextBackground', 'Overlay color for the changed text in the original text of inline edits.'),
	true
);

export const modifiedChangedLineBackgroundColor = registerColor(
	'inlineEdit.modifiedChangedLineBackground',
	{
		light: transparent(diffInsertedLine, 0.5),
		dark: transparent(diffInsertedLine, 0.5),
		hcDark: diffInsertedLine,
		hcLight: diffInsertedLine
	},
	localize('inlineEdit.modifiedChangedLineBackground', 'Background color for the changed lines in the modified text of inline edits.'),
	true
);

export const modifiedChangedTextOverlayColor = registerColor(
	'inlineEdit.modifiedChangedTextBackground',
	diffInserted,
	localize('inlineEdit.modifiedChangedTextBackground', 'Overlay color for the changed text in the modified text of inline edits.'),
	true
);

export const replacementViewBackground = registerColor(
	'inlineEdit.wordReplacementView.background',
	{
		light: transparent(editorHoverStatusBarBackground, 0.1),
		dark: transparent(editorHoverStatusBarBackground, 0.1),
		hcLight: transparent(editorHoverStatusBarBackground, 0.1),
		hcDark: transparent(editorHoverStatusBarBackground, 0.1),
	},
	localize('inlineEdit.wordReplacementView.background', 'Background color for the inline edit word replacement view.')
);

// ------- GUTTER INDICATOR -------

export const inlineEditIndicatorPrimaryForeground = registerColor(
	'inlineEdit.gutterIndicator.primaryForeground',
	buttonForeground,
	localize('inlineEdit.gutterIndicator.primaryForeground', 'Foreground color for the primary inline edit gutter indicator.')
);
export const inlineEditIndicatorPrimaryBackground = registerColor(
	'inlineEdit.gutterIndicator.primaryBackground',
	buttonBackground,
	localize('inlineEdit.gutterIndicator.primaryBackground', 'Background color for the primary inline edit gutter indicator.')
);

export const inlineEditIndicatorSecondaryForeground = registerColor(
	'inlineEdit.gutterIndicator.secondaryForeground',
	buttonSecondaryForeground,
	localize('inlineEdit.gutterIndicator.secondaryForeground', 'Foreground color for the secondary inline edit gutter indicator.')
);
export const inlineEditIndicatorSecondaryBackground = registerColor(
	'inlineEdit.gutterIndicator.secondaryBackground',
	buttonSecondaryBackground,
	localize('inlineEdit.gutterIndicator.secondaryBackground', 'Background color for the secondary inline edit gutter indicator.')
);

export const inlineEditIndicatorsuccessfulForeground = registerColor(
	'inlineEdit.gutterIndicator.successfulForeground',
	buttonForeground,
	localize('inlineEdit.gutterIndicator.successfulForeground', 'Foreground color for the successful inline edit gutter indicator.')
);
export const inlineEditIndicatorsuccessfulBackground = registerColor(
	'inlineEdit.gutterIndicator.successfulBackground',
	{ light: '#2e825c', dark: '#2e825c', hcLight: '#2e825c', hcDark: '#2e825c' },
	localize('inlineEdit.gutterIndicator.successfulBackground', 'Background color for the successful inline edit gutter indicator.')
);

export const inlineEditIndicatorBackground = registerColor(
	'inlineEdit.gutterIndicator.background',
	{
		hcDark: transparent('tab.inactiveBackground', 0.5),
		hcLight: transparent('tab.inactiveBackground', 0.5),
		dark: transparent('tab.inactiveBackground', 0.5),
		light: '#5f5f5f18',
	},
	localize('inlineEdit.gutterIndicator.background', 'Background color for the inline edit gutter indicator.')
);

// ------- BORDER COLORS -------

const originalBorder = registerColor(
	'inlineEdit.originalBorder',
	{
		light: editorHoverBorder,
		dark: editorHoverBorder,
		hcDark: editorHoverBorder,
		hcLight: editorHoverBorder
	},
	localize('inlineEdit.originalBorder', 'Border color for the original text in inline edits.')
);

const modifiedBorder = registerColor(
	'inlineEdit.modifiedBorder',
	{
		light: editorHoverBorder,
		dark: editorHoverBorder,
		hcDark: editorHoverBorder,
		hcLight: editorHoverBorder
	},
	localize('inlineEdit.modifiedBorder', 'Border color for the modified text in inline edits.')
);

const tabWillAcceptModifiedBorder = registerColor(
	'inlineEdit.tabWillAcceptBorder',
	{
		light: darken(modifiedBorder, 0.25),
		dark: lighten(modifiedBorder, 0.25),
		hcDark: lighten(modifiedBorder, 0.5),
		hcLight: darken(modifiedBorder, 0.5)
	},
	localize('inlineEdit.tabWillAcceptBorder', 'Border color for the inline edits widget when tab will accept it.')
);

const tabWillAcceptOriginalBorder = registerColor(
	'inlineEdit.tabWillAcceptBorder',
	{
		light: darken(originalBorder, 0.25),
		dark: lighten(originalBorder, 0.25),
		hcDark: lighten(originalBorder, 0.5),
		hcLight: darken(originalBorder, 0.5)
	},
	localize('inlineEdit.tabWillAcceptOriginalBorder', 'Border color for the inline edits widget over the original text when tab will accept it.')
);

export function getModifiedBorderColor(tabAction: IObservable<InlineEditTabAction>): IObservable<string> {
	return tabAction.map(a => asCssVariable(a === InlineEditTabAction.Accept ? tabWillAcceptModifiedBorder : modifiedBorder));
}

export function getOriginalBorderColor(tabAction: IObservable<InlineEditTabAction>): IObservable<string> {
	return tabAction.map(a => asCssVariable(a === InlineEditTabAction.Accept ? tabWillAcceptOriginalBorder : originalBorder));
}
