/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { chooseSessionTextColor, formatContrastRatio, getNextSessionColor, isValidHexColor, normalizeHexColor, SessionPaletteColor, SessionTextColorMode, toSessionColor, toSessionTextColorMode } from '../../common/sessionColors.js';

suite('SessionColors', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates and normalizes colors', () => {
		assert.deepStrictEqual({
			valid: ['#abc', 'abc', '#A1B2C3', ' #a1b2c3 ', '#abcd', 'red', ''].map(isValidHexColor),
			normalized: ['#ABC', 'a1b2c3', ' #A1B2C3 ', '#12345'].map(normalizeHexColor),
			colors: ['blue', 'Blue', '#FFF', 'magenta', 42].map(toSessionColor),
			textModes: ['light', 'dark', 'auto', 'bogus', undefined].map(toSessionTextColorMode),
		}, {
			valid: [true, true, true, true, false, false, false],
			normalized: ['#aabbcc', '#a1b2c3', '#a1b2c3', undefined],
			colors: [SessionPaletteColor.Blue, undefined, '#ffffff', undefined, undefined],
			textModes: [SessionTextColorMode.Light, SessionTextColorMode.Dark, SessionTextColorMode.Auto, SessionTextColorMode.Auto, SessionTextColorMode.Auto],
		});
	});

	test('picks the text color with the higher contrast, preferring dark on a tie', () => {
		const light = Color.fromHex('#ffffff');
		const dark = Color.fromHex('#161616');
		const pick = (fill: string, mode = SessionTextColorMode.Auto) => {
			const choice = chooseSessionTextColor(Color.fromHex(fill), light, dark, mode);
			return `${choice.light ? 'light' : 'dark'} ${formatContrastRatio(choice.contrast)}`;
		};
		// A gray exactly between both text colors ties; dark text wins the tie.
		const tie = Color.fromHex('#777777');
		const tieChoice = chooseSessionTextColor(tie, tie, tie, SessionTextColorMode.Auto);
		assert.deepStrictEqual({
			paleYellow: pick('#d6bd62'),
			deepBlue: pick('#2f6fdb'),
			black: pick('#000000'),
			white: pick('#ffffff'),
			forcedLight: pick('#ffffff', SessionTextColorMode.Light),
			forcedDark: pick('#000000', SessionTextColorMode.Dark),
			tie: tieChoice.light,
		}, {
			paleYellow: 'dark 9.8:1',
			deepBlue: 'light 4.8:1',
			black: 'light 21.0:1',
			white: 'dark 18.1:1',
			forcedLight: 'light 1.0:1',
			forcedDark: 'dark 1.2:1',
			tie: false,
		});
	});

	test('the next color is the first unused one, then the least used', () => {
		const all = [
			SessionPaletteColor.Blue, SessionPaletteColor.Red, SessionPaletteColor.Yellow, SessionPaletteColor.Green,
			SessionPaletteColor.Pink, SessionPaletteColor.Purple, SessionPaletteColor.Cyan, SessionPaletteColor.Orange, SessionPaletteColor.Grey,
		];
		assert.deepStrictEqual({
			none: getNextSessionColor([]),
			blueUsed: getNextSessionColor([SessionPaletteColor.Blue]),
			customIgnored: getNextSessionColor(['#123456', undefined]),
			allUsed: getNextSessionColor(all),
			allUsedBlueTwice: getNextSessionColor([...all, SessionPaletteColor.Blue]),
		}, {
			none: SessionPaletteColor.Blue,
			blueUsed: SessionPaletteColor.Red,
			customIgnored: SessionPaletteColor.Blue,
			allUsed: SessionPaletteColor.Blue,
			allUsedBlueTwice: SessionPaletteColor.Red,
		});
	});
});
