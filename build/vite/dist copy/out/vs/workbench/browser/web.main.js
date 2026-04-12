/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mark } from '../../base/common/performance.js';
import { domContentLoaded, detectFullscreen, getCookieValue, getWindow } from '../../base/browser/dom.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILogService, ConsoleLogger, getLogLevel, ILoggerService } from '../../platform/log/common/log.js';
import { ConsoleLogInAutomationLogger } from '../../platform/log/browser/log.js';
import { Disposable, DisposableStore, toDisposable } from '../../base/common/lifecycle.js';
import { BrowserWorkbenchEnvironmentService, IBrowserWorkbenchEnvironmentService } from '../services/environment/browser/environmentService.js';
import { Workbench } from './workbench.js';
import { RemoteFileSystemProviderClient } from '../services/remote/common/remoteFileSystemProviderClient.js';
import { IProductService } from '../../platform/product/common/productService.js';
import product from '../../platform/product/common/product.js';
import { RemoteAgentService } from '../services/remote/browser/remoteAgentService.js';
import { RemoteAuthorityResolverService } from '../../platform/remote/browser/remoteAuthorityResolverService.js';
import { IRemoteAuthorityResolverService } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteAgentService } from '../services/remote/common/remoteAgentService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { Schemas, connectionTokenCookieName } from '../../base/common/network.js';
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE, isTemporaryWorkspace, isWorkspaceIdentifier } from '../../platform/workspace/common/workspace.js';
import { IWorkbenchConfigurationService } from '../services/configuration/common/configuration.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { setFullscreen } from '../../base/browser/browser.js';
import { URI } from '../../base/common/uri.js';
import { WorkspaceService } from '../services/configuration/browser/configurationService.js';
import { ConfigurationCache } from '../services/configuration/common/configurationCache.js';
import { ISignService } from '../../platform/sign/common/sign.js';
import { SignService } from '../../platform/sign/browser/signService.js';
import { BrowserStorageService } from '../services/storage/browser/storageService.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { toLocalISOString } from '../../base/common/date.js';
import { isWorkspaceToOpen, isFolderToOpen } from '../../platform/window/common/window.js';
import { getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from '../services/workspaces/browser/workspaces.js';
import { InMemoryFileSystemProvider } from '../../platform/files/common/inMemoryFilesystemProvider.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IndexedDBFileSystemProvider } from '../../platform/files/browser/indexedDBFileSystemProvider.js';
import { BrowserRequestService } from '../services/request/browser/requestService.js';
import { IRequestService } from '../../platform/request/common/request.js';
import { IUserDataInitializationService, UserDataInitializationService } from '../services/userData/browser/userDataInit.js';
import { UserDataSyncStoreManagementService } from '../../platform/userDataSync/common/userDataSyncStoreService.js';
import { IUserDataSyncStoreManagementService } from '../../platform/userDataSync/common/userDataSync.js';
import { ILifecycleService } from '../services/lifecycle/common/lifecycle.js';
import { Action2, MenuId, registerAction2 } from '../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
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
import { IProgressService } from '../../platform/progress/common/progress.js';
import { DelayedLogChannel } from '../services/output/common/delayedLogChannel.js';
import { dirname, joinPath } from '../../base/common/resources.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { IPolicyService } from '../../platform/policy/common/policy.js';
import { IRemoteExplorerService } from '../services/remote/common/remoteExplorerService.js';
import { DisposableTunnel, TunnelProtocol } from '../../platform/tunnel/common/tunnel.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { UserDataProfileService } from '../services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../services/userDataProfile/common/userDataProfile.js';
import { BrowserUserDataProfilesService } from '../../platform/userDataProfile/browser/userDataProfile.js';
import { DeferredPromise, timeout } from '../../base/common/async.js';
import { windowLogGroup, windowLogId } from '../services/log/common/logConstants.js';
import { LogService } from '../../platform/log/common/logService.js';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from '../../platform/remote/common/remoteSocketFactoryService.js';
import { BrowserSocketFactory } from '../../platform/remote/browser/browserSocketFactory.js';
import { VSBuffer } from '../../base/common/buffer.js';
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
import { IDefaultAccountService } from '../../platform/defaultAccount/common/defaultAccount.js';
import { DefaultAccountService } from '../services/accounts/browser/defaultAccount.js';
import { AccountPolicyService } from '../services/policies/common/accountPolicyService.js';
export class BrowserMain extends Disposable {
    constructor(domElement, configuration) {
        super();
        this.domElement = domElement;
        this.configuration = configuration;
        this.onWillShutdownDisposables = this._register(new DisposableStore());
        this.indexedDBFileSystemProviders = [];
        this.init();
    }
    init() {
        // Browser config
        setFullscreen(!!detectFullscreen(mainWindow), mainWindow);
    }
    async open() {
        // Init services and wait for DOM to be ready in parallel
        const [services] = await Promise.all([this.initServices(), domContentLoaded(getWindow(this.domElement))]);
        // Create Workbench
        const workbench = this.createWorkbench(this.domElement, services.serviceCollection, services.logService);
        // Listeners
        this.registerListeners(workbench);
        // Startup
        const instantiationService = workbench.startup();
        // Window
        this._register(instantiationService.createInstance(BrowserWindow));
        // Logging
        services.logService.trace('workbench#open with configuration', safeStringify(this.configuration));
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
            async function showMessage(severity, message, ...items) {
                const choice = new DeferredPromise();
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
            let logger = undefined;
            return {
                commands: {
                    executeCommand: (command, ...args) => commandService.executeCommand(command, ...args)
                },
                env: {
                    async getUriScheme() {
                        return productService.urlProtocol;
                    },
                    async retrievePerformanceMarks() {
                        await timerService.whenReady();
                        return timerService.getPerformanceMarks();
                    },
                    async openUri(uri) {
                        return openerService.open(URI.isUri(uri) ? uri : URI.from(uri), {});
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
                    openTunnel: async (tunnelOptions) => {
                        const tunnel = assertReturnsDefined(await remoteExplorerService.forward({
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
                        return new class extends DisposableTunnel {
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
    createWorkbench(domElement, serviceCollection, logService) {
        return new Workbench(domElement, undefined, serviceCollection, logService);
    }
    registerListeners(workbench) {
        // Workbench Lifecycle
        this._register(workbench.onWillShutdown(() => this.onWillShutdownDisposables.clear()));
        this._register(workbench.onDidShutdown(() => this.dispose()));
    }
    async initServices() {
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
        const productService = mixin({ _serviceBrand: undefined, ...product }, this.configuration.productConfiguration);
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
        const otherLoggers = [new ConsoleLogger(loggerService.getLogLevel())];
        if (environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI) {
            otherLoggers.push(new ConsoleLogInAutomationLogger(loggerService.getLogLevel()));
        }
        const logger = loggerService.createLogger(environmentService.logFile, { id: windowLogId, name: windowLogGroup.name, group: windowLogGroup });
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
        remoteSocketFactoryService.register(0 /* RemoteConnectionType.WebSocket */, new BrowserSocketFactory(this.configuration.webSocketFactory));
        serviceCollection.set(IRemoteSocketFactoryService, remoteSocketFactoryService);
        const remoteAgentService = this._register(new RemoteAgentService(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService));
        serviceCollection.set(IRemoteAgentService, remoteAgentService);
        this._register(RemoteFileSystemProviderClient.register(remoteAgentService, fileService, logService));
        // Default Account
        const defaultAccountService = this._register(new DefaultAccountService(productService));
        serviceCollection.set(IDefaultAccountService, defaultAccountService);
        // Policies
        const policyService = new AccountPolicyService(logService, defaultAccountService);
        serviceCollection.set(IPolicyService, policyService);
        // Long running services (workspace, config, storage)
        const [configurationService, storageService] = await Promise.all([
            this.createWorkspaceService(workspace, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, policyService, logService).then(service => {
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
        const encryptionService = new EncryptionService();
        serviceCollection.set(IEncryptionService, encryptionService);
        const secretStorageService = new BrowserSecretStorageService(storageService, encryptionService, environmentService, logService);
        serviceCollection.set(ISecretStorageService, secretStorageService);
        // Userdata Initialize Service
        const userDataInitializers = [];
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
                this.initializeUserData(userDataInitializationService, configurationService)
            ]);
        }
        catch (error) {
            logService.error(error);
        }
        return { serviceCollection, configurationService, logService };
    }
    async initializeUserData(userDataInitializationService, configurationService) {
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
    async registerIndexedDBFileSystemProviders(environmentService, fileService, logService, loggerService, logsPath) {
        // IndexedDB is used for logging and user data
        let indexedDB;
        const userDataStore = 'vscode-userdata-store';
        const logsStore = 'vscode-logs-store';
        const handlesStore = 'vscode-filehandles-store';
        try {
            indexedDB = await IndexedDB.create('vscode-web-db', 3, [userDataStore, logsStore, handlesStore]);
            // Close onWillShutdown
            this.onWillShutdownDisposables.add(toDisposable(() => indexedDB?.close()));
        }
        catch (error) {
            logService.error('Error while creating IndexedDB', error);
        }
        // Logger
        if (indexedDB) {
            const logFileSystemProvider = new IndexedDBFileSystemProvider(logsPath.scheme, indexedDB, logsStore, false);
            this.indexedDBFileSystemProviders.push(logFileSystemProvider);
            fileService.registerProvider(logsPath.scheme, logFileSystemProvider);
        }
        else {
            fileService.registerProvider(logsPath.scheme, new InMemoryFileSystemProvider());
        }
        // User data
        let userDataProvider;
        if (indexedDB) {
            userDataProvider = new IndexedDBFileSystemProvider(Schemas.vscodeUserData, indexedDB, userDataStore, true);
            this.indexedDBFileSystemProviders.push(userDataProvider);
            this.registerDeveloperActions(userDataProvider);
        }
        else {
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
    registerDeveloperActions(provider) {
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
            async run(accessor) {
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
                    }
                    catch (error) {
                        logService.error(error);
                        throw error;
                    }
                }
                hostService.reload();
            }
        }));
    }
    async createStorageService(workspace, logService, userDataProfileService) {
        const storageService = new BrowserStorageService(workspace, userDataProfileService, logService);
        try {
            await storageService.initialize();
            // Register to close on shutdown
            this.onWillShutdownDisposables.add(toDisposable(() => storageService.close()));
            return storageService;
        }
        catch (error) {
            onUnexpectedError(error);
            logService.error(error);
            return storageService;
        }
    }
    async createWorkspaceService(workspace, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, policyService, logService) {
        // Temporary workspaces do not exist on startup because they are
        // just in memory. As such, detect this case and eagerly create
        // the workspace file empty so that it is a valid workspace.
        if (isWorkspaceIdentifier(workspace) && isTemporaryWorkspace(workspace.configPath)) {
            try {
                const emptyWorkspace = { folders: [] };
                await fileService.createFile(workspace.configPath, VSBuffer.fromString(JSON.stringify(emptyWorkspace, null, '\t')), { overwrite: false });
            }
            catch (error) {
                // ignore if workspace file already exists
            }
        }
        const configurationCache = new ConfigurationCache([Schemas.file, Schemas.vscodeUserData, Schemas.tmp] /* Cache all non native resources */, environmentService, fileService);
        const workspaceService = new WorkspaceService({ remoteAuthority: this.configuration.remoteAuthority, configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService);
        try {
            await workspaceService.initialize(workspace);
            return workspaceService;
        }
        catch (error) {
            onUnexpectedError(error);
            logService.error(error);
            return workspaceService;
        }
    }
    async getCurrentProfile(workspace, userDataProfilesService, environmentService) {
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
    resolveWorkspace() {
        let workspace = undefined;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViLm1haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci93ZWIubWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMxRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFXLE1BQU0sa0NBQWtDLENBQUM7QUFDcEgsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0YsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDaEosT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzNDLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRTdHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNsRixPQUFPLE9BQU8sTUFBTSwwQ0FBMEMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNqSCxPQUFPLEVBQUUsK0JBQStCLEVB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