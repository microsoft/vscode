/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FontInfo, getFullwidthCharacterWidth, getFullwidthLetterSpacing } from '../../../common/config/fontInfo.js';

suite('fullwidth character width', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * The width a full-width character is asked to occupy, together with the `letter-spacing` that
	 * gets it there. Every width a font reports is measured with `editor.letterSpacing` already
	 * applied, so the two have to be read together.
	 */
	function compute(typicalHalfwidthCharacterWidth: number, typicalFullwidthCharacterWidth: number, letterSpacing: number, forceFullwidthCharacterWidth: boolean) {
		const fontInfo = new FontInfo({
			pixelRatio: 1,
			fontFamily: 'mockFont',
			fontWeight: 'normal',
			fontSize: 14,
			fontFeatureSettings: '',
			fontVariationSettings: '',
			lineHeight: 19,
			letterSpacing,
			isMonospace: true,
			typicalHalfwidthCharacterWidth,
			typicalFullwidthCharacterWidth,
			canUseHalfwidthRightwardsArrow: true,
			spaceWidth: typicalHalfwidthCharacterWidth,
			middotWidth: typicalHalfwidthCharacterWidth,
			wsmiddotWidth: typicalHalfwidthCharacterWidth,
			maxDigitWidth: typicalHalfwidthCharacterWidth
		}, true);

		return {
			width: getFullwidthCharacterWidth(fontInfo, forceFullwidthCharacterWidth),
			letterSpacing: getFullwidthLetterSpacing(fontInfo, forceFullwidthCharacterWidth)
		};
	}

	test('the font is left alone while the option is off', () => {
		assert.deepStrictEqual(compute(8, 14, 0, false), { width: 14, letterSpacing: null });
	});

	test('narrow full-width characters are stretched onto the grid', () => {
		// Two half-width cells, not two spaces: the column, the ruler and the wrapping column are all
		// expressed in `typicalHalfwidthCharacterWidth`.
		assert.deepStrictEqual(compute(8, 14, 0, true), { width: 16, letterSpacing: 2 });
	});

	test('full-width characters already on the grid need no correction', () => {
		assert.deepStrictEqual(compute(8, 16, 0, true), { width: 16, letterSpacing: null });
	});

	test('full-width characters wider than two cells keep their natural width', () => {
		// A negative `letter-spacing` would shorten the advance without scaling the glyph, so the ink
		// would spill over the character next to it. Being off the grid beats being unreadable.
		assert.deepStrictEqual(compute(8, 20, 0, true), { width: 20, letterSpacing: null });
	});

	test('`editor.letterSpacing` is folded back into the correction', () => {
		// A `letter-spacing` on the run replaces the inherited one instead of adding to it, so it has to
		// be paid for again here: the glyph advances `14 - 1 + 3 === 16`, exactly two cells of `8`.
		assert.deepStrictEqual(compute(8, 14, 1, true), { width: 16, letterSpacing: 3 });
		assert.deepStrictEqual(compute(8, 14, -1, true), { width: 16, letterSpacing: 1 });
	});
});
