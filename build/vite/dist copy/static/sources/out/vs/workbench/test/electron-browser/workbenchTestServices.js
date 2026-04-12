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
import { insert } from '../../../base/common/arrays.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IExtensionManagementService } from '../../../platform/extensionManagement/common/extensionManagement.js';
import { AbstractNativeExtensionTipsService } from '../../../platform/extensionManagement/common/extensionTipsService.js';
import { IExtensionRecommendationNotificationService } from '../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { IFileService, FileType } from '../../../platform/files/common/files.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { UriIdentityService } from '../../../platform/uriIdentity/common/uriIdentityService.js';
import { FileUserDataProvider } from '../../../platform/userData/common/fileUserDataProvider.js';
import { UserDataProfilesService } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../services/filesConfiguration/common/filesConfigurationService.js';
import { ILifecycleService } from '../../services/lifecycle/common/lifecycle.js';
import { ITextFileService } from '../../services/textfile/common/textfiles.js';
import { NativeTextFileService } from '../../services/textfile/electron-browser/nativeTextFileService.js';
import { IWorkingCopyBackupService } from '../../services/workingCopy/common/workingCopyBackup.js';
import { IWorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { NativeWorkingCopyBackupService } from '../../services/workingCopy/electron-browser/workingCopyBackupService.js';
import { workbenchInstantiationService as browserWorkbenchInstantiationService, TestEncodingOracle, TestEnvironmentService, TestLifecycleService } from '../browser/workbenchTestServices.js';
export class TestSharedProcessService {
    createRawConnection() { throw new Error('Not Implemented'); }
    getChannel(channelName) { return undefined; }
    registerChannel(channelName, channel) { }
    notifyRestored() { }
}
export class TestNativeHostService {
    constructor() {
        this.windowId = -1;
        this.onDidOpenMainWindow = Event.None;
        this.onDidMaximizeWindow = Event.None;
        this.onDidUnmaximizeWindow = Event.None;
        this.onDidFocusMainWindow = Event.None;
        this.onDidBlurMainWindow = Event.None;
        this.onDidFocusMainOrAuxiliaryWindow = Event.None;
        this.onDidBlurMainOrAuxiliaryWindow = Event.None;
        this.onDidSuspendOS = Event.None;
        this.onDidResumeOS = Event.None;
        this.onDidChangeOnBatteryPower = Event.None;
        this.onDidChangeThermalState = Event.None;
        this.onDidChangeSpeedLimit = Event.None;
        this.onWillShutdownOS = Event.None;
        this.onDidLockScreen = Event.None;
        this.onDidUnlockScreen = Event.None;
        this.onDidChangeColorScheme = Event.None;
        this.onDidChangePassword = Event.None;
        this.onDidTriggerWindowSystemContextMenu = Event.None;
        this.onDidChangeWindowFullScreen = Event.None;
        this.onDidChangeWindowAlwaysOnTop = Event.None;
        this.onDidChangeDisplay = Event.None;
        this.windowCount = Promise.resolve(1);
    }
    getWindowCount() { return this.windowCount; }
    async getWindows() { return []; }
    async getActiveWindowId() { return undefined; }
    async getActiveWindowPosition() { return undefined; }
    async getNativeWindowHandle(windowId) { return undefined; }
    openWindow(arg1, arg2) {
        throw new Error('Method not implemented.');
    }
    async openAgentsWindow() { }
    async toggleFullScreen() { }
    async isMaximized() { return true; }
    async isFullScreen() { return true; }
    async maximizeWindow() { }
    async unmaximizeWindow() { }
    async minimizeWindow() { }
    async moveWindowTop(options) { }
    async isWindowAlwaysOnTop(options) { return false; }
    async toggleWindowAlwaysOnTop(options) { }
    async setWindowAlwaysOnTop(alwaysOnTop, options) { }
    async getCursorScreenPoint() { throw new Error('Method not implemented.'); }
    async positionWindow(position, options) { }
    async updateWindowControls(options) { }
    async updateWindowAccentColor(color) { }
    async setMinimumSize(width, height) { }
    async saveWindowSplash(value) { }
    async setBackgroundThrottling(throttling) { }
    async focusWindow(options) { }
    async showMessageBox(options) { throw new Error('Method not implemented.'); }
    async showSaveDialog(options) { throw new Error('Method not implemented.'); }
    async showOpenDialog(options) { throw new Error('Method not implemented.'); }
    async pickFileFolderAndOpen(options) { }
    async pickFileAndOpen(options) { }
    async pickFolderAndOpen(options) { }
    async pickWorkspaceAndOpen(options) { }
    async showItemInFolder(path) { }
    async setRepresentedFilename(path) { }
    async isAdmin() { return false; }
    async writeElevated(source, target) { }
    async isRunningUnderARM64Translation() { return false; }
    async getOSProperties() { return Object.create(null); }
    async getOSStatistics() { return Object.create(null); }
    async getOSVirtualMachineHint() { return 0; }
    async getOSColorScheme() { return { dark: true, highContrast: false }; }
    async hasWSLFeatureInstalled() { return false; }
    async getProcessId() { throw new Error('Method not implemented.'); }
    async killProcess() { }
    async setDocumentEdited(edited) { }
    async openExternal(url, defaultApplication) { return false; }
    async updateTouchBar() { }
    async moveItemToTrash() { }
    async newWindowTab() { }
    async showPreviousWindowTab() { }
    async showNextWindowTab() { }
    async moveWindowTabToNewWindow() { }
    async mergeAllWindowTabs() { }
    async toggleWindowTabsBar() { }
    async installShellCommand() { }
    async uninstallShellCommand() { }
    async notifyReady() { }
    async relaunch(options) { }
    async reload() { }
    async closeWindow() { }
    async quit() { }
    async exit(code) { }
    async openDevTools(options) { }
    async toggleDevTools() { }
    async stopTracing() { }
    async openDevToolsWindow(url) { }
    async openGPUInfoWindow() { }
    async openContentTracingWindow() { }
    async resolveProxy(url) { return undefined; }
    async lookupAuthorization(authInfo) { return undefined; }
    async lookupKerberosAuthorization(url) { return undefined; }
    async loadCertificates() { return []; }
    async isPortFree() { return Promise.resolve(true); }
    async findFreePort(startPort, giveUpAfter, timeout, stride) { return -1; }
    async readClipboardText(type) { return ''; }
    async writeClipboardText(text, type) { }
    async readClipboardFindText() { return ''; }
    async writeClipboardFindText(text) { }
    async writeClipboardBuffer(format, buffer, type) { }
    async triggerPaste(options) { }
    async readImage() { return Uint8Array.from([]); }
    async readClipboardBuffer(format) { return VSBuffer.wrap(Uint8Array.from([])); }
    async hasClipboard(format, type) { return false; }
    async windowsGetStringRegKey(hive, path, name) { return undefined; }
    async createZipFile(zipPath, files) { }
    async profileRenderer() { throw new Error(); }
    async startTracing() { throw new Error(); }
    async getScreenshot(rect) { return undefined; }
    async showToast(options) { return { supported: false, clicked: false }; }
    async clearToast(id) { }
    async clearToasts() { }
    // Power APIs
    async getSystemIdleState(idleThreshold) { return 'unknown'; }
    async getSystemIdleTime() { return 0; }
    async getCurrentThermalState() { return 'unknown'; }
    async isOnBatteryPower() { return false; }
    async startPowerSaveBlocker(type) { return -1; }
    async stopPowerSaveBlocker(id) { return false; }
    async isPowerSaveBlockerStarted(id) { return false; }
}
let TestExtensionTipsService = class TestExtensionTipsService extends AbstractNativeExtensionTipsService {
    constructor(environmentService, telemetryService, extensionManagementService, storageService, nativeHostService, extensionRecommendationNotificationService, fileService, productService) {
        super(environmentService.userHome, nativeHostService, telemetryService, extensionManagementService, storageService, extensionRecommendationNotificationService, fileService, productService);
    }
};
TestExtensionTipsService = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, ITelemetryService),
    __param(2, IExtensionManagementService),
    __param(3, IStorageService),
    __param(4, INativeHostService),
    __param(5, IExtensionRecommendationNotificationService),
    __param(6, IFileService),
    __param(7, IProductService)
], TestExtensionTipsService);
export { TestExtensionTipsService };
export function workbenchInstantiationService(overrides, disposables = new DisposableStore()) {
    const instantiationService = browserWorkbenchInstantiationService({
        workingCopyBackupService: () => disposables.add(new TestNativeWorkingCopyBackupService()),
        ...overrides
    }, disposables);
    instantiationService.stub(INativeHostService, new TestNativeHostService());
    return instantiationService;
}
let TestServiceAccessor = class TestServiceAccessor {
    constructor(lifecycleService, textFileService, filesConfigurationService, contextService, modelService, fileService, nativeHostService, fileDialogService, workingCopyBackupService, workingCopyService, editorService) {
        this.lifecycleService = lifecycleService;
        this.textFileService = textFileService;
        this.filesConfigurationService = filesConfigurationService;
        this.contextService = contextService;
        this.modelService = modelService;
        this.fileService = fileService;
        this.nativeHostService = nativeHostService;
        this.fileDialogService = fileDialogService;
        this.workingCopyBackupService = workingCopyBackupService;
        this.workingCopyService = workingCopyService;
        this.editorService = editorService;
    }
};
TestServiceAccessor = __decorate([
    __param(0, ILifecycleService),
    __param(1, ITextFileService),
    __param(2, IFilesConfigurationService),
    __param(3, IWorkspaceContextService),
    __param(4, IModelService),
    __param(5, IFileService),
    __param(6, INativeHostService),
    __param(7, IFileDialogService),
    __param(8, IWorkingCopyBackupService),
    __param(9, IWorkingCopyService),
    __param(10, IEditorService)
], TestServiceAccessor);
export { TestServiceAccessor };
export class TestNativeTextFileServiceWithEncodingOverrides extends NativeTextFileService {
    get encoding() {
        if (!this._testEncoding) {
            this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
        }
        return this._testEncoding;
    }
}
export class TestNativeWorkingCopyBackupService extends NativeWorkingCopyBackupService {
    constructor() {
        const environmentService = TestEnvironmentService;
        const logService = new NullLogService();
        const fileService = new FileService(logService);
        const lifecycleService = new TestLifecycleService();
        // eslint-disable-next-line local/code-no-any-casts
        super(environmentService, fileService, logService, lifecycleService);
        const inMemoryFileSystemProvider = this._register(new InMemoryFileSystemProvider());
        this._register(fileService.registerProvider(Schemas.inMemory, inMemoryFileSystemProvider));
        const uriIdentityService = this._register(new UriIdentityService(fileService));
        const userDataProfilesService = this._register(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
        this._register(fileService.registerProvider(Schemas.vscodeUserData, this._register(new FileUserDataProvider(Schemas.file, inMemoryFileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService))));
        this.backupResourceJoiners = [];
        this.discardBackupJoiners = [];
        this.discardedBackups = [];
        this.pendingBackupsArr = [];
        this.discardedAllBackups = false;
        this._register(fileService);
        this._register(lifecycleService);
    }
    testGetFileService() {
        return this.fileService;
    }
    async waitForAllBackups() {
        await Promise.all(this.pendingBackupsArr);
    }
    joinBackupResource() {
        return new Promise(resolve => this.backupResourceJoiners.push(resolve));
    }
    async backup(identifier, content, versionId, meta, token) {
        const p = super.backup(identifier, content, versionId, meta, token);
        const removeFromPendingBackups = insert(this.pendingBackupsArr, p.then(undefined, undefined));
        try {
            await p;
        }
        finally {
            removeFromPendingBackups();
        }
        while (this.backupResourceJoiners.length) {
            this.backupResourceJoiners.pop()();
        }
    }
    joinDiscardBackup() {
        return new Promise(resolve => this.discardBackupJoiners.push(resolve));
    }
    async discardBackup(identifier) {
        await super.discardBackup(identifier);
        this.discardedBackups.push(identifier);
        while (this.discardBackupJoiners.length) {
            this.discardBackupJoiners.pop()();
        }
    }
    async discardBackups(filter) {
        this.discardedAllBackups = true;
        return super.discardBackups(filter);
    }
    async getBackupContents(identifier) {
        const backupResource = this.toBackupResource(identifier);
        const fileContents = await this.fileService.readFile(backupResource);
        return fileContents.value.toString();
    }
}
export class TestIPCFileSystemProvider {
    constructor() {
        this.capabilities = 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
        this.onDidChangeCapabilities = Event.None;
        this.onDidChangeFile = Event.None;
    }
    async stat(resource) {
        const { ipcRenderer } = require('electron');
        const stats = await ipcRenderer.invoke('vscode:statFile', resource.fsPath);
        return {
            type: stats.isDirectory ? FileType.Directory : (stats.isFile ? FileType.File : FileType.Unknown),
            ctime: stats.ctimeMs,
            mtime: stats.mtimeMs,
            size: stats.size,
            permissions: stats.isReadonly ? 1 /* FilePermission.Readonly */ : undefined
        };
    }
    async readFile(resource) {
        const { ipcRenderer } = require('electron');
        const result = await ipcRenderer.invoke('vscode:readFile', resource.fsPath);
        return VSBuffer.wrap(result).buffer;
    }
    watch(resource, opts) { return { dispose: () => { } }; }
    mkdir(resource) { throw new Error('mkdir not implemented in test provider'); }
    readdir(resource) { throw new Error('readdir not implemented in test provider'); }
    delete(resource, opts) { throw new Error('delete not implemented in test provider'); }
    rename(from, to, opts) { throw new Error('rename not implemented in test provider'); }
    writeFile(resource, content, opts) { throw new Error('writeFile not implemented in test provider'); }
    readFileStream(resource, opts, token) { throw new Error('readFileStream not implemented in test provider'); }
    open(resource, opts) { throw new Error('open not implemented in test provider'); }
    close(fd) { throw new Error('close not implemented in test provider'); }
    read(fd, pos, data, offset, length) { throw new Error('read not implemented in test provider'); }
    write(fd, pos, data, offset, length) { throw new Error('write not implemented in test provider'); }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvZWxlY3Ryb24tYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQTRDLE1BQU0sZ0NBQWdDLENBQUM7QUFFcEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFMUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBSXpFLE9BQU8sRUFBRSxrQkFBa0IsRUFBNEIsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRyxPQUFPLEVBQXVCLHlCQUF5QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckgsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDbEgsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDMUgsT0FBTyxFQUFFLDJDQUEyQyxFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDNUksT0FBTyxFQUFFLFlBQVksRUFBc0ssUUFBUSxFQUFpQixNQUFNLHlDQUF5QyxDQUFDO0FBQ3BRLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUcxRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUs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