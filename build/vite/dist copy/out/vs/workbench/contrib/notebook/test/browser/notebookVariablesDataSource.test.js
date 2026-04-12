/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NotebookVariableDataSource } from '../../browser/contrib/notebookVariables/notebookVariablesDataSource.js';
suite('NotebookVariableDataSource', () => {
    let dataSource;
    const notebookModel = { uri: 'one.ipynb', languages: ['python'] };
    let provideVariablesCalled;
    let results;
    const kernel = new class extends mock() {
        constructor() {
            super(...arguments);
            this.hasVariableProvider = true;
        }
        provideVariables(notebookUri, parentId, kind, start, token) {
            provideVariablesCalled = true;
            return new AsyncIterableProducer((emitter) => {
                for (let i = 0; i < results.length; i++) {
                    if (token.isCancellationRequested) {
                        break;
                    }
                    if (results[i].action) {
                        results[i].action();
                    }
                    emitter.emitOne(results[i]);
                }
            });
        }
    };
    const kernelService = new class extends mock() {
        getMatchingKernel(notebook) {
            return { selected: kernel, all: [], suggestions: [], hidden: [] };
        }
    };
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        provideVariablesCalled = false;
        dataSource = new NotebookVariableDataSource(kernelService);
        results = [
            { id: 1, name: 'a', value: '1', hasNamedChildren: false, indexedChildrenCount: 0 },
        ];
    });
    test('Root element should return children', async () => {
        const variables = await dataSource.getChildren({ kind: 'root', notebook: notebookModel });
        assert.strictEqual(variables.length, 1);
    });
    test('Get children of list element', async () => {
        const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 5 };
        results = [
            { id: 2, name: 'first', value: '1', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 3, name: 'second', value: '2', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 4, name: 'third', value: '3', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 5, name: 'fourth', value: '4', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 6, name: 'fifth', value: '5', hasNamedChildren: false, indexedChildrenCount: 0 },
        ];
        const variables = await dataSource.getChildren(parent);
        assert.strictEqual(variables.length, 5);
    });
    test('Get children for large list', async () => {
        const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 2000 };
        results = [];
        const variables = await dataSource.getChildren(parent);
        assert(variables.length > 1, 'We should have results for groups of children');
        assert(!provideVariablesCalled, 'provideVariables should not be called');
        assert.equal(variables[0].extHostId, parent.extHostId, 'ExtHostId should match the parent since we will use it to get the real children');
    });
    test('Get children for very large list', async () => {
        const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 1_000_000 };
        results = [];
        const groups = await dataSource.getChildren(parent);
        const children = await dataSource.getChildren(groups[99]);
        assert(children.length === 100, 'We should have a full page of child groups');
        assert(!provideVariablesCalled, 'provideVariables should not be called');
        assert.equal(children[0].extHostId, parent.extHostId, 'ExtHostId should match the parent since we will use it to get the real children');
    });
    test('Cancel while enumerating through children', async () => {
        const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 10 };
        results = [
            { id: 2, name: 'first', value: '1', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 3, name: 'second', value: '2', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 4, name: 'third', value: '3', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 5, name: 'fourth', value: '4', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 5, name: 'fifth', value: '4', hasNamedChildren: false, indexedChildrenCount: 0, action: () => dataSource.cancel() },
            { id: 7, name: 'sixth', value: '6', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 8, name: 'seventh', value: '7', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 9, name: 'eighth', value: '8', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 10, name: 'ninth', value: '9', hasNamedChildren: false, indexedChildrenCount: 0 },
            { id: 11, name: 'tenth', value: '10', hasNamedChildren: false, indexedChildrenCount: 0 },
        ];
        const variables = await dataSource.getChildren(parent);
        assert.equal(variables.length, 5, 'Iterating should have been cancelled');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tWYXJpYWJsZXNEYXRhU291cmNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvbm90ZWJvb2tWYXJpYWJsZXNEYXRhU291cmNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzVFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQTRCLDBCQUEwQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFLOUksS0FBSyxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtJQUN4QyxJQUFJLFVBQXNDLENBQUM7SUFDM0MsTUFBTSxhQUFhLEdBQUcsRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFrQyxDQUFDO0lBQ2xHLElBQUksc0JBQStCLENBQUM7SUFHcEMsSUFBSSxPQUFvQyxDQUFDO0lBRXpDLE1BQU0sTUFBTSxHQUFHLElBQUksS0FBTSxTQUFRLElBQUksRUFBbUI7UUFBckM7O1lBQ1Qsd0JBQW1CLEdBQUcsSUFBSSxDQUFDO1FBcUJyQyxDQUFDO1FBcEJTLGdCQUFnQixDQUN4QixXQUFnQixFQUNoQixRQUE0QixFQUM1QixJQUF5QixFQUN6QixLQUFhLEVBQ2IsS0FBd0I7WUFFeEIsc0JBQXNCLEdBQUcsSUFBSSxDQUFDO1lBQzlCLE9BQU8sSUFBSSxxQkFBcUIsQ0FBa0IsQ0FBQyxPQUFPLEVBQUUsRUFBRTtnQkFDN0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDekMsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQzt3QkFDbkMsTUFBTTtvQkFDUCxDQUFDO29CQUNELElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO3dCQUN2QixPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTyxFQUFFLENBQUM7b0JBQ3RCLENBQUM7b0JBQ0QsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0IsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztLQUNELENBQUM7SUFFRixNQUFNLGFBQWEsR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQTBCO1FBQzVELGlCQUFpQixDQUFDLFFBQTJCO1lBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUM7UUFDbkUsQ0FBQztLQUNELENBQUM7SUFFRix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixzQkFBc0IsR0FBRyxLQUFLLENBQUM7UUFDL0IsVUFBVSxHQUFHLElBQUksMEJBQTBCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0QsT0FBTyxHQUFHO1lBQ1QsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFO1NBQ2xGLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN0RCxNQUFNLFNBQVMsR0FBRyxNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBRTFGLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvQyxNQUFNLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQThCLENBQUM7UUFDaE0sT0FBTyxHQUFHO1lBQ1QsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFO1lBQ3RGLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFBRTtZQUN2RixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQUU7WUFDdEYsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFO1lBQ3ZGLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFBRTtTQUN0RixDQUFDO1FBRUYsTUFBTSxTQUFTLEdBQUcsTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXZELE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5QyxNQUFNLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxJQUFJLEVBQThCLENBQUM7UUFDbk0sT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUViLE1BQU0sU0FBUyxHQUFHLE1BQU0sVUFBVSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV2RCxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsK0NBQStDLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsQ0FBQyxzQkFBc0IsRUFBRSx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3pFLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLGlGQUFpRixDQUFDLENBQUM7SUFDM0ksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbkQsTUFBTSxNQUFNLEdBQUcsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsU0FBUyxFQUE4QixDQUFDO1FBQ3hNLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFFYixNQUFNLE1BQU0sR0FBRyxNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEQsTUFBTSxRQUFRLEdBQUcsTUFBTSxVQUFVLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTFELE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLEdBQUcsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sQ0FBQyxDQUFDLHNCQUFzQixFQUFFLHVDQUF1QyxDQUFDLENBQUM7UUFDekUsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsaUZBQWlGLENBQUMsQ0FBQztJQUMxSSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RCxNQUFNLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxFQUFFLEVBQThCLENBQUM7UUFDak0sT0FBTyxHQUFHO1lBQ1QsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFO1lBQ3RGLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFBRTtZQUN2RixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQUU7WUFDdEYsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFO1lBQ3ZGLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxFQUFxQjtZQUM1SSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQUU7WUFDdEYsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFO1lBQ3hGLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFBRTtZQUN2RixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDLEVBQUU7WUFDdkYsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFO1NBQ3hGLENBQUM7UUFFRixNQUFNLFNBQVMsR0FBRyxNQUFNLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFdkQsTUFBTSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO0lBQzNFLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==