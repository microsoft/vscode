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
import { URI } from 'vs/base/common/uri';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { WorkbenchEnvironmentService } from 'vs/workbench/services/environment/node/environmentService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { stat } from 'vs/base/node/pfs';
import { KeyboardMapperFactory } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { webFrame } from 'electron';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceInitializationPayload, ISingleFolderWorkspaceInitializationPayload, reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ConsoleLogService, MultiplexLogService, ILogService } from 'vs/platform/log/common/log';
import { StorageService } from 'vs/platform/storage/node/storageService';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/node/logIpc';
import { Schemas } from 'vs/base/common/network';
import { sanitizeFilePath } from 'vs/base/common/extpath';
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
import { FileService } from 'vs/workbench/services/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider } from 'vs/workbench/services/files/electron-browser/diskFileSystemProvider';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { REMOTE_FILE_SYSTEM_CHANNEL_NAME, RemoteExtensionsFileSystemProvider } from 'vs/platform/remote/common/remoteAgentFileSystemChannel';
import { DefaultConfigurationExportHelper } from 'vs/workbench/services/configuration/node/configurationExportHelper';
import { ConfigurationCache } from 'vs/workbench/services/configuration/node/configurationCache';
import { ConfigurationFileService } from 'vs/workbench/services/configuration/node/configurationFileService';
import { SpdLogService } from 'vs/platform/log/node/spdlogService';

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
			this.configuration.folderUri = URI.revive(this.configuration.folderUri);
		}

		if (this.configuration.workspace) {
			this.configuration.workspace = reviveWorkspaceIdentifier(this.configuration.workspace);
		}

		const filesToWait = this.configuration.filesToWait;
		const filesToWaitPaths = filesToWait && filesToWait.paths;
		[filesToWaitPaths, this.configuration.filesToOpenOrCreate, this.configuration.filesToDiff].forEach(paths => {
			if (Array.isArray(paths)) {
				paths.forEach(path => {
					if (path.fileUri) {
						path.fileUri = URI.revive(path.fileUri);
					}
				});
			}
		});

		if (filesToWait) {
			filesToWait.waitMarkerFileUri = URI.revive(filesToWait.waitMarkerFileUri);
		}
	}

	async open(): Promise<void> {
		const services = await this.initServices();
		await domContentLoaded();
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
			instantiationService.invokeFunction(async accessor => this._register(await registerWindowDriver(accessor)));
		}

		// Config Exporter
		if (this.configuration['export-default-configuration']) {
			instantiationService.createInstance(DefaultConfigurationExportHelper);
		}

		// Logging
		services.logService.trace('workbench configuration', JSON.stringify(this.configuration));
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

	private async initServices(): Promise<{ serviceCollection: ServiceCollection, logService: ILogService, storageService: StorageService }> {
		const serviceCollection = new ServiceCollection();

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		// NOTE: DO NOT ADD ANY OTHER SERVICE INTO THE COLLECTION HERE.
		// CONTRIBUTE IT VIA WORKBENCH.MAIN.TS AND registerSingleton().
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		// Main Process
		const mainProcessService = this._register(new MainProcessService(this.configuration.windowId));
		serviceCollection.set(IMainProcessService, mainProcessService);

		// Environment
		const environmentService = new WorkbenchEnvironmentService(this.configuration, this.configuration.execPath);
		serviceCollection.set(IWorkbenchEnvironmentService, environmentService);

		// Log
		const logService = this._register(this.createLogService(mainProcessService, environmentService));
		serviceCollection.set(ILogService, logService);

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService();
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		const remoteAgentService = this._register(new RemoteAgentService(this.configuration, environmentService, remoteAuthorityResolverService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Files
		const fileService = this._register(new FileService(logService));
		serviceCollection.set(IFileService, fileService);

		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		const connection = remoteAgentService.getConnection();
		if (connection) {
			const channel = connection.getChannel<IChannel>(REMOTE_FILE_SYSTEM_CHANNEL_NAME);
			const remoteFileSystemProvider = this._register(new RemoteExtensionsFileSystemProvider(channel, remoteAgentService.getEnvironment()));
			fileService.registerProvider(Schemas.vscodeRemote, remoteFileSystemProvider);
		}

		const payload = await this.resolveWorkspaceInitializationPayload(environmentService);

		const services = await Promise.all([
			this.createWorkspaceService(payload, environmentService, fileService, remoteAgentService, logService).then(service => {

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
		]);

		return { serviceCollection, logService, storageService: services[1] };
	}

	private async resolveWorkspaceInitializationPayload(environmentService: IWorkbenchEnvironmentService): Promise<IWorkspaceInitializationPayload> {

		// Multi-root workspace
		if (this.configuration.workspace) {
			return this.configuration.workspace;
		}

		// Single-folder workspace
		let workspaceInitializationPayload: IWorkspaceInitializationPayload | undefined;
		if (this.configuration.folderUri) {
			workspaceInitializationPayload = await this.resolveSingleFolderWorkspaceInitializationPayload(this.configuration.folderUri);
		}

		// Fallback to empty workspace if we have no payload yet.
		if (!workspaceInitializationPayload) {
			let id: string;
			if (this.configuration.backupPath) {
				id = basename(this.configuration.backupPath); // we know the backupPath must be a unique path so we leverage its name as workspace ID
			} else if (environmentService.isExtensionDevelopment) {
				id = 'ext-dev'; // extension development window never stores backups and is a singleton
			} else {
				throw new Error('Unexpected window configuration without backupPath');
			}

			workspaceInitializationPayload = { id };
		}

		return workspaceInitializationPayload;
	}

	private async resolveSingleFolderWorkspaceInitializationPayload(folderUri: ISingleFolderWorkspaceIdentifier): Promise<ISingleFolderWorkspaceInitializationPayload | undefined> {

		// Return early the folder is not local
		if (folderUri.scheme !== Schemas.file) {
			return { id: createHash('md5').update(folderUri.toString()).digest('hex'), folder: folderUri };
		}

		function computeLocalDiskFolderId(folder: URI, stat: fs.Stats): string {
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
		try {
			const sanitizedFolderPath = sanitizeFilePath(folderUri.fsPath, process.env['VSCODE_CWD'] || process.cwd());
			const fileStat = await stat(sanitizedFolderPath);

			const sanitizedFolderUri = URI.file(sanitizedFolderPath);
			return {
				id: computeLocalDiskFolderId(sanitizedFolderUri, fileStat),
				folder: sanitizedFolderUri
			};
		} catch (error) {
			onUnexpectedError(error);
		}

		return;
	}

	private async createWorkspaceService(payload: IWorkspaceInitializationPayload, environmentService: IWorkbenchEnvironmentService, fileService: FileService, remoteAgentService: IRemoteAgentService, logService: ILogService): Promise<WorkspaceService> {
		const configurationFileService = new ConfigurationFileService();
		configurationFileService.fileService = fileService;

		const workspaceService = new WorkspaceService({ userSettingsResource: URI.file(environmentService.appSettingsPath), remoteAuthority: this.configuration.remoteAuthority, configurationCache: new ConfigurationCache(environmentService) }, configurationFileService, remoteAgentService);

		try {
			await workspaceService.initialize(payload);

			return workspaceService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return workspaceService;
		}
	}

	private async createStorageService(payload: IWorkspaceInitializationPayload, environmentService: IWorkbenchEnvironmentService, logService: ILogService, mainProcessService: IMainProcessService): Promise<StorageService> {
		const globalStorageDatabase = new GlobalStorageDatabaseChannelClient(mainProcessService.getChannel('storage'));
		const storageService = new StorageService(globalStorageDatabase, logService, environmentService);

		try {
			await storageService.initialize(payload);

			return storageService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return storageService;
		}
	}

	private createLogService(mainProcessService: IMainProcessService, environmentService: IWorkbenchEnvironmentService): ILogService {
		const spdlogService = new SpdLogService(`renderer${this.configuration.windowId}`, environmentService.logsPath, this.configuration.logLevel);
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
