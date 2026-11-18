/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TextEdit, TextReplacement } from '../../../common/core/edits/textEdit.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { StringText } from '../../../common/core/text/abstractText.js';
import { Random } from './random.js';

suite('TextEdit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('inverse', () => {
		test('insertion of a surrogate pair', () => {
			const source = new StringText('abc');
			const edit = TextEdit.insert(new Position(1, 2), '😀');

			assert.strictEqual(edit.inverse(source).applyToString(edit.apply(source)), source.value);
		});

		test('multiline replacement ending in surrogate pairs', () => {
			const source = new StringText('abc\ndef');
			const edit = TextEdit.replace(new Range(1, 2, 2, 2), 'x\n😀𝄞');

			assert.strictEqual(edit.inverse(source).applyToString(edit.apply(source)), source.value);
		});

		test('multiple replacements containing surrogate pairs on the same line', () => {
			const source = new StringText('abcd');
			const edit = new TextEdit([
				new TextReplacement(new Range(1, 2, 1, 2), '😀'),
				new TextReplacement(new Range(1, 3, 1, 4), '𝄞'),
			]);

			assert.strictEqual(edit.inverse(source).applyToString(edit.apply(source)), source.value);
		});

		function runTest(seed: number): void {
			const rand = Random.create(seed);
			const source = new StringText(rand.nextMultiLineString(10, new OffsetRange(0, 10)));

			const edit = rand.nextTextEdit(source, rand.nextIntRange(1, 5));
			const invEdit = edit.inverse(source);

			const s1 = edit.apply(source);
			const s2 = invEdit.applyToString(s1);

			assert.deepStrictEqual(s2, source.value);
		}

		test.skip('brute-force', () => {
			for (let i = 0; i < 100_000; i++) {
				runTest(i);
			}
		});

		for (let seed = 0; seed < 20; seed++) {
			test(`test ${seed}`, () => runTest(seed));
		}
	});

	suite('removeCommonPrefixAndSuffix', () => {
		test('preserves surrogate pairs around the changed text', () => {
			const source = new StringText('😀abc𝄞');
			const replacement = new TextReplacement(new Range(1, 1, 1, 8), '😀axc𝄞');
			const reduced = replacement.removeCommonPrefixAndSuffix(source);

			assert.deepStrictEqual({ range: reduced.range, text: reduced.text, result: reduced.toEdit().apply(source) }, {
				range: new Range(1, 4, 1, 5),
				text: 'x',
				result: '😀axc𝄞',
			});
		});
	});

	suite('compose', () => {
		function runTest(seed: number): void {
			const rand = Random.create(seed);

			const s0 = new StringText(rand.nextMultiLineString(10, new OffsetRange(0, 10)));

			const edits1 = rand.nextTextEdit(s0, rand.nextIntRange(1, 4));
			const s1 = edits1.applyToString(s0.value);

			const s1Text = new StringText(s1);
			const edits2 = rand.nextTextEdit(s1Text, rand.nextIntRange(1, 4));
			const s2 = edits2.applyToString(s1);

			const combinedEdits = edits1.compose(edits2);
			const s2C = combinedEdits.applyToString(s0.value);
			assert.strictEqual(s2C, s2);
		}

		test.skip('fuzz', function () {
			this.timeout(0);
			for (let i = 0; i < 1_000_000; i++) {
				runTest(i);
			}
		});

		for (let seed = 0; seed < 100; seed++) {
			test(`case ${seed}`, () => runTest(seed));
		}
	});
});
