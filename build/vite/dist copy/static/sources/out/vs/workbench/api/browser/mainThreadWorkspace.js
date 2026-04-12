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
import { isCancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { isNative } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IRequestService } from '../../../platform/request/common/request.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../platform/workspace/common/workspaceTrust.js';
import { IWorkspaceContextService, isUntitledWorkspace } from '../../../platform/workspace/common/workspace.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { checkGlobFileExists } from '../../services/extensions/common/workspaceContains.js';
import { QueryBuilder } from '../../services/search/common/queryBuilder.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { ISearchService } from '../../services/search/common/search.js';
import { IWorkspaceEditingService } from '../../services/workspaces/common/workspaceEditing.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IEditSessionIdentityService } from '../../../platform/workspace/common/editSessions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../common/editor.js';
import { coalesce } from '../../../base/common/arrays.js';
import { ICanonicalUriService } from '../../../platform/workspace/common/canonicalUri.js';
import { revive } from '../../../base/common/marshalling.js';
import { ITextFileService } from '../../services/textfile/common/textfiles.js';
let MainThreadWorkspace = class MainThreadWorkspace extends Disposable {
    constructor(extHostContext, _searchService, _contextService, _editSessionIdentityService, _canonicalUriService, _editorService, _workspaceEditingService, _notificationService, _requestService, _instantiationService, _labelService, _environmentService, fileService, _workspaceTrustManagementService, _workspaceTrustRequestService, _textFileService) {
        super();
        this._searchService = _searchService;
        this._contextService = _contextService;
        this._editSessionIdentityService = _editSessionIdentityService;
        this._canonicalUriService = _canonicalUriService;
        this._editorService = _editorService;
        this._workspaceEditingService = _workspaceEditingService;
        this._notificationService = _notificationService;
        this._requestService = _requestService;
        this._instantiationService = _instantiationService;
        this._labelService = _labelService;
        this._environmentService = _environmentService;
        this._workspaceTrustManagementService = _workspaceTrustManagementService;
        this._workspaceTrustRequestService = _workspaceTrustRequestService;
        this._textFileService = _textFileService;
        this._activeCancelTokens = Object.create(null);
        // --- edit sessions ---
        this.registeredEditSessionProviders = this._register(new DisposableMap());
        // --- canonical uri identities ---
        this.registeredCanonicalUriProviders = this._register(new DisposableMap());
        this._queryBuilder = this._instantiationService.createInstance(QueryBuilder);
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostWorkspace);
        const workspace = this._contextService.getWorkspace();
        // The workspace file is provided be a unknown file system provider. It might come
        // from the extension host. So initialize now knowing that `rootPath` is undefined.
        if (workspace.configuration && !isNative && !fileService.hasProvider(workspace.configuration)) {
            this._proxy.$initializeWorkspace(this.getWorkspaceData(workspace), this.isWorkspaceTrusted());
        }
        else {
            this._contextService.getCompleteWorkspace().then(workspace => this._proxy.$initializeWorkspace(this.getWorkspaceData(workspace), this.isWorkspaceTrusted()));
        }
        this._register(this._contextService.onDidChangeWorkspaceFolders(this._onDidChangeWorkspace, this));
        this._register(this._contextService.onDidChangeWorkbenchState(this._onDidChangeWorkspace, this));
        this._register(this._workspaceTrustManagementService.onDidChangeTrust(this._onDidGrantWorkspaceTrust, this));
        this._register(this._workspaceTrustManagementService.onDidChangeTrustedFolders(this._onDidChangeWorkspaceTrustedFolders, this));
    }
    dispose() {
        super.dispose();
        for (const requestId in this._activeCancelTokens) {
            const tokenSource = this._activeCancelTokens[requestId];
            tokenSource.cancel();
        }
    }
    // --- workspace ---
    $updateWorkspaceFolders(extensionName, index, deleteCount, foldersToAdd) {
        const workspaceFoldersToAdd = foldersToAdd.map(f => ({ uri: URI.revive(f.uri), name: f.name }));
        // Indicate in status message
        this._notificationService.status(this.getStatusMessage(extensionName, workspaceFoldersToAdd.length, deleteCount), { hideAfter: 10 * 1000 /* 10s */ });
        return this._workspaceEditingService.updateFolders(index, deleteCount, workspaceFoldersToAdd, true);
    }
    getStatusMessage(extensionName, addCount, removeCount) {
        let message;
        const wantsToAdd = addCount > 0;
        const wantsToDelete = removeCount > 0;
        // Add Folders
        if (wantsToAdd && !wantsToDelete) {
            if (addCount === 1) {
                message = localize('folderStatusMessageAddSingleFolder', "Extension '{0}' added 1 folder to the workspace", extensionName);
            }
            else {
                message = localize('folderStatusMessageAddMultipleFolders', "Extension '{0}' added {1} folders to the workspace", extensionName, addCount);
            }
        }
        // Delete Folders
        else if (wantsToDelete && !wantsToAdd) {
            if (removeCount === 1) {
                message = localize('folderStatusMessageRemoveSingleFolder', "Extension '{0}' removed 1 folder from the workspace", extensionName);
            }
            else {
                message = localize('folderStatusMessageRemoveMultipleFolders', "Extension '{0}' removed {1} folders from the workspace", extensionName, removeCount);
            }
        }
        // Change Folders
        else {
            message = localize('folderStatusChangeFolder', "Extension '{0}' changed folders of the workspace", extensionName);
        }
        return message;
    }
    _onDidChangeWorkspace() {
        this._proxy.$acceptWorkspaceData(this.getWorkspaceData(this._contextService.getWorkspace()));
    }
    getWorkspaceData(workspace) {
        if (!this._contextService.hasWorkspaceData()) {
            return null;
        }
        return {
            configuration: workspace.configuration || undefined,
            isUntitled: workspace.configuration ? isUntitledWorkspace(workspace.configuration, this._environmentService) : false,
            folders: workspace.folders,
            id: workspace.id,
            name: this._labelService.getWorkspaceLabel(workspace),
            transient: workspace.transient,
        };
    }
    // --- search ---
    $startFileSearch(_includeFolder, options, token) {
        const includeFolder = URI.revive(_includeFolder);
        const workspace = this._contextService.getWorkspace();
        const query = this._queryBuilder.file(includeFolder ? [includeFolder] : workspace.folders, revive(options));
        return this._searchService.fileSearch(query, token).then(result => {
            return result.results.map(m => m.resource);
        }, err => {
            if (!isCancellationError(err)) {
                return Promise.reject(err);
            }
            return null;
        });
    }
    $startTextSearch(pattern, _folder, options, requestId, token) {
        const folder = URI.revive(_folder);
        const workspace = this._contextService.getWorkspace();
        const folders = folder ? [folder] : workspace.folders.map(folder => folder.uri);
        const query = this._queryBuilder.text(pattern, folders, revive(options));
        query._reason = 'startTextSearch';
        const onProgress = (p) => {
            if (p.results) {
                this._proxy.$handleTextSearchResult(p, requestId);
            }
        };
        const search = this._searchService.textSearch(query, token, onProgress).then(result => {
            return { limitHit: result.limitHit };
        }, err => {
            if (!isCancellationError(err)) {
                return Promise.reject(err);
            }
            return null;
        });
        return search;
    }
    $checkExists(folders, includes, token) {
        return this._instantiationService.invokeFunction((accessor) => checkGlobFileExists(accessor, folders, includes, token));
    }
    // --- save & edit resources ---
    async $save(uriComponents, options) {
        const uri = URI.revive(uriComponents);
        const editors = [...this._editorService.findEditors(uri, { supportSideBySide: SideBySideEditor.PRIMARY })];
        const result = await this._editorService.save(editors, {
            reason: 1 /* SaveReason.EXPLICIT */,
            saveAs: options.saveAs,
            force: !options.saveAs
        });
        return this._saveResultToUris(result).at(0);
    }
    _saveResultToUris(result) {
        if (!result.success) {
            return [];
        }
        return coalesce(result.editors.map(editor => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })));
    }
    $saveAll(includeUntitled) {
        return this._editorService.saveAll({ includeUntitled }).then(res => res.success);
    }
    $resolveProxy(url) {
        return this._requestService.resolveProxy(url);
    }
    $lookupAuthorization(authInfo) {
        return this._requestService.lookupAuthorization(authInfo);
    }
    $lookupKerberosAuthorization(url) {
        return this._requestService.lookupKerberosAuthorization(url);
    }
    $loadCertificates() {
        return this._requestService.loadCertificates();
    }
    // --- trust ---
    $requestResourceTrust(optionsDto) {
        const options = { ...optionsDto, uri: URI.revive(optionsDto.uri) };
        return this._workspaceTrustRequestService.requestResourcesTrust(options);
    }
    $requestWorkspaceTrust(options) {
        return this._workspaceTrustRequestService.requestWorkspaceTrust(options);
    }
    async $isResourceTrusted(resource) {
        const uri = URI.revive(resource);
        const trustInfo = await this._workspaceTrustManagementService.getUriTrustInfo(uri);
        return trustInfo.trusted;
    }
    isWorkspaceTrusted() {
        return this._workspaceTrustManagementService.isWorkspaceTrusted();
    }
    _onDidGrantWorkspaceTrust() {
        this._proxy.$onDidGrantWorkspaceTrust();
    }
    _onDidChangeWorkspaceTrustedFolders() {
        this._proxy.$onDidChangeWorkspaceTrustedFolders();
    }
    $registerEditSessionIdentityProvider(handle, scheme) {
        const disposable = this._editSessionIdentityService.registerEditSessionIdentityProvider({
            scheme: scheme,
            getEditSessionIdentifier: async (workspaceFolder, token) => {
                return this._proxy.$getEditSessionIdentifier(workspaceFolder.uri, token);
            },
            provideEditSessionIdentityMatch: async (workspaceFolder, identity1, identity2, token) => {
                return this._proxy.$provideEditSessionIdentityMatch(workspaceFolder.uri, identity1, identity2, token);
            }
        });
        this.registeredEditSessionProviders.set(handle, disposable);
    }
    $unregisterEditSessionIdentityProvider(handle) {
        this.registeredEditSessionProviders.deleteAndDispose(handle);
    }
    $registerCanonicalUriProvider(handle, scheme) {
        const disposable = this._canonicalUriService.registerCanonicalUriProvider({
            scheme: scheme,
            provideCanonicalUri: async (uri, targetScheme, token) => {
                const result = await this._proxy.$provideCanonicalUri(uri, targetScheme, token);
                if (result) {
                    return URI.revive(result);
                }
                return result;
            }
        });
        this.registeredCanonicalUriProviders.set(handle, disposable);
    }
    $unregisterCanonicalUriProvider(handle) {
        this.registeredCanonicalUriProviders.deleteAndDispose(handle);
    }
    // --- encodings
    $resolveDecoding(resource, options) {
        return this._textFileService.resolveDecoding(URI.revive(resource), options);
    }
    $validateDetectedEncoding(resource, detectedEncoding, options) {
        return this._textFileService.validateDetectedEncoding(URI.revive(resource), detectedEncoding, options);
    }
    $resolveEncoding(resource, options) {
        return this._textFileService.resolveEncoding(URI.revive(resource), options);
    }
};
MainThreadWorkspace = __decorate([
    extHostNamedCustomer(MainContext.MainThreadWorkspace),
    __param(1, ISearchService),
    __param(2, IWorkspaceContextService),
    __param(3, IEditSessionIdentityService),
    __param(4, ICanonicalUriService),
    __param(5, IEditorService),
    __param(6, IWorkspaceEditingService),
    __param(7, INotificationService),
    __param(8, IRequestService),
    __param(9, IInstantiationService),
    __param(10, ILabelService),
    __param(11, IEnvironmentService),
    __param(12, IFileService),
    __param(13, IWorkspaceTrustManagementService),
    __param(14, IWorkspaceTrustRequestService),
    __param(15, ITextFileService)
], MainThreadWorkspace);
export { MainThreadWorkspace };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFdvcmtzcGFjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkV29ya3NwYWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDM0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDN0YsT0FBTyxFQUF5QixlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNyRyxPQUFPLEVBQWdDLGdDQUFnQyxFQUFFLDZCQUE2QixFQUErQixNQUFNLHNEQUFzRCxDQUFDO0FBQ2xNLE9BQU8sRUFBYyx3QkFBd0IsRUFBRSxtQkFBbUIsRUFBbUIsTUFBTSxpREFBaUQsQ0FBQztBQUM3SSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdURB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