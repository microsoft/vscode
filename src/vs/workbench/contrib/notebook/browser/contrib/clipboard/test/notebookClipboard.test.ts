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
import { INotebookEditor, NOTEBOOK_EDITOR_ID } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IVisibleEditorPane } from 'vs/workbench/common/editor';

suite('Notebook Clipboard', () => {
	test('#119773, cut last item should not focus on the top first cell', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markdown, [], {}],
				['paragraph 1', 'markdown', CellKind.Markdown, [], {}],
				['paragraph 2', 'markdown', CellKind.Markdown, [], {}],
			],
			async (editor, accessor) => {

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

				const clipboardContrib = new NotebookClipboardContribution(editorService);

				const viewModel = editor.viewModel;
				viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, 'view');
				assert.deepStrictEqual(clipboardContrib.runCutAction(accessor), true);
				// it should be the last cell, other than the first one.
				assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
			});
	});
});
