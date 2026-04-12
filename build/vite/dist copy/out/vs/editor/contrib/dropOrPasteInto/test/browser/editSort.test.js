/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { HierarchicalKind } from '../../../../../base/common/hierarchicalKind.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { sortEditsByYieldTo } from '../../browser/edit.js';
function createTestEdit(kind, args) {
    return {
        title: '',
        insertText: '',
        kind: new HierarchicalKind(kind),
        ...args,
    };
}
suite('sortEditsByYieldTo', () => {
    test('Should noop for empty edits', () => {
        const edits = [];
        assert.deepStrictEqual(sortEditsByYieldTo(edits), []);
    });
    test('Yielded to edit should get sorted after target', () => {
        const edits = [
            createTestEdit('a', { yieldTo: [{ kind: new HierarchicalKind('b') }] }),
            createTestEdit('b'),
        ];
        assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['b', 'a']);
    });
    test('Should handle chain of yield to', () => {
        {
            const edits = [
                createTestEdit('c', { yieldTo: [{ kind: new HierarchicalKind('a') }] }),
                createTestEdit('a', { yieldTo: [{ kind: new HierarchicalKind('b') }] }),
                createTestEdit('b'),
            ];
            assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['b', 'a', 'c']);
        }
        {
            const edits = [
                createTestEdit('a', { yieldTo: [{ kind: new HierarchicalKind('b') }] }),
                createTestEdit('c', { yieldTo: [{ kind: new HierarchicalKind('a') }] }),
                createTestEdit('b'),
            ];
            assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['b', 'a', 'c']);
        }
    });
    test(`Should not reorder when yield to isn't used`, () => {
        const edits = [
            createTestEdit('c', { yieldTo: [{ kind: new HierarchicalKind('x') }] }),
            createTestEdit('a', { yieldTo: [{ kind: new HierarchicalKind('y') }] }),
            createTestEdit('b'),
        ];
        assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['c', 'a', 'b']);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNvcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by90ZXN0L2Jyb3dzZXIvZWRpdFNvcnQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHM0QsU0FBUyxjQUFjLENBQUMsSUFBWSxFQUFFLElBQWdDO0lBQ3JFLE9BQU87UUFDTixLQUFLLEVBQUUsRUFBRTtRQUNULFVBQVUsRUFBRSxFQUFFO1FBQ2QsSUFBSSxFQUFFLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDO1FBQ2hDLEdBQUcsSUFBSTtLQUNQLENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtJQUVoQyxJQUFJLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1FBQ3hDLE1BQU0sS0FBSyxHQUF1QixFQUFFLENBQUM7UUFFckMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7UUFDM0QsTUFBTSxLQUFLLEdBQXVCO1lBQ2pDLGNBQWMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxD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