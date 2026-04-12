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
import { DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { EditorActivation } from '../../../platform/editor/common/editor.js';
import { getNotebookEditorFromEditorPane } from '../../contrib/notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../contrib/notebook/browser/services/notebookEditorService.js';
import { columnToEditorGroup, editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { ExtHostContext, NotebookEditorRevealType } from '../common/extHost.protocol.js';
class MainThreadNotebook {
    constructor(editor, disposables) {
        this.editor = editor;
        this.disposables = disposables;
    }
    dispose() {
        this.disposables.dispose();
    }
}
let MainThreadNotebookEditors = class MainThreadNotebookEditors {
    constructor(extHostContext, _editorService, _notebookEditorService, _editorGroupService, _configurationService) {
        this._editorService = _editorService;
        this._notebookEditorService = _notebookEditorService;
        this._editorGroupService = _editorGroupService;
        this._configurationService = _configurationService;
        this._disposables = new DisposableStore();
        this._mainThreadEditors = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookEditors);
        this._editorService.onDidActiveEditorChange(() => this._updateEditorViewColumns(), this, this._disposables);
        this._editorGroupService.onDidRemoveGroup(() => this._updateEditorViewColumns(), this, this._disposables);
        this._editorGroupService.onDidMoveGroup(() => this._updateEditorViewColumns(), this, this._disposables);
    }
    dispose() {
        this._disposables.dispose();
        dispose(this._mainThreadEditors.values());
    }
    handleEditorsAdded(editors) {
        for (const editor of editors) {
            const editorDisposables = new DisposableStore();
            editorDisposables.add(editor.onDidChangeVisibleRanges(() => {
                this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { visibleRanges: { ranges: editor.visibleRanges } });
            }));
            editorDisposables.add(editor.onDidChangeSelection(() => {
                this._proxy.$acceptEditorPropertiesChanged(editor.getId(), { selections: { selections: editor.getSelections() } });
            }));
            const wrapper = new MainThreadNotebook(editor, editorDisposables);
            this._mainThreadEditors.set(editor.getId(), wrapper);
        }
    }
    handleEditorsRemoved(editorIds) {
        for (const id of editorIds) {
            this._mainThreadEditors.get(id)?.dispose();
            this._mainThreadEditors.delete(id);
        }
    }
    _updateEditorViewColumns() {
        const result = Object.create(null);
        for (const editorPane of this._editorService.visibleEditorPanes) {
            const candidate = getNotebookEditorFromEditorPane(editorPane);
            if (candidate && this._mainThreadEditors.has(candidate.getId())) {
                result[candidate.getId()] = editorGroupToColumn(this._editorGroupService, editorPane.group);
            }
        }
        if (!equals(result, this._currentViewColumnInfo)) {
            this._currentViewColumnInfo = result;
            this._proxy.$acceptEditorViewColumns(result);
        }
    }
    async $tryShowNotebookDocument(resource, viewType, options) {
        const editorOptions = {
            cellSelections: options.selections,
            preserveFocus: options.preserveFocus,
            pinned: options.pinned,
            // selection: options.selection,
            // preserve pre 1.38 behaviour to not make group active when preserveFocus: true
            // but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
            activation: options.preserveFocus ? EditorActivation.RESTORE : undefined,
            label: options.label,
            override: viewType
        };
        const editorPane = await this._editorService.openEditor({ resource: URI.revive(resource), options: editorOptions }, columnToEditorGroup(this._editorGroupService, this._configurationService, options.position));
        const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
        if (notebookEditor) {
            return notebookEditor.getId();
        }
        else {
            throw new Error(`Notebook Editor creation failure for document ${JSON.stringify(resource)}`);
        }
    }
    async $tryRevealRange(id, range, revealType) {
        const editor = this._notebookEditorService.getNotebookEditor(id);
        if (!editor) {
            return;
        }
        const notebookEditor = editor;
        if (!notebookEditor.hasModel()) {
            return;
        }
        if (range.start >= notebookEditor.getLength()) {
            return;
        }
        const cell = notebookEditor.cellAt(range.start);
        switch (revealType) {
            case NotebookEditorRevealType.Default:
                return notebookEditor.revealCellRangeInView(range);
            case NotebookEditorRevealType.InCenter:
                return notebookEditor.revealInCenter(cell);
            case NotebookEditorRevealType.InCenterIfOutsideViewport:
                return notebookEditor.revealInCenterIfOutsideViewport(cell);
            case NotebookEditorRevealType.AtTop:
                return notebookEditor.revealInViewAtTop(cell);
        }
    }
    $trySetSelections(id, ranges) {
        const editor = this._notebookEditorService.getNotebookEditor(id);
        if (!editor) {
            return;
        }
        editor.setSelections(ranges);
        if (ranges.length) {
            editor.setFocus({ start: ranges[0].start, end: ranges[0].start + 1 });
        }
    }
};
MainThreadNotebookEditors = __decorate([
    __param(1, IEditorService),
    __param(2, INotebookEditorService),
    __param(3, IEditorGroupsService),
    __param(4, IConfigurationService)
], MainThreadNotebookEditors);
export { MainThreadNotebookEditors };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE5vdGVib29rRWRpdG9ycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTm90ZWJvb2tFZGl0b3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDN0UsT0FBTyxFQUFFLCtCQUErQixFQUEyQyxNQUFNLG1EQUFtRCxDQUFDO0FBQzdJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRTFHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUUvRSxPQUFPLEVBQUUsY0FBYyxFQUE0SCx3QkFBd0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRW5OLE1BQU0sa0JBQWtCO0lBRXZCLFlBQ1UsTUFBdUIsRUFDdkIsV0FBNEI7UUFENUIsV0FBTSxHQUFOLE1BQU0sQ0FBaUI7UUFDdkIsZ0JBQVcsR0FBWCxXQUFXLENBQWlCO0lBQ2xDLENBQUM7SUFFTCxPQUFPO1FBQ04sSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUs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