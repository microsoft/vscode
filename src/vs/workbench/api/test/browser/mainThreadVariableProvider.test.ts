/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestMainThreadNotebookKernels } from './TestMainThreadNotebookKernels.js';
import { ExtHostNotebookKernelsShape } from '../../common/extHost.protocol.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { AsyncIterableProducer } from '../../../../base/common/async.js';
import { VariablesResult } from '../../../contrib/notebook/common/notebookKernelService.js';

type variableGetter = () => Promise<VariablesResult>;

suite('MainThreadNotebookKernelVariableProvider', function () {
	let mainThreadKernels: TestMainThreadNotebookKernels;
	let variables: (VariablesResult | variableGetter)[];

	teardown(function () {
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async function () {
		const proxy = new class extends mock<ExtHostNotebookKernelsShape>() {
			override async $provideVariables(handle: number, requestId: string, notebookUri: UriComponents, parentId: number | undefined, kind: 'named' | 'indexed', start: number, token: CancellationToken): Promise<void> {
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

async function verifyVariables(variables: AsyncIterableProducer<VariablesResult>, expectedIds: number[]) {
	let varIx = 0;

	for await (const variable of variables) {
		assert.ok(expectedIds[varIx], 'more variables than expected');
		assert.strictEqual(variable.id, expectedIds[varIx++]);
	}
}

function createVariable(id: number) {
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
