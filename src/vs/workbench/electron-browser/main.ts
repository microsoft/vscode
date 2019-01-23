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
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configurationService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { stat } from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import * as gracefulFs from 'graceful-fs';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IWindowConfiguration, IWindowsService } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/node/windowsIpc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { webFrame } from 'electron';
import { UpdateChannelClient } from 'vs/platform/update/node/updateIpc';
import { IUpdateService } from 'vs/platform/update/common/update';
import { URLHandlerChannel, URLServiceChannelClient } from 'vs/platform/url/node/urlIpc';
import { IURLService } from 'vs/platform/url/common/url';
import { WorkspacesChannelClient } from 'vs/platform/workspaces/node/workspacesIpc';
import { IWorkspacesService, ISingleFolderWorkspaceIdentifier, IWorkspaceInitializationPayload, IMultiFolderWorkspaceInitializationPayload, IEmptyWorkspaceInitializationPayload, ISingleFolderWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import * as fs from 'fs';
import { ConsoleLogService, MultiplexLogService, ILogService } from 'vs/platform/log/common/log';
import { StorageService } from 'vs/platform/storage/node/storageService';
import { IssueChannelClient } from 'vs/platform/issue/node/issueIpc';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/node/logIpc';
import { RelayURLService } from 'vs/platform/url/common/urlService';
import { MenubarChannelClient } from 'vs/platform/menubar/node/menubarIpc';
import { IMenubarService } from 'vs/platform/menubar/common/menubar';
import { Schemas } from 'vs/base/common/network';
import { sanitizeFilePath } from 'vs/base/node/extfs';
import { basename } from 'path';
import { createHash } from 'crypto';
import { IdleValue } from 'vs/base/common/async';
import { setGlobalLeakWarningThreshold } from 'vs/base/common/event';
import { GlobalStorageDatabaseChannelClient } from 'vs/platform/storage/node/storageIpc';

gracefulFs.gracefulify(fs); // enable gracefulFs

export function startup(configuration: IWindowConfiguration): Promise<void> {

	// Massage configuration file URIs
	revive(configuration);

	// Setup perf
	perf.importEntries(configuration.perfEntries);

	// Configure emitter leak warning threshold
	setGlobalLeakWarningThreshold(175);

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
	const mainServices = createMainProcessServices(mainProcessClient);

	const environmentService = new EnvironmentService(configuration, configuration.execPath);

	const logService = createLogService(mainProcessClient, configuration, environmentService);
	logService.trace('openWorkbench configuration', JSON.stringify(configuration));

	// Resolve a workspace payload that we can get the workspace ID from
	return createWorkspaceInitializationPayload(configuration, environmentService).then(payload => {

		return Promise.all([

			// Create and initialize workspace/configuration service
			createWorkspaceService(payload, environmentService, logService),

			// Create and initialize storage service
			createStorageService(payload, environmentService, logService, mainProcessClient)
		]).then(services => {
			const workspaceService = services[0];
			const storageService = services[1];

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

				// Gracefully Shutdown Storage
				shell.onWillShutdown(event => {
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
	let workspaceInitializationPayload: Promise<IWorkspaceInitializationPayload> = Promise.resolve();
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

function createWorkspaceService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService): Promise<WorkspaceService> {
	const workspaceService = new WorkspaceService(environmentService);

	return workspaceService.initialize(payload).then(() => workspaceService, error => {
		onUnexpectedError(error);
		logService.error(error);

		return workspaceService;
	});
}

function createStorageService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService, mainProcessClient: ElectronIPCClient): Promise<StorageService> {
	const globalStorageDatabase = new GlobalStorageDatabaseChannelClient(mainProcessClient.getChannel('storage'));
	const storageService = new StorageService(globalStorageDatabase, logService, environmentService);

	return storageService.initialize(payload).then(() => storageService, error => {
		onUnexpectedError(error);
		logService.error(error);

		return storageService;
	});
}

function createLogService(mainProcessClient: ElectronIPCClient, configuration: IWindowConfiguration, environmentService: IEnvironmentService): ILogService {
	const spdlogService = createSpdLogService(`renderer${configuration.windowId}`, configuration.logLevel, environmentService.logsPath);
	const consoleLogService = new ConsoleLogService(configuration.logLevel);
	const logService = new MultiplexLogService([consoleLogService, spdlogService]);
	const logLevelClient = new LogLevelSetterChannelClient(mainProcessClient.getChannel('loglevel'));

	return new FollowerLogService(logLevelClient, logService);
}

function createMainProcessServices(mainProcessClient: ElectronIPCClient): ServiceCollection {
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
