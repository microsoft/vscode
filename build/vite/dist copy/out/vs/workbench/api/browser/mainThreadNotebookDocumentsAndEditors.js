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
var MainThreadNotebooksAndEditors_1;
import { diffMaps, diffSets } from '../../../base/common/collections.js';
import { combinedDisposable, DisposableStore, DisposableMap } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { MainThreadNotebookDocuments } from './mainThreadNotebookDocuments.js';
import { NotebookDto } from './mainThreadNotebookDto.js';
import { MainThreadNotebookEditors } from './mainThreadNotebookEditors.js';
import { extHostCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { getNotebookEditorFromEditorPane } from '../../contrib/notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../contrib/notebook/browser/services/notebookEditorService.js';
import { INotebookService } from '../../contrib/notebook/common/notebookService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
class NotebookAndEditorState {
    static delta(before, after) {
        if (!before) {
            return {
                addedDocuments: [...after.documents],
                removedDocuments: [],
                addedEditors: [...after.textEditors.values()],
                removedEditors: [],
                visibleEditors: [...after.visibleEditors].map(editor => editor[0])
            };
        }
        const documentDelta = diffSets(before.documents, after.documents);
        const editorDelta = diffMaps(before.textEditors, after.textEditors);
        const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : undefined;
        const visibleEditorDelta = diffMaps(before.visibleEditors, after.visibleEditors);
        return {
            addedDocuments: documentDelta.added,
            removedDocuments: documentDelta.removed.map(e => e.uri),
            addedEditors: editorDelta.added,
            removedEditors: editorDelta.removed.map(removed => removed.getId()),
            newActiveEditor: newActiveEditor,
            visibleEditors: visibleEditorDelta.added.length === 0 && visibleEditorDelta.removed.length === 0
                ? undefined
                : [...after.visibleEditors].map(editor => editor[0])
        };
    }
    constructor(documents, textEditors, activeEditor, visibleEditors) {
        this.documents = documents;
        this.textEditors = textEditors;
        this.activeEditor = activeEditor;
        this.visibleEditors = visibleEditors;
        //
    }
}
let MainThreadNotebooksAndEditors = MainThreadNotebooksAndEditors_1 = class MainThreadNotebooksAndEditors {
    constructor(extHostContext, instantiationService, _notebookService, _notebookEditorService, _editorService, _editorGroupService, _logService) {
        this._notebookService = _notebookService;
        this._notebookEditorService = _notebookEditorService;
        this._editorService = _editorService;
        this._editorGroupService = _editorGroupService;
        this._logService = _logService;
        this._disposables = new DisposableStore();
        this._editorListeners = new DisposableMap();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebook);
        this._mainThreadNotebooks = instantiationService.createInstance(MainThreadNotebookDocuments, extHostContext);
        this._mainThreadEditors = instantiationService.createInstance(MainThreadNotebookEditors, extHostContext);
        extHostContext.set(MainContext.MainThreadNotebookDocuments, this._mainThreadNotebooks);
        extHostContext.set(MainContext.MainThreadNotebookEditors, this._mainThreadEditors);
        this._notebookService.onWillAddNotebookDocument(() => this._updateState(), this, this._disposables);
        this._notebookService.onDidRemoveNotebookDocument(() => this._updateState(), this, this._disposables);
        this._editorService.onDidActiveEditorChange(() => this._updateState(), this, this._disposables);
        this._editorService.onDidVisibleEditorsChange(() => this._updateState(), this, this._disposables);
        this._notebookEditorService.onDidAddNotebookEditor(this._handleEditorAdd, this, this._disposables);
        this._notebookEditorService.onDidRemoveNotebookEditor(this._handleEditorRemove, this, this._disposables);
        this._updateState();
    }
    dispose() {
        this._mainThreadNotebooks.dispose();
        this._mainThreadEditors.dispose();
        this._disposables.dispose();
        this._editorListeners.dispose();
    }
    _handleEditorAdd(editor) {
        this._editorListeners.set(editor.getId(), combinedDisposable(editor.onDidChangeModel(() => this._updateState()), editor.onDidFocusWidget(() => this._updateState(editor))));
        this._updateState();
    }
    _handleEditorRemove(editor) {
        this._editorListeners.deleteAndDispose(editor.getId());
        this._updateState();
    }
    _updateState(focusedEditor) {
        const editors = new Map();
        const visibleEditorsMap = new Map();
        for (const editor of this._notebookEditorService.listNotebookEditors()) {
            if (editor.hasModel()) {
                editors.set(editor.getId(), editor);
            }
        }
        const activeNotebookEditor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        let activeEditor = null;
        if (activeNotebookEditor) {
            activeEditor = activeNotebookEditor.getId();
        }
        else if (focusedEditor?.textModel) {
            activeEditor = focusedEditor.getId();
        }
        if (activeEditor && !editors.has(activeEditor)) {
            this._logService.trace('MainThreadNotebooksAndEditors#_updateState: active editor is not in editors list', activeEditor, editors.keys());
            activeEditor = null;
        }
        for (const editorPane of this._editorService.visibleEditorPanes) {
            const notebookEditor = getNotebookEditorFromEditorPane(editorPane);
            if (notebookEditor?.hasModel() && editors.has(notebookEditor.getId())) {
                visibleEditorsMap.set(notebookEditor.getId(), notebookEditor);
            }
        }
        const newState = new NotebookAndEditorState(new Set(this._notebookService.listNotebookDocuments()), editors, activeEditor, visibleEditorsMap);
        this._onDelta(NotebookAndEditorState.delta(this._currentState, newState));
        this._currentState = newState;
    }
    _onDelta(delta) {
        if (MainThreadNotebooksAndEditors_1._isDeltaEmpty(delta)) {
            return;
        }
        const dto = {
            removedDocuments: delta.removedDocuments,
            removedEditors: delta.removedEditors,
            newActiveEditor: delta.newActiveEditor,
            visibleEditors: delta.visibleEditors,
            addedDocuments: delta.addedDocuments.map(MainThreadNotebooksAndEditors_1._asModelAddData),
            addedEditors: delta.addedEditors.map(this._asEditorAddData, this),
        };
        // send to extension FIRST
        this._proxy.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers(dto));
        // handle internally
        this._mainThreadEditors.handleEditorsRemoved(delta.removedEditors);
        this._mainThreadNotebooks.handleNotebooksRemoved(delta.removedDocuments);
        this._mainThreadNotebooks.handleNotebooksAdded(delta.addedDocuments);
        this._mainThreadEditors.handleEditorsAdded(delta.addedEditors);
    }
    static _isDeltaEmpty(delta) {
        if (delta.addedDocuments !== undefined && delta.addedDocuments.length > 0) {
            return false;
        }
        if (delta.removedDocuments !== undefined && delta.removedDocuments.length > 0) {
            return false;
        }
        if (delta.addedEditors !== undefined && delta.addedEditors.length > 0) {
            return false;
        }
        if (delta.removedEditors !== undefined && delta.removedEditors.length > 0) {
            return false;
        }
        if (delta.visibleEditors !== undefined && delta.visibleEditors.length > 0) {
            return false;
        }
        if (delta.newActiveEditor !== undefined) {
            return false;
        }
        return true;
    }
    static _asModelAddData(e) {
        return {
            viewType: e.viewType,
            uri: e.uri,
            metadata: e.metadata,
            versionId: e.versionId,
            cells: e.cells.map(NotebookDto.toNotebookCellDto)
        };
    }
    _asEditorAddData(add) {
        const pane = this._editorService.visibleEditorPanes.find(pane => getNotebookEditorFromEditorPane(pane) === add);
        return {
            id: add.getId(),
            documentUri: add.textModel.uri,
            selections: add.getSelections(),
            visibleRanges: add.visibleRanges,
            viewColumn: pane && editorGroupToColumn(this._editorGroupService, pane.group),
            viewType: add.getViewModel().viewType
        };
    }
};
MainThreadNotebooksAndEditors = MainThreadNotebooksAndEditors_1 = __decorate([
    extHostCustomer,
    __param(1, IInstantiationService),
    __param(2, INotebookService),
    __param(3, INotebookEditorService),
    __param(4, IEditorService),
    __param(5, IEditorGroupsService),
    __param(6, ILogService)
], MainThreadNotebooksAndEditors);
export { MainThreadNotebooksAndEditors };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE5vdGVib29rRG9jdW1lbnRzQW5kRWRpdG9ycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTm90ZWJvb2tEb2N1bWVudHNBbmRFZGl0b3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFdkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSwrQkFBK0IsRUFBMEMsTUFBTSxtREFBbUQsQ0FBQztBQUM1SSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUUxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFD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