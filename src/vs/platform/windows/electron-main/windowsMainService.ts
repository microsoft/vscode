/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, BrowserWindow, MessageBoxOptions, WebContents } from 'electron';
import { statSync } from 'fs';
import { hostname, release } from 'os';
import { coalesce, distinct, firstOrDefault } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CharCode } from 'vs/base/common/charCode';
import { Emitter, Event } from 'vs/base/common/event';
import { isWindowsDriveLetter, parseLineAndColumnAware, sanitizeFilePath, toSlashes } from 'vs/base/common/extpath';
import { once } from 'vs/base/common/functional';
import { getPathLabel, mnemonicButtonLabel } from 'vs/base/common/labels';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { basename, join, normalize, posix } from 'vs/base/common/path';
import { getMarks, mark } from 'vs/base/common/performance';
import { IProcessEnvironment, isMacintosh, isWindows, OS } from 'vs/base/common/platform';
import { cwd } from 'vs/base/common/process';
import { extUriBiasedIgnorePathCase, isEqualAuthority, normalizePath, originalFSPath, removeTrailingPathSeparator } from 'vs/base/common/resources';
import { assertIsDefined, withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IBackupMainService } from 'vs/platform/backup/electron-main/backup';
import { IEmptyWindowBackupInfo } from 'vs/platform/backup/node/backup';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogMainService';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { FileType, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { IAddFoldersRequest, INativeOpenFileRequest, INativeWindowConfiguration, IOpenEmptyWindowOptions, IPath, IPathsToWaitFor, isFileToOpen, isFolderToOpen, isWorkspaceToOpen, IWindowOpenable, IWindowSettings } from 'vs/platform/window/common/window';
import { CodeWindow } from 'vs/platform/windows/electron-main/windowImpl';
import { IOpenConfiguration, IOpenEmptyConfiguration, IWindowsCountChangedEvent, IWindowsMainService, OpenContext } from 'vs/platform/windows/electron-main/windows';
import { findWindowOnExtensionDevelopmentPath, findWindowOnFile, findWindowOnWorkspaceOrFolder } from 'vs/platform/windows/electron-main/windowsFinder';
import { IWindowState, WindowsStateHandler } from 'vs/platform/windows/electron-main/windowsStateHandler';
import { IRecent } from 'vs/platform/workspaces/common/workspaces';
import { hasWorkspaceFileExtension, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from 'vs/platform/workspaces/electron-main/workspaces';
import { IWorkspacesHistoryMainService } from 'vs/platform/workspaces/electron-main/workspacesHistoryMainService';
import { IWorkspacesManagementMainService } from 'vs/platform/workspaces/electron-main/workspacesManagementMainService';
import { ICodeWindow, UnloadReason } from 'vs/platform/window/electron-main/window';
import { IThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IPolicyService } from 'vs/platform/policy/common/policy';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';

//#region Helper Interfaces

type RestoreWindowsSetting = 'preserve' | 'all' | 'folders' | 'one' | 'none';

interface IOpenBrowserWindowOptions {
	readonly userEnv?: IProcessEnvironment;
	readonly cli?: NativeParsedArgs;

	readonly workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier;

	readonly remoteAuthority?: string;

	readonly initialStartup?: boolean;

	readonly filesToOpen?: IFilesToOpen;

	readonly forceNewWindow?: boolean;
	readonly forceNewTabbedWindow?: boolean;
	readonly windowToUse?: ICodeWindow;

	readonly emptyWindowBackupInfo?: IEmptyWindowBackupInfo;
	readonly profile?: IUserDataProfile;
}

interface IPathResolveOptions {

	/**
	 * By default, resolving a path will check
	 * if the path exists. This can be disabled
	 * with this flag.
	 */
	readonly ignoreFileNotFound?: boolean;

	/**
	 * Will reject a path if it points to a transient
	 * workspace as indicated by a `transient: true`
	 * property in the workspace file.
	 */
	readonly rejectTransientWorkspaces?: boolean;

	/**
	 * If enabled, will resolve the path line/column
	 * aware and properly remove this information
	 * from the resulting file path.
	 */
	readonly gotoLineMode?: boolean;

	/**
	 * Forces to resolve the provided path as workspace
	 * file instead of opening it as a file.
	 */
	readonly forceOpenWorkspaceAsFile?: boolean;

	/**
	 * The remoteAuthority to use if the URL to open is
	 * neither `file` nor `vscode-remote`.
	 */
	readonly remoteAuthority?: string;
}

interface IFilesToOpen {
	readonly remoteAuthority?: string;

	filesToOpenOrCreate: IPath[];
	filesToDiff: IPath[];
	filesToMerge: IPath[];

	filesToWait?: IPathsToWaitFor;
}

interface IPathToOpen<T = IEditorOptions> extends IPath<T> {

	/**
	 * The workspace to open
	 */
	readonly workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier;

	/**
	 * Whether the path is considered to be transient or not
	 * for example, a transient workspace should not add to
	 * the workspaces history and should never restore.
	 */
	readonly transient?: boolean;

	/**
	 * The backup path to use
	 */
	readonly backupPath?: string;

	/**
	 * The remote authority for the Code instance to open. Undefined if not remote.
	 */
	readonly remoteAuthority?: string;

	/**
	 * Optional label for the recent history
	 */
	label?: string;
}

interface IWorkspacePathToOpen extends IPathToOpen {
	readonly workspace: IWorkspaceIdentifier;
}

interface ISingleFolderWorkspacePathToOpen extends IPathToOpen {
	readonly workspace: ISingleFolderWorkspaceIdentifier;
}

function isWorkspacePathToOpen(path: IPathToOpen | undefined): path is IWorkspacePathToOpen {
	return isWorkspaceIdentifier(path?.workspace);
}

function isSingleFolderWorkspacePathToOpen(path: IPathToOpen | undefined): path is ISingleFolderWorkspacePathToOpen {
	return isSingleFolderWorkspaceIdentifier(path?.workspace);
}

//#endregion

export class WindowsMainService extends Disposable implements IWindowsMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly WINDOWS: ICodeWindow[] = [];

	private readonly _onDidOpenWindow = this._register(new Emitter<ICodeWindow>());
	readonly onDidOpenWindow = this._onDidOpenWindow.event;

	private readonly _onDidSignalReadyWindow = this._register(new Emitter<ICodeWindow>());
	readonly onDidSignalReadyWindow = this._onDidSignalReadyWindow.event;

	private readonly _onDidDestroyWindow = this._register(new Emitter<ICodeWindow>());
	readonly onDidDestroyWindow = this._onDidDestroyWindow.event;

	private readonly _onDidChangeWindowsCount = this._register(new Emitter<IWindowsCountChangedEvent>());
	readonly onDidChangeWindowsCount = this._onDidChangeWindowsCount.event;

	private readonly _onDidTriggerSystemContextMenu = this._register(new Emitter<{ window: ICodeWindow; x: number; y: number }>());
	readonly onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;

	private readonly windowsStateHandler = this._register(new WindowsStateHandler(this, this.stateMainService, this.lifecycleMainService, this.logService, this.configurationService));

	constructor(
		private readonly machineId: string,
		private readonly initialUserEnv: IProcessEnvironment,
		@ILogService private readonly logService: ILogService,
		@IStateMainService private readonly stateMainService: IStateMainService,
		@IPolicyService private readonly policyService: IPolicyService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IUserDataProfilesMainService private readonly userDataProfilesMainService: IUserDataProfilesMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IBackupMainService private readonly backupMainService: IBackupMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspacesHistoryMainService private readonly workspacesHistoryMainService: IWorkspacesHistoryMainService,
		@IWorkspacesManagementMainService private readonly workspacesManagementMainService: IWorkspacesManagementMainService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService,
		@IProtocolMainService private readonly protocolMainService: IProtocolMainService,
		@IThemeMainService private readonly themeMainService: IThemeMainService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

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

	openEmptyWindow(openConfig: IOpenEmptyConfiguration, options?: IOpenEmptyWindowOptions): ICodeWindow[] {
		const cli = this.environmentMainService.args;
		const remoteAuthority = options?.remoteAuthority || undefined;
		const forceEmpty = true;
		const forceReuseWindow = options?.forceReuseWindow;
		const forceNewWindow = !forceReuseWindow;

		return this.open({ ...openConfig, cli, forceEmpty, forceNewWindow, forceReuseWindow, remoteAuthority });
	}

	openExistingWindow(window: ICodeWindow, openConfig: IOpenConfiguration): void {

		// Bring window to front
		window.focus();

		// Handle --wait
		this.handleWaitMarkerFile(openConfig, [window]);
	}

	open(openConfig: IOpenConfiguration): ICodeWindow[] {
		this.logService.trace('windowsManager#open');

		if (openConfig.addMode && (openConfig.initialStartup || !this.getLastActiveWindow())) {
			openConfig.addMode = false; // Make sure addMode is only enabled if we have an active window
		}

		const foldersToAdd: ISingleFolderWorkspacePathToOpen[] = [];
		const foldersToOpen: ISingleFolderWorkspacePathToOpen[] = [];

		const workspacesToOpen: IWorkspacePathToOpen[] = [];
		const untitledWorkspacesToRestore: IWorkspacePathToOpen[] = [];

		const emptyWindowsWithBackupsToRestore: IEmptyWindowBackupInfo[] = [];

		let filesToOpen: IFilesToOpen | undefined;
		let emptyToOpen = 0;

		// Identify things to open from open config
		const pathsToOpen = this.getPathsToOpen(openConfig);
		this.logService.trace('windowsManager#open pathsToOpen', pathsToOpen);
		for (const path of pathsToOpen) {
			if (isSingleFolderWorkspacePathToOpen(path)) {
				if (openConfig.addMode) {
					// When run with --add, take the folders that are to be opened as
					// folders that should be added to the currently active window.
					foldersToAdd.push(path);
				} else {
					foldersToOpen.push(path);
				}
			} else if (isWorkspacePathToOpen(path)) {
				workspacesToOpen.push(path);
			} else if (path.fileUri) {
				if (!filesToOpen) {
					filesToOpen = { filesToOpenOrCreate: [], filesToDiff: [], filesToMerge: [], remoteAuthority: path.remoteAuthority };
				}
				filesToOpen.filesToOpenOrCreate.push(path);
			} else if (path.backupPath) {
				emptyWindowsWithBackupsToRestore.push({ backupFolder: basename(path.backupPath), remoteAuthority: path.remoteAuthority });
			} else {
				emptyToOpen++;
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
		if (openConfig.initialStartup) {

			// Untitled workspaces are always restored
			untitledWorkspacesToRestore.push(...this.workspacesManagementMainService.getUntitledWorkspacesSync());
			workspacesToOpen.push(...untitledWorkspacesToRestore);

			// Empty windows with backups are always restored
			emptyWindowsWithBackupsToRestore.push(...this.backupMainService.getEmptyWindowBackups());
		} else {
			emptyWindowsWithBackupsToRestore.length = 0;
		}

		// Open based on config
		const { windows: usedWindows, filesOpenedInWindow } = this.doOpen(openConfig, workspacesToOpen, foldersToOpen, emptyWindowsWithBackupsToRestore, emptyToOpen, filesToOpen, foldersToAdd);

		this.logService.trace(`windowsManager#open used window count ${usedWindows.length} (workspacesToOpen: ${workspacesToOpen.length}, foldersToOpen: ${foldersToOpen.length}, emptyToRestore: ${emptyWindowsWithBackupsToRestore.length}, emptyToOpen: ${emptyToOpen})`);

		// Make sure to pass focus to the most relevant of the windows if we open multiple
		if (usedWindows.length > 1) {

			// 1.) focus window we opened files in always with highest priority
			if (filesOpenedInWindow) {
				filesOpenedInWindow.focus();
			}

			// Otherwise, find a good window based on open params
			else {
				const focusLastActive = this.windowsStateHandler.state.lastActiveWindow && !openConfig.forceEmpty && !openConfig.cli._.length && !openConfig.cli['file-uri'] && !openConfig.cli['folder-uri'] && !(openConfig.urisToOpen && openConfig.urisToOpen.length);
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
						if (
							(usedWindow.openedWorkspace && untitledWorkspacesToRestore.some(workspace => usedWindow.openedWorkspace && workspace.workspace.id === usedWindow.openedWorkspace.id)) ||	// skip over restored workspace
							(usedWindow.backupPath && emptyWindowsWithBackupsToRestore.some(empty => usedWindow.backupPath && empty.backupFolder === basename(usedWindow.backupPath)))							// skip over restored empty window
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
			const recents: IRecent[] = [];
			for (const pathToOpen of pathsToOpen) {
				if (isWorkspacePathToOpen(pathToOpen) && !pathToOpen.transient /* never add transient workspaces to history */) {
					recents.push({ label: pathToOpen.label, workspace: pathToOpen.workspace, remoteAuthority: pathToOpen.remoteAuthority });
				} else if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
					recents.push({ label: pathToOpen.label, folderUri: pathToOpen.workspace.uri, remoteAuthority: pathToOpen.remoteAuthority });
				} else if (pathToOpen.fileUri) {
					recents.push({ label: pathToOpen.label, fileUri: pathToOpen.fileUri, remoteAuthority: pathToOpen.remoteAuthority });
				}
			}

			this.workspacesHistoryMainService.addRecentlyOpened(recents);
		}

		// Handle --wait
		this.handleWaitMarkerFile(openConfig, usedWindows);

		return usedWindows;
	}

	private handleWaitMarkerFile(openConfig: IOpenConfiguration, usedWindows: ICodeWindow[]): void {

		// If we got started with --wait from the CLI, we need to signal to the outside when the window
		// used for the edit operation is closed or loaded to a different folder so that the waiting
		// process can continue. We do this by deleting the waitMarkerFilePath.
		const waitMarkerFileURI = openConfig.waitMarkerFileURI;
		if (openConfig.context === OpenContext.CLI && waitMarkerFileURI && usedWindows.length === 1 && usedWindows[0]) {
			(async () => {
				await usedWindows[0].whenClosedOrLoaded;

				try {
					await this.fileService.del(waitMarkerFileURI);
				} catch (error) {
					// ignore - could have been deleted from the window already
				}
			})();
		}
	}

	private doOpen(
		openConfig: IOpenConfiguration,
		workspacesToOpen: IWorkspacePathToOpen[],
		foldersToOpen: ISingleFolderWorkspacePathToOpen[],
		emptyToRestore: IEmptyWindowBackupInfo[],
		emptyToOpen: number,
		filesToOpen: IFilesToOpen | undefined,
		foldersToAdd: ISingleFolderWorkspacePathToOpen[]
	): { windows: ICodeWindow[]; filesOpenedInWindow: ICodeWindow | undefined } {

		// Keep track of used windows and remember
		// if files have been opened in one of them
		const usedWindows: ICodeWindow[] = [];
		let filesOpenedInWindow: ICodeWindow | undefined = undefined;
		function addUsedWindow(window: ICodeWindow, openedFiles?: boolean): void {
			usedWindows.push(window);

			if (openedFiles) {
				filesOpenedInWindow = window;
				filesToOpen = undefined; // reset `filesToOpen` since files have been opened
			}
		}

		// Settings can decide if files/folders open in new window or not
		let { openFolderInNewWindow, openFilesInNewWindow } = this.shouldOpenNewWindow(openConfig);

		// Handle folders to add by looking for the last active workspace (not on initial startup)
		if (!openConfig.initialStartup && foldersToAdd.length > 0) {
			const authority = foldersToAdd[0].remoteAuthority;
			const lastActiveWindow = this.getLastActiveWindowForAuthority(authority);
			if (lastActiveWindow) {
				addUsedWindow(this.doAddFoldersToExistingWindow(lastActiveWindow, foldersToAdd.map(folderToAdd => folderToAdd.workspace.uri)));
			}
		}

		// Handle files to open/diff/merge or to create when we dont open a folder and we do not restore any
		// folder/untitled from hot-exit by trying to open them in the window that fits best
		const potentialNewWindowsCount = foldersToOpen.length + workspacesToOpen.length + emptyToRestore.length;
		if (filesToOpen && potentialNewWindowsCount === 0) {

			// Find suitable window or folder path to open files in
			const fileToCheck: IPath<IEditorOptions> | undefined = filesToOpen.filesToOpenOrCreate[0] || filesToOpen.filesToDiff[0] || filesToOpen.filesToMerge[3] /* [3] is the resulting merge file */;

			// only look at the windows with correct authority
			const windows = this.getWindows().filter(window => filesToOpen && isEqualAuthority(window.remoteAuthority, filesToOpen.remoteAuthority));

			// figure out a good window to open the files in if any
			// with a fallback to the last active window.
			//
			// in case `openFilesInNewWindow` is enforced, we skip
			// this step.
			let windowToUseForFiles: ICodeWindow | undefined = undefined;
			if (fileToCheck?.fileUri && !openFilesInNewWindow) {
				if (openConfig.context === OpenContext.DESKTOP || openConfig.context === OpenContext.CLI || openConfig.context === OpenContext.DOCK) {
					windowToUseForFiles = findWindowOnFile(windows, fileToCheck.fileUri, workspace => workspace.configPath.scheme === Schemas.file ? this.workspacesManagementMainService.resolveLocalWorkspaceSync(workspace.configPath) : undefined);
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
				addUsedWindow(this.openInBrowserWindow({
					userEnv: openConfig.userEnv,
					cli: openConfig.cli,
					initialStartup: openConfig.initialStartup,
					filesToOpen,
					forceNewWindow: true,
					remoteAuthority: filesToOpen.remoteAuthority,
					forceNewTabbedWindow: openConfig.forceNewTabbedWindow,
					profile: openConfig.profile
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
			allWorkspacesToOpen.forEach(workspaceToOpen => {
				if (windowsOnWorkspace.some(window => window.openedWorkspace && window.openedWorkspace.id === workspaceToOpen.workspace.id)) {
					return; // ignore folders that are already open
				}

				const remoteAuthority = workspaceToOpen.remoteAuthority;
				const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : undefined;

				// Do open folder
				addUsedWindow(this.doOpenFolderOrWorkspace(openConfig, workspaceToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
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
			allFoldersToOpen.forEach(folderToOpen => {
				if (windowsOnFolderPath.some(window => isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.uri, folderToOpen.workspace.uri))) {
					return; // ignore folders that are already open
				}

				const remoteAuthority = folderToOpen.remoteAuthority;
				const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : undefined;

				// Do open folder
				addUsedWindow(this.doOpenFolderOrWorkspace(openConfig, folderToOpen, openFolderInNewWindow, filesToOpenInWindow), !!filesToOpenInWindow);

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty to restore
		const allEmptyToRestore = distinct(emptyToRestore, info => info.backupFolder); // prevent duplicates
		if (allEmptyToRestore.length > 0) {
			allEmptyToRestore.forEach(emptyWindowBackupInfo => {
				const remoteAuthority = emptyWindowBackupInfo.remoteAuthority;
				const filesToOpenInWindow = isEqualAuthority(filesToOpen?.remoteAuthority, remoteAuthority) ? filesToOpen : undefined;

				addUsedWindow(this.doOpenEmpty(openConfig, true, remoteAuthority, filesToOpenInWindow, emptyWindowBackupInfo), !!filesToOpenInWindow);

				openFolderInNewWindow = true; // any other folders to open must open in new window then
			});
		}

		// Handle empty to open (only if no other window opened)
		if (usedWindows.length === 0 || filesToOpen) {
			if (filesToOpen && !emptyToOpen) {
				emptyToOpen++;
			}

			const remoteAuthority = filesToOpen ? filesToOpen.remoteAuthority : openConfig.remoteAuthority;

			for (let i = 0; i < emptyToOpen; i++) {
				addUsedWindow(this.doOpenEmpty(openConfig, openFolderInNewWindow, remoteAuthority, filesToOpen), !!filesToOpen);

				// any other window to open must open in new window then
				openFolderInNewWindow = true;
			}
		}

		return { windows: distinct(usedWindows), filesOpenedInWindow };
	}

	private doOpenFilesInExistingWindow(configuration: IOpenConfiguration, window: ICodeWindow, filesToOpen?: IFilesToOpen): ICodeWindow {
		this.logService.trace('windowsManager#doOpenFilesInExistingWindow', { filesToOpen });

		window.focus(); // make sure window has focus

		const params: INativeOpenFileRequest = {
			filesToOpenOrCreate: filesToOpen?.filesToOpenOrCreate,
			filesToDiff: filesToOpen?.filesToDiff,
			filesToMerge: filesToOpen?.filesToMerge,
			filesToWait: filesToOpen?.filesToWait,
			termProgram: configuration?.userEnv?.['TERM_PROGRAM']
		};
		window.sendWhenReady('vscode:openFiles', CancellationToken.None, params);

		return window;
	}

	private doAddFoldersToExistingWindow(window: ICodeWindow, foldersToAdd: URI[]): ICodeWindow {
		this.logService.trace('windowsManager#doAddFoldersToExistingWindow', { foldersToAdd });

		window.focus(); // make sure window has focus

		const request: IAddFoldersRequest = { foldersToAdd };
		window.sendWhenReady('vscode:addFolders', CancellationToken.None, request);

		return window;
	}

	private doOpenEmpty(openConfig: IOpenConfiguration, forceNewWindow: boolean, remoteAuthority: string | undefined, filesToOpen: IFilesToOpen | undefined, emptyWindowBackupInfo?: IEmptyWindowBackupInfo): ICodeWindow {
		this.logService.trace('windowsManager#doOpenEmpty', { restore: !!emptyWindowBackupInfo, remoteAuthority, filesToOpen, forceNewWindow });

		let windowToUse: ICodeWindow | undefined;
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
			profile: openConfig.profile
		});
	}

	private doOpenFolderOrWorkspace(openConfig: IOpenConfiguration, folderOrWorkspace: IWorkspacePathToOpen | ISingleFolderWorkspacePathToOpen, forceNewWindow: boolean, filesToOpen: IFilesToOpen | undefined, windowToUse?: ICodeWindow): ICodeWindow {
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
			profile: openConfig.profile
		});
	}

	private getPathsToOpen(openConfig: IOpenConfiguration): IPathToOpen[] {
		let pathsToOpen: IPathToOpen[];
		let isCommandLineOrAPICall = false;
		let restoredWindows = false;

		// Extract paths: from API
		if (openConfig.urisToOpen && openConfig.urisToOpen.length > 0) {
			pathsToOpen = this.doExtractPathsFromAPI(openConfig);
			isCommandLineOrAPICall = true;
		}

		// Check for force empty
		else if (openConfig.forceEmpty) {
			pathsToOpen = [Object.create(null)];
		}

		// Extract paths: from CLI
		else if (openConfig.cli._.length || openConfig.cli['folder-uri'] || openConfig.cli['file-uri']) {
			pathsToOpen = this.doExtractPathsFromCLI(openConfig.cli);
			if (pathsToOpen.length === 0) {
				pathsToOpen.push(Object.create(null)); // add an empty window if we did not have windows to open from command line
			}

			isCommandLineOrAPICall = true;
		}

		// Extract paths: from previous session
		else {
			pathsToOpen = this.doGetPathsFromLastSession();
			if (pathsToOpen.length === 0) {
				pathsToOpen.push(Object.create(null)); // add an empty window if we did not have windows to restore
			}

			restoredWindows = true;
		}

		// Convert multiple folders into workspace (if opened via API or CLI)
		// This will ensure to open these folders in one window instead of multiple
		// If we are in `addMode`, we should not do this because in that case all
		// folders should be added to the existing window.
		if (!openConfig.addMode && isCommandLineOrAPICall) {
			const foldersToOpen = pathsToOpen.filter(path => isSingleFolderWorkspacePathToOpen(path)) as ISingleFolderWorkspacePathToOpen[];
			if (foldersToOpen.length > 1) {
				const remoteAuthority = foldersToOpen[0].remoteAuthority;
				if (foldersToOpen.every(folderToOpen => isEqualAuthority(folderToOpen.remoteAuthority, remoteAuthority))) { // only if all folder have the same authority
					const workspace = this.workspacesManagementMainService.createUntitledWorkspaceSync(foldersToOpen.map(folder => ({ uri: folder.workspace.uri })));

					// Add workspace and remove folders thereby
					pathsToOpen.push({ workspace, remoteAuthority });
					pathsToOpen = pathsToOpen.filter(path => !isSingleFolderWorkspacePathToOpen(path));
				}
			}
		}

		// Check for `window.startup` setting to include all windows
		// from the previous session if this is the initial startup and we have
		// not restored windows already otherwise.
		// Use `unshift` to ensure any new window to open comes last
		// for proper focus treatment.
		if (openConfig.initialStartup && !restoredWindows && this.configurationService.getValue<IWindowSettings | undefined>('window')?.restoreWindows === 'preserve') {
			pathsToOpen.unshift(...this.doGetPathsFromLastSession().filter(path => isWorkspacePathToOpen(path) || isSingleFolderWorkspacePathToOpen(path) || path.backupPath));
		}

		return pathsToOpen;
	}

	private doExtractPathsFromAPI(openConfig: IOpenConfiguration): IPathToOpen[] {
		const pathsToOpen: IPathToOpen[] = [];
		const pathResolveOptions: IPathResolveOptions = { gotoLineMode: openConfig.gotoLineMode, remoteAuthority: openConfig.remoteAuthority };
		for (const pathToOpen of coalesce(openConfig.urisToOpen || [])) {
			const path = this.resolveOpenable(pathToOpen, pathResolveOptions);

			// Path exists
			if (path) {
				path.label = pathToOpen.label;
				pathsToOpen.push(path);
			}

			// Path does not exist: show a warning box
			else {
				const uri = this.resourceFromOpenable(pathToOpen);

				const options: MessageBoxOptions = {
					title: this.productService.nameLong,
					type: 'info',
					buttons: [mnemonicButtonLabel(localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"))],
					defaultId: 0,
					message: uri.scheme === Schemas.file ? localize('pathNotExistTitle', "Path does not exist") : localize('uriInvalidTitle', "URI can not be opened"),
					detail: uri.scheme === Schemas.file ?
						localize('pathNotExistDetail', "The path '{0}' does not exist on this computer.", getPathLabel(uri, { os: OS, tildify: this.environmentMainService })) :
						localize('uriInvalidDetail', "The URI '{0}' is not valid and can not be opened.", uri.toString(true)),
					noLink: true
				};

				this.dialogMainService.showMessageBox(options, withNullAsUndefined(BrowserWindow.getFocusedWindow()));
			}
		}

		return pathsToOpen;
	}

	private doExtractPathsFromCLI(cli: NativeParsedArgs): IPath[] {
		const pathsToOpen: IPathToOpen[] = [];
		const pathResolveOptions: IPathResolveOptions = {
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
			for (const rawFolderUri of folderUris) {
				const folderUri = this.cliArgToUri(rawFolderUri);
				if (folderUri) {
					const path = this.resolveOpenable({ folderUri }, pathResolveOptions);
					if (path) {
						pathsToOpen.push(path);
					}
				}
			}
		}

		// file uris
		const fileUris = cli['file-uri'];
		if (fileUris) {
			for (const rawFileUri of fileUris) {
				const fileUri = this.cliArgToUri(rawFileUri);
				if (fileUri) {
					const path = this.resolveOpenable(hasWorkspaceFileExtension(rawFileUri) ? { workspaceUri: fileUri } : { fileUri }, pathResolveOptions);
					if (path) {
						pathsToOpen.push(path);
					}
				}
			}
		}

		// folder or file paths
		const cliPaths = cli._;
		for (const cliPath of cliPaths) {
			const path = pathResolveOptions.remoteAuthority ? this.doResolvePathRemote(cliPath, pathResolveOptions) : this.doResolveFilePath(cliPath, pathResolveOptions);
			if (path) {
				pathsToOpen.push(path);
			}
		}

		return pathsToOpen;
	}

	private cliArgToUri(arg: string): URI | undefined {
		try {
			const uri = URI.parse(arg);
			if (!uri.scheme) {
				this.logService.error(`Invalid URI input string, scheme missing: ${arg}`);

				return undefined;
			}

			return uri;
		} catch (e) {
			this.logService.error(`Invalid URI input string: ${arg}, ${e.message}`);
		}

		return undefined;
	}

	private doGetPathsFromLastSession(): IPathToOpen[] {
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
				const lastSessionWindows: IWindowState[] = [];
				if (restoreWindowsSetting !== 'one') {
					lastSessionWindows.push(...this.windowsStateHandler.state.openedWindows);
				}
				if (this.windowsStateHandler.state.lastActiveWindow) {
					lastSessionWindows.push(this.windowsStateHandler.state.lastActiveWindow);
				}

				const pathsToOpen: IPathToOpen[] = [];
				for (const lastSessionWindow of lastSessionWindows) {

					// Workspaces
					if (lastSessionWindow.workspace) {
						const pathToOpen = this.resolveOpenable({ workspaceUri: lastSessionWindow.workspace.configPath }, { remoteAuthority: lastSessionWindow.remoteAuthority, rejectTransientWorkspaces: true /* https://github.com/microsoft/vscode/issues/119695 */ });
						if (isWorkspacePathToOpen(pathToOpen)) {
							pathsToOpen.push(pathToOpen);
						}
					}

					// Folders
					else if (lastSessionWindow.folderUri) {
						const pathToOpen = this.resolveOpenable({ folderUri: lastSessionWindow.folderUri }, { remoteAuthority: lastSessionWindow.remoteAuthority });
						if (isSingleFolderWorkspacePathToOpen(pathToOpen)) {
							pathsToOpen.push(pathToOpen);
						}
					}

					// Empty window, potentially editors open to be restored
					else if (restoreWindowsSetting !== 'folders' && lastSessionWindow.backupPath) {
						pathsToOpen.push({ backupPath: lastSessionWindow.backupPath, remoteAuthority: lastSessionWindow.remoteAuthority });
					}
				}

				return pathsToOpen;
			}
		}
	}

	private getRestoreWindowsSetting(): RestoreWindowsSetting {
		let restoreWindows: RestoreWindowsSetting;
		if (this.lifecycleMainService.wasRestarted) {
			restoreWindows = 'all'; // always reopen all windows when an update was applied
		} else {
			const windowConfig = this.configurationService.getValue<IWindowSettings | undefined>('window');
			restoreWindows = windowConfig?.restoreWindows || 'all'; // by default restore all windows

			if (!['preserve', 'all', 'folders', 'one', 'none'].includes(restoreWindows)) {
				restoreWindows = 'all'; // by default restore all windows
			}
		}

		return restoreWindows;
	}

	private resolveOpenable(openable: IWindowOpenable, options: IPathResolveOptions = Object.create(null)): IPathToOpen | undefined {

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

	private doResolveRemoteOpenable(openable: IWindowOpenable, options: IPathResolveOptions): IPathToOpen<ITextEditorOptions> | undefined {
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

	private resourceFromOpenable(openable: IWindowOpenable): URI {
		if (isWorkspaceToOpen(openable)) {
			return openable.workspaceUri;
		}

		if (isFolderToOpen(openable)) {
			return openable.folderUri;
		}

		return openable.fileUri;
	}

	private doResolveFilePath(path: string, options: IPathResolveOptions): IPathToOpen<ITextEditorOptions> | undefined {

		// Extract line/col information from path
		let lineNumber: number | undefined;
		let columnNumber: number | undefined;
		if (options.gotoLineMode) {
			({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
		}

		// Ensure the path is normalized and absolute
		path = sanitizeFilePath(normalize(path), cwd());

		try {
			const pathStat = statSync(path);

			// File
			if (pathStat.isFile()) {

				// Workspace (unless disabled via flag)
				if (!options.forceOpenWorkspaceAsFile) {
					const workspace = this.workspacesManagementMainService.resolveLocalWorkspaceSync(URI.file(path));
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
		} catch (error) {
			const fileUri = URI.file(path);

			// since file does not seem to exist anymore, remove from recent
			this.workspacesHistoryMainService.removeRecentlyOpened([fileUri]);

			// assume this is a file that does not yet exist
			if (options.ignoreFileNotFound) {
				return {
					fileUri,
					type: FileType.File,
					exists: false
				};
			}
		}

		return undefined;
	}

	private doResolvePathRemote(path: string, options: IPathResolveOptions): IPathToOpen<ITextEditorOptions> | undefined {
		const first = path.charCodeAt(0);
		const remoteAuthority = options.remoteAuthority;

		// Extract line/col information from path
		let lineNumber: number | undefined;
		let columnNumber: number | undefined;

		if (options.gotoLineMode) {
			({ path, line: lineNumber, column: columnNumber } = parseLineAndColumnAware(path));
		}

		// make absolute
		if (first !== CharCode.Slash) {
			if (isWindowsDriveLetter(first) && path.charCodeAt(path.charCodeAt(1)) === CharCode.Colon) {
				path = toSlashes(path);
			}

			path = `/${path}`;
		}

		const uri = URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path: path });

		// guess the file type:
		// - if it ends with a slash it's a folder
		// - if in goto line mode or if it has a file extension, it's a file or a workspace
		// - by defaults it's a folder
		if (path.charCodeAt(path.length - 1) !== CharCode.Slash) {

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

	private shouldOpenNewWindow(openConfig: IOpenConfiguration): { openFolderInNewWindow: boolean; openFilesInNewWindow: boolean } {

		// let the user settings override how folders are open in a new window or same window unless we are forced
		const windowConfig = this.configurationService.getValue<IWindowSettings | undefined>('window');
		const openFolderInNewWindowConfig = windowConfig?.openFoldersInNewWindow || 'default' /* default */;
		const openFilesInNewWindowConfig = windowConfig?.openFilesInNewWindow || 'off' /* default */;

		let openFolderInNewWindow = (openConfig.preferNewWindow || openConfig.forceNewWindow) && !openConfig.forceReuseWindow;
		if (!openConfig.forceNewWindow && !openConfig.forceReuseWindow && (openFolderInNewWindowConfig === 'on' || openFolderInNewWindowConfig === 'off')) {
			openFolderInNewWindow = (openFolderInNewWindowConfig === 'on');
		}

		// let the user settings override how files are open in a new window or same window unless we are forced (not for extension development though)
		let openFilesInNewWindow: boolean = false;
		if (openConfig.forceNewWindow || openConfig.forceReuseWindow) {
			openFilesInNewWindow = !!openConfig.forceNewWindow && !openConfig.forceReuseWindow;
		} else {

			// macOS: by default we open files in a new window if this is triggered via DOCK context
			if (isMacintosh) {
				if (openConfig.context === OpenContext.DOCK) {
					openFilesInNewWindow = true;
				}
			}

			// Linux/Windows: by default we open files in the new window unless triggered via DIALOG / MENU context
			// or from the integrated terminal where we assume the user prefers to open in the current window
			else {
				if (openConfig.context !== OpenContext.DIALOG && openConfig.context !== OpenContext.MENU && !(openConfig.userEnv && openConfig.userEnv['TERM_PROGRAM'] === 'vscode')) {
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

	openExtensionDevelopmentHostWindow(extensionDevelopmentPaths: string[], openConfig: IOpenConfiguration): ICodeWindow[] {

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
			const workspaceToOpen = extensionDevelopmentWindowState && (extensionDevelopmentWindowState.workspace || extensionDevelopmentWindowState.folderUri);
			if (workspaceToOpen) {
				if (URI.isUri(workspaceToOpen)) {
					if (workspaceToOpen.scheme === Schemas.file) {
						cliArgs = [workspaceToOpen.fsPath];
					} else {
						folderUris = [workspaceToOpen.toString()];
					}
				} else {
					if (workspaceToOpen.configPath.scheme === Schemas.file) {
						cliArgs = [originalFSPath(workspaceToOpen.configPath)];
					} else {
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
					} else {
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
			if (!!findWindowOnWorkspaceOrFolder(this.getWindows(), uri)) {
				return false;
			}

			return isEqualAuthority(getRemoteAuthority(uri), remoteAuthority);
		});

		folderUris = folderUris.filter(folderUriStr => {
			const folderUri = this.cliArgToUri(folderUriStr);
			if (folderUri && !!findWindowOnWorkspaceOrFolder(this.getWindows(), folderUri)) {
				return false;
			}

			return folderUri ? isEqualAuthority(getRemoteAuthority(folderUri), remoteAuthority) : false;
		});

		fileUris = fileUris.filter(fileUriStr => {
			const fileUri = this.cliArgToUri(fileUriStr);
			if (fileUri && !!findWindowOnWorkspaceOrFolder(this.getWindows(), fileUri)) {
				return false;
			}

			return fileUri ? isEqualAuthority(getRemoteAuthority(fileUri), remoteAuthority) : false;
		});

		openConfig.cli._ = cliArgs;
		openConfig.cli['folder-uri'] = folderUris;
		openConfig.cli['file-uri'] = fileUris;

		// Open it
		const openArgs: IOpenConfiguration = {
			context: openConfig.context,
			cli: openConfig.cli,
			forceNewWindow: true,
			forceEmpty: !cliArgs.length && !folderUris.length && !fileUris.length,
			userEnv: openConfig.userEnv,
			noRecentEntry: true,
			waitMarkerFileURI: openConfig.waitMarkerFileURI,
			remoteAuthority,
			profile: openConfig.profile
		};

		return this.open(openArgs);
	}

	private openInBrowserWindow(options: IOpenBrowserWindowOptions): ICodeWindow {
		const windowConfig = this.configurationService.getValue<IWindowSettings | undefined>('window');

		// Build up the window configuration from provided options, config and environment
		const configuration: INativeWindowConfiguration = {

			// Inherit CLI arguments from environment and/or
			// the specific properties from this launch if provided
			...this.environmentMainService.args,
			...options.cli,

			machineId: this.machineId,

			windowId: -1,	// Will be filled in by the window once loaded later

			mainPid: process.pid,

			appRoot: this.environmentMainService.appRoot,
			execPath: process.execPath,
			codeCachePath: this.environmentMainService.codeCachePath,
			// If we know the backup folder upfront (for empty windows to restore), we can set it
			// directly here which helps for restoring UI state associated with that window.
			// For all other cases we first call into registerEmptyWindowBackupSync() to set it before
			// loading the window.
			backupPath: options.emptyWindowBackupInfo ? join(this.environmentMainService.backupHome, options.emptyWindowBackupInfo.backupFolder) : undefined,

			profiles: {
				all: this.userDataProfilesMainService.profiles,
				profile: this.resolveProfileForBrowserWindow(options)
			},

			homeDir: this.environmentMainService.userHome.fsPath,
			tmpDir: this.environmentMainService.tmpDir.fsPath,
			userDataDir: this.environmentMainService.userDataPath,

			remoteAuthority: options.remoteAuthority,
			workspace: options.workspace,
			userEnv: { ...this.initialUserEnv, ...options.userEnv },

			filesToOpenOrCreate: options.filesToOpen?.filesToOpenOrCreate,
			filesToDiff: options.filesToOpen?.filesToDiff,
			filesToMerge: options.filesToOpen?.filesToMerge,
			filesToWait: options.filesToOpen?.filesToWait,

			logLevel: this.logService.getLevel(),
			logsPath: this.environmentMainService.logsPath,

			product,
			isInitialStartup: options.initialStartup,
			perfMarks: getMarks(),
			os: { release: release(), hostname: hostname() },
			zoomLevel: typeof windowConfig?.zoomLevel === 'number' ? windowConfig.zoomLevel : undefined,

			autoDetectHighContrast: windowConfig?.autoDetectHighContrast ?? true,
			autoDetectColorScheme: windowConfig?.autoDetectColorScheme ?? false,
			accessibilitySupport: app.accessibilitySupportEnabled,
			colorScheme: this.themeMainService.getColorScheme(),
			policiesData: this.policyService.serialize(),
		};

		let window: ICodeWindow | undefined;
		if (!options.forceNewWindow && !options.forceNewTabbedWindow) {
			window = options.windowToUse || this.getLastActiveWindow();
			if (window) {
				window.focus();
			}
		}

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
			WindowsMainService.WINDOWS.push(createdWindow);

			// Indicate new window via event
			this._onDidOpenWindow.fire(createdWindow);

			// Indicate number change via event
			this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() - 1, newCount: this.getWindowCount() });

			// Window Events
			once(createdWindow.onDidSignalReady)(() => this._onDidSignalReadyWindow.fire(createdWindow));
			once(createdWindow.onDidClose)(() => this.onWindowClosed(createdWindow));
			once(createdWindow.onDidDestroy)(() => this._onDidDestroyWindow.fire(createdWindow));
			createdWindow.onDidTriggerSystemContextMenu(({ x, y }) => this._onDidTriggerSystemContextMenu.fire({ window: createdWindow, x, y }));

			const webContents = assertIsDefined(createdWindow.win?.webContents);
			webContents.removeAllListeners('devtools-reload-page'); // remove built in listener so we can handle this on our own
			webContents.on('devtools-reload-page', () => this.lifecycleMainService.reload(createdWindow));

			// Lifecycle
			this.lifecycleMainService.registerWindow(createdWindow);
		}

		// Existing window
		else {

			// Some configuration things get inherited if the window is being reused and we are
			// in extension development host mode. These options are all development related.
			const currentWindowConfig = window.config;
			if (!configuration.extensionDevelopmentPath && currentWindowConfig && !!currentWindowConfig.extensionDevelopmentPath) {
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
			}
		}

		// Update window identifier and session now
		// that we have the window object in hand.
		configuration.windowId = window.id;

		// If the window was already loaded, make sure to unload it
		// first and only load the new configuration if that was
		// not vetoed
		if (window.isReady) {
			this.lifecycleMainService.unload(window, UnloadReason.LOAD).then(veto => {
				if (!veto) {
					this.doOpenInBrowserWindow(window!, configuration, options);
				}
			});
		} else {
			this.doOpenInBrowserWindow(window, configuration, options);
		}

		return window;
	}

	private doOpenInBrowserWindow(window: ICodeWindow, configuration: INativeWindowConfiguration, options: IOpenBrowserWindowOptions): void {

		// Register window for backups
		if (!configuration.extensionDevelopmentPath) {
			if (isWorkspaceIdentifier(configuration.workspace)) {
				configuration.backupPath = this.backupMainService.registerWorkspaceBackup({ workspace: configuration.workspace, remoteAuthority: configuration.remoteAuthority });
			} else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
				configuration.backupPath = this.backupMainService.registerFolderBackup({ folderUri: configuration.workspace.uri, remoteAuthority: configuration.remoteAuthority });
			} else {
				const backupFolder = options.emptyWindowBackupInfo && options.emptyWindowBackupInfo.backupFolder;
				configuration.backupPath = this.backupMainService.registerEmptyWindowBackup(backupFolder, configuration.remoteAuthority);
			}
		}

		// Load it
		window.load(configuration);
	}

	private resolveProfileForBrowserWindow(options: IOpenBrowserWindowOptions): IUserDataProfile {

		// Use the provided profile if any
		let profile = options.profile;
		if (profile) {
			this.userDataProfilesMainService.setProfileForWorkspaceSync(options.workspace ?? 'empty-window', profile);
		}

		// Otherwise use associated profile
		if (!profile) {
			profile = this.userDataProfilesMainService.getOrSetProfileForWorkspace(options.workspace ?? 'empty-window', (options.windowToUse ?? this.getLastActiveWindow())?.profile ?? this.userDataProfilesMainService.defaultProfile);
		}

		return profile;
	}

	private onWindowClosed(window: ICodeWindow): void {

		// Remove from our list so that Electron can clean it up
		const index = WindowsMainService.WINDOWS.indexOf(window);
		WindowsMainService.WINDOWS.splice(index, 1);

		// Emit
		this._onDidChangeWindowsCount.fire({ oldCount: this.getWindowCount() + 1, newCount: this.getWindowCount() });
	}

	getFocusedWindow(): ICodeWindow | undefined {
		const window = BrowserWindow.getFocusedWindow();
		if (window) {
			return this.getWindowById(window.id);
		}

		return undefined;
	}

	getLastActiveWindow(): ICodeWindow | undefined {
		return this.doGetLastActiveWindow(this.getWindows());
	}

	private getLastActiveWindowForAuthority(remoteAuthority: string | undefined): ICodeWindow | undefined {
		return this.doGetLastActiveWindow(this.getWindows().filter(window => isEqualAuthority(window.remoteAuthority, remoteAuthority)));
	}

	private doGetLastActiveWindow(windows: ICodeWindow[]): ICodeWindow | undefined {
		const lastFocusedDate = Math.max.apply(Math, windows.map(window => window.lastFocusTime));

		return windows.find(window => window.lastFocusTime === lastFocusedDate);
	}

	sendToFocused(channel: string, ...args: any[]): void {
		const focusedWindow = this.getFocusedWindow() || this.getLastActiveWindow();

		focusedWindow?.sendWhenReady(channel, CancellationToken.None, ...args);
	}

	sendToAll(channel: string, payload?: any, windowIdsToIgnore?: number[]): void {
		for (const window of this.getWindows()) {
			if (windowIdsToIgnore && windowIdsToIgnore.indexOf(window.id) >= 0) {
				continue; // do not send if we are instructed to ignore it
			}

			window.sendWhenReady(channel, CancellationToken.None, payload);
		}
	}

	getWindows(): ICodeWindow[] {
		return WindowsMainService.WINDOWS;
	}

	getWindowCount(): number {
		return WindowsMainService.WINDOWS.length;
	}

	getWindowById(windowId: number): ICodeWindow | undefined {
		const windows = this.getWindows().filter(window => window.id === windowId);

		return firstOrDefault(windows);
	}

	getWindowByWebContents(webContents: WebContents): ICodeWindow | undefined {
		const browserWindow = BrowserWindow.fromWebContents(webContents);
		if (!browserWindow) {
			return undefined;
		}

		return this.getWindowById(browserWindow.id);
	}
}
