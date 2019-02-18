/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as perf from 'vs/base/common/performance';
import { Workbench } from 'vs/workbench/electron-browser/workbench';
import { ElectronWindow } from 'vs/workbench/electron-browser/window';
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
import { IWorkspacesService, ISingleFolderWorkspaceIdentifier, IWorkspaceInitializationPayload, IMultiFolderWorkspaceInitializationPayload, IEmptyWorkspaceInitializationPayload, ISingleFolderWorkspaceInitializationPayload, reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
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
import { basename } from 'vs/base/common/path';
import { createHash } from 'crypto';
import { IdleValue } from 'vs/base/common/async';
import { setGlobalLeakWarningThreshold } from 'vs/base/common/event';
import { GlobalStorageDatabaseChannelClient } from 'vs/platform/storage/node/storageIpc';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { Disposable } from 'vs/base/common/lifecycle';

export class CodeWindow extends Disposable {

	constructor(private readonly configuration: IWindowConfiguration) {
		super();

		this.init();
	}

	private init(): void {

		// Enable gracefulFs
		gracefulFs.gracefulify(fs);

		// Massage configuration file URIs
		this.reviveUris();

		// Setup perf
		perf.importEntries(this.configuration.perfEntries);

		// Configure emitter leak warning threshold
		setGlobalLeakWarningThreshold(175);

		// Browser config
		browser.setZoomFactor(webFrame.getZoomFactor()); // Ensure others can listen to zoom level changes
		browser.setZoomLevel(webFrame.getZoomLevel(), true /* isTrusted */); // Can be trusted because we are not setting it ourselves (https://github.com/Microsoft/vscode/issues/26151)
		browser.setFullscreen(!!this.configuration.fullscreen);
		browser.setAccessibilitySupport(this.configuration.accessibilitySupport ? platform.AccessibilitySupport.Enabled : platform.AccessibilitySupport.Disabled);

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
	}

	private reviveUris() {
		if (this.configuration.folderUri) {
			this.configuration.folderUri = uri.revive(this.configuration.folderUri);
		}
		if (this.configuration.workspace) {
			this.configuration.workspace = reviveWorkspaceIdentifier(this.configuration.workspace);
		}

		const filesToWaitPaths = this.configuration.filesToWait && this.configuration.filesToWait.paths;
		[filesToWaitPaths, this.configuration.filesToOpen, this.configuration.filesToCreate, this.configuration.filesToDiff].forEach(paths => {
			if (Array.isArray(paths)) {
				paths.forEach(path => {
					if (path.fileUri) {
						path.fileUri = uri.revive(path.fileUri);
					}
				});
			}
		});
	}

	open(): Promise<void> {
		const mainProcessClient = this._register(new ElectronIPCClient(`window:${this.configuration.windowId}`));

		return this.initServices(mainProcessClient).then(services => {

			return domContentLoaded().then(() => {
				perf.mark('willStartWorkbench');

				const instantiationService = new InstantiationService(services, true);

				// Create Workbench
				const workbench: Workbench = instantiationService.createInstance(
					Workbench,
					document.body,
					this.configuration,
					services,
					mainProcessClient
				);

				// Workbench Lifecycle
				this._register(workbench.onShutdown(() => this.dispose()));
				this._register(workbench.onWillShutdown(event => event.join((services.get(IStorageService) as StorageService).close())));

				// Startup
				workbench.startup();

				// Window
				this._register(instantiationService.createInstance(ElectronWindow));

				// Inform user about loading issues from the loader
				(<any>self).require.config({
					onError: err => {
						if (err.errorCode === 'load') {
							onUnexpectedError(new Error(nls.localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err))));
						}
					}
				});
			});
		});
	}

	private initServices(mainProcessClient: ElectronIPCClient): Promise<ServiceCollection> {
		const serviceCollection = new ServiceCollection();

		// Windows Channel
		const windowsChannel = mainProcessClient.getChannel('windows');
		serviceCollection.set(IWindowsService, new WindowsChannelClient(windowsChannel));

		// Update Channel
		const updateChannel = mainProcessClient.getChannel('update');
		serviceCollection.set(IUpdateService, new SyncDescriptor(UpdateChannelClient, [updateChannel]));

		// URL Channel
		const urlChannel = mainProcessClient.getChannel('url');
		const mainUrlService = new URLServiceChannelClient(urlChannel);
		const urlService = new RelayURLService(mainUrlService);
		serviceCollection.set(IURLService, urlService);

		// URLHandler Channel
		const urlHandlerChannel = new URLHandlerChannel(urlService);
		mainProcessClient.registerChannel('urlHandler', urlHandlerChannel);

		// Issue Channel
		const issueChannel = mainProcessClient.getChannel('issue');
		serviceCollection.set(IIssueService, new SyncDescriptor(IssueChannelClient, [issueChannel]));

		// Menubar Channel
		const menubarChannel = mainProcessClient.getChannel('menubar');
		serviceCollection.set(IMenubarService, new SyncDescriptor(MenubarChannelClient, [menubarChannel]));

		// Workspaces Channel
		const workspacesChannel = mainProcessClient.getChannel('workspaces');
		serviceCollection.set(IWorkspacesService, new WorkspacesChannelClient(workspacesChannel));

		// Environment
		const environmentService = new EnvironmentService(this.configuration, this.configuration.execPath);
		serviceCollection.set(IEnvironmentService, environmentService);

		// Log
		const logService = this._register(this.createLogService(mainProcessClient, environmentService));
		serviceCollection.set(ILogService, logService);

		// Resolve a workspace payload that we can get the workspace ID from
		return this.resolveWorkspaceInitializationPayload(environmentService).then(payload => {

			return Promise.all([

				// Create and initialize workspace/configuration service
				this.createWorkspaceService(payload, environmentService, logService),

				// Create and initialize storage service
				this.createStorageService(payload, environmentService, logService, mainProcessClient)
			]).then(services => {
				serviceCollection.set(IWorkspaceContextService, services[0]);
				serviceCollection.set(IConfigurationService, services[0]);
				serviceCollection.set(IStorageService, services[1]);

				return serviceCollection;
			});
		});
	}

	private resolveWorkspaceInitializationPayload(environmentService: EnvironmentService): Promise<IWorkspaceInitializationPayload> {

		// Multi-root workspace
		if (this.configuration.workspace) {
			return Promise.resolve(this.configuration.workspace as IMultiFolderWorkspaceInitializationPayload);
		}

		// Single-folder workspace
		let workspaceInitializationPayload: Promise<IWorkspaceInitializationPayload | undefined> = Promise.resolve(undefined);
		if (this.configuration.folderUri) {
			workspaceInitializationPayload = this.resolveSingleFolderWorkspaceInitializationPayload(this.configuration.folderUri);
		}

		return workspaceInitializationPayload.then(payload => {

			// Fallback to empty workspace if we have no payload yet.
			if (!payload) {
				let id: string;
				if (this.configuration.backupPath) {
					id = basename(this.configuration.backupPath); // we know the backupPath must be a unique path so we leverage its name as workspace ID
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

	private resolveSingleFolderWorkspaceInitializationPayload(folderUri: ISingleFolderWorkspaceIdentifier): Promise<ISingleFolderWorkspaceInitializationPayload | undefined> {

		// Return early the folder is not local
		if (folderUri.scheme !== Schemas.file) {
			return Promise.resolve({ id: createHash('md5').update(folderUri.toString()).digest('hex'), folder: folderUri });
		}

		function computeLocalDiskFolderId(folder: uri, stat: fs.Stats): string {
			let ctime: number | undefined;
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

	private createWorkspaceService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService): Promise<WorkspaceService> {
		const workspaceService = new WorkspaceService(environmentService);

		return workspaceService.initialize(payload).then(() => workspaceService, error => {
			onUnexpectedError(error);
			logService.error(error);

			return workspaceService;
		});
	}

	private createStorageService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService, mainProcessClient: ElectronIPCClient): Promise<StorageService> {
		const globalStorageDatabase = new GlobalStorageDatabaseChannelClient(mainProcessClient.getChannel('storage'));
		const storageService = new StorageService(globalStorageDatabase, logService, environmentService);

		return storageService.initialize(payload).then(() => storageService, error => {
			onUnexpectedError(error);
			logService.error(error);

			return storageService;
		});
	}

	private createLogService(mainProcessClient: ElectronIPCClient, environmentService: IEnvironmentService): ILogService {
		const spdlogService = createSpdLogService(`renderer${this.configuration.windowId}`, this.configuration.logLevel, environmentService.logsPath);
		const consoleLogService = new ConsoleLogService(this.configuration.logLevel);
		const logService = new MultiplexLogService([consoleLogService, spdlogService]);
		const logLevelClient = new LogLevelSetterChannelClient(mainProcessClient.getChannel('loglevel'));

		return new FollowerLogService(logLevelClient, logService);
	}
}

export function main(configuration: IWindowConfiguration): Promise<void> {
	const window = new CodeWindow(configuration);

	return window.open();
}
