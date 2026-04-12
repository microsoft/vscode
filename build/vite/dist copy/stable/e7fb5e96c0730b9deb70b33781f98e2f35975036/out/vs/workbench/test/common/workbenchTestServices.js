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
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { bufferToStream, readableToBuffer, VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { observableValue } from '../../../base/common/observable.js';
import { join } from '../../../base/common/path.js';
import { isLinux, isMacintosh } from '../../../base/common/platform.js';
import { basename, isEqual, isEqualOrParent } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { AbstractLoggerService, LogLevel, NullLogger } from '../../../platform/log/common/log.js';
import product from '../../../platform/product/common/product.js';
import { InMemoryStorageService } from '../../../platform/storage/common/storage.js';
import { toUserDataProfile } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { TestWorkspace } from '../../../platform/workspace/test/common/testWorkspace.js';
import { ChatEntitlement } from '../../services/chat/common/chatEntitlementService.js';
import { NullExtensionService } from '../../services/extensions/common/extensions.js';
export class TestLoggerService extends AbstractLoggerService {
    constructor(logsHome) {
        super(LogLevel.Info, logsHome ?? URI.file('tests').with({ scheme: 'vscode-tests' }));
    }
    doCreateLogger() { return new NullLogger(); }
}
let TestTextResourcePropertiesService = class TestTextResourcePropertiesService {
    constructor(configurationService) {
        this.configurationService = configurationService;
    }
    getEOL(resource, language) {
        const eol = this.configurationService.getValue('files.eol', { overrideIdentifier: language, resource });
        if (eol && typeof eol === 'string' && eol !== 'auto') {
            return eol;
        }
        return (isLinux || isMacintosh) ? '\n' : '\r\n';
    }
};
TestTextResourcePropertiesService = __decorate([
    __param(0, IConfigurationService)
], TestTextResourcePropertiesService);
export { TestTextResourcePropertiesService };
export class TestUserDataProfileService {
    constructor() {
        this.onDidChangeCurrentProfile = Event.None;
        this.currentProfile = toUserDataProfile('test', 'test', URI.file('tests').with({ scheme: 'vscode-tests' }), URI.file('tests').with({ scheme: 'vscode-tests' }));
    }
    async updateCurrentProfile() { }
}
export class TestContextService {
    get onDidChangeWorkspaceName() { return this._onDidChangeWorkspaceName.event; }
    get onWillChangeWorkspaceFolders() { return this._onWillChangeWorkspaceFolders.event; }
    get onDidChangeWorkspaceFolders() { return this._onDidChangeWorkspaceFolders.event; }
    get onDidChangeWorkbenchState() { return this._onDidChangeWorkbenchState.event; }
    constructor(workspace = TestWorkspace, options = null) {
        this.workspace = workspace;
        this.options = options || Object.create(null);
        this._onDidChangeWorkspaceName = new Emitter();
        this._onWillChangeWorkspaceFolders = new Emitter();
        this._onDidChangeWorkspaceFolders = new Emitter();
        this._onDidChangeWorkbenchState = new Emitter();
    }
    getFolders() {
        return this.workspace ? this.workspace.folders : [];
    }
    getWorkbenchState() {
        if (this.workspace.configuration) {
            return 3 /* WorkbenchState.WORKSPACE */;
        }
        if (this.workspace.folders.length) {
            return 2 /* WorkbenchState.FOLDER */;
        }
        return 1 /* WorkbenchState.EMPTY */;
    }
    hasWorkspaceData() {
        return this.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    }
    getCompleteWorkspace() {
        return Promise.resolve(this.getWorkspace());
    }
    getWorkspace() {
        return this.workspace;
    }
    getWorkspaceFolder(resource) {
        return this.workspace.getFolder(resource);
    }
    setWorkspace(workspace) {
        this.workspace = workspace;
    }
    getOptions() {
        return this.options;
    }
    updateOptions() { }
    isInsideWorkspace(resource) {
        if (resource && this.workspace) {
            return isEqualOrParent(resource, this.workspace.folders[0].uri);
        }
        return false;
    }
    toResource(workspaceRelativePath) {
        return URI.file(join('C:\\', workspaceRelativePath));
    }
    isCurrentWorkspace(workspaceIdOrFolder) {
        return URI.isUri(workspaceIdOrFolder) && isEqual(this.workspace.folders[0].uri, workspaceIdOrFolder);
    }
}
export class TestStorageService extends InMemoryStorageService {
    testEmitWillSaveState(reason) {
        super.emitWillSaveState(reason);
    }
}
export class TestHistoryService {
    constructor(root) {
        this.root = root;
    }
    async reopenLastClosedEditor() { }
    async goForward() { }
    async goBack() { }
    async goPrevious() { }
    async goLast() { }
    removeFromHistory(_input) { }
    clear() { }
    clearRecentlyOpened() { }
    getHistory() { return []; }
    async openNextRecentlyUsedEditor(group) { }
    async openPreviouslyUsedEditor(group) { }
    getLastActiveWorkspaceRoot(_schemeFilter) { return this.root; }
    getLastActiveFile(_schemeFilter) { return undefined; }
}
export class TestWorkingCopy extends Disposable {
    constructor(resource, isDirty = false, typeId = 'testWorkingCopyType') {
        super();
        this.resource = resource;
        this.typeId = typeId;
        this._onDidChangeDirty = this._register(new Emitter());
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._onDidChangeContent = this._register(new Emitter());
        this.onDidChangeContent = this._onDidChangeContent.event;
        this._onDidSave = this._register(new Emitter());
        this.onDidSave = this._onDidSave.event;
        this.capabilities = 0 /* WorkingCopyCapabilities.None */;
        this.dirty = false;
        this.name = basename(this.resource);
        this.dirty = isDirty;
    }
    setDirty(dirty) {
        if (this.dirty !== dirty) {
            this.dirty = dirty;
            this._onDidChangeDirty.fire();
        }
    }
    setContent(content) {
        this._onDidChangeContent.fire();
    }
    isDirty() {
        return this.dirty;
    }
    isModified() {
        return this.isDirty();
    }
    async save(options, stat) {
        this._onDidSave.fire({ reason: options?.reason ?? 1 /* SaveReason.EXPLICIT */, stat: stat ?? createFileStat(this.resource), source: options?.source });
        return true;
    }
    async revert(options) {
        this.setDirty(false);
    }
    async backup(token) {
        return {};
    }
}
export function createFileStat(resource, readonly = false, isFile, isDirectory, isSymbolicLink, children, executable) {
    return {
        resource,
        etag: Date.now().toString(),
        mtime: Date.now(),
        ctime: Date.now(),
        size: 42,
        isFile: isFile ?? true,
        isDirectory: isDirectory ?? false,
        isSymbolicLink: isSymbolicLink ?? false,
        readonly,
        locked: false,
        executable: executable ?? false,
        name: basename(resource),
        children: children?.map(c => createFileStat(c.resource, false, c.isFile, c.isDirectory, c.isSymbolicLink, undefined, c.executable)),
    };
}
export class TestWorkingCopyFileService {
    constructor() {
        this.onWillRunWorkingCopyFileOperation = Event.None;
        this.onDidFailWorkingCopyFileOperation = Event.None;
        this.onDidRunWorkingCopyFileOperation = Event.None;
        this.hasSaveParticipants = false;
    }
    addFileOperationParticipant(participant) { return Disposable.None; }
    addSaveParticipant(participant) { return Disposable.None; }
    async runSaveParticipants(workingCopy, context, progress, token) { }
    async delete(operations, token, undoInfo) { }
    registerWorkingCopyProvider(provider) { return Disposable.None; }
    getDirty(resource) { return []; }
    create(operations, token, undoInfo) { throw new Error('Method not implemented.'); }
    createFolder(operations, token, undoInfo) { throw new Error('Method not implemented.'); }
    move(operations, token, undoInfo) { throw new Error('Method not implemented.'); }
    copy(operations, token, undoInfo) { throw new Error('Method not implemented.'); }
}
export function mock() {
    // eslint-disable-next-line local/code-no-any-casts
    return function () { };
}
export class TestExtensionService extends NullExtensionService {
}
export const TestProductService = { _serviceBrand: undefined, ...product };
export class TestActivityService {
    constructor() {
        this.onDidChangeActivity = Event.None;
    }
    getViewContainerActivities(viewContainerId) {
        return [];
    }
    getActivity(id) {
        return [];
    }
    showViewContainerActivity(viewContainerId, badge) {
        return this;
    }
    showViewActivity(viewId, badge) {
        return this;
    }
    showAccountsActivity(activity) {
        return this;
    }
    showGlobalActivity(activity) {
        return this;
    }
    dispose() { }
}
export const NullFilesConfigurationService = new class {
    constructor() {
        this.onDidChangeAutoSaveConfiguration = Event.None;
        this.onDidChangeAutoSaveDisabled = Event.None;
        this.onDidChangeReadonly = Event.None;
        this.onDidChangeFilesAssociation = Event.None;
        this.isHotExitEnabled = false;
        this.hotExitConfiguration = undefined;
    }
    getAutoSaveConfiguration() { throw new Error('Method not implemented.'); }
    getAutoSaveMode() { throw new Error('Method not implemented.'); }
    hasShortAutoSaveDelay() { throw new Error('Method not implemented.'); }
    toggleAutoSave() { throw new Error('Method not implemented.'); }
    enableAutoSaveAfterShortDelay(resourceOrEditor) { throw new Error('Method not implemented.'); }
    disableAutoSave(resourceOrEditor) { throw new Error('Method not implemented.'); }
    isReadonly(resource, stat) { return false; }
    async updateReadonly(resource, readonly) { }
    preventSaveConflicts(resource, language) { throw new Error('Method not implemented.'); }
};
export class TestWorkspaceTrustEnablementService {
    constructor(isEnabled = true) {
        this.isEnabled = isEnabled;
    }
    isWorkspaceTrustEnabled() {
        return this.isEnabled;
    }
}
export class TestWorkspaceTrustManagementService extends Disposable {
    constructor(trusted = true, trustedUris = new ResourceSet()) {
        super();
        this.trusted = trusted;
        this.trustedUris = trustedUris;
        this._onDidChangeTrust = this._register(new Emitter());
        this.onDidChangeTrust = this._onDidChangeTrust.event;
        this._onDidChangeTrustedFolders = this._register(new Emitter());
        this.onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;
        this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
        this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
    }
    get acceptsOutOfWorkspaceFiles() {
        throw new Error('Method not implemented.');
    }
    set acceptsOutOfWorkspaceFiles(value) {
        throw new Error('Method not implemented.');
    }
    addWorkspaceTrustTransitionParticipant(participant) {
        throw new Error('Method not implemented.');
    }
    getTrustedUris() {
        throw new Error('Method not implemented.');
    }
    setParentFolderTrust(trusted) {
        throw new Error('Method not implemented.');
    }
    getUriTrustInfo(uri) {
        return Promise.resolve({ trusted: this.trustedUris.has(uri), uri });
    }
    async setTrustedUris(folders) {
        this.trustedUris = new ResourceSet(folders);
    }
    async setUrisTrust(uris, trusted) {
        throw new Error('Method not implemented.');
    }
    canSetParentFolderTrust() {
        throw new Error('Method not implemented.');
    }
    canSetWorkspaceTrust() {
        throw new Error('Method not implemented.');
    }
    isWorkspaceTrusted() {
        return this.trusted;
    }
    isWorkspaceTrustForced() {
        return false;
    }
    get workspaceTrustInitialized() {
        return Promise.resolve();
    }
    get workspaceResolved() {
        return Promise.resolve();
    }
    async setWorkspaceTrust(trusted) {
        if (this.trusted !== trusted) {
            this.trusted = trusted;
            this._onDidChangeTrust.fire(this.trusted);
        }
    }
}
export class TestWorkspaceTrustRequestService extends Disposable {
    constructor(_trusted) {
        super();
        this._trusted = _trusted;
        this._onDidInitiateOpenFilesTrustRequest = this._register(new Emitter());
        this.onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;
        this._onDidInitiateResourcesTrustRequest = this._register(new Emitter());
        this.onDidInitiateResourcesTrustRequest = this._onDidInitiateResourcesTrustRequest.event;
        this._onDidInitiateWorkspaceTrustRequest = this._register(new Emitter());
        this.onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;
        this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
        this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
        this.requestOpenUrisHandler = async (uris) => {
            return 1 /* WorkspaceTrustUriResponse.Open */;
        };
    }
    requestOpenFilesTrust(uris) {
        return this.requestOpenUrisHandler(uris);
    }
    async completeOpenFilesTrustRequest(result, saveResponse) {
        throw new Error('Method not implemented.');
    }
    async completeResourcesTrustRequest(uri, result) {
        throw new Error('Method not implemented.');
    }
    async requestResourcesTrust(options) {
        return this._trusted;
    }
    cancelWorkspaceTrustRequest() {
        throw new Error('Method not implemented.');
    }
    async completeWorkspaceTrustRequest(trusted) {
        throw new Error('Method not implemented.');
    }
    async requestWorkspaceTrust(options) {
        return this._trusted;
    }
    requestWorkspaceTrustOnStartup() {
        throw new Error('Method not implemented.');
    }
}
export class TestMarkerService {
    constructor() {
        this.onMarkerChanged = Event.None;
    }
    getStatistics() { throw new Error('Method not implemented.'); }
    changeOne(owner, resource, markers) { }
    changeAll(owner, data) { }
    remove(owner, resources) { }
    read(filter) { return []; }
    installResourceFilter(resource, reason) {
        return { dispose: () => { } };
    }
}
export class TestFileService {
    constructor() {
        this._onDidFilesChange = new Emitter();
        this._onDidRunOperation = new Emitter();
        this._onDidChangeFileSystemProviderCapabilities = new Emitter();
        this._onWillActivateFileSystemProvider = new Emitter();
        this.onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
        this.onDidWatchError = Event.None;
        this.content = 'Hello Html';
        this.readonly = false;
        // Tracking functionality for tests
        this.writeOperations = [];
        this.readOperations = [];
        this.notExistsSet = new ResourceMap();
        this.readShouldThrowError = undefined;
        this.writeShouldThrowError = undefined;
        this.onDidChangeFileSystemProviderRegistrations = Event.None;
        this.providers = new Map();
        this.watches = [];
    }
    get onDidFilesChange() { return this._onDidFilesChange.event; }
    fireFileChanges(event) { this._onDidFilesChange.fire(event); }
    get onDidRunOperation() { return this._onDidRunOperation.event; }
    fireAfterOperation(event) { this._onDidRunOperation.fire(event); }
    get onDidChangeFileSystemProviderCapabilities() { return this._onDidChangeFileSystemProviderCapabilities.event; }
    fireFileSystemProviderCapabilitiesChangeEvent(event) { this._onDidChangeFileSystemProviderCapabilities.fire(event); }
    setContent(content) { this.content = content; }
    getContent() { return this.content; }
    getLastReadFileUri() { return this.lastReadFileUri; }
    // Clear tracking data for tests
    clearTracking() {
        this.writeOperations.length = 0;
        this.readOperations.length = 0;
    }
    async resolve(resource, _options) {
        return createFileStat(resource, this.readonly);
    }
    stat(resource) {
        return this.resolve(resource, { resolveMetadata: true });
    }
    async realpath(resource) {
        return resource;
    }
    async resolveAll(toResolve) {
        const stats = await Promise.all(toResolve.map(resourceAndOption => this.resolve(resourceAndOption.resource, resourceAndOption.options)));
        return stats.map(stat => ({ stat, success: true }));
    }
    async exists(_resource) { return !this.notExistsSet.has(_resource); }
    async readFile(resource, options) {
        if (this.readShouldThrowError) {
            throw this.readShouldThrowError;
        }
        this.lastReadFileUri = resource;
        this.readOperations.push({ resource });
        return {
            ...createFileStat(resource, this.readonly),
            value: VSBuffer.fromString(this.content)
        };
    }
    async readFileStream(resource, options) {
        if (this.readShouldThrowError) {
            throw this.readShouldThrowError;
        }
        this.lastReadFileUri = resource;
        return {
            ...createFileStat(resource, this.readonly),
            value: bufferToStream(VSBuffer.fromString(this.content))
        };
    }
    async writeFile(resource, bufferOrReadable, options) {
        await timeout(0);
        if (this.writeShouldThrowError) {
            throw this.writeShouldThrowError;
        }
        let content;
        if (bufferOrReadable instanceof VSBuffer) {
            content = bufferOrReadable;
        }
        else {
            try {
                content = readableToBuffer(bufferOrReadable);
            }
            catch {
                // Some preexisting tests are writing with invalid objects
            }
        }
        if (content) {
            this.writeOperations.push({ resource, content: content.toString() });
        }
        return createFileStat(resource, this.readonly);
    }
    move(_source, _target, _overwrite) { return Promise.resolve(null); }
    copy(_source, _target, _overwrite) { return Promise.resolve(null); }
    async cloneFile(_source, _target) { }
    createFile(_resource, _content, _options) { return Promise.resolve(null); }
    createFolder(_resource) { return Promise.resolve(null); }
    registerProvider(scheme, provider) {
        this.providers.set(scheme, provider);
        return toDisposable(() => this.providers.delete(scheme));
    }
    getProvider(scheme) {
        return this.providers.get(scheme);
    }
    async activateProvider(_scheme) {
        this._onWillActivateFileSystemProvider.fire({ scheme: _scheme, join: () => { } });
    }
    async canHandleResource(resource) { return this.hasProvider(resource); }
    hasProvider(resource) { return resource.scheme === Schemas.file || this.providers.has(resource.scheme); }
    listCapabilities() {
        return [
            { scheme: Schemas.file, capabilities: 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */ },
            ...Iterable.map(this.providers, ([scheme, p]) => { return { scheme, capabilities: p.capabilities }; })
        ];
    }
    hasCapability(resource, capability) {
        if (capability === 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */ && isLinux) {
            return true;
        }
        const provider = this.getProvider(resource.scheme);
        return !!(provider && (provider.capabilities & capability));
    }
    async del(_resource, _options) { }
    createWatcher(resource, options) {
        return {
            onDidChange: Event.None,
            dispose: () => { }
        };
    }
    watch(_resource) {
        this.watches.push(_resource);
        return toDisposable(() => this.watches.splice(this.watches.indexOf(_resource), 1));
    }
    getWriteEncoding(_resource) { return { encoding: 'utf8', hasBOM: false }; }
    dispose() { }
    async canCreateFile(source, options) { return true; }
    async canMove(source, target, overwrite) { return true; }
    async canCopy(source, target, overwrite) { return true; }
    async canDelete(resource, options) { return true; }
}
/**
 * TestFileService with in-memory file storage.
 * Use this when your test needs to write files and read them back.
 */
export class InMemoryTestFileService extends TestFileService {
    constructor() {
        super(...arguments);
        this.files = new ResourceMap();
    }
    clearTracking() {
        super.clearTracking();
        this.files.clear();
    }
    async readFile(resource, options) {
        if (this.readShouldThrowError) {
            throw this.readShouldThrowError;
        }
        this.lastReadFileUri = resource;
        this.readOperations.push({ resource });
        // Check if we have content in our in-memory store
        const content = this.files.get(resource);
        if (content) {
            return {
                ...createFileStat(resource, this.readonly),
                value: content
            };
        }
        return {
            ...createFileStat(resource, this.readonly),
            value: VSBuffer.fromString(this.content)
        };
    }
    async writeFile(resource, bufferOrReadable, options) {
        await timeout(0);
        if (this.writeShouldThrowError) {
            throw this.writeShouldThrowError;
        }
        let content;
        if (bufferOrReadable instanceof VSBuffer) {
            content = bufferOrReadable;
        }
        else {
            content = readableToBuffer(bufferOrReadable);
        }
        // Store in memory and track
        this.files.set(resource, content);
        this.writeOperations.push({ resource, content: content.toString() });
        return createFileStat(resource, this.readonly);
    }
    async del(resource, _options) {
        this.files.delete(resource);
        this.notExistsSet.set(resource, true);
    }
    async exists(resource) {
        const inMemory = this.files.has(resource);
        if (inMemory) {
            return true;
        }
        return super.exists(resource);
    }
}
export class TestChatEntitlementService {
    constructor() {
        this.isInternal = false;
        this.sku = undefined;
        this.copilotTrackingId = undefined;
        this.onDidChangeQuotaExceeded = Event.None;
        this.onDidChangeQuotaRemaining = Event.None;
        this.quotas = {};
        this.onDidChangeSentiment = Event.None;
        this.sentimentObs = observableValue({}, {});
        this.sentiment = {};
        this.onDidChangeEntitlement = Event.None;
        this.entitlement = ChatEntitlement.Unknown;
        this.entitlementObs = observableValue({}, ChatEntitlement.Unknown);
        this.anonymous = false;
        this.onDidChangeAnonymous = Event.None;
        this.anonymousObs = observableValue({}, false);
        this.previewFeaturesDisabled = false;
    }
    update(token) {
        throw new Error('Method not implemented.');
    }
    markAnonymousRateLimited() { }
}
export class TestLifecycleService extends Disposable {
    constructor() {
        super(...arguments);
        this.usePhases = false;
        this.whenStarted = new DeferredPromise();
        this.whenReady = new DeferredPromise();
        this.whenRestored = new DeferredPromise();
        this.whenEventually = new DeferredPromise();
        this.willShutdown = false;
        this._onBeforeShutdown = this._register(new Emitter());
        this._onBeforeShutdownError = this._register(new Emitter());
        this._onShutdownVeto = this._register(new Emitter());
        this._onWillShutdown = this._register(new Emitter());
        this._onDidShutdown = this._register(new Emitter());
        this.shutdownJoiners = [];
    }
    get phase() { return this._phase; }
    set phase(value) {
        this._phase = value;
        if (value === 1 /* LifecyclePhase.Starting */) {
            this.whenStarted.complete();
        }
        else if (value === 2 /* LifecyclePhase.Ready */) {
            this.whenReady.complete();
        }
        else if (value === 3 /* LifecyclePhase.Restored */) {
            this.whenRestored.complete();
        }
        else if (value === 4 /* LifecyclePhase.Eventually */) {
            this.whenEventually.complete();
        }
    }
    async when(phase) {
        if (!this.usePhases) {
            return;
        }
        if (phase === 1 /* LifecyclePhase.Starting */) {
            await this.whenStarted.p;
        }
        else if (phase === 2 /* LifecyclePhase.Ready */) {
            await this.whenReady.p;
        }
        else if (phase === 3 /* LifecyclePhase.Restored */) {
            await this.whenRestored.p;
        }
        else if (phase === 4 /* LifecyclePhase.Eventually */) {
            await this.whenEventually.p;
        }
    }
    get onBeforeShutdown() { return this._onBeforeShutdown.event; }
    get onBeforeShutdownError() { return this._onBeforeShutdownError.event; }
    get onShutdownVeto() { return this._onShutdownVeto.event; }
    get onWillShutdown() { return this._onWillShutdown.event; }
    get onDidShutdown() { return this._onDidShutdown.event; }
    fireShutdown(reason = 2 /* ShutdownReason.QUIT */) {
        this.shutdownJoiners = [];
        this._onWillShutdown.fire({
            join: p => {
                this.shutdownJoiners.push(typeof p === 'function' ? p() : p);
            },
            joiners: () => [],
            force: () => { },
            token: CancellationToken.None,
            reason
        });
    }
    fireBeforeShutdown(event) { this._onBeforeShutdown.fire(event); }
    fireWillShutdown(event) { this._onWillShutdown.fire(event); }
    async shutdown() {
        this.fireShutdown();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFvQixNQUFNLGdDQUFnQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUYsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVsRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5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