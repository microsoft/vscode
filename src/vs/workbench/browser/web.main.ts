/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from '../../base/common/performance.js';
import { domContentLoaded, detectFullscreen, getCookieValue, getWindow } from '../../base/browser/dom.js';
import { assertIsDefined } from '../../base/common/types.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService, ConsoleLogger, getLogLevel, ILoggerService, ILogger } from '../../platform/log/common/log.js';
import { ConsoleLogInAutomationLogger } from '../../platform/log/browser/log.js';
import { Disposable, DisposableStore, toDisposable } from '../../base/common/lifecycle.js';
import { BrowserWorkbenchEnvironmentService, IBrowserWorkbenchEnvironmentService } from '../services/environment/browser/environmentService.js';
import { Workbench } from './workbench.js';
import { RemoteFileSystemProviderClient } from '../services/remote/common/remoteFileSystemProviderClient.js';
import { IWorkbenchEnvironmentService } from '../services/environment/common/environmentService.js';
import { IProductService } from '../../platform/product/common/productService.js';
import product from '../../platform/product/common/product.js';
import { RemoteAgentService } from '../services/remote/browser/remoteAgentService.js';
import { RemoteAuthorityResolverService } from '../../platform/remote/browser/remoteAuthorityResolverService.js';
import { IRemoteAuthorityResolverService, RemoteConnectionType } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteAgentService } from '../services/remote/common/remoteAgentService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { Schemas, connectionTokenCookieName } from '../../base/common/network.js';
import { IAnyWorkspaceIdentifier, IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE, isTemporaryWorkspace, isWorkspaceIdentifier } from '../../platform/workspace/common/workspace.js';
import { IWorkbenchConfigurationService } from '../services/configuration/common/configuration.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { setFullscreen } from '../../base/browser/browser.js';
import { URI } from '../../base/common/uri.js';
import { WorkspaceService } from '../services/configuration/browser/configurationService.js';
import { ConfigurationCache } from '../services/configuration/common/configurationCache.js';
import { ISignService } from '../../platform/sign/common/sign.js';
import { SignService } from '../../platform/sign/browser/signService.js';
import { IWorkbenchConstructionOptions, IWorkbench, IWorkspace, ITunnel } from './web.api.js';
import { BrowserStorageService } from '../services/storage/browser/storageService.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { toLocalISOString } from '../../base/common/date.js';
import { isWorkspaceToOpen, isFolderToOpen } from '../../platform/window/common/window.js';
import { getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from '../services/workspaces/browser/workspaces.js';
import { InMemoryFileSystemProvider } from '../../platform/files/common/inMemoryFilesystemProvider.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IndexedDBFileSystemProviderErrorDataClassification, IndexedDBFileSystemProvider, IndexedDBFileSystemProviderErrorData } from '../../platform/files/browser/indexedDBFileSystemProvider.js';
import { BrowserRequestService } from '../services/request/browser/requestService.js';
import { IRequestService } from '../../platform/request/common/request.js';
import { IUserDataInitializationService, IUserDataInitializer, UserDataInitializationService } from '../services/userData/browser/userDataInit.js';
import { UserDataSyncStoreManagementService } from '../../platform/userDataSync/common/userDataSyncStoreService.js';
import { IUserDataSyncStoreManagementService } from '../../platform/userDataSync/common/userDataSync.js';
import { ILifecycleService } from '../services/lifecycle/common/lifecycle.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { localize, localize2 } from '../../nls.js';
import { Categories } from '../../platform/action/common/actionCommonCategories.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../services/host/browser/host.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService.js';
import { BrowserWindow } from './window.js';
import { ITimerService } from '../services/timer/browser/timerService.js';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService } from '../services/workspaces/common/workspaceTrust.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../platform/workspace/common/workspaceTrust.js';
import { HTMLFileSystemProvider } from '../../platform/files/browser/htmlFileSystemProvider.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { mixin, safeStringify } from '../../base/common/objects.js';
import { IndexedDB } from '../../base/browser/indexedDB.js';
import { WebFileSystemAccess } from '../../platform/files/browser/webFileSystemAccess.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IProgressService } from '../../platform/progress/common/progress.js';
import { DelayedLogChannel } from '../services/output/common/delayedLogChannel.js';
import { dirname, joinPath } from '../../base/common/resources.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { NullPolicyService } from '../../platform/policy/common/policy.js';
import { IRemoteExplorerService } from '../services/remote/common/remoteExplorerService.js';
import { DisposableTunnel, TunnelProtocol } from '../../platform/tunnel/common/tunnel.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { UserDataProfileService } from '../services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../services/userDataProfile/common/userDataProfile.js';
import { BrowserUserDataProfilesService } from '../../platform/userDataProfile/browser/userDataProfile.js';
import { DeferredPromise, timeout } from '../../base/common/async.js';
import { windowLogId } from '../services/log/common/logConstants.js';
import { LogService } from '../../platform/log/common/logService.js';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from '../../platform/remote/common/remoteSocketFactoryService.js';
import { BrowserSocketFactory } from '../../platform/remote/browser/browserSocketFactory.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { IStoredWorkspace } from '../../platform/workspaces/common/workspaces.js';
import { UserDataProfileInitializer } from '../services/userDataProfile/browser/userDataProfileInit.js';
import { UserDataSyncInitializer } from '../services/userDataSync/browser/userDataSyncInit.js';
import { BrowserRemoteResourceLoader } from '../services/remote/browser/browserRemoteResourceHandler.js';
import { BufferLogger } from '../../platform/log/common/bufferLog.js';
import { FileLoggerService } from '../../platform/log/common/fileLog.js';
import { IEmbedderTerminalService } from '../services/terminal/common/embedderTerminalService.js';
import { BrowserSecretStorageService } from '../services/secrets/browser/secretStorageService.js';
import { EncryptionService } from '../services/encryption/browser/encryptionService.js';
import { IEncryptionService } from '../../platform/encryption/common/encryptionService.js';
import { ISecretStorageService } from '../../platform/secrets/common/secrets.js';
import { TunnelSource } from '../services/remote/common/tunnelModel.js';
import { mainWindow } from '../../base/browser/window.js';
import { INotificationService, Severity } from '../../platform/notification/common/notification.js';

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
		setFullscreen(!!detectFullscreen(mainWindow), mainWindow);
	}

	async open(): Promise<IWorkbench> {

		// Init services and wait for DOM to be ready in parallel
		const [services] = await Promise.all([this.initServices(), domContentLoaded(getWindow(this.domElement))]);

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
			const remoteAuthorityResolverService = accessor.get(IRemoteAuthorityResolverService);
			const notificationService = accessor.get(INotificationService);

			async function showMessage<T extends string>(severity: Severity, message: string, ...items: T[]): Promise<T | undefined> {
				const choice = new DeferredPromise<T | undefined>();
				const handle = notificationService.prompt(severity, message, items.map(item => ({
					label: item,
					run: () => choice.complete(item)
				})));
				const disposable = handle.onDidClose(() => {
					choice.complete(undefined);
					disposable.dispose();
				});
				const result = await choice.p;
				handle.close();
				return result;
			}

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
					createTerminal: async (options) => embedderTerminalService.createTerminal(options),
					showInformationMessage: (message, ...items) => showMessage(Severity.Info, message, ...items),
				},
				workspace: {
					didResolveRemoteAuthority: async () => {
						if (!this.configuration.remoteAuthority) {
							return;
						}

						await remoteAuthorityResolverService.resolveAuthority(this.configuration.remoteAuthority);
					},
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

						if (typeof tunnel === 'string') {
							throw new Error(tunnel);
						}

						return new class extends DisposableTunnel implements ITunnel {
							declare localAddress: string;
						}({
							port: tunnel.tunnelRemotePort,
							host: tunnel.tunnelRemoteHost
						}, tunnel.localAddress, () => tunnel.dispose());
					}
				},
				shutdown: () => lifecycleService.shutdown()
			} satisfies IWorkbench;
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
		serviceCollection.set(IFileService, fileService);

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


		const connectionToken = environmentService.options.connectionToken || getCookieValue(connectionTokenCookieName);
		const remoteResourceLoader = this.configuration.remoteResourceProvider ? new BrowserRemoteResourceLoader(fileService, this.configuration.remoteResourceProvider) : undefined;
		const resourceUriProvider = this.configuration.resourceUriProvider ?? remoteResourceLoader?.getResourceUriProvider();
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService(!environmentService.expectsResolverExtension, connectionToken, resourceUriProvider, this.configuration.serverBasePath, productService, logService);
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
		await userDataProfilesService.setProfileForWorkspace(workspace, currentProfile);
		const userDataProfileService = new UserDataProfileService(currentProfile);
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
		const requestService = new BrowserRequestService(remoteAgentService, configurationService, logService);
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

		const encryptionService = new EncryptionService();
		serviceCollection.set(IEncryptionService, encryptionService);
		const secretStorageService = new BrowserSecretStorageService(storageService, encryptionService, environmentService, logService);
		serviceCollection.set(ISecretStorageService, secretStorageService);

		// Userdata Initialize Service
		const userDataInitializers: IUserDataInitializer[] = [];
		userDataInitializers.push(new UserDataSyncInitializer(environmentService, secretStorageService, userDataSyncStoreManagementService, fileService, userDataProfilesService, storageService, productService, requestService, logService, uriIdentityService));
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

	private async registerIndexedDBFileSystemProviders(environmentService: IWorkbenchEnvironmentService, fileService: IFileService, logService: ILogService, loggerService: ILoggerService, logsPath: URI): Promise<void> {

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
		if (WebFileSystemAccess.supported(mainWindow)) {
			fileService.registerProvider(Schemas.file, new HTMLFileSystemProvider(indexedDB, handlesStore, logService));
		}

		// In-memory
		fileService.registerProvider(Schemas.tmp, new InMemoryFileSystemProvider());
	}

	private registerDeveloperActions(provider: IndexedDBFileSystemProvider): void {
		this._register(registerAction2(class ResetUserDataAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.resetUserData',
					title: localize2('reset', "Reset User Data"),
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
					} catch (error) {
						logService.error(error);
						throw error;
					}
				}

				hostService.reload();
			}
		}));
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

	private async getCurrentProfile(workspace: IAnyWorkspaceIdentifier, userDataProfilesService: BrowserUserDataProfilesService, environmentService: BrowserWorkbenchEnvironmentService): Promise<IUserDataProfile> {
		const profileName = environmentService.options?.profile?.name ?? environmentService.profile;
		if (profileName) {
			const profile = userDataProfilesService.profiles.find(p => p.name === profileName);
			if (profile) {
				return profile;
			}
			return userDataProfilesService.createNamedProfile(profileName, undefined, workspace);
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
