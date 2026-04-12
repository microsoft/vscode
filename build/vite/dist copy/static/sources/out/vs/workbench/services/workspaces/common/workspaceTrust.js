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
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { getRemoteAuthority } from '../../../../platform/remote/common/remoteHosts.js';
import { isVirtualResource } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isSavedWorkspace, isSingleFolderWorkspaceIdentifier, isTemporaryWorkspace, IWorkspaceContextService, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, IWorkspaceTrustEnablementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { Memento } from '../../../common/memento.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isEqualAuthority } from '../../../../base/common/resources.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { promiseWithResolvers } from '../../../../base/common/async.js';
import { ResourceMap } from '../../../../base/common/map.js';
export const WORKSPACE_TRUST_ENABLED = 'security.workspace.trust.enabled';
export const WORKSPACE_TRUST_STARTUP_PROMPT = 'security.workspace.trust.startupPrompt';
export const WORKSPACE_TRUST_BANNER = 'security.workspace.trust.banner';
export const WORKSPACE_TRUST_UNTRUSTED_FILES = 'security.workspace.trust.untrustedFiles';
export const WORKSPACE_TRUST_EMPTY_WINDOW = 'security.workspace.trust.emptyWindow';
export const WORKSPACE_TRUST_EXTENSION_SUPPORT = 'extensions.supportUntrustedWorkspaces';
export const WORKSPACE_TRUST_STORAGE_KEY = 'content.trust.model.key';
export class CanonicalWorkspace {
    constructor(originalWorkspace, canonicalFolderUris, canonicalConfiguration) {
        this.originalWorkspace = originalWorkspace;
        this.canonicalFolderUris = canonicalFolderUris;
        this.canonicalConfiguration = canonicalConfiguration;
    }
    get folders() {
        return this.originalWorkspace.folders.map((folder, index) => {
            return {
                index: folder.index,
                name: folder.name,
                toResource: folder.toResource,
                uri: this.canonicalFolderUris[index]
            };
        });
    }
    get transient() {
        return this.originalWorkspace.transient;
    }
    get configuration() {
        return this.canonicalConfiguration ?? this.originalWorkspace.configuration;
    }
    get id() {
        return this.originalWorkspace.id;
    }
}
let WorkspaceTrustEnablementService = class WorkspaceTrustEnablementService extends Disposable {
    constructor(configurationService, environmentService) {
        super();
        this.configurationService = configurationService;
        this.environmentService = environmentService;
    }
    isWorkspaceTrustEnabled() {
        if (this.environmentService.disableWorkspaceTrust) {
            return false;
        }
        return !!this.configurationService.getValue(WORKSPACE_TRUST_ENABLED);
    }
};
WorkspaceTrustEnablementService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IWorkbenchEnvironmentService)
], WorkspaceTrustEnablementService);
export { WorkspaceTrustEnablementService };
let WorkspaceTrustManagementService = class WorkspaceTrustManagementService extends Disposable {
    constructor(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, workspaceService, workspaceTrustEnablementService, fileService) {
        super();
        this.configurationService = configurationService;
        this.remoteAuthorityResolverService = remoteAuthorityResolverService;
        this.storageService = storageService;
        this.uriIdentityService = uriIdentityService;
        this.environmentService = environmentService;
        this.workspaceService = workspaceService;
        this.workspaceTrustEnablementService = workspaceTrustEnablementService;
        this.fileService = fileService;
        this.storageKey = WORKSPACE_TRUST_STORAGE_KEY;
        this._onDidChangeTrust = this._register(new Emitter());
        this.onDidChangeTrust = this._onDidChangeTrust.event;
        this._onDidChangeTrustedFolders = this._register(new Emitter());
        this.onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;
        this._canonicalStartupFiles = [];
        this._canonicalUrisResolved = false;
        this._canonicalWorkspace = this.workspaceService.getWorkspace();
        ({ promise: this._workspaceResolvedPromise, resolve: this._workspaceResolvedPromiseResolve } = promiseWithResolvers());
        ({ promise: this._workspaceTrustInitializedPromise, resolve: this._workspaceTrustInitializedPromiseResolve } = promiseWithResolvers());
        this._storedTrustState = new WorkspaceTrustMemento(isWeb && this.isEmptyWorkspace() ? undefined : this.storageService);
        this._trustTransitionManager = this._register(new WorkspaceTrustTransitionManager());
        this._trustStateInfo = this.loadTrustInfo();
        this._isTrusted = this.calculateWorkspaceTrust();
        this.initializeWorkspaceTrust();
        this.registerListeners();
    }
    //#region initialize
    initializeWorkspaceTrust() {
        // Resolve canonical Uris
        this.resolveCanonicalUris()
            .then(async () => {
            this._canonicalUrisResolved = true;
            await this.updateWorkspaceTrust();
        })
            .finally(() => {
            this._workspaceResolvedPromiseResolve();
            if (!this.environmentService.remoteAuthority) {
                this._workspaceTrustInitializedPromiseResolve();
            }
        });
        // Remote - resolve remote authority
        if (this.environmentService.remoteAuthority) {
            this.remoteAuthorityResolverService.resolveAuthority(this.environmentService.remoteAuthority)
                .then(async (result) => {
                this._remoteAuthority = result;
                await this.fileService.activateProvider(Schemas.vscodeRemote);
                await this.updateWorkspaceTrust();
            })
                .finally(() => {
                this._workspaceTrustInitializedPromiseResolve();
            });
        }
        // Empty workspace - save initial state to memento
        if (this.isEmptyWorkspace()) {
            this._workspaceTrustInitializedPromise.then(() => {
                if (this._storedTrustState.isEmptyWorkspaceTrusted === undefined) {
                    this._storedTrustState.isEmptyWorkspaceTrusted = this.isWorkspaceTrusted();
                }
            });
        }
    }
    //#endregion
    //#region private interface
    registerListeners() {
        this._register(this.workspaceService.onDidChangeWorkspaceFolders(async () => await this.updateWorkspaceTrust()));
        this._register(this.storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, this.storageKey, this._store)(async () => {
            /* This will only execute if storage was changed by a user action in a separate window */
            if (JSON.stringify(this._trustStateInfo) !== JSON.stringify(this.loadTrustInfo())) {
                this._trustStateInfo = this.loadTrustInfo();
                this._onDidChangeTrustedFolders.fire();
                await this.updateWorkspaceTrust();
            }
        }));
    }
    async getCanonicalUri(uri) {
        let canonicalUri = uri;
        if (this.environmentService.remoteAuthority && uri.scheme === Schemas.vscodeRemote) {
            canonicalUri = await this.remoteAuthorityResolverService.getCanonicalURI(uri);
        }
        else if (uri.scheme === 'vscode-vfs') {
            const index = uri.authority.indexOf('+');
            if (index !== -1) {
                canonicalUri = uri.with({ authority: uri.authority.substr(0, index) });
            }
        }
        // ignore query and fragent section of uris always
        return canonicalUri.with({ query: null, fragment: null });
    }
    async resolveCanonicalUris() {
        // Open editors
        const filesToOpen = [];
        if (this.environmentService.filesToOpenOrCreate) {
            filesToOpen.push(...this.environmentService.filesToOpenOrCreate);
        }
        if (this.environmentService.filesToDiff) {
            filesToOpen.push(...this.environmentService.filesToDiff);
        }
        if (this.environmentService.filesToMerge) {
            filesToOpen.push(...this.environmentService.filesToMerge);
        }
        if (filesToOpen.length) {
            const filesToOpenOrCreateUris = filesToOpen.filter(f => !!f.fileUri).map(f => f.fileUri);
            const canonicalFilesToOpen = await Promise.all(filesToOpenOrCreateUris.map(uri => this.getCanonicalUri(uri)));
            this._canonicalStartupFiles.push(...canonicalFilesToOpen.filter(uri => this._canonicalStartupFiles.every(u => !this.uriIdentityService.extUri.isEqual(uri, u))));
        }
        // Workspace
        const workspaceUris = this.workspaceService.getWorkspace().folders.map(f => f.uri);
        const canonicalWorkspaceFolders = await Promise.all(workspaceUris.map(uri => this.getCanonicalUri(uri)));
        let canonicalWorkspaceConfiguration = this.workspaceService.getWorkspace().configuration;
        if (canonicalWorkspaceConfiguration && isSavedWorkspace(canonicalWorkspaceConfiguration, this.environmentService)) {
            canonicalWorkspaceConfiguration = await this.getCanonicalUri(canonicalWorkspaceConfiguration);
        }
        this._canonicalWorkspace = new CanonicalWorkspace(this.workspaceService.getWorkspace(), canonicalWorkspaceFolders, canonicalWorkspaceConfiguration);
    }
    loadTrustInfo() {
        const infoAsString = this.storageService.get(this.storageKey, -1 /* StorageScope.APPLICATION */);
        let result;
        try {
            if (infoAsString) {
                result = JSON.parse(infoAsString);
            }
        }
        catch { }
        if (!result) {
            result = {
                uriTrustInfo: []
            };
        }
        if (!result.uriTrustInfo) {
            result.uriTrustInfo = [];
        }
        result.uriTrustInfo = result.uriTrustInfo.map(info => { return { uri: URI.revive(info.uri), trusted: info.trusted }; });
        result.uriTrustInfo = result.uriTrustInfo.filter(info => info.trusted);
        return result;
    }
    async saveTrustInfo() {
        this.storageService.store(this.storageKey, JSON.stringify(this._trustStateInfo), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        this._onDidChangeTrustedFolders.fire();
        await this.updateWorkspaceTrust();
    }
    getWorkspaceUris() {
        const workspaceUris = this._canonicalWorkspace.folders.map(f => f.uri);
        const workspaceConfiguration = this._canonicalWorkspace.configuration;
        if (workspaceConfiguration && isSavedWorkspace(workspaceConfiguration, this.environmentService)) {
            workspaceUris.push(workspaceConfiguration);
        }
        return workspaceUris;
    }
    calculateWorkspaceTrust() {
        // Feature is disabled
        if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
            return true;
        }
        // Canonical Uris not yet resolved
        if (!this._canonicalUrisResolved) {
            return false;
        }
        // Remote - resolver explicitly sets workspace trust to TRUE
        if (this.environmentService.remoteAuthority && this._remoteAuthority?.options?.isTrusted) {
            return this._remoteAuthority.options.isTrusted;
        }
        // Empty workspace - use memento, open ediors, or user setting
        if (this.isEmptyWorkspace()) {
            // Use memento if present
            if (this._storedTrustState.isEmptyWorkspaceTrusted !== undefined) {
                return this._storedTrustState.isEmptyWorkspaceTrusted;
            }
            // Startup files
            if (this._canonicalStartupFiles.length) {
                return this.getUrisTrust(this._canonicalStartupFiles);
            }
            // User setting
            return !!this.configurationService.getValue(WORKSPACE_TRUST_EMPTY_WINDOW);
        }
        return this.getUrisTrust(this.getWorkspaceUris());
    }
    async updateWorkspaceTrust(trusted) {
        if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
            return;
        }
        if (trusted === undefined) {
            await this.resolveCanonicalUris();
            trusted = this.calculateWorkspaceTrust();
        }
        if (this.isWorkspaceTrusted() === trusted) {
            return;
        }
        // Update workspace trust
        this.isTrusted = trusted;
        // Run workspace trust transition participants
        await this._trustTransitionManager.participate(trusted);
        // Fire workspace trust change event
        this._onDidChangeTrust.fire(trusted);
    }
    getUrisTrust(uris) {
        let state = true;
        for (const uri of uris) {
            const { trusted } = this.doGetUriTrustInfo(uri);
            if (!trusted) {
                state = trusted;
                return state;
            }
        }
        return state;
    }
    doGetUriTrustInfo(uri) {
        // Return trusted when workspace trust is disabled
        if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
            return { trusted: true, uri };
        }
        // Agent sessions workspace file is always trusted
        if (this.uriIdentityService.extUri.isEqual(uri, this.environmentService.agentSessionsWorkspace)) {
            return { trusted: true, uri };
        }
        if (this.isTrustedVirtualResource(uri)) {
            return { trusted: true, uri };
        }
        if (this.isTrustedByRemote(uri)) {
            return { trusted: true, uri };
        }
        let resultState = false;
        let maxLength = -1;
        let resultUri = uri;
        for (const trustInfo of this._trustStateInfo.uriTrustInfo) {
            if (this.uriIdentityService.extUri.isEqualOrParent(uri, trustInfo.uri)) {
                const fsPath = trustInfo.uri.fsPath;
                if (fsPath.length > maxLength) {
                    maxLength = fsPath.length;
                    resultState = trustInfo.trusted;
                    resultUri = trustInfo.uri;
                }
            }
        }
        return { trusted: resultState, uri: resultUri };
    }
    async doSetUrisTrust(uris, trusted) {
        let changed = false;
        for (const uri of uris) {
            if (trusted) {
                if (this.isTrustedVirtualResource(uri)) {
                    continue;
                }
                if (this.isTrustedByRemote(uri)) {
                    continue;
                }
                const foundItem = this._trustStateInfo.uriTrustInfo.find(trustInfo => this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
                if (!foundItem) {
                    this._trustStateInfo.uriTrustInfo.push({ uri, trusted: true });
                    changed = true;
                }
            }
            else {
                const previousLength = this._trustStateInfo.uriTrustInfo.length;
                this._trustStateInfo.uriTrustInfo = this._trustStateInfo.uriTrustInfo.filter(trustInfo => !this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
                if (previousLength !== this._trustStateInfo.uriTrustInfo.length) {
                    changed = true;
                }
            }
        }
        if (changed) {
            await this.saveTrustInfo();
        }
    }
    isEmptyWorkspace() {
        if (this.workspaceService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            return true;
        }
        const workspace = this.workspaceService.getWorkspace();
        if (workspace) {
            return isTemporaryWorkspace(this.workspaceService.getWorkspace()) && workspace.folders.length === 0;
        }
        return false;
    }
    isTrustedVirtualResource(uri) {
        return isVirtualResource(uri) && uri.scheme !== 'vscode-vfs';
    }
    isTrustedByRemote(uri) {
        if (!this.environmentService.remoteAuthority) {
            return false;
        }
        if (!this._remoteAuthority) {
            return false;
        }
        return (isEqualAuthority(getRemoteAuthority(uri), this._remoteAuthority.authority.authority)) && !!this._remoteAuthority.options?.isTrusted;
    }
    set isTrusted(value) {
        this._isTrusted = value;
        // Reset acceptsOutOfWorkspaceFiles
        if (!value) {
            this._storedTrustState.acceptsOutOfWorkspaceFiles = false;
        }
        // Empty workspace - save memento
        if (this.isEmptyWorkspace()) {
            this._storedTrustState.isEmptyWorkspaceTrusted = value;
        }
    }
    //#endregion
    //#region public interface
    get workspaceResolved() {
        return this._workspaceResolvedPromise;
    }
    get workspaceTrustInitialized() {
        return this._workspaceTrustInitializedPromise;
    }
    get acceptsOutOfWorkspaceFiles() {
        return this._storedTrustState.acceptsOutOfWorkspaceFiles;
    }
    set acceptsOutOfWorkspaceFiles(value) {
        this._storedTrustState.acceptsOutOfWorkspaceFiles = value;
    }
    isWorkspaceTrusted() {
        return this._isTrusted;
    }
    isWorkspaceTrustForced() {
        // Remote - remote authority explicitly sets workspace trust
        if (this.environmentService.remoteAuthority && this._remoteAuthority?.options?.isTrusted !== undefined) {
            return true;
        }
        // All workspace uris are trusted automatically
        const workspaceUris = this.getWorkspaceUris().filter(uri => !this.isTrustedVirtualResource(uri));
        if (workspaceUris.length === 0) {
            return true;
        }
        return false;
    }
    canSetParentFolderTrust() {
        const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);
        if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
            return false;
        }
        if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== Schemas.vscodeRemote) {
            return false;
        }
        const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
        if (this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, parentFolder)) {
            return false;
        }
        return true;
    }
    async setParentFolderTrust(trusted) {
        if (this.canSetParentFolderTrust()) {
            const workspaceUri = toWorkspaceIdentifier(this._canonicalWorkspace).uri;
            const parentFolder = this.uriIdentityService.extUri.dirname(workspaceUri);
            await this.setUrisTrust([parentFolder], trusted);
        }
    }
    canSetWorkspaceTrust() {
        // Remote - remote authority not yet resolved, or remote authority explicitly sets workspace trust
        if (this.environmentService.remoteAuthority && (!this._remoteAuthority || this._remoteAuthority.options?.isTrusted !== undefined)) {
            return false;
        }
        // Empty workspace
        if (this.isEmptyWorkspace()) {
            return true;
        }
        // All workspace uris are trusted automatically
        const workspaceUris = this.getWorkspaceUris().filter(uri => !this.isTrustedVirtualResource(uri));
        if (workspaceUris.length === 0) {
            return false;
        }
        // Untrusted workspace
        if (!this.isWorkspaceTrusted()) {
            return true;
        }
        // Trusted workspaces
        // Can only untrusted in the single folder scenario
        const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);
        if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
            return false;
        }
        // Can only be untrusted in certain schemes
        if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== 'vscode-vfs') {
            return false;
        }
        // If the current folder isn't trusted directly, return false
        const trustInfo = this.doGetUriTrustInfo(workspaceIdentifier.uri);
        if (!trustInfo.trusted || !this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, trustInfo.uri)) {
            return false;
        }
        // Check if the parent is also trusted
        if (this.canSetParentFolderTrust()) {
            const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
            const parentPathTrustInfo = this.doGetUriTrustInfo(parentFolder);
            if (parentPathTrustInfo.trusted) {
                return false;
            }
        }
        return true;
    }
    async setWorkspaceTrust(trusted) {
        // Empty workspace
        if (this.isEmptyWorkspace()) {
            await this.updateWorkspaceTrust(trusted);
            return;
        }
        const workspaceFolders = this.getWorkspaceUris();
        await this.setUrisTrust(workspaceFolders, trusted);
    }
    async getUriTrustInfo(uri) {
        // Return trusted when workspace trust is disabled
        if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
            return { trusted: true, uri };
        }
        // Uri is trusted automatically by the remote
        if (this.isTrustedByRemote(uri)) {
            return { trusted: true, uri };
        }
        return this.doGetUriTrustInfo(await this.getCanonicalUri(uri));
    }
    async setUrisTrust(uris, trusted) {
        this.doSetUrisTrust(await Promise.all(uris.map(uri => this.getCanonicalUri(uri))), trusted);
    }
    getTrustedUris() {
        return this._trustStateInfo.uriTrustInfo.map(info => info.uri);
    }
    async setTrustedUris(uris) {
        this._trustStateInfo.uriTrustInfo = [];
        for (const uri of uris) {
            const canonicalUri = await this.getCanonicalUri(uri);
            const cleanUri = this.uriIdentityService.extUri.removeTrailingPathSeparator(canonicalUri);
            let added = false;
            for (const addedUri of this._trustStateInfo.uriTrustInfo) {
                if (this.uriIdentityService.extUri.isEqual(addedUri.uri, cleanUri)) {
                    added = true;
                    break;
                }
            }
            if (added) {
                continue;
            }
            this._trustStateInfo.uriTrustInfo.push({
                trusted: true,
                uri: cleanUri
            });
        }
        await this.saveTrustInfo();
    }
    addWorkspaceTrustTransitionParticipant(participant) {
        return this._trustTransitionManager.addWorkspaceTrustTransitionParticipant(participant);
    }
};
WorkspaceTrustManagementService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IRemoteAuthorityResolverService),
    __param(2, IStorageService),
    __param(3, IUriIdentityService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IWorkspaceContextService),
    __param(6, IWorkspaceTrustEnablementService),
    __param(7, IFileService)
], WorkspaceTrustManagementService);
export { WorkspaceTrustManagementService };
let WorkspaceTrustRequestService = class WorkspaceTrustRequestService extends Disposable {
    constructor(configurationService, workspaceTrustManagementService) {
        super();
        this.configurationService = configurationService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this._resourcesTrustRequestPromises = new ResourceMap();
        this._resourcesTrustRequestResolvers = new ResourceMap();
        this._onDidInitiateOpenFilesTrustRequest = this._register(new Emitter());
        this.onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;
        this._onDidInitiateResourcesTrustRequest = this._register(new Emitter());
        this.onDidInitiateResourcesTrustRequest = this._onDidInitiateResourcesTrustRequest.event;
        this._onDidInitiateWorkspaceTrustRequest = this._register(new Emitter());
        this.onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;
        this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
        this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
    }
    //#region Open file(s) trust request
    get untrustedFilesSetting() {
        return this.configurationService.getValue(WORKSPACE_TRUST_UNTRUSTED_FILES);
    }
    set untrustedFilesSetting(value) {
        this.configurationService.updateValue(WORKSPACE_TRUST_UNTRUSTED_FILES, value);
    }
    async completeOpenFilesTrustRequest(result, saveResponse) {
        if (!this._openFilesTrustRequestResolver) {
            return;
        }
        // Set acceptsOutOfWorkspaceFiles
        if (result === 1 /* WorkspaceTrustUriResponse.Open */) {
            this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles = true;
        }
        // Save response
        if (saveResponse) {
            if (result === 1 /* WorkspaceTrustUriResponse.Open */) {
                this.untrustedFilesSetting = 'open';
            }
            if (result === 2 /* WorkspaceTrustUriResponse.OpenInNewWindow */) {
                this.untrustedFilesSetting = 'newWindow';
            }
        }
        // Resolve promise
        this._openFilesTrustRequestResolver(result);
        this._openFilesTrustRequestResolver = undefined;
        this._openFilesTrustRequestPromise = undefined;
    }
    async requestOpenFilesTrust(uris) {
        // If workspace is untrusted, there is no conflict
        if (!this.workspaceTrustManagementService.isWorkspaceTrusted()) {
            return 1 /* WorkspaceTrustUriResponse.Open */;
        }
        const openFilesTrustInfo = await Promise.all(uris.map(uri => this.workspaceTrustManagementService.getUriTrustInfo(uri)));
        // If all uris are trusted, there is no conflict
        if (openFilesTrustInfo.map(info => info.trusted).every(trusted => trusted)) {
            return 1 /* WorkspaceTrustUriResponse.Open */;
        }
        // If user has setting, don't need to ask
        if (this.untrustedFilesSetting !== 'prompt') {
            if (this.untrustedFilesSetting === 'newWindow') {
                return 2 /* WorkspaceTrustUriResponse.OpenInNewWindow */;
            }
            if (this.untrustedFilesSetting === 'open') {
                return 1 /* WorkspaceTrustUriResponse.Open */;
            }
        }
        // If we already asked the user, don't need to ask again
        if (this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles) {
            return 1 /* WorkspaceTrustUriResponse.Open */;
        }
        // Create/return a promise
        if (!this._openFilesTrustRequestPromise) {
            this._openFilesTrustRequestPromise = new Promise(resolve => {
                this._openFilesTrustRequestResolver = resolve;
            });
        }
        else {
            return this._openFilesTrustRequestPromise;
        }
        this._onDidInitiateOpenFilesTrustRequest.fire();
        return this._openFilesTrustRequestPromise;
    }
    //#endregion
    //#region Resource(s) trust request
    async completeResourcesTrustRequest(uri, result) {
        const resolver = this._resourcesTrustRequestResolvers.get(uri);
        if (!resolver) {
            return;
        }
        const trusted = result === 1 /* WorkspaceTrustUriResponse.Open */;
        await this.workspaceTrustManagementService.setUrisTrust([uri], trusted);
        resolver(trusted);
        this._resourcesTrustRequestResolvers.delete(uri);
        this._resourcesTrustRequestPromises.delete(uri);
    }
    async requestResourcesTrust(options) {
        // Check if all resources are already trusted
        const resourcesTrustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(options.uri);
        if (resourcesTrustInfo.trusted) {
            return true;
        }
        // Return existing promise for this URI
        const existingPromise = this._resourcesTrustRequestPromises.get(options.uri);
        if (existingPromise) {
            return existingPromise;
        }
        // Create a new promise for this URI
        const promise = new Promise(resolve => {
            this._resourcesTrustRequestResolvers.set(options.uri, resolve);
        });
        this._resourcesTrustRequestPromises.set(options.uri, promise);
        this._onDidInitiateResourcesTrustRequest.fire(options);
        return promise;
    }
    //#endregion
    //#region Workspace trust request
    resolveWorkspaceTrustRequest(trusted) {
        if (this._workspaceTrustRequestResolver) {
            this._workspaceTrustRequestResolver(trusted ?? this.workspaceTrustManagementService.isWorkspaceTrusted());
            this._workspaceTrustRequestResolver = undefined;
            this._workspaceTrustRequestPromise = undefined;
        }
    }
    cancelWorkspaceTrustRequest() {
        if (this._workspaceTrustRequestResolver) {
            this._workspaceTrustRequestResolver(undefined);
            this._workspaceTrustRequestResolver = undefined;
            this._workspaceTrustRequestPromise = undefined;
        }
    }
    async completeWorkspaceTrustRequest(trusted) {
        if (trusted === undefined || trusted === this.workspaceTrustManagementService.isWorkspaceTrusted()) {
            this.resolveWorkspaceTrustRequest(trusted);
            return;
        }
        // Register one-time event handler to resolve the promise when workspace trust changed
        Event.once(this.workspaceTrustManagementService.onDidChangeTrust)(trusted => this.resolveWorkspaceTrustRequest(trusted));
        // Update storage, transition workspace state
        await this.workspaceTrustManagementService.setWorkspaceTrust(trusted);
    }
    async requestWorkspaceTrust(options) {
        // Trusted workspace
        if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
            return this.workspaceTrustManagementService.isWorkspaceTrusted();
        }
        // Modal request
        if (!this._workspaceTrustRequestPromise) {
            // Create promise
            this._workspaceTrustRequestPromise = new Promise(resolve => {
                this._workspaceTrustRequestResolver = resolve;
            });
        }
        else {
            // Return existing promise
            return this._workspaceTrustRequestPromise;
        }
        this._onDidInitiateWorkspaceTrustRequest.fire(options);
        return this._workspaceTrustRequestPromise;
    }
    requestWorkspaceTrustOnStartup() {
        if (!this._workspaceTrustRequestPromise) {
            // Create promise
            this._workspaceTrustRequestPromise = new Promise(resolve => {
                this._workspaceTrustRequestResolver = resolve;
            });
        }
        this._onDidInitiateWorkspaceTrustRequestOnStartup.fire();
    }
};
WorkspaceTrustRequestService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IWorkspaceTrustManagementService)
], WorkspaceTrustRequestService);
export { WorkspaceTrustRequestService };
class WorkspaceTrustTransitionManager extends Disposable {
    constructor() {
        super(...arguments);
        this.participants = new LinkedList();
    }
    addWorkspaceTrustTransitionParticipant(participant) {
        const remove = this.participants.push(participant);
        return toDisposable(() => remove());
    }
    async participate(trusted) {
        for (const participant of this.participants) {
            await participant.participate(trusted);
        }
    }
    dispose() {
        this.participants.clear();
        super.dispose();
    }
}
class WorkspaceTrustMemento {
    constructor(storageService) {
        this._acceptsOutOfWorkspaceFilesKey = 'acceptsOutOfWorkspaceFiles';
        this._isEmptyWorkspaceTrustedKey = 'isEmptyWorkspaceTrusted';
        if (storageService) {
            this._memento = new Memento('workspaceTrust', storageService);
            this._mementoObject = this._memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this._mementoObject = {};
        }
    }
    get acceptsOutOfWorkspaceFiles() {
        return this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] ?? false;
    }
    set acceptsOutOfWorkspaceFiles(value) {
        this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] = value;
        this._memento?.saveMemento();
    }
    get isEmptyWorkspaceTrusted() {
        return this._mementoObject[this._isEmptyWorkspaceTrustedKey];
    }
    set isEmptyWorkspaceTrusted(value) {
        this._mementoObject[this._isEmptyWorkspaceTrustedKey] = value;
        this._memento?.saveMemento();
    }
}
registerSingleton(IWorkspaceTrustRequestService, WorkspaceTrustRequestService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlVHJ1c3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlVHJ1c3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsK0JBQStCLEVBQWtCLE1BQU0sK0RBQStELENBQUM7QUFDaEksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQW9DLGdCQUFnQixFQUFFLGlDQUFpQyxFQUFFLG9CQUFvQixFQUFjLHdCQUF3QixFQUFvQixxQkFBcUIsRUFBa0IsTUFBTSxvREFBb0QsQ0FBQztBQUNoUixPQUFPLEVBQWdDLGdDQUFnQyxFQUErQyw2QkFBNkIsRUFBbUUsZ0NBQWdDLEVBQStCLE1BQU0seURBQXlELENBQUM7QUFDclYsT0FBTyxF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