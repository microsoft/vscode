/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { computeGhostText } from '../../browser/model/computeGhostText.js';

suite('computeGhostText', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function getOutput(text: string, suggestion: string): unknown {
		const rangeStartOffset = text.indexOf('[');
		const rangeEndOffset = text.indexOf(']') - 1;
		const cleanedText = text.replace('[', '').replace(']', '');
		const tempModel = createTextModel(cleanedText);
		const range = Range.fromPositions(tempModel.getPositionAt(rangeStartOffset), tempModel.getPositionAt(rangeEndOffset));
		const options = ['prefix', 'subword'] as const;
		// eslint-disable-next-line local/code-no-any-casts
		const result = {} as any;
		for (const option of options) {
			result[option] = computeGhostText(new TextReplacement(range, suggestion), tempModel, option)?.render(cleanedText, true);
		}

		tempModel.dispose();

		if (new Set(Object.values(result)).size === 1) {
			return Object.values(result)[0];
		}

		return result;
	}

	test('Basic', () => {
		assert.deepStrictEqual(getOutput('[foo]baz', 'foobar'), 'foo[bar]baz');
		assert.deepStrictEqual(getOutput('[aaa]aaa', 'aaaaaa'), 'aaa[aaa]aaa');
		assert.deepStrictEqual(getOutput('[foo]baz', 'boobar'), undefined);
		assert.deepStrictEqual(getOutput('[foo]foo', 'foofoo'), 'foo[foo]foo');
		assert.deepStrictEqual(getOutput('foo[]', 'bar\nhello'), 'foo[bar\nhello]');
	});

	test('Empty ghost text', () => {
		assert.deepStrictEqual(getOutput('[foo]', 'foo'), 'foo');
	});

	test('Whitespace (indentation)', () => {
		assert.deepStrictEqual(getOutput('[ foo]', 'foobar'), ' foo[bar]');
		assert.deepStrictEqual(getOutput('[\tfoo]', 'foobar'), '\tfoo[bar]');
		assert.deepStrictEqual(getOutput('[\t foo]', '\tfoobar'), '	 foo[bar]');
		assert.deepStrictEqual(getOutput('[\tfoo]', '\t\tfoobar'), { prefix: undefined, subword: '\t[\t]foo[bar]' });
		assert.deepStrictEqual(getOutput('[\t]', '\t\tfoobar'), '\t[\tfoobar]');
		assert.deepStrictEqual(getOutput('\t[]', '\t'), '\t[\t]');
		assert.deepStrictEqual(getOutput('\t[\t]', ''), '\t\t');

		assert.deepStrictEqual(getOutput('[ ]', 'return 1'), ' [return 1]');
	});

	test('Whitespace (outside of indentation)', () => {
		assert.deepStrictEqual(getOutput('bar[ foo]', 'foobar'), undefined);
		assert.deepStrictEqual(getOutput('bar[\tfoo]', 'foobar'), undefined);
	});

	test('Unsupported Case', () => {
		assert.deepStrictEqual(getOutput('fo[o\n]', 'x\nbar'), undefined);
	});

	test('New Line', () => {
		assert.deepStrictEqual(getOutput('fo[o\n]', 'o\nbar'), 'foo\n[bar]');
	});

	test('Multi Part Diffing', () => {
		assert.deepStrictEqual(getOutput('foo[()]', '(x);'), { prefix: undefined, subword: 'foo([x])[;]' });
		assert.deepStrictEqual(getOutput('[\tfoo]', '\t\tfoobar'), { prefix: undefined, subword: '\t[\t]foo[bar]' });
		assert.deepStrictEqual(getOutput('[(y ===)]', '(y === 1) { f(); }'), { prefix: undefined, subword: '(y ===[ 1])[ { f(); }]' });
		assert.deepStrictEqual(getOutput('[(y ==)]', '(y === 1) { f(); }'), { prefix: undefined, subword: '(y ==[= 1])[ { f(); }]' });

		assert.deepStrictEqual(getOutput('[(y ==)]', '(y === 1) { f(); }'), { prefix: undefined, subword: '(y ==[= 1])[ { f(); }]' });
	});

	test('Multi Part Diffing 1', () => {
		assert.deepStrictEqual(getOutput('[if () ()]', 'if (1 == f()) ()'), { prefix: undefined, subword: 'if ([1 == f()]) ()' });
	});

	test('Multi Part Diffing 2', () => {
		assert.deepStrictEqual(getOutput('[)]', '())'), ({ prefix: undefined, subword: '[(])[)]' }));
		assert.deepStrictEqual(getOutput('[))]', '(())'), ({ prefix: undefined, subword: '[((]))' }));
	});

	test('Parenthesis Matching', () => {
		assert.deepStrictEqual(getOutput('[console.log()]', 'console.log({ label: "(" })'), {
			prefix: undefined,
			subword: 'console.log([{ label: "(" }])'
		});
	});
});
