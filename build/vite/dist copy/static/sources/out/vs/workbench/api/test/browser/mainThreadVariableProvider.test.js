/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestMainThreadNotebookKernels } from './TestMainThreadNotebookKernels.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
suite('MainThreadNotebookKernelVariableProvider', function () {
    let mainThreadKernels;
    let variables;
    teardown(function () {
    });
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async function () {
        const proxy = new class extends mock() {
            async $provideVariables(handle, requestId, notebookUri, parentId, kind, start, token) {
                for (const variable of variables) {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    const result = typeof variable === 'function'
                        ? await variable()
                        : variable;
                    mainThreadKernels.instance.$receiveVariable(requestId, result);
                }
            }
        };
        const extHostContext = SingleProxyRPCProtocol(proxy);
        variables = [];
        mainThreadKernels = store.add(new TestMainThreadNotebookKernels(extHostContext));
    });
    test('get variables from kernel', async function () {
        await mainThreadKernels.addKernel('test-kernel');
        const kernel = mainThreadKernels.getKernel('test-kernel');
        assert.ok(kernel, 'Kernel should be registered');
        variables.push(createVariable(1));
        variables.push(createVariable(2));
        const vars = kernel.provideVariables(URI.file('nb.ipynb'), undefined, 'named', 0, CancellationToken.None);
        await verifyVariables(vars, [1, 2]);
    });
    test('get variables twice', async function () {
        await mainThreadKernels.addKernel('test-kernel');
        const kernel = mainThreadKernels.getKernel('test-kernel');
        assert.ok(kernel, 'Kernel should be registered');
        variables.push(createVariable(1));
        variables.push(createVariable(2));
        const vars = kernel.provideVariables(URI.file('nb.ipynb'), undefined, 'named', 0, CancellationToken.None);
        const vars2 = kernel.provideVariables(URI.file('nb.ipynb'), undefined, 'named', 0, CancellationToken.None);
        await verifyVariables(vars, [1, 2]);
        await verifyVariables(vars2, [1, 2]);
    });
    test('gets all variables async', async function () {
        await mainThreadKernels.addKernel('test-kernel');
        const kernel = mainThreadKernels.getKernel('test-kernel');
        assert.ok(kernel, 'Kernel should be registered');
        variables.push(createVariable(1));
        const result = createVariable(2);
        variables.push(async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return result;
        });
        variables.push(createVariable(3));
        const vars = kernel.provideVariables(URI.file('nb.ipynb'), undefined, 'named', 0, CancellationToken.None);
        await verifyVariables(vars, [1, 2, 3]);
    });
    test('cancel while getting variables', async function () {
        await mainThreadKernels.addKernel('test-kernel');
        const kernel = mainThreadKernels.getKernel('test-kernel');
        assert.ok(kernel, 'Kernel should be registered');
        variables.push(createVariable(1));
        const result = createVariable(2);
        variables.push(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return result;
        });
        variables.push(createVariable(3));
        const cancellation = new CancellationTokenSource();
        const vars = kernel.provideVariables(URI.file('nb.ipynb'), undefined, 'named', 0, cancellation.token);
        cancellation.cancel();
        await verifyVariables(vars, [1, 2]);
    });
});
async function verifyVariables(variables, expectedIds) {
    let varIx = 0;
    for await (const variable of variables) {
        assert.ok(expectedIds[varIx], 'more variables than expected');
        assert.strictEqual(variable.id, expectedIds[varIx++]);
    }
}
function createVariable(id) {
    return {
        id,
        name: `var${id}`,
        value: `${id}`,
        type: 'number',
        expression: `var${id}`,
        hasNamedChildren: false,
        indexedChildrenCount: 0,
        extensionId: 'extension-id1',
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFZhcmlhYmxlUHJvdmlkZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRWYXJpYWJsZVByb3ZpZGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRW5GLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBTXRFLEtBQUssQ0FBQywwQ0FBMEMsRUFBRTtJQUNqRCxJQUFJLGlCQUFnRCxDQUFDO0lBQ3JELElBQUksU0FBK0MsQ0FBQztJQUVwRCxRQUFRLENBQUM7SUFDVCxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsS0FBSyxDQUFDLEtBQUs7UUFDVixNQUFNLEtBQUssR0FBRyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQStCO1lBQ3pELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxNQUFjLEVBQUUsU0FBaUIsRUFBRSxXQUEwQixFQUFFLFFBQTRCLEVBQUUsSUFBeUIsRUFBRSxLQUFhLEVBQUUsS0FBd0I7Z0JBQy9MLEtBQUssTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQ2xDLElB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