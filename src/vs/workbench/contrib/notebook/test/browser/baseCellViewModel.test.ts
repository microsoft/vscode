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
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { CellKind } from '../../common/notebookCommon.js';
import { createTestNotebookEditor, setupInstantiationService } from './testNotebookEditor.js';

suite('BaseCellViewModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createCell(kind = CellKind.Code) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = setupInstantiationService(store);
		const requests: DeferredPromise<IReference<IResolvedTextEditorModel>>[] = [];
		const disposeCalls: number[] = [];
		instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() {
			override createModelReference() {
				const request = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
				requests.push(request);
				return request.p;
			}
		});

		const { viewModel } = createTestNotebookEditor(instantiationService, store, [['test', 'plaintext', kind]]);
		const cell = viewModel.cellAt(0)!;
		const textModel = store.add(createTextModel('test', 'plaintext', undefined, cell.uri));
		cell.model.textModel = textModel;
		const editorModel = new class extends mock<IResolvedTextEditorModel>() {
			override readonly textEditorModel = textModel;
		};

		function createReference(): IReference<IResolvedTextEditorModel> {
			const index = disposeCalls.push(0) - 1;
			return {
				object: editorModel,
				dispose: () => { disposeCalls[index]++; }
			};
		}

		return { cell, textModel, requests, disposeCalls, createReference };
	}

	for (const kind of [CellKind.Code, CellKind.Markup]) {
		test(`concurrent text model requests share a reference (${CellKind[kind]})`, async () => {
			const { cell, textModel, requests, disposeCalls, createReference } = createCell(kind);
			const first = cell.resolveTextModel();
			const second = cell.resolveTextModel();
			for (const request of requests) {
				await request.complete(createReference());
			}
			const models = await Promise.all([first, second]);
			cell.detachTextEditor();
			assert.deepStrictEqual({
				requests: requests.length,
				models: models.map(model => model === textModel),
				disposeCalls
			}, { requests: 1, models: [true, true], disposeCalls: [1] });

			const next = cell.resolveTextModel();
			await requests[1].complete(createReference());
			await next;
			cell.detachTextEditor();
			assert.deepStrictEqual(disposeCalls, [1, 1]);
		});
	}

	test('releases a reference resolved after the cell is disposed', async () => {
		const { cell, requests, disposeCalls, createReference } = createCell();
		const pending = Promise.allSettled([cell.resolveTextModel(), cell.resolveTextModel()]);
		cell.dispose();
		for (const request of requests) {
			await request.complete(createReference());
		}
		const results = await pending;
		assert.deepStrictEqual({
			requests: requests.length,
			cancelled: results.map(result => result.status === 'rejected' && isCancellationError(result.reason)),
			disposeCalls
		}, { requests: 1, cancelled: [true, true], disposeCalls: [1] });
	});

	test('retries text model resolution after a shared request fails', async () => {
		const { cell, requests, disposeCalls, createReference } = createCell();
		const error = new Error('Cannot resolve text model');
		const pending = Promise.allSettled([cell.resolveTextModel(), cell.resolveTextModel()]);
		for (const request of requests) {
			await request.error(error);
		}
		const results = await pending;
		assert.deepStrictEqual({
			requests: requests.length,
			rejected: results.map(result => result.status === 'rejected' && result.reason === error)
		}, { requests: 1, rejected: [true, true] });

		const retry = cell.resolveTextModel();
		await requests[1].complete(createReference());
		await retry;
		cell.detachTextEditor();
		assert.deepStrictEqual(disposeCalls, [1]);
	});
});
