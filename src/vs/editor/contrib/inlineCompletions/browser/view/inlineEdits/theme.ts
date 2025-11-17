/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../../../base/common/color.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { IObservable, observableFromEventOpts } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { buttonBackground, buttonForeground, buttonSecondaryBackground, buttonSecondaryForeground, diffInserted, diffInsertedLine, diffRemoved, editorBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { ColorIdentifier, darken, registerColor, transparent } from '../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { InlineEditTabAction } from './inlineEditsViewInterface.js';

export const originalBackgroundColor = registerColor(
	'inlineEdit.originalBackground',
	transparent(diffRemoved, 0.2),
	localize('inlineEdit.originalBackground', 'Background color for the original text in inline edits.'),
	true
);
export const modifiedBackgroundColor = registerColor(
	'inlineEdit.modifiedBackground',
	transparent(diffInserted, 0.3),
	localize('inlineEdit.modifiedBackground', 'Background color for the modified text in inline edits.'),
	true
);

export const originalChangedLineBackgroundColor = registerColor(
	'inlineEdit.originalChangedLineBackground',
	transparent(diffRemoved, 0.8),
	localize('inlineEdit.originalChangedLineBackground', 'Background color for the changed lines in the original text of inline edits.'),
	true
);

export const originalChangedTextOverlayColor = registerColor(
	'inlineEdit.originalChangedTextBackground',
	transparent(diffRemoved, 0.8),
	localize('inlineEdit.originalChangedTextBackground', 'Overlay color for the changed text in the original text of inline edits.'),
	true
);

export const modifiedChangedLineBackgroundColor = registerColor(
	'inlineEdit.modifiedChangedLineBackground',
	{
		light: transparent(diffInsertedLine, 0.7),
		dark: transparent(diffInsertedLine, 0.7),
		hcDark: diffInsertedLine,
		hcLight: diffInsertedLine
	},
	localize('inlineEdit.modifiedChangedLineBackground', 'Background color for the changed lines in the modified text of inline edits.'),
	true
);

export const modifiedChangedTextOverlayColor = registerColor(
	'inlineEdit.modifiedChangedTextBackground',
	transparent(diffInserted, 0.7),
	localize('inlineEdit.modifiedChangedTextBackground', 'Overlay color for the changed text in the modified text of inline edits.'),
	true
);

// ------- GUTTER INDICATOR -------

export const inlineEditIndicatorPrimaryForeground = registerColor(
	'inlineEdit.gutterIndicator.primaryForeground',
	buttonForeground,
	localize('inlineEdit.gutterIndicator.primaryForeground', 'Foreground color for the primary inline edit gutter indicator.')
);
export const inlineEditIndicatorPrimaryBorder = registerColor(
	'inlineEdit.gutterIndicator.primaryBorder',
	buttonBackground,
	localize('inlineEdit.gutterIndicator.primaryBorder', 'Border color for the primary inline edit gutter indicator.')
);
export const inlineEditIndicatorPrimaryBackground = registerColor(
	'inlineEdit.gutterIndicator.primaryBackground',
	{
		light: transparent(inlineEditIndicatorPrimaryBorder, 0.5),
		dark: transparent(inlineEditIndicatorPrimaryBorder, 0.4),
		hcDark: transparent(inlineEditIndicatorPrimaryBorder, 0.4),
		hcLight: transparent(inlineEditIndicatorPrimaryBorder, 0.5),
	},
	localize('inlineEdit.gutterIndicator.primaryBackground', 'Background color for the primary inline edit gutter indicator.')
);

export const inlineEditIndicatorSecondaryForeground = registerColor(
	'inlineEdit.gutterIndicator.secondaryForeground',
	buttonSecondaryForeground,
	localize('inlineEdit.gutterIndicator.secondaryForeground', 'Foreground color for the secondary inline edit gutter indicator.')
);
export const inlineEditIndicatorSecondaryBorder = registerColor(
	'inlineEdit.gutterIndicator.secondaryBorder',
	buttonSecondaryBackground,
	localize('inlineEdit.gutterIndicator.secondaryBorder', 'Border color for the secondary inline edit gutter indicator.')
);
export const inlineEditIndicatorSecondaryBackground = registerColor(
	'inlineEdit.gutterIndicator.secondaryBackground',
	inlineEditIndicatorSecondaryBorder,
	localize('inlineEdit.gutterIndicator.secondaryBackground', 'Background color for the secondary inline edit gutter indicator.')
);

export const inlineEditIndicatorsuccessfulForeground = registerColor(
	'inlineEdit.gutterIndicator.successfulForeground',
	buttonForeground,
	localize('inlineEdit.gutterIndicator.successfulForeground', 'Foreground color for the successful inline edit gutter indicator.')
);
export const inlineEditIndicatorsuccessfulBorder = registerColor(
	'inlineEdit.gutterIndicator.successfulBorder',
	buttonBackground,
	localize('inlineEdit.gutterIndicator.successfulBorder', 'Border color for the successful inline edit gutter indicator.')
);
export const inlineEditIndicatorsuccessfulBackground = registerColor(
	'inlineEdit.gutterIndicator.successfulBackground',
	inlineEditIndicatorsuccessfulBorder,
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
		light: diffRemoved,
		dark: diffRemoved,
		hcDark: diffRemoved,
		hcLight: diffRemoved
	},
	localize('inlineEdit.originalBorder', 'Border color for the original text in inline edits.')
);

const modifiedBorder = registerColor(
	'inlineEdit.modifiedBorder',
	{
		light: darken(diffInserted, 0.6),
		dark: diffInserted,
		hcDark: diffInserted,
		hcLight: diffInserted
	},
	localize('inlineEdit.modifiedBorder', 'Border color for the modified text in inline edits.')
);

const tabWillAcceptModifiedBorder = registerColor(
	'inlineEdit.tabWillAcceptModifiedBorder',
	{
		light: darken(modifiedBorder, 0),
		dark: darken(modifiedBorder, 0),
		hcDark: darken(modifiedBorder, 0),
		hcLight: darken(modifiedBorder, 0)
	},
	localize('inlineEdit.tabWillAcceptModifiedBorder', 'Modified border color for the inline edits widget when tab will accept it.')
);

const tabWillAcceptOriginalBorder = registerColor(
	'inlineEdit.tabWillAcceptOriginalBorder',
	{
		light: darken(originalBorder, 0),
		dark: darken(originalBorder, 0),
		hcDark: darken(originalBorder, 0),
		hcLight: darken(originalBorder, 0)
	},
	localize('inlineEdit.tabWillAcceptOriginalBorder', 'Original border color for the inline edits widget over the original text when tab will accept it.')
);

export function getModifiedBorderColor(tabAction: IObservable<InlineEditTabAction>): IObservable<string> {
	return tabAction.map(a => a === InlineEditTabAction.Accept ? tabWillAcceptModifiedBorder : modifiedBorder);
}

export function getOriginalBorderColor(tabAction: IObservable<InlineEditTabAction>): IObservable<string> {
	return tabAction.map(a => a === InlineEditTabAction.Accept ? tabWillAcceptOriginalBorder : originalBorder);
}

export function getEditorBlendedColor(colorIdentifier: ColorIdentifier | IObservable<ColorIdentifier>, themeService: IThemeService): IObservable<Color> {
	let color: IObservable<Color>;
	if (typeof colorIdentifier === 'string') {
		color = observeColor(colorIdentifier, themeService);
	} else {
		color = colorIdentifier.map((identifier, reader) => observeColor(identifier, themeService).read(reader));
	}

	const backgroundColor = observeColor(editorBackground, themeService);

	return color.map((c, reader) => /** @description makeOpaque */ c.makeOpaque(backgroundColor.read(reader)));
}

export function observeColor(colorIdentifier: ColorIdentifier, themeService: IThemeService): IObservable<Color> {
	return observableFromEventOpts(
		{
			owner: { observeColor: colorIdentifier },
			equalsFn: (a: Color, b: Color) => a.equals(b),
			debugName: () => `observeColor(${colorIdentifier})`
		},
		themeService.onDidColorThemeChange,
		() => {
			const color = themeService.getColorTheme().getColor(colorIdentifier);
			if (!color) {
				throw new BugIndicatingError(`Missing color: ${colorIdentifier}`);
			}
			return color;
		}
	);
}
