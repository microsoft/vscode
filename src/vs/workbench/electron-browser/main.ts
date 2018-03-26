/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as perf from 'vs/base/common/performance';
import { TPromise } from 'vs/base/common/winjs.base';
import { WorkbenchShell } from 'vs/workbench/electron-browser/shell';
import * as browser from 'vs/base/browser/browser';
import { domContentLoaded } from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import * as comparer from 'vs/base/common/comparers';
import * as platform from 'vs/base/common/platform';
import * as paths from 'vs/base/common/paths';
import uri from 'vs/base/common/uri';
import * as strings from 'vs/base/common/strings';
import { IWorkspaceContextService, Workspace, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configurationService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { realpath } from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import * as gracefulFs from 'graceful-fs';
import { IInitData } from 'vs/workbench/services/timer/common/timerService';
import { TimerService } from 'vs/workbench/services/timer/node/timerService';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IWindowConfiguration, IWindowsService } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/common/windowsIpc';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { StorageService, inMemoryLocalStorageInstance, IStorage } from 'vs/platform/storage/common/storageService';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { webFrame } from 'electron';
import { UpdateChannelClient } from 'vs/platform/update/common/updateIpc';
import { IUpdateService } from 'vs/platform/update/common/update';
import { URLHandlerChannel, URLServiceChannelClient } from 'vs/platform/url/common/urlIpc';
import { IURLService } from 'vs/platform/url/common/url';
import { WorkspacesChannelClient } from 'vs/platform/workspaces/common/workspacesIpc';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import * as fs from 'fs';
import { ConsoleLogService, MultiplexLogService, ILogService } from 'vs/platform/log/common/log';
import { IssueChannelClient } from 'vs/platform/issue/common/issueIpc';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/common/logIpc';
import { RelayURLService } from 'vs/platform/url/common/urlService';

gracefulFs.gracefulify(fs); // enable gracefulFs

export function startup(configuration: IWindowConfiguration): TPromise<void> {

	// Ensure others can listen to zoom level changes
	browser.setZoomFactor(webFrame.getZoomFactor());

	// See https://github.com/Microsoft/vscode/issues/26151
	// Can be trusted because we are not setting it ourselves.
	browser.setZoomLevel(webFrame.getZoomLevel(), true /* isTrusted */);

	browser.setFullscreen(!!configuration.fullscreen);

	KeyboardMapperFactory.INSTANCE._onKeyboardLayoutChanged();

	browser.setAccessibilitySupport(configuration.accessibilitySupport ? platform.AccessibilitySupport.Enabled : platform.AccessibilitySupport.Disabled);

	// Setup Intl
	comparer.setFileNameComparer(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }));

	// Open workbench
	return openWorkbench(configuration);
}

function openWorkbench(configuration: IWindowConfiguration): TPromise<void> {
	const mainProcessClient = new ElectronIPCClient(`window:${configuration.windowId}`);
	const mainServices = createMainProcessServices(mainProcessClient, configuration);

	const environmentService = new EnvironmentService(configuration, configuration.execPath);
	const logService = createLogService(mainProcessClient, configuration, environmentService);
	logService.trace('openWorkbench configuration', JSON.stringify(configuration));

	// Since the configuration service is one of the core services that is used in so many places, we initialize it
	// right before startup of the workbench shell to have its data ready for consumers
	return createAndInitializeWorkspaceService(configuration, environmentService).then(workspaceService => {
		const timerService = new TimerService((<any>window).MonacoEnvironment.timers as IInitData, workspaceService.getWorkbenchState() === WorkbenchState.EMPTY);
		const storageService = createStorageService(workspaceService, environmentService);

		return domContentLoaded().then(() => {

			// Open Shell
			perf.mark('willStartWorkbench');
			const shell = new WorkbenchShell(document.body, {
				contextService: workspaceService,
				configurationService: workspaceService,
				environmentService,
				logService,
				timerService,
				storageService
			}, mainServices, configuration);
			shell.open();

			// Inform user about loading issues from the loader
			(<any>self).require.config({
				onError: (err: any) => {
					if (err.errorCode === 'load') {
						shell.onUnexpectedError(loaderError(err));
					}
				}
			});
		});
	});
}

function createAndInitializeWorkspaceService(configuration: IWindowConfiguration, environmentService: EnvironmentService): TPromise<WorkspaceService> {
	return validateSingleFolderPath(configuration).then(() => {
		const workspaceService = new WorkspaceService(environmentService);

		return workspaceService.initialize(configuration.workspace || configuration.folderPath || configuration).then(() => workspaceService, error => workspaceService);
	});
}

function validateSingleFolderPath(configuration: IWindowConfiguration): TPromise<void> {

	// Return early if we do not have a single folder path
	if (!configuration.folderPath) {
		return TPromise.as(void 0);
	}

	// Otherwise: use realpath to resolve symbolic links to the truth
	return realpath(configuration.folderPath).then(realFolderPath => {

		// For some weird reason, node adds a trailing slash to UNC paths
		// we never ever want trailing slashes as our workspace path unless
		// someone opens root ("/").
		// See also https://github.com/nodejs/io.js/issues/1765
		if (paths.isUNC(realFolderPath) && strings.endsWith(realFolderPath, paths.nativeSep)) {
			realFolderPath = strings.rtrim(realFolderPath, paths.nativeSep);
		}

		return realFolderPath;
	}, error => {
		if (configuration.verbose) {
			errors.onUnexpectedError(error);
		}

		// Treat any error case as empty workbench case (no folder path)
		return null;

	}).then(realFolderPathOrNull => {

		// Update config with real path if we have one
		configuration.folderPath = realFolderPathOrNull;
	});
}

function createStorageService(workspaceService: IWorkspaceContextService, environmentService: IEnvironmentService): IStorageService {
	let workspaceId: string;
	let secondaryWorkspaceId: number;

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
			secondaryWorkspaceId = workspace.ctime;
			break;

		// finaly, if we do not have a workspace open, we need to find another identifier for the window to store
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

	let storage: IStorage;
	if (disableStorage) {
		storage = inMemoryLocalStorageInstance;
	} else {
		// TODO@Ben remove me after a while
		perf.mark('willAccessLocalStorage');
		storage = window.localStorage;
		perf.mark('didAccessLocalStorage');
	}

	return new StorageService(storage, storage, workspaceId, secondaryWorkspaceId);
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
	serviceCollection.set(IUpdateService, new SyncDescriptor(UpdateChannelClient, updateChannel));

	const urlChannel = mainProcessClient.getChannel('url');
	const mainUrlService = new URLServiceChannelClient(urlChannel);
	const urlService = new RelayURLService(mainUrlService);
	serviceCollection.set(IURLService, urlService);

	const urlHandlerChannel = new URLHandlerChannel(urlService);
	mainProcessClient.registerChannel('urlHandler', urlHandlerChannel);

	const issueChannel = mainProcessClient.getChannel('issue');
	serviceCollection.set(IIssueService, new SyncDescriptor(IssueChannelClient, issueChannel));

	const workspacesChannel = mainProcessClient.getChannel('workspaces');
	serviceCollection.set(IWorkspacesService, new WorkspacesChannelClient(workspacesChannel));

	return serviceCollection;
}

function loaderError(err: Error): Error {
	if (platform.isWeb) {
		return new Error(nls.localize('loaderError', "Failed to load a required file. Either you are no longer connected to the internet or the server you are connected to is offline. Please refresh the browser to try again."));
	}

	return new Error(nls.localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err)));
}
