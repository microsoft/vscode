/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { contextIndentationFromText } from '../parseBlock';

suite('Indentation', function () {
	test('single line -> only current', function () {
		assert.deepStrictEqual(contextIndentationFromText('x', 0, 'language'), {
			prev: undefined,
			current: 0,
			next: undefined,
		});
	});
	test('single line with line after -> only current & next', function () {
		assert.deepStrictEqual(contextIndentationFromText('x\ny', 0, 'language'), {
			prev: undefined,
			current: 0,
			next: 0,
		});
	});
	test('after indent -> only current & prev', function () {
		assert.deepStrictEqual(contextIndentationFromText('x\n y', 4, 'language'), {
			prev: 0,
			current: 1,
			next: undefined,
		});
	});
	test('after indent but before text -> only current from line above', function () {
		assert.deepStrictEqual(contextIndentationFromText('x\n y', 3, 'language'), {
			prev: undefined,
			current: 0,
			next: undefined,
		});
	});
});
