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
import { Event } from '../../../base/common/event.js';
import { combinedDisposable, DisposableStore, DisposableMap } from '../../../base/common/lifecycle.js';
import { isCodeEditor, isDiffEditor } from '../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { shouldSynchronizeModel } from '../../../editor/common/model.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ITextModelService } from '../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { extHostCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { MainThreadDocuments } from './mainThreadDocuments.js';
import { MainThreadTextEditor } from './mainThreadEditor.js';
import { MainThreadTextEditors } from './mainThreadEditors.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { AbstractTextEditor } from '../../browser/parts/editor/textEditor.js';
import { editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { ITextFileService } from '../../services/textfile/common/textfiles.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IWorkingCopyFileService } from '../../services/workingCopy/common/workingCopyFileService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { IPathService } from '../../services/path/common/pathService.js';
import { diffSets, diffMaps } from '../../../base/common/collections.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IQuickDiffModelService } from '../../contrib/scm/browser/quickDiffModel.js';
class TextEditorSnapshot {
    constructor(editor) {
        this.editor = editor;
        this.id = `${editor.getId()},${editor.getModel().id}`;
    }
}
class DocumentAndEditorStateDelta {
    constructor(removedDocuments, addedDocuments, removedEditors, addedEditors, oldActiveEditor, newActiveEditor) {
        this.removedDocuments = removedDocuments;
        this.addedDocuments = addedDocuments;
        this.removedEditors = removedEditors;
        this.addedEditors = addedEditors;
        this.oldActiveEditor = oldActiveEditor;
        this.newActiveEditor = newActiveEditor;
        this.isEmpty = this.removedDocuments.length === 0
            && this.addedDocuments.length === 0
            && this.removedEditors.length === 0
            && this.addedEditors.length === 0
            && oldActiveEditor === newActiveEditor;
    }
    toString() {
        let ret = 'DocumentAndEditorStateDelta\n';
        ret += `\tRemoved Documents: [${this.removedDocuments.map(d => d.uri.toString(true)).join(', ')}]\n`;
        ret += `\tAdded Documents: [${this.addedDocuments.map(d => d.uri.toString(true)).join(', ')}]\n`;
        ret += `\tRemoved Editors: [${this.removedEditors.map(e => e.id).join(', ')}]\n`;
        ret += `\tAdded Editors: [${this.addedEditors.map(e => e.id).join(', ')}]\n`;
        ret += `\tNew Active Editor: ${this.newActiveEditor}\n`;
        return ret;
    }
}
class DocumentAndEditorState {
    static compute(before, after) {
        if (!before) {
            return new DocumentAndEditorStateDelta([], [...after.documents.values()], [], [...after.textEditors.values()], undefined, after.activeEditor);
        }
        const documentDelta = diffSets(before.documents, after.documents);
        const editorDelta = diffMaps(before.textEditors, after.textEditors);
        const oldActiveEditor = before.activeEditor !== after.activeEditor ? before.activeEditor : undefined;
        const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : undefined;
        return new DocumentAndEditorStateDelta(documentDelta.removed, documentDelta.added, editorDelta.removed, editorDelta.added, oldActiveEditor, newActiveEditor);
    }
    constructor(documents, textEditors, activeEditor) {
        this.documents = documents;
        this.textEditors = textEditors;
        this.activeEditor = activeEditor;
        //
    }
}
var ActiveEditorOrder;
(function (ActiveEditorOrder) {
    ActiveEditorOrder[ActiveEditorOrder["Editor"] = 0] = "Editor";
    ActiveEditorOrder[ActiveEditorOrder["Panel"] = 1] = "Panel";
})(ActiveEditorOrder || (ActiveEditorOrder = {}));
let MainThreadDocumentAndEditorStateComputer = class MainThreadDocumentAndEditorStateComputer {
    constructor(_onDidChangeState, _modelService, _codeEditorService, _editorService, _paneCompositeService) {
        this._onDidChangeState = _onDidChangeState;
        this._modelService = _modelService;
        this._codeEditorService = _codeEditorService;
        this._editorService = _editorService;
        this._paneCompositeService = _paneCompositeService;
        this._toDispose = new DisposableStore();
        this._toDisposeOnEditorRemove = new DisposableMap();
        this._activeEditorOrder = 0 /* ActiveEditorOrder.Editor */;
        this._modelService.onModelAdded(this._updateStateOnModelAdd, this, this._toDispose);
        this._modelService.onModelRemoved(_ => this._updateState(), this, this._toDispose);
        this._editorService.onDidActiveEditorChange(_ => this._updateState(), this, this._toDispose);
        this._codeEditorService.onCodeEditorAdd(this._onDidAddEditor, this, this._toDispose);
        this._codeEditorService.onCodeEditorRemove(this._onDidRemoveEditor, this, this._toDispose);
        this._codeEditorService.listCodeEditors().forEach(this._onDidAddEditor, this);
        Event.filter(this._paneCompositeService.onDidPaneCompositeOpen, event => event.viewContainerLocation === 1 /* ViewContainerLocation.Panel */)(_ => this._activeEditorOrder = 1 /* ActiveEditorOrder.Panel */, undefined, this._toDispose);
        Event.filter(this._paneCompositeService.onDidPaneCompositeClose, event => event.viewContainerLocation === 1 /* ViewContainerLocation.Panel */)(_ => this._activeEditorOrder = 0 /* ActiveEditorOrder.Editor */, undefined, this._toDispose);
        this._editorService.onDidVisibleEditorsChange(_ => this._activeEditorOrder = 0 /* ActiveEditorOrder.Editor */, undefined, this._toDispose);
        this._updateState();
    }
    dispose() {
        this._toDispose.dispose();
        this._toDisposeOnEditorRemove.dispose();
    }
    _onDidAddEditor(e) {
        this._toDisposeOnEditorRemove.set(e.getId(), combinedDisposable(e.onDidChangeModel(() => this._updateState()), e.onDidFocusEditorText(() => this._updateState()), e.onDidFocusEditorWidget(() => this._updateState(e))));
        this._updateState();
    }
    _onDidRemoveEditor(e) {
        const id = e.getId();
        if (this._toDisposeOnEditorRemove.has(id)) {
            this._toDisposeOnEditorRemove.deleteAndDispose(id);
            this._updateState();
        }
    }
    _updateStateOnModelAdd(model) {
        if (!shouldSynchronizeModel(model)) {
            // ignore
            return;
        }
        if (!this._currentState) {
            // too early
            this._updateState();
            return;
        }
        // small (fast) delta
        this._currentState = new DocumentAndEditorState(this._currentState.documents.add(model), this._currentState.textEditors, this._currentState.activeEditor);
        this._onDidChangeState(new DocumentAndEditorStateDelta([], [model], [], [], undefined, undefined));
    }
    _updateState(widgetFocusCandidate) {
        // models: ignore too large models
        const models = new Set();
        for (const model of this._modelService.getModels()) {
            if (shouldSynchronizeModel(model)) {
                models.add(model);
            }
        }
        // editor: only take those that have a not too large model
        const editors = new Map();
        let activeEditor = null; // Strict null work. This doesn't like being undefined!
        for (const editor of this._codeEditorService.listCodeEditors()) {
            if (editor.isSimpleWidget) {
                continue;
            }
            const model = editor.getModel();
            if (editor.hasModel() && model && shouldSynchronizeModel(model)
                && !model.isDisposed() // model disposed
                && Boolean(this._modelService.getModel(model.uri)) // model disposing, the flag didn't flip yet but the model service already removed it
            ) {
                const apiEditor = new TextEditorSnapshot(editor);
                editors.set(apiEditor.id, apiEditor);
                if (editor.hasTextFocus() || (widgetFocusCandidate === editor && editor.hasWidgetFocus())) {
                    // text focus has priority, widget focus is tricky because multiple
                    // editors might claim widget focus at the same time. therefore we use a
                    // candidate (which is the editor that has raised an widget focus event)
                    // in addition to the widget focus check
                    activeEditor = apiEditor.id;
                }
            }
        }
        // active editor: if none of the previous editors had focus we try
        // to match output panels or the active workbench editor with
        // one of editor we have just computed
        if (!activeEditor) {
            let candidate;
            if (this._activeEditorOrder === 0 /* ActiveEditorOrder.Editor */) {
                candidate = this._getActiveEditorFromEditorPart() || this._getActiveEditorFromPanel();
            }
            else {
                candidate = this._getActiveEditorFromPanel() || this._getActiveEditorFromEditorPart();
            }
            if (candidate) {
                for (const snapshot of editors.values()) {
                    if (candidate === snapshot.editor) {
                        activeEditor = snapshot.id;
                    }
                }
            }
        }
        // compute new state and compare against old
        const newState = new DocumentAndEditorState(models, editors, activeEditor);
        const delta = DocumentAndEditorState.compute(this._currentState, newState);
        if (!delta.isEmpty) {
            this._currentState = newState;
            this._onDidChangeState(delta);
        }
    }
    _getActiveEditorFromPanel() {
        const panel = this._paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */);
        if (panel instanceof AbstractTextEditor) {
            const control = panel.getControl();
            if (isCodeEditor(control)) {
                return control;
            }
        }
        return undefined;
    }
    _getActiveEditorFromEditorPart() {
        let activeTextEditorControl = this._editorService.activeTextEditorControl;
        if (isDiffEditor(activeTextEditorControl)) {
            activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
        }
        return activeTextEditorControl;
    }
};
MainThreadDocumentAndEditorStateComputer = __decorate([
    __param(1, IModelService),
    __param(2, ICodeEditorService),
    __param(3, IEditorService),
    __param(4, IPaneCompositePartService)
], MainThreadDocumentAndEditorStateComputer);
let MainThreadDocumentsAndEditors = class MainThreadDocumentsAndEditors {
    constructor(extHostContext, _modelService, _textFileService, _editorService, codeEditorService, fileService, textModelResolverService, _editorGroupService, paneCompositeService, environmentService, workingCopyFileService, uriIdentityService, _clipboardService, pathService, configurationService, quickDiffModelService) {
        this._modelService = _modelService;
        this._textFileService = _textFileService;
        this._editorService = _editorService;
        this._editorGroupService = _editorGroupService;
        this._clipboardService = _clipboardService;
        this._toDispose = new DisposableStore();
        this._textEditors = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentsAndEditors);
        this._mainThreadDocuments = this._toDispose.add(new MainThreadDocuments(extHostContext, this._modelService, this._textFileService, fileService, textModelResolverService, environmentService, uriIdentityService, workingCopyFileService, pathService));
        extHostContext.set(MainContext.MainThreadDocuments, this._mainThreadDocuments);
        this._mainThreadEditors = this._toDispose.add(new MainThreadTextEditors(this, extHostContext, codeEditorService, this._editorService, this._editorGroupService, configurationService, quickDiffModelService, uriIdentityService));
        extHostContext.set(MainContext.MainThreadTextEditors, this._mainThreadEditors);
        // It is expected that the ctor of the state computer calls our `_onDelta`.
        this._toDispose.add(new MainThreadDocumentAndEditorStateComputer(delta => this._onDelta(delta), _modelService, codeEditorService, this._editorService, paneCompositeService));
    }
    dispose() {
        this._toDispose.dispose();
    }
    _onDelta(delta) {
        const removedEditors = [];
        const addedEditors = [];
        // removed models
        const removedDocuments = delta.removedDocuments.map(m => m.uri);
        // added editors
        for (const apiEditor of delta.addedEditors) {
            const mainThreadEditor = new MainThreadTextEditor(apiEditor.id, apiEditor.editor.getModel(), apiEditor.editor, { onGainedFocus() { }, onLostFocus() { } }, this._mainThreadDocuments, this._modelService, this._clipboardService);
            this._textEditors.set(apiEditor.id, mainThreadEditor);
            addedEditors.push(mainThreadEditor);
        }
        // removed editors
        for (const { id } of delta.removedEditors) {
            const mainThreadEditor = this._textEditors.get(id);
            if (mainThreadEditor) {
                mainThreadEditor.dispose();
                this._textEditors.delete(id);
                removedEditors.push(id);
            }
        }
        const extHostDelta = Object.create(null);
        let empty = true;
        if (delta.newActiveEditor !== undefined) {
            empty = false;
            extHostDelta.newActiveEditor = delta.newActiveEditor;
        }
        if (removedDocuments.length > 0) {
            empty = false;
            extHostDelta.removedDocuments = removedDocuments;
        }
        if (removedEditors.length > 0) {
            empty = false;
            extHostDelta.removedEditors = removedEditors;
        }
        if (delta.addedDocuments.length > 0) {
            empty = false;
            extHostDelta.addedDocuments = delta.addedDocuments.map(m => this._toModelAddData(m));
        }
        if (delta.addedEditors.length > 0) {
            empty = false;
            extHostDelta.addedEditors = addedEditors.map(e => this._toTextEditorAddData(e));
        }
        if (!empty) {
            // first update ext host
            this._proxy.$acceptDocumentsAndEditorsDelta(extHostDelta);
            // second update dependent document/editor states
            removedDocuments.forEach(this._mainThreadDocuments.handleModelRemoved, this._mainThreadDocuments);
            delta.addedDocuments.forEach(this._mainThreadDocuments.handleModelAdded, this._mainThreadDocuments);
            removedEditors.forEach(this._mainThreadEditors.handleTextEditorRemoved, this._mainThreadEditors);
            addedEditors.forEach(this._mainThreadEditors.handleTextEditorAdded, this._mainThreadEditors);
        }
    }
    _toModelAddData(model) {
        return {
            uri: model.uri,
            versionId: model.getVersionId(),
            lines: model.getLinesContent(),
            EOL: model.getEOL(),
            languageId: model.getLanguageId(),
            isDirty: this._textFileService.isDirty(model.uri),
            encoding: this._textFileService.getEncoding(model.uri)
        };
    }
    _toTextEditorAddData(textEditor) {
        const props = textEditor.getProperties();
        return {
            id: textEditor.getId(),
            documentUri: textEditor.getModel().uri,
            options: props.options,
            selections: props.selections,
            visibleRanges: props.visibleRanges,
            editorPosition: this._findEditorPosition(textEditor)
        };
    }
    _findEditorPosition(editor) {
        for (const editorPane of this._editorService.visibleEditorPanes) {
            if (editor.matches(editorPane)) {
                return editorGroupToColumn(this._editorGroupService, editorPane.group);
            }
        }
        return undefined;
    }
    findTextEditorIdFor(editorPane) {
        for (const [id, editor] of this._textEditors) {
            if (editor.matches(editorPane)) {
                return id;
            }
        }
        return undefined;
    }
    getIdOfCodeEditor(codeEditor) {
        for (const [id, editor] of this._textEditors) {
            if (editor.getCodeEditor() === codeEditor) {
                return id;
            }
        }
        return undefined;
    }
    getEditor(id) {
        return this._textEditors.get(id);
    }
};
MainThreadDocumentsAndEditors = __decorate([
    extHostCustomer,
    __param(1, IModelService),
    __param(2, ITextFileService),
    __param(3, IEditorService),
    __param(4, ICodeEditorService),
    __param(5, IFileService),
    __param(6, ITextModelService),
    __param(7, IEditorGroupsService),
    __param(8, IPaneCompositePartService),
    __param(9, IWorkbenchEnvironmentService),
    __param(10, IWorkingCopyFileService),
    __param(11, IUriIdentityService),
    __param(12, IClipboardService),
    __param(13, IPathService),
    __param(14, IConfigurationService),
    __param(15, IQuickDiffModelService)
], MainThreadDocumentsAndEditors);
export { MainThreadDocumentsAndEditors };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERvY3VtZW50c0FuZEVkaXRvcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZERvY3VtZW50c0FuZEVkaXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkcsT0FBTyxFQUFlLFlBQVksRUFBRSxZQUFZLEVBQXFCLE1BQU0sMENBQTBDLENBQUM7QUFDdEgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFM0YsT0FBTyxFQUFjLHNCQUFzQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDckYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZUFBZSxFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzdELE9BQU8sRUFBNEIscUJBQXFCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN6RixPQUFPLEVBQUUsY0FBYyxFQUFtRyxXQUFXLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM3SyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUU5RSxPQUFP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