/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../base/common/cancellation.js';
import { hash } from '../../../base/common/hash.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import * as typeConverters from './extHostTypeConverters.js';
import { shouldSerializeBuffersForPostMessage, toExtensionData } from './extHostWebview.js';
import { Cache } from './cache.js';
import * as extHostProtocol from './extHost.protocol.js';
import * as extHostTypes from './extHostTypes.js';
class CustomDocumentStoreEntry {
    constructor(document, _storagePath) {
        this.document = document;
        this._storagePath = _storagePath;
        this._backupCounter = 1;
        this._edits = new Cache('custom documents');
    }
    addEdit(item) {
        return this._edits.add([item]);
    }
    async undo(editId, isDirty) {
        await this.getEdit(editId).undo();
        if (!isDirty) {
            this.disposeBackup();
        }
    }
    async redo(editId, isDirty) {
        await this.getEdit(editId).redo();
        if (!isDirty) {
            this.disposeBackup();
        }
    }
    disposeEdits(editIds) {
        for (const id of editIds) {
            this._edits.delete(id);
        }
    }
    getNewBackupUri() {
        if (!this._storagePath) {
            throw new Error('Backup requires a valid storage path');
        }
        const fileName = hashPath(this.document.uri) + (this._backupCounter++);
        return joinPath(this._storagePath, fileName);
    }
    updateBackup(backup) {
        this._backup?.delete();
        this._backup = backup;
    }
    disposeBackup() {
        this._backup?.delete();
        this._backup = undefined;
    }
    getEdit(editId) {
        const edit = this._edits.get(editId, 0);
        if (!edit) {
            throw new Error('No edit found');
        }
        return edit;
    }
}
class CustomDocumentStore {
    constructor() {
        this._documents = new Map();
    }
    get(viewType, resource) {
        return this._documents.get(this.key(viewType, resource));
    }
    add(viewType, document, storagePath) {
        const key = this.key(viewType, document.uri);
        if (this._documents.has(key)) {
            throw new Error(`Document already exists for viewType:${viewType} resource:${document.uri}`);
        }
        const entry = new CustomDocumentStoreEntry(document, storagePath);
        this._documents.set(key, entry);
        return entry;
    }
    delete(viewType, resource) {
        // Use the resource parameter directly instead of document.uri, because the document's
        // URI may have changed (e.g., after SaveAs from untitled to a file path).
        const key = this.key(viewType, resource);
        this._documents.delete(key);
    }
    key(viewType, resource) {
        return `${viewType}@@@${resource}`;
    }
}
var CustomEditorType;
(function (CustomEditorType) {
    CustomEditorType[CustomEditorType["Text"] = 0] = "Text";
    CustomEditorType[CustomEditorType["Custom"] = 1] = "Custom";
})(CustomEditorType || (CustomEditorType = {}));
class EditorProviderStore {
    constructor() {
        this._providers = new Map();
    }
    addTextProvider(viewType, extension, provider) {
        return this.add(viewType, { type: 0 /* CustomEditorType.Text */, extension, provider });
    }
    addCustomProvider(viewType, extension, provider) {
        return this.add(viewType, { type: 1 /* CustomEditorType.Custom */, extension, provider });
    }
    get(viewType) {
        return this._providers.get(viewType);
    }
    add(viewType, entry) {
        if (this._providers.has(viewType)) {
            throw new Error(`Provider for viewType:${viewType} already registered`);
        }
        this._providers.set(viewType, entry);
        return new extHostTypes.Disposable(() => this._providers.delete(viewType));
    }
}
export class ExtHostCustomEditors {
    constructor(mainContext, _extHostDocuments, _extensionStoragePaths, _extHostWebview, _extHostWebviewPanels) {
        this._extHostDocuments = _extHostDocuments;
        this._extensionStoragePaths = _extensionStoragePaths;
        this._extHostWebview = _extHostWebview;
        this._extHostWebviewPanels = _extHostWebviewPanels;
        this._editorProviders = new EditorProviderStore();
        this._documents = new CustomDocumentStore();
        this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCustomEditors);
    }
    registerCustomEditorProvider(extension, viewType, provider, options) {
        const disposables = new DisposableStore();
        if (isCustomTextEditorProvider(provider)) {
            disposables.add(this._editorProviders.addTextProvider(viewType, extension, provider));
            this._proxy.$registerTextEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
                supportsMove: !!provider.moveCustomTextEditor,
            }, shouldSerializeBuffersForPostMessage(extension));
        }
        else {
            disposables.add(this._editorProviders.addCustomProvider(viewType, extension, provider));
            if (isCustomEditorProviderWithEditingCapability(provider)) {
                disposables.add(provider.onDidChangeCustomDocument(e => {
                    const entry = this.getCustomDocumentEntry(viewType, e.document.uri);
                    if (isEditEvent(e)) {
                        const editId = entry.addEdit(e);
                        this._proxy.$onDidEdit(e.document.uri, viewType, editId, e.label);
                    }
                    else {
                        this._proxy.$onContentChange(e.document.uri, viewType);
                    }
                }));
            }
            this._proxy.$registerCustomEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, !!options.supportsMultipleEditorsPerDocument, shouldSerializeBuffersForPostMessage(extension));
        }
        return extHostTypes.Disposable.from(disposables, new extHostTypes.Disposable(() => {
            this._proxy.$unregisterEditorProvider(viewType);
        }));
    }
    async $createCustomDocument(resource, viewType, backupId, untitledDocumentData, cancellation) {
        const entry = this._editorProviders.get(viewType);
        if (!entry) {
            throw new Error(`No provider found for '${viewType}'`);
        }
        if (entry.type !== 1 /* CustomEditorType.Custom */) {
            throw new Error(`Invalid provide type for '${viewType}'`);
        }
        const revivedResource = URI.revive(resource);
        const document = await entry.provider.openCustomDocument(revivedResource, { backupId, untitledDocumentData: untitledDocumentData?.buffer }, cancellation);
        let storageRoot;
        if (isCustomEditorProviderWithEditingCapability(entry.provider) && this._extensionStoragePaths) {
            storageRoot = this._extensionStoragePaths.workspaceValue(entry.extension) ?? this._extensionStoragePaths.globalValue(entry.extension);
        }
        this._documents.add(viewType, document, storageRoot);
        return { editable: isCustomEditorProviderWithEditingCapability(entry.provider) };
    }
    async $disposeCustomDocument(resource, viewType) {
        const entry = this._editorProviders.get(viewType);
        if (!entry) {
            throw new Error(`No provider found for '${viewType}'`);
        }
        if (entry.type !== 1 /* CustomEditorType.Custom */) {
            throw new Error(`Invalid provider type for '${viewType}'`);
        }
        const revivedResource = URI.revive(resource);
        const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
        // Pass the resource we used to look up the document, not document.uri,
        // because the document's URI may have changed (e.g., after SaveAs).
        this._documents.delete(viewType, revivedResource);
        document.dispose();
    }
    async $resolveCustomEditor(resource, handle, viewType, initData, position, cancellation) {
        const entry = this._editorProviders.get(viewType);
        if (!entry) {
            throw new Error(`No provider found for '${viewType}'`);
        }
        const viewColumn = typeConverters.ViewColumn.to(position);
        const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
        const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);
        const revivedResource = URI.revive(resource);
        switch (entry.type) {
            case 1 /* CustomEditorType.Custom */: {
                const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
                return entry.provider.resolveCustomEditor(document, panel, cancellation);
            }
            case 0 /* CustomEditorType.Text */: {
                const document = this._extHostDocuments.getDocument(revivedResource);
                return entry.provider.resolveCustomTextEditor(document, panel, cancellation);
            }
            default: {
                throw new Error('Unknown webview provider type');
            }
        }
    }
    $disposeEdits(resourceComponents, viewType, editIds) {
        const document = this.getCustomDocumentEntry(viewType, resourceComponents);
        document.disposeEdits(editIds);
    }
    async $onMoveCustomEditor(handle, newResourceComponents, viewType) {
        const entry = this._editorProviders.get(viewType);
        if (!entry) {
            throw new Error(`No provider found for '${viewType}'`);
        }
        if (!entry.provider.moveCustomTextEditor) {
            throw new Error(`Provider does not implement move '${viewType}'`);
        }
        const webview = this._extHostWebviewPanels.getWebviewPanel(handle);
        if (!webview) {
            throw new Error(`No webview found`);
        }
        const resource = URI.revive(newResourceComponents);
        const document = this._extHostDocuments.getDocument(resource);
        await entry.provider.moveCustomTextEditor(document, webview, CancellationToken.None);
    }
    async $undo(resourceComponents, viewType, editId, isDirty) {
        const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
        return entry.undo(editId, isDirty);
    }
    async $redo(resourceComponents, viewType, editId, isDirty) {
        const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
        return entry.redo(editId, isDirty);
    }
    async $revert(resourceComponents, viewType, cancellation) {
        const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
        const provider = this.getCustomEditorProvider(viewType);
        await provider.revertCustomDocument(entry.document, cancellation);
        entry.disposeBackup();
    }
    async $onSave(resourceComponents, viewType, cancellation) {
        const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
        const provider = this.getCustomEditorProvider(viewType);
        await provider.saveCustomDocument(entry.document, cancellation);
        entry.disposeBackup();
    }
    async $onSaveAs(resourceComponents, viewType, targetResource, cancellation) {
        const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
        const provider = this.getCustomEditorProvider(viewType);
        return provider.saveCustomDocumentAs(entry.document, URI.revive(targetResource), cancellation);
    }
    async $backup(resourceComponents, viewType, cancellation) {
        const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
        const provider = this.getCustomEditorProvider(viewType);
        const backup = await provider.backupCustomDocument(entry.document, {
            destination: entry.getNewBackupUri(),
        }, cancellation);
        entry.updateBackup(backup);
        return backup.id;
    }
    getCustomDocumentEntry(viewType, resource) {
        const entry = this._documents.get(viewType, URI.revive(resource));
        if (!entry) {
            throw new Error('No custom document found');
        }
        return entry;
    }
    getCustomEditorProvider(viewType) {
        const entry = this._editorProviders.get(viewType);
        const provider = entry?.provider;
        if (!provider || !isCustomEditorProviderWithEditingCapability(provider)) {
            throw new Error('Custom document is not editable');
        }
        return provider;
    }
}
function isCustomEditorProviderWithEditingCapability(provider) {
    return !!provider.onDidChangeCustomDocument;
}
function isCustomTextEditorProvider(provider) {
    return typeof provider.resolveCustomTextEditor === 'function';
}
function isEditEvent(e) {
    return typeof e.undo === 'function'
        && typeof e.redo === 'function';
}
function hashPath(resource) {
    const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
    return hash(str) + '';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEN1c3RvbUVkaXRvcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Q3VzdG9tRWRpdG9ycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUlqRSxPQUFPLEtBQUssY0FBYyxNQUFNLDRCQUE0QixDQUFDO0FBQzdELE9BQU8sRUFBbUIsb0NBQW9DLEVBQUUsZUFBZSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFJN0csT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNuQyxPQUFPLEtBQUssZUFBZSxNQUFNLHVCQUF1QixDQUFDO0FBQ3pELE9BQU8sS0FBSyxZQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFHbEQsTUFBTSx3QkFBd0I7SUFJN0IsWUFDaUIsUUFBK0IsRUFDOUIsWUFBNkI7UUFEOUIsYUFBUSxHQUFSLFFBQVEsQ0FBdUI7UUFDOUIsaUJBQVksR0FBWixZQUFZLENBQWlCO1FBSnZDLG1CQUFjLEdBQUcsQ0FBQyxDQUFDO1FBT1YsV0FBTSxHQUFHLElBQUksS0FBSyxDQUFpQyxrQkFBa0IsQ0FBQyxDQUFDO0lBRnBGLENBQUM7SUFNTCxPQUFPLENBQUMsSUFBb0M7UUFDM0MsT0FBTyxJQUFJLENB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