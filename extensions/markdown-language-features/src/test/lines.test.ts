/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';

import { toLineData } from '../lines';

suite('markdown.toLineData', () => {
	test('Empty Document', () => {
		let data = toLineData('');

		assert.deepStrictEqual(
			data,
			[
				{
					lineNo: 0,
					offset: 0,
					text: '',
					separator: ''
				}
			]
		);
	});

	test('Unix new lines', () => {
		let data = toLineData('a\nb');

		assert.deepStrictEqual(
			data,
			[
				{
					lineNo: 0,
					offset: 0,
					text: 'a',
					separator: '\n'
				},
				{
					lineNo: 1,
					offset: 2,
					text: 'b',
					separator: ''
				}
			]
		);
	});

	test('Win new lines', () => {
		let data = toLineData('a\r\nb');

		assert.deepStrictEqual(
			data,
			[
				{
					lineNo: 0,
					offset: 0,
					text: 'a',
					separator: '\r\n'
				},
				{
					lineNo: 1,
					offset: 3,
					text: 'b',
					separator: ''
				}
			]
		);
	});
});
