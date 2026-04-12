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
            function runTest(seed) {
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
            function runTest(seed) {
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
            function runTest(seed) {
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
    function getRandomEdit(str, count, rng) {
        const edits = [];
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
    function getRandomSingleEdit(str, rangeOffsetStart, rng) {
        const offsetStart = rng.nextIntRange(rangeOffsetStart, str.length);
        const offsetEnd = rng.nextIntRange(offsetStart, str.length);
        const textStart = rng.nextIntRange(0, str.length);
        const textLen = rng.nextIntRange(0, Math.min(7, str.length - textStart));
        return new StringReplacement(new OffsetRange(offsetStart, offsetEnd), str.substring(textStart, textStart + textLen));
    }
    suite('tryRebase invariants', () => {
        for (let i = 0; i < 1000; i++) {
            test('case' + i, () => {
                runTest(i);
            });
        }
        function runTest(seed) {
            const rng = Random.create(seed);
            const s0 = 'abcde\nfghij\nklmno\npqrst\n';
            const e1 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);
            const e2 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);
            const e1RebasedOnE2 = e1.tryRebase(e2);
            const e2RebasedOnE1 = e2.tryRebase(e1);
            // Invariant 1: e1.rebase(e2) != undefined <=> e2.rebase(e1) != undefined
            assert.strictEqual(e1RebasedOnE2 !== undefined, e2RebasedOnE1 !== undefined, `Symmetry violated: e1.rebase(e2)=${e1RebasedOnE2 !== undefined}, e2.rebase(e1)=${e2RebasedOnE1 !== undefined}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaW5nRWRpdC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL2NvcmUvc3RyaW5nRWRpdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRXJDLEtBQUssQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFO0lBRWxCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7UUFDeEIsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDbEIsTUFBTSxHQUFHLEdBQUcsWUFBWSxDQUFDO1lBQ3pCLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzlELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDL0IsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtZQUNwQixLQUFLLElBQUks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