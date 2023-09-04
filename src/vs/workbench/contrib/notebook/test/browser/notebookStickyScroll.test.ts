/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWeb } from 'vs/base/common/platform';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { mock } from 'vs/base/test/common/mock';
import { assertSnapshot } from 'vs/base/test/common/snapshot';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { NotebookCellOutline } from 'vs/workbench/contrib/notebook/browser/contrib/outline/notebookOutline';
import { INotebookEditor, INotebookEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { OutlineEntry } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineProvider';
import { NotebookStickyLine, computeContent } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookEditorStickyScroll';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { OutlineTarget } from 'vs/workbench/services/outline/browser/outline';


(isWeb ? suite.skip : suite)('NotebookEditorStickyScroll', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	const domNode: HTMLElement = document.createElement('div');

	suiteSetup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
	});

	suiteTeardown(() => disposables.dispose());

	function getOutline(editor: any) {
		if (!editor.hasModel()) {
			assert.ok(false, 'MUST have active text editor');
		}
		const outline = instantiationService.createInstance(NotebookCellOutline, new class extends mock<INotebookEditorPane>() {
			override getControl() {
				return editor;
			}
			override onDidChangeModel: Event<void> = Event.None;
		}, OutlineTarget.QuickPick);
		return outline;
	}

	function nbStickyTestHelper(domNode: HTMLElement, notebookEditor: INotebookEditor, notebookCellList: INotebookCellList, notebookOutlineEntries: OutlineEntry[]) {
		const output = computeContent(domNode, notebookEditor, notebookCellList, notebookOutlineEntries);
		return createStickyTestElement(output.values());
	}

	function createStickyTestElement(stickyLines: IterableIterator<{ line: NotebookStickyLine; rendered: boolean }>) {
		const outputElements = [];
		for (const stickyLine of stickyLines) {
			if (stickyLine.rendered) {
				outputElements.unshift(stickyLine.line.element.innerText);
			}
		}
		return outputElements;
	}

	test('test0: should render empty, 	scrollTop at 0', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['## header aa', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var c = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 8 }, () => false),
					editorViewStates: Array.from({ length: 8 }, () => null),
					cellTotalHeights: Array.from({ length: 8 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(0);
				editor.visibleRanges = [{ start: 0, end: 8 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);
				await assertSnapshot(resultingMap);
			});
	});

	test('test1: should render 0->1, 	visible range 3->8', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],	// 0
				['## header aa', 'markdown', CellKind.Markup, [], {}],	// 50
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 100
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 150
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 200
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 250
				['# header b', 'markdown', CellKind.Markup, [], {}],	// 300
				['var c = 2;', 'javascript', CellKind.Code, [], {}]		// 350
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 8 }, () => false),
					editorViewStates: Array.from({ length: 8 }, () => null),
					cellTotalHeights: Array.from({ length: 8 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(175);
				editor.visibleRanges = [{ start: 3, end: 8 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);

				await assertSnapshot(resultingMap);
			});
	});

	test('test2: should render 0, 		visible range 6->9 so collapsing next 2 against following section', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],	// 0
				['## header aa', 'markdown', CellKind.Markup, [], {}],	// 50
				['### header aaa', 'markdown', CellKind.Markup, [], {}],// 100
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 150
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 200
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 250
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 300
				['# header b', 'markdown', CellKind.Markup, [], {}],	// 350
				['var c = 2;', 'javascript', CellKind.Code, [], {}]		// 400
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 9 }, () => false),
					editorViewStates: Array.from({ length: 9 }, () => null),
					cellTotalHeights: Array.from({ length: 9 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(325); // room for a single header
				editor.visibleRanges = [{ start: 6, end: 9 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);

				await assertSnapshot(resultingMap);
			});
	});

	test('test3: should render 0->1, 	collapsing against equivalent level header', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],	// 0
				['## header aa', 'markdown', CellKind.Markup, [], {}],	// 50
				['### header aaa', 'markdown', CellKind.Markup, [], {}],// 100
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 150
				['### header aab', 'markdown', CellKind.Markup, [], {}],// 200
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 250
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 300
				['var b = 1;', 'javascript', CellKind.Code, [], {}],	// 350
				['# header b', 'markdown', CellKind.Markup, [], {}],	// 400
				['var c = 2;', 'javascript', CellKind.Code, [], {}]		// 450
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 10 }, () => false),
					editorViewStates: Array.from({ length: 10 }, () => null),
					cellTotalHeights: Array.from({ length: 10 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(175); // room for a single header
				editor.visibleRanges = [{ start: 3, end: 10 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);

				await assertSnapshot(resultingMap);
			});
	});

	// outdated/improper behavior
	test.skip('test4: should render 0, 		scrolltop halfway through cell 0', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['## header aa', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var c = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 8 }, () => false),
					editorViewStates: Array.from({ length: 8 }, () => null),
					cellTotalHeights: Array.from({ length: 8 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(50);
				editor.visibleRanges = [{ start: 0, end: 8 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);

				await assertSnapshot(resultingMap);
			});
	});

	// outdated/improper behavior
	test.skip('test5: should render 0->2, 	scrolltop halfway through cell 2', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['## header aa', 'markdown', CellKind.Markup, [], {}],
				['### header aaa', 'markdown', CellKind.Markup, [], {}],
				['#### header aaaa', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var c = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 10 }, () => false),
					editorViewStates: Array.from({ length: 10 }, () => null),
					cellTotalHeights: Array.from({ length: 10 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(125);
				editor.visibleRanges = [{ start: 2, end: 10 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);

				await assertSnapshot(resultingMap);
			});
	});

	// outdated/improper behavior
	test.skip('test6: should render 6->7, 	scrolltop halfway through cell 7', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['## header aa', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['## header bb', 'markdown', CellKind.Markup, [], {}],
				['### header bbb', 'markdown', CellKind.Markup, [], {}],
				['var c = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 10 }, () => false),
					editorViewStates: Array.from({ length: 10 }, () => null),
					cellTotalHeights: Array.from({ length: 10 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(375);
				editor.visibleRanges = [{ start: 7, end: 10 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);

				await assertSnapshot(resultingMap);
			});
	});

	// waiting on behavior push to fix this.
	test('test7: should render 0->1, 	collapsing against next section', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}], 		//0
				['## header aa', 'markdown', CellKind.Markup, [], {}], 		//50
				['### header aaa', 'markdown', CellKind.Markup, [], {}], 	//100
				['#### header aaaa', 'markdown', CellKind.Markup, [], {}], 	//150
				['var b = 1;', 'javascript', CellKind.Code, [], {}], 		//200
				['var b = 1;', 'javascript', CellKind.Code, [], {}], 		//250
				['var b = 1;', 'javascript', CellKind.Code, [], {}], 		//300
				['var b = 1;', 'javascript', CellKind.Code, [], {}], 		//350
				['# header b', 'markdown', CellKind.Markup, [], {}], 		//400
				['## header bb', 'markdown', CellKind.Markup, [], {}], 		//450
				['### header bbb', 'markdown', CellKind.Markup, [], {}],
				['var c = 2;', 'javascript', CellKind.Code, [], {}]
			],
			async (editor, viewModel) => {
				viewModel.restoreEditorViewState({
					editingCells: Array.from({ length: 12 }, () => false),
					editorViewStates: Array.from({ length: 12 }, () => null),
					cellTotalHeights: Array.from({ length: 12 }, () => 50),
					cellLineNumberStates: {},
					collapsedInputCells: {},
					collapsedOutputCells: {},
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);
				cellList.layout(400, 100);

				editor.setScrollTop(350);
				editor.visibleRanges = [{ start: 7, end: 12 }];

				const notebookOutlineEntries = getOutline(editor).entries;
				const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries);

				await assertSnapshot(resultingMap);
			});
	});


});
