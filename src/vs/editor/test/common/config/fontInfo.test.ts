/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeFullwidthLetterSpacing, FontInfo, getFullwidthCharacterWidth } from '../../../common/config/fontInfo.js';

suite('fullwidth character width', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function compute(typicalHalfwidthCharacterWidth: number, typicalFullwidthCharacterWidth: number, letterSpacing: number, forceFullwidthCharacterWidth: boolean, isMonospace = true) {
		const fontInfo = new FontInfo({
			pixelRatio: 1,
			fontFamily: 'mockFont',
			fontWeight: 'normal',
			fontSize: 14,
			fontFeatureSettings: '',
			fontVariationSettings: '',
			lineHeight: 19,
			letterSpacing,
			isMonospace,
			typicalHalfwidthCharacterWidth,
			typicalFullwidthCharacterWidth,
			canUseHalfwidthRightwardsArrow: true,
			spaceWidth: typicalHalfwidthCharacterWidth,
			middotWidth: typicalHalfwidthCharacterWidth,
			wsmiddotWidth: typicalHalfwidthCharacterWidth,
			maxDigitWidth: typicalHalfwidthCharacterWidth
		}, true);

		return getFullwidthCharacterWidth(fontInfo, forceFullwidthCharacterWidth);
	}

	test('the font is left alone while the option is off', () => {
		assert.strictEqual(compute(8, 14, 0, false), 14);
	});

	test('proportional fonts are left alone while the option is on', () => {
		assert.strictEqual(compute(8, 14, 0, true, false), 14);
	});

	test('full-width characters target two half-width cells', () => {
		assert.strictEqual(compute(8, 14, 0, true), 16);
	});

	test('letter spacing corrects each measured grapheme to the target', () => {
		assert.deepStrictEqual([
			computeFullwidthLetterSpacing(16, 14),
			computeFullwidthLetterSpacing(16, 16),
			computeFullwidthLetterSpacing(16, 20),
		], [2, 0, -4]);
	});
});
