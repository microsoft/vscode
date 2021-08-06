/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CellEditState, getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { RedoCommand, UndoCommand } from 'vs/editor/browser/editorExtensions';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';

class NotebookUndoRedoContribution extends Disposable {

	constructor(@IEditorService private readonly _editorService: IEditorService) {
		super();

		/**
		 * The undo/redo priority needs to be above code editors due to how the undo redo service works. Say we have two cells, cell 0 and cell 100, which can't be rendered in the same viewport
		 * 1. focus cell 0, type
		 * 2. focus cell 100. Cell 0 becomes invisible, the text model for it is disposed, which will mark the undo element "invalid"
		 * 3. undo. Since the last undo element is invalid, it will remove this undo element directly other than performing any real undo.
		 *
		 * We now make the notebook undo/redo impl the highest priority so we don't skip the "invalid" undo/redo element in the same notebook document
		 */
		this._register(UndoCommand.addImplementation(10000 + 5, 'notebook-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane) as NotebookEditorWidget | undefined;
			if (editor?.hasModel()) {
				const activeCodeEditor = editor.activeCodeEditor;

				if ((activeCodeEditor && activeCodeEditor.hasTextFocus()) || !activeCodeEditor) {
					return editor.viewModel.undo().then(cellResources => {
						if (cellResources?.length) {
							editor?.viewModel?.viewCells.forEach(cell => {
								if (cell.cellKind === CellKind.Markup && cellResources.find(resource => resource.fragment === cell.model.uri.fragment)) {
									cell.updateEditState(CellEditState.Editing, 'undo');
								}
							});

							editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
						}
					});
				}
			}

			return false;
		}));

		this._register(RedoCommand.addImplementation(10000 + 5, 'notebook-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane) as NotebookEditorWidget | undefined;
			if (editor?.hasModel()) {
				const activeCodeEditor = editor.activeCodeEditor;

				if ((activeCodeEditor && activeCodeEditor.hasTextFocus()) || !activeCodeEditor) {
					return editor.viewModel.redo().then(cellResources => {
						if (cellResources?.length) {
							editor?.viewModel?.viewCells.forEach(cell => {
								if (cell.cellKind === CellKind.Markup && cellResources.find(resource => resource.fragment === cell.model.uri.fragment)) {
									cell.updateEditState(CellEditState.Editing, 'redo');
								}
							});

							editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
						}
					});
				}
			}

			return false;
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookUndoRedoContribution, LifecyclePhase.Ready);
