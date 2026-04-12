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
var MainThreadCustomEditorModel_1;
import { multibyteAwareBtoa } from '../../../base/common/strings.js';
import { createCancelablePromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { basename } from '../../../base/common/path.js';
import { isEqual, isEqualOrParent, toLocalResource } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IUndoRedoService } from '../../../platform/undoRedo/common/undoRedo.js';
import { reviveWebviewExtension } from './mainThreadWebviews.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { CustomEditorInput } from '../../contrib/customEditor/browser/customEditorInput.js';
import { ICustomEditorService } from '../../contrib/customEditor/common/customEditor.js';
import { CustomTextEditorModel } from '../../contrib/customEditor/common/customTextEditorModel.js';
import { ExtensionKeyedWebviewOriginStore } from '../../contrib/webview/browser/webview.js';
import { IWebviewWorkbenchService } from '../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { IPathService } from '../../services/path/common/pathService.js';
import { ResourceWorkingCopy } from '../../services/workingCopy/common/resourceWorkingCopy.js';
import { NO_TYPE_ID } from '../../services/workingCopy/common/workingCopy.js';
import { IWorkingCopyFileService } from '../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
var CustomEditorModelType;
(function (CustomEditorModelType) {
    CustomEditorModelType[CustomEditorModelType["Custom"] = 0] = "Custom";
    CustomEditorModelType[CustomEditorModelType["Text"] = 1] = "Text";
})(CustomEditorModelType || (CustomEditorModelType = {}));
let MainThreadCustomEditors = class MainThreadCustomEditors extends Disposable {
    constructor(context, mainThreadWebview, mainThreadWebviewPanels, extensionService, storageService, workingCopyService, workingCopyFileService, _customEditorService, _editorGroupService, _editorService, _instantiationService, _webviewWorkbenchService, _uriIdentityService) {
        super();
        this.mainThreadWebview = mainThreadWebview;
        this.mainThreadWebviewPanels = mainThreadWebviewPanels;
        this._customEditorService = _customEditorService;
        this._editorGroupService = _editorGroupService;
        this._editorService = _editorService;
        this._instantiationService = _instantiationService;
        this._webviewWorkbenchService = _webviewWorkbenchService;
        this._uriIdentityService = _uriIdentityService;
        this._editorProviders = this._register(new DisposableMap());
        this._editorRenameBackups = new Map();
        this._webviewOriginStore = new ExtensionKeyedWebviewOriginStore('mainThreadCustomEditors.origins', storageService);
        this._proxyCustomEditors = context.getProxy(extHostProtocol.ExtHostContext.ExtHostCustomEditors);
        this._register(workingCopyFileService.registerWorkingCopyProvider((editorResource) => {
            const matchedWorkingCopies = [];
            for (const workingCopy of workingCopyService.workingCopies) {
                if (workingCopy instanceof MainThreadCustomEditorModel) {
                    if (isEqualOrParent(editorResource, workingCopy.editorResource)) {
                        matchedWorkingCopies.push(workingCopy);
                    }
                }
            }
            return matchedWorkingCopies;
        }));
        // This reviver's only job is to activate custom editor extensions.
        this._register(_webviewWorkbenchService.registerResolver({
            canResolve: (webview) => {
                if (webview instanceof CustomEditorInput) {
                    extensionService.activateByEvent(`onCustomEditor:${webview.viewType}`);
                }
                return false;
            },
            resolveWebview: () => { throw new Error('not implemented'); }
        }));
        // Working copy operations
        this._register(workingCopyFileService.onWillRunWorkingCopyFileOperation(async (e) => this.onWillRunWorkingCopyFileOperation(e)));
    }
    $registerTextEditorProvider(extensionData, viewType, options, capabilities, serializeBuffersForPostMessage) {
        this.registerEditorProvider(1 /* CustomEditorModelType.Text */, reviveWebviewExtension(extensionData), viewType, options, capabilities, true, serializeBuffersForPostMessage);
    }
    $registerCustomEditorProvider(extensionData, viewType, options, supportsMultipleEditorsPerDocument, serializeBuffersForPostMessage) {
        this.registerEditorProvider(0 /* CustomEditorModelType.Custom */, reviveWebviewExtension(extensionData), viewType, options, {}, supportsMultipleEditorsPerDocument, serializeBuffersForPostMessage);
    }
    registerEditorProvider(modelType, extension, viewType, options, capabilities, supportsMultipleEditorsPerDocument, serializeBuffersForPostMessage) {
        if (this._editorProviders.has(viewType)) {
            throw new Error(`Provider for ${viewType} already registered`);
        }
        const disposables = new DisposableStore();
        disposables.add(this._customEditorService.registerCustomEditorCapabilities(viewType, {
            supportsMultipleEditorsPerDocument
        }));
        disposables.add(this._webviewWorkbenchService.registerResolver({
            canResolve: (webviewInput) => {
                return webviewInput instanceof CustomEditorInput && webviewInput.viewType === viewType;
            },
            resolveWebview: async (webviewInput, cancellation) => {
                const handle = generateUuid();
                const resource = webviewInput.resource;
                webviewInput.webview.origin = this._webviewOriginStore.getOrigin(viewType, extension.id);
                this.mainThreadWebviewPanels.addWebviewInput(handle, webviewInput, { serializeBuffersForPostMessage });
                webviewInput.webview.options = options;
                webviewInput.webview.extension = extension;
                // If there's an old resource this was a move and we must resolve the backup at the same time as the webview
                // This is because the backup must be ready upon model creation, and the input resolve method comes after
                let backupId = webviewInput.backupId;
                if (webviewInput.oldResource && !webviewInput.backupId) {
                    const backup = this._editorRenameBackups.get(webviewInput.oldResource.toString());
                    backupId = backup?.backupId;
                    this._editorRenameBackups.delete(webviewInput.oldResource.toString());
                }
                let modelRef;
                try {
                    modelRef = await this.getOrCreateCustomEditorModel(modelType, resource, viewType, { backupId }, cancellation);
                }
                catch (error) {
                    onUnexpectedError(error);
                    webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
                    return;
                }
                if (cancellation.isCancellationRequested) {
                    modelRef.dispose();
                    return;
                }
                const disposeSub = webviewInput.webview.onDidDispose(() => {
                    disposeSub.dispose();
                    inputDisposeSub.dispose();
                    // If the model is still dirty, make sure we have time to save it
                    if (modelRef.object.isDirty()) {
                        const sub = modelRef.object.onDidChangeDirty(() => {
                            if (!modelRef.object.isDirty()) {
                                sub.dispose();
                                modelRef.dispose();
                            }
                        });
                        return;
                    }
                    modelRef.dispose();
                });
                // Also listen for when the input is disposed (e.g., during SaveAs when the webview is transferred to a new editor).
                // In this case, webview.onDidDispose won't fire because the webview is reused.
                const inputDisposeSub = webviewInput.onWillDispose(() => {
                    inputDisposeSub.dispose();
                    disposeSub.dispose();
                    modelRef.dispose();
                });
                if (capabilities.supportsMove) {
                    webviewInput.onMove(async (newResource) => {
                        const oldModel = modelRef;
                        modelRef = await this.getOrCreateCustomEditorModel(modelType, newResource, viewType, {}, CancellationToken.None);
                        this._proxyCustomEditors.$onMoveCustomEditor(handle, newResource, viewType);
                        oldModel.dispose();
                    });
                }
                try {
                    const actualResource = modelType === 1 /* CustomEditorModelType.Text */ ? this._uriIdentityService.asCanonicalUri(resource) : resource;
                    await this._proxyCustomEditors.$resolveCustomEditor(actualResource, handle, viewType, {
                        title: webviewInput.getTitle(),
                        contentOptions: webviewInput.webview.contentOptions,
                        options: webviewInput.webview.options,
                        active: webviewInput === this._editorService.activeEditor,
                    }, editorGroupToColumn(this._editorGroupService, webviewInput.group || 0), cancellation);
                }
                catch (error) {
                    onUnexpectedError(error);
                    webviewInput.webview.setHtml(this.mainThreadWebview.getWebviewResolvedFailedContent(viewType));
                    modelRef.dispose();
                    return;
                }
            }
        }));
        this._editorProviders.set(viewType, disposables);
    }
    $unregisterEditorProvider(viewType) {
        if (!this._editorProviders.has(viewType)) {
            throw new Error(`No provider for ${viewType} registered`);
        }
        this._editorProviders.deleteAndDispose(viewType);
        this._customEditorService.models.disposeAllModelsForView(viewType);
    }
    async getOrCreateCustomEditorModel(modelType, resource, viewType, options, cancellation) {
        const existingModel = this._customEditorService.models.tryRetain(resource, viewType);
        if (existingModel) {
            return existingModel;
        }
        switch (modelType) {
            case 1 /* CustomEditorModelType.Text */:
                {
                    const model = CustomTextEditorModel.create(this._instantiationService, viewType, resource);
                    return this._customEditorService.models.add(resource, viewType, model);
                }
            case 0 /* CustomEditorModelType.Custom */:
                {
                    const model = MainThreadCustomEditorModel.create(this._instantiationService, this._proxyCustomEditors, viewType, resource, options, () => {
                        return Array.from(this.mainThreadWebviewPanels.webviewInputs)
                            .filter(editor => editor instanceof CustomEditorInput && isEqual(editor.resource, resource));
                    }, cancellation);
                    return this._customEditorService.models.add(resource, viewType, model);
                }
        }
    }
    async $onDidEdit(resourceComponents, viewType, editId, label) {
        const model = await this.getCustomEditorModel(resourceComponents, viewType);
        model.pushEdit(editId, label);
    }
    async $onContentChange(resourceComponents, viewType) {
        const model = await this.getCustomEditorModel(resourceComponents, viewType);
        model.changeContent();
    }
    async getCustomEditorModel(resourceComponents, viewType) {
        const resource = URI.revive(resourceComponents);
        const model = await this._customEditorService.models.get(resource, viewType);
        if (!model || !(model instanceof MainThreadCustomEditorModel)) {
            throw new Error('Could not find model for webview editor');
        }
        return model;
    }
    //#region Working Copy
    async onWillRunWorkingCopyFileOperation(e) {
        if (e.operation !== 2 /* FileOperation.MOVE */) {
            return;
        }
        e.waitUntil((async () => {
            const models = [];
            for (const file of e.files) {
                if (file.source) {
                    models.push(...(await this._customEditorService.models.getAllModels(file.source)));
                }
            }
            for (const model of models) {
                if (model instanceof MainThreadCustomEditorModel && model.isDirty()) {
                    const workingCopy = await model.backup(CancellationToken.None);
                    if (workingCopy.meta) {
                        // This cast is safe because we do an instanceof check above and a custom document backup data is always returned
                        this._editorRenameBackups.set(model.editorResource.toString(), workingCopy.meta);
                    }
                }
            }
        })());
    }
};
MainThreadCustomEditors = __decorate([
    __param(3, IExtensionService),
    __param(4, IStorageService),
    __param(5, IWorkingCopyService),
    __param(6, IWorkingCopyFileService),
    __param(7, ICustomEditorService),
    __param(8, IEditorGroupsService),
    __param(9, IEditorService),
    __param(10, IInstantiationService),
    __param(11, IWebviewWorkbenchService),
    __param(12, IUriIdentityService)
], MainThreadCustomEditors);
export { MainThreadCustomEditors };
var HotExitState;
(function (HotExitState) {
    let Type;
    (function (Type) {
        Type[Type["Allowed"] = 0] = "Allowed";
        Type[Type["NotAllowed"] = 1] = "NotAllowed";
        Type[Type["Pending"] = 2] = "Pending";
    })(Type = HotExitState.Type || (HotExitState.Type = {}));
    HotExitState.Allowed = Object.freeze({ type: 0 /* Type.Allowed */ });
    HotExitState.NotAllowed = Object.freeze({ type: 1 /* Type.NotAllowed */ });
    class Pending {
        constructor(operation) {
            this.operation = operation;
            this.type = 2 /* Type.Pending */;
        }
    }
    HotExitState.Pending = Pending;
})(HotExitState || (HotExitState = {}));
let MainThreadCustomEditorModel = MainThreadCustomEditorModel_1 = class MainThreadCustomEditorModel extends ResourceWorkingCopy {
    static async create(instantiationService, proxy, viewType, resource, options, getEditors, cancellation) {
        const editors = getEditors();
        let untitledDocumentData;
        if (editors.length !== 0) {
            untitledDocumentData = editors[0].untitledDocumentData;
        }
        const { editable } = await proxy.$createCustomDocument(resource, viewType, options.backupId, untitledDocumentData, cancellation);
        return instantiationService.createInstance(MainThreadCustomEditorModel_1, proxy, viewType, resource, !!options.backupId, editable, !!untitledDocumentData, getEditors);
    }
    constructor(_proxy, _viewType, _editorResource, fromBackup, _editable, startDirty, _getEditors, _fileDialogService, fileService, _labelService, _undoService, _environmentService, workingCopyService, _pathService, extensionService) {
        super(MainThreadCustomEditorModel_1.toWorkingCopyResource(_viewType, _editorResource), fileService);
        this._proxy = _proxy;
        this._viewType = _viewType;
        this._editorResource = _editorResource;
        this._editable = _editable;
        this._getEditors = _getEditors;
        this._fileDialogService = _fileDialogService;
        this._labelService = _labelService;
        this._undoService = _undoService;
        this._environmentService = _environmentService;
        this._pathService = _pathService;
        this._fromBackup = false;
        this._hotExitState = HotExitState.Allowed;
        this._currentEditIndex = -1;
        this._savePoint = -1;
        this._edits = [];
        // TODO@mjbvz consider to enable a `typeId` that is specific for custom
        // editors. Using a distinct `typeId` allows the working copy to have
        // any resource (including file based resources) even if other working
        // copies exist with the same resource.
        //
        // IMPORTANT: changing the `typeId` has an impact on backups for this
        // working copy. Any value that is not the empty string will be used
        // as seed to the backup. Only change the `typeId` if you have implemented
        // a fallback solution to resolve any existing backups that do not have
        // this seed.
        this.typeId = NO_TYPE_ID;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this.onDidChangeReadonly = Event.None;
        this._fromBackup = fromBackup;
        // Normally means we're re-opening an untitled file (set this before registering the working copy
        // so that dirty state is correct when first queried).
        this._isDirtyFromContentChange = startDirty;
        if (_editable) {
            this._register(workingCopyService.registerWorkingCopy(this));
            this._register(extensionService.onWillStop(e => {
                e.veto(true, localize('vetoExtHostRestart', "An extension provided editor for '{0}' is still open that would close otherwise.", this.name));
            }));
        }
    }
    get editorResource() {
        return this._editorResource;
    }
    dispose() {
        if (this._editable) {
            this._undoService.removeElements(this._editorResource);
        }
        this._proxy.$disposeCustomDocument(this._editorResource, this._viewType);
        super.dispose();
    }
    //#region IWorkingCopy
    // Make sure each custom editor has a unique resource for backup and edits
    static toWorkingCopyResource(viewType, resource) {
        const authority = viewType.replace(/[^a-z0-9\-_]/gi, '-');
        const path = `/${multibyteAwareBtoa(resource.with({ query: null, fragment: null }).toString(true))}`;
        return URI.from({
            scheme: Schemas.vscodeCustomEditor,
            authority: authority,
            path: path,
            query: JSON.stringify(resource.toJSON()),
        });
    }
    get name() {
        return basename(this._labelService.getUriLabel(this._editorResource));
    }
    get capabilities() {
        return this.isUntitled() ? 2 /* WorkingCopyCapabilities.Untitled */ : 0 /* WorkingCopyCapabilities.None */;
    }
    isDirty() {
        if (this._isDirtyFromContentChange) {
            return true;
        }
        if (this._edits.length > 0) {
            return this._savePoint !== this._currentEditIndex;
        }
        return this._fromBackup;
    }
    isUntitled() {
        return this._editorResource.scheme === Schemas.untitled;
    }
    //#endregion
    isReadonly() {
        return !this._editable;
    }
    get viewType() {
        return this._viewType;
    }
    get backupId() {
        return this._backupId;
    }
    pushEdit(editId, label) {
        if (!this._editable) {
            throw new Error('Document is not editable');
        }
        this.change(() => {
            this.spliceEdits(editId);
            this._currentEditIndex = this._edits.length - 1;
        });
        this._undoService.pushElement({
            type: 0 /* UndoRedoElementType.Resource */,
            resource: this._editorResource,
            label: label ?? localize('defaultEditLabel', "Edit"),
            code: 'undoredo.customEditorEdit',
            undo: () => this.undo(),
            redo: () => this.redo(),
        });
    }
    changeContent() {
        this.change(() => {
            this._isDirtyFromContentChange = true;
        });
    }
    async undo() {
        if (!this._editable) {
            return;
        }
        if (this._currentEditIndex < 0) {
            // nothing to undo
            return;
        }
        const undoneEdit = this._edits[this._currentEditIndex];
        this.change(() => {
            --this._currentEditIndex;
        });
        await this._proxy.$undo(this._editorResource, this.viewType, undoneEdit, this.isDirty());
    }
    async redo() {
        if (!this._editable) {
            return;
        }
        if (this._currentEditIndex >= this._edits.length - 1) {
            // nothing to redo
            return;
        }
        const redoneEdit = this._edits[this._currentEditIndex + 1];
        this.change(() => {
            ++this._currentEditIndex;
        });
        await this._proxy.$redo(this._editorResource, this.viewType, redoneEdit, this.isDirty());
    }
    spliceEdits(editToInsert) {
        const start = this._currentEditIndex + 1;
        const toRemove = this._edits.length - this._currentEditIndex;
        const removedEdits = typeof editToInsert === 'number'
            ? this._edits.splice(start, toRemove, editToInsert)
            : this._edits.splice(start, toRemove);
        if (removedEdits.length) {
            this._proxy.$disposeEdits(this._editorResource, this._viewType, removedEdits);
        }
    }
    change(makeEdit) {
        const wasDirty = this.isDirty();
        makeEdit();
        this._onDidChangeContent.fire();
        if (this.isDirty() !== wasDirty) {
            this._onDidChangeDirty.fire();
        }
    }
    async revert(options) {
        if (!this._editable) {
            return;
        }
        if (this._currentEditIndex === this._savePoint && !this._isDirtyFromContentChange && !this._fromBackup) {
            return;
        }
        if (!options?.soft) {
            this._proxy.$revert(this._editorResource, this.viewType, CancellationToken.None);
        }
        this.change(() => {
            this._isDirtyFromContentChange = false;
            this._fromBackup = false;
            this._currentEditIndex = this._savePoint;
            this.spliceEdits();
        });
    }
    async save(options) {
        const result = !!await this.saveCustomEditor(options);
        // Emit Save Event
        if (result) {
            this._onDidSave.fire({ reason: options?.reason, source: options?.source });
        }
        return result;
    }
    async saveCustomEditor(options) {
        if (!this._editable) {
            return undefined;
        }
        if (this.isUntitled()) {
            const targetUri = await this.suggestUntitledSavePath(options);
            if (!targetUri) {
                return undefined;
            }
            await this.saveCustomEditorAs(this._editorResource, targetUri, options);
            return targetUri;
        }
        const savePromise = createCancelablePromise(token => this._proxy.$onSave(this._editorResource, this.viewType, token));
        this._ongoingSave?.cancel();
        this._ongoingSave = savePromise;
        try {
            await savePromise;
            if (this._ongoingSave === savePromise) { // Make sure we are still doing the same save
                this.change(() => {
                    this._isDirtyFromContentChange = false;
                    this._savePoint = this._currentEditIndex;
                    this._fromBackup = false;
                });
            }
        }
        finally {
            if (this._ongoingSave === savePromise) { // Make sure we are still doing the same save
                this._ongoingSave = undefined;
            }
        }
        return this._editorResource;
    }
    suggestUntitledSavePath(options) {
        if (!this.isUntitled()) {
            throw new Error('Resource is not untitled');
        }
        const remoteAuthority = this._environmentService.remoteAuthority;
        const localResource = toLocalResource(this._editorResource, remoteAuthority, this._pathService.defaultUriScheme);
        return this._fileDialogService.pickFileToSave(localResource, options?.availableFileSystems);
    }
    async saveCustomEditorAs(resource, targetResource, _options) {
        if (this._editable) {
            // TODO: handle cancellation
            await createCancelablePromise(token => this._proxy.$onSaveAs(this._editorResource, this.viewType, targetResource, token));
            this.change(() => {
                this._isDirtyFromContentChange = false;
                this._savePoint = this._currentEditIndex;
                this._fromBackup = false;
            });
            return true;
        }
        else {
            // Since the editor is readonly, just copy the file over
            await this.fileService.copy(resource, targetResource, false /* overwrite */);
            return true;
        }
    }
    get canHotExit() { return typeof this._backupId === 'string' && this._hotExitState.type === 0 /* HotExitState.Type.Allowed */; }
    async backup(token) {
        const editors = this._getEditors();
        if (!editors.length) {
            throw new Error('No editors found for resource, cannot back up');
        }
        const primaryEditor = editors[0];
        const backupMeta = {
            viewType: this.viewType,
            editorResource: this._editorResource,
            customTitle: primaryEditor.getWebviewTitle(),
            iconPath: primaryEditor.iconPath,
            backupId: '',
            extension: primaryEditor.extension ? {
                id: primaryEditor.extension.id.value,
                location: primaryEditor.extension.location,
            } : undefined,
            webview: {
                origin: primaryEditor.webview.origin,
                options: primaryEditor.webview.options,
                state: primaryEditor.webview.state,
            }
        };
        const backupData = {
            meta: backupMeta
        };
        if (!this._editable) {
            return backupData;
        }
        if (this._hotExitState.type === 2 /* HotExitState.Type.Pending */) {
            this._hotExitState.operation.cancel();
        }
        const pendingState = new HotExitState.Pending(createCancelablePromise(token => this._proxy.$backup(this._editorResource.toJSON(), this.viewType, token)));
        this._hotExitState = pendingState;
        token.onCancellationRequested(() => {
            pendingState.operation.cancel();
        });
        let errorMessage = '';
        try {
            const backupId = await pendingState.operation;
            // Make sure state has not changed in the meantime
            if (this._hotExitState === pendingState) {
                this._hotExitState = HotExitState.Allowed;
                backupData.meta.backupId = backupId;
                this._backupId = backupId;
            }
        }
        catch (e) {
            if (isCancellationError(e)) {
                // This is expected
                throw e;
            }
            // Otherwise it could be a real error. Make sure state has not changed in the meantime.
            if (this._hotExitState === pendingState) {
                this._hotExitState = HotExitState.NotAllowed;
            }
            if (e.message) {
                errorMessage = e.message;
            }
        }
        if (this._hotExitState === HotExitState.Allowed) {
            return backupData;
        }
        throw new Error(`Cannot backup in this state: ${errorMessage}`);
    }
};
MainThreadCustomEditorModel = MainThreadCustomEditorModel_1 = __decorate([
    __param(7, IFileDialogService),
    __param(8, IFileService),
    __param(9, ILabelService),
    __param(10, IUndoRedoService),
    __param(11, IWorkbenchEnvironmentService),
    __param(12, IWorkingCopyService),
    __param(13, IPathService),
    __param(14, IExtensionService)
], MainThreadCustomEditorModel);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEN1c3RvbUVkaXRvcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEN1c3RvbUVkaXRvcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3JFLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUUzRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBYyxNQUFNLG1DQUFtQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUYsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2pGLE9BQU8sRUFBaUIsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYs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