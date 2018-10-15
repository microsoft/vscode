/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { fixRegexEndingPattern } from 'vs/workbench/services/search/node/ripgrepTextSearchEH';

suite('RipgrepTextSearch - etc', () => {
	test('fixRegexEndingPattern', () => {
		function testFixRegexEndingPattern([input, expectedResult]: string[]): void {
			assert.equal(fixRegexEndingPattern(input), expectedResult);
		}

		[
			['foo', 'foo'],
			['', ''],
			['^foo.*bar\\s+', '^foo.*bar\\s+'],
			['foo$', 'foo\\r?$'],
			['$', '\\r?$'],
			['foo\\$', 'foo\\$'],
			['foo\\\\$', 'foo\\\\\\r?$'],
		].forEach(testFixRegexEndingPattern);
	});

	test('fixRegexEndingPattern', () => {
		function testFixRegexEndingPattern([input, expectedResult]: string[]): void {
			assert.equal(fixRegexEndingPattern(input), expectedResult);
		}

		[
			['foo', 'foo'],
			['', ''],
			['^foo.*bar\\s+', '^foo.*bar\\s+'],
			['foo$', 'foo\\r?$'],
			['$', '\\r?$'],
			['foo\\$', 'foo\\$'],
			['foo\\\\$', 'foo\\\\\\r?$'],
		].forEach(testFixRegexEndingPattern);
	});
});