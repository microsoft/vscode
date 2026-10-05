/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { normalizeCommentDashes } from '../generate-protocol.mjs';

suite('codex protocol comment normalization', () => {
	test('normalizes the generated user-verification documentation', () => {
		const source = [
			'export type UserVerificationVerifyParams = {',
			'\t/**',
			'\t * Unpadded base64url encoding of 1\u20134096 challenge bytes.',
			'\t */',
			'\tchallenge: string,',
			'\t/**',
			'\t * Display context already approved by the UI; 1\u2013256 UTF-8 bytes.',
			'\t */',
			'\ttitle: string,',
			'};',
		].join('\n');
		assert.strictEqual(normalizeCommentDashes(source), source.replace(/\u2013/g, '-'));
	});

	test('normalizes line, block, inline and end-of-file comments without changing line endings', () => {
		const source = [
			'// Leading 1\u20132',
			'export type Range = { /* Inline 1\u20132 */',
			'\tvalue: /* Before a type 1\u20132 */ string, /* After a comma 1\u20132 */',
			'}; // Trailing 1\u20132',
			'/* End of file 1\u20132 */',
		].join('\r\n');
		assert.strictEqual(normalizeCommentDashes(source), source.replace(/\u2013/g, '-'));
	});

	test('preserves quoted literals containing en dashes and comment delimiters', () => {
		const source = [
			'export type Single = \'/* 1\u20132 */\';',
			'export type Double = "// 1\u20132";',
			'export type Escaped = "\\\" /* 1\u20132 */";',
			'export type PlainTemplate = `/* 1\u20132 */`;',
			'export type Template = `${string}/* 1\u20132 */${number}// 1\u20132`;',
			'const pattern = /[/*]\u2013[*/]/;',
		].join('\n');
		assert.strictEqual(normalizeCommentDashes(source), source);
	});

	test('normalizes actual comments inside template expressions but preserves template text', () => {
		const source = 'const value = `/* 1\u20132 */ ${ /* Comment 1\u20132 */ 1 } // 1\u20132`;';
		assert.strictEqual(normalizeCommentDashes(source), source.replace('Comment 1\u20132', 'Comment 1-2'));
	});

	test('is idempotent and leaves other punctuation unchanged', () => {
		const source = '// Range 1\u20132; other punctuation \u2014\u2026\nexport type Range = "1\u20132";';
		const expected = source.replace('Range 1\u20132', 'Range 1-2');
		assert.strictEqual(normalizeCommentDashes(normalizeCommentDashes(source)), expected);
	});
});
