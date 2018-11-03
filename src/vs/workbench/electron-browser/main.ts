/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as perf from 'vs/base/common/performance';
import { WorkbenchShell } from 'vs/workbench/electron-browser/shell';
import * as browser from 'vs/base/browser/browser';
import { domContentLoaded } from 'vs/base/browser/dom';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as comparer from 'vs/base/common/comparers';
import * as platform from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { IWorkspaceContextService, Workspace, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkspaceService, ISingleFolderWorkspaceInitializationPayload, IMultiFolderWorkspaceInitializationPayload, IEmptyWorkspaceInitializationPayload, IWorkspaceInitializationPayload, isSingleFolderWorkspaceInitializationPayload } from 'vs/workbench/services/configuration/node/configurationService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { stat, exists, writeFile, readdir } from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import * as gracefulFs from 'graceful-fs';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IWindowConfiguration, IWindowsService } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/node/windowsIpc';
import { IStorageLegacyService, StorageLegacyService, inMemoryLocalStorageInstance, IStorageLegacy } from 'vs/platform/storage/common/storageLegacyService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { webFrame } from 'electron';
import { UpdateChannelClient } from 'vs/platform/update/node/updateIpc';
import { IUpdateService } from 'vs/platform/update/common/update';
import { URLHandlerChannel, URLServiceChannelClient } from 'vs/platform/url/node/urlIpc';
import { IURLService } from 'vs/platform/url/common/url';
import { WorkspacesChannelClient } from 'vs/platform/workspaces/node/workspacesIpc';
import { IWorkspacesService, ISingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import * as fs from 'fs';
import { ConsoleLogService, MultiplexLogService, ILogService } from 'vs/platform/log/common/log';
import { StorageService, DelegatingStorageService } from 'vs/platform/storage/node/storageService';
import { IssueChannelClient } from 'vs/platform/issue/node/issueIpc';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/node/logIpc';
import { RelayURLService } from 'vs/platform/url/common/urlService';
import { MenubarChannelClient } from 'vs/platform/menubar/node/menubarIpc';
import { IMenubarService } from 'vs/platform/menubar/common/menubar';
import { Schemas } from 'vs/base/common/network';
import { sanitizeFilePath, mkdirp } from 'vs/base/node/extfs';
import { basename, join } from 'path';
import { createHash } from 'crypto';
import { parseStorage, StorageObject } from 'vs/platform/storage/common/storageLegacyMigration';
import { StorageScope } from 'vs/platform/storage/common/storage';
import { endsWith } from 'vs/base/common/strings';
import { IdleValue } from 'vs/base/common/async';

gracefulFs.gracefulify(fs); // enable gracefulFs

export function startup(configuration: IWindowConfiguration): Promise<void> {

	// Massage configuration file URIs
	revive(configuration);

	// Setup perf
	perf.importEntries(configuration.perfEntries);

	// Browser config
	browser.setZoomFactor(webFrame.getZoomFactor()); // Ensure others can listen to zoom level changes
	browser.setZoomLevel(webFrame.getZoomLevel(), true /* isTrusted */); // Can be trusted because we are not setting it ourselves (https://github.com/Microsoft/vscode/issues/26151)
	browser.setFullscreen(!!configuration.fullscreen);
	browser.setAccessibilitySupport(configuration.accessibilitySupport ? platform.AccessibilitySupport.Enabled : platform.AccessibilitySupport.Disabled);

	// Keyboard support
	KeyboardMapperFactory.INSTANCE._onKeyboardLayoutChanged();

	// Setup Intl for comparers
	comparer.setFileNameComparer(new IdleValue(() => {
		const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
		return {
			collator: collator,
			collatorIsNumeric: collator.resolvedOptions().numeric
		};
	}));

	// Open workbench
	return openWorkbench(configuration);
}

function revive(workbench: IWindowConfiguration) {
	if (workbench.folderUri) {
		workbench.folderUri = uri.revive(workbench.folderUri);
	}

	const filesToWaitPaths = workbench.filesToWait && workbench.filesToWait.paths;
	[filesToWaitPaths, workbench.filesToOpen, workbench.filesToCreate, workbench.filesToDiff].forEach(paths => {
		if (Array.isArray(paths)) {
			paths.forEach(path => {
				if (path.fileUri) {
					path.fileUri = uri.revive(path.fileUri);
				}
			});
		}
	});
}

function openWorkbench(configuration: IWindowConfiguration): Promise<void> {
	const mainProcessClient = new ElectronIPCClient(`window:${configuration.windowId}`);
	const mainServices = createMainProcessServices(mainProcessClient, configuration);

	const environmentService = new EnvironmentService(configuration, configuration.execPath);

	const logService = createLogService(mainProcessClient, configuration, environmentService);
	logService.trace('openWorkbench configuration', JSON.stringify(configuration));

	// Resolve a workspace payload that we can get the workspace ID from
	return createWorkspaceInitializationPayload(configuration, environmentService).then(payload => {

		return Promise.all([

			// Create and initialize workspace/configuration service
			createWorkspaceService(payload, environmentService, logService),

			// Create and initialize storage service
			createStorageService(payload, environmentService, logService)
		]).then(services => {
			const workspaceService = services[0];
			const storageService = new DelegatingStorageService(services[1], createStorageLegacyService(workspaceService, environmentService), logService, workspaceService);

			return domContentLoaded().then(() => {
				perf.mark('willStartWorkbench');

				// Create Shell
				const shell = new WorkbenchShell(document.body, {
					contextService: workspaceService,
					configurationService: workspaceService,
					environmentService,
					logService,
					storageService
				}, mainServices, mainProcessClient, configuration);

				// Store meta file in workspace storage after workbench is running
				shell.onRunning(() => {
					ensureWorkspaceStorageFolderMeta(payload, workspaceService, environmentService);
				});

				// Gracefully Shutdown Storage
				shell.onShutdown(event => {
					event.join(storageService.close());
				});

				// Open Shell
				shell.open();

				// Inform user about loading issues from the loader
				(<any>self).require.config({
					onError: err => {
						if (err.errorCode === 'load') {
							shell.onUnexpectedError(new Error(nls.localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err))));
						}
					}
				});
			});
		});
	});
}

function createWorkspaceInitializationPayload(configuration: IWindowConfiguration, environmentService: EnvironmentService): Promise<IWorkspaceInitializationPayload> {

	// Multi-root workspace
	if (configuration.workspace) {
		return Promise.resolve(configuration.workspace as IMultiFolderWorkspaceInitializationPayload);
	}

	// Single-folder workspace
	let workspaceInitializationPayload: Promise<IWorkspaceInitializationPayload> = Promise.resolve(void 0);
	if (configuration.folderUri) {
		workspaceInitializationPayload = resolveSingleFolderWorkspaceInitializationPayload(configuration.folderUri);
	}

	return workspaceInitializationPayload.then(payload => {

		// Fallback to empty workspace if we have no payload yet.
		if (!payload) {
			let id: string;
			if (configuration.backupPath) {
				id = basename(configuration.backupPath); // we know the backupPath must be a unique path so we leverage its name as workspace ID
			} else if (environmentService.isExtensionDevelopment) {
				id = 'ext-dev'; // extension development window never stores backups and is a singleton
			} else {
				return Promise.reject(new Error('Unexpected window configuration without backupPath'));
			}

			payload = { id } as IEmptyWorkspaceInitializationPayload;
		}

		return payload;
	});
}

function resolveSingleFolderWorkspaceInitializationPayload(folderUri: ISingleFolderWorkspaceIdentifier): Promise<ISingleFolderWorkspaceInitializationPayload> {

	// Return early the folder is not local
	if (folderUri.scheme !== Schemas.file) {
		return Promise.resolve({ id: createHash('md5').update(folderUri.toString()).digest('hex'), folder: folderUri });
	}

	function computeLocalDiskFolderId(folder: uri, stat: fs.Stats): string {
		let ctime: number;
		if (platform.isLinux) {
			ctime = stat.ino; // Linux: birthtime is ctime, so we cannot use it! We use the ino instead!
		} else if (platform.isMacintosh) {
			ctime = stat.birthtime.getTime(); // macOS: birthtime is fine to use as is
		} else if (platform.isWindows) {
			if (typeof stat.birthtimeMs === 'number') {
				ctime = Math.floor(stat.birthtimeMs); // Windows: fix precision issue in node.js 8.x to get 7.x results (see https://github.com/nodejs/node/issues/19897)
			} else {
				ctime = stat.birthtime.getTime();
			}
		}

		// we use the ctime as extra salt to the ID so that we catch the case of a folder getting
		// deleted and recreated. in that case we do not want to carry over previous state
		return createHash('md5').update(folder.fsPath).update(ctime ? String(ctime) : '').digest('hex');
	}

	// For local: ensure path is absolute and exists
	const sanitizedFolderPath = sanitizeFilePath(folderUri.fsPath, process.env['VSCODE_CWD'] || process.cwd());
	return stat(sanitizedFolderPath).then(stat => {
		const sanitizedFolderUri = uri.file(sanitizedFolderPath);
		return {
			id: computeLocalDiskFolderId(sanitizedFolderUri, stat),
			folder: sanitizedFolderUri
		} as ISingleFolderWorkspaceInitializationPayload;
	}, error => onUnexpectedError(error));
}

function getWorkspaceStoragePath(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService): string {
	return join(environmentService.workspaceStorageHome, payload.id); // workspace home + workspace id;
}

function prepareWorkspaceStorageFolder(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService): Thenable<string> {
	const workspaceStoragePath = getWorkspaceStoragePath(payload, environmentService);

	return exists(workspaceStoragePath).then(exists => {
		if (exists) {
			return workspaceStoragePath;
		}

		return mkdirp(workspaceStoragePath).then(() => workspaceStoragePath);
	});
}

function ensureWorkspaceStorageFolderMeta(payload: IWorkspaceInitializationPayload, workspaceService: IWorkspaceContextService, environmentService: IEnvironmentService): void {
	const state = workspaceService.getWorkbenchState();
	if (state === WorkbenchState.EMPTY) {
		return; // no storage meta for empty workspaces
	}

	const workspaceStorageMetaPath = join(getWorkspaceStoragePath(payload, environmentService), 'workspace.json');

	exists(workspaceStorageMetaPath).then(exists => {
		if (exists) {
			return void 0; // already existing
		}

		const workspace = workspaceService.getWorkspace();

		return writeFile(workspaceStorageMetaPath, JSON.stringify({
			configuration: workspace.configuration ? uri.revive(workspace.configuration).toString() : void 0,
			folder: state === WorkbenchState.FOLDER ? uri.revive(workspace.folders[0].uri).toString() : void 0
		}, undefined, 2));
	}).then(null, error => onUnexpectedError(error));
}

function createWorkspaceService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService): Promise<WorkspaceService> {
	const workspaceService = new WorkspaceService(environmentService);

	return workspaceService.initialize(payload).then(() => workspaceService, error => {
		onUnexpectedError(error);
		logService.error(error);

		return workspaceService;
	});
}

function createStorageService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService): Thenable<StorageService> {

	// Prepare the workspace storage folder
	return prepareWorkspaceStorageFolder(payload, environmentService).then(workspaceStorageFolder => {

		// Return early if we are using in-memory storage
		const useInMemoryStorage = !!environmentService.extensionTestsPath; /* never keep any state when running extension tests */
		if (useInMemoryStorage) {
			const storageService = new StorageService(StorageService.IN_MEMORY_PATH, true, logService, environmentService);

			return storageService.init().then(() => storageService);
		}

		// Otherwise do a migration of previous workspace data if the DB does not exist yet
		// TODO@Ben remove me after one milestone
		const workspaceStorageDBPath = join(workspaceStorageFolder, 'storage.db');
		perf.mark('willCheckWorkspaceStorageExists');
		return exists(workspaceStorageDBPath).then(exists => {
			perf.mark('didCheckWorkspaceStorageExists');

			const storageService = new StorageService(workspaceStorageDBPath, true, logService, environmentService);

			return storageService.init().then(() => {
				if (exists) {
					return storageService; // return early if DB was already there
				}

				perf.mark('willMigrateWorkspaceStorageKeys');
				return readdir(environmentService.extensionsPath).then(extensions => {

					// Otherwise, we migrate data from window.localStorage over
					try {
						const parsedStorage = parseStorage(window.localStorage);

						let workspaceItems: StorageObject;
						if (isWorkspaceIdentifier(payload)) {
							workspaceItems = parsedStorage.multiRoot.get(`root:${payload.id}`);
						} else if (isSingleFolderWorkspaceInitializationPayload(payload)) {
							workspaceItems = parsedStorage.folder.get(payload.folder.toString());
						} else {
							if (payload.id === 'ext-dev') {
								workspaceItems = parsedStorage.noWorkspace;
							} else {
								workspaceItems = parsedStorage.empty.get(`empty:${payload.id}`);
							}
						}

						const supportedKeys = new Map<string, string>();
						[
							'workbench.search.history',
							'history.entries',
							'ignoreNetVersionError',
							'ignoreEnospcError',
							'extensionUrlHandler.urlToHandle',
							'terminal.integrated.isWorkspaceShellAllowed',
							'workbench.tasks.ignoreTask010Shown',
							'workbench.tasks.recentlyUsedTasks',
							'workspaces.dontPromptToOpen',
							'output.activechannel',
							'outline/state',
							'extensionsAssistant/workspaceRecommendationsIgnore',
							'extensionsAssistant/dynamicWorkspaceRecommendations',
							'debug.repl.history',
							'editor.matchCase',
							'editor.wholeWord',
							'editor.isRegex',
							'lifecyle.lastShutdownReason',
							'debug.selectedroot',
							'debug.selectedconfigname',
							'debug.breakpoint',
							'debug.breakpointactivated',
							'debug.functionbreakpoint',
							'debug.exceptionbreakpoint',
							'debug.watchexpressions',
							'workbench.sidebar.activeviewletid',
							'workbench.panelpart.activepanelid',
							'workbench.zenmode.active',
							'workbench.centerededitorlayout.active',
							'workbench.sidebar.restore',
							'workbench.sidebar.hidden',
							'workbench.panel.hidden',
							'workbench.panel.location',
							'extensionsIdentifiers/disabled',
							'extensionsIdentifiers/enabled',
							'scm.views',
							'suggest/memories/first',
							'suggest/memories/recentlyUsed',
							'suggest/memories/recentlyUsedByPrefix',
							'workbench.view.explorer.numberOfVisibleViews',
							'workbench.view.extensions.numberOfVisibleViews',
							'workbench.view.debug.numberOfVisibleViews',
							'workbench.explorer.views.state',
							'workbench.view.extensions.state',
							'workbench.view.debug.state',
							'memento/workbench.editor.walkThroughPart',
							'memento/workbench.editor.settings2',
							'memento/workbench.editor.htmlPreviewPart',
							'memento/workbench.editor.defaultPreferences',
							'memento/workbench.editors.files.textFileEditor',
							'memento/workbench.editors.logViewer',
							'memento/workbench.editors.textResourceEditor',
							'memento/workbench.panel.output'
						].forEach(key => supportedKeys.set(key.toLowerCase(), key));

						// Support extension storage as well (always the ID of the extension)
						extensions.forEach(extension => {
							let extensionId: string;
							if (extension.indexOf('-') >= 0) {
								extensionId = extension.substring(0, extension.lastIndexOf('-')); // convert "author.extension-0.2.5" => "author.extension"
							} else {
								extensionId = extension;
							}

							if (extensionId) {
								supportedKeys.set(extensionId.toLowerCase(), extensionId);
							}
						});

						if (workspaceItems) {
							Object.keys(workspaceItems).forEach(key => {
								const value = workspaceItems[key];

								// first check for a well known supported key and store with realcase value
								const supportedKey = supportedKeys.get(key);
								if (supportedKey) {
									storageService.store(supportedKey, value, StorageScope.WORKSPACE);
								}

								// fix lowercased ".numberOfVisibleViews"
								else if (endsWith(key, '.numberOfVisibleViews'.toLowerCase())) {
									const normalizedKey = key.substring(0, key.length - '.numberOfVisibleViews'.length) + '.numberOfVisibleViews';
									storageService.store(normalizedKey, value, StorageScope.WORKSPACE);
								}

								// support dynamic keys
								else if (key.indexOf('memento/') === 0 || key.indexOf('viewservice.') === 0 || endsWith(key, '.state')) {
									storageService.store(key, value, StorageScope.WORKSPACE);
								}
							});
						}
					} catch (error) {
						onUnexpectedError(error);
						logService.error(error);
					}

					perf.mark('didMigrateWorkspaceStorageKeys');

					return storageService;
				});
			});
		});
	});
}

function createStorageLegacyService(workspaceService: IWorkspaceContextService, environmentService: IEnvironmentService): IStorageLegacyService {
	let workspaceId: string;

	switch (workspaceService.getWorkbenchState()) {

		// in multi root workspace mode we use the provided ID as key for workspace storage
		case WorkbenchState.WORKSPACE:
			workspaceId = uri.from({ path: workspaceService.getWorkspace().id, scheme: 'root' }).toString();
			break;

		// in single folder mode we use the path of the opened folder as key for workspace storage
		// the ctime is used as secondary workspace id to clean up stale UI state if necessary
		case WorkbenchState.FOLDER:
			const workspace: Workspace = <Workspace>workspaceService.getWorkspace();
			workspaceId = workspace.folders[0].uri.toString();
			break;

		// finally, if we do not have a workspace open, we need to find another identifier for the window to store
		// workspace UI state. if we have a backup path in the configuration we can use that because this
		// will be a unique identifier per window that is stable between restarts as long as there are
		// dirty files in the workspace.
		// We use basename() to produce a short identifier, we do not need the full path. We use a custom
		// scheme so that we can later distinguish these identifiers from the workspace one.
		case WorkbenchState.EMPTY:
			workspaceId = workspaceService.getWorkspace().id;
			break;
	}

	const disableStorage = !!environmentService.extensionTestsPath; // never keep any state when running extension tests!

	let storage: IStorageLegacy;
	if (disableStorage) {
		storage = inMemoryLocalStorageInstance;
	} else {
		storage = window.localStorage;
	}

	return new StorageLegacyService(storage, storage, workspaceId);
}

function createLogService(mainProcessClient: ElectronIPCClient, configuration: IWindowConfiguration, environmentService: IEnvironmentService): ILogService {
	const spdlogService = createSpdLogService(`renderer${configuration.windowId}`, configuration.logLevel, environmentService.logsPath);
	const consoleLogService = new ConsoleLogService(configuration.logLevel);
	const logService = new MultiplexLogService([consoleLogService, spdlogService]);
	const logLevelClient = new LogLevelSetterChannelClient(mainProcessClient.getChannel('loglevel'));

	return new FollowerLogService(logLevelClient, logService);
}

function createMainProcessServices(mainProcessClient: ElectronIPCClient, configuration: IWindowConfiguration): ServiceCollection {
	const serviceCollection = new ServiceCollection();

	const windowsChannel = mainProcessClient.getChannel('windows');
	serviceCollection.set(IWindowsService, new WindowsChannelClient(windowsChannel));

	const updateChannel = mainProcessClient.getChannel('update');
	serviceCollection.set(IUpdateService, new SyncDescriptor(UpdateChannelClient, [updateChannel]));

	const urlChannel = mainProcessClient.getChannel('url');
	const mainUrlService = new URLServiceChannelClient(urlChannel);
	const urlService = new RelayURLService(mainUrlService);
	serviceCollection.set(IURLService, urlService);

	const urlHandlerChannel = new URLHandlerChannel(urlService);
	mainProcessClient.registerChannel('urlHandler', urlHandlerChannel);

	const issueChannel = mainProcessClient.getChannel('issue');
	serviceCollection.set(IIssueService, new SyncDescriptor(IssueChannelClient, [issueChannel]));

	const menubarChannel = mainProcessClient.getChannel('menubar');
	serviceCollection.set(IMenubarService, new SyncDescriptor(MenubarChannelClient, [menubarChannel]));

	const workspacesChannel = mainProcessClient.getChannel('workspaces');
	serviceCollection.set(IWorkspacesService, new WorkspacesChannelClient(workspacesChannel));

	return serviceCollection;
}
