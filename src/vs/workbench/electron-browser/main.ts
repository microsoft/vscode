/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as gracefulFs from 'graceful-fs';
import { createHash } from 'crypto';
import { importEntries, mark } from 'vs/base/common/performance';
import { Workbench } from 'vs/workbench/browser/workbench';
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
import { IWindowConfiguration, IWindowService } from 'vs/platform/windows/common/windows';
import { WindowService } from 'vs/platform/windows/electron-browser/windowService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { webFrame } from 'electron';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceInitializationPayload, IMultiFolderWorkspaceInitializationPayload, IEmptyWorkspaceInitializationPayload, ISingleFolderWorkspaceInitializationPayload, reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { ConsoleLogService, MultiplexLogService, ILogService } from 'vs/platform/log/common/log';
import { StorageService } from 'vs/platform/storage/node/storageService';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/node/logIpc';
import { Schemas } from 'vs/base/common/network';
import { sanitizeFilePath } from 'vs/base/node/extfs';
import { basename } from 'vs/base/common/path';
import { GlobalStorageDatabaseChannelClient } from 'vs/platform/storage/node/storageIpc';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerWindowDriver } from 'vs/platform/driver/electron-browser/driver';
import { IMainProcessService, MainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/electron-browser/remoteAuthorityResolverService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { FileService2 } from 'vs/workbench/services/files2/common/fileService2';
import { IFileService } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider } from 'vs/workbench/services/files2/node/diskFileSystemProvider';

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

		const filesToWait = this.configuration.filesToWait;
		const filesToWaitPaths = filesToWait && filesToWait.paths;
		[filesToWaitPaths, this.configuration.filesToOpen, this.configuration.filesToCreate, this.configuration.filesToDiff].forEach(paths => {
			if (Array.isArray(paths)) {
				paths.forEach(path => {
					if (path.fileUri) {
						path.fileUri = uri.revive(path.fileUri);
					}
				});
			}
		});
		if (filesToWait) {
			filesToWait.waitMarkerFileUri = uri.revive(filesToWait.waitMarkerFileUri);
		}
	}

	open(): Promise<void> {
		return this.initServices().then(services => {

			return domContentLoaded().then(() => {
				mark('willStartWorkbench');

				// Create Workbench
				this.workbench = new Workbench(document.body, services.serviceCollection, services.logService);

				// Layout
				this._register(addDisposableListener(window, EventType.RESIZE, e => this.onWindowResize(e, true)));

				// Workbench Lifecycle
				this._register(this.workbench.onShutdown(() => this.dispose()));
				this._register(this.workbench.onWillShutdown(event => event.join(services.storageService.close())));

				// Startup
				const instantiationService = this.workbench.startup();

				// Window
				this._register(instantiationService.createInstance(ElectronWindow));

				// Driver
				if (this.configuration.driver) {
					instantiationService.invokeFunction(accessor => registerWindowDriver(accessor).then(disposable => this._register(disposable)));
				}

				// Config Exporter
				if (this.configuration['export-default-configuration']) {
					instantiationService.createInstance(DefaultConfigurationExportHelper);
				}

				// Logging
				services.logService.trace('workbench configuration', JSON.stringify(this.configuration));
			});
		});
	}

	private onWindowResize(e: Event, retry: boolean): void {
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

	private initServices(): Promise<{ serviceCollection: ServiceCollection, logService: ILogService, storageService: StorageService }> {
		const serviceCollection = new ServiceCollection();

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		// NOTE: DO NOT ADD ANY OTHER SERVICE INTO THE COLLECTION HERE.
		// CONTRIBUTE IT VIA WORKBENCH.MAIN.TS AND registerSingleton().
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		// Main Process
		const mainProcessService = this._register(new MainProcessService(this.configuration.windowId));
		serviceCollection.set(IMainProcessService, mainProcessService);

		// Window
		serviceCollection.set(IWindowService, new SyncDescriptor(WindowService, [this.configuration]));

		// Environment
		const environmentService = new EnvironmentService(this.configuration, this.configuration.execPath);
		serviceCollection.set(IEnvironmentService, environmentService);

		// Log
		const logService = this._register(this.createLogService(mainProcessService, environmentService));
		serviceCollection.set(ILogService, logService);

		// Files
		const fileService = new FileService2(logService);
		serviceCollection.set(IFileService, fileService);

		fileService.registerProvider(Schemas.file, new DiskFileSystemProvider());

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService();
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);
		const remoteAgentService = new RemoteAgentService(this.configuration, environmentService, remoteAuthorityResolverService);
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		return this.resolveWorkspaceInitializationPayload(environmentService).then(payload => Promise.all([
			this.createWorkspaceService(payload, environmentService, logService).then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IConfigurationService, service);

				return service;
			}),

			this.createStorageService(payload, environmentService, logService, mainProcessService).then(service => {

				// Storage
				serviceCollection.set(IStorageService, service);

				return service;
			})
		]).then(services => ({ serviceCollection, logService, storageService: services[1] })));
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

	private createStorageService(payload: IWorkspaceInitializationPayload, environmentService: IEnvironmentService, logService: ILogService, mainProcessService: IMainProcessService): Promise<StorageService> {
		const globalStorageDatabase = new GlobalStorageDatabaseChannelClient(mainProcessService.getChannel('storage'));
		const storageService = new StorageService(globalStorageDatabase, logService, environmentService);

		return storageService.initialize(payload).then(() => storageService, error => {
			onUnexpectedError(error);
			logService.error(error);

			return storageService;
		});
	}

	private createLogService(mainProcessService: IMainProcessService, environmentService: IEnvironmentService): ILogService {
		const spdlogService = createSpdLogService(`renderer${this.configuration.windowId}`, this.configuration.logLevel, environmentService.logsPath);
		const consoleLogService = new ConsoleLogService(this.configuration.logLevel);
		const logService = new MultiplexLogService([consoleLogService, spdlogService]);
		const logLevelClient = new LogLevelSetterChannelClient(mainProcessService.getChannel('loglevel'));

		return new FollowerLogService(logLevelClient, logService);
	}
}

export function main(configuration: IWindowConfiguration): Promise<void> {
	const renderer = new CodeRendererMain(configuration);

	return renderer.open();
}
