/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ColorIdentifier, Extensions as ThemingExtensions, IColorRegistry, isColorDefaults } from '../../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../../platform/theme/common/themeService.js';
import '../../browser/suggestWidget.js';

const colorRegistry = Registry.as<IColorRegistry>(ThemingExtensions.ColorContribution);

function getMockTheme(type: ColorScheme): IColorTheme {
	const theme = {
		selector: '',
		label: '',
		type,
		getColor: (colorId: ColorIdentifier): Color | undefined => colorRegistry.resolveDefaultColor(colorId, theme),
		defines: () => true,
		getTokenStyleMetadata: () => undefined,
		tokenColorMap: [],
		tokenFontMap: [],
		semanticHighlighting: false
	};
	return theme;
}

suite('SuggestWidgetColors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('inverts suggest widget colors for high contrast selection', () => {
		const colorsMatch = (type: ColorScheme, first: ColorIdentifier, second: ColorIdentifier) => {
			const theme = getMockTheme(type);
			const firstColor = theme.getColor(first);
			const secondColor = theme.getColor(second);
			if (!firstColor || !secondColor) {
				return firstColor === secondColor;
			}
			return firstColor.equals(secondColor);
		};
		const defaultsReferenceMatch = (id: ColorIdentifier, referencedId: ColorIdentifier) => {
			const contribution = colorRegistry.getColors().find(color => color.id === id);
			if (!contribution || !isColorDefaults(contribution.defaults)) {
				return false;
			}
			return contribution.defaults.dark === referencedId && contribution.defaults.light === referencedId;
		};

		assert.deepStrictEqual({
			highContrast: [ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT].map(type => ({
				backgroundIsForeground: colorsMatch(type, 'editorSuggestWidget.selectedBackground', 'editorSuggestWidget.foreground'),
				foregroundIsBackground: colorsMatch(type, 'editorSuggestWidget.selectedForeground', 'editorSuggestWidget.background'),
				iconIsBackground: colorsMatch(type, 'editorSuggestWidget.selectedIconForeground', 'editorSuggestWidget.background'),
				highlightIsBackground: colorsMatch(type, 'editorSuggestWidget.focusHighlightForeground', 'editorSuggestWidget.background')
			})),
			normal: [ColorScheme.DARK, ColorScheme.LIGHT].map(type => ({
				backgroundUsesQuickInput: colorsMatch(type, 'editorSuggestWidget.selectedBackground', 'quickInputList.focusBackground'),
				foregroundUsesQuickInput: colorsMatch(type, 'editorSuggestWidget.selectedForeground', 'quickInputList.focusForeground'),
				iconUsesQuickInput: defaultsReferenceMatch('editorSuggestWidget.selectedIconForeground', 'quickInputList.focusIconForeground'),
				highlightUsesListFocus: colorsMatch(type, 'editorSuggestWidget.focusHighlightForeground', 'list.focusHighlightForeground')
			}))
		}, {
			highContrast: [
				{ backgroundIsForeground: true, foregroundIsBackground: true, iconIsBackground: true, highlightIsBackground: true },
				{ backgroundIsForeground: true, foregroundIsBackground: true, iconIsBackground: true, highlightIsBackground: true }
			],
			normal: [
				{ backgroundUsesQuickInput: true, foregroundUsesQuickInput: true, iconUsesQuickInput: true, highlightUsesListFocus: true },
				{ backgroundUsesQuickInput: true, foregroundUsesQuickInput: true, iconUsesQuickInput: true, highlightUsesListFocus: true }
			]
		});
	});
});
