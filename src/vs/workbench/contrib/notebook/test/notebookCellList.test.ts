/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SCROLLABLE_ELEMENT_PADDING_TOP } from 'vs/workbench/contrib/notebook/browser/constants';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';

suite('NotebookCellList', () => {
	const instantiationService = setupInstantiationService();

	test('revealElementsInView: reveal fully visible cell should not scroll', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markdown, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50]
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210 + SCROLLABLE_ELEMENT_PADDING_TOP, 100);
				// scroll a bit, scrollTop to bottom: 5, 215
				cellList.scrollTop = 5;

				// init scrollTop and scrollBottom
				assert.deepStrictEqual(cellList.scrollTop, 5);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);

				// reveal cell 1, top 50, bottom 150, which is fully visible in the viewport
				cellList.revealElementsInView({ start: 1, end: 2 });
				assert.deepStrictEqual(cellList.scrollTop, 5);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);

				// reveal cell 2, top 150, bottom 200, which is fully visible in the viewport
				cellList.revealElementsInView({ start: 2, end: 3 });
				assert.deepStrictEqual(cellList.scrollTop, 5);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);

				// reveal cell 3, top 200, bottom 300, which is partially visible in the viewport
				cellList.revealElementsInView({ start: 3, end: 4 });
				assert.deepStrictEqual(cellList.scrollTop, 90);
			});
	});

	test('revealElementsInView: reveal partially visible cell', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markdown, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50]
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210 + SCROLLABLE_ELEMENT_PADDING_TOP, 100);

				// init scrollTop and scrollBottom
				assert.deepStrictEqual(cellList.scrollTop, 0);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);

				// reveal cell 3, top 200, bottom 300, which is partially visible in the viewport
				cellList.revealElementsInView({ start: 3, end: 4 });
				assert.deepStrictEqual(cellList.scrollTop, 90);

				// scroll to 5
				cellList.scrollTop = 5;
				assert.deepStrictEqual(cellList.scrollTop, 5);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);

				// reveal cell 0, top 0, bottom 50
				cellList.revealElementsInView({ start: 0, end: 1 });
				assert.deepStrictEqual(cellList.scrollTop, 0);
			});
	});

	test('revealElementsInView: reveal cell out of viewport', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markdown, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50]
				});

				const cellList = createNotebookCellList(instantiationService);
				// without additionalscrollheight, the last 20 px will always be hidden due to `SCROLLABLE_ELEMENT_PADDING_TOP`
				cellList.updateOptions({ additionalScrollHeight: 100 });
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210 + SCROLLABLE_ELEMENT_PADDING_TOP, 100);

				// init scrollTop and scrollBottom
				assert.deepStrictEqual(cellList.scrollTop, 0);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);

				cellList.revealElementsInView({ start: 4, end: 5 });
				assert.deepStrictEqual(cellList.scrollTop, 140);
				// assert.deepStrictEqual(cellList.getViewScrollBottom(), 330);
			});
	});

	test('updateElementHeight', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markdown, [], {}]
			],
			async (editor) => {
				const viewModel = editor.viewModel;
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50]
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210 + SCROLLABLE_ELEMENT_PADDING_TOP, 100);

				// init scrollTop and scrollBottom
				assert.deepStrictEqual(cellList.scrollTop, 0);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);

				cellList.updateElementHeight(0, 60);
				assert.deepStrictEqual(cellList.scrollTop, 0);

				// scroll to 5
				cellList.scrollTop = 5;
				assert.deepStrictEqual(cellList.scrollTop, 5);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);

				cellList.updateElementHeight(0, 80);
				assert.deepStrictEqual(cellList.scrollTop, 5);
			});
	});

	test.skip('updateElementHeight with anchor', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markdown, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markdown, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['# header c', 'markdown', CellKind.Markdown, [], {}]
			],
			async (editor) => {
				// await new Promise(c => setTimeout(c, 3000));

				const viewModel = editor.viewModel;
				viewModel.restoreEditorViewState({
					editingCells: [false, false, false, false, false],
					editorViewStates: [null, null, null, null, null],
					cellTotalHeights: [50, 100, 50, 100, 50]
				});

				const cellList = createNotebookCellList(instantiationService);
				cellList.attachViewModel(viewModel);

				// render height 210, it can render 3 full cells and 1 partial cell
				cellList.layout(210 + SCROLLABLE_ELEMENT_PADDING_TOP, 100);

				// init scrollTop and scrollBottom
				assert.deepStrictEqual(cellList.scrollTop, 0);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);

				// scroll to 5
				cellList.scrollTop = 5;
				assert.deepStrictEqual(cellList.scrollTop, 5);
				assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);

				cellList.setFocus([1]);
				cellList.updateElementHeight2(viewModel.cellAt(0)!, 100);
				assert.deepStrictEqual(cellList.scrollHeight, 400);

				// bug!
				assert.deepStrictEqual(cellList.scrollTop, 55);
			});
	});
});
