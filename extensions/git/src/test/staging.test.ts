/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { normalizeEOL, EOL_LF, EOL_CRLF } from '../eol';

suite('staging', () => {
	suite('normalizeEOL', () => {
		test('converts LF to CRLF', () => {
			const result = normalizeEOL('line1\nline2\nline3\n', EOL_CRLF);
			assert.strictEqual(result, 'line1\r\nline2\r\nline3\r\n');
		});

		test('converts CRLF to LF', () => {
			const result = normalizeEOL('line1\r\nline2\r\nline3\r\n', EOL_LF);
			assert.strictEqual(result, 'line1\nline2\nline3\n');
		});

		test('LF to CRLF does not double-convert existing CRLF', () => {
			const result = normalizeEOL('line1\r\nline2\nline3\r\n', EOL_CRLF);
			assert.strictEqual(result, 'line1\r\nline2\r\nline3\r\n');
			assert.ok(!result.includes('\r\r\n'), 'Should not double-convert CRLF');
		});

		test('CRLF to LF with mixed line endings', () => {
			const result = normalizeEOL('line1\r\nline2\nline3\r\n', EOL_LF);
			assert.strictEqual(result, 'line1\nline2\nline3\n');
		});

		test('no-op when text already has target LF endings', () => {
			const input = 'line1\nline2\nline3\n';
			assert.strictEqual(normalizeEOL(input, EOL_LF), input);
		});

		test('no-op when text already has target CRLF endings', () => {
			const input = 'line1\r\nline2\r\nline3\r\n';
			assert.strictEqual(normalizeEOL(input, EOL_CRLF), input);
		});

		test('empty string', () => {
			assert.strictEqual(normalizeEOL('', EOL_LF), '');
			assert.strictEqual(normalizeEOL('', EOL_CRLF), '');
		});

		test('single line without newline', () => {
			assert.strictEqual(normalizeEOL('hello', EOL_LF), 'hello');
			assert.strictEqual(normalizeEOL('hello', EOL_CRLF), 'hello');
		});

		test('preserves content when normalizing', () => {
			const result = normalizeEOL('function foo() {\n  return bar;\n}\n', EOL_CRLF);
			assert.strictEqual(result, 'function foo() {\r\n  return bar;\r\n}\r\n');
		});

		test('CRLF bytes in result match \\r\\n exactly', () => {
			const result = normalizeEOL('a\nb\nc\n', EOL_CRLF);
			const bytes = Buffer.from(result);
			let crlfCount = 0;
			for (let i = 0; i < bytes.length - 1; i++) {
				if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) {
					crlfCount++;
				}
			}
			assert.strictEqual(crlfCount, 3, 'Should have exactly 3 CRLF sequences');
		});
	});

	suite('EOL normalization integration', () => {
		test('simulated staging: original LF, modified CRLF → result LF', () => {
			const modifiedText = 'MODIFIED LINE\r\n';
			const normalized = normalizeEOL(modifiedText, EOL_LF);
			assert.strictEqual(normalized, 'MODIFIED LINE\n');
			assert.ok(!normalized.includes('\r'), 'Should not contain \\r');
		});

		test('simulated staging: original CRLF, modified LF → result CRLF', () => {
			const modifiedText = 'MODIFIED LINE\n';
			const normalized = normalizeEOL(modifiedText, EOL_CRLF);
			assert.strictEqual(normalized, 'MODIFIED LINE\r\n');
		});

		test('simulated staging: multiple modified lines normalized', () => {
			const modifiedChunk = 'mod1\nmod2\nmod3\n';
			const normalized = normalizeEOL(modifiedChunk, EOL_CRLF);
			assert.strictEqual(normalized, 'mod1\r\nmod2\r\nmod3\r\n');
		});

		test('whole-file simulation: CRLF original + LF modified = CRLF result', () => {
			const unchangedPart1 = 'line1\r\n';
			const unchangedPart2 = 'line3\r\nline4\r\n';

			const modifiedPart = 'CHANGED\n';
			const normalizedModified = normalizeEOL(modifiedPart, EOL_CRLF);

			const result = unchangedPart1 + normalizedModified + unchangedPart2;
			assert.strictEqual(result, 'line1\r\nCHANGED\r\nline3\r\nline4\r\n');

			const bareLfCount = (result.replace(/\r\n/g, '').match(/\n/g) || []).length;
			assert.strictEqual(bareLfCount, 0, 'Should not contain bare LF');
		});
	});
});
