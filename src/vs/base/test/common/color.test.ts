/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Color} from 'vs/base/common/color';
import * as assert from 'assert';

suite('Color', () => {

	test('rgba2hsla', function () {
		assert.deepEqual({ h: 0, s: 0, l: 0, a: 1 }, Color.fromRGBA({ r: 0, g: 0, b: 0, a: 1 }).toHSLA());
		assert.deepEqual({ h: 0, s: 0, l: 1, a: 1 }, Color.fromRGBA({ r: 255, g: 255, b: 255, a: 1 }).toHSLA());

		assert.deepEqual({ h: 0, s: 1, l: 0.5, a: 1 }, Color.fromRGBA({ r: 255, g: 0, b: 0, a: 1 }).toHSLA());
		assert.deepEqual({ h: 120, s: 1, l: 0.5, a: 1 }, Color.fromRGBA({ r: 0, g: 255, b: 0, a: 1 }).toHSLA());
		assert.deepEqual({ h: 240, s: 1, l: 0.5, a: 1 }, Color.fromRGBA({ r: 0, g: 0, b: 255, a: 1 }).toHSLA());

		assert.deepEqual({ h: 60, s: 1, l: 0.5, a: 1 }, Color.fromRGBA({ r: 255, g: 255, b: 0, a: 1 }).toHSLA());
		assert.deepEqual({ h: 180, s: 1, l: 0.5, a: 1 }, Color.fromRGBA({ r: 0, g: 255, b: 255, a: 1 }).toHSLA());
		assert.deepEqual({ h: 300, s: 1, l: 0.5, a: 1 }, Color.fromRGBA({ r: 255, g: 0, b: 255, a: 1 }).toHSLA());

		assert.deepEqual({ h: 0, s: 0, l: 0.753, a: 1 }, Color.fromRGBA({ r: 192, g: 192, b: 192, a: 1 }).toHSLA());

		assert.deepEqual({ h: 0, s: 0, l: 0.502, a: 1 }, Color.fromRGBA({ r: 128, g: 128, b: 128, a: 1 }).toHSLA());
		assert.deepEqual({ h: 0, s: 1, l: 0.251, a: 1 }, Color.fromRGBA({ r: 128, g: 0, b: 0, a: 1 }).toHSLA());
		assert.deepEqual({ h: 60, s: 1, l: 0.251, a: 1 }, Color.fromRGBA({ r: 128, g: 128, b: 0, a: 1 }).toHSLA());
		assert.deepEqual({ h: 120, s: 1, l: 0.251, a: 1 }, Color.fromRGBA({ r: 0, g: 128, b: 0, a: 1 }).toHSLA());
		assert.deepEqual({ h: 300, s: 1, l: 0.251, a: 1 }, Color.fromRGBA({ r: 128, g: 0, b: 128, a: 1 }).toHSLA());
		assert.deepEqual({ h: 180, s: 1, l: 0.251, a: 1 }, Color.fromRGBA({ r: 0, g: 128, b: 128, a: 1 }).toHSLA());
		assert.deepEqual({ h: 240, s: 1, l: 0.251, a: 1 }, Color.fromRGBA({ r: 0, g: 0, b: 128, a: 1 }).toHSLA());
	});

	test('hsla2rgba', function () {
		assert.deepEqual({ r: 0, g: 0, b: 0, a: 1 }, Color.fromHSLA({ h: 0, s: 0, l: 0, a: 1 }).toRGBA());
		assert.deepEqual({ r: 255, g: 255, b: 255, a: 1 }, Color.fromHSLA({ h: 0, s: 0, l: 1, a: 1 }).toRGBA());

		assert.deepEqual({ r: 255, g: 0, b: 0, a: 1 }, Color.fromHSLA({ h: 0, s: 1, l: 0.5, a: 1 }).toRGBA());
		assert.deepEqual({ r: 0, g: 255, b: 0, a: 1 }, Color.fromHSLA({ h: 120, s: 1, l: 0.5, a: 1 }).toRGBA());
		assert.deepEqual({ r: 0, g: 0, b: 255, a: 1 }, Color.fromHSLA({ h: 240, s: 1, l: 0.5, a: 1 }).toRGBA());

		assert.deepEqual({ r: 255, g: 255, b: 0, a: 1 }, Color.fromHSLA({ h: 60, s: 1, l: 0.5, a: 1 }).toRGBA());
		assert.deepEqual({ r: 0, g: 255, b: 255, a: 1 }, Color.fromHSLA({ h: 180, s: 1, l: 0.5, a: 1 }).toRGBA());
		assert.deepEqual({ r: 255, g: 0, b: 255, a: 1 }, Color.fromHSLA({ h: 300, s: 1, l: 0.5, a: 1 }).toRGBA());

		assert.deepEqual({ r: 192, g: 192, b: 192, a: 1 }, Color.fromHSLA({ h: 0, s: 0, l: 0.753, a: 1 }).toRGBA());

		assert.deepEqual({ r: 128, g: 128, b: 128, a: 1 }, Color.fromHSLA({ h: 0, s: 0, l: 0.502, a: 1 }).toRGBA());
		assert.deepEqual({ r: 128, g: 0, b: 0, a: 1 }, Color.fromHSLA({ h: 0, s: 1, l: 0.251, a: 1 }).toRGBA());
		assert.deepEqual({ r: 128, g: 128, b: 0, a: 1 }, Color.fromHSLA({ h: 60, s: 1, l: 0.251, a: 1 }).toRGBA());
		assert.deepEqual({ r: 0, g: 128, b: 0, a: 1 }, Color.fromHSLA({ h: 120, s: 1, l: 0.251, a: 1 }).toRGBA());
		assert.deepEqual({ r: 128, g: 0, b: 128, a: 1 }, Color.fromHSLA({ h: 300, s: 1, l: 0.251, a: 1 }).toRGBA());
		assert.deepEqual({ r: 0, g: 128, b: 128, a: 1 }, Color.fromHSLA({ h: 180, s: 1, l: 0.251, a: 1 }).toRGBA());
		assert.deepEqual({ r: 0, g: 0, b: 128, a: 1 }, Color.fromHSLA({ h: 240, s: 1, l: 0.251, a: 1 }).toRGBA());
	});

	test('hex2rgba', function () {
		assert.deepEqual({ r: 0, g: 0, b: 0, a: 1 }, Color.fromHex('#000000').toRGBA());
		assert.deepEqual({ r: 255, g: 255, b: 255, a: 1 }, Color.fromHex('#FFFFFF').toRGBA());

		assert.deepEqual({ r: 255, g: 0, b: 0, a: 1 }, Color.fromHex('#FF0000').toRGBA());
		assert.deepEqual({ r: 0, g: 255, b: 0, a: 1 }, Color.fromHex('#00FF00').toRGBA());
		assert.deepEqual({ r: 0, g: 0, b: 255, a: 1 }, Color.fromHex('#0000FF').toRGBA());

		assert.deepEqual({ r: 255, g: 255, b: 0, a: 1 }, Color.fromHex('#FFFF00').toRGBA());
		assert.deepEqual({ r: 0, g: 255, b: 255, a: 1 }, Color.fromHex('#00FFFF').toRGBA());
		assert.deepEqual({ r: 255, g: 0, b: 255, a: 1 }, Color.fromHex('#FF00FF').toRGBA());

		assert.deepEqual({ r: 192, g: 192, b: 192, a: 1 }, Color.fromHex('#C0C0C0').toRGBA());

		assert.deepEqual({ r: 128, g: 128, b: 128, a: 1 }, Color.fromHex('#808080').toRGBA());
		assert.deepEqual({ r: 128, g: 0, b: 0, a: 1 }, Color.fromHex('#800000').toRGBA());
		assert.deepEqual({ r: 128, g: 128, b: 0, a: 1 }, Color.fromHex('#808000').toRGBA());
		assert.deepEqual({ r: 0, g: 128, b: 0, a: 1 }, Color.fromHex('#008000').toRGBA());
		assert.deepEqual({ r: 128, g: 0, b: 128, a: 1 }, Color.fromHex('#800080').toRGBA());
		assert.deepEqual({ r: 0, g: 128, b: 128, a: 1 }, Color.fromHex('#008080').toRGBA());
		assert.deepEqual({ r: 0, g: 0, b: 128, a: 1 }, Color.fromHex('#000080').toRGBA());
	});

	test('isLighterColor', function () {
		let color1 = Color.fromHSLA({ h: 60, s: 1, l: 0.5, a: 1 }), color2 = Color.fromHSLA({ h: 0, s: 0, l: 0.753, a: 1 });

		assert.ok(color1.isLighterThan(color2));

		// Abyss theme
		assert.ok(Color.fromHex('#770811').isLighterThan(Color.fromHex('#000c18')));
	});

	test('getLighterColor', function () {
		let color1 = Color.fromHSLA({ h: 60, s: 1, l: 0.5, a: 1 }), color2 = Color.fromHSLA({ h: 0, s: 0, l: 0.753, a: 1 });

		assert.deepEqual(color1.toHSLA(), Color.getLighterColor(color1, color2).toHSLA());
		assert.deepEqual({ h: 0, s: 0, l: 0.914, a: 1 }, Color.getLighterColor(color2, color1).toHSLA());
		assert.deepEqual({ h: 0, s: 0, l: 0.851, a: 1 }, Color.getLighterColor(color2, color1, 0.3).toHSLA());
		assert.deepEqual({ h: 0, s: 0, l: 0.98, a: 1 }, Color.getLighterColor(color2, color1, 0.7).toHSLA());
		assert.deepEqual({ h: 0, s: 0, l: 1, a: 1 }, Color.getLighterColor(color2, color1, 1).toHSLA());

	});

	test('isDarkerColor', function () {
		let color1 = Color.fromHSLA({ h: 60, s: 1, l: 0.5, a: 1 }), color2 = Color.fromHSLA({ h: 0, s: 0, l: 0.753, a: 1 });

		assert.ok(color2.isDarkerThan(color1));

	});

	test('getDarkerColor', function () {
		let color1 = Color.fromHSLA({ h: 60, s: 1, l: 0.5, a: 1 }), color2 = Color.fromHSLA({ h: 0, s: 0, l: 0.753, a: 1 });

		assert.deepEqual(color2.toHSLA(), Color.getDarkerColor(color2, color1).toHSLA());
		assert.deepEqual({ h: 60, s: 1, l: 0.392, a: 1 }, Color.getDarkerColor(color1, color2).toHSLA());
		assert.deepEqual({ h: 60, s: 1, l: 0.435, a: 1 }, Color.getDarkerColor(color1, color2, 0.3).toHSLA());
		assert.deepEqual({ h: 60, s: 1, l: 0.349, a: 1 }, Color.getDarkerColor(color1, color2, 0.7).toHSLA());
		assert.deepEqual({ h: 60, s: 1, l: 0.284, a: 1 }, Color.getDarkerColor(color1, color2, 1).toHSLA());

		// Abyss theme
		assert.deepEqual({ h: 355, s: 0.874, l: 0.157, a: 1 }, Color.getDarkerColor(Color.fromHex('#770811'), Color.fromHex('#000c18'), 0.4).toHSLA());
	});

	test('luminosity', function () {
		assert.deepEqual(0, Color.fromRGBA({ r: 0, g: 0, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(1, Color.fromRGBA({ r: 255, g: 255, b: 255, a: 1 }).getLuminosity());

		assert.deepEqual(0.2126, Color.fromRGBA({ r: 255, g: 0, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.7152, Color.fromRGBA({ r: 0, g: 255, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.0722, Color.fromRGBA({ r: 0, g: 0, b: 255, a: 1 }).getLuminosity());

		assert.deepEqual(0.9278, Color.fromRGBA({ r: 255, g: 255, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.7874, Color.fromRGBA({ r: 0, g: 255, b: 255, a: 1 }).getLuminosity());
		assert.deepEqual(0.2848, Color.fromRGBA({ r: 255, g: 0, b: 255, a: 1 }).getLuminosity());

		assert.deepEqual(0.5271, Color.fromRGBA({ r: 192, g: 192, b: 192, a: 1 }).getLuminosity());

		assert.deepEqual(0.2159, Color.fromRGBA({ r: 128, g: 128, b: 128, a: 1 }).getLuminosity());
		assert.deepEqual(0.0459, Color.fromRGBA({ r: 128, g: 0, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.2003, Color.fromRGBA({ r: 128, g: 128, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.1544, Color.fromRGBA({ r: 0, g: 128, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.0615, Color.fromRGBA({ r: 128, g: 0, b: 128, a: 1 }).getLuminosity());
		assert.deepEqual(0.17, Color.fromRGBA({ r: 0, g: 128, b: 128, a: 1 }).getLuminosity());
		assert.deepEqual(0.0156, Color.fromRGBA({ r: 0, g: 0, b: 128, a: 1 }).getLuminosity());
	});

	test('contrast', function () {
		assert.deepEqual(0, Color.fromRGBA({ r: 0, g: 0, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(1, Color.fromRGBA({ r: 255, g: 255, b: 255, a: 1 }).getLuminosity());

		assert.deepEqual(0.2126, Color.fromRGBA({ r: 255, g: 0, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.7152, Color.fromRGBA({ r: 0, g: 255, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.0722, Color.fromRGBA({ r: 0, g: 0, b: 255, a: 1 }).getLuminosity());

		assert.deepEqual(0.9278, Color.fromRGBA({ r: 255, g: 255, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.7874, Color.fromRGBA({ r: 0, g: 255, b: 255, a: 1 }).getLuminosity());
		assert.deepEqual(0.2848, Color.fromRGBA({ r: 255, g: 0, b: 255, a: 1 }).getLuminosity());

		assert.deepEqual(0.5271, Color.fromRGBA({ r: 192, g: 192, b: 192, a: 1 }).getLuminosity());

		assert.deepEqual(0.2159, Color.fromRGBA({ r: 128, g: 128, b: 128, a: 1 }).getLuminosity());
		assert.deepEqual(0.0459, Color.fromRGBA({ r: 128, g: 0, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.2003, Color.fromRGBA({ r: 128, g: 128, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.1544, Color.fromRGBA({ r: 0, g: 128, b: 0, a: 1 }).getLuminosity());
		assert.deepEqual(0.0615, Color.fromRGBA({ r: 128, g: 0, b: 128, a: 1 }).getLuminosity());
		assert.deepEqual(0.17, Color.fromRGBA({ r: 0, g: 128, b: 128, a: 1 }).getLuminosity());
		assert.deepEqual(0.0156, Color.fromRGBA({ r: 0, g: 0, b: 128, a: 1 }).getLuminosity());
	});

});
