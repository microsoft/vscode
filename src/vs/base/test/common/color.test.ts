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

	suite('toString', () => {
		test('alpha channel', () => {
			assert.deepStrictEqual(Color.fromHex('#00000000').toString(), 'rgba(0, 0, 0, 0)');
			assert.deepStrictEqual(Color.fromHex('#00000080').toString(), 'rgba(0, 0, 0, 0.5)');
			assert.deepStrictEqual(Color.fromHex('#000000FF').toString(), '#000000');
		});

		test('opaque', () => {
			assert.deepStrictEqual(Color.fromHex('#000000').toString().toUpperCase(), '#000000'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#FFFFFF').toString().toUpperCase(), '#FFFFFF'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#FF0000').toString().toUpperCase(), '#FF0000'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#00FF00').toString().toUpperCase(), '#00FF00'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#0000FF').toString().toUpperCase(), '#0000FF'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#FFFF00').toString().toUpperCase(), '#FFFF00'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#00FFFF').toString().toUpperCase(), '#00FFFF'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#FF00FF').toString().toUpperCase(), '#FF00FF'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#C0C0C0').toString().toUpperCase(), '#C0C0C0'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#808080').toString().toUpperCase(), '#808080'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#800000').toString().toUpperCase(), '#800000'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#808000').toString().toUpperCase(), '#808000'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#008000').toString().toUpperCase(), '#008000'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#800080').toString().toUpperCase(), '#800080'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#008080').toString().toUpperCase(), '#008080'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#000080').toString().toUpperCase(), '#000080'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#010203').toString().toUpperCase(), '#010203'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#040506').toString().toUpperCase(), '#040506'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#070809').toString().toUpperCase(), '#070809'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#0a0A0a').toString().toUpperCase(), '#0a0A0a'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#0b0B0b').toString().toUpperCase(), '#0b0B0b'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#0c0C0c').toString().toUpperCase(), '#0c0C0c'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#0d0D0d').toString().toUpperCase(), '#0d0D0d'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#0e0E0e').toString().toUpperCase(), '#0e0E0e'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#0f0F0f').toString().toUpperCase(), '#0f0F0f'.toUpperCase());
			assert.deepStrictEqual(Color.fromHex('#a0A0a0').toString().toUpperCase(), '#a0A0a0'.toUpperCase());
		});
	});

	suite('toNumber32Bit', () => {
		test('alpha channel', () => {
			assert.deepStrictEqual(Color.fromHex('#00000000').toNumber32Bit(), 0x00000000);
			assert.deepStrictEqual(Color.fromHex('#00000080').toNumber32Bit(), 0x00000080);
			assert.deepStrictEqual(Color.fromHex('#000000FF').toNumber32Bit(), 0x000000FF);
		});

		test('opaque', () => {
			assert.deepStrictEqual(Color.fromHex('#000000').toNumber32Bit(), 0x000000FF);
			assert.deepStrictEqual(Color.fromHex('#FFFFFF').toNumber32Bit(), 0xFFFFFFFF);
			assert.deepStrictEqual(Color.fromHex('#FF0000').toNumber32Bit(), 0xFF0000FF);
			assert.deepStrictEqual(Color.fromHex('#00FF00').toNumber32Bit(), 0x00FF00FF);
			assert.deepStrictEqual(Color.fromHex('#0000FF').toNumber32Bit(), 0x0000FFFF);
			assert.deepStrictEqual(Color.fromHex('#FFFF00').toNumber32Bit(), 0xFFFF00FF);
			assert.deepStrictEqual(Color.fromHex('#00FFFF').toNumber32Bit(), 0x00FFFFFF);
			assert.deepStrictEqual(Color.fromHex('#FF00FF').toNumber32Bit(), 0xFF00FFFF);
			assert.deepStrictEqual(Color.fromHex('#C0C0C0').toNumber32Bit(), 0xC0C0C0FF);
			assert.deepStrictEqual(Color.fromHex('#808080').toNumber32Bit(), 0x808080FF);
			assert.deepStrictEqual(Color.fromHex('#800000').toNumber32Bit(), 0x800000FF);
			assert.deepStrictEqual(Color.fromHex('#808000').toNumber32Bit(), 0x808000FF);
			assert.deepStrictEqual(Color.fromHex('#008000').toNumber32Bit(), 0x008000FF);
			assert.deepStrictEqual(Color.fromHex('#800080').toNumber32Bit(), 0x800080FF);
			assert.deepStrictEqual(Color.fromHex('#008080').toNumber32Bit(), 0x008080FF);
			assert.deepStrictEqual(Color.fromHex('#000080').toNumber32Bit(), 0x000080FF);
			assert.deepStrictEqual(Color.fromHex('#010203').toNumber32Bit(), 0x010203FF);
			assert.deepStrictEqual(Color.fromHex('#040506').toNumber32Bit(), 0x040506FF);
			assert.deepStrictEqual(Color.fromHex('#070809').toNumber32Bit(), 0x070809FF);
			assert.deepStrictEqual(Color.fromHex('#0a0A0a').toNumber32Bit(), 0x0a0A0aFF);
			assert.deepStrictEqual(Color.fromHex('#0b0B0b').toNumber32Bit(), 0x0b0B0bFF);
			assert.deepStrictEqual(Color.fromHex('#0c0C0c').toNumber32Bit(), 0x0c0C0cFF);
			assert.deepStrictEqual(Color.fromHex('#0d0D0d').toNumber32Bit(), 0x0d0D0dFF);
			assert.deepStrictEqual(Color.fromHex('#0e0E0e').toNumber32Bit(), 0x0e0E0eFF);
			assert.deepStrictEqual(Color.fromHex('#0f0F0f').toNumber32Bit(), 0x0f0F0fFF);
			assert.deepStrictEqual(Color.fromHex('#a0A0a0').toNumber32Bit(), 0xa0A0a0FF);
		});
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
			suite('parse', () => {
				test('invalid', () => {
					assert.deepStrictEqual(Color.Format.CSS.parse(''), null);
					assert.deepStrictEqual(Color.Format.CSS.parse('#'), null);
					assert.deepStrictEqual(Color.Format.CSS.parse('#0102030'), null);
				});

				test('transparent', () => {
					assert.deepStrictEqual(Color.Format.CSS.parse('transparent')!.rgba, new RGBA(0, 0, 0, 0));
				});

				test('named keyword', () => {
					assert.deepStrictEqual(Color.Format.CSS.parse('aliceblue')!.rgba, new RGBA(240, 248, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('antiquewhite')!.rgba, new RGBA(250, 235, 215, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('aqua')!.rgba, new RGBA(0, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('aquamarine')!.rgba, new RGBA(127, 255, 212, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('azure')!.rgba, new RGBA(240, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('beige')!.rgba, new RGBA(245, 245, 220, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('bisque')!.rgba, new RGBA(255, 228, 196, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('black')!.rgba, new RGBA(0, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('blanchedalmond')!.rgba, new RGBA(255, 235, 205, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('blue')!.rgba, new RGBA(0, 0, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('blueviolet')!.rgba, new RGBA(138, 43, 226, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('brown')!.rgba, new RGBA(165, 42, 42, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('burlywood')!.rgba, new RGBA(222, 184, 135, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('cadetblue')!.rgba, new RGBA(95, 158, 160, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('chartreuse')!.rgba, new RGBA(127, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('chocolate')!.rgba, new RGBA(210, 105, 30, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('coral')!.rgba, new RGBA(255, 127, 80, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('cornflowerblue')!.rgba, new RGBA(100, 149, 237, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('cornsilk')!.rgba, new RGBA(255, 248, 220, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('crimson')!.rgba, new RGBA(220, 20, 60, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('cyan')!.rgba, new RGBA(0, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkblue')!.rgba, new RGBA(0, 0, 139, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkcyan')!.rgba, new RGBA(0, 139, 139, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkgoldenrod')!.rgba, new RGBA(184, 134, 11, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkgray')!.rgba, new RGBA(169, 169, 169, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkgreen')!.rgba, new RGBA(0, 100, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkgrey')!.rgba, new RGBA(169, 169, 169, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkkhaki')!.rgba, new RGBA(189, 183, 107, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkmagenta')!.rgba, new RGBA(139, 0, 139, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkolivegreen')!.rgba, new RGBA(85, 107, 47, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkorange')!.rgba, new RGBA(255, 140, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkorchid')!.rgba, new RGBA(153, 50, 204, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkred')!.rgba, new RGBA(139, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darksalmon')!.rgba, new RGBA(233, 150, 122, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkseagreen')!.rgba, new RGBA(143, 188, 143, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkslateblue')!.rgba, new RGBA(72, 61, 139, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkslategray')!.rgba, new RGBA(47, 79, 79, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkslategrey')!.rgba, new RGBA(47, 79, 79, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkturquoise')!.rgba, new RGBA(0, 206, 209, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('darkviolet')!.rgba, new RGBA(148, 0, 211, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('deeppink')!.rgba, new RGBA(255, 20, 147, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('deepskyblue')!.rgba, new RGBA(0, 191, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('dimgray')!.rgba, new RGBA(105, 105, 105, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('dimgrey')!.rgba, new RGBA(105, 105, 105, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('dodgerblue')!.rgba, new RGBA(30, 144, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('firebrick')!.rgba, new RGBA(178, 34, 34, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('floralwhite')!.rgba, new RGBA(255, 250, 240, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('forestgreen')!.rgba, new RGBA(34, 139, 34, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('fuchsia')!.rgba, new RGBA(255, 0, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('gainsboro')!.rgba, new RGBA(220, 220, 220, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('ghostwhite')!.rgba, new RGBA(248, 248, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('gold')!.rgba, new RGBA(255, 215, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('goldenrod')!.rgba, new RGBA(218, 165, 32, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('gray')!.rgba, new RGBA(128, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('green')!.rgba, new RGBA(0, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('greenyellow')!.rgba, new RGBA(173, 255, 47, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('grey')!.rgba, new RGBA(128, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('honeydew')!.rgba, new RGBA(240, 255, 240, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('hotpink')!.rgba, new RGBA(255, 105, 180, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('indianred')!.rgba, new RGBA(205, 92, 92, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('indigo')!.rgba, new RGBA(75, 0, 130, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('ivory')!.rgba, new RGBA(255, 255, 240, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('khaki')!.rgba, new RGBA(240, 230, 140, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lavender')!.rgba, new RGBA(230, 230, 250, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lavenderblush')!.rgba, new RGBA(255, 240, 245, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lawngreen')!.rgba, new RGBA(124, 252, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lemonchiffon')!.rgba, new RGBA(255, 250, 205, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightblue')!.rgba, new RGBA(173, 216, 230, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightcoral')!.rgba, new RGBA(240, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightcyan')!.rgba, new RGBA(224, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightgoldenrodyellow')!.rgba, new RGBA(250, 250, 210, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightgray')!.rgba, new RGBA(211, 211, 211, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightgreen')!.rgba, new RGBA(144, 238, 144, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightgrey')!.rgba, new RGBA(211, 211, 211, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightpink')!.rgba, new RGBA(255, 182, 193, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightsalmon')!.rgba, new RGBA(255, 160, 122, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightseagreen')!.rgba, new RGBA(32, 178, 170, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightskyblue')!.rgba, new RGBA(135, 206, 250, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightslategray')!.rgba, new RGBA(119, 136, 153, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightslategrey')!.rgba, new RGBA(119, 136, 153, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightsteelblue')!.rgba, new RGBA(176, 196, 222, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lightyellow')!.rgba, new RGBA(255, 255, 224, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('lime')!.rgba, new RGBA(0, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('limegreen')!.rgba, new RGBA(50, 205, 50, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('linen')!.rgba, new RGBA(250, 240, 230, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('magenta')!.rgba, new RGBA(255, 0, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('maroon')!.rgba, new RGBA(128, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumaquamarine')!.rgba, new RGBA(102, 205, 170, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumblue')!.rgba, new RGBA(0, 0, 205, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumorchid')!.rgba, new RGBA(186, 85, 211, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumpurple')!.rgba, new RGBA(147, 112, 219, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumseagreen')!.rgba, new RGBA(60, 179, 113, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumslateblue')!.rgba, new RGBA(123, 104, 238, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumspringgreen')!.rgba, new RGBA(0, 250, 154, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumturquoise')!.rgba, new RGBA(72, 209, 204, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mediumvioletred')!.rgba, new RGBA(199, 21, 133, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('midnightblue')!.rgba, new RGBA(25, 25, 112, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mintcream')!.rgba, new RGBA(245, 255, 250, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('mistyrose')!.rgba, new RGBA(255, 228, 225, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('moccasin')!.rgba, new RGBA(255, 228, 181, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('navajowhite')!.rgba, new RGBA(255, 222, 173, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('navy')!.rgba, new RGBA(0, 0, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('oldlace')!.rgba, new RGBA(253, 245, 230, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('olive')!.rgba, new RGBA(128, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('olivedrab')!.rgba, new RGBA(107, 142, 35, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('orange')!.rgba, new RGBA(255, 165, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('orangered')!.rgba, new RGBA(255, 69, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('orchid')!.rgba, new RGBA(218, 112, 214, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('palegoldenrod')!.rgba, new RGBA(238, 232, 170, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('palegreen')!.rgba, new RGBA(152, 251, 152, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('paleturquoise')!.rgba, new RGBA(175, 238, 238, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('palevioletred')!.rgba, new RGBA(219, 112, 147, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('papayawhip')!.rgba, new RGBA(255, 239, 213, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('peachpuff')!.rgba, new RGBA(255, 218, 185, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('peru')!.rgba, new RGBA(205, 133, 63, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('pink')!.rgba, new RGBA(255, 192, 203, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('plum')!.rgba, new RGBA(221, 160, 221, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('powderblue')!.rgba, new RGBA(176, 224, 230, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('purple')!.rgba, new RGBA(128, 0, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rebeccapurple')!.rgba, new RGBA(102, 51, 153, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('red')!.rgba, new RGBA(255, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rosybrown')!.rgba, new RGBA(188, 143, 143, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('royalblue')!.rgba, new RGBA(65, 105, 225, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('saddlebrown')!.rgba, new RGBA(139, 69, 19, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('salmon')!.rgba, new RGBA(250, 128, 114, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('sandybrown')!.rgba, new RGBA(244, 164, 96, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('seagreen')!.rgba, new RGBA(46, 139, 87, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('seashell')!.rgba, new RGBA(255, 245, 238, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('sienna')!.rgba, new RGBA(160, 82, 45, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('silver')!.rgba, new RGBA(192, 192, 192, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('skyblue')!.rgba, new RGBA(135, 206, 235, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('slateblue')!.rgba, new RGBA(106, 90, 205, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('slategray')!.rgba, new RGBA(112, 128, 144, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('slategrey')!.rgba, new RGBA(112, 128, 144, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('snow')!.rgba, new RGBA(255, 250, 250, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('springgreen')!.rgba, new RGBA(0, 255, 127, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('steelblue')!.rgba, new RGBA(70, 130, 180, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('tan')!.rgba, new RGBA(210, 180, 140, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('teal')!.rgba, new RGBA(0, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('thistle')!.rgba, new RGBA(216, 191, 216, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('tomato')!.rgba, new RGBA(255, 99, 71, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('turquoise')!.rgba, new RGBA(64, 224, 208, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('violet')!.rgba, new RGBA(238, 130, 238, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('wheat')!.rgba, new RGBA(245, 222, 179, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('white')!.rgba, new RGBA(255, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('whitesmoke')!.rgba, new RGBA(245, 245, 245, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('yellow')!.rgba, new RGBA(255, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('yellowgreen')!.rgba, new RGBA(154, 205, 50, 1));
				});

				test('hex-color', () => {
					// somewhat valid
					assert.deepStrictEqual(Color.Format.CSS.parse('#FFFFG0')!.rgba, new RGBA(255, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#FFFFg0')!.rgba, new RGBA(255, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#-FFF00')!.rgba, new RGBA(15, 255, 0, 1));

					// valid
					assert.deepStrictEqual(Color.Format.CSS.parse('#000000')!.rgba, new RGBA(0, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#FFFFFF')!.rgba, new RGBA(255, 255, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('#FF0000')!.rgba, new RGBA(255, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#00FF00')!.rgba, new RGBA(0, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#0000FF')!.rgba, new RGBA(0, 0, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('#FFFF00')!.rgba, new RGBA(255, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#00FFFF')!.rgba, new RGBA(0, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#FF00FF')!.rgba, new RGBA(255, 0, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('#C0C0C0')!.rgba, new RGBA(192, 192, 192, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('#808080')!.rgba, new RGBA(128, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#800000')!.rgba, new RGBA(128, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#808000')!.rgba, new RGBA(128, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#008000')!.rgba, new RGBA(0, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#800080')!.rgba, new RGBA(128, 0, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#008080')!.rgba, new RGBA(0, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#000080')!.rgba, new RGBA(0, 0, 128, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('#010203')!.rgba, new RGBA(1, 2, 3, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#040506')!.rgba, new RGBA(4, 5, 6, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#070809')!.rgba, new RGBA(7, 8, 9, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#0a0A0a')!.rgba, new RGBA(10, 10, 10, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#0b0B0b')!.rgba, new RGBA(11, 11, 11, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#0c0C0c')!.rgba, new RGBA(12, 12, 12, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#0d0D0d')!.rgba, new RGBA(13, 13, 13, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#0e0E0e')!.rgba, new RGBA(14, 14, 14, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#0f0F0f')!.rgba, new RGBA(15, 15, 15, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#a0A0a0')!.rgba, new RGBA(160, 160, 160, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#CFA')!.rgba, new RGBA(204, 255, 170, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('#CFA8')!.rgba, new RGBA(204, 255, 170, 0.533));
				});

				test('rgb()', () => {
					// somewhat valid / unusual
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(-255, 0, 0)')!.rgba, new RGBA(0, 0, 0));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(+255, 0, 0)')!.rgba, new RGBA(255, 0, 0));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(800, 0, 0)')!.rgba, new RGBA(255, 0, 0));

					// valid
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(0, 0, 0)')!.rgba, new RGBA(0, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(255, 255, 255)')!.rgba, new RGBA(255, 255, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(255, 0, 0)')!.rgba, new RGBA(255, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(0, 255, 0)')!.rgba, new RGBA(0, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(0, 0, 255)')!.rgba, new RGBA(0, 0, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(255, 255, 0)')!.rgba, new RGBA(255, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(0, 255, 255)')!.rgba, new RGBA(0, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(255, 0, 255)')!.rgba, new RGBA(255, 0, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(192, 192, 192)')!.rgba, new RGBA(192, 192, 192, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(128, 128, 128)')!.rgba, new RGBA(128, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(128, 0, 0)')!.rgba, new RGBA(128, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(128, 128, 0)')!.rgba, new RGBA(128, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(0, 128, 0)')!.rgba, new RGBA(0, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(128, 0, 128)')!.rgba, new RGBA(128, 0, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(0, 128, 128)')!.rgba, new RGBA(0, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(0, 0, 128)')!.rgba, new RGBA(0, 0, 128, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(1, 2, 3)')!.rgba, new RGBA(1, 2, 3, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(4, 5, 6)')!.rgba, new RGBA(4, 5, 6, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(7, 8, 9)')!.rgba, new RGBA(7, 8, 9, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(10, 10, 10)')!.rgba, new RGBA(10, 10, 10, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(11, 11, 11)')!.rgba, new RGBA(11, 11, 11, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(12, 12, 12)')!.rgba, new RGBA(12, 12, 12, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(13, 13, 13)')!.rgba, new RGBA(13, 13, 13, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(14, 14, 14)')!.rgba, new RGBA(14, 14, 14, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgb(15, 15, 15)')!.rgba, new RGBA(15, 15, 15, 1));
				});

				test('rgba()', () => {
					// somewhat valid / unusual
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 0, 0, 255)')!.rgba, new RGBA(0, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(-255, 0, 0, 1)')!.rgba, new RGBA(0, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(+255, 0, 0, 1)')!.rgba, new RGBA(255, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(800, 0, 0, 1)')!.rgba, new RGBA(255, 0, 0, 1));

					// alpha values
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(255, 0, 0, 0.2)')!.rgba, new RGBA(255, 0, 0, 0.2));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(255, 0, 0, 0.5)')!.rgba, new RGBA(255, 0, 0, 0.5));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(255, 0, 0, 0.75)')!.rgba, new RGBA(255, 0, 0, 0.75));

					// valid
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 0, 0, 1)')!.rgba, new RGBA(0, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(255, 255, 255, 1)')!.rgba, new RGBA(255, 255, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(255, 0, 0, 1)')!.rgba, new RGBA(255, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 255, 0, 1)')!.rgba, new RGBA(0, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 0, 255, 1)')!.rgba, new RGBA(0, 0, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(255, 255, 0, 1)')!.rgba, new RGBA(255, 255, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 255, 255, 1)')!.rgba, new RGBA(0, 255, 255, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(255, 0, 255, 1)')!.rgba, new RGBA(255, 0, 255, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(192, 192, 192, 1)')!.rgba, new RGBA(192, 192, 192, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(128, 128, 128, 1)')!.rgba, new RGBA(128, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(128, 0, 0, 1)')!.rgba, new RGBA(128, 0, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(128, 128, 0, 1)')!.rgba, new RGBA(128, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 128, 0, 1)')!.rgba, new RGBA(0, 128, 0, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(128, 0, 128, 1)')!.rgba, new RGBA(128, 0, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 128, 128, 1)')!.rgba, new RGBA(0, 128, 128, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(0, 0, 128, 1)')!.rgba, new RGBA(0, 0, 128, 1));

					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(1, 2, 3, 1)')!.rgba, new RGBA(1, 2, 3, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(4, 5, 6, 1)')!.rgba, new RGBA(4, 5, 6, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(7, 8, 9, 1)')!.rgba, new RGBA(7, 8, 9, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(10, 10, 10, 1)')!.rgba, new RGBA(10, 10, 10, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(11, 11, 11, 1)')!.rgba, new RGBA(11, 11, 11, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(12, 12, 12, 1)')!.rgba, new RGBA(12, 12, 12, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(13, 13, 13, 1)')!.rgba, new RGBA(13, 13, 13, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(14, 14, 14, 1)')!.rgba, new RGBA(14, 14, 14, 1));
					assert.deepStrictEqual(Color.Format.CSS.parse('rgba(15, 15, 15, 1)')!.rgba, new RGBA(15, 15, 15, 1));
				});
			});

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
