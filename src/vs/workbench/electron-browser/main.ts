/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as gracefulFs from 'graceful-fs';
import { createHash } from 'crypto';
import { importEntries, mark } from 'vs/base/common/performance';
import { Workbench, IWorkbenchOptions } from 'vs/workbench/browser/workbench';
import { ElectronWindow } from 'vs/workbench/electron-browser/window';
import { setZoomLevel, setZoomFactor, setFullscreen } from 'vs/base/browser/browser';
import { domContentLoaded, addDisposableListener, EventType, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { WorkspaceService, DefaultConfigurationExportHelper } from 'vs/workbench/services/configuration/node/configurationService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { stat } from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IWindowConfiguration, IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { WindowService } from 'vs/platform/windows/electron-browser/windowService';
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
import { GlobalStorageDatabaseChannelClient } from 'vs/platform/storage/node/storageIpc';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerWindowDriver } from 'vs/platform/driver/electron-browser/driver';

class CodeRendererMain extends Disposable {

	private workbench: Workbench;

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
		importEntries(this.configuration.perfEntries);

		// Browser config
		setZoomFactor(webFrame.getZoomFactor()); // Ensure others can listen to zoom level changes
		setZoomLevel(webFrame.getZoomLevel(), true /* isTrusted */); // Can be trusted because we are not setting it ourselves (https://github.com/Microsoft/vscode/issues/26151)
		setFullscreen(!!this.configuration.fullscreen);

		// Keyboard support
		KeyboardMapperFactory.INSTANCE._onKeyboardLayoutChanged();
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

	private hasInitialFilesToOpen(): boolean {
		return !!(
			(this.configuration.filesToCreate && this.configuration.filesToCreate.length > 0) ||
			(this.configuration.filesToOpen && this.configuration.filesToOpen.length > 0) ||
			(this.configuration.filesToDiff && this.configuration.filesToDiff.length > 0));
	}

	open(): Promise<void> {
		const electronMainClient = this._register(new ElectronIPCClient(`window:${this.configuration.windowId}`));

		return this.initServices(electronMainClient).then(services => {

			return domContentLoaded().then(() => {
				mark('willStartWorkbench');

				const instantiationService = new InstantiationService(services, true);

				// Create Workbench
				this.workbench = instantiationService.createInstance(
					Workbench,
					document.body,
					{ hasInitialFilesToOpen: this.hasInitialFilesToOpen() } as IWorkbenchOptions,
					services
				);

				// Layout
				this._register(addDisposableListener(window, EventType.RESIZE, e => this.onWindowResize(e, true)));

				// Workbench Lifecycle
				this._register(this.workbench.onShutdown(() => this.dispose()));
				this._register(this.workbench.onWillShutdown(event => event.join((services.get(IStorageService) as StorageService).close())));

				// Startup
				this.workbench.startup();

				// Window
				this._register(instantiationService.createInstance(ElectronWindow));

				// Driver
				if (this.configuration.driver) {
					registerWindowDriver(electronMainClient, this.configuration.windowId, instantiationService).then(disposable => this._register(disposable));
				}

				// Config Exporter
				if (this.configuration['export-default-configuration']) {
					instantiationService.createInstance(DefaultConfigurationExportHelper);
				}

				// Logging
				instantiationService.invokeFunction(accessor => accessor.get(ILogService).trace('workbench configuration', JSON.stringify(this.configuration)));
			});
		});
	}

	private onWindowResize(e: any, retry: boolean): void {
		if (e.target === window) {
			if (window.document && window.document.body && window.document.body.clientWidth === 0) {
				// TODO@Ben this is an electron issue on macOS when simple fullscreen is enabled
				// where for some reason the window clientWidth is reported as 0 when switching
				// between simple fullscreen and normal screen. In that case we schedule the layout
				// call at the next animation frame once, in the hope that the dimensions are
				// proper then.
				if (retry) {
					scheduleAtNextAnimationFrame(() => this.onWindowResize(e, false));
				}
				return;
			}

			this.workbench.layout();
		}
	}

	private initServices(electronMainClient: ElectronIPCClient): Promise<ServiceCollection> {
		const serviceCollection = new ServiceCollection();

		// Windows Service
		const windowsChannel = electronMainClient.getChannel('windows');
		serviceCollection.set(IWindowsService, new WindowsChannelClient(windowsChannel));

		// Window
		serviceCollection.set(IWindowService, new SyncDescriptor(WindowService, [this.configuration]));

		// Update Service
		const updateChannel = electronMainClient.getChannel('update');
		serviceCollection.set(IUpdateService, new SyncDescriptor(UpdateChannelClient, [updateChannel]));

		// URL Service
		const urlChannel = electronMainClient.getChannel('url');
		const mainUrlService = new URLServiceChannelClient(urlChannel);
		const urlService = new RelayURLService(mainUrlService);
		serviceCollection.set(IURLService, urlService);

		// URLHandler Service
		const urlHandlerChannel = new URLHandlerChannel(urlService);
		electronMainClient.registerChannel('urlHandler', urlHandlerChannel);

		// Issue Service
		const issueChannel = electronMainClient.getChannel('issue');
		serviceCollection.set(IIssueService, new SyncDescriptor(IssueChannelClient, [issueChannel]));

		// Menubar Service
		const menubarChannel = electronMainClient.getChannel('menubar');
		serviceCollection.set(IMenubarService, new SyncDescriptor(MenubarChannelClient, [menubarChannel]));

		// Workspaces Service
		const workspacesChannel = electronMainClient.getChannel('workspaces');
		serviceCollection.set(IWorkspacesService, new WorkspacesChannelClient(workspacesChannel));

		// Environment
		const environmentService = new EnvironmentService(this.configuration, this.configuration.execPath);
		serviceCollection.set(IEnvironmentService, environmentService);

		// Log
		const logService = this._register(this.createLogService(electronMainClient, environmentService));
		serviceCollection.set(ILogService, logService);

		// Resolve a workspace payload that we can get the workspace ID from
		return this.resolveWorkspaceInitializationPayload(environmentService).then(payload => {

			return Promise.all([

				// Create and initialize workspace/configuration service
				this.createWorkspaceService(payload, environmentService, logService),

				// Create and initialize storage service
				this.createStorageService(payload, environmentService, logService, electronMainClient)
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
			if (isLinux) {
				ctime = stat.ino; // Linux: birthtime is ctime, so we cannot use it! We use the ino instead!
			} else if (isMacintosh) {
				ctime = stat.birthtime.getTime(); // macOS: birthtime is fine to use as is
			} else if (isWindows) {
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

	private createStorageService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService, electronMainClient: ElectronIPCClient): Promise<StorageService> {
		const globalStorageDatabase = new GlobalStorageDatabaseChannelClient(electronMainClient.getChannel('storage'));
		const storageService = new StorageService(globalStorageDatabase, logService, environmentService);

		return storageService.initialize(payload).then(() => storageService, error => {
			onUnexpectedError(error);
			logService.error(error);

			return storageService;
		});
	}

	private createLogService(electronMainClient: ElectronIPCClient, environmentService: IEnvironmentService): ILogService {
		const spdlogService = createSpdLogService(`renderer${this.configuration.windowId}`, this.configuration.logLevel, environmentService.logsPath);
		const consoleLogService = new ConsoleLogService(this.configuration.logLevel);
		const logService = new MultiplexLogService([consoleLogService, spdlogService]);
		const logLevelClient = new LogLevelSetterChannelClient(electronMainClient.getChannel('loglevel'));

		return new FollowerLogService(logLevelClient, logService);
	}
}

export function main(configuration: IWindowConfiguration): Promise<void> {
	const renderer = new CodeRendererMain(configuration);

	return renderer.open();
}
