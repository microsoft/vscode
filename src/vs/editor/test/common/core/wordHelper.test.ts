/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { DEFAULT_WORD_REGEXP, getWordAtText, USUAL_WORD_SEPARATORS } from '../../../common/core/wordHelper.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('WordHelper', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not search a default word pattern between separators #227892', () => {
		const definition = new RegExp(DEFAULT_WORD_REGEXP.source, 'g');
		const exec = spy(definition, 'exec');
		try {
			for (const separator of USUAL_WORD_SEPARATORS + ' \t\r\n\u00a0\u2003\ufeff') {
				const text = separator.repeat(1000);
				for (const column of [1, 2, 500, 1000, 1001]) {
					assert.strictEqual(getWordAtText(column, definition, text, 0), null);
				}
			}
			assert.strictEqual(exec.callCount, 0);
		} finally {
			exec.restore();
		}
	});

	test('preserves default word boundaries, decimal numbers and text offsets', () => {
		const definition = new RegExp(DEFAULT_WORD_REGEXP.source, 'g');
		const equivalentDefinition = new RegExp(`(?:${DEFAULT_WORD_REGEXP.source})`, 'g');
		const fragments = ['', ':', '.', '-', '0', '12', 'a', '_', ' ', '\t', '\u00a0', '\u4e2d', '\ud83d\ude42'];

		for (const left of fragments) {
			for (const middle of fragments) {
				for (const right of fragments) {
					const text = left + middle + right;
					for (let column = 1; column <= text.length + 1; column++) {
						for (const offset of [0, 17]) {
							assert.deepStrictEqual(
								getWordAtText(column + offset, definition, text, offset),
								getWordAtText(column + offset, equivalentDefinition, text, offset),
								JSON.stringify({ text, column, offset })
							);
						}
					}
				}
			}
		}
	});

	test('preserves bounded long-word and embedded-text lookups', () => {
		const definition = new RegExp(DEFAULT_WORD_REGEXP.source, 'g');
		const equivalentDefinition = new RegExp(`(?:${DEFAULT_WORD_REGEXP.source})`, 'g');
		for (const text of [
			'a'.repeat(2000),
			':'.repeat(1000) + 'a'.repeat(2000),
			'x'.repeat(2000) + 'abcd-',
			':'.repeat(500000) + '-12.34',
			':'.repeat(500000) + '-.5',
			':'.repeat(500000) + '..5',
		]) {
			for (const column of [1, 2, 500, 1000, 1001, text.length - 1, text.length, text.length + 1]) {
				for (const offset of [0, 17]) {
					assert.deepStrictEqual(
						getWordAtText(column + offset, definition, text, offset),
						getWordAtText(column + offset, equivalentDefinition, text, offset),
						JSON.stringify({ length: text.length, column, offset })
					);
				}
			}
		}
	});

	test('uses custom word definitions and flags without the default shortcut', () => {
		const custom = /:+/g;
		const withFlags = new RegExp(DEFAULT_WORD_REGEXP.source, 'gi');
		const customExec = spy(custom, 'exec');
		const flaggedExec = spy(withFlags, 'exec');
		try {
			assert.deepStrictEqual(getWordAtText(3, custom, '::::', 0), { word: '::::', startColumn: 1, endColumn: 5 });
			assert.strictEqual(getWordAtText(3, withFlags, '::::', 0), null);
			assert.ok(customExec.called && flaggedExec.called);
		} finally {
			customExec.restore();
			flaggedExec.restore();
		}
	});

	test('preserves custom words containing whitespace #29102', () => {
		assert.deepStrictEqual(getWordAtText(8, /\/\*.+\*\//g, '/* hello world */', 0), {
			word: '/* hello world */', startColumn: 1, endColumn: 18
		});
	});

	test('preserves full rename words #96013 and offsets at the start of long lines #108892', () => {
		const word = 'do_not_Cut_Off_This_Text';
		const text = `int ${word};`;
		assert.deepStrictEqual([
			getWordAtText(text.indexOf('Text') + 3, DEFAULT_WORD_REGEXP, text, 0),
			getWordAtText(18, DEFAULT_WORD_REGEXP, 'english ' + 'word '.repeat(250), 17)
		], [
			{ word, startColumn: 5, endColumn: word.length + 5 },
			{ word: 'english', startColumn: 18, endColumn: 25 }
		]);
	});

	test('retains custom-regexp window and time-budget limits #95319', () => {
		const definition = /[a-z]+/g;
		const exec = spy(definition, 'exec');
		const text = 'word'.repeat(10000);
		try {
			const result = getWordAtText(20000, definition, text, 0, { maxLen: 80, windowSize: 15, timeBudget: 150 });
			assert.ok(result && exec.called && exec.args.every(([input]) => input.length <= 80));
			exec.resetHistory();
			assert.deepStrictEqual({
				word: getWordAtText(20000, definition, text, 0, { maxLen: 80, windowSize: 15, timeBudget: 0 }),
				regexpCalls: exec.callCount
			}, { word: null, regexpCalls: 0 });
		} finally {
			exec.restore();
		}
	});
});
