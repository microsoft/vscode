/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from 'vs/base/test/common/mock';
import { NotebookClipboardContribution } from 'vs/workbench/contrib/notebook/browser/contrib/clipboard/notebookClipboard';
import { CellKind, SelectionStateType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { withTestNotebook } from 'vs/workbench/contrib/notebook/test/testNotebookEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IActiveNotebookEditor, INotebookEditor, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IVisibleEditorPane } from 'vs/workbench/common/editor';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

suite('Notebook Clipboard', () => {
	const createEditorService = (editor: IActiveNotebookEditor) => {
		const visibleEditorPane = new class extends mock<IVisibleEditorPane>() {
			getId(): string {
				return NOTEBOOK_EDITOR_ID;
			}
			getControl(): INotebookEditor {
				return editor;
			}
		};

		const editorService: IEditorService = new class extends mock<IEditorService>() {
			get activeEditorPane(): IVisibleEditorPane | undefined {
				return visibleEditorPane;
			}
		};

		return editorService;
	};

	test('#119773, cut last item should not focus on the top first cell', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markdown, [], {}],
				['paragraph 1', 'markdown', CellKind.Markdown, [], {}],
				['paragraph 2', 'markdown', CellKind.Markdown, [], {}],
			],
			async (editor, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					setToCopy() { }
				});

				const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));

				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, 'view');
				assert.deepStrictEqual(clipboardContrib.runCutAction(accessor), true);
				// it should be the last cell, other than the first one.
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
			});
	});

	test('#119771, undo paste should restore selections', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markdown, [], {}],
				['paragraph 1', 'markdown', CellKind.Markdown, [], {}],
				['paragraph 2', 'markdown', CellKind.Markdown, [], {}],
			],
			async (editor, accessor) => {
				accessor.stub(INotebookService, new class extends mock<INotebookService>() {
					setToCopy() { }
					getToCopy() {
						return {
							items: [
								editor.viewModel.viewCells[0].model
							],
							isCopy: true
						};
					}
				});

				const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));

				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, 'model');
				assert.deepStrictEqual(clipboardContrib.runPasteAction(accessor), true);

				assert.deepStrictEqual(viewModel.length, 4);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 3, end: 4 });
				assert.deepStrictEqual(viewModel.viewCells[3].getText(), '# header 1');
				await viewModel.undo();
				assert.deepStrictEqual(viewModel.length, 3);
				assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
			});
	});
});
