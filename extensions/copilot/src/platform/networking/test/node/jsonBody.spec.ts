/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { replaceLoneSurrogates, stringifyJsonBody } from '../../common/jsonBody';

suite('replaceLoneSurrogates', () => {

	test('replaces unpaired surrogates and preserves well-formed text', () => {
		const cases = {
			plain: 'hello',
			validPair: 'a🙂b',
			loneHigh: 'a\uD83Db',
			loneLow: 'a\uDE42b',
			highAtEnd: 'ab\uD83D',
			reversedPair: '\uDE42\uD83D',
			splitEmoji: '🙂'.repeat(2).slice(0, 3),
		};

		assert.deepStrictEqual(
			Object.fromEntries(Object.entries(cases).map(([name, value]) => [name, replaceLoneSurrogates(value)])),
			{
				plain: 'hello',
				validPair: 'a🙂b',
				loneHigh: 'a\uFFFDb',
				loneLow: 'a\uFFFDb',
				highAtEnd: 'ab\uFFFD',
				reversedPair: '\uFFFD\uFFFD',
				splitEmoji: '🙂\uFFFD',
			}
		);
	});
});

suite('stringifyJsonBody', () => {

	test('emits a body that a strict UTF-8 parser accepts', () => {
		// A tool result truncated in the middle of an emoji, as a character-count limit would do.
		const body = { messages: [{ role: 'tool', content: `head${'🙂'.repeat(3).slice(0, 5)}tail` }] };

		const serialized = stringifyJsonBody(body);

		assert.deepStrictEqual(
			{
				hasLoneSurrogateEscape: serialized.includes('\\ud'),
				survivesUtf8: Buffer.from(serialized, 'utf8').toString('utf8') === serialized,
				parsed: JSON.parse(serialized),
			},
			{
				hasLoneSurrogateEscape: false,
				survivesUtf8: true,
				parsed: { messages: [{ role: 'tool', content: 'head🙂🙂\uFFFDtail' }] },
			}
		);
	});

	test('matches JSON.stringify when the payload is already well-formed', () => {
		// The second value also exercises the over-eager `\ud` detection: it is literal text
		// rather than an escape, so the sanitizing pass must leave it byte-for-byte identical.
		const body = { emoji: 'a 🙂 b', literalEscapeText: 'not an escape: \\ud83d' };

		assert.strictEqual(stringifyJsonBody(body), JSON.stringify(body));
	});
});
