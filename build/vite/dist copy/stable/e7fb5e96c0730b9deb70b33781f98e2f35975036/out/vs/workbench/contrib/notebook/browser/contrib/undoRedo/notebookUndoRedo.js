/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CellEditState, getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { RedoCommand, UndoCommand } from '../../../../../../editor/browser/editorExtensions.js';
let NotebookUndoRedoContribution = class NotebookUndoRedoContribution extends Disposable {
    static { this.ID = 'workbench.contrib.notebookUndoRedo'; }
    constructor(_editorService) {
        super();
        this._editorService = _editorService;
        const PRIORITY = 105;
        this._register(UndoCommand.addImplementation(PRIORITY, 'notebook-undo-redo', () => {
            const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
            const viewModel = editor?.getViewModel();
            if (editor && editor.hasEditorFocus() && editor.hasModel() && viewModel) {
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
            const viewModel = editor?.getViewModel();
            if (editor && editor.hasEditorFocus() && editor.hasModel() && viewModel) {
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
};
NotebookUndoRedoContribution = __decorate([
    __param(0, IEditorService)
], NotebookUndoRedoContribution);
registerWorkbenchContribution2(NotebookUndoRedoContribution.ID, NotebookUndoRedoContribution, 2 /* WorkbenchPhase.BlockRestore */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tVbmRvUmVkby5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi91bmRvUmVkby9ub3RlYm9va1VuZG9SZWRvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQWtCLDhCQUE4QixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN4RixPQUFPLEVBQUUsYUFBYSxFQUFFLCtCQUErQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDMUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUdoRyxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7YUFFcEMsT0FBRSxHQUFHLG9DQUFvQyxBQUF2QyxDQUF3QztJQUUxRCxZQUE2QyxjQUE4QjtRQUMxRSxLQUFLLEVBQUUsQ0FBQztRQURvQyxtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFHMUUsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ3JCLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7WUFDakYsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3JGLE1BQU0sU0FBUyxHQUFHLE1BQU0sRUFBRSxZQUFZLEVBQW1DLENBQUM7WUFDMUUsSUFB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