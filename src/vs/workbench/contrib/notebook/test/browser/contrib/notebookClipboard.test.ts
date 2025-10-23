/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { NotebookClipboardContribution, runCopyCells, runCutCells } from '../../../browser/contrib/clipboard/notebookClipboard.js';
import { CellKind, NOTEBOOK_EDITOR_ID, SelectionStateType } from '../../../common/notebookCommon.js';
import { withTestNotebook } from '../testNotebookEditor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IActiveNotebookEditor, INotebookEditor } from '../../../browser/notebookBrowser.js';
import { IVisibleEditorPane } from '../../../../../common/editor.js';
import { INotebookService } from '../../../common/notebookService.js';
import { FoldingModel, updateFoldingStateAtIndex } from '../../../browser/viewModel/foldingModel.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('Notebook Clipboard', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const createEditorService = (editor: IActiveNotebookEditor) => {
		const visibleEditorPane = new class extends mock<IVisibleEditorPane>() {
			override getId(): string {
				return NOTEBOOK_EDITOR_ID;
			}
			override getControl(): INotebookEditor {
				return editor;
			}
		};

		const editorService: IEditorService = new class extends mock<IEditorService>() {
			override get activeEditorPane(): IVisibleEditorPane | undefined {
				return visibleEditorPane;
			}
		};

		return editorService;
	};

	test.skip('Cut multiple selected cells', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() { override setToCopy() { } });

				const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 2 }, selections: [{ start: 0, end: 2 }] }, 'model');
				assert.ok(clipboardContrib.runCutAction(accessor));
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.strictEqual(viewModel.length, 1);
				assert.strictEqual(viewModel.cellAt(0)?.getText(), 'paragraph 2');
			});
	});

	test.skip('Cut should take folding info into account', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3', 'javascript', CellKind.Markup, [], {}],
				['# header d', 'markdown', CellKind.Markup, [], {}],
				['var e = 4;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				const foldingModel = new FoldingModel();
				foldingModel.attachViewModel(viewModel);

				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				editor.setHiddenAreas(viewModel.getHiddenRanges());
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }, 'model');

				accessor.stub(INotebookService, new class extends mock<INotebookService>() { override setToCopy() { } });

				const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
				clipboardContrib.runCutAction(accessor);
				assert.strictEqual(viewModel.length, 5);
				await viewModel.undo();
				assert.strictEqual(viewModel.length, 7);
			});
	});

	test.skip('Copy should take folding info into account', async function () {
		await withTestNotebook(
			[
				['# header a', 'markdown', CellKind.Markup, [], {}],
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header b', 'markdown', CellKind.Markup, [], {}],
				['var b = 2;', 'javascript', CellKind.Code, [], {}],
				['var c = 3', 'javascript', CellKind.Markup, [], {}],
				['# header d', 'markdown', CellKind.Markup, [], {}],
				['var e = 4;', 'javascript', CellKind.Code, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				const foldingModel = new FoldingModel();
				foldingModel.attachViewModel(viewModel);

				updateFoldingStateAtIndex(foldingModel, 0, true);
				updateFoldingStateAtIndex(foldingModel, 2, true);
				viewModel.updateFoldingRanges(foldingModel.regions);
				editor.setHiddenAreas(viewModel.getHiddenRanges());
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }, 'model');

				let _cells: NotebookCellTextModel[] = [];
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					override setToCopy(cells: NotebookCellTextModel[]) { _cells = cells; }
					override getToCopy() { return { items: _cells, isCopy: true }; }
				});

				const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
				clipboardContrib.runCopyAction(accessor);
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 6, end: 7 }, selections: [{ start: 6, end: 7 }] }, 'model');
				clipboardContrib.runPasteAction(accessor);

				assert.strictEqual(viewModel.length, 9);
				assert.strictEqual(viewModel.cellAt(8)?.getText(), 'var b = 1;');
			});
	});

	test.skip('#119773, cut last item should not focus on the top first cell', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() { override setToCopy() { } });
				const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, 'model');
				assert.ok(clipboardContrib.runCutAction(accessor));
				// it should be the last cell, other than the first one.
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
			});
	});

	test.skip('#119771, undo paste should restore selections', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					override setToCopy() { }
					override getToCopy() {
						return {
							items: [
								viewModel.cellAt(0)!.model
							],
							isCopy: true
						};
					}
				});

				const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, 'model');
				assert.ok(clipboardContrib.runPasteAction(accessor));

				assert.strictEqual(viewModel.length, 4);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 3, end: 4 });
				assert.strictEqual(viewModel.cellAt(3)?.getText(), '# header 1');
				await viewModel.undo();
				assert.strictEqual(viewModel.length, 3);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
			});
	});

	test('copy cell from ui still works if the target cell is not part of a selection', async () => {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				let _toCopy: NotebookCellTextModel[] = [];
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					override setToCopy(toCopy: NotebookCellTextModel[]) { _toCopy = toCopy; }
					override getToCopy() {
						return {
							items: _toCopy,
							isCopy: true
						};
					}
				});

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 2 }] }, 'model');
				assert.ok(runCopyCells(accessor, editor, viewModel.cellAt(0)));
				assert.deepStrictEqual(_toCopy, [viewModel.cellAt(0)!.model, viewModel.cellAt(1)!.model]);

				assert.ok(runCopyCells(accessor, editor, viewModel.cellAt(2)));
				assert.deepStrictEqual(_toCopy.length, 1);
				assert.deepStrictEqual(_toCopy, [viewModel.cellAt(2)!.model]);
			});
	});

	test('cut cell from ui still works if the target cell is not part of a selection', async () => {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
				['paragraph 3', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					override setToCopy() { }
					override getToCopy() {
						return { items: [], isCopy: true };
					}
				});

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 2 }] }, 'model');
				assert.ok(runCutCells(accessor, editor, viewModel.cellAt(0)));
				assert.strictEqual(viewModel.length, 2);
				await viewModel.undo();
				assert.strictEqual(viewModel.length, 4);

				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 2 }]);
				assert.ok(runCutCells(accessor, editor, viewModel.cellAt(2)));
				assert.strictEqual(viewModel.length, 3);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.strictEqual(viewModel.cellAt(0)?.getText(), '# header 1');
				assert.strictEqual(viewModel.cellAt(1)?.getText(), 'paragraph 1');
				assert.strictEqual(viewModel.cellAt(2)?.getText(), 'paragraph 3');

				await viewModel.undo();
				assert.strictEqual(viewModel.length, 4);
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 4 }] }, 'model');
				assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
				assert.ok(runCutCells(accessor, editor, viewModel.cellAt(0)));
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
			});
	});

	test('cut focus cell still works if the focus is not part of any selection', async () => {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
				['paragraph 3', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					override setToCopy() { }
					override getToCopy() {
						return { items: [], isCopy: true };
					}
				});

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 2, end: 4 }] }, 'model');
				assert.ok(runCutCells(accessor, editor, undefined));
				assert.strictEqual(viewModel.length, 3);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
			});
	});

	test('cut focus cell still works if the focus is not part of any selection 2', async () => {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
				['paragraph 3', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					override setToCopy() { }
					override getToCopy() {
						return { items: [], isCopy: true };
					}
				});

				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 0, end: 2 }] }, 'model');
				assert.ok(runCutCells(accessor, editor, undefined));
				assert.strictEqual(viewModel.length, 3);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
				assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 2 }]);
			});
	});
});
