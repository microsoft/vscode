/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Registry } from '../../../registry/common/platform.js';
import { chartsBlue, chartsGreen, chartsOrange, chartsPurple, chartsRed, chartsYellow, ColorIdentifier, confettiColor1, confettiColor2, confettiColor3, confettiColor4, confettiColor5, confettiColor6, Extensions, IColorRegistry } from '../../common/colorRegistry.js';
import { ColorScheme } from '../../common/theme.js';
import { TestColorTheme } from './testThemeService.js';

suite('Confetti Colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const colorRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);
	const palette = [
		[confettiColor1, chartsRed],
		[confettiColor2, chartsOrange],
		[confettiColor3, chartsYellow],
		[confettiColor4, chartsGreen],
		[confettiColor5, chartsBlue],
		[confettiColor6, chartsPurple],
	];

	test('registers six independently configurable palette colors', () => {
		const colors = colorRegistry.getColors();
		const schema = colorRegistry.getColorSchema();
		assert.deepStrictEqual(palette.map(([id]) => ({
			id,
			defaultColor: colors.find(color => color.id === id)?.defaults,
			configurable: schema.properties?.[id] !== undefined,
		})), [
			{ id: 'confetti.color1', defaultColor: chartsRed, configurable: true },
			{ id: 'confetti.color2', defaultColor: chartsOrange, configurable: true },
			{ id: 'confetti.color3', defaultColor: chartsYellow, configurable: true },
			{ id: 'confetti.color4', defaultColor: chartsGreen, configurable: true },
			{ id: 'confetti.color5', defaultColor: chartsBlue, configurable: true },
			{ id: 'confetti.color6', defaultColor: chartsPurple, configurable: true },
		]);
	});

	for (const type of [ColorScheme.DARK, ColorScheme.LIGHT, ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]) {
		test(`preserves the current opaque palette in ${type} themes`, () => {
			const theme = new class extends TestColorTheme {
				override getColor(id: ColorIdentifier): Color | undefined {
					return colorRegistry.resolveDefaultColor(id, this);
				}
			}({}, type);
			assert.deepStrictEqual(palette.map(([id]) => ({
				color: theme.getColor(id)?.toString(),
				opaque: theme.getColor(id)?.isOpaque(),
			})), palette.map(([, defaultColor]) => ({
				color: theme.getColor(defaultColor)?.toString(),
				opaque: true,
			})));
		});
	}
});
