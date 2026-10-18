/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRegexValidationErrorMessage } from '../../browser/findWidget.js';

suite('FindWidget - regex validation message', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getNativeMessage(pattern: string): string {
		try {
			new RegExp(pattern, 'gu');
		} catch (e) {
			return e.message;
		}
		assert.fail(`Expected pattern to be invalid: ${pattern}`);
	}

	test('valid pattern has no message', () => {
		assert.strictEqual(getRegexValidationErrorMessage('a(b)c', 'gu'), null);
		assert.strictEqual(getRegexValidationErrorMessage('x'.repeat(1000), 'gu'), null);
	});

	test('short pattern keeps the native message', () => {
		assert.strictEqual(getRegexValidationErrorMessage('a(', 'gu'), getNativeMessage('a('));
	});

	test('long pattern shows the reason and the part of the pattern around the error (#139667)', () => {
		const pattern = 'abc|'.repeat(1000) + 'a{12|' + 'def|'.repeat(1000);
		const message = getRegexValidationErrorMessage(pattern, 'gu')!;

		assert.ok(message.length < 150, `message too long: ${message.length}`);
		assert.ok(message.startsWith('Invalid regular expression: Incomplete quantifier: …'), message);
		assert.ok(message.includes('abc|a{12|'), message);
		assert.ok(message.endsWith('…'), message);
	});

	test('error at the start of a long pattern', () => {
		const pattern = '*' + 'abc|'.repeat(1000);
		const message = getRegexValidationErrorMessage(pattern, 'gu')!;

		assert.ok(message.length < 150, `message too long: ${message.length}`);
		assert.ok(message.includes('Nothing to repeat: *abc|'), message);
	});

	test('error at the end of a long pattern', () => {
		const pattern = 'abc|'.repeat(1000) + '(abc';
		const message = getRegexValidationErrorMessage(pattern, 'gu')!;

		assert.ok(message.length < 150, `message too long: ${message.length}`);
		assert.ok(message.includes('Unterminated group: …'), message);
		assert.ok(message.endsWith('abc|(abc'), message);
	});

	test('pattern from the issue points at the missing `}`', () => {
		const pattern = `https?://(?:(?:www.|)youtube.com|youtu.be)/(?:channel/|embed/|playlist?list=|watch?v=|v/|)[-a-zA-Z0-9?&=]|/archives/list/[^@/]+@[^/]/message/[^/]/[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12|pkg:github/[^/]/[^/](?:@|/commit/)[0-9a-f]ID: [0-9a-f]{40|"sig": "[0-9a-f]*"([A-Za-z])\\g{-1}{3,}`;
		const message = getRegexValidationErrorMessage(pattern, 'gu')!;

		assert.ok(message.startsWith('Invalid regular expression: Incomplete quantifier: '), message);
		assert.ok(message.includes('[0-9a-fA-F]{12|'), message);
	});

	test('very long pattern skips locating the error and shows the start of the pattern', () => {
		const pattern = 'abc|'.repeat(30000) + '(abc';
		const message = getRegexValidationErrorMessage(pattern, 'gu')!;

		assert.ok(message.length < 150, `message too long: ${message.length}`);
		assert.ok(message.startsWith('Invalid regular expression: Unterminated group: abc|abc|'), message);
		assert.ok(message.endsWith('…'), message);
	});
});
