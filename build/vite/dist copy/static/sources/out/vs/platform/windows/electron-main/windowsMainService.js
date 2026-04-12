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
import * as fs from 'fs';
import { app, BrowserWindow, shell } from 'electron';
import { addUNCHostToAllowlist } from '../../../base/node/unc.js';
import { hostname, release, arch } from 'os';
import { coalesce, distinct } from '../../../base/common/arrays.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { isWindowsDriveLetter, parseLineAndColumnAware, sanitizeFilePath, toSlashes } from '../../../base/common/extpath.js';
import { getPathLabel } from '../../../base/common/labels.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { basename, join, normalize, posix } from '../../../base/common/path.js';
import { getMarks, mark } from '../../../base/common/performance.js';
import { isMacintosh, isWindows, OS } from '../../../base/common/platform.js';
import { cwd } from '../../../base/common/process.js';
import { extUriBiasedIgnorePathCase, isEqual, isEqualAuthority, normalizePath, originalFSPath, removeTrailingPathSeparator } from '../../../base/common/resources.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { getNLSLanguage, getNLSMessages, localize } from '../../../nls.js';
import { IBackupMainService } from '../../backup/electron-main/backup.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { FileType, IFileService } from '../../files/common/files.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import product from '../../product/common/product.js';
import { IProtocolMainService } from '../../protocol/electron-main/protocol.js';
import { getRemoteAuthority } from '../../remote/common/remoteHosts.js';
import { IStateService } from '../../state/node/state.js';
import { isFileToOpen, isFolderToOpen, isWorkspaceToOpen } from '../../window/common/window.js';
import { CodeWindow } from './windowImpl.js';
import { getLastFocused } from './windows.js';
import { findWindowOnExtensionDevelopmentPath, findWindowOnFile, findWindowOnWorkspaceOrFolder } from './windowsFinder.js';
import { WindowsStateHandler } from './windowsStateHandler.js';
import { hasWorkspaceFileExtension, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { createEmptyWorkspaceIdentifier, getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from '../../workspaces/node/workspaces.js';
import { IWorkspacesHistoryMainService } from '../../workspaces/electron-main/workspacesHistoryMainService.js';
import { IWorkspacesManagementMainService } from '../../workspaces/electron-main/workspacesManagementMainService.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { IPolicyService } from '../../policy/common/policy.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { ILoggerMainService } from '../../log/electron-main/loggerService.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { ICSSDevelopmentService } from '../../cssDev/node/cssDevService.js';
import { ResourceSet } from '../../../base/common/map.js';
import { VSBuffer } from '../../../base/common/buffer.js';
const EMPTY_WINDOW = Object.create(null);
function isWorkspacePathToOpen(path) {
    return isWorkspaceIdentifier(path?.workspace);
}
function isSingleFolderWorkspacePathToOpen(path) {
    return isSingleFolderWorkspaceIdentifier(path?.workspace);
}
//#endregion
let WindowsMainService = class WindowsMainService extends Disposable {
    constructor(machineId, sqmId, devDeviceId, initialUserEnv, logService, loggerService, stateService, policyService, environmentMainService, userDataProfilesMainService, lifecycleMainService, backupMainService, configurationService, workspacesHistoryMainService, workspacesManagementMainService, instantiationService, dialogMainService, fileService, protocolMainService, themeMainService, auxiliaryWindowsMainService, cssDevelopmentService) {
        super();
        this.machineId = machineId;
        this.sqmId = sqmId;
        this.devDeviceId = devDeviceId;
        this.initialUserEnv = initialUserEnv;
        this.logService = logService;
        this.loggerService = loggerService;
        this.policyService = policyService;
        this.environmentMainService = environmentMainService;
        this.userDataProfilesMainService = userDataProfilesMainService;
        this.lifecycleMainService = lifecycleMainService;
        this.backupMainService = backupMainService;
        this.configurationService = configurationService;
        this.workspacesHistoryMainService = workspacesHistoryMainService;
        this.workspacesManagementMainService = workspacesManagementMainService;
        this.instantiationService = instantiationService;
        this.dialogMainService = dialogMainService;
        this.fileService = fileService;
        this.protocolMainService = protocolMainService;
        this.themeMainService = themeMainService;
        this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
        this.cssDevelopmentService = cssDevelopmentService;
        this._onDidOpenWindow = this._register(new Emitter());
        this.onDidOpenWindow = this._onDidOpenWindow.event;
        this._onDidSignalReadyWindow = this._register(new Emitter());
        this.onDidSignalReadyWindow = this._onDidSignalReadyWindow.event;
        this._onDidDestroyWindow = this._register(new Emitter());
        this.onDidDestroyWindow = this._onDidDestroyWindow.event;
        this._onDidChangeWindowsCount = this._register(new Emitter());
        this.onDidChangeWindowsCount = this._onDidChangeWindowsCount.event;
        this._onDidMaximizeWindow = this._register(new Emitter());
        this.onDidMaximizeWindow = this._onDidMaximizeWindow.event;
        this._onDidUnmaximizeWindow = this._register(new Emitter());
        this.onDidUnmaximizeWindow = this._onDidUnmaximizeWindow.event;
        this._onDidChangeFullScreen = this._register(new Emitter());
        this.onDidChangeFullScreen = this._onDidChangeFullScreen.event;
        this._onDidTriggerSystemContextMenu = this._register(new Emitter());
        this.onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;
        this.windows = new Map();
        this.windowsStateHandler = this._register(new WindowsStateHandler(this, stateService, this.lifecycleMainService, this.logService, this.configurationService));
        this.registerListeners();
    }
    registerListeners() {
        // Signal a window is ready after having entered a workspace
        this._register(this.workspacesManagementMainService.onDidEnterWorkspace(event => this._onDidSignalReadyWindow.fire(event.window)));
        // Update valid roots in protocol service for extension dev windows
        this._register(this.onDidSignalReadyWindow(window => {
            if (window.config?.extensionDevelopmentPath || window.config?.extensionTestsPath) {
                const disposables = new DisposableStore();
                disposables.add(Event.any(window.onDidClose, window.onDidDestroy)(() => disposables.dispose()));
                // Allow access to extension development path
                if (window.config.extensionDevelopmentPath) {
                    for (const extensionDevelopmentPath of window.config.extensionDevelopmentPath) {
                        disposables.add(this.protocolMainService.addValidFileRoot(extensionDevelopmentPath));
                    }
                }
                // Allow access to extension tests path
                if (window.config.extensionTestsPath) {
                    disposables.add(this.protocolMainService.addValidFileRoot(window.config.extensionTestsPath));
                }
            }
        }));
    }
    openEmptyWindow(openConfig, options) {
        const cli = this.environmentMainService.args;
        const remoteAuthority = options?.remoteAuthority || undefined;
        const forceEmpty = true;
        const forceReuseWindow = options?.forceReuseWindow;
        const forceNewWindow = !forceReuseWindow;
        return this.open({ ...openConfig, cli, forceEmpty, forceNewWindow, forceReuseWindow, remoteAuthority, forceTempProfile: options?.forceTempProfile, forceProfile: options?.forceProfile });
    }
    openExistingWindow(window, openConfig) {
        // Bring window to front
        window.focus();
        // Handle `<app> --wait`
        this.handleWaitMarkerFile(openConfig, [window]);
        // Handle `<app> chat`
        this.handleChatRequest(openConfig, [window]);
    }
    async openAgentsWindow(openConfig) {
        this.logService.trace('windowsManager#openAgentsWindow');
        // Open in a new browser window with the agent sessions workspace
        return this.open(await this.ensureAgentsWindow(openConfig));
    }
    async ensureAgentsWindow(openConfig) {
        const agentSessionsWorkspaceUri = this.environmentMainService.agentSessionsWorkspace;
        if (!agentSessionsWorkspaceUri) {
            throw new Error('Agents workspace is not configured');
        }
        // Ensure the workspace file exists
        const workspaceExists = await this.fileService.exists(agentSessionsWorkspaceUri);
        if (!workspaceExists) {
            const emptyWorkspaceContent = JSON.stringify({ folders: [] }, null, '\t');
            await this.fileService.writeFile(agentSessionsWorkspaceUri, VSBuffer.fromString(emptyWorkspaceContent));
        }
        return {
            urisToOpen: [{ workspaceUri: agentSessionsWorkspaceUri }],
            userEnv: openConfig.userEnv,
            cli: openConfig.cli,
            noRecentEntry: true,
            context: openConfig.context,
            contextWindowId: openConfig.contextWindowId,
            initialStartup: openConfig.initialStartup,
        };
    }
    async open(openConfig) {
        this.logService.trace('windowsManager#open');
        // Take care of agents app specially
        const isAgentsApp = process.isEmbeddedApp;
        if (isAgentsApp) {
            openConfig = await this.ensureAgentsWindow(openConfig);
        }
        // Make sure addMode/removeMode is only enabled if we have an active window
        if ((openConfig.addMode || openConfig.removeMode) && (openConfig.initialStartup || !this.getLastActiveWindow())) {
            openConfig.addMode = false;
            openConfig.removeMode = false;
        }
        const foldersToAdd = [];
        const foldersToRemove = [];
        const foldersToOpen = [];
        const workspacesToOpen = [];
        const untitledWorkspacesToRestore = [];
        const emptyWindowsWithBackupsToRestore = [];
        let filesToOpen;
        let maybeOpenEmptyWindow = false;
        // Identify things to open from open config
        const pathsToOpen = await this.getPathsToOpen(openConfig);
        this.logService.trace('windowsManager#open pathsToOpen', pathsToOpen);
        for (const path of pathsToOpen) {
            if (isSingleFolderWorkspacePathToOpen(path)) {
                if (openConfig.addMode) {
                    // When run with --add, take the folders that are to be opened as
                    // folders that should be added to the currently active window.
                    foldersToAdd.push(path);
                }
                else if (openConfig.removeMode) {
                    // When run with --remove, take the folders that are to be opened as
                    // folders that should be removed from the currently active window.
                    foldersToRemove.push(path);
                }
                else {
                    foldersToOpen.push(path);
                }
            }
            else if (isWorkspacePathToOpen(path)) {
                workspacesToOpen.push(path);
            }
            else if (path.fileUri) {
                if (!filesToOpen) {
                    filesToOpen = { filesToOpenOrCreate: [], filesToDiff: [], filesToMerge: [], remoteAuthority: path.remoteAuthority };
                }
                filesToOpen.filesToOpenOrCreate.push(path);
            }
            else if (path.backupPath) {
                emptyWindowsWithBackupsToRestore.push({ backupFolder: basename(path.backupPath), remoteAuthority: path.remoteAuthority });
            }
            else {
                maybeOpenEmptyWindow = true; // depends on other parameters such as `forceEmpty` and how many windows have opened already
            }
        }
        // When run with --diff, take the first 2 files to open as files to diff
        if (openConfig.diffMode && filesToOpen && filesToOpen.filesToOpenOrCreate.length >= 2) {
            filesToOpen.filesToDiff = filesToOpen.filesToOpenOrCreate.slice(0, 2);
            filesToOpen.filesToOpenOrCreate = [];
        }
        // When run with --merge, take the first 4 files to open as files to merge
        if (openConfig.mergeMode && filesToOpen && filesToOpen.filesToOpenOrCreate.length === 4) {
            filesToOpen.filesToMerge = filesToOpen.filesToOpenOrCreate.slice(0, 4);
            filesToOpen.filesToOpenOrCreate = [];
            filesToOpen.filesToDiff = [];
        }
        // When run with --wait, make sure we keep the paths to wait for
        if (filesToOpen && openConfig.waitMarkerFileURI) {
            filesToOpen.filesToWait = { paths: coalesce([...filesToOpen.filesToDiff, filesToOpen.filesToMerge[3] /* [3] is the resulting merge file */, ...filesToOpen.filesToOpenOrCreate]), waitMarkerFileUri: openConfig.waitMarkerFileURI };
        }
        // These are windows to restore because of hot-exit or from previous session (only performed once on startup!)
        if (openConfig.initialStartup && !isAgentsApp /* skipped for agents app */) {
            // Untitled workspaces are always restored
            untitledWorkspacesToRestore.push(...this.workspacesManagementMainService.getUntitledWorkspaces());
            workspacesToOpen.push(...untitledWorkspacesToRestore);
            // Empty windows with backups are always restored
            emptyWindowsWithBackupsToRestore.push(...this.backupMainService.getEmptyWindowBackups());
        }
        else {
            emptyWindowsWithBackupsToRestore.length = 0;
        }
        // Open based on config
        const { windows: usedWindows, filesOpenedInWindow } = await this.doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyWindowsWithBackupsToRestore, maybeOpenEmptyWindow, filesToOpen, foldersToAdd, foldersToRemove);
        this.logService.trace(`windowsManager#open used window count ${usedWindows.length} (workspacesToOpen: ${workspacesToOpen.length}, foldersToOpen: ${foldersToOpen.length}, emptyToRestore: ${emptyWindowsWithBackupsToRestore.length}, maybeOpenEmptyWindow: ${maybeOpenEmptyWindow})`);
        // Make sure to pass focus to the most relevant of the windows if we open multiple
        if (usedWindows.length > 1) {
            // 1.) focus window we opened files in always with highest priority
            if (filesOpenedInWindow) {
                filesOpenedInWindow.focus();
            }
            // Otherwise, find a good window based on open params
            else {
                const focusLastActive = this.windowsStateHandler.state.lastActiveWindow && !openConfig.forceEmpty && !openConfig.cli._.length && !openConfig.cli['file-uri'] && !openConfig.cli['folder-uri'] && !openConfig.urisToOpen?.length;
                let focusLastOpened = true;
                let focusLastWindow = true;
                // 2.) focus last active window if we are not instructed to open any paths
                if (focusLastActive) {
                    const lastActiveWindow = usedWindows.filter(window => this.windowsStateHandler.state.lastActiveWindow && window.backupPath === this.windowsStateHandler.state.lastActiveWindow.backupPath);
                    if (lastActiveWindow.length) {
                        lastActiveWindow[0].focus();
                        focusLastOpened = false;
                        focusLastWindow = false;
                    }
                }
                // 3.) if instructed to open paths, focus last window which is not restored
                if (focusLastOpened) {
                    for (let i = usedWindows.length - 1; i >= 0; i--) {
                        const usedWindow = usedWindows[i];
                        if ((usedWindow.openedWorkspace && untitledWorkspacesToRestore.some(workspace => usedWindow.openedWorkspace && workspace.workspace.id === usedWindow.openedWorkspace.id)) || // skip over restored workspace
                            (usedWindow.backupPath && emptyWindowsWithBackupsToRestore.some(empty => usedWindow.backupPath && empty.backupFolder === basename(usedWindow.backupPath))) // skip over restored empty window
                        ) {
                            continue;
                        }
                        usedWindow.focus();
                        focusLastWindow = false;
                        break;
                    }
                }
                // 4.) finally, always ensure to have at least last used window focused
                if (focusLastWindow) {
                    usedWindows[usedWindows.length - 1].focus();
                }
            }
        }
        // Remember in recent document list (unless this opens for extension development)
        // Also do not add paths when files are opened for diffing or merging, only if opened individually
        const isDiff = filesToOpen && filesToOpen.filesToDiff.length > 0;
        const isMerge = filesToOpen && filesToOpen.filesToMerge.length > 0;
        if (!usedWindows.some(window => window.isExtensionDevelopmentHost) && !isDiff && !isMerge && !openConfig.noRecentEntry) {
            const recents = [];
            for (const pathToOpen of pathsToOpen) {
                if (isWorkspacePathToOpen(pathToOpen) && !pathToOpen.transient /* never add transient workspaces to history */) {
                    recents.push({ label: pathToOpen.label, workspace: pathToOpen.workspace, remoteAuthority: pathToOpen.remoteAuthority });
                }
                else if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
                    recents.push({ label: pathToOpen.label, folderUri: pathToOpen.workspace.uri, remoteAuthority: pathToOpen.remoteAuthority });
                }
                else if (pathToOpen.fileUri) {
                    recents.push({ label: pathToOpen.label, fileUri: pathToOpen.fileUri, remoteAuthority: pathToOpen.remoteAuthority });
                }
            }
            this.workspacesHistoryMainService.addRecentlyOpened(recents);
        }
        // Handle `<app> --wait`
        this.handleWaitMarkerFile(openConfig, usedWindows);
        // Handle `<app> chat`
        this.handleChatRequest(openConfig, usedWindows);
        return usedWindows;
    }
    handleWaitMarkerFile(openConfig, usedWindows) {
        // If we got started with --wait from the CLI, we need to signal to the outside when the window
        // used for the edit operation is closed or loaded to a different folder so that the waiting
        // process can continue. We do this by deleting the waitMarkerFilePath.
        const waitMarkerFileURI = openConfig.waitMarkerFileURI;
        if (openConfig.context === 0 /* OpenContext.CLI */ && waitMarkerFileURI && usedWindows.length === 1 && usedWindows[0]) {
            (async () => {
                await usedWindows[0].whenClosedOrLoaded;
                try {
                    await this.fileService.del(waitMarkerFileURI);
                }
                catch (error) {
                    // ignore - could have been deleted from the window already
                }
            })();
        }
    }
    handleChatRequest(openConfig, usedWindows) {
        if (openConfig.context !== 0 /* OpenContext.CLI */ || !openConfig.cli.chat || usedWindows.length === 0) {
            return;
        }
        let windowHandlingChatRequest;
        if (usedWindows.length === 1) {
            windowHandlingChatRequest = usedWindows[0];
        }
        else {
            const chatRequestFolder = openConfig.cli._[0]; // chat request gets cwd() as folder to open
            if (chatRequestFolder) {
                windowHandlingChatRequest = findWindowOnWorkspaceOrFolder(usedWindows, URI.file(chatRequestFolder));
            }
        }
        if (windowHandlingChatRequest) {
            windowHandlingChatRequest.sendWhenReady('vscode:handleChatRequest', CancellationToken.None, openConfig.cli.chat);
            windowHandlingChatRequest.focus();
        }
    }
    async doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyToRestore, maybeOpenEmptyWindow, filesToOpen, foldersToAdd, foldersToRemove) {
        // Keep track of used windows and remember
        // if files have been opened in one of them
        const usedWindows = [];
        let filesOpenedInWindow = undefined;
        function addUsedWindow(window, openedFiles) {
            usedWindows.push(window);
            if (openedFiles) {
                filesOpenedInWindow = window;
                filesToOpen = undefined; // reset `filesToOpen` since files have been opened
            }
        }
        // Settings can decide if files/folders open in new window or not
        let { openFolderInNewWindow, openFilesInNewWindow } = this.shouldOpenNewWindow(openConfig);
        // Handle folders to add/remove by looking for the last active workspace (not on initial startup)
        if (!openConfig.initialStartup && (foldersToAdd.length > 0 || foldersToRemove.length > 0)) {
            const authority = foldersToAdd.at(0)?.remoteAuthority ?? foldersToRemove.at(0)?.remoteAuthority;
            const lastActiveWindow = this.getLastActiveWindowForAuthority(authority);
            if (lastActiveWindow) {
                addUsedWindow(this.doAddRemoveFoldersInExistingWindow(lastActiveWindow, foldersToAdd.map(folderToAdd => folderToAdd.workspace.uri), foldersToRemove.map(folderToRemove => folderToRemove.workspace.uri)));
            }
        }
        // Handle files to open/diff/merge or to create when we dont open a folder and we do not restore any
        // folder/untitled from hot-exit by trying to open them in the window that fits best
        const potentialNewWindowsCount = foldersToOpen.length + workspacesToOpen.length + emptyToRestore.length;
        if (filesToOpen && potentialNewWindowsCount === 0) {
            // Find suitable window or folder path to open files in
            const fileToCheck = filesToOpen.filesToOpenOrCreate[0] || filesToOpen.filesToDiff[0] || filesToOpen.filesToMerge[3] /* [3] is the resulting merge file */;
            // only look at the windows with correct authority
            const windows = this.getWindows().filter(window => filesToOpen && isEqualAuthority(window.remoteAuthority, filesToOpen.remoteAuthority));
            // figure out a good window to open the files in if any
            // with a fallback to the last active window.
            //
            // in case `openFilesInNewWindow` is enforced, we skip
            // this step.
            let windowToUseForFiles = undefined;
            if (fileToCheck?.fileUri && !openFilesInNewWindow) {
                if (openConfig.context === 4 /* OpenContext.DESKTOP */ || openConfig.context === 0 /* OpenContext.CLI */ || openConfig.context === 1 /* OpenContext.DOCK */ || openConfig.context === 6 /* OpenContext.LINK */) {
                    windowToUseForFiles = await findWindowOnFile(windows, fileToCheck.fileUri, async (workspace) => workspace.configPath.scheme === Schemas.file ? this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath) : undefined);
                }
                if (!windowToUseForFiles) {
                    windowToUseForFiles = this.doGetLastActiveWindow(windows);
                }
            }
            // We found a window to open the files in
            if (windowToUseForFiles) {
                // Window is workspace
                if (isWorkspaceIdentifier(windowToUseForFiles.openedWorkspace)) {
                    workspacesToOpen.push({ workspace: windowToUseForFiles.openedWorkspace, remoteAuthority: windowToUseForFiles.remoteAuthority });
                }
                // Window is single folder
                else if (isSingleFolderWorkspaceIdentifier(windowToUseForFiles.openedWorkspace)) {
                    foldersToOpen.push({ workspace: windowToUseForFiles.openedWorkspace, remoteAuthority: windowToUseForFiles.remoteAuthority });
                }
                // Window is empty
                else {
                    addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowToUseForFiles, filesToOpen), true);
                }
            }
            // Finally, if no window or folder is found, just open the files in an empty window
            else {
                addUsedWindow(await this.openInBrowserWindow({
                    userEnv: openConfig.userEnv,
                    cli: openConfig.cli,
                    initialStartup: openConfig.initialStartup,
                    filesToOpen,
                    forceNewWindow: true,
                    remoteAuthority: filesToOpen.remoteAuthority,
                    forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
                    forceProfile: openConfig.forceProfile,
                    forceTempProfile: openConfig.forceTempProfile
                }), true);
            }
        }
        // Handle workspaces to open (instructed and to restore)
        const allWorkspacesToOpen = distinct(workspacesToOpen, workspace => workspace.workspace.id); // prevent duplicates
        if (allWorkspacesToOpen.length > 0) {
            // Check for existing instances
            const windowsOnWorkspace = coalesce(allWorkspacesToOpen.map(workspaceToOpen => findWindowOnWorkspaceOrFolder(this.getWindows(), workspaceToOpen.workspace.configPath)));
            if (windowsOnWorkspace.length > 0) {
                const windowOnWorkspace = windowsOnWorkspace[0];
                const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, windowOnWorkspace.remoteAuthority) ? filesToOpen : undefined;
                // Do open files
                addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowOnWorkspace, filesToOpenInWindow), !!filesToOpenInWindow);
                openFolderInNewWindow = true; // any other folders to open must open in new window then
            }
            // Open remaining ones
            for (const workspaceToOpen of allWorkspacesToOpen) {
                if (windowsOnWorkspace.some(window => window.openedWorkspace && window.openedWorkspace.id === workspaceToOpen.workspace.id)) {
                    continue; // ignore folders that are already open
                }
                const remoteAuthority = workspaceToOpen.remoteAuthority;
                const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : undefined;
                // Do open folder
                addUsedWindow(await this.doOpenFolderOrWorkspace(openConfig, workspaceToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);
                openFolderInNewWindow = true; // any other folders to open must open in new window then
            }
        }
        // Handle folders to open (instructed and to restore)
        const allFoldersToOpen = distinct(foldersToOpen, folder => extUriBiasedIgnorePathCase.getComparisonKey(folder.workspace.uri)); // prevent duplicates
        if (allFoldersToOpen.length > 0) {
            // Check for existing instances
            const windowsOnFolderPath = coalesce(allFoldersToOpen.map(folderToOpen => findWindowOnWorkspaceOrFolder(this.getWindows(), folderToOpen.workspace.uri)));
            if (windowsOnFolderPath.length > 0) {
                const windowOnFolderPath = windowsOnFolderPath[0];
                const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, windowOnFolderPath.remoteAuthority) ? filesToOpen : undefined;
                // Do open files
                addUsedWindow(this.doOpenFilesInExistingWindow(openConfig, windowOnFolderPath, filesToOpenInWindow), !!filesToOpenInWindow);
                openFolderInNewWindow = true; // any other folders to open must open in new window then
            }
            // Open remaining ones
            for (const folderToOpen of allFoldersToOpen) {
                if (windowsOnFolderPath.some(window => isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.uri, folderToOpen.workspace.uri))) {
                    continue; // ignore folders that are already open
                }
                const remoteAuthority = folderToOpen.remoteAuthority;
                const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : undefined;
                // Do open folder
                addUsedWindow(await this.doOpenFolderOrWorkspace(openConfig, folderToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);
                openFolderInNewWindow = true; // any other folders to open must open in new window then
            }
        }
        // Handle empty to restore
        const allEmptyToRestore = distinct(emptyToRestore, info => info.backupFolder); // prevent duplicates
        if (allEmptyToRestore.length > 0) {
            for (const emptyWindowBackupInfo of allEmptyToRestore) {
                const remoteAuthority = emptyWindowBackupInfo.remoteAuthority;
                const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : undefined;
                addUsedWindow(await this.doOpenEmpty(openConfig, true, remoteAuthority, filesToOpenInWindow, emptyWindowBackupInfo), !!filesToOpenInWindow);
                openFolderInNewWindow = true; // any other folders to open must open in new window then
            }
        }
        // Finally, open an empty window if
        // - we still have files to open
        // - user forces an empty window (e.g. via command line)
        // - no window has opened yet
        if (filesToOpen || (maybeOpenEmptyWindow && (openConfig.forceEmpty || usedWindows.length === 0))) {
            const remoteAuthority = filesToOpen ? filesToOpen.remoteAuthority : openConfig.remoteAuthority;
            addUsedWindow(await this.doOpenEmpty(openConfig, openFolderInNewWindow, remoteAuthority, filesToOpen), !!filesToOpen);
        }
        return { windows: distinct(usedWindows), filesOpenedInWindow };
    }
    doOpenFilesInExistingWindow(configuration, window, filesToOpen) {
        this.logService.trace('windowsManager#doOpenFilesInExistingWindow', { filesToOpen });
        this.focusMainOrChildWindow(window); // make sure window or any of the children has focus
        const params = {
            filesToOpenOrCreate: filesToOpen?.filesToOpenOrCreate,
            filesToDiff: filesToOpen?.filesToDiff,
            filesToMerge: filesToOpen?.filesToMerge,
            filesToWait: filesToOpen?.filesToWait,
            termProgram: configuration?.userEnv?.['TERM_PROGRAM']
        };
        window.sendWhenReady('vscode:openFiles', CancellationToken.None, params);
        return window;
    }
    focusMainOrChildWindow(mainWindow) {
        let windowToFocus = mainWindow;
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow && focusedWindow.id !== mainWindow.id) {
            const auxiliaryWindowCandidate = this.auxiliaryWindowsMainService.getWindowByWebContents(focusedWindow.webContents);
            if (auxiliaryWindowCandidate && auxiliaryWindowCandidate.parentId === mainWindow.id) {
                windowToFocus = auxiliaryWindowCandidate;
            }
        }
        windowToFocus.focus();
    }
    doAddRemoveFoldersInExistingWindow(window, foldersToAdd, foldersToRemove) {
        this.logService.trace('windowsManager#doAddRemoveFoldersToExistingWindow', { foldersToAdd, foldersToRemove });
        window.focus(); // make sure window has focus
        const request = { foldersToAdd, foldersToRemove };
        window.sendWhenReady('vscode:addRemoveFolders', CancellationToken.None, request);
        return window;
    }
    doOpenEmpty(openConfig, forceNewWindow, remoteAuthority, filesToOpen, emptyWindowBackupInfo) {
        this.logService.trace('windowsManager#doOpenEmpty', { restore: !!emptyWindowBackupInfo, remoteAuthority, filesToOpen, forceNewWindow });
        let windowToUse;
        if (!forceNewWindow && typeof openConfig.contextWindowId === 'number') {
            windowToUse = this.getWindowById(openConfig.contextWindowId); // fix for https://github.com/microsoft/vscode/issues/97172
        }
        return this.openInBrowserWindow({
            userEnv: openConfig.userEnv,
            cli: openConfig.cli,
            initialStartup: openConfig.initialStartup,
            remoteAuthority,
            forceNewWindow,
            forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
            filesToOpen,
            windowToUse,
            emptyWindowBackupInfo,
            forceProfile: openConfig.forceProfile,
            forceTempProfile: openConfig.forceTempProfile
        });
    }
    doOpenFolderOrWorkspace(openConfig, folderOrWorkspace, forceNewWindow, filesToOpen, windowToUse) {
        this.logService.trace('windowsManager#doOpenFolderOrWorkspace', { folderOrWorkspace, filesToOpen });
        if (!forceNewWindow && !windowToUse && typeof openConfig.contextWindowId === 'number') {
            windowToUse = this.getWindowById(openConfig.contextWindowId); // fix for https://github.com/microsoft/vscode/issues/49587
        }
        return this.openInBrowserWindow({
            workspace: folderOrWorkspace.workspace,
            userEnv: openConfig.userEnv,
            cli: openConfig.cli,
            initialStartup: openConfig.initialStartup,
            remoteAuthority: folderOrWorkspace.remoteAuthority,
            forceNewWindow,
            forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
            filesToOpen,
            windowToUse,
            forceProfile: openConfig.forceProfile,
            forceTempProfile: openConfig.forceTempProfile
        });
    }
    async getPathsToOpen(openConfig) {
        let pathsToOpen;
        let isCommandLineOrAPICall = false;
        let isRestoringPaths = false;
        // Extract paths: from API
        if (openConfig.urisToOpen && openConfig.urisToOpen.length > 0) {
            pathsToOpen = await this.doExtractPathsFromAPI(openConfig);
            isCommandLineOrAPICall = true;
        }
        // Check for force empty
        else if (openConfig.forceEmpty) {
            pathsToOpen = [EMPTY_WINDOW];
        }
        // Extract paths: from CLI
        else if (openConfig.cli._.length || openConfig.cli['folder-uri'] || openConfig.cli['file-uri']) {
            pathsToOpen = await this.doExtractPathsFromCLI(openConfig.cli);
            if (pathsToOpen.length === 0) {
                pathsToOpen.push(EMPTY_WINDOW); // add an empty window if we did not have windows to open from command line
            }
            isCommandLineOrAPICall = true;
        }
        // Extract paths: from previous session
        else {
            pathsToOpen = await this.doGetPathsFromLastSession();
            if (pathsToOpen.length === 0) {
                pathsToOpen.push(EMPTY_WINDOW); // add an empty window if we did not have windows to restore
            }
            isRestoringPaths = true;
        }
        // Handle the case of multiple folders being opened from CLI while we are
        // not in `--add` or `--remove` mode by creating an untitled workspace, only if:
        // - they all share the same remote authority
        // - there is no existing workspace to open that matches these folders
        if (!openConfig.addMode && !openConfig.removeMode && isCommandLineOrAPICall) {
            const foldersToOpen = pathsToOpen.filter(path => isSingleFolderWorkspacePathToOpen(path));
            if (foldersToOpen.length > 1) {
                const remoteAuthority = foldersToOpen[0].remoteAuthority;
                if (foldersToOpen.every(folderToOpen => isEqualAuthority(folderToOpen.remoteAuthority, remoteAuthority))) {
                    let workspace;
                    const lastSessionWorkspaceMatchingFolders = await this.doGetWorkspaceMatchingFoldersFromLastSession(remoteAuthority, foldersToOpen);
                    if (lastSessionWorkspaceMatchingFolders) {
                        workspace = lastSessionWorkspaceMatchingFolders;
                    }
                    else {
                        workspace = await this.workspacesManagementMainService.createUntitledWorkspace(foldersToOpen.map(folder => ({ uri: folder.workspace.uri })));
                    }
                    // Add workspace and remove folders thereby
                    pathsToOpen.push({ workspace, remoteAuthority });
                    pathsToOpen = pathsToOpen.filter(path => !isSingleFolderWorkspacePathToOpen(path));
                }
            }
        }
        // Check for `window.restoreWindows` setting to include all windows
        // from the previous session if this is the initial startup and we have
        // not restored windows already otherwise.
        // Use `unshift` to ensure any new window to open comes last for proper
        // focus treatment.
        if (openConfig.initialStartup && !isRestoringPaths && this.configurationService.getValue('window')?.restoreWindows === 'preserve') {
            const lastSessionPaths = await this.doGetPathsFromLastSession();
            pathsToOpen.unshift(...lastSessionPaths.filter(path => isWorkspacePathToOpen(path) || isSingleFolderWorkspacePathToOpen(path) || path.backupPath));
        }
        return pathsToOpen;
    }
    async doExtractPathsFromAPI(openConfig) {
        const pathResolveOptions = {
            gotoLineMode: openConfig.gotoLineMode,
            remoteAuthority: openConfig.remoteAuthority
        };
        const pathsToOpen = await Promise.all(coalesce(openConfig.urisToOpen || []).map(async (pathToOpen) => {
            const path = await this.resolveOpenable(pathToOpen, pathResolveOptions);
            // Path exists
            if (path) {
                path.label = pathToOpen.label;
                return path;
            }
            // Path does not exist: show a warning box
            const uri = this.resourceFromOpenable(pathToOpen);
            this.dialogMainService.showMessageBox({
                type: 'info',
                buttons: [localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")],
                message: uri.scheme === Schemas.file ? localize('pathNotExistTitle', "Path does not exist") : localize('uriInvalidTitle', "URI can not be opened"),
                detail: uri.scheme === Schemas.file ?
                    localize('pathNotExistDetail', "The path '{0}' does not exist on this computer.", getPathLabel(uri, { os: OS, tildify: this.environmentMainService })) :
                    localize('uriInvalidDetail', "The URI '{0}' is not valid and can not be opened.", uri.toString(true))
            }, BrowserWindow.getFocusedWindow() ?? undefined);
            return undefined;
        }));
        return coalesce(pathsToOpen);
    }
    async doExtractPathsFromCLI(cli) {
        const pathsToOpen = [];
        const pathResolveOptions = {
            ignoreFileNotFound: true,
            gotoLineMode: cli.goto,
            remoteAuthority: cli.remote || undefined,
            forceOpenWorkspaceAsFile: 
            // special case diff / merge mode to force open
            // workspace as file
            // https://github.com/microsoft/vscode/issues/149731
            cli.diff && cli._.length === 2 ||
                cli.merge && cli._.length === 4
        };
        // folder uris
        const folderUris = cli['folder-uri'];
        if (folderUris) {
            const resolvedFolderUris = await Promise.all(folderUris.map(rawFolderUri => {
                const folderUri = this.cliArgToUri(rawFolderUri);
                if (!folderUri) {
                    return undefined;
                }
                return this.resolveOpenable({ folderUri }, pathResolveOptions);
            }));
            pathsToOpen.push(...coalesce(resolvedFolderUris));
        }
        // file uris
        const fileUris = cli['file-uri'];
        if (fileUris) {
            const resolvedFileUris = await Promise.all(fileUris.map(rawFileUri => {
                const fileUri = this.cliArgToUri(rawFileUri);
                if (!fileUri) {
                    return undefined;
                }
                return this.resolveOpenable(hasWorkspaceFileExtension(rawFileUri) ? { workspaceUri: fileUri } : { fileUri }, pathResolveOptions);
            }));
            pathsToOpen.push(...coalesce(resolvedFileUris));
        }
        // folder or file paths
        const resolvedCliPaths = await Promise.all(cli._.map(cliPath => {
            return pathResolveOptions.remoteAuthority ? this.doResolveRemotePath(cliPath, pathResolveOptions) : this.doResolveFilePath(cliPath, pathResolveOptions);
        }));
        pathsToOpen.push(...coalesce(resolvedCliPaths));
        return pathsToOpen;
    }
    cliArgToUri(arg) {
        try {
            const uri = URI.parse(arg);
            if (!uri.scheme) {
                this.logService.error(`Invalid URI input string, scheme missing: ${arg}`);
                return undefined;
            }
            if (!uri.path) {
                return uri.with({ path: '/' });
            }
            return uri;
        }
        catch (e) {
            this.logService.error(`Invalid URI input string: ${arg}, ${e.message}`);
        }
        return undefined;
    }
    async doGetPathsFromLastSession() {
        const restoreWindowsSetting = this.getRestoreWindowsSetting();
        switch (restoreWindowsSetting) {
            // none: no window to restore
            case 'none':
                return [];
            // one: restore last opened workspace/folder or empty window
            // all: restore all windows
            // folders: restore last opened folders only
            case 'one':
            case 'all':
            case 'preserve':
            case 'folders': {
                // Collect previously opened windows
                const lastSessionWindows = [];
                if (restoreWindowsSetting !== 'one') {
                    lastSessionWindows.push(...this.windowsStateHandler.state.openedWindows);
                }
                if (this.windowsStateHandler.state.lastActiveWindow) {
                    lastSessionWindows.push(this.windowsStateHandler.state.lastActiveWindow);
                }
                const pathsToOpen = await Promise.all(lastSessionWindows.map(async (lastSessionWindow) => {
                    // Workspaces
                    if (lastSessionWindow.workspace) {
                        const pathToOpen = await this.resolveOpenable({ workspaceUri: lastSessionWindow.workspace.configPath }, { remoteAuthority: lastSessionWindow.remoteAuthority, rejectTransientWorkspaces: true /* https://github.com/microsoft/vscode/issues/119695 */ });
                        if (isWorkspacePathToOpen(pathToOpen)) {
                            return pathToOpen;
                        }
                    }
                    // Folders
                    else if (lastSessionWindow.folderUri) {
                        const pathToOpen = await this.resolveOpenable({ folderUri: lastSessionWindow.folderUri }, { remoteAuthority: lastSessionWindow.remoteAuthority });
                        if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
                            return pathToOpen;
                        }
                    }
                    // Empty window, potentially editors open to be restored
                    else if (restoreWindowsSetting !== 'folders' && lastSessionWindow.backupPath) {
                        return { backupPath: lastSessionWindow.backupPath, remoteAuthority: lastSessionWindow.remoteAuthority };
                    }
                    return undefined;
                }));
                return coalesce(pathsToOpen);
            }
        }
    }
    getRestoreWindowsSetting() {
        let restoreWindows;
        if (this.lifecycleMainService.wasRestarted) {
            restoreWindows = 'all'; // always reopen all windows when an update was applied
        }
        else {
            const windowConfig = this.configurationService.getValue('window');
            restoreWindows = windowConfig?.restoreWindows || 'all'; // by default restore all windows
            if (!['preserve', 'all', 'folders', 'one', 'none'].includes(restoreWindows)) {
                restoreWindows = 'all'; // by default restore all windows
            }
        }
        return restoreWindows;
    }
    async doGetWorkspaceMatchingFoldersFromLastSession(remoteAuthority, folders) {
        const workspaces = (await this.doGetPathsFromLastSession()).filter(path => isWorkspacePathToOpen(path));
        const folderUris = folders.map(folder => folder.workspace.uri);
        for (const { workspace } of workspaces) {
            const resolvedWorkspace = await this.workspacesManagementMainService.resolveLocalWorkspace(workspace.configPath);
            if (!resolvedWorkspace ||
                resolvedWorkspace.remoteAuthority !== remoteAuthority ||
                resolvedWorkspace.transient ||
                resolvedWorkspace.folders.length !== folders.length) {
                continue;
            }
            const folderSet = new ResourceSet(folderUris, uri => extUriBiasedIgnorePathCase.getComparisonKey(uri));
            if (resolvedWorkspace.folders.every(folder => folderSet.has(folder.uri))) {
                return resolvedWorkspace;
            }
        }
        return undefined;
    }
    async resolveOpenable(openable, options = Object.create(null)) {
        // handle file:// openables with some extra validation
        const uri = this.resourceFromOpenable(openable);
        if (uri.scheme === Schemas.file) {
            if (isFileToOpen(openable)) {
                options = { ...options, forceOpenWorkspaceAsFile: true };
            }
            return this.doResolveFilePath(uri.fsPath, options);
        }
        // handle non file:// openables
        return this.doResolveRemoteOpenable(openable, options);
    }
    doResolveRemoteOpenable(openable, options) {
        let uri = this.resourceFromOpenable(openable);
        // use remote authority from vscode
        const remoteAuthority = getRemoteAuthority(uri) || options.remoteAuthority;
        // normalize URI
        uri = removeTrailingPathSeparator(normalizePath(uri));
        // File
        if (isFileToOpen(openable)) {
            if (options.gotoLineMode) {
                const { path, line, column } = parseLineAndColumnAware(uri.path);
                return {
                    fileUri: uri.with({ path }),
                    options: {
                        selection: line ? { startLineNumber: line, startColumn: column || 1 } : undefined
                    },
                    remoteAuthority
                };
            }
            return { fileUri: uri, remoteAuthority };
        }
        // Workspace
        else if (isWorkspaceToOpen(openable)) {
            return { workspace: getWorkspaceIdentifier(uri), remoteAuthority };
        }
        // Folder
        return { workspace: getSingleFolderWorkspaceIdentifier(uri), remoteAuthority };
    }
    resourceFromOpenable(openable) {
        if (isWorkspaceToOpen(openable)) {
            return openable.workspaceUri;
        }
        if (isFolderToOpen(openable)) {
            return openable.folderUri;
        }
        return openable.fileUri;
    }
    async doResolveFilePath(path, options, skipHandleUNCError) {
        // Extract line/col information from path
        let lineNumber;
        let columnNumber;
        if (options.gotoLineMode) {
            ({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
        }
        // Ensure the path is normalized and absolute
        path = sanitizeFilePath(normalize(path), cwd());
        try {
            const pathStat = await fs.promises.stat(path);
            // File
            if (pathStat.isFile()) {
                // Workspace (unless disabled via flag)
                if (!options.forceOpenWorkspaceAsFile) {
                    const workspace = await this.workspacesManagementMainService.resolveLocalWorkspace(URI.file(path));
                    if (workspace) {
                        // If the workspace is transient and we are to ignore
                        // transient workspaces, reject it.
                        if (workspace.transient && options.rejectTransientWorkspaces) {
                            return undefined;
                        }
                        return {
                            workspace: { id: workspace.id, configPath: workspace.configPath },
                            type: FileType.File,
                            exists: true,
                            remoteAuthority: workspace.remoteAuthority,
                            transient: workspace.transient
                        };
                    }
                }
                return {
                    fileUri: URI.file(path),
                    type: FileType.File,
                    exists: true,
                    options: {
                        selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : undefined
                    }
                };
            }
            // Folder
            else if (pathStat.isDirectory()) {
                return {
                    workspace: getSingleFolderWorkspaceIdentifier(URI.file(path), pathStat),
                    type: FileType.Directory,
                    exists: true
                };
            }
            // Special device: in POSIX environments, we may get /dev/null passed
            // in (for example git uses it to signal one side of a diff does not
            // exist). In that special case, treat it like a file to support this
            // scenario ()
            else if (!isWindows && path === '/dev/null') {
                return {
                    fileUri: URI.file(path),
                    type: FileType.File,
                    exists: true
                };
            }
        }
        catch (error) {
            if (error.code === 'ERR_UNC_HOST_NOT_ALLOWED' && !skipHandleUNCError) {
                return this.onUNCHostNotAllowed(path, options);
            }
            const fileUri = URI.file(path);
            // since file does not seem to exist anymore, remove from recent
            this.workspacesHistoryMainService.removeRecentlyOpened([fileUri]);
            // assume this is a file that does not yet exist
            if (options.ignoreFileNotFound && error.code === 'ENOENT') {
                return {
                    fileUri,
                    type: FileType.File,
                    exists: false
                };
            }
            this.logService.error(`Invalid path provided: ${path}, ${error.message}`);
        }
        return undefined;
    }
    async onUNCHostNotAllowed(path, options) {
        const uri = URI.file(path);
        const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
            type: 'warning',
            buttons: [
                localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
                localize({ key: 'cancel', comment: ['&& denotes a mnemonic'] }, "&&Cancel"),
                localize({ key: 'learnMore', comment: ['&& denotes a mnemonic'] }, "&&Learn More"),
            ],
            message: localize('confirmOpenMessage', "The host '{0}' was not found in the list of allowed hosts. Do you want to allow it anyway?", uri.authority),
            detail: localize('confirmOpenDetail', "The path '{0}' uses a host that is not allowed. Unless you trust the host, you should press 'Cancel'", getPathLabel(uri, { os: OS, tildify: this.environmentMainService })),
            checkboxLabel: localize('doNotAskAgain', "Permanently allow host '{0}'", uri.authority),
            cancelId: 1
        });
        if (response === 0) {
            addUNCHostToAllowlist(uri.authority);
            if (checkboxChecked) {
                // Due to https://github.com/microsoft/vscode/issues/195436, we can only
                // update settings from within a window. But we do not know if a window
                // is about to open or can already handle the request, so we have to send
                // to any current window and any newly opening window.
                const request = { channel: 'vscode:configureAllowedUNCHost', args: uri.authority };
                this.sendToFocused(request.channel, request.args);
                this.sendToOpeningWindow(request.channel, request.args);
            }
            return this.doResolveFilePath(path, options, true /* do not handle UNC error again */);
        }
        if (response === 2) {
            shell.openExternal('https://aka.ms/vscode-windows-unc');
            return this.onUNCHostNotAllowed(path, options); // keep showing the dialog until decision (https://github.com/microsoft/vscode/issues/181956)
        }
        return undefined;
    }
    doResolveRemotePath(path, options) {
        const first = path.charCodeAt(0);
        const remoteAuthority = options.remoteAuthority;
        // Extract line/col information from path
        let lineNumber;
        let columnNumber;
        if (options.gotoLineMode) {
            ({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
        }
        // make absolute
        if (first !== 47 /* CharCode.Slash */) {
            if (isWindowsDriveLetter(first) && path.charCodeAt(path.charCodeAt(1)) === 58 /* CharCode.Colon */) {
                path = toSlashes(path);
            }
            path = `/${path}`;
        }
        const uri = URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path: path });
        // guess the file type:
        // - if it ends with a slash it's a folder
        // - if in goto line mode or if it has a file extension, it's a file or a workspace
        // - by defaults it's a folder
        if (path.charCodeAt(path.length - 1) !== 47 /* CharCode.Slash */) {
            // file name ends with .code-workspace
            if (hasWorkspaceFileExtension(path)) {
                if (options.forceOpenWorkspaceAsFile) {
                    return {
                        fileUri: uri,
                        options: {
                            selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : undefined
                        },
                        remoteAuthority: options.remoteAuthority
                    };
                }
                return { workspace: getWorkspaceIdentifier(uri), remoteAuthority };
            }
            // file name starts with a dot or has an file extension
            else if (options.gotoLineMode || posix.basename(path).indexOf('.') !== -1) {
                return {
                    fileUri: uri,
                    options: {
                        selection: lineNumber ? { startLineNumber: lineNumber, startColumn: columnNumber || 1 } : undefined
                    },
                    remoteAuthority
                };
            }
        }
        return { workspace: getSingleFolderWorkspaceIdentifier(uri), remoteAuthority };
    }
    shouldOpenNewWindow(openConfig) {
        // let the user settings override how folders are open in a new window or same window unless we are forced
        const windowConfig = this.configurationService.getValue('window');
        const openFolderInNewWindowConfig = windowConfig?.openFoldersInNewWindow || 'default' /* default */;
        const openFilesInNewWindowConfig = windowConfig?.openFilesInNewWindow || 'off' /* default */;
        let openFolderInNewWindow = (openConfig.preferNewWindow || openConfig.forceNewWindow) && !openConfig.forceReuseWindow;
        if (!openConfig.forceNewWindow && !openConfig.forceReuseWindow && (openFolderInNewWindowConfig === 'on' || openFolderInNewWindowConfig === 'off')) {
            openFolderInNewWindow = (openFolderInNewWindowConfig === 'on');
        }
        // let the user settings override how files are open in a new window or same window unless we are forced (not for extension development though)
        let openFilesInNewWindow = false;
        if (openConfig.forceNewWindow || openConfig.forceReuseWindow) {
            openFilesInNewWindow = !!openConfig.forceNewWindow && !openConfig.forceReuseWindow;
        }
        else {
            // macOS: by default we open files in a new window if this is triggered via DOCK context
            if (isMacintosh) {
                if (openConfig.context === 1 /* OpenContext.DOCK */) {
                    openFilesInNewWindow = true;
                }
            }
            // Linux/Windows: by default we open files in the new window unless triggered via DIALOG / MENU context
            // or from the integrated terminal where we assume the user prefers to open in the current window
            else {
                if (openConfig.context !== 3 /* OpenContext.DIALOG */ && openConfig.context !== 2 /* OpenContext.MENU */ && !(openConfig.userEnv && openConfig.userEnv['TERM_PROGRAM'] === 'vscode')) {
                    openFilesInNewWindow = true;
                }
            }
            // finally check for overrides of default
            if (!openConfig.cli.extensionDevelopmentPath && (openFilesInNewWindowConfig === 'on' || openFilesInNewWindowConfig === 'off')) {
                openFilesInNewWindow = (openFilesInNewWindowConfig === 'on');
            }
        }
        return { openFolderInNewWindow: !!openFolderInNewWindow, openFilesInNewWindow };
    }
    async openExtensionDevelopmentHostWindow(extensionDevelopmentPaths, openConfig) {
        // Reload an existing extension development host window on the same path
        // We currently do not allow more than one extension development window
        // on the same extension path.
        const existingWindow = findWindowOnExtensionDevelopmentPath(this.getWindows(), extensionDevelopmentPaths);
        if (existingWindow) {
            this.lifecycleMainService.reload(existingWindow, openConfig.cli);
            existingWindow.focus(); // make sure it gets focus and is restored
            return [existingWindow];
        }
        let folderUris = openConfig.cli['folder-uri'] || [];
        let fileUris = openConfig.cli['file-uri'] || [];
        let cliArgs = openConfig.cli._;
        // Fill in previously opened workspace unless an explicit path is provided and we are not unit testing
        if (!cliArgs.length && !folderUris.length && !fileUris.length && !openConfig.cli.extensionTestsPath) {
            const extensionDevelopmentWindowState = this.windowsStateHandler.state.lastPluginDevelopmentHostWindow;
            const workspaceToOpen = extensionDevelopmentWindowState?.workspace ?? extensionDevelopmentWindowState?.folderUri;
            if (workspaceToOpen) {
                if (URI.isUri(workspaceToOpen)) {
                    if (workspaceToOpen.scheme === Schemas.file) {
                        cliArgs = [workspaceToOpen.fsPath];
                    }
                    else {
                        folderUris = [workspaceToOpen.toString()];
                    }
                }
                else {
                    if (workspaceToOpen.configPath.scheme === Schemas.file) {
                        cliArgs = [originalFSPath(workspaceToOpen.configPath)];
                    }
                    else {
                        fileUris = [workspaceToOpen.configPath.toString()];
                    }
                }
            }
        }
        let remoteAuthority = openConfig.remoteAuthority;
        for (const extensionDevelopmentPath of extensionDevelopmentPaths) {
            if (extensionDevelopmentPath.match(/^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/)) {
                const url = URI.parse(extensionDevelopmentPath);
                const extensionDevelopmentPathRemoteAuthority = getRemoteAuthority(url);
                if (extensionDevelopmentPathRemoteAuthority) {
                    if (remoteAuthority) {
                        if (!isEqualAuthority(extensionDevelopmentPathRemoteAuthority, remoteAuthority)) {
                            this.logService.error('more than one extension development path authority');
                        }
                    }
                    else {
                        remoteAuthority = extensionDevelopmentPathRemoteAuthority;
                    }
                }
            }
        }
        // Make sure that we do not try to open:
        // - a workspace or folder that is already opened
        // - a workspace or file that has a different authority as the extension development.
        cliArgs = cliArgs.filter(path => {
            const uri = URI.file(path);
            if (findWindowOnWorkspaceOrFolder(this.getWindows(), uri)) {
                return false;
            }
            return isEqualAuthority(getRemoteAuthority(uri), remoteAuthority);
        });
        folderUris = folderUris.filter(folderUriStr => {
            const folderUri = this.cliArgToUri(folderUriStr);
            if (folderUri && findWindowOnWorkspaceOrFolder(this.getWindows(), folderUri)) {
                return false;
            }
            return folderUri ? isEqualAuthority(getRemoteAuthority(folderUri), remoteAuthority) : false;
        });
        fileUris = fileUris.filter(fileUriStr => {
            const fileUri = this.cliArgToUri(fileUriStr);
            if (fileUri && findWindowOnWorkspaceOrFolder(this.getWindows(), fileUri)) {
                return false;
            }
            return fileUri ? isEqualAuthority(getRemoteAuthority(fileUri), remoteAuthority) : false;
        });
        openConfig.cli._ = cliArgs;
        openConfig.cli['folder-uri'] = folderUris;
        openConfig.cli['file-uri'] = fileUris;
        // Open it
        const openArgs = {
            context: openConfig.context,
            cli: openConfig.cli,
            forceNewWindow: true,
            forceEmpty: !cliArgs.length && !folderUris.length && !fileUris.length,
            userEnv: openConfig.userEnv,
            noRecentEntry: true,
            waitMarkerFileURI: openConfig.waitMarkerFileURI,
            remoteAuthority,
            forceProfile: openConfig.forceProfile,
            forceTempProfile: openConfig.forceTempProfile
        };
        return this.open(openArgs);
    }
    async openInBrowserWindow(options) {
        const windowConfig = this.configurationService.getValue('window');
        const lastActiveWindow = this.getLastActiveWindow();
        const newWindowProfile = windowConfig?.newWindowProfile
            ? this.userDataProfilesMainService.profiles.find(profile => profile.name === windowConfig.newWindowProfile) : undefined;
        const defaultProfile = newWindowProfile ?? lastActiveWindow?.profile ?? this.userDataProfilesMainService.defaultProfile;
        let window;
        if (!options.forceNewWindow && !options.forceNewTabbedWindow) {
            window = options.windowToUse || lastActiveWindow;
            if (window) {
                window.focus();
            }
        }
        // Build up the window configuration from provided options, config and environment
        const configuration = {
            // Inherit CLI arguments from environment and/or
            // the specific properties from this launch if provided
            ...this.environmentMainService.args,
            ...options.cli,
            machineId: this.machineId,
            sqmId: this.sqmId,
            devDeviceId: this.devDeviceId,
            isPortable: this.environmentMainService.isPortable,
            windowId: -1, // Will be filled in by the window once loaded later
            mainPid: process.pid,
            appRoot: this.environmentMainService.appRoot,
            execPath: process.execPath,
            codeCachePath: this.environmentMainService.codeCachePath,
            // If we know the backup folder upfront (for empty windows to restore), we can set it
            // directly here which helps for restoring UI state associated with that window.
            // For all other cases we first call into registerEmptyWindowBackup() to set it before
            // loading the window.
            backupPath: options.emptyWindowBackupInfo ? join(this.environmentMainService.backupHome, options.emptyWindowBackupInfo.backupFolder) : undefined,
            profiles: {
                home: this.userDataProfilesMainService.profilesHome,
                all: this.userDataProfilesMainService.profiles,
                // Set to default profile first and resolve and update the profile
                // only after the workspace-backup is registered.
                // Because, workspace identifier of an empty window is known only then.
                profile: defaultProfile
            },
            homeDir: this.environmentMainService.userHome.with({ scheme: Schemas.file }).fsPath,
            tmpDir: this.environmentMainService.tmpDir.with({ scheme: Schemas.file }).fsPath,
            userDataDir: this.environmentMainService.userDataPath,
            remoteAuthority: options.remoteAuthority,
            workspace: options.workspace,
            userEnv: { ...this.initialUserEnv, ...options.userEnv },
            nls: {
                messages: getNLSMessages(),
                language: getNLSLanguage()
            },
            filesToOpenOrCreate: options.filesToOpen?.filesToOpenOrCreate,
            filesToDiff: options.filesToOpen?.filesToDiff,
            filesToMerge: options.filesToOpen?.filesToMerge,
            filesToWait: options.filesToOpen?.filesToWait,
            logLevel: this.loggerService.getLogLevel(),
            loggers: this.loggerService.getGlobalLoggers(),
            logsPath: this.environmentMainService.logsHome.with({ scheme: Schemas.file }).fsPath,
            product,
            isInitialStartup: options.initialStartup,
            perfMarks: getMarks(),
            os: { release: release(), hostname: hostname(), arch: arch() },
            autoDetectHighContrast: windowConfig?.autoDetectHighContrast ?? true,
            autoDetectColorScheme: windowConfig?.autoDetectColorScheme ?? false,
            accessibilitySupport: app.accessibilitySupportEnabled,
            colorScheme: this.themeMainService.getColorScheme(),
            policiesData: this.policyService.serialize(),
            continueOn: this.environmentMainService.continueOn,
            cssModules: this.cssDevelopmentService.isEnabled ? await this.cssDevelopmentService.getCssModules() : undefined,
            isSessionsWindow: isWorkspaceIdentifier(options.workspace) && isEqual(options.workspace.configPath, this.environmentMainService.agentSessionsWorkspace),
        };
        // New window
        if (!window) {
            const state = this.windowsStateHandler.getNewWindowState(configuration);
            // Create the window
            mark('code/willCreateCodeWindow');
            const createdWindow = window = this.instantiationService.createInstance(CodeWindow, {
                state,
                extensionDevelopmentPath: configuration.extensionDevelopmentPath,
                isExtensionTestHost: !!configuration.extensionTestsPath
            });
            mark('code/didCreateCodeWindow');
            // Add as window tab if configured (macOS only)
            if (options.forceNewTabbedWindow) {
                const activeWindow = this.getLastActiveWindow();
                activeWindow?.addTabbedWindow(createdWindow);
            }
            // Add to our list of windows
            this.windows.set(createdWindow.id, createdWindow);
            // Indicate new window via event
            this._onDidOpenWindow.fire(createdWindow);
            // Indicate number change via event
            this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() - 1, newCount: this.getWindowCount() });
            // Window Events
            const disposables = new DisposableStore();
            disposables.add(createdWindow.onDidSignalReady(() => this._onDidSignalReadyWindow.fire(createdWindow)));
            disposables.add(Event.once(createdWindow.onDidClose)(() => this.onWindowClosed(createdWindow, disposables)));
            disposables.add(Event.once(createdWindow.onDidDestroy)(() => this.onWindowDestroyed(createdWindow)));
            disposables.add(createdWindow.onDidMaximize(() => this._onDidMaximizeWindow.fire(createdWindow)));
            disposables.add(createdWindow.onDidUnmaximize(() => this._onDidUnmaximizeWindow.fire(createdWindow)));
            disposables.add(createdWindow.onDidEnterFullScreen(() => this._onDidChangeFullScreen.fire({ window: createdWindow, fullscreen: true })));
            disposables.add(createdWindow.onDidLeaveFullScreen(() => this._onDidChangeFullScreen.fire({ window: createdWindow, fullscreen: false })));
            disposables.add(createdWindow.onDidTriggerSystemContextMenu(({ x, y }) => this._onDidTriggerSystemContextMenu.fire({ window: createdWindow, x, y })));
            const webContents = assertReturnsDefined(createdWindow.win?.webContents);
            webContents.removeAllListeners('devtools-reload-page'); // remove built in listener so we can handle this on our own
            disposables.add(Event.fromNodeEventEmitter(webContents, 'devtools-reload-page')(() => this.lifecycleMainService.reload(createdWindow)));
            // Lifecycle
            this.lifecycleMainService.registerWindow(createdWindow);
        }
        // Existing window
        else {
            // Some configuration things get inherited if the window is being reused and we are
            // in extension development host mode. These options are all development related.
            const currentWindowConfig = window.config;
            if (!configuration.extensionDevelopmentPath && currentWindowConfig?.extensionDevelopmentPath) {
                configuration.extensionDevelopmentPath = currentWindowConfig.extensionDevelopmentPath;
                configuration.extensionDevelopmentKind = currentWindowConfig.extensionDevelopmentKind;
                configuration['enable-proposed-api'] = currentWindowConfig['enable-proposed-api'];
                configuration.verbose = currentWindowConfig.verbose;
                configuration['inspect-extensions'] = currentWindowConfig['inspect-extensions'];
                configuration['inspect-brk-extensions'] = currentWindowConfig['inspect-brk-extensions'];
                configuration.debugId = currentWindowConfig.debugId;
                configuration.extensionEnvironment = currentWindowConfig.extensionEnvironment;
                configuration['extensions-dir'] = currentWindowConfig['extensions-dir'];
                configuration['disable-extensions'] = currentWindowConfig['disable-extensions'];
                configuration['disable-extension'] = currentWindowConfig['disable-extension'];
            }
        }
        // Update window identifier and session now
        // that we have the window object in hand.
        configuration.windowId = window.id;
        // If the window was already loaded, make sure to unload it
        // first and only load the new configuration if that was
        // not vetoed
        if (window.isReady) {
            this.lifecycleMainService.unload(window, 4 /* UnloadReason.LOAD */).then(async (veto) => {
                if (!veto) {
                    await this.doOpenInBrowserWindow(window, configuration, options, defaultProfile);
                }
            });
        }
        else {
            await this.doOpenInBrowserWindow(window, configuration, options, defaultProfile);
        }
        return window;
    }
    async doOpenInBrowserWindow(window, configuration, options, defaultProfile) {
        // Register window for backups unless the window
        // is for extension development, where we do not
        // keep any backups.
        if (!configuration.extensionDevelopmentPath) {
            if (isWorkspaceIdentifier(configuration.workspace)) {
                configuration.backupPath = this.backupMainService.registerWorkspaceBackup({
                    workspace: configuration.workspace,
                    remoteAuthority: configuration.remoteAuthority
                });
            }
            else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
                configuration.backupPath = this.backupMainService.registerFolderBackup({
                    folderUri: configuration.workspace.uri,
                    remoteAuthority: configuration.remoteAuthority
                });
            }
            else {
                // Empty windows are special in that they provide no workspace on
                // their configuration. To properly register them with the backup
                // service, we either use the provided associated `backupFolder`
                // in case we restore a previously opened empty window or we have
                // to generate a new empty window workspace identifier to be used
                // as `backupFolder`.
                configuration.backupPath = this.backupMainService.registerEmptyWindowBackup({
                    backupFolder: options.emptyWindowBackupInfo?.backupFolder ?? createEmptyWorkspaceIdentifier().id,
                    remoteAuthority: configuration.remoteAuthority
                });
            }
        }
        const workspace = configuration.workspace ?? toWorkspaceIdentifier(configuration.backupPath, false);
        const profilePromise = this.resolveProfileForBrowserWindow(options, workspace, defaultProfile);
        const profile = profilePromise instanceof Promise ? await profilePromise : profilePromise;
        configuration.profiles.profile = profile;
        if (!configuration.extensionDevelopmentPath) {
            // Associate the configured profile to the workspace
            // unless the window is for extension development,
            // where we do not persist the associations
            await this.userDataProfilesMainService.setProfileForWorkspace(workspace, profile);
        }
        // Load it
        window.load(configuration);
    }
    resolveProfileForBrowserWindow(options, workspace, defaultProfile) {
        if (options.forceProfile) {
            return this.userDataProfilesMainService.profiles.find(p => p.name === options.forceProfile) ?? this.userDataProfilesMainService.createNamedProfile(options.forceProfile);
        }
        if (options.forceTempProfile) {
            return this.userDataProfilesMainService.createTransientProfile();
        }
        return this.userDataProfilesMainService.getProfileForWorkspace(workspace) ?? defaultProfile;
    }
    onWindowClosed(window, disposables) {
        // Remove from our list so that Electron can clean it up
        this.windows.delete(window.id);
        // Emit
        this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() + 1, newCount: this.getWindowCount() });
        // Clean up
        disposables.dispose();
    }
    onWindowDestroyed(window) {
        // Remove from our list so that Electron can clean it up
        this.windows.delete(window.id);
        // Emit
        this._onDidDestroyWindow.fire(window);
    }
    getFocusedWindow() {
        const window = BrowserWindow.getFocusedWindow();
        if (window) {
            return this.getWindowById(window.id);
        }
        return undefined;
    }
    getLastActiveWindow() {
        return this.doGetLastActiveWindow(this.getWindows());
    }
    getLastActiveWindowForAuthority(remoteAuthority) {
        return this.doGetLastActiveWindow(this.getWindows().filter(window => isEqualAuthority(window.remoteAuthority, remoteAuthority)));
    }
    doGetLastActiveWindow(windows) {
        return getLastFocused(windows);
    }
    sendToFocused(channel, ...args) {
        const focusedWindow = this.getFocusedWindow() || this.getLastActiveWindow();
        focusedWindow?.sendWhenReady(channel, CancellationToken.None, ...args);
    }
    sendToOpeningWindow(channel, ...args) {
        this._register(Event.once(this.onDidSignalReadyWindow)(window => {
            window.sendWhenReady(channel, CancellationToken.None, ...args);
        }));
    }
    sendToAll(channel, payload, windowIdsToIgnore) {
        for (const window of this.getWindows()) {
            if (windowIdsToIgnore && windowIdsToIgnore.indexOf(window.id) >= 0) {
                continue; // do not send if we are instructed to ignore it
            }
            window.sendWhenReady(channel, CancellationToken.None, payload);
        }
    }
    getWindows() {
        return Array.from(this.windows.values());
    }
    getWindowCount() {
        return this.windows.size;
    }
    getWindowById(windowId) {
        return this.windows.get(windowId);
    }
    getWindowByWebContents(webContents) {
        const browserWindow = BrowserWindow.fromWebContents(webContents);
        if (!browserWindow) {
            return undefined;
        }
        const window = this.getWindowById(browserWindow.id);
        return window?.matches(webContents) ? window : undefined;
    }
};
WindowsMainService = __decorate([
    __param(4, ILogService),
    __param(5, ILoggerMainService),
    __param(6, IStateService),
    __param(7, IPolicyService),
    __param(8, IEnvironmentMainService),
    __param(9, IUserDataProfilesMainService),
    __param(10, ILifecycleMainService),
    __param(11, IBackupMainService),
    __param(12, IConfigurationService),
    __param(13, IWorkspacesHistoryMainService),
    __param(14, IWorkspacesManagementMainService),
    __param(15, IInstantiationService),
    __param(16, IDialogMainService),
    __param(17, IFileService),
    __param(18, IProtocolMainService),
    __param(19, IThemeMainService),
    __param(20, IAuxiliaryWindowsMainService),
    __param(21, ICSSDevelopmentService)
], WindowsMainService);
export { WindowsMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c01haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2luZG93cy9lbGVjdHJvbi1tYWluL3dpbmRvd3NNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBZSxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzdDLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsdUJBQXVCLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0gsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNoRixPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFN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