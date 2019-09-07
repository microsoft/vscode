/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';

import { toTextLines, createTextLine } from '../lines';

suite('markdown.toLineData', () => {
	test('Empty Document', () => {
		let data = toTextLines('');

		assert.deepStrictEqual(
			data,
			[ createTextLine(0, 0, '', '') ]
		);
	});

	test('Unix new lines', () => {
		let data = toTextLines('a\nb');

		assert.deepStrictEqual(
			data,
			[
				createTextLine(0, 0, 'a', '\n'),
				createTextLine(1, 2, 'b', '')
			]
		);
	});

	test('Win new lines', () => {
		let data = toTextLines('a\r\nb');

		assert.deepStrictEqual(
			data,
			[
				createTextLine(0, 0, 'a', '\r\n'),
				createTextLine(1, 3, 'b', '')
			]
		);
	});
});
