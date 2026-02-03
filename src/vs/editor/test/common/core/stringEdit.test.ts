/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ArrayEdit, ArrayReplacement } from '../../../common/core/edits/arrayEdit.js';
import { StringEdit, StringReplacement } from '../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { Random } from './random.js';

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

		test('adjacent edit and insert should rebase successfully', () => {
			// A replacement ending at X followed by an insert at X should not conflict
			const firstEdit = StringEdit.create([
				StringReplacement.replace(new OffsetRange(1826, 1838), 'function fib(n: number): number {'),
			]);
			const followupEdit = StringEdit.create([
				StringReplacement.replace(new OffsetRange(1838, 1838), '\n\tif (n <= 1) {\n\t\treturn n;\n\t}\n\treturn fib(n - 1) + fib(n - 2);\n}'),
			]);
			const rebasedEdit = followupEdit.tryRebase(firstEdit);

			// Since firstEdit replaces [1826, 1838) with text of length 33,
			// the insert at 1838 should be rebased to 1826 + 33 = 1859
			assert.ok(rebasedEdit);
			assert.strictEqual(rebasedEdit?.replacements[0].replaceRange.start, 1859);
			assert.strictEqual(rebasedEdit?.replacements[0].replaceRange.endExclusive, 1859);
		});

		test('concurrent inserts at same position should conflict', () => {
			// Two inserts at the exact same position conflict because order matters
			const firstEdit = StringEdit.create([
				StringReplacement.replace(new OffsetRange(1838, 1838), '1'),
			]);
			const followupEdit = StringEdit.create([
				StringReplacement.replace(new OffsetRange(1838, 1838), '2'),
			]);
			const rebasedEdit = followupEdit.tryRebase(firstEdit);

			// This should return undefined because both are inserts at the same position
			assert.strictEqual(rebasedEdit, undefined);
		});

		test('tryRebase should return undefined when rebasing would produce non-disjoint edits (negative offset case)', () => {
			// ourEdit1: [100, 110) -> "A"
			// ourEdit2: [120, 120) -> "B"
			// baseEdit: [110, 125) -> "" (delete 15 chars, offset = -15)
			// After transformation, ourEdit2 at [105, 105) < ourEdit1 end (110)

			const ourEdit = StringEdit.create([
				new StringReplacement(new OffsetRange(100, 110), 'A'),
				new StringReplacement(OffsetRange.emptyAt(120), 'B'),
			]);

			const baseEdit = StringEdit.create([
				new StringReplacement(new OffsetRange(110, 125), ''),
			]);

			const result = ourEdit.tryRebase(baseEdit);
			assert.strictEqual(result, undefined);
		});

		test('tryRebase should succeed when edits remain disjoint after rebasing', () => {
			// ourEdit1: [100, 110) -> "A"
			// ourEdit2: [200, 210) -> "B"
			// baseEdit: [50, 60) -> "" (delete 10 chars, offset = -10)
			// After: ourEdit1 at [90, 100), ourEdit2 at [190, 200) - still disjoint

			const ourEdit = StringEdit.create([
				new StringReplacement(new OffsetRange(100, 110), 'A'),
				new StringReplacement(new OffsetRange(200, 210), 'B'),
			]);

			const baseEdit = StringEdit.create([
				new StringReplacement(new OffsetRange(50, 60), ''),
			]);

			const result = ourEdit.tryRebase(baseEdit);
			assert.ok(result);
			assert.strictEqual(result?.replacements[0].replaceRange.start, 90);
			assert.strictEqual(result?.replacements[1].replaceRange.start, 190);
		});

		test('rebaseSkipConflicting should skip edits that would produce non-disjoint results', () => {
			const ourEdit = StringEdit.create([
				new StringReplacement(new OffsetRange(100, 110), 'A'),
				new StringReplacement(OffsetRange.emptyAt(120), 'B'),
			]);

			const baseEdit = StringEdit.create([
				new StringReplacement(new OffsetRange(110, 125), ''),
			]);

			// Should not throw, and should skip the conflicting edit
			const result = ourEdit.rebaseSkipConflicting(baseEdit);
			assert.strictEqual(result.replacements.length, 1);
			assert.strictEqual(result.replacements[0].replaceRange.start, 100);
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

	suite('tryRebase invariants', () => {
		for (let i = 0; i < 1000; i++) {
			test('case' + i, () => {
				runTest(i);
			});
		}

		function runTest(seed: number) {
			const rng = Random.create(seed);
			const s0 = 'abcde\nfghij\nklmno\npqrst\n';

			const e1 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);
			const e2 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);

			const e1RebasedOnE2 = e1.tryRebase(e2);
			const e2RebasedOnE1 = e2.tryRebase(e1);

			// Invariant 1: e1.rebase(e2) != undefined <=> e2.rebase(e1) != undefined
			assert.strictEqual(
				e1RebasedOnE2 !== undefined,
				e2RebasedOnE1 !== undefined,
				`Symmetry violated: e1.rebase(e2)=${e1RebasedOnE2 !== undefined}, e2.rebase(e1)=${e2RebasedOnE1 !== undefined}`
			);

			// Invariant 2: e1.rebase(e2) != undefined => e1.compose(e2.rebase(e1)) = e2.compose(e1.rebase(e2))
			if (e1RebasedOnE2 !== undefined && e2RebasedOnE1 !== undefined) {
				const path1 = e1.compose(e2RebasedOnE1);
				const path2 = e2.compose(e1RebasedOnE2);

				// Both paths should produce the same result when applied to s0
				const result1 = path1.apply(s0);
				const result2 = path2.apply(s0);
				assert.strictEqual(result1, result2, `Diamond property violated`);
			}

			// Invariant 3: empty.rebase(e) = empty
			const emptyRebasedOnE1 = StringEdit.empty.tryRebase(e1);
			assert.ok(emptyRebasedOnE1 !== undefined);
			assert.ok(emptyRebasedOnE1.isEmpty);

			// Invariant 4: e.rebase(empty) = e
			const e1RebasedOnEmpty = e1.tryRebase(StringEdit.empty);
			assert.ok(e1RebasedOnEmpty !== undefined);
			assert.ok(e1.equals(e1RebasedOnEmpty), `e.rebase(empty) should equal e`);

			// Invariant 5 (TP2): T(T(e3, e1), T(e2, e1)) = T(T(e3, e2), T(e1, e2))
			// For 3+ concurrent operations, transformation order shouldn't matter
			const e3 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);

			const e2OnE1 = e2.tryRebase(e1);
			const e1OnE2 = e1.tryRebase(e2);
			const e3OnE1 = e3.tryRebase(e1);
			const e3OnE2 = e3.tryRebase(e2);

			if (e2OnE1 && e1OnE2 && e3OnE1 && e3OnE2) {
				const path1 = e3OnE1.tryRebase(e2OnE1); // T(T(e3, e1), T(e2, e1))
				const path2 = e3OnE2.tryRebase(e1OnE2); // T(T(e3, e2), T(e1, e2))

				if (path1 && path2) {
					assert.ok(path1.equals(path2), `TP2 violated: transformation order matters`);
				}
			}
		}
	});
});
