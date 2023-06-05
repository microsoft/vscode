/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from 'vs/base/common/performance';
import { domContentLoaded, detectFullscreen, getCookieValue } from 'vs/base/browser/dom';
import { assertIsDefined } from 'vs/base/common/types';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService, ConsoleLogger, getLogLevel, ILoggerService, ILogger } from 'vs/platform/log/common/log';
import { ConsoleLogInAutomationLogger } from 'vs/platform/log/browser/log';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { BrowserWorkbenchEnvironmentService, IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { Workbench } from 'vs/workbench/browser/workbench';
import { RemoteFileSystemProviderClient } from 'vs/workbench/services/remote/common/remoteFileSystemProviderClient';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IProductService } from 'vs/platform/product/common/productService';
import product from 'vs/platform/product/common/product';
import { RemoteAgentService } from 'vs/workbench/services/remote/browser/remoteAgentService';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/browser/remoteAuthorityResolverService';
import { IRemoteAuthorityResolverService, RemoteConnectionType } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IWorkbenchFileService } from 'vs/workbench/services/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas, connectionTokenCookieName } from 'vs/base/common/network';
import { IAnyWorkspaceIdentifier, IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE, isTemporaryWorkspace, isWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { onUnexpectedError } from 'vs/base/common/errors';
import { setFullscreen } from 'vs/base/browser/browser';
import { URI } from 'vs/base/common/uri';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { ConfigurationCache } from 'vs/workbench/services/configuration/common/configurationCache';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/browser/signService';
import { IWorkbenchConstructionOptions, IWorkbench, ITunnel } from 'vs/workbench/browser/web.api';
import { BrowserStorageService } from 'vs/workbench/services/storage/browser/storageService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { toLocalISOString } from 'vs/base/common/date';
import { isWorkspaceToOpen, isFolderToOpen } from 'vs/platform/window/common/window';
import { getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from 'vs/workbench/services/workspaces/browser/workspaces';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IndexedDBFileSystemProviderErrorDataClassification, IndexedDBFileSystemProvider, IndexedDBFileSystemProviderErrorData } from 'vs/platform/files/browser/indexedDBFileSystemProvider';
import { BrowserRequestService } from 'vs/workbench/services/request/browser/requestService';
import { IRequestService } from 'vs/platform/request/common/request';
import { IUserDataInitializationService, IUserDataInitializer, UserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit';
import { UserDataSyncStoreManagementService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IUserDataSyncStoreManagementService } from 'vs/platform/userDataSync/common/userDataSync';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { BrowserWindow } from 'vs/workbench/browser/window';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { HTMLFileSystemProvider } from 'vs/platform/files/browser/htmlFileSystemProvider';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { mixin, safeStringify } from 'vs/base/common/objects';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { IndexedDB } from 'vs/base/browser/indexedDB';
import { BrowserCredentialsService } from 'vs/workbench/services/credentials/browser/credentialsService';
import { IWorkspace } from 'vs/workbench/services/host/browser/browserHostService';
import { WebFileSystemAccess } from 'vs/platform/files/browser/webFileSystemAccess';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { DelayedLogChannel } from 'vs/workbench/services/output/common/delayedLogChannel';
import { dirname, joinPath } from 'vs/base/common/resources';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { NullPolicyService } from 'vs/platform/policy/common/policy';
import { IRemoteExplorerService, TunnelSource } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { DisposableTunnel, TunnelProtocol } from 'vs/platform/tunnel/common/tunnel';
import { ILabelService } from 'vs/platform/label/common/label';
import { UserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfileService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { BrowserUserDataProfilesService } from 'vs/platform/userDataProfile/browser/userDataProfile';
import { timeout } from 'vs/base/common/async';
import { windowLogId } from 'vs/workbench/services/log/common/logConstants';
import { LogService } from 'vs/platform/log/common/logService';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from 'vs/platform/remote/common/remoteSocketFactoryService';
import { BrowserSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { VSBuffer } from 'vs/base/common/buffer';
import { IStoredWorkspace } from 'vs/platform/workspaces/common/workspaces';
import { UserDataProfileInitializer } from 'vs/workbench/services/userDataProfile/browser/userDataProfileInit';
import { UserDataSyncInitializer } from 'vs/workbench/services/userDataSync/browser/userDataSyncInit';
import { BrowserRemoteResourceLoader } from 'vs/workbench/services/remote/browser/browserRemoteResourceHandler';
import { BufferLogger } from 'vs/platform/log/common/bufferLog';
import { FileLoggerService } from 'vs/platform/log/common/fileLog';
import { IEmbedderTerminalService } from 'vs/workbench/services/terminal/common/embedderTerminalService';

export class BrowserMain extends Disposable {

	private readonly onWillShutdownDisposables = this._register(new DisposableStore());
	private readonly indexedDBFileSystemProviders: IndexedDBFileSystemProvider[] = [];

	constructor(
		private readonly domElement: HTMLElement,
		private readonly configuration: IWorkbenchConstructionOptions
	) {
		super();

		this.init();
	}

	private init(): void {

		// Browser config
		setFullscreen(!!detectFullscreen());
	}

	async open(): Promise<IWorkbench> {

		// Init services and wait for DOM to be ready in parallel
		const [services] = await Promise.all([this.initServices(), domContentLoaded()]);

		// Create Workbench
		const workbench = new Workbench(this.domElement, undefined, services.serviceCollection, services.logService);

		// Listeners
		this.registerListeners(workbench);

		// Startup
		const instantiationService = workbench.startup();

		// Window
		this._register(instantiationService.createInstance(BrowserWindow));

		// Logging
		services.logService.trace('workbench#open with configuration', safeStringify(this.configuration));

		instantiationService.invokeFunction(accessor => {
			const telemetryService = accessor.get(ITelemetryService);
			for (const indexedDbFileSystemProvider of this.indexedDBFileSystemProviders) {
				this._register(indexedDbFileSystemProvider.onReportError(e => telemetryService.publicLog2<IndexedDBFileSystemProviderErrorData, IndexedDBFileSystemProviderErrorDataClassification>('indexedDBFileSystemProviderError', e)));
			}
		});

		// Return API Facade
		return instantiationService.invokeFunction(accessor => {
			const commandService = accessor.get(ICommandService);
			const lifecycleService = accessor.get(ILifecycleService);
			const timerService = accessor.get(ITimerService);
			const openerService = accessor.get(IOpenerService);
			const productService = accessor.get(IProductService);
			const progressService = accessor.get(IProgressService);
			const environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
			const instantiationService = accessor.get(IInstantiationService);
			const remoteExplorerService = accessor.get(IRemoteExplorerService);
			const labelService = accessor.get(ILabelService);
			const embedderTerminalService = accessor.get(IEmbedderTerminalService);

			let logger: DelayedLogChannel | undefined = undefined;

			return {
				commands: {
					executeCommand: (command, ...args) => commandService.executeCommand(command, ...args)
				},
				env: {
					async getUriScheme(): Promise<string> {
						return productService.urlProtocol;
					},
					async retrievePerformanceMarks() {
						await timerService.whenReady();

						return timerService.getPerformanceMarks();
					},
					async openUri(uri: URI): Promise<boolean> {
						return openerService.open(uri, {});
					}
				},
				logger: {
					log: (level, message) => {
						if (!logger) {
							logger = instantiationService.createInstance(DelayedLogChannel, 'webEmbedder', productService.embedderIdentifier || productService.nameShort, joinPath(dirname(environmentService.logFile), 'webEmbedder.log'));
						}

						logger.log(level, message);
					}
				},
				window: {
					withProgress: (options, task) => progressService.withProgress(options, task),
					createTerminal: (options) => embedderTerminalService.createTerminal(options),
				},
				workspace: {
					openTunnel: async tunnelOptions => {
						const tunnel = assertIsDefined(await remoteExplorerService.forward({
							remote: tunnelOptions.remoteAddress,
							local: tunnelOptions.localAddressPort,
							name: tunnelOptions.label,
							source: {
								source: TunnelSource.Extension,
								description: labelService.getHostLabel(Schemas.vscodeRemote, this.configuration.remoteAuthority)
							},
							elevateIfNeeded: false,
							privacy: tunnelOptions.privacy
						}, {
							label: tunnelOptions.label,
							elevateIfNeeded: undefined,
							onAutoForward: undefined,
							requireLocalPort: undefined,
							protocol: tunnelOptions.protocol === TunnelProtocol.Https ? tunnelOptions.protocol : TunnelProtocol.Http
						}));

						return new class extends DisposableTunnel implements ITunnel {
							declare localAddress: string;
						}({
							port: tunnel.tunnelRemotePort,
							host: tunnel.tunnelRemoteHost
						}, tunnel.localAddress, () => tunnel.dispose());
					}
				},
				shutdown: () => lifecycleService.shutdown()
			};
		});
	}

	private registerListeners(workbench: Workbench): void {

		// Workbench Lifecycle
		this._register(workbench.onWillShutdown(() => this.onWillShutdownDisposables.clear()));
		this._register(workbench.onDidShutdown(() => this.dispose()));
	}

	private async initServices(): Promise<{ serviceCollection: ServiceCollection; configurationService: IWorkbenchConfigurationService; logService: ILogService }> {
		const serviceCollection = new ServiceCollection();


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.web.main.ts` if the service
		//       is web only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		const workspace = this.resolveWorkspace();

		// Product
		const productService: IProductService = mixin({ _serviceBrand: undefined, ...product }, this.configuration.productConfiguration);
		serviceCollection.set(IProductService, productService);

		// Environment
		const logsPath = URI.file(toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')).with({ scheme: 'vscode-log' });
		const environmentService = new BrowserWorkbenchEnvironmentService(workspace.id, logsPath, this.configuration, productService);
		serviceCollection.set(IBrowserWorkbenchEnvironmentService, environmentService);

		// Files
		const fileLogger = new BufferLogger();
		const fileService = this._register(new FileService(fileLogger));
		serviceCollection.set(IWorkbenchFileService, fileService);

		// Logger
		const loggerService = new FileLoggerService(getLogLevel(environmentService), logsPath, fileService);
		serviceCollection.set(ILoggerService, loggerService);

		// Log Service
		const otherLoggers: ILogger[] = [new ConsoleLogger(loggerService.getLogLevel())];
		if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
			otherLoggers.push(new ConsoleLogInAutomationLogger(loggerService.getLogLevel()));
		}
		const logger = loggerService.createLogger(environmentService.logFile, { id: windowLogId, name: localize('rendererLog', "Window") });
		const logService = new LogService(logger, otherLoggers);
		serviceCollection.set(ILogService, logService);

		// Set the logger of the fileLogger after the log service is ready.
		// This is to avoid cyclic dependency
		fileLogger.logger = logService;

		// Register File System Providers depending on IndexedDB support
		// Register them early because they are needed for the profiles initialization
		await this.registerIndexedDBFileSystemProviders(environmentService, fileService, logService, loggerService, logsPath);

		// Remote
		const connectionToken = environmentService.options.connectionToken || getCookieValue(connectionTokenCookieName);
		const remoteResourceLoader = this.configuration.remoteResourceProvider ? new BrowserRemoteResourceLoader(fileService, this.configuration.remoteResourceProvider) : undefined;
		const resourceUriProvider = this.configuration.resourceUriProvider ?? remoteResourceLoader?.getResourceUriProvider();
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService(!environmentService.expectsResolverExtension, connectionToken, resourceUriProvider, productService, logService);
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		// Signing
		const signService = new SignService(productService);
		serviceCollection.set(ISignService, signService);


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.web.main.ts` if the service
		//       is web only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		// URI Identity
		const uriIdentityService = new UriIdentityService(fileService);
		serviceCollection.set(IUriIdentityService, uriIdentityService);

		// User Data Profiles
		const userDataProfilesService = new BrowserUserDataProfilesService(environmentService, fileService, uriIdentityService, logService);
		serviceCollection.set(IUserDataProfilesService, userDataProfilesService);

		const currentProfile = await this.getCurrentProfile(workspace, userDataProfilesService, environmentService);
		const userDataProfileService = new UserDataProfileService(currentProfile, userDataProfilesService);
		serviceCollection.set(IUserDataProfileService, userDataProfileService);

		// Remote Agent
		const remoteSocketFactoryService = new RemoteSocketFactoryService();
		remoteSocketFactoryService.register(RemoteConnectionType.WebSocket, new BrowserSocketFactory(this.configuration.webSocketFactory));
		serviceCollection.set(IRemoteSocketFactoryService, remoteSocketFactoryService);
		const remoteAgentService = this._register(new RemoteAgentService(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);
		this._register(RemoteFileSystemProviderClient.register(remoteAgentService, fileService, logService));

		// Long running services (workspace, config, storage)
		const [configurationService, storageService] = await Promise.all([
			this.createWorkspaceService(workspace, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService).then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IWorkbenchConfigurationService, service);

				return service;
			}),

			this.createStorageService(workspace, logService, userDataProfileService).then(service => {

				// Storage
				serviceCollection.set(IStorageService, service);

				return service;
			})
		]);

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.web.main.ts` if the service
		//       is web only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!


		// Workspace Trust Service
		const workspaceTrustEnablementService = new WorkspaceTrustEnablementService(configurationService, environmentService);
		serviceCollection.set(IWorkspaceTrustEnablementService, workspaceTrustEnablementService);

		const workspaceTrustManagementService = new WorkspaceTrustManagementService(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, configurationService, workspaceTrustEnablementService, fileService);
		serviceCollection.set(IWorkspaceTrustManagementService, workspaceTrustManagementService);

		// Update workspace trust so that configuration is updated accordingly
		configurationService.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
		this._register(workspaceTrustManagementService.onDidChangeTrust(() => configurationService.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted())));

		// Request Service
		const requestService = new BrowserRequestService(remoteAgentService, configurationService, loggerService);
		serviceCollection.set(IRequestService, requestService);

		// Userdata Sync Store Management Service
		const userDataSyncStoreManagementService = new UserDataSyncStoreManagementService(productService, configurationService, storageService);
		serviceCollection.set(IUserDataSyncStoreManagementService, userDataSyncStoreManagementService);


		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Please do NOT register services here. Use `registerSingleton()`
		//       from `workbench.common.main.ts` if the service is shared between
		//       desktop and web or `workbench.web.main.ts` if the service
		//       is web only.
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		// Credentials Service
		const credentialsService = new BrowserCredentialsService(environmentService, remoteAgentService, productService);
		serviceCollection.set(ICredentialsService, credentialsService);

		// Userdata Initialize Service
		const userDataInitializers: IUserDataInitializer[] = [];
		userDataInitializers.push(new UserDataSyncInitializer(environmentService, credentialsService, userDataSyncStoreManagementService, fileService, userDataProfilesService, storageService, productService, requestService, logService, uriIdentityService));
		if (environmentService.options.profile) {
			userDataInitializers.push(new UserDataProfileInitializer(environmentService, fileService, userDataProfileService, storageService, logService, uriIdentityService, requestService));
		}
		const userDataInitializationService = new UserDataInitializationService(userDataInitializers);
		serviceCollection.set(IUserDataInitializationService, userDataInitializationService);

		try {
			await Promise.race([
				// Do not block more than 5s
				timeout(5000),
				this.initializeUserData(userDataInitializationService, configurationService)]
			);
		} catch (error) {
			logService.error(error);
		}

		return { serviceCollection, configurationService, logService };
	}

	private async initializeUserData(userDataInitializationService: UserDataInitializationService, configurationService: WorkspaceService) {
		if (await userDataInitializationService.requiresInitialization()) {
			mark('code/willInitRequiredUserData');

			// Initialize required resources - settings & global state
			await userDataInitializationService.initializeRequiredResources();

			// Important: Reload only local user configuration after initializing
			// Reloading complete configuration blocks workbench until remote configuration is loaded.
			await configurationService.reloadLocalUserConfiguration();

			mark('code/didInitRequiredUserData');
		}
	}

	private async registerIndexedDBFileSystemProviders(environmentService: IWorkbenchEnvironmentService, fileService: IWorkbenchFileService, logService: ILogService, loggerService: ILoggerService, logsPath: URI): Promise<void> {
		// IndexedDB is used for logging and user data
		let indexedDB: IndexedDB | undefined;
		const userDataStore = 'vscode-userdata-store';
		const logsStore = 'vscode-logs-store';
		const handlesStore = 'vscode-filehandles-store';
		try {
			indexedDB = await IndexedDB.create('vscode-web-db', 3, [userDataStore, logsStore, handlesStore]);

			// Close onWillShutdown
			this.onWillShutdownDisposables.add(toDisposable(() => indexedDB?.close()));
		} catch (error) {
			logService.error('Error while creating IndexedDB', error);
		}

		// Logger
		if (indexedDB) {
			const logFileSystemProvider = new IndexedDBFileSystemProvider(logsPath.scheme, indexedDB, logsStore, false);
			this.indexedDBFileSystemProviders.push(logFileSystemProvider);
			fileService.registerProvider(logsPath.scheme, logFileSystemProvider);
		} else {
			fileService.registerProvider(logsPath.scheme, new InMemoryFileSystemProvider());
		}

		// User data
		let userDataProvider;
		if (indexedDB) {
			userDataProvider = new IndexedDBFileSystemProvider(Schemas.vscodeUserData, indexedDB, userDataStore, true);
			this.indexedDBFileSystemProviders.push(userDataProvider);
			this.registerDeveloperActions(<IndexedDBFileSystemProvider>userDataProvider);
		} else {
			logService.info('Using in-memory user data provider');
			userDataProvider = new InMemoryFileSystemProvider();
		}
		fileService.registerProvider(Schemas.vscodeUserData, userDataProvider);

		// Local file access (if supported by browser)
		if (WebFileSystemAccess.supported(window)) {
			fileService.registerProvider(Schemas.file, new HTMLFileSystemProvider(indexedDB, handlesStore, logService));
		}

		// In-memory
		fileService.registerProvider(Schemas.tmp, new InMemoryFileSystemProvider());
	}

	private registerDeveloperActions(provider: IndexedDBFileSystemProvider): void {
		registerAction2(class ResetUserDataAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.resetUserData',
					title: { original: 'Reset User Data', value: localize('reset', "Reset User Data") },
					category: Categories.Developer,
					menu: {
						id: MenuId.CommandPalette
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const dialogService = accessor.get(IDialogService);
				const hostService = accessor.get(IHostService);
				const storageService = accessor.get(IStorageService);
				const credentialsService = accessor.get(ICredentialsService);
				const logService = accessor.get(ILogService);
				const result = await dialogService.confirm({
					message: localize('reset user data message', "Would you like to reset your data (settings, keybindings, extensions, snippets and UI State) and reload?")
				});

				if (result.confirmed) {
					try {
						await provider?.reset();
						if (storageService instanceof BrowserStorageService) {
							await storageService.clear();
						}
						if (typeof credentialsService.clear === 'function') {
							await credentialsService.clear();
						}
					} catch (error) {
						logService.error(error);
						throw error;
					}
				}

				hostService.reload();
			}
		});
	}

	private async createStorageService(workspace: IAnyWorkspaceIdentifier, logService: ILogService, userDataProfileService: IUserDataProfileService): Promise<IStorageService> {
		const storageService = new BrowserStorageService(workspace, userDataProfileService, logService);

		try {
			await storageService.initialize();

			// Register to close on shutdown
			this.onWillShutdownDisposables.add(toDisposable(() => storageService.close()));

			return storageService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return storageService;
		}
	}

	private async createWorkspaceService(workspace: IAnyWorkspaceIdentifier, environmentService: IBrowserWorkbenchEnvironmentService, userDataProfileService: IUserDataProfileService, userDataProfilesService: IUserDataProfilesService, fileService: FileService, remoteAgentService: IRemoteAgentService, uriIdentityService: IUriIdentityService, logService: ILogService): Promise<WorkspaceService> {

		// Temporary workspaces do not exist on startup because they are
		// just in memory. As such, detect this case and eagerly create
		// the workspace file empty so that it is a valid workspace.

		if (isWorkspaceIdentifier(workspace) && isTemporaryWorkspace(workspace.configPath)) {
			try {
				const emptyWorkspace: IStoredWorkspace = { folders: [] };
				await fileService.createFile(workspace.configPath, VSBuffer.fromString(JSON.stringify(emptyWorkspace, null, '\t')), { overwrite: false });
			} catch (error) {
				// ignore if workspace file already exists
			}
		}

		const configurationCache = new ConfigurationCache([Schemas.file, Schemas.vscodeUserData, Schemas.tmp] /* Cache all non native resources */, environmentService, fileService);
		const workspaceService = new WorkspaceService({ remoteAuthority: this.configuration.remoteAuthority, configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, new NullPolicyService());

		try {
			await workspaceService.initialize(workspace);

			return workspaceService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return workspaceService;
		}
	}

	private async getCurrentProfile(workspace: IAnyWorkspaceIdentifier, userDataProfilesService: BrowserUserDataProfilesService, environmentService: IBrowserWorkbenchEnvironmentService): Promise<IUserDataProfile> {
		if (environmentService.options?.profile) {
			const profile = userDataProfilesService.profiles.find(p => p.name === environmentService.options?.profile?.name);
			if (profile) {
				return profile;
			}
			return userDataProfilesService.createNamedProfile(environmentService.options?.profile?.name, undefined, workspace);
		}
		return userDataProfilesService.getProfileForWorkspace(workspace) ?? userDataProfilesService.defaultProfile;
	}

	private resolveWorkspace(): IAnyWorkspaceIdentifier {
		let workspace: IWorkspace | undefined = undefined;
		if (this.configuration.workspaceProvider) {
			workspace = this.configuration.workspaceProvider.workspace;
		}

		// Multi-root workspace
		if (workspace && isWorkspaceToOpen(workspace)) {
			return getWorkspaceIdentifier(workspace.workspaceUri);
		}

		// Single-folder workspace
		if (workspace && isFolderToOpen(workspace)) {
			return getSingleFolderWorkspaceIdentifier(workspace.folderUri);
		}

		// Empty window workspace
		return UNKNOWN_EMPTY_WINDOW_WORKSPACE;
	}
}
