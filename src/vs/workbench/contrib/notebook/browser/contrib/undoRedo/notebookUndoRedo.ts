/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CellEditState, getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { RedoCommand, UndoCommand } from '../../../../../../editor/browser/editorExtensions.js';
import { NotebookViewModel } from '../../viewModel/notebookViewModelImpl.js';

class NotebookUndoRedoContribution extends Disposable {

	static readonly ID = 'workbench.contrib.notebookUndoRedo';

	constructor(@IEditorService private readonly _editorService: IEditorService) {
		super();

		const PRIORITY = 105;
		this._register(UndoCommand.addImplementation(PRIORITY, 'notebook-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			const viewModel = editor?.getViewModel() as NotebookViewModel | undefined;
			if (editor && editor.hasModel() && viewModel) {
				return viewModel.undo().then(cellResources => {
					if (cellResources?.length) {
						for (let i = 0; i < editor.getLength(); i++) {
							const cell = editor.cellAt(i);
							if (cell.cellKind === CellKind.Markup && cellResources.find(resource => resource.fragment === cell.model.uri.fragment)) {
								cell.updateEditState(CellEditState.Editing, 'undo');
							}
						}

						editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
					}
				});
			}

			return false;
		}));

		this._register(RedoCommand.addImplementation(PRIORITY, 'notebook-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			const viewModel = editor?.getViewModel() as NotebookViewModel | undefined;

			if (editor && editor.hasModel() && viewModel) {
				return viewModel.redo().then(cellResources => {
					if (cellResources?.length) {
						for (let i = 0; i < editor.getLength(); i++) {
							const cell = editor.cellAt(i);
							if (cell.cellKind === CellKind.Markup && cellResources.find(resource => resource.fragment === cell.model.uri.fragment)) {
								cell.updateEditState(CellEditState.Editing, 'redo');
							}
						}

						editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
					}
				});
			}

			return false;
		}));
	}
}

registerWorkbenchContribution2(NotebookUndoRedoContribution.ID, NotebookUndoRedoContribution, WorkbenchPhase.BlockRestore);
