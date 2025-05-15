/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Random } from './random.js';
import { StringEdit, StringReplacement } from '../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { ArrayEdit, ArrayReplacement } from '../../../common/core/edits/arrayEdit.js';

suite('Edit', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('StringEdit', () => {
		test('basic', () => {
			const arr = '0123456789';
			const edit = StringEdit.replace(new OffsetRange(4, 6), 'xyz');
			const result = edit.apply(arr);
			assert.deepStrictEqual(result, '0123xyz6789');
		});

		test('inverse', () => {
			for (let i = 0; i < 1000; i++) {
				test('case' + i, () => {
					runTest(i);
				});
			}

			test.skip('fuzz', () => {
				for (let i = 0; i < 1_000_000; i++) {
					runTest(i);
				}
			});

			function runTest(seed: number) {
				const rng = Random.create(seed);

				const s0 = 'abcde\nfghij\nklmno\npqrst\n';

				const e = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);
				const eInv = e.inverse(s0);

				assert.strictEqual(eInv.apply(e.apply(s0)), s0);
			}
		});

		suite('compose', () => {
			for (let i = 0; i < 1000; i++) {
				test('case' + i, () => {
					runTest(i);
				});
			}

			test.skip('fuzz', () => {
				for (let i = 0; i < 1_000_000; i++) {
					runTest(i);
				}
			});

			function runTest(seed: number) {
				const rng = Random.create(seed);

				const s0 = 'abcde\nfghij\nklmno\npqrst\n';

				const edits1 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);
				const s1 = edits1.apply(s0);

				const edits2 = getRandomEdit(s1, rng.nextIntRange(1, 4), rng);
				const s2 = edits2.apply(s1);

				const combinedEdits = edits1.compose(edits2);
				const s2C = combinedEdits.apply(s0);

				assert.strictEqual(s2C, s2);
			}
		});

		test('equals', () => {
			const edit1 = StringEdit.replace(new OffsetRange(4, 6), 'xyz');
			const edit2 = StringEdit.replace(new OffsetRange(4, 6), 'xyz');
			const edit3 = StringEdit.replace(new OffsetRange(5, 6), 'xyz');
			const edit4 = StringEdit.replace(new OffsetRange(4, 6), 'xy');

			assert.ok(edit1.equals(edit1));
			assert.ok(edit1.equals(edit2));
			assert.ok(edit2.equals(edit1));

			assert.ok(!edit1.equals(edit3));
			assert.ok(!edit1.equals(edit4));
		});

		test('getNewRanges', () => {
			const edit = StringEdit.create([
				new StringReplacement(new OffsetRange(4, 6), 'abcde'),
				new StringReplacement(new OffsetRange(7, 9), 'a'),
			]);
			const ranges = edit.getNewRanges();
			assert.deepStrictEqual(ranges, [
				new OffsetRange(4, 9),
				new OffsetRange(10, 11),
			]);
		});

		test('getJoinedReplaceRange', () => {
			const edit = StringEdit.create([
				new StringReplacement(new OffsetRange(4, 6), 'abcde'),
				new StringReplacement(new OffsetRange(7, 9), 'a'),
			]);
			const range = edit.getJoinedReplaceRange();
			assert.deepStrictEqual(range, new OffsetRange(4, 9));
		});

		test('getLengthDelta', () => {
			const edit = StringEdit.create([
				new StringReplacement(new OffsetRange(4, 6), 'abcde'),
				new StringReplacement(new OffsetRange(7, 9), 'a'),
			]);
			const delta = edit.getLengthDelta();
			assert.strictEqual(delta, 2);
			assert.strictEqual(edit.replacements[0].getLengthDelta(), 3);
			assert.strictEqual(edit.replacements[1].getLengthDelta(), -1);
		});
	});

	suite('ArrayEdit', () => {
		test('basic', () => {
			const arr = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
			const edit = ArrayEdit.replace(new OffsetRange(4, 6), ['x', 'y', 'z']);
			const result = edit.apply(arr);
			assert.deepStrictEqual(result, ['0', '1', '2', '3', 'x', 'y', 'z', '6', '7', '8', '9']);
		});

		suite('compose', () => {
			for (let i = 0; i < 100; i++) {
				test('case' + i, () => {
					runTest(i);
				});
			}

			function runTest(seed: number) {
				const rng = Random.create(seed);

				const s0 = 'abcde\nfghij\nklmno\npqrst\n';

				const e1 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);
				const s1 = e1.apply(s0);

				const e2 = getRandomEdit(s1, rng.nextIntRange(1, 4), rng);

				const ae1 = ArrayEdit.create(e1.replacements.map(r => new ArrayReplacement(r.replaceRange, [...r.newText])));
				const ae2 = ArrayEdit.create(e2.replacements.map(r => new ArrayReplacement(r.replaceRange, [...r.newText])));
				const as0 = [...s0];
				const as1 = ae1.apply(as0);
				const as2 = ae2.apply(as1);
				const aCombinedEdits = ae1.compose(ae2);

				const as2C = aCombinedEdits.apply(as0);
				assert.deepStrictEqual(as2, as2C);
			}
		});
	});


	function getRandomEdit(str: string, count: number, rng: Random): StringEdit {
		const edits: StringReplacement[] = [];
		let i = 0;
		for (let j = 0; j < count; j++) {
			if (i >= str.length) {
				break;
			}
			edits.push(getRandomSingleEdit(str, i, rng));
			i = edits[j].replaceRange.endExclusive + 1;
		}
		return StringEdit.create(edits);
	}

	function getRandomSingleEdit(str: string, rangeOffsetStart: number, rng: Random): StringReplacement {
		const offsetStart = rng.nextIntRange(rangeOffsetStart, str.length);
		const offsetEnd = rng.nextIntRange(offsetStart, str.length);

		const textStart = rng.nextIntRange(0, str.length);
		const textLen = rng.nextIntRange(0, Math.min(7, str.length - textStart));

		return new StringReplacement(
			new OffsetRange(offsetStart, offsetEnd),
			str.substring(textStart, textStart + textLen)
		);
	}
});
