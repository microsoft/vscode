/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { stringifyJsonBody } from '../../common/jsonBody';

suite('stringifyJsonBody', () => {

	test('emits a body that a strict UTF-8 parser accepts', () => {
		const body = {
			// A tool result truncated in the middle of an emoji, as a character-count limit would do.
			truncated: `head${'🙂'.repeat(3).slice(0, 5)}tail`,
			// A lone surrogate in a property name, which a `JSON.stringify` replacer cannot reach.
			['key\uD83D']: 'value',
			// A lone surrogate right after a literal backslash, so the escape it produces is preceded
			// by an odd-length backslash run.
			afterBackslash: '\\\uDE42',
		};

		const serialized = stringifyJsonBody(body);

		assert.deepStrictEqual(
			{
				hasSurrogateEscape: /\\u[dD][89a-fA-F]/.test(serialized),
				survivesUtf8: Buffer.from(serialized, 'utf8').toString('utf8') === serialized,
				parsed: JSON.parse(serialized),
			},
			{
				hasSurrogateEscape: false,
				survivesUtf8: true,
				parsed: {
					truncated: 'head🙂🙂\uFFFDtail',
					'key\uFFFD': 'value',
					afterBackslash: '\\\uFFFD',
				},
			}
		);
	});

	test('matches JSON.stringify when the payload is already well-formed', () => {
		// `literalEscapeText` is text rather than an escape: `JSON.stringify` doubles its backslash,
		// so the sanitizing pass must consume the pair and leave it byte-for-byte identical.
		const body = { emoji: 'a 🙂 b', literalEscapeText: 'not an escape: \\ud83d', control: '\n\t"' };

		assert.strictEqual(stringifyJsonBody(body), JSON.stringify(body));
	});

	test('scans a long run of backslashes in linear time', () => {
		// Guards against reintroducing a pattern like `(\\+)u...`, whose backtracking is quadratic in
		// the length of a backslash run and turns this reachable tool output into a denial of service.
		// A linear scan finishes in single-digit milliseconds; the quadratic one needs over a minute,
		// so the suite timeout is what fails here rather than a flaky duration assertion.
		const body = { content: '\\'.repeat(200_000) + 'ud8' };

		assert.strictEqual(stringifyJsonBody(body), JSON.stringify(body));
	});

	test('rejects a value that has no JSON representation', () => {
		const attempt = (value: unknown) => {
			try {
				stringifyJsonBody(value);
				return 'serialized';
			} catch (error) {
				return (error as Error).message;
			}
		};

		assert.deepStrictEqual(
			{ undefined: attempt(undefined), function: attempt(() => { }), object: attempt({}) },
			{
				undefined: `Illegal arguments! A value of type 'undefined' has no JSON representation!`,
				function: `Illegal arguments! A value of type 'function' has no JSON representation!`,
				object: 'serialized',
			}
		);
	});
});
