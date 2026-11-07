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

	/**
	 * The message is only shortened when the engine reports errors as
	 * `Invalid regular expression: /<pattern>/<flags>: <reason>` (V8),
	 * other engines keep their native message.
	 */
	function expectedMessage(pattern: string, reason: string, snippet: string): string {
		const nativeMessage = getNativeMessage(pattern);
		if (!nativeMessage.includes(`/${pattern}/gu: `)) {
			return nativeMessage;
		}
		return `Invalid regular expression: ${reason}: ${snippet}`;
	}

	function assertMessages(cases: { pattern: string; reason: string; snippet: string }[]): void {
		assert.deepStrictEqual(
			cases.map(c => getRegexValidationErrorMessage(c.pattern, 'gu')),
			cases.map(c => expectedMessage(c.pattern, c.reason, c.snippet))
		);
	}

	test('valid patterns have no message', () => {
		assert.deepStrictEqual(
			[getRegexValidationErrorMessage('a(b)c', 'gu'), getRegexValidationErrorMessage('x'.repeat(1000), 'gu')],
			[null, null]
		);
	});

	test('short patterns keep the native message', () => {
		assert.deepStrictEqual(
			[getRegexValidationErrorMessage('a(', 'gu'), getRegexValidationErrorMessage('a{12', 'gu')],
			[getNativeMessage('a('), getNativeMessage('a{12')]
		);
	});

	test('long patterns show the reason and the part of the pattern around the error (#139667)', () => {
		const filler = 'abc|'.repeat(100);
		assertMessages([
			// error in the middle
			{ pattern: filler + 'a{12|' + filler, reason: 'Incomplete quantifier', snippet: '…' + 'abc|'.repeat(12) + 'a{12|abc|abc…' },
			// error at the start
			{ pattern: '*' + filler, reason: 'Nothing to repeat', snippet: '*abc|abc|ab…' },
			// error at the end
			{ pattern: filler + 'abc(de', reason: 'Unterminated group', snippet: '…' + 'abc|'.repeat(11) + 'abc(de' },
		]);
	});

	test('completed character classes, groups and quantifiers before the error are skipped', () => {
		assertMessages([
			{ pattern: '[' + 'a'.repeat(200) + ']' + 'b'.repeat(20) + '[broken', reason: 'Unterminated character class', snippet: '…' + 'a'.repeat(22) + ']' + 'b'.repeat(20) + '[broken' },
			{ pattern: 'a'.repeat(40) + 'b{12345}' + 'c'.repeat(40) + 'd{12', reason: 'Incomplete quantifier', snippet: '…b{12345}' + 'c'.repeat(40) + 'd{12' },
			{ pattern: '(?<name>x)(?:y)(?<=z)\\k<name>\\u{1F600}\\p{L}' + 'a'.repeat(60) + 'b)c', reason: 'Unmatched \')\'', snippet: '…' + 'a'.repeat(48) + 'b)c' },
		]);
	});

	test('pattern from the issue points at the missing `}`', () => {
		const pattern = 'https?://(?:(?:www.|)youtube.com|youtu.be)/(?:channel/|embed/|playlist?list=|watch?v=|v/|)[-a-zA-Z0-9?&=]|/archives/list/[^@/]+@[^/]/message/[^/]/[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12|pkg:github/[^/]/[^/](?:@|/commit/)[0-9a-f]';
		assertMessages([
			{ pattern, reason: 'Incomplete quantifier', snippet: '…/[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12|pkg:git…' },
		]);
	});

	test('very long patterns skip locating the error and show the start of the pattern', () => {
		assertMessages([
			{ pattern: 'abc|'.repeat(13000) + '(abc', reason: 'Unterminated group', snippet: 'abc|'.repeat(15) + '…' },
		]);
	});
});
