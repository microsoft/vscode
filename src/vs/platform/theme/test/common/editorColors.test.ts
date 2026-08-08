/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Registry } from '../../../registry/common/platform.js';
import { Extensions, IColorRegistry } from '../../common/colorRegistry.js';
import { diffInserted, diffInsertedOutline, diffRemoved, diffRemovedOutline, editorBackground } from '../../common/colors/editorColors.js';
import { ColorScheme } from '../../common/theme.js';
import { IColorTheme } from '../../common/themeService.js';

const colorRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);

function getMockTheme(type: ColorScheme): IColorTheme {
	const theme: IColorTheme = {
		type,
		label: '',
		semanticHighlighting: false,
		getColor: colorId => colorRegistry.resolveDefaultColor(colorId, theme),
		defines: () => true,
		getTokenStyleMetadata: () => undefined,
		tokenColorMap: [],
		tokenFontMap: []
	};
	return theme;
}

suite('Editor Colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('high contrast diff outlines meet non-text contrast requirements', () => {
		const minimumContrastRatio = 3;
		const contrastRatios = [ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT].flatMap(type => {
			const theme = getMockTheme(type);
			const background = theme.getColor(editorBackground)!;
			const insertedBackground = theme.getColor(diffInserted)!;
			const insertedOutline = theme.getColor(diffInsertedOutline)!;
			const removedBackground = theme.getColor(diffRemoved)!;
			const removedOutline = theme.getColor(diffRemovedOutline)!;

			return [
				insertedOutline.getContrastRatio(background),
				insertedOutline.getContrastRatio(insertedBackground),
				removedOutline.getContrastRatio(background),
				removedOutline.getContrastRatio(removedBackground)
			];
		});

		assert.deepStrictEqual(contrastRatios.map(ratio => ratio >= minimumContrastRatio), Array(contrastRatios.length).fill(true));
	});
});
