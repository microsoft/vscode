/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Color, RGBA, HSLA } from 'vs/base/common/color';
import { IColor } from 'vs/editor/common/modes';
import { ColorFormatter } from 'vs/editor/contrib/colorPicker/common/colorFormatter';

function convert2IColor(color: Color): IColor {
	return {
		red: color.rgba.r / 255,
		green: color.rgba.g / 255,
		blue: color.rgba.b / 255,
		alpha: color.rgba.a
	};
}
suite('ColorFormatter', () => {
	test('empty formatter', () => {
		const formatter = new ColorFormatter('');
		assert.equal(formatter.supportsTransparency, false);

		assert.equal(formatter.format(convert2IColor(Color.white)), '');
		assert.equal(formatter.format(convert2IColor(Color.transparent)), '');
	});

	test('no placeholder', () => {
		const formatter = new ColorFormatter('hello');
		assert.equal(formatter.supportsTransparency, false);

		assert.equal(formatter.format(convert2IColor(Color.white)), 'hello');
		assert.equal(formatter.format(convert2IColor(Color.transparent)), 'hello');
	});

	test('supportsTransparency', () => {
		const formatter = new ColorFormatter('hello');
		assert.equal(formatter.supportsTransparency, false);

		const transparentFormatter = new ColorFormatter('{alpha}');
		assert.equal(transparentFormatter.supportsTransparency, true);
	});

	test('default number format is float', () => {
		const formatter = new ColorFormatter('{red}');
		assert.equal(formatter.format(convert2IColor(Color.red)), '1');
	});

	test('default decimal range is [0-255]', () => {
		const formatter = new ColorFormatter('{red:d}');
		assert.equal(formatter.format(convert2IColor(Color.red)), '255');
	});

	test('default hex range is [0-FF]', () => {
		const formatter = new ColorFormatter('{red:X}');
		assert.equal(formatter.format(convert2IColor(Color.red)), 'FF');
	});

	test('documentation', () => {
		const color = new Color(new RGBA(255, 127, 0));

		const rgb = new ColorFormatter('rgb({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]})');
		assert.equal(rgb.format(convert2IColor(color)), 'rgb(255, 127, 0)');

		const rgba = new ColorFormatter('rgba({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]}, {alpha})');
		assert.equal(rgba.format(convert2IColor(color)), 'rgba(255, 127, 0, 1)');

		const hex = new ColorFormatter('#{red:X}{green:X}{blue:X}');
		assert.equal(hex.format(convert2IColor(color)), '#FF7F00');

		const hsla = new ColorFormatter('hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%, {alpha})');
		assert.equal(hsla.format(convert2IColor(color)), 'hsla(30, 100%, 50%, 1)');
	});

	test('bug#32323', () => {
		const color = new Color(new HSLA(121, 0.45, 0.29, 0.61));
		const rgba = color.rgba;
		const color2 = new Color(new RGBA(rgba.r, rgba.g, rgba.b, rgba.a));
		const hsla = new ColorFormatter('hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%, {alpha})');
		assert.equal(hsla.format(convert2IColor(color2)), 'hsla(121, 45%, 29%, 0.61)');
	});
});