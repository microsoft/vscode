/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import product from 'vs/platform/product/common/product';
import { INativeWindowConfiguration, IWindowsConfiguration } from 'vs/platform/window/common/window';
import { Workbench } from 'vs/workbench/browser/workbench';
import { NativeWindow } from 'vs/workbench/electron-sandbox/window';
import { setFullscreen } from 'vs/base/browser/browser';
import { domContentLoaded } from 'vs/base/browser/dom';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { INativeWorkbenchEnvironmentService, NativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILoggerService, ILogService, LogLevel } from 'vs/platform/log/common/log';
import { NativeWorkbenchStorageService } from 'vs/workbench/services/storage/electron-sandbox/storageService';
import { IWorkspaceContextService, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IAnyWorkspaceIdentifier, reviveIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { SharedProcessService } from 'vs/workbench/services/sharedProcess/electron-sandbox/sharedProcessService';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/electron-sandbox/remoteAuthorityResolverService';
import { IRemoteAuthorityResolverService, RemoteConnectionType } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-sandbox/remoteAgentService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { FileService } from 'vs/platform/files/common/fileService';
import { IWorkbenchFileService } from 'vs/workbench/services/files/common/files';
import { RemoteFileSystemProviderClient } from 'vs/workbench/services/remote/common/remoteFileSystemProviderClient';
import { ConfigurationCache } from 'vs/workbench/services/configuration/common/configurationCache';
import { ISignService } from 'vs/platform/sign/common/sign';
import { IProductService } from 'vs/platform/product/common/productService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { INativeKeyboardLayoutService, NativeKeyboardLayoutService } from 'vs/workbench/services/keybinding/electron-sandbox/nativeKeyboardLayoutService';
import { ElectronIPCMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { LoggerChannelClient } from 'vs/platform/log/common/logIpc';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { NativeLogService } from 'vs/workbench/services/log/electron-sandbox/logService';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { safeStringify } from 'vs/base/common/objects';
import { IUtilityProcessWorkerWorkbenchService, UtilityProcessWorkerWorkbenchService } from 'vs/workbench/services/utilityProcess/electron-sandbox/utilityProcessWorkerWorkbenchService';
import { isCI, isMacintosh } from 'vs/base/common/platform';
import { Schemas } from 'vs/base/common/network';
import { DiskFileSystemProvider } from 'vs/workbench/services/files/electron-sandbox/diskFileSystemProvider';
import { FileUserDataProvider } from 'vs/platform/userData/common/fileUserDataProvider';
import { IUserDataProfilesService, reviveProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfileIpc';
import { PolicyChannelClient } from 'vs/platform/policy/common/policyIpc';
import { IPolicyService, NullPolicyService } from 'vs/platform/policy/common/policy';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { BrowserSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { RemoteSocketFactoryService, IRemoteSocketFactoryService } from 'vs/platform/remote/common/remoteSocketFactoryService';
import { ElectronRemoteResourceLoader } from 'vs/platform/remote/electron-sandbox/electronRemoteResourceLoader';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { applyZoom } from 'vs/platform/window/electron-sandbox/window';

export class DesktopMain extends Disposable {

	constructor(
		private readonly configuration: INativeWindowConfiguration
	) {
		super();

		this.init();
	}

	private init(): void {

		// Massage configuration file URIs
		this.reviveUris();

		// Apply fullscreen early if configured
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
		for (const paths of [filesToWaitPaths, this.configuration.filesToOpenOrCreate, this.configuration.filesToDiff, this.configuration.filesToMerge]) {
			if (Array.isArray(paths)) {
				for (const path of paths) {
					if (path.fileUri) {
						path.fileUri = URI.revive(path.fileUri);
					}
				}
			}
		}

		if (filesToWait) {
			filesToWait.waitMarkerFileUri = URI.revive(filesToWait.waitMarkerFileUri);
		}
	}

	async open(): Promise<void> {

		// Init services and wait for DOM to be ready in parallel
		const [services] = await Promise.all([this.initServices(), domContentLoaded()]);

		// Apply zoom level early once we have a configuration service
		// and before the workbench is created to prevent flickering.
		// We also need to respect that zoom level can be configured per
		// workspace, so we need the resolved configuration service.
		// (fixes https://github.com/microsoft/vscode/issues/187982)
		this.applyConfiguredWindowZoomLevel(services.configurationService);

		// Create Workbench
		const workbench = new Workbench(document.body, { extraClasses: this.getExtraClasses() }, services.serviceCollection, services.logService);

		// Listeners
		this.registerListeners(workbench, services.storageService);

		// Startup
		const instantiationService = workbench.startup();

		// Window
		this._register(instantiationService.createInstance(NativeWindow));
	}

	private applyConfiguredWindowZoomLevel(configurationService: IConfigurationService) {
		const windowConfig = configurationService.getValue<IWindowsConfiguration>();
		const windowZoomLevel = typeof windowConfig.window?.zoomLevel === 'number' ? windowConfig.window.zoomLevel : 0;

		applyZoom(windowZoomLevel);
	}

	private getExtraClasses(): string[] {
		if (isMacintosh) {
			if (this.configuration.os.release > '20.0.0') {
				return ['macos-bigsur-or-newer'];
			}
		}

		return [];
	}

	private registerListeners(workbench: Workbench, storageService: NativeWorkbenchStorageService): void {

		// Workbench Lifecycle
		this._register(workbench.onWillShutdown(event => event.join(storageService.close(), { id: 'join.closeStorage', label: localize('join.closeStorage', "Saving UI state") })));
		this._register(workbench.onDidShutdown(() => this.dispose()));
	}

	private async initServices(): Promise<{ serviceCollection: ServiceCollection; logService: ILogService; storageService: NativeWorkbenchStorageService; configurationService: IConfigurationService }> {
		const serviceCollection = new ServiceCollection();


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.desktop.main.ts` if the service
		//       is desktop only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		// Main Process
		const mainProcessService = this._register(new ElectronIPCMainProcessService(this.configuration.windowId));
		serviceCollection.set(IMainProcessService, mainProcessService);

		// Policies
		const policyService = this.configuration.policiesData ? new PolicyChannelClient(this.configuration.policiesData, mainProcessService.getChannel('policy')) : new NullPolicyService();
		serviceCollection.set(IPolicyService, policyService);

		// Product
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		serviceCollection.set(IProductService, productService);

		// Environment
		const environmentService = new NativeWorkbenchEnvironmentService(this.configuration, productService);
		serviceCollection.set(INativeWorkbenchEnvironmentService, environmentService);

		// Logger
		const loggers = [
			...this.configuration.loggers.global.map(loggerResource => ({ ...loggerResource, resource: URI.revive(loggerResource.resource) })),
			...this.configuration.loggers.window.map(loggerResource => ({ ...loggerResource, resource: URI.revive(loggerResource.resource), hidden: true })),
		];
		const loggerService = new LoggerChannelClient(this.configuration.windowId, this.configuration.logLevel, environmentService.logsHome, loggers, mainProcessService.getChannel('logger'));
		serviceCollection.set(ILoggerService, loggerService);

		// Log
		const logService = this._register(new NativeLogService(loggerService, environmentService));
		serviceCollection.set(ILogService, logService);
		if (isCI) {
			logService.info('workbench#open()'); // marking workbench open helps to diagnose flaky integration/smoke tests
		}
		if (logService.getLevel() === LogLevel.Trace) {
			logService.trace('workbench#open(): with configuration', safeStringify(this.configuration));
		}

		// Shared Process
		const sharedProcessService = new SharedProcessService(this.configuration.windowId, logService);
		serviceCollection.set(ISharedProcessService, sharedProcessService);

		// Utility Process Worker
		const utilityProcessWorkerWorkbenchService = new UtilityProcessWorkerWorkbenchService(this.configuration.windowId, logService, mainProcessService);
		serviceCollection.set(IUtilityProcessWorkerWorkbenchService, utilityProcessWorkerWorkbenchService);

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.desktop.main.ts` if the service
		//       is desktop only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		// Sign
		const signService = ProxyChannel.toService<ISignService>(mainProcessService.getChannel('sign'));
		serviceCollection.set(ISignService, signService);

		// Files
		const fileService = this._register(new FileService(logService));
		serviceCollection.set(IWorkbenchFileService, fileService);

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService(productService, new ElectronRemoteResourceLoader(environmentService.window.id, mainProcessService, fileService));
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		// Local Files
		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(mainProcessService, utilityProcessWorkerWorkbenchService, logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// Use FileUserDataProvider for user data to
		// enable atomic read / write operations.
		fileService.registerProvider(Schemas.vscodeUserData, this._register(new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, logService)));

		// URI Identity
		const uriIdentityService = new UriIdentityService(fileService);
		serviceCollection.set(IUriIdentityService, uriIdentityService);

		// User Data Profiles
		const userDataProfilesService = new UserDataProfilesService(this.configuration.profiles.all, URI.revive(this.configuration.profiles.home).with({ scheme: environmentService.userRoamingDataHome.scheme }), mainProcessService.getChannel('userDataProfiles'));
		serviceCollection.set(IUserDataProfilesService, userDataProfilesService);
		const userDataProfileService = new UserDataProfileService(reviveProfile(this.configuration.profiles.profile, userDataProfilesService.profilesHome.scheme), userDataProfilesService);
		serviceCollection.set(IUserDataProfileService, userDataProfileService);

		// Remote Agent
		const remoteSocketFactoryService = new RemoteSocketFactoryService();
		remoteSocketFactoryService.register(RemoteConnectionType.WebSocket, new BrowserSocketFactory(null));
		serviceCollection.set(IRemoteSocketFactoryService, remoteSocketFactoryService);
		const remoteAgentService = this._register(new RemoteAgentService(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Remote Files
		this._register(RemoteFileSystemProviderClient.register(remoteAgentService, fileService, logService));

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.desktop.main.ts` if the service
		//       is desktop only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		// Create services that require resolving in parallel
		const workspace = this.resolveWorkspaceIdentifier(environmentService);
		const [configurationService, storageService] = await Promise.all([
			this.createWorkspaceService(workspace, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService).then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IWorkbenchConfigurationService, service);

				return service;
			}),

			this.createStorageService(workspace, environmentService, userDataProfileService, userDataProfilesService, mainProcessService).then(service => {

				// Storage
				serviceCollection.set(IStorageService, service);

				return service;
			}),

			this.createKeyboardLayoutService(mainProcessService).then(service => {

				// KeyboardLayout
				serviceCollection.set(INativeKeyboardLayoutService, service);

				return service;
			})
		]);

		// Workspace Trust Service
		const workspaceTrustEnablementService = new WorkspaceTrustEnablementService(configurationService, environmentService);
		serviceCollection.set(IWorkspaceTrustEnablementService, workspaceTrustEnablementService);

		const workspaceTrustManagementService = new WorkspaceTrustManagementService(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, configurationService, workspaceTrustEnablementService, fileService);
		serviceCollection.set(IWorkspaceTrustManagementService, workspaceTrustManagementService);

		// Update workspace trust so that configuration is updated accordingly
		configurationService.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
		this._register(workspaceTrustManagementService.onDidChangeTrust(() => configurationService.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted())));


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.desktop.main.ts` if the service
		//       is desktop only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		return { serviceCollection, logService, storageService, configurationService };
	}

	private resolveWorkspaceIdentifier(environmentService: INativeWorkbenchEnvironmentService): IAnyWorkspaceIdentifier {

		// Return early for when a folder or multi-root is opened
		if (this.configuration.workspace) {
			return this.configuration.workspace;
		}

		// Otherwise, workspace is empty, so we derive an identifier
		return toWorkspaceIdentifier(this.configuration.backupPath, environmentService.isExtensionDevelopment);
	}

	private async createWorkspaceService(
		workspace: IAnyWorkspaceIdentifier,
		environmentService: INativeWorkbenchEnvironmentService,
		userDataProfileService: IUserDataProfileService,
		userDataProfilesService: IUserDataProfilesService,
		fileService: FileService,
		remoteAgentService: IRemoteAgentService,
		uriIdentityService: IUriIdentityService,
		logService: ILogService,
		policyService: IPolicyService
	): Promise<WorkspaceService> {
		const configurationCache = new ConfigurationCache([Schemas.file, Schemas.vscodeUserData] /* Cache all non native resources */, environmentService, fileService);
		const workspaceService = new WorkspaceService({ remoteAuthority: environmentService.remoteAuthority, configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService);

		try {
			await workspaceService.initialize(workspace);

			return workspaceService;
		} catch (error) {
			onUnexpectedError(error);

			return workspaceService;
		}
	}

	private async createStorageService(workspace: IAnyWorkspaceIdentifier, environmentService: INativeWorkbenchEnvironmentService, userDataProfileService: IUserDataProfileService, userDataProfilesService: IUserDataProfilesService, mainProcessService: IMainProcessService): Promise<NativeWorkbenchStorageService> {
		const storageService = new NativeWorkbenchStorageService(workspace, userDataProfileService, userDataProfilesService, mainProcessService, environmentService);

		try {
			await storageService.initialize();

			return storageService;
		} catch (error) {
			onUnexpectedError(error);

			return storageService;
		}
	}

	private async createKeyboardLayoutService(mainProcessService: IMainProcessService): Promise<NativeKeyboardLayoutService> {
		const keyboardLayoutService = new NativeKeyboardLayoutService(mainProcessService);

		try {
			await keyboardLayoutService.initialize();

			return keyboardLayoutService;
		} catch (error) {
			onUnexpectedError(error);

			return keyboardLayoutService;
		}
	}
}

export function main(configuration: INativeWindowConfiguration): Promise<void> {
	const workbench = new DesktopMain(configuration);

	return workbench.open();
}
