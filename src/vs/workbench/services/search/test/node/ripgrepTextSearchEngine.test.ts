/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { unicodeEscapesToPCRE2, fixRegexEndingPattern } from 'vs/workbench/services/search/node/ripgrepTextSearchEngine';

suite('RipgrepTextSearchEngine', () => {
	test('unicodeEscapesToPCRE2', async () => {
		assert.equal(unicodeEscapesToPCRE2('\\u1234'), '\\x{1234}');
		assert.equal(unicodeEscapesToPCRE2('\\u1234\\u0001'), '\\x{1234}\\x{0001}');
		assert.equal(unicodeEscapesToPCRE2('foo\\u1234bar'), 'foo\\x{1234}bar');
		assert.equal(unicodeEscapesToPCRE2('\\\\\\u1234'), '\\\\\\x{1234}');
		assert.equal(unicodeEscapesToPCRE2('foo\\\\\\u1234'), 'foo\\\\\\x{1234}');

		assert.equal(unicodeEscapesToPCRE2('\\u123'), '\\u123');
		assert.equal(unicodeEscapesToPCRE2('\\u12345'), '\\u12345');
		assert.equal(unicodeEscapesToPCRE2('\\\\u12345'), '\\\\u12345');
		assert.equal(unicodeEscapesToPCRE2('foo'), 'foo');
		assert.equal(unicodeEscapesToPCRE2(''), '');
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
