/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Registry } from '../../../registry/common/platform.js';
import { chartsOrange, ColorIdentifier, Extensions as ThemingExtensions, IColorRegistry } from '../../common/colorRegistry.js';
import { ColorScheme } from '../../common/theme.js';
import { IColorTheme } from '../../common/themeService.js';

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

suite('Charts Colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('charts.orange has opaque defaults', () => {
		assert.deepStrictEqual([
			ColorScheme.DARK,
			ColorScheme.LIGHT,
			ColorScheme.HIGH_CONTRAST_DARK,
			ColorScheme.HIGH_CONTRAST_LIGHT,
		].map(type => colorRegistry.resolveDefaultColor(chartsOrange, getMockTheme(type))?.toString()), [
			'#d18616',
			'#d18616',
			'#ab5a00',
			'#0f4a85',
		]);
	});
});
