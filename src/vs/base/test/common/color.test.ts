/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color, HSLA, HSVA, RGBA } from '../../common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Color', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isLighterColor', () => {
		const color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.ok(color1.isLighterThan(color2));

		// Abyss theme
		assert.ok(Color.fromHex('#770811').isLighterThan(Color.fromHex('#000c18')));
	});

	test('getLighterColor', () => {
		const color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.deepStrictEqual(color1.hsla, Color.getLighterColor(color1, color2).hsla);
		assert.deepStrictEqual(new HSLA(0, 0, 0.916, 1), Color.getLighterColor(color2, color1).hsla);
		assert.deepStrictEqual(new HSLA(0, 0, 0.851, 1), Color.getLighterColor(color2, color1, 0.3).hsla);
		assert.deepStrictEqual(new HSLA(0, 0, 0.981, 1), Color.getLighterColor(color2, color1, 0.7).hsla);
		assert.deepStrictEqual(new HSLA(0, 0, 1, 1), Color.getLighterColor(color2, color1, 1).hsla);

	});

	test('isDarkerColor', () => {
		const color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.ok(color2.isDarkerThan(color1));

	});

	test('getDarkerColor', () => {
		const color1 = new Color(new HSLA(60, 1, 0.5, 1)), color2 = new Color(new HSLA(0, 0, 0.753, 1));

		assert.deepStrictEqual(color2.hsla, Color.getDarkerColor(color2, color1).hsla);
		assert.deepStrictEqual(new HSLA(60, 1, 0.392, 1), Color.getDarkerColor(color1, color2).hsla);
		assert.deepStrictEqual(new HSLA(60, 1, 0.435, 1), Color.getDarkerColor(color1, color2, 0.3).hsla);
		assert.deepStrictEqual(new HSLA(60, 1, 0.349, 1), Color.getDarkerColor(color1, color2, 0.7).hsla);
		assert.deepStrictEqual(new HSLA(60, 1, 0.284, 1), Color.getDarkerColor(color1, color2, 1).hsla);

		// Abyss theme
		assert.deepStrictEqual(new HSLA(355, 0.874, 0.157, 1), Color.getDarkerColor(Color.fromHex('#770811'), Color.fromHex('#000c18'), 0.4).hsla);
	});

	test('luminance', () => {
		assert.deepStrictEqual(0, new Color(new RGBA(0, 0, 0, 1)).getRelativeLuminance());
		assert.deepStrictEqual(1, new Color(new RGBA(255, 255, 255, 1)).getRelativeLuminance());

		assert.deepStrictEqual(0.2126, new Color(new RGBA(255, 0, 0, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.7152, new Color(new RGBA(0, 255, 0, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.0722, new Color(new RGBA(0, 0, 255, 1)).getRelativeLuminance());

		assert.deepStrictEqual(0.9278, new Color(new RGBA(255, 255, 0, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.7874, new Color(new RGBA(0, 255, 255, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.2848, new Color(new RGBA(255, 0, 255, 1)).getRelativeLuminance());

		assert.deepStrictEqual(0.5271, new Color(new RGBA(192, 192, 192, 1)).getRelativeLuminance());

		assert.deepStrictEqual(0.2159, new Color(new RGBA(128, 128, 128, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.0459, new Color(new RGBA(128, 0, 0, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.2003, new Color(new RGBA(128, 128, 0, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.1544, new Color(new RGBA(0, 128, 0, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.0615, new Color(new RGBA(128, 0, 128, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.17, new Color(new RGBA(0, 128, 128, 1)).getRelativeLuminance());
		assert.deepStrictEqual(0.0156, new Color(new RGBA(0, 0, 128, 1)).getRelativeLuminance());
	});

	test('blending', () => {
		assert.deepStrictEqual(new Color(new RGBA(0, 0, 0, 0)).blend(new Color(new RGBA(243, 34, 43))), new Color(new RGBA(243, 34, 43)));
		assert.deepStrictEqual(new Color(new RGBA(255, 255, 255)).blend(new Color(new RGBA(243, 34, 43))), new Color(new RGBA(255, 255, 255)));
		assert.deepStrictEqual(new Color(new RGBA(122, 122, 122, 0.7)).blend(new Color(new RGBA(243, 34, 43))), new Color(new RGBA(158, 95, 98)));
		assert.deepStrictEqual(new Color(new RGBA(0, 0, 0, 0.58)).blend(new Color(new RGBA(255, 255, 255, 0.33))), new Color(new RGBA(49, 49, 49, 0.719)));
	});

	suite('HSLA', () => {
		test('HSLA.toRGBA', () => {
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(0, 0, 0, 0)), new RGBA(0, 0, 0, 0));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(0, 0, 0, 1)), new RGBA(0, 0, 0, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(0, 0, 1, 1)), new RGBA(255, 255, 255, 1));

			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(0, 1, 0.5, 1)), new RGBA(255, 0, 0, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(120, 1, 0.5, 1)), new RGBA(0, 255, 0, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(240, 1, 0.5, 1)), new RGBA(0, 0, 255, 1));

			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(60, 1, 0.5, 1)), new RGBA(255, 255, 0, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(180, 1, 0.5, 1)), new RGBA(0, 255, 255, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(300, 1, 0.5, 1)), new RGBA(255, 0, 255, 1));

			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(0, 0, 0.753, 1)), new RGBA(192, 192, 192, 1));

			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(0, 0, 0.502, 1)), new RGBA(128, 128, 128, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(0, 1, 0.251, 1)), new RGBA(128, 0, 0, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(60, 1, 0.251, 1)), new RGBA(128, 128, 0, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(120, 1, 0.251, 1)), new RGBA(0, 128, 0, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(300, 1, 0.251, 1)), new RGBA(128, 0, 128, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(180, 1, 0.251, 1)), new RGBA(0, 128, 128, 1));
			assert.deepStrictEqual(HSLA.toRGBA(new HSLA(240, 1, 0.251, 1)), new RGBA(0, 0, 128, 1));
		});

		test('HSLA.fromRGBA', () => {
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 0, 0, 0)), new HSLA(0, 0, 0, 0));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 0, 0, 1)), new HSLA(0, 0, 0, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(255, 255, 255, 1)), new HSLA(0, 0, 1, 1));

			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(255, 0, 0, 1)), new HSLA(0, 1, 0.5, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 255, 0, 1)), new HSLA(120, 1, 0.5, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 0, 255, 1)), new HSLA(240, 1, 0.5, 1));

			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(255, 255, 0, 1)), new HSLA(60, 1, 0.5, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 255, 255, 1)), new HSLA(180, 1, 0.5, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(255, 0, 255, 1)), new HSLA(300, 1, 0.5, 1));

			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(192, 192, 192, 1)), new HSLA(0, 0, 0.753, 1));

			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(128, 128, 128, 1)), new HSLA(0, 0, 0.502, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(128, 0, 0, 1)), new HSLA(0, 1, 0.251, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(128, 128, 0, 1)), new HSLA(60, 1, 0.251, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 128, 0, 1)), new HSLA(120, 1, 0.251, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(128, 0, 128, 1)), new HSLA(300, 1, 0.251, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 128, 128, 1)), new HSLA(180, 1, 0.251, 1));
			assert.deepStrictEqual(HSLA.fromRGBA(new RGBA(0, 0, 128, 1)), new HSLA(240, 1, 0.251, 1));
		});
	});

	suite('HSVA', () => {
		test('HSVA.toRGBA', () => {
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(0, 0, 0, 0)), new RGBA(0, 0, 0, 0));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(0, 0, 0, 1)), new RGBA(0, 0, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(0, 0, 1, 1)), new RGBA(255, 255, 255, 1));

			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(0, 1, 1, 1)), new RGBA(255, 0, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(120, 1, 1, 1)), new RGBA(0, 255, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(240, 1, 1, 1)), new RGBA(0, 0, 255, 1));

			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(60, 1, 1, 1)), new RGBA(255, 255, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(180, 1, 1, 1)), new RGBA(0, 255, 255, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(300, 1, 1, 1)), new RGBA(255, 0, 255, 1));

			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(0, 0, 0.753, 1)), new RGBA(192, 192, 192, 1));

			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(0, 0, 0.502, 1)), new RGBA(128, 128, 128, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(0, 1, 0.502, 1)), new RGBA(128, 0, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(60, 1, 0.502, 1)), new RGBA(128, 128, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(120, 1, 0.502, 1)), new RGBA(0, 128, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(300, 1, 0.502, 1)), new RGBA(128, 0, 128, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(180, 1, 0.502, 1)), new RGBA(0, 128, 128, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(240, 1, 0.502, 1)), new RGBA(0, 0, 128, 1));

			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(360, 0, 0, 0)), new RGBA(0, 0, 0, 0));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(360, 0, 0, 1)), new RGBA(0, 0, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(360, 0, 1, 1)), new RGBA(255, 255, 255, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(360, 1, 1, 1)), new RGBA(255, 0, 0, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(360, 0, 0.753, 1)), new RGBA(192, 192, 192, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(360, 0, 0.502, 1)), new RGBA(128, 128, 128, 1));
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(360, 1, 0.502, 1)), new RGBA(128, 0, 0, 1));

		});

		test('HSVA.fromRGBA', () => {

			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 0, 0, 0)), new HSVA(0, 0, 0, 0));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 0, 0, 1)), new HSVA(0, 0, 0, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(255, 255, 255, 1)), new HSVA(0, 0, 1, 1));

			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(255, 0, 0, 1)), new HSVA(0, 1, 1, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 255, 0, 1)), new HSVA(120, 1, 1, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 0, 255, 1)), new HSVA(240, 1, 1, 1));

			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(255, 255, 0, 1)), new HSVA(60, 1, 1, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 255, 255, 1)), new HSVA(180, 1, 1, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(255, 0, 255, 1)), new HSVA(300, 1, 1, 1));

			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(192, 192, 192, 1)), new HSVA(0, 0, 0.753, 1));

			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(128, 128, 128, 1)), new HSVA(0, 0, 0.502, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(128, 0, 0, 1)), new HSVA(0, 1, 0.502, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(128, 128, 0, 1)), new HSVA(60, 1, 0.502, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 128, 0, 1)), new HSVA(120, 1, 0.502, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(128, 0, 128, 1)), new HSVA(300, 1, 0.502, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 128, 128, 1)), new HSVA(180, 1, 0.502, 1));
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(0, 0, 128, 1)), new HSVA(240, 1, 0.502, 1));
		});

		test('Keep hue value when saturation is 0', () => {
			assert.deepStrictEqual(HSVA.toRGBA(new HSVA(10, 0, 0, 0)), HSVA.toRGBA(new HSVA(20, 0, 0, 0)));
			assert.deepStrictEqual(new Color(new HSVA(10, 0, 0, 0)).rgba, new Color(new HSVA(20, 0, 0, 0)).rgba);
			assert.notDeepStrictEqual(new Color(new HSVA(10, 0, 0, 0)).hsva, new Color(new HSVA(20, 0, 0, 0)).hsva);
		});

		test('bug#36240', () => {
			assert.deepStrictEqual(HSVA.fromRGBA(new RGBA(92, 106, 196, 1)), new HSVA(232, 0.531, 0.769, 1));
			assert.deepStrictEqual(HSVA.toRGBA(HSVA.fromRGBA(new RGBA(92, 106, 196, 1))), new RGBA(92, 106, 196, 1));
		});
	});

	suite('Format', () => {
		suite('CSS', () => {
			test('parseHex', () => {

				// invalid
				assert.deepStrictEqual(Color.Format.CSS.parseHex(''), null);
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#'), null);
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0102030'), null);

				// somewhat valid
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#FFFFG0')!.rgba, new RGBA(255, 255, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#FFFFg0')!.rgba, new RGBA(255, 255, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#-FFF00')!.rgba, new RGBA(15, 255, 0, 1));

				// valid
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#000000')!.rgba, new RGBA(0, 0, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#FFFFFF')!.rgba, new RGBA(255, 255, 255, 1));

				assert.deepStrictEqual(Color.Format.CSS.parseHex('#FF0000')!.rgba, new RGBA(255, 0, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#00FF00')!.rgba, new RGBA(0, 255, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0000FF')!.rgba, new RGBA(0, 0, 255, 1));

				assert.deepStrictEqual(Color.Format.CSS.parseHex('#FFFF00')!.rgba, new RGBA(255, 255, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#00FFFF')!.rgba, new RGBA(0, 255, 255, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#FF00FF')!.rgba, new RGBA(255, 0, 255, 1));

				assert.deepStrictEqual(Color.Format.CSS.parseHex('#C0C0C0')!.rgba, new RGBA(192, 192, 192, 1));

				assert.deepStrictEqual(Color.Format.CSS.parseHex('#808080')!.rgba, new RGBA(128, 128, 128, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#800000')!.rgba, new RGBA(128, 0, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#808000')!.rgba, new RGBA(128, 128, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#008000')!.rgba, new RGBA(0, 128, 0, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#800080')!.rgba, new RGBA(128, 0, 128, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#008080')!.rgba, new RGBA(0, 128, 128, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#000080')!.rgba, new RGBA(0, 0, 128, 1));

				assert.deepStrictEqual(Color.Format.CSS.parseHex('#010203')!.rgba, new RGBA(1, 2, 3, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#040506')!.rgba, new RGBA(4, 5, 6, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#070809')!.rgba, new RGBA(7, 8, 9, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0a0A0a')!.rgba, new RGBA(10, 10, 10, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0b0B0b')!.rgba, new RGBA(11, 11, 11, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0c0C0c')!.rgba, new RGBA(12, 12, 12, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0d0D0d')!.rgba, new RGBA(13, 13, 13, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0e0E0e')!.rgba, new RGBA(14, 14, 14, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#0f0F0f')!.rgba, new RGBA(15, 15, 15, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#a0A0a0')!.rgba, new RGBA(160, 160, 160, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#CFA')!.rgba, new RGBA(204, 255, 170, 1));
				assert.deepStrictEqual(Color.Format.CSS.parseHex('#CFA8')!.rgba, new RGBA(204, 255, 170, 0.533));
			});
		});
	});

	const rgbaFromInt = (int: number) => new Color(new RGBA(
		(int >> 24) & 0xff,
		(int >> 16) & 0xff,
		(int >> 8) & 0xff,
		(int) & 0xff
	));

	const assertContrastRatio = (background: number, foreground: number, ratio: number, expected = foreground) => {
		const bgColor = rgbaFromInt(background);
		const fgColor = rgbaFromInt(foreground);
		assert.deepStrictEqual(bgColor.ensureConstrast(fgColor, ratio).rgba, rgbaFromInt(expected).rgba);
	};

	// https://github.com/xtermjs/xterm.js/blob/44f9fa39ae03e2ca6d28354d88a399608686770e/src/common/Color.test.ts#L355
	suite('ensureContrastRatio', () => {
		test('should return undefined if the color already meets the contrast ratio (black bg)', () => {
			assertContrastRatio(0x000000ff, 0x606060ff, 1, undefined);
			assertContrastRatio(0x000000ff, 0x606060ff, 2, undefined);
			assertContrastRatio(0x000000ff, 0x606060ff, 3, undefined);
		});
		test('should return a color that meets the contrast ratio (black bg)', () => {
			assertContrastRatio(0x000000ff, 0x606060ff, 4, 0x707070ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 5, 0x7f7f7fff);
			assertContrastRatio(0x000000ff, 0x606060ff, 6, 0x8c8c8cff);
			assertContrastRatio(0x000000ff, 0x606060ff, 7, 0x989898ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 8, 0xa3a3a3ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 9, 0xadadadff);
			assertContrastRatio(0x000000ff, 0x606060ff, 10, 0xb6b6b6ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 11, 0xbebebeff);
			assertContrastRatio(0x000000ff, 0x606060ff, 12, 0xc5c5c5ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 13, 0xd1d1d1ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 14, 0xd6d6d6ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 15, 0xdbdbdbff);
			assertContrastRatio(0x000000ff, 0x606060ff, 16, 0xe3e3e3ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 17, 0xe9e9e9ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 18, 0xeeeeeeff);
			assertContrastRatio(0x000000ff, 0x606060ff, 19, 0xf4f4f4ff);
			assertContrastRatio(0x000000ff, 0x606060ff, 20, 0xfafafaff);
			assertContrastRatio(0x000000ff, 0x606060ff, 21, 0xffffffff);
		});
		test('should return undefined if the color already meets the contrast ratio (white bg)', () => {
			assertContrastRatio(0xffffffff, 0x606060ff, 1, undefined);
			assertContrastRatio(0xffffffff, 0x606060ff, 2, undefined);
			assertContrastRatio(0xffffffff, 0x606060ff, 3, undefined);
			assertContrastRatio(0xffffffff, 0x606060ff, 4, undefined);
			assertContrastRatio(0xffffffff, 0x606060ff, 5, undefined);
			assertContrastRatio(0xffffffff, 0x606060ff, 6, undefined);
		});
		test('should return a color that meets the contrast ratio (white bg)', () => {
			assertContrastRatio(0xffffffff, 0x606060ff, 7, 0x565656ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 8, 0x4d4d4dff);
			assertContrastRatio(0xffffffff, 0x606060ff, 9, 0x454545ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 10, 0x3e3e3eff);
			assertContrastRatio(0xffffffff, 0x606060ff, 11, 0x373737ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 12, 0x313131ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 13, 0x313131ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 14, 0x272727ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 15, 0x232323ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 16, 0x1f1f1fff);
			assertContrastRatio(0xffffffff, 0x606060ff, 17, 0x1b1b1bff);
			assertContrastRatio(0xffffffff, 0x606060ff, 18, 0x151515ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 19, 0x101010ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 20, 0x080808ff);
			assertContrastRatio(0xffffffff, 0x606060ff, 21, 0x000000ff);
		});
	});
});
