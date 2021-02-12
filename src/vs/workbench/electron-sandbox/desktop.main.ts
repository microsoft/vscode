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
import { URI } from 'vs/base/common/uri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { reviveIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ILogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-sandbox/remoteAgentServiceImpl';
import { FileService } from 'vs/platform/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { RemoteFileSystemProvider } from 'vs/workbench/services/remote/common/remoteAgentFileSystemChannel';
import { ISignService } from 'vs/platform/sign/common/sign';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { IProductService } from 'vs/platform/product/common/productService';
import product from 'vs/platform/product/common/product';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { NativeHostService } from 'vs/platform/native/electron-sandbox/nativeHostService';
import { SimpleConfigurationService, simpleFileSystemProvider, SimpleLogService, SimpleSignService, SimpleStorageService, SimpleNativeWorkbenchEnvironmentService, SimpleWorkspaceService } from 'vs/workbench/electron-sandbox/sandbox.simpleservices';
import { INativeWorkbenchConfiguration, INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/electron-sandbox/remoteAuthorityResolverService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentityService';
import { ElectronIPCMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';

class DesktopMain extends Disposable {

	private readonly productService: IProductService = { _serviceBrand: undefined, ...product };
	private readonly environmentService = new SimpleNativeWorkbenchEnvironmentService(this.configuration);

	constructor(private configuration: INativeWorkbenchConfiguration) {
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
		this.configuration.workspace = reviveIdentifier(this.configuration.workspace);

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
	}

	private registerListeners(workbench: Workbench, storageService: SimpleStorageService): void {

		// Workbench Lifecycle
		this._register(workbench.onShutdown(() => this.dispose()));
		this._register(workbench.onWillShutdown(event => event.join(storageService.close(), 'join.closeStorage')));
	}

	private async initServices(): Promise<{ serviceCollection: ServiceCollection, logService: ILogService, storageService: SimpleStorageService }> {
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
		serviceCollection.set(IWorkbenchEnvironmentService, this.environmentService);
		serviceCollection.set(INativeWorkbenchEnvironmentService, this.environmentService);

		// Product
		serviceCollection.set(IProductService, this.productService);

		// Log
		const logService = new SimpleLogService();
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
		const signService = new SimpleSignService();
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

		fileService.registerProvider(Schemas.file, simpleFileSystemProvider);

		// User Data Provider
		fileService.registerProvider(Schemas.userData, new FileUserDataProvider(Schemas.file, simpleFileSystemProvider, Schemas.userData, logService));

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

		const services = await Promise.all([
			this.createWorkspaceService().then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IWorkbenchConfigurationService, new SimpleConfigurationService());

				return service;
			}),

			this.createStorageService().then(service => {

				// Storage
				serviceCollection.set(IStorageService, service);

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

	private async createWorkspaceService(): Promise<IWorkspaceContextService> {
		return new SimpleWorkspaceService();
	}

	private async createStorageService(): Promise<SimpleStorageService> {
		return new SimpleStorageService();
	}
}

export function main(configuration: INativeWorkbenchConfiguration): Promise<void> {
	const workbench = new DesktopMain(configuration);

	return workbench.open();
}
