/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { computeMatchSource, hasMinLexemeLength, lexemeLength, MinTokenLength, offsetLastLexemes } from '../../common/snippyCompute';

describe('Snippy token boundaries', () => {
	test.each([0, 64, 65, 109, 110, 111, 220])('counts %i lexemes with saturation', count => {
		const source = 'token_123 \t\r\n'.repeat(count);
		expect([lexemeLength(source), hasMinLexemeLength(source)]).toEqual([Math.min(count, 110), count >= 110]);
	});

	test.each(['=', '-', '#', '/', '*'])('groups long %s separator runs', separator => {
		expect([1, 2, 3, 4, 5, 120].map(length => lexemeLength(separator.repeat(length)))).toEqual([1, 2, 3, 1, 1, 1]);
	});

	test('uses Unicode 15 categories independently of the JavaScript runtime', () => {
		expect([
			lexemeLength('\u{10400}_\u{1d7d8} \u4e2d\u6587 \u0661\u0662 \u{1f600}'),
			lexemeLength('\u{2ebf0} \u1c89 \u{16100} \u{10d40} \u{10940}'),
			hasMinLexemeLength('token '.repeat(105) + '\u1c89 '.repeat(5)),
		]).toEqual([4, 0, false]);
	});

	test('takes whole supplementary-plane tokens without reversing UTF-16', () => {
		const prefix = 'ignored '.repeat(45);
		const tail = '\u{1f600}'.repeat(110);
		expect(offsetLastLexemes(prefix + tail, MinTokenLength)).toBe(prefix.length);
	});

	test('counts supplementary-plane letters when finding preceding context', () => {
		const prefix = '\u{10400} '.repeat(3001);
		const asciiTail = 'token '.repeat(70);
		const source = prefix + asciiTail;
		expect(source.slice(offsetLastLexemes(source, MinTokenLength))).toBe('\u{10400} '.repeat(40) + asciiTail);
	});

	test('keeps a mixed supplementary-plane identifier intact', () => {
		const prefix = 'ignored ';
		const tail = 'start\u{10400}end ' + 'token '.repeat(109);
		expect(offsetLastLexemes(prefix + tail, MinTokenLength)).toBe(prefix.length);
	});

	test('does not retain matching state after early termination', () => {
		expect([
			lexemeLength('token '.repeat(111)),
			lexemeLength('token '.repeat(111)),
			offsetLastLexemes('prefix '.repeat(111), 110),
			lexemeLength('short'),
			hasMinLexemeLength('token '.repeat(110)),
		]).toEqual([110, 110, 'prefix '.length, 1, true]);
	});

	test('preserves the exact source offset after a Unicode join', () => {
		const ignored = 'ignored '.repeat(45);
		const preceding = 'prefix '.repeat(109) + 'begin\u{10400}';
		expect(computeMatchSource(ignored + preceding, 'End')).toEqual({
			source: preceding + 'End',
			startOffset: ignored.length,
		});
	});

	test('excludes malformed text outside the selected source', () => {
		const preceding = 'prefix '.repeat(110);
		expect(computeMatchSource('\ud800 ' + preceding, 'tail')).toEqual({
			source: preceding + 'tail',
			startOffset: 2,
		});
	});

	test('does not truncate or rewrite invalid source', () => {
		expect([
			computeMatchSource('', ''),
			computeMatchSource('prefix '.repeat(110), 'token '.repeat(3001)),
			computeMatchSource('prefix '.repeat(110), 'tail\ud800'),
		]).toEqual([{ reason: 'empty' }, { reason: 'tooLong' }, { reason: 'invalidUnicode' }]);
	});
});
