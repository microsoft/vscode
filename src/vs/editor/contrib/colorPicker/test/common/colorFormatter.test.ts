/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Color, RGBA, HSLA } from 'vs/base/common/color';
import { RGBFormatter, HexFormatter, HSLFormatter } from 'vs/editor/contrib/colorPicker/common/colorFormatter';

suite('ColorFormatter', () => {
	test('documentation', () => {
		const color = new Color(new RGBA(255, 127, 0));

		const rgb = new RGBFormatter();
		assert.equal(rgb.format(color), 'rgb(255, 127, 0)');

		const hex = new HexFormatter();
		assert.equal(hex.format(color), '#FF7F00');

		const hsl = new HSLFormatter();
		assert.equal(hsl.format(color), 'hsl(30, 100%, 50%)');
	});

	test('bug#32323', () => {
		const color = new Color(new HSLA(121, 0.45, 0.29, 0.61));
		const rgba = color.rgba;
		const color2 = new Color(new RGBA(rgba.r, rgba.g, rgba.b, rgba.a));
		const hsla = new HSLFormatter();
		assert.equal(hsla.format(color2), 'hsla(121, 45%, 29%, 0.61)');
	});
});