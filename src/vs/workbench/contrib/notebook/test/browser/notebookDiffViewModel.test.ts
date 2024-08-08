/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { DiffElementPlaceholderViewModel, SideBySideDiffElementViewModel, SingleSideDiffElementViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { DiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffNestedCellViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { mock } from 'vs/base/test/common/mock';
import { Event } from 'vs/base/common/event';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';
import { NotebookDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffViewModel';
import { INotebookDiffViewModelUpdateEvent } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';

suite('Notebook Diff ViewModel', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	const initData = { fontInfo: undefined, metadataStatusHeight: 0, outputStatusHeight: 0 };
	teardown(() => disposables.dispose());

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		disposables = new DisposableStore();
		disposables.add({ dispose: () => sinon.restore() });
		instantiationService = setupInstantiationService(disposables);
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidAddNotebookDocument = Event.None;
			override onWillRemoveNotebookDocument = Event.None;
			override getNotebookTextModels() { return []; }
			override getOutputMimeTypeInfo() { return []; }
		});

	});


	test('Cells are returned as they are', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const cell1 = ds.add(new SingleSideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					undefined,
					'delete',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const cell2 = ds.add(new SingleSideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					undefined,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'insert',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const diffViewModel = ds.add(new NotebookDiffViewModel());
				diffViewModel.setViewModel([cell1, cell2]);

				assert.deepStrictEqual(diffViewModel.items, [cell1, cell2]);
			}
		);
	});

	test('Trigger change event when viewmodel is updated', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const cell1 = ds.add(new SingleSideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					undefined,
					'delete',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const cell2 = ds.add(new SingleSideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					undefined,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'insert',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const diffViewModel = ds.add(new NotebookDiffViewModel());
				diffViewModel.setViewModel([cell1]);

				assert.deepStrictEqual(diffViewModel.items, [cell1]);

				let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
				Event.once(diffViewModel.onDidChangeItems)(e => eventArgs = e);

				diffViewModel.setViewModel([cell2]);

				assert.deepStrictEqual(diffViewModel.items, [cell2]);
				assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 1, elements: [cell2] });

				eventArgs = undefined;
				Event.once(diffViewModel.onDidChangeItems)(e => eventArgs = e);

				diffViewModel.setViewModel([]);

				assert.deepStrictEqual(diffViewModel.items, []);
				assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 1, elements: [] });
			}
		);
	});

	test('Unmodified cells should be replace with placeholders', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
				const deleted = ds.add(new SingleSideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					undefined,
					'delete',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const inserted = ds.add(new SingleSideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					undefined,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'insert',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const unmodified1 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'unchanged',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const unmodified2 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'unchanged',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const unmodified3 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'unchanged',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const unmodified4 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'unchanged',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const diffViewModel = ds.add(new NotebookDiffViewModel());
				diffViewModel.setViewModel([deleted, unmodified1, inserted, unmodified2, unmodified3, unmodified4]);

				// Default state
				assert.strictEqual(diffViewModel.items.length, 4);
				assert.deepStrictEqual(diffViewModel.items[0], deleted);
				assert.deepStrictEqual(diffViewModel.items[2], inserted);
				assert.ok(diffViewModel.items[1] instanceof DiffElementPlaceholderViewModel);
				assert.ok(diffViewModel.items[3] instanceof DiffElementPlaceholderViewModel);

				// Expand first collapsed section.
				let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
				Event.once(diffViewModel.onDidChangeItems)(e => eventArgs = e);
				diffViewModel.items[1].showHiddenCells();

				assert.deepStrictEqual(diffViewModel.items[0], deleted);
				assert.deepStrictEqual(diffViewModel.items[1], unmodified1);
				assert.deepStrictEqual(diffViewModel.items[2], inserted);
				assert.ok(diffViewModel.items[3] instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [unmodified1] });

				// Expand last collapsed section.
				Event.once(diffViewModel.onDidChangeItems)(e => eventArgs = e);
				diffViewModel.items[3].showHiddenCells();

				assert.deepStrictEqual(diffViewModel.items, [deleted, unmodified1, inserted, unmodified2, unmodified3, unmodified4]);

				// Collapse the second cell
				(diffViewModel.items[1] as SideBySideDiffElementViewModel).hideUnchangedCells();

				// Verify we collpased second cell
				assert.deepStrictEqual(diffViewModel.items[0], deleted);
				assert.deepStrictEqual(diffViewModel.items[2], inserted);
				assert.ok((diffViewModel.items[1] as any) instanceof DiffElementPlaceholderViewModel);

				// Collapse the 4th cell
				(diffViewModel.items[3] as SideBySideDiffElementViewModel).hideUnchangedCells();

				// Verify we collpased second cell
				assert.strictEqual(diffViewModel.items.length, 4);
				assert.deepStrictEqual(diffViewModel.items[0], deleted);
				assert.deepStrictEqual(diffViewModel.items[2], inserted);
				assert.ok((diffViewModel.items[1] as any) instanceof DiffElementPlaceholderViewModel);
				assert.ok((diffViewModel.items[3] as any) instanceof DiffElementPlaceholderViewModel);
			}
		);
	});

	function createDiffNestedViewModel(cellTextModel: NotebookCellTextModel) {
		return new DiffNestedCellViewModel(cellTextModel, instantiationService.get<INotebookService>(INotebookService));
	}
});
