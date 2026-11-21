/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { CellKind } from '../../common/notebookCommon.js';
import { createTestNotebookEditor, setupInstantiationService } from './testNotebookEditor.js';

suite('BaseCellViewModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createCell(kind = CellKind.Code, synchronousError?: Error) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = setupInstantiationService(store);
		const requests: DeferredPromise<IReference<IResolvedTextEditorModel>>[] = [];
		const disposeCalls: number[] = [];
		instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() {
			override createModelReference() {
				if (synchronousError) {
					const error = synchronousError;
					synchronousError = undefined;
					throw error;
				}
				const request = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
				requests.push(request);
				return request.p;
			}
		});

		const { viewModel } = createTestNotebookEditor(instantiationService, store, [['test', 'plaintext', kind]]);
		const cell = viewModel.cellAt(0)!;
		const textModel = store.add(createTextModel('test', 'plaintext', undefined, cell.uri));
		cell.model.textModel = textModel;

		function createReference(resolvedModel = textModel): IReference<IResolvedTextEditorModel> {
			const index = disposeCalls.push(0) - 1;
			return {
				object: new class extends mock<IResolvedTextEditorModel>() {
					override readonly textEditorModel = resolvedModel;
				},
				dispose: () => { disposeCalls[index]++; }
			};
		}

		return { cell, textModel, requests, disposeCalls, createReference };
	}

	for (const kind of [CellKind.Code, CellKind.Markup]) {
		for (const reverse of [false, true]) {
			test(`retains one reference from concurrent requests (${CellKind[kind]}, ${reverse ? 'reverse' : 'forward'} completion)`, async () => {
				const { cell, textModel, requests, disposeCalls, createReference } = createCell(kind);
				const first = cell.resolveTextModel();
				const second = cell.resolveTextModel();
				const requestCount = requests.length;
				for (const request of reverse ? [...requests].reverse() : requests) {
					await request.complete(createReference());
				}
				const models = await Promise.all([first, second]);
				const cached = await cell.resolveTextModel();
				const retainedReferences = disposeCalls.filter(count => count === 0).length;
				cell.detachTextEditor();
				assert.deepStrictEqual({
					requests: requests.length,
					models: models.map(model => model === textModel),
					cached: cached === textModel,
					retainedReferences,
					disposeCalls
				}, { requests: requestCount, models: [true, true], cached: true, retainedReferences: 1, disposeCalls: Array(requestCount).fill(1) });

				const next = cell.resolveTextModel();
				await requests[requestCount].complete(createReference());
				assert.strictEqual(await next, textModel);
				cell.detachTextEditor();
				assert.deepStrictEqual(disposeCalls, Array(requestCount + 1).fill(1));
			});
		}
	}

	test('reacquires a reference when detaching in a resolution microtask', async () => {
		const { cell, textModel, requests, disposeCalls, createReference } = createCell();
		const first = cell.resolveTextModel();
		const second = new DeferredPromise<ITextModel>();
		const completingFirst = requests[0].complete(createReference());
		queueMicrotask(() => {
			cell.detachTextEditor();
			void second.settleWith(cell.resolveTextModel());
			if (requests[1]) {
				void requests[1].complete(createReference());
			}
		});
		await completingFirst;
		const models = await Promise.all([first, second.p]);
		const retainedReferences = disposeCalls.filter(count => count === 0).length;
		cell.detachTextEditor();
		assert.deepStrictEqual({
			requests: requests.length,
			models: models.map(model => model === textModel),
			retainedReferences,
			disposeCalls
		}, { requests: 2, models: [true, true], retainedReferences: 1, disposeCalls: [1, 1] });
	});

	test('releases a reference resolved after the cell is disposed', async () => {
		const { cell, requests, disposeCalls, createReference } = createCell();
		const pending = Promise.allSettled([cell.resolveTextModel(), cell.resolveTextModel()]);
		const requestCount = requests.length;
		cell.dispose();
		for (const request of requests) {
			await request.complete(createReference());
		}
		const results = await pending;
		await assert.rejects(() => cell.resolveTextModel(), isCancellationError);
		assert.deepStrictEqual({
			requests: requests.length,
			cancelled: results.map(result => result.status === 'rejected' && isCancellationError(result.reason)),
			disposeCalls
		}, { requests: requestCount, cancelled: [true, true], disposeCalls: Array(requestCount).fill(1) });
	});

	test('retains one reference when detaching with resolutions in flight', async () => {
		const { cell, textModel, requests, disposeCalls, createReference } = createCell();
		const first = cell.resolveTextModel();
		cell.detachTextEditor();
		const second = cell.resolveTextModel();
		for (const request of requests) {
			await request.complete(createReference());
		}
		const models = await Promise.all([first, second]);
		const retainedReferences = disposeCalls.filter(count => count === 0).length;
		cell.dispose();
		assert.deepStrictEqual({
			models: models.map(model => model === textModel),
			retainedReferences,
			disposeCalls
		}, { models: [true, true], retainedReferences: 1, disposeCalls: Array(requests.length).fill(1) });
	});

	test('releases the previous reference when its text model has been disposed', async () => {
		const { cell, textModel, requests, disposeCalls, createReference } = createCell();
		const first = cell.resolveTextModel();
		await requests[0].complete(createReference());
		await first;
		textModel.dispose();
		const next = cell.resolveTextModel();
		const replacement = disposables.add(createTextModel('replacement', 'plaintext', undefined, cell.uri));
		cell.model.textModel = replacement;
		await requests[1].complete(createReference(replacement));
		assert.strictEqual(await next, replacement);
		const retainedReferences = disposeCalls.filter(count => count === 0).length;
		cell.detachTextEditor();
		assert.deepStrictEqual({ retainedReferences, disposeCalls }, { retainedReferences: 1, disposeCalls: [1, 1] });
	});

	test('retries text model resolution after asynchronous failures', async () => {
		const { cell, requests, disposeCalls, createReference } = createCell();
		const error = new Error('Cannot resolve text model');
		const pending = Promise.allSettled([cell.resolveTextModel(), cell.resolveTextModel()]);
		const requestCount = requests.length;
		for (const request of requests) {
			await request.error(error);
		}
		const results = await pending;
		assert.deepStrictEqual({
			requests: requests.length,
			rejected: results.map(result => result.status === 'rejected' && result.reason === error)
		}, { requests: requestCount, rejected: [true, true] });

		const retry = cell.resolveTextModel();
		await requests[requestCount].complete(createReference());
		await retry;
		cell.detachTextEditor();
		assert.deepStrictEqual(disposeCalls, [1]);
	});

	test('retries text model resolution after a synchronous failure', async () => {
		const error = new Error('Cannot start text model resolution');
		const { cell, textModel, requests, disposeCalls, createReference } = createCell(CellKind.Code, error);
		await assert.rejects(() => cell.resolveTextModel(), candidate => candidate === error);
		const retry = cell.resolveTextModel();
		await requests[0].complete(createReference());
		assert.strictEqual(await retry, textModel);
		cell.detachTextEditor();
		assert.deepStrictEqual(disposeCalls, [1]);
	});
});
