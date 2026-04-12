/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ListProjection } from '../../../browser/explorerProjections/listProjection.js';
import { TestId } from '../../../common/testId.js';
import { TestTreeTestHarness } from '../testObjectTree.js';
import { TestTestItem } from '../../common/testStubs.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
suite('Workbench - Testing Explorer Hierarchal by Name Projection', () => {
    let harness;
    let onTestChanged;
    let resultsService;
    teardown(() => {
        harness.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        onTestChanged = new Emitter();
        resultsService = upcastPartial({
            onResultsChanged: Event.None,
            onTestChanged: onTestChanged.event,
            getStateById: () => undefined,
        });
        harness = new TestTreeTestHarness(l => new ListProjection({}, l, resultsService));
    });
    test('renders initial tree', () => {
        harness.flush();
        assert.deepStrictEqual(harness.tree.getRendered(), [
            { e: 'aa' }, { e: 'ab' }, { e: 'b' }
        ]);
    });
    test('updates render if second test provider appears', async () => {
        harness.flush();
        harness.pushDiff({
            op: 0 /* TestDiffOpType.Add */,
            item: { controllerId: 'ctrl2', expand: 3 /* TestItemExpandState.Expanded */, item: new TestTestItem(new TestId(['ctrl2']), 'root2').toTestItem() },
        }, {
            op: 0 /* TestDiffOpType.Add */,
            item: { controllerId: 'ctrl2', expand: 0 /* TestItemExpandState.NotExpandable */, item: new TestTestItem(new TestId(['ctrl2', 'id-c']), 'c', undefined).toTestItem() },
        });
        assert.deepStrictEqual(harness.flush(), [
            { e: 'root', children: [{ e: 'aa' }, { e: 'ab' }, { e: 'b' }] },
            { e: 'root2', children: [{ e: 'c' }] },
        ]);
    });
    test('updates nodes if they add children', async () => {
        harness.flush();
        harness.c.root.children.get('id-a').children.add(new TestTestItem(new TestId(['ctrlId', 'id-a', 'id-ac']), 'ac'));
        assert.deepStrictEqual(harness.flush(), [
            { e: 'aa' },
            { e: 'ab' },
            { e: 'ac' },
            { e: 'b' }
        ]);
    });
    test('updates nodes if they remove children', async () => {
        harness.flush();
        harness.c.root.children.get('id-a').children.delete('id-ab');
        assert.deepStrictEqual(harness.flush(), [
            { e: 'aa' },
            { e: 'b' }
        ]);
    });
    test('swaps when node is no longer leaf', async () => {
        harness.flush();
        harness.c.root.children.get('id-b').children.add(new TestTestItem(new TestId(['ctrlId', 'id-b', 'id-ba']), 'ba'));
        assert.deepStrictEqual(harness.flush(), [
            { e: 'aa' },
            { e: 'ab' },
            { e: 'ba' },
        ]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFtZVByb2plY3Rpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvdGVzdC9icm93c2VyL2V4cGxvcmVyUHJvamVjdGlvbnMvbmFtZVByb2plY3Rpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDeEYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBR25ELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHM0UsS0FBSyxDQUFDLDREQUE0RCxFQUFFLEdBQUcsRUFBRTtJQUN4RSxJQUFJLE9BQTRDLENBQUM7SUFDakQsSUFBSSxhQUE0QyxDQUFDO0lBQ2pELElBQUksY0FBa0MsQ0FBQztJQUV2QyxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsYUFBYSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7UUFDOUIsY0FBYyxHQUFHLGFBQWEsQ0FBcUI7WUFDbEQsZ0JBQWdCLEVBQUUsS0FBSyxDQUFD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