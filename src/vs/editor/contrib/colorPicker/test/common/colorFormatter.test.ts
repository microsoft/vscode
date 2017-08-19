/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Color, RGBA } from 'vs/base/common/color';
import { ColorFormatter } from 'vs/editor/contrib/colorPicker/common/colorFormatter';

suite('ColorFormatter', () => {
	test('empty formatter', () => {
		const formatter = new ColorFormatter('');
		assert.equal(formatter.supportsTransparency, false);

		assert.equal(formatter.format(Color.white), '');
		assert.equal(formatter.format(Color.transparent), '');
	});

	test('no placeholder', () => {
		const formatter = new ColorFormatter('hello');
		assert.equal(formatter.supportsTransparency, false);

		assert.equal(formatter.format(Color.white), 'hello');
		assert.equal(formatter.format(Color.transparent), 'hello');
	});

	test('supportsTransparency', () => {
		const formatter = new ColorFormatter('hello');
		assert.equal(formatter.supportsTransparency, false);

		const transparentFormatter = new ColorFormatter('{alpha}');
		assert.equal(transparentFormatter.supportsTransparency, true);
	});

	test('default number format is float', () => {
		const formatter = new ColorFormatter('{red}');
		assert.equal(formatter.format(Color.red), '1');
	});

	test('default decimal range is [0-255]', () => {
		const formatter = new ColorFormatter('{red:d}');
		assert.equal(formatter.format(Color.red), '255');
	});

	test('default hex range is [0-FF]', () => {
		const formatter = new ColorFormatter('{red:X}');
		assert.equal(formatter.format(Color.red), 'FF');
	});

	test('documentation', () => {
		const color = new Color(new RGBA(255, 127, 0));

		const rgb = new ColorFormatter('rgb({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]})');
		assert.equal(rgb.format(color), 'rgb(255, 127, 0)');

		const rgba = new ColorFormatter('rgba({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]}, {alpha})');
		assert.equal(rgba.format(color), 'rgba(255, 127, 0, 1)');

		const hex = new ColorFormatter('#{red:X}{green:X}{blue:X}');
		assert.equal(hex.format(color), '#FF7F00');

		const hsla = new ColorFormatter('hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%, {alpha})');
		assert.equal(hsla.format(color), 'hsla(30, 100%, 50%, 1)');
	});
});