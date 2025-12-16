/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INotebookVariableElement, NotebookVariableDataSource } from '../../browser/contrib/notebookVariables/notebookVariablesDataSource.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { INotebookKernel, INotebookKernelService, VariablesResult } from '../../common/notebookKernelService.js';


suite('NotebookVariableDataSource', () => {
	let dataSource: NotebookVariableDataSource;
	const notebookModel = { uri: 'one.ipynb', languages: ['python'] } as unknown as NotebookTextModel;
	let provideVariablesCalled: boolean;

	type VariablesResultWithAction = VariablesResult & { action?: () => void };
	let results: VariablesResultWithAction[];

	const kernel = new class extends mock<INotebookKernel>() {
		override hasVariableProvider = true;
		override provideVariables(
			notebookUri: URI,
			parentId: number | undefined,
			kind: 'named' | 'indexed',
			start: number,
			token: CancellationToken
		): AsyncIterableProducer<VariablesResult> {
			provideVariablesCalled = true;
			return new AsyncIterableProducer<VariablesResult>((emitter) => {
				for (let i = 0; i < results.length; i++) {
					if (token.isCancellationRequested) {
						break;
					}
					if (results[i].action) {
						results[i].action!();
					}
					emitter.emitOne(results[i]);
				}
			});
		}
	};

	const kernelService = new class extends mock<INotebookKernelService>() {
		override getMatchingKernel(notebook: NotebookTextModel) {
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
		const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 5 } as INotebookVariableElement;
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
		const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 2000 } as INotebookVariableElement;
		results = [];

		const variables = await dataSource.getChildren(parent);

		assert(variables.length > 1, 'We should have results for groups of children');
		assert(!provideVariablesCalled, 'provideVariables should not be called');
		assert.equal(variables[0].extHostId, parent.extHostId, 'ExtHostId should match the parent since we will use it to get the real children');
	});

	test('Get children for very large list', async () => {
		const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 1_000_000 } as INotebookVariableElement;
		results = [];

		const groups = await dataSource.getChildren(parent);
		const children = await dataSource.getChildren(groups[99]);

		assert(children.length === 100, 'We should have a full page of child groups');
		assert(!provideVariablesCalled, 'provideVariables should not be called');
		assert.equal(children[0].extHostId, parent.extHostId, 'ExtHostId should match the parent since we will use it to get the real children');
	});

	test('Cancel while enumerating through children', async () => {
		const parent = { kind: 'variable', notebook: notebookModel, id: '1', extHostId: 1, name: 'list', value: '[...]', hasNamedChildren: false, indexedChildrenCount: 10 } as INotebookVariableElement;
		results = [
			{ id: 2, name: 'first', value: '1', hasNamedChildren: false, indexedChildrenCount: 0 },
			{ id: 3, name: 'second', value: '2', hasNamedChildren: false, indexedChildrenCount: 0 },
			{ id: 4, name: 'third', value: '3', hasNamedChildren: false, indexedChildrenCount: 0 },
			{ id: 5, name: 'fourth', value: '4', hasNamedChildren: false, indexedChildrenCount: 0 },
			{ id: 5, name: 'fifth', value: '4', hasNamedChildren: false, indexedChildrenCount: 0, action: () => dataSource.cancel() } as VariablesResult,
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
