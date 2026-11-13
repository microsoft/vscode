/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TextLength } from '../../../common/core/text/textLength.js';

suite('TextLength', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ofText counts UTF-16 code units', () => {
		assert.deepStrictEqual([
			TextLength.ofText(''),
			TextLength.ofText('abc'),
			TextLength.ofText('😀'),
			TextLength.ofText('a😀𝄞b'),
			TextLength.ofText('e\u0301'),
			TextLength.ofText('\ud83d'),
			TextLength.ofText('\ude00'),
		], [
			new TextLength(0, 0),
			new TextLength(0, 3),
			new TextLength(0, 2),
			new TextLength(0, 6),
			new TextLength(0, 2),
			new TextLength(0, 1),
			new TextLength(0, 1),
		]);
	});

	test('ofText counts UTF-16 columns after the last newline', () => {
		assert.deepStrictEqual([
			TextLength.ofText('😀\nx'),
			TextLength.ofText('x\n😀𝄞'),
			TextLength.ofText('😀\n𝄞\n'),
		], [
			new TextLength(1, 1),
			new TextLength(1, 4),
			new TextLength(2, 0),
		]);
	});
});
