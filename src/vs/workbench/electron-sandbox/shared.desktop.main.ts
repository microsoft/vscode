/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { zoomLevelToZoomFactor } from 'vs/platform/windows/common/windows';
import { mark } from 'vs/base/common/performance';
import { Workbench } from 'vs/workbench/browser/workbench';
import { NativeWindow } from 'vs/workbench/electron-sandbox/window';
import { setZoomLevel, setZoomFactor, setFullscreen } from 'vs/base/browser/browser';
import { domContentLoaded } from 'vs/base/browser/dom';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { INativeWorkbenchConfiguration, INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IWorkspaceInitializationPayload, reviveIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ILoggerService, ILogService } from 'vs/platform/log/common/log';
import { NativeStorageService } from 'vs/platform/storage/electron-sandbox/storageService';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/electron-sandbox/remoteAuthorityResolverService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-sandbox/remoteAgentServiceImpl';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { FileService } from 'vs/platform/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { RemoteFileSystemProvider } from 'vs/workbench/services/remote/common/remoteAgentFileSystemChannel';
import { ConfigurationCache } from 'vs/workbench/services/configuration/electron-sandbox/configurationCache';
import { ISignService } from 'vs/platform/sign/common/sign';
import { basename } from 'vs/base/common/path';
import { IProductService } from 'vs/platform/product/common/productService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { NativeHostService } from 'vs/platform/native/electron-sandbox/nativeHostService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentityService';
import { KeyboardLayoutService } from 'vs/workbench/services/keybinding/electron-sandbox/nativeKeyboardLayout';
import { IKeyboardLayoutService } from 'vs/platform/keyboardLayout/common/keyboardLayout';
import { ElectronIPCMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { LoggerChannelClient } from 'vs/platform/log/common/logIpc';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import product from 'vs/platform/product/common/product';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NativeLogService } from 'vs/workbench/services/log/electron-sandbox/logService';

export const productService = { _serviceBrand: undefined, ...product };

export abstract class SharedDesktopMain extends Disposable {

	protected readonly productService: IProductService = productService;

	constructor(
		protected readonly configuration: INativeWorkbenchConfiguration,
		protected readonly environmentService: INativeWorkbenchEnvironmentService
	) {
		super();

		this.init();
	}

	private init(): void {

		// Massage configuration file URIs
		this.reviveUris();

		// Browser config
		const zoomLevel = this.configuration.zoomLevel || 0;
		setZoomFactor(zoomLevelToZoomFactor(zoomLevel));
		setZoomLevel(zoomLevel, true /* isTrusted */);
		setFullscreen(!!this.configuration.fullscreen);
	}

	private reviveUris() {

		// Workspace
		const workspace = reviveIdentifier(this.configuration.workspace);
		if (isWorkspaceIdentifier(workspace) || isSingleFolderWorkspaceIdentifier(workspace)) {
			this.configuration.workspace = workspace;
		}

		// Files
		const filesToWait = this.configuration.filesToWait;
		const filesToWaitPaths = filesToWait?.paths;
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
		mark('code/willStartWorkbench');

		// Create Workbench
		const workbench = new Workbench(document.body, services.serviceCollection, services.logService);

		// Listeners
		this.registerListeners(workbench, services.storageService);

		// Startup
		const instantiationService = workbench.startup();

		// Window
		this._register(instantiationService.createInstance(NativeWindow));

		// Logging
		services.logService.trace('workbench configuration', JSON.stringify(this.configuration));

		// Allow subclass to participate
		this.joinOpen(instantiationService);
	}

	private registerListeners(workbench: Workbench, storageService: NativeStorageService): void {

		// Workbench Lifecycle
		this._register(workbench.onWillShutdown(event => event.join(storageService.close(), 'join.closeStorage')));
		this._register(workbench.onShutdown(() => this.dispose()));
	}

	protected abstract registerFileSystemProviders(fileService: IFileService, logService: ILogService, nativeHostService: INativeHostService): void;
	protected joinOpen(instantiationService: IInstantiationService): void { }

	private async initServices(): Promise<{ serviceCollection: ServiceCollection, logService: ILogService, storageService: NativeStorageService }> {
		const serviceCollection = new ServiceCollection();


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.sandbox.main.ts` if the service
		//       is desktop only.
		//
		//       DO NOT add services to `workbench.desktop.main.ts`, always add
		//       to `workbench.sandbox.main.ts` to support our Electron sandbox
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		// Main Process
		const mainProcessService = this._register(new ElectronIPCMainProcessService(this.configuration.windowId));
		serviceCollection.set(IMainProcessService, mainProcessService);

		// Environment
		serviceCollection.set(INativeWorkbenchEnvironmentService, this.environmentService);

		// Product
		serviceCollection.set(IProductService, this.productService);

		// Logger
		const loggerService = new LoggerChannelClient(mainProcessService.getChannel('logger'));
		serviceCollection.set(ILoggerService, loggerService);

		// Log
		const logService = this._register(new NativeLogService(`renderer${this.configuration.windowId}`, loggerService, mainProcessService, this.environmentService));
		serviceCollection.set(ILogService, logService);

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService();
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.sandbox.main.ts` if the service
		//       is desktop only.
		//
		//       DO NOT add services to `workbench.desktop.main.ts`, always add
		//       to `workbench.sandbox.main.ts` to support our Electron sandbox
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		// Sign
		const signService = ProxyChannel.toService<ISignService>(mainProcessService.getChannel('sign'));
		serviceCollection.set(ISignService, signService);

		// Remote Agent
		const remoteAgentService = this._register(new RemoteAgentService(this.environmentService, this.productService, remoteAuthorityResolverService, signService, logService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Native Host
		const nativeHostService = new NativeHostService(this.configuration.windowId, mainProcessService) as INativeHostService;
		serviceCollection.set(INativeHostService, nativeHostService);

		// Files
		const fileService = this._register(new FileService(logService));
		serviceCollection.set(IFileService, fileService);

		this.registerFileSystemProviders(fileService, logService, nativeHostService);

		// Uri Identity
		const uriIdentityService = new UriIdentityService(fileService);
		serviceCollection.set(IUriIdentityService, uriIdentityService);


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.sandbox.main.ts` if the service
		//       is desktop only.
		//
		//       DO NOT add services to `workbench.desktop.main.ts`, always add
		//       to `workbench.sandbox.main.ts` to support our Electron sandbox
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		const connection = remoteAgentService.getConnection();
		if (connection) {
			const remoteFileSystemProvider = this._register(new RemoteFileSystemProvider(remoteAgentService));
			fileService.registerProvider(Schemas.vscodeRemote, remoteFileSystemProvider);
		}

		const payload = this.resolveWorkspaceInitializationPayload();

		const services = await Promise.all([
			this.createWorkspaceService(payload, fileService, remoteAgentService, uriIdentityService, logService).then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IWorkbenchConfigurationService, service);

				return service;
			}),

			this.createStorageService(payload, mainProcessService).then(service => {

				// Storage
				serviceCollection.set(IStorageService, service);

				return service;
			}),

			this.createKeyboardLayoutService(mainProcessService).then(service => {

				// KeyboardLayout
				serviceCollection.set(IKeyboardLayoutService, service);

				return service;
			})
		]);


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.sandbox.main.ts` if the service
		//       is desktop only.
		//
		//       DO NOT add services to `workbench.desktop.main.ts`, always add
		//       to `workbench.sandbox.main.ts` to support our Electron sandbox
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		return { serviceCollection, logService, storageService: services[1] };
	}

	private resolveWorkspaceInitializationPayload(): IWorkspaceInitializationPayload {
		let workspaceInitializationPayload: IWorkspaceInitializationPayload | undefined = this.configuration.workspace;

		// Fallback to empty workspace if we have no payload yet.
		if (!workspaceInitializationPayload) {
			let id: string;
			if (this.configuration.backupPath) {
				id = basename(this.configuration.backupPath); // we know the backupPath must be a unique path so we leverage its name as workspace ID
			} else if (this.environmentService.isExtensionDevelopment) {
				id = 'ext-dev'; // extension development window never stores backups and is a singleton
			} else {
				throw new Error('Unexpected window configuration without backupPath');
			}

			workspaceInitializationPayload = { id };
		}

		return workspaceInitializationPayload;
	}

	private async createWorkspaceService(payload: IWorkspaceInitializationPayload, fileService: FileService, remoteAgentService: IRemoteAgentService, uriIdentityService: IUriIdentityService, logService: ILogService): Promise<WorkspaceService> {
		const workspaceService = new WorkspaceService({ remoteAuthority: this.environmentService.remoteAuthority, configurationCache: new ConfigurationCache(URI.file(this.environmentService.userDataPath), fileService) }, this.environmentService, fileService, remoteAgentService, uriIdentityService, logService);

		try {
			await workspaceService.initialize(payload);

			return workspaceService;
		} catch (error) {
			onUnexpectedError(error);

			return workspaceService;
		}
	}

	private async createStorageService(payload: IWorkspaceInitializationPayload, mainProcessService: IMainProcessService): Promise<NativeStorageService> {
		const storageService = new NativeStorageService(payload, mainProcessService, this.environmentService);

		try {
			await storageService.initialize();

			return storageService;
		} catch (error) {
			onUnexpectedError(error);

			return storageService;
		}
	}

	private async createKeyboardLayoutService(mainProcessService: IMainProcessService): Promise<KeyboardLayoutService> {
		const keyboardLayoutService = new KeyboardLayoutService(mainProcessService);

		try {
			await keyboardLayoutService.initialize();

			return keyboardLayoutService;
		} catch (error) {
			onUnexpectedError(error);

			return keyboardLayoutService;
		}
	}
}
