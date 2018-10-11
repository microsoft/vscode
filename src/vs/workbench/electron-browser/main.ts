/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as perf from 'vs/base/common/performance';
import { WorkbenchShell } from 'vs/workbench/electron-browser/shell';
import * as browser from 'vs/base/browser/browser';
import { domContentLoaded } from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import * as comparer from 'vs/base/common/comparers';
import * as platform from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { IWorkspaceContextService, Workspace, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configurationService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { stat } from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import * as gracefulFs from 'graceful-fs';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IWindowConfiguration, IWindowsService } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/node/windowsIpc';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { StorageService, inMemoryLocalStorageInstance, IStorage } from 'vs/platform/storage/common/storageService';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { webFrame } from 'electron';
import { UpdateChannelClient } from 'vs/platform/update/node/updateIpc';
import { IUpdateService } from 'vs/platform/update/common/update';
import { URLHandlerChannel, URLServiceChannelClient } from 'vs/platform/url/node/urlIpc';
import { IURLService } from 'vs/platform/url/common/url';
import { WorkspacesChannelClient } from 'vs/platform/workspaces/node/workspacesIpc';
import { IWorkspacesService, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import * as fs from 'fs';
import { ConsoleLogService, MultiplexLogService, ILogService } from 'vs/platform/log/common/log';
import { NextStorage2Service, NextDelegatingStorageService } from 'vs/platform/storage2/node/nextStorage2Service';
import { IssueChannelClient } from 'vs/platform/issue/node/issueIpc';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/node/logIpc';
import { RelayURLService } from 'vs/platform/url/common/urlService';
import { MenubarChannelClient } from 'vs/platform/menubar/node/menubarIpc';
import { IMenubarService } from 'vs/platform/menubar/common/menubar';
import { Schemas } from 'vs/base/common/network';
import { sanitizeFilePath } from 'vs/base/node/extfs';

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
	comparer.setFileNameComparer(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }));

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

	return Promise.all([
		createAndInitializeWorkspaceService(configuration, environmentService),
		createNextStorage2Service(environmentService, logService)
	]).then(services => {
		const workspaceService = services[0];
		const storageService = createStorageService(workspaceService, environmentService);
		const nextStorage2Service = new NextDelegatingStorageService(services[1], storageService, logService, environmentService);

		return domContentLoaded().then(() => {
			perf.mark('willStartWorkbench');

			// Create Shell
			const shell = new WorkbenchShell(document.body, {
				contextService: workspaceService,
				configurationService: workspaceService,
				environmentService,
				logService,
				storageService,
				nextStorage2Service
			}, mainServices, mainProcessClient, configuration);

			// Gracefully Shutdown Storage
			shell.onShutdown(event => {
				event.join(nextStorage2Service.close());
			});

			// Open Shell
			shell.open();

			// Inform user about loading issues from the loader
			(<any>self).require.config({
				onError: (err: any) => {
					if (err.errorCode === 'load') {
						shell.onUnexpectedError(new Error(nls.localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err))));
					}
				}
			});
		});
	});
}

function createAndInitializeWorkspaceService(configuration: IWindowConfiguration, environmentService: EnvironmentService): Promise<WorkspaceService> {
	return validateFolderUri(configuration.folderUri, configuration.verbose).then(validatedFolderUri => {
		const workspaceService = new WorkspaceService(environmentService);

		return workspaceService.initialize(configuration.workspace || validatedFolderUri || configuration).then(() => workspaceService, error => workspaceService);
	});
}

function validateFolderUri(folderUri: ISingleFolderWorkspaceIdentifier, verbose: boolean): Promise<uri> {

	// Return early if we do not have a single folder uri or if it is a non file uri
	if (!folderUri || folderUri.scheme !== Schemas.file) {
		return Promise.resolve(folderUri);
	}

	// Ensure absolute existing folder path
	const sanitizedFolderPath = sanitizeFilePath(folderUri.fsPath, process.env['VSCODE_CWD'] || process.cwd());
	return stat(sanitizedFolderPath).then(stat => uri.file(sanitizedFolderPath), error => {
		if (verbose) {
			errors.onUnexpectedError(error);
		}

		// Treat any error case as empty workbench case (no folder path)
		return null;
	});
}

function createNextStorage2Service(environmentService: IEnvironmentService, logService: ILogService): Promise<NextStorage2Service> {
	perf.mark('willCreateNextStorage2Service');

	const nextStorage2Service = new NextStorage2Service(':memory:', logService, environmentService);

	return nextStorage2Service.init().then(() => {
		perf.mark('didCreateNextStorage2Service');

		return nextStorage2Service;
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
		storage = window.localStorage;
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

	const menubarChannel = mainProcessClient.getChannel('menubar');
	serviceCollection.set(IMenubarService, new SyncDescriptor(MenubarChannelClient, menubarChannel));

	const workspacesChannel = mainProcessClient.getChannel('workspaces');
	serviceCollection.set(IWorkspacesService, new WorkspacesChannelClient(workspacesChannel));

	return serviceCollection;
}