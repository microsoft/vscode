/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../nls.js';
import product from '../../platform/product/common/product.js';
import { hasNativeMenu } from '../../platform/window/common/window.js';
import { NativeWindow } from '../../workbench/electron-browser/window.js';
import { setFullscreen } from '../../base/browser/browser.js';
import { domContentLoaded } from '../../base/browser/dom.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { URI } from '../../base/common/uri.js';
import { INativeWorkbenchEnvironmentService, NativeWorkbenchEnvironmentService } from '../../workbench/services/environment/electron-browser/environmentService.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILoggerService, ILogService, LogLevel } from '../../platform/log/common/log.js';
import { NativeWorkbenchStorageService } from '../../workbench/services/storage/electron-browser/storageService.js';
import { IWorkspaceContextService, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, reviveIdentifier } from '../../platform/workspace/common/workspace.js';
import { IWorkbenchConfigurationService } from '../../workbench/services/configuration/common/configuration.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { ISharedProcessService } from '../../platform/ipc/electron-browser/services.js';
import { IMainProcessService } from '../../platform/ipc/common/mainProcessService.js';
import { SharedProcessService } from '../../workbench/services/sharedProcess/electron-browser/sharedProcessService.js';
import { RemoteAuthorityResolverService } from '../../platform/remote/electron-browser/remoteAuthorityResolverService.js';
import { IRemoteAuthorityResolverService } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { RemoteAgentService } from '../../workbench/services/remote/electron-browser/remoteAgentService.js';
import { IRemoteAgentService } from '../../workbench/services/remote/common/remoteAgentService.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { RemoteFileSystemProviderClient } from '../../workbench/services/remote/common/remoteFileSystemProviderClient.js';
import { ISignService } from '../../platform/sign/common/sign.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService.js';
import { INativeKeyboardLayoutService, NativeKeyboardLayoutService } from '../../workbench/services/keybinding/electron-browser/nativeKeyboardLayoutService.js';
import { ElectronIPCMainProcessService } from '../../platform/ipc/electron-browser/mainProcessService.js';
import { LoggerChannelClient } from '../../platform/log/common/logIpc.js';
import { ProxyChannel } from '../../base/parts/ipc/common/ipc.js';
import { NativeLogService } from '../../workbench/services/log/electron-browser/logService.js';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService } from '../../workbench/services/workspaces/common/workspaceTrust.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../platform/workspace/common/workspaceTrust.js';
import { safeStringify } from '../../base/common/objects.js';
import { IUtilityProcessWorkerWorkbenchService, UtilityProcessWorkerWorkbenchService } from '../../workbench/services/utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';
import { isCI, isMacintosh, isTahoeOrNewer } from '../../base/common/platform.js';
import { Schemas } from '../../base/common/network.js';
import { DiskFileSystemProvider } from '../../workbench/services/files/electron-browser/diskFileSystemProvider.js';
import { FileUserDataProvider } from '../../platform/userData/common/fileUserDataProvider.js';
import { IUserDataProfilesService, reviveProfile } from '../../platform/userDataProfile/common/userDataProfile.js';
import { UserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfileIpc.js';
import { PolicyChannelClient } from '../../platform/policy/common/policyIpc.js';
import { IPolicyService } from '../../platform/policy/common/policy.js';
import { UserDataProfileService } from '../../workbench/services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../../workbench/services/userDataProfile/common/userDataProfile.js';
import { BrowserSocketFactory } from '../../platform/remote/browser/browserSocketFactory.js';
import { RemoteSocketFactoryService, IRemoteSocketFactoryService } from '../../platform/remote/common/remoteSocketFactoryService.js';
import { ElectronRemoteResourceLoader } from '../../platform/remote/electron-browser/electronRemoteResourceLoader.js';
import { applyZoom } from '../../platform/window/electron-browser/window.js';
import { mainWindow } from '../../base/browser/window.js';
import { IDefaultAccountService } from '../../platform/defaultAccount/common/defaultAccount.js';
import { DefaultAccountService } from '../../workbench/services/accounts/browser/defaultAccount.js';
import { AccountPolicyService } from '../../workbench/services/policies/common/accountPolicyService.js';
import { MultiplexPolicyService } from '../../workbench/services/policies/common/multiplexPolicyService.js';
import { Workbench as AgenticWorkbench } from '../browser/workbench.js';
import { NativeMenubarControl } from '../../workbench/electron-browser/parts/titlebar/menubarControl.js';
import { IWorkspaceEditingService } from '../../workbench/services/workspaces/common/workspaceEditing.js';
import { ConfigurationService } from '../services/configuration/browser/configurationService.js';
import { SessionsWorkspaceContextService } from '../services/workspace/browser/workspaceContextService.js';
import { getWorkspaceIdentifier } from '../../workbench/services/workspaces/browser/workspaces.js';
export class SessionsMain extends Disposable {
    constructor(configuration) {
        super();
        this.configuration = configuration;
        this.init();
    }
    init() {
        // Massage configuration file URIs
        this.reviveUris();
        // Apply fullscreen early if configured
        setFullscreen(!!this.configuration.fullscreen, mainWindow);
    }
    reviveUris() {
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
    async open() {
        // Init services and wait for DOM to be ready in parallel
        const [services] = await Promise.all([this.initServices(), domContentLoaded(mainWindow)]);
        // Apply zoom level early
        this.applyWindowZoomLevel(services.configurationService);
        // Create Agentic Workbench
        const workbench = new AgenticWorkbench(mainWindow.document.body, {
            extraClasses: this.getExtraClasses(),
        }, services.serviceCollection, services.logService);
        // Listeners
        this.registerListeners(workbench, services.storageService);
        // Startup
        const instantiationService = workbench.startup();
        // Window
        this._register(instantiationService.createInstance(NativeWindow));
        // Native menu controller
        if (isMacintosh || hasNativeMenu(services.configurationService)) {
            this._register(instantiationService.createInstance(NativeMenubarControl));
        }
    }
    applyWindowZoomLevel(configurationService) {
        let zoomLevel = undefined;
        if (this.configuration.isCustomZoomLevel && typeof this.configuration.zoomLevel === 'number') {
            zoomLevel = this.configuration.zoomLevel;
        }
        else {
            const windowConfig = configurationService.getValue();
            zoomLevel = typeof windowConfig.window?.zoomLevel === 'number' ? windowConfig.window.zoomLevel : 0;
        }
        applyZoom(zoomLevel, mainWindow);
    }
    getExtraClasses() {
        if (isMacintosh && isTahoeOrNewer(this.configuration.os.release)) {
            return ['macos-tahoe'];
        }
        return [];
    }
    registerListeners(workbench, storageService) {
        // Workbench Lifecycle
        this._register(workbench.onWillShutdown(event => event.join(storageService.close(), { id: 'join.closeStorage', label: localize('join.closeStorage', "Saving UI state") })));
        this._register(workbench.onDidShutdown(() => this.dispose()));
    }
    async initServices() {
        const serviceCollection = new ServiceCollection();
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //
        // NOTE: Please do NOT register services here. Use `registerSingleton()`
        //       from `workbench.common.main.ts` if the service is shared between
        //       desktop and web or `sessions/sessions.desktop.main.ts` if the service
        //       is sessions desktop only.
        //
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // Main Process
        const mainProcessService = this._register(new ElectronIPCMainProcessService(this.configuration.windowId));
        serviceCollection.set(IMainProcessService, mainProcessService);
        // Product
        const productService = { _serviceBrand: undefined, ...product };
        serviceCollection.set(IProductService, productService);
        // Environment
        const environmentService = new NativeWorkbenchEnvironmentService(this.configuration, productService);
        serviceCollection.set(INativeWorkbenchEnvironmentService, environmentService);
        // Logger
        const loggers = this.configuration.loggers.map(loggerResource => ({ ...loggerResource, resource: URI.revive(loggerResource.resource) }));
        const loggerService = new LoggerChannelClient(this.configuration.windowId, this.configuration.logLevel, environmentService.windowLogsPath, loggers, mainProcessService.getChannel('logger'));
        serviceCollection.set(ILoggerService, loggerService);
        // Log
        const logService = this._register(new NativeLogService(loggerService, environmentService));
        serviceCollection.set(ILogService, logService);
        if (isCI) {
            logService.info('workbench#open()'); // marking workbench open helps to diagnose flaky integration/smoke tests
        }
        if (logService.getLevel() === LogLevel.Trace) {
            logService.trace('workbench#open(): with configuration', safeStringify({ ...this.configuration, nls: undefined /* exclude large property */ }));
        }
        // Default Account
        const defaultAccountService = this._register(new DefaultAccountService(productService));
        serviceCollection.set(IDefaultAccountService, defaultAccountService);
        // Policies
        let policyService;
        const accountPolicy = new AccountPolicyService(logService, defaultAccountService);
        if (this.configuration.policiesData) {
            const policyChannel = new PolicyChannelClient(this.configuration.policiesData, mainProcessService.getChannel('policy'));
            policyService = new MultiplexPolicyService([policyChannel, accountPolicy], logService);
        }
        else {
            policyService = accountPolicy;
        }
        serviceCollection.set(IPolicyService, policyService);
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
        //       desktop and web or `sessions/sessions.desktop.main.ts` if the service
        //       is sessions desktop only.
        //
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // Sign
        const signService = ProxyChannel.toService(mainProcessService.getChannel('sign'));
        serviceCollection.set(ISignService, signService);
        // Files
        const fileService = this._register(new FileService(logService));
        serviceCollection.set(IFileService, fileService);
        // Remote
        const remoteAuthorityResolverService = new RemoteAuthorityResolverService(productService, new ElectronRemoteResourceLoader(environmentService.window.id, mainProcessService, fileService));
        serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);
        // Local Files
        const diskFileSystemProvider = this._register(new DiskFileSystemProvider(mainProcessService, utilityProcessWorkerWorkbenchService, logService, loggerService));
        fileService.registerProvider(Schemas.file, diskFileSystemProvider);
        // URI Identity
        const uriIdentityService = new UriIdentityService(fileService);
        serviceCollection.set(IUriIdentityService, uriIdentityService);
        // User Data Profiles
        const userDataProfilesService = new UserDataProfilesService(this.configuration.profiles.all, URI.revive(this.configuration.profiles.home).with({ scheme: environmentService.userRoamingDataHome.scheme }), mainProcessService.getChannel('userDataProfiles'));
        serviceCollection.set(IUserDataProfilesService, userDataProfilesService);
        const userDataProfileService = new UserDataProfileService(reviveProfile(this.configuration.profiles.profile, userDataProfilesService.profilesHome.scheme));
        serviceCollection.set(IUserDataProfileService, userDataProfileService);
        // Use FileUserDataProvider for user data to
        // enable atomic read / write operations.
        fileService.registerProvider(Schemas.vscodeUserData, this._register(new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService)));
        // Remote Agent
        const remoteSocketFactoryService = new RemoteSocketFactoryService();
        remoteSocketFactoryService.register(0 /* RemoteConnectionType.WebSocket */, new BrowserSocketFactory(null));
        serviceCollection.set(IRemoteSocketFactoryService, remoteSocketFactoryService);
        const remoteAgentService = this._register(new RemoteAgentService(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService));
        serviceCollection.set(IRemoteAgentService, remoteAgentService);
        // Remote Files
        this._register(RemoteFileSystemProviderClient.register(remoteAgentService, fileService, logService));
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //
        // NOTE: Please do NOT register services here. Use `registerSingleton()`
        //       from `workbench.common.main.ts` if the service is shared between
        //       desktop and web or `sessions/sessions.desktop.main.ts` if the service
        //       is sessions desktop only.
        //
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        const workspaceIdentifier = getWorkspaceIdentifier(environmentService.agentSessionsWorkspace);
        const workspaceContextService = new SessionsWorkspaceContextService(workspaceIdentifier, uriIdentityService);
        // Workspace
        serviceCollection.set(IWorkspaceContextService, workspaceContextService);
        serviceCollection.set(IWorkspaceEditingService, workspaceContextService);
        const [configurationService, storageService] = await Promise.all([
            this.createConfigurationService(workspaceContextService, userDataProfileService, uriIdentityService, fileService, logService, policyService).then(configurationService => {
                // Configuration
                serviceCollection.set(IWorkbenchConfigurationService, configurationService);
                return configurationService;
            }),
            this.createStorageService(workspaceIdentifier, environmentService, userDataProfileService, userDataProfilesService, mainProcessService).then(service => {
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
        const workspaceTrustManagementService = new WorkspaceTrustManagementService(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, workspaceContextService, workspaceTrustEnablementService, fileService);
        serviceCollection.set(IWorkspaceTrustManagementService, workspaceTrustManagementService);
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //
        // NOTE: Please do NOT register services here. Use `registerSingleton()`
        //       from `workbench.common.main.ts` if the service is shared between
        //       desktop and web or `sessions/sessions.desktop.main.ts` if the service
        //       is sessions desktop only.
        //
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        return { serviceCollection, logService, storageService, configurationService };
    }
    async createConfigurationService(workspaceContextService, userDataProfileService, uriIdentityService, fileService, logService, policyService) {
        const configurationService = new ConfigurationService(userDataProfileService, workspaceContextService, uriIdentityService, fileService, policyService, logService);
        try {
            await configurationService.initialize();
        }
        catch (error) {
            onUnexpectedError(error);
        }
        return configurationService;
    }
    async createStorageService(workspace, environmentService, userDataProfileService, userDataProfilesService, mainProcessService) {
        const storageService = new NativeWorkbenchStorageService(workspace, userDataProfileService, userDataProfilesService, mainProcessService, environmentService);
        try {
            await storageService.initialize();
            return storageService;
        }
        catch (error) {
            onUnexpectedError(error);
            return storageService;
        }
    }
    async createKeyboardLayoutService(mainProcessService) {
        const keyboardLayoutService = new NativeKeyboardLayoutService(mainProcessService);
        try {
            await keyboardLayoutService.initialize();
            return keyboardLayoutService;
        }
        catch (error) {
            onUnexpectedError(error);
            return keyboardLayoutService;
        }
    }
}
export function main(configuration) {
    const workbench = new SessionsMain(configuration);
    return workbench.open();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMubWFpbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2VsZWN0cm9uLWJyb3dzZXIvc2Vzc2lvbnMubWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3hDLE9BQU8sT0FBTyxNQUFNLDBDQUEwQyxDQUFDO0FBQy9ELE9BQU8sRUFBcUQsYUFBYSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDMUgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0MsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDcEssT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDcEgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGlDQUFpQyxFQUFFLHFCQUFxQixFQUEyQixnQkFBZ0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzdMLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ2hILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FB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