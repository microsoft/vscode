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


	test('Ensure placeholder positions are as expected', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['# header 2', 'markdown', CellKind.Markup, [], {}],
			],
			(editor, viewModel, ds) => {
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

				const modified1 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(1)!.model)),
					'modified',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const modified2 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(1)!.model)),
					'modified',
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

				const unmodified5 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'unchanged',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const unmodified6 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'unchanged',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const modified3 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(1)!.model)),
					'modified',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const unmodified7 = ds.add(new SideBySideDiffElementViewModel(
					viewModel.notebookDocument,
					viewModel.notebookDocument,
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					ds.add(createDiffNestedViewModel(viewModel.cellAt(0)!.model)),
					'unchanged',
					ds.add(new NotebookDiffEditorEventDispatcher()),
					initData));

				const diffViewModel = ds.add(new NotebookDiffViewModel());
				diffViewModel.setViewModel([unmodified1, unmodified2, modified1, modified2, unmodified3, unmodified4, unmodified5, unmodified6, modified3, unmodified7]);

				// Default state
				assert.strictEqual(diffViewModel.items.length, 6);
				assert.ok(diffViewModel.items[0] instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[1], modified1);
				assert.deepStrictEqual(diffViewModel.items[2], modified2);
				assert.ok(diffViewModel.items[3] instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[4], modified3);
				assert.ok(diffViewModel.items[5] instanceof DiffElementPlaceholderViewModel);

				// Expand first collapsed section.
				let eventArgs: INotebookDiffViewModelUpdateEvent | undefined = undefined;
				ds.add(diffViewModel.onDidChangeItems(e => eventArgs = e));
				diffViewModel.items[0].showHiddenCells();

				assert.strictEqual(diffViewModel.items.length, 7);
				assert.deepStrictEqual(diffViewModel.items[0], unmodified1);
				assert.deepStrictEqual(diffViewModel.items[1], unmodified2);
				assert.deepStrictEqual(diffViewModel.items[2], modified1);
				assert.deepStrictEqual(diffViewModel.items[3], modified2);
				assert.ok(diffViewModel.items[4] instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[5], modified3);
				assert.ok(diffViewModel.items[6] instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 1, elements: [unmodified1, unmodified2] });

				// Collapse the 1st two cells
				(diffViewModel.items[0] as SideBySideDiffElementViewModel).hideUnchangedCells();

				assert.strictEqual(diffViewModel.items.length, 6);
				assert.ok((diffViewModel.items[0] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[1], modified1);
				assert.deepStrictEqual(diffViewModel.items[2], modified2);
				assert.ok((diffViewModel.items[3] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[4], modified3);
				assert.ok((diffViewModel.items[5] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 2, elements: [diffViewModel.items[0]] });


				// Expand second collapsed section.
				(diffViewModel.items[3] as any).showHiddenCells();

				assert.strictEqual(diffViewModel.items.length, 9);
				assert.ok((diffViewModel.items[0] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[1], modified1);
				assert.deepStrictEqual(diffViewModel.items[2], modified2);
				assert.deepStrictEqual(diffViewModel.items[3], unmodified3);
				assert.deepStrictEqual(diffViewModel.items[4], unmodified4);
				assert.deepStrictEqual(diffViewModel.items[5], unmodified5);
				assert.deepStrictEqual(diffViewModel.items[6], unmodified6);
				assert.deepStrictEqual(diffViewModel.items[7], modified3);
				assert.ok((diffViewModel.items[8] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(eventArgs, { start: 3, deleteCount: 1, elements: [unmodified3, unmodified4, unmodified5, unmodified6] });

				// Collapse the 2nd section
				(diffViewModel.items[3] as SideBySideDiffElementViewModel).hideUnchangedCells();

				assert.strictEqual(diffViewModel.items.length, 6);
				assert.ok((diffViewModel.items[0] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[1], modified1);
				assert.deepStrictEqual(diffViewModel.items[2], modified2);
				assert.ok((diffViewModel.items[3] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(diffViewModel.items[4], modified3);
				assert.ok((diffViewModel.items[5] as any) instanceof DiffElementPlaceholderViewModel);
				assert.deepStrictEqual(eventArgs, { start: 3, deleteCount: 4, elements: [diffViewModel.items[3]] });
			}
		);
	});

	function createDiffNestedViewModel(cellTextModel: NotebookCellTextModel) {
		return new DiffNestedCellViewModel(cellTextModel, instantiationService.get<INotebookService>(INotebookService));
	}
});
