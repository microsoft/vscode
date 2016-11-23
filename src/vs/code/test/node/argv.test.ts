/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import { formatOptions } from 'vs/platform/environment/node/argv';

suite('formatOptions', () => {
	test('Text should display small columns correctly', () => {
		assert.equal(formatOptions({ 'foo': 'bar' }, 80), '  foo bar');
		assert.equal(
			formatOptions({
				'f': 'bar',
				'fo': 'ba',
				'foo': 'b'
			}, 80),
			'  f   bar\n' +
			'  fo  ba\n' +
			'  foo b');
	});

	test('Text should wrap', () => {
		assert.equal(
			formatOptions({
				'foo': (<any>'bar ').repeat(9)
			}, 40),
			'  foo bar bar bar bar bar bar bar bar\n' +
			'      bar');
	});

	test('Text should revert to the condensed view when the terminal is too narrow', () => {
		assert.equal(
			formatOptions({
				'foo': (<any>'bar ').repeat(9)
			}, 30),
			'  foo\n' +
			'      bar bar bar bar bar bar bar bar bar ');
	});
});
