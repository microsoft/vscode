/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BrowserExtensionHostKindPicker_1;
import { mainWindow } from '../../../../base/browser/window.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { getLogs } from '../../../../platform/log/browser/log.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { WebWorkerExtensionHost } from './webWorkerExtensionHost.js';
import { FetchFileSystemProvider } from './webWorkerFileSystemProvider.js';
import { AbstractExtensionService, LocalExtensions, RemoteExtensions, ResolverExtensions, checkEnabledAndProposedAPI, isResolverExtension } from '../common/abstractExtensionService.js';
import { extensionHostKindToString, extensionRunningPreferenceToString } from '../common/extensionHostKind.js';
import { IExtensionManifestPropertiesService } from '../common/extensionManifestPropertiesService.js';
import { filterExtensionDescriptions } from '../common/extensionRunningLocationTracker.js';
import { ExtensionHostExtensions, IExtensionService, toExtensionDescription } from '../common/extensions.js';
import { ExtensionsProposedApi } from '../common/extensionsProposedApi.js';
import { dedupExtensions } from '../common/extensionsUtil.js';
import { RemoteExtensionHost } from '../common/remoteExtensionHost.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IRemoteExplorerService } from '../../remote/common/remoteExplorerService.js';
import { IUserDataInitializationService } from '../../userData/browser/userDataInit.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { AsyncIterableProducer } from '../../../../base/common/async.js';
let ExtensionService = class ExtensionService extends AbstractExtensionService {
    constructor(instantiationService, notificationService, _browserEnvironmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, _webExtensionsScannerService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, _userDataInitializationService, _userDataProfileService, _workspaceTrustManagementService, _remoteExplorerService, dialogService) {
        const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
        const extensionHostFactory = new BrowserExtensionHostFactory(extensionsProposedApi, () => this._scanWebExtensions(), () => this._getExtensionRegistrySnapshotWhenReady(), instantiationService, remoteAgentService, remoteAuthorityResolverService, extensionEnablementService, logService);
        super({ hasLocalProcess: false, allowRemoteExtensionsInLocalWebWorker: true }, extensionsProposedApi, extensionHostFactory, new BrowserExtensionHostKindPicker(logService), instantiationService, notificationService, _browserEnvironmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, dialogService);
        this._browserEnvironmentService = _browserEnvironmentService;
        this._webExtensionsScannerService = _webExtensionsScannerService;
        this._userDataInitializationService = _userDataInitializationService;
        this._userDataProfileService = _userDataProfileService;
        this._workspaceTrustManagementService = _workspaceTrustManagementService;
        this._remoteExplorerService = _remoteExplorerService;
        // Initialize installed extensions first and do it only after workbench is ready
        lifecycleService.when(2 /* LifecyclePhase.Ready */).then(async () => {
            await this._initializeIfNeeded();
        });
        this._initFetchFileSystem();
    }
    _initFetchFileSystem() {
        const provider = new FetchFileSystemProvider();
        this._register(this._fileService.registerProvider(Schemas.http, provider));
        this._register(this._fileService.registerProvider(Schemas.https, provider));
    }
    async _initialize() {
        await this._userDataInitializationService.initializeInstalledExtensions(this._instantiationService);
        await super._initialize();
    }
    async _scanWebExtensions() {
        if (!this._scanWebExtensionsPromise) {
            this._scanWebExtensionsPromise = (async () => {
                const system = [], user = [], development = [];
                try {
                    await Promise.all([
                        this._webExtensionsScannerService.scanSystemExtensions().then(extensions => system.push(...extensions.map(e => toExtensionDescription(e)))),
                        this._webExtensionsScannerService.scanUserExtensions(this._userDataProfileService.currentProfile.extensionsResource, { skipInvalidExtensions: true }).then(extensions => user.push(...extensions.map(e => toExtensionDescription(e)))),
                        this._webExtensionsScannerService.scanExtensionsUnderDevelopment().then(extensions => development.push(...extensions.map(e => toExtensionDescription(e, true))))
                    ]);
                }
                catch (error) {
                    this._logService.error(error);
                }
                return dedupExtensions(system, user, [], development, this._logService);
            })();
        }
        return this._scanWebExtensionsPromise;
    }
    async _resolveExtensionsDefault(emitter) {
        const [localExtensions, remoteExtensions] = await Promise.all([
            this._scanWebExtensions(),
            this._remoteExtensionsScannerService.scanExtensions()
        ]);
        if (remoteExtensions.length) {
            emitter.emitOne(new RemoteExtensions(remoteExtensions));
        }
        emitter.emitOne(new LocalExtensions(localExtensions));
    }
    _resolveExtensions() {
        return new AsyncIterableProducer(emitter => this._doResolveExtensions(emitter));
    }
    async _doResolveExtensions(emitter) {
        if (!this._browserEnvironmentService.expectsResolverExtension) {
            return this._resolveExtensionsDefault(emitter);
        }
        const remoteAuthority = this._environmentService.remoteAuthority;
        // Now that the canonical URI provider has been registered, we need to wait for the trust state to be
        // calculated. The trust state will be used while resolving the authority, however the resolver can
        // override the trust state through the resolver result.
        await this._workspaceTrustManagementService.workspaceResolved;
        const localExtensions = await this._scanWebExtensions();
        const resolverExtensions = localExtensions.filter(extension => isResolverExtension(extension));
        if (resolverExtensions.length) {
            emitter.emitOne(new ResolverExtensions(resolverExtensions));
        }
        let resolverResult;
        try {
            resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
        }
        catch (err) {
            if (RemoteAuthorityResolverError.isHandled(err)) {
                console.log(`Error handled: Not showing a notification for the error`);
            }
            this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
            // Proceed with the local extension host
            return this._resolveExtensionsDefault(emitter);
        }
        // set the resolved authority
        this._remoteAuthorityResolverService._setResolvedAuthority(resolverResult.authority, resolverResult.options);
        this._remoteExplorerService.setTunnelInformation(resolverResult.tunnelInformation);
        // monitor for breakage
        const connection = this._remoteAgentService.getConnection();
        if (connection) {
            this._register(connection.onDidStateChange(async (e) => {
                if (e.type === 0 /* PersistentConnectionEventType.ConnectionLost */) {
                    this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
                }
            }));
            this._register(connection.onReconnecting(() => this._resolveAuthorityAgain()));
        }
        return this._resolveExtensionsDefault(emitter);
    }
    async _onExtensionHostExit(code) {
        // Dispose everything associated with the extension host
        await this._doStopExtensionHosts();
        // If we are running extension tests, forward logs and exit code
        const automatedWindow = mainWindow;
        if (typeof automatedWindow.codeAutomationExit === 'function') {
            automatedWindow.codeAutomationExit(code, await getLogs(this._fileService, this._environmentService));
        }
    }
    async _resolveAuthority(remoteAuthority) {
        return this._resolveAuthorityOnExtensionHosts(2 /* ExtensionHostKind.LocalWebWorker */, remoteAuthority);
    }
};
ExtensionService = __decorate([
    __param(0, IInstantiationService),
    __param(1, INotificationService),
    __param(2, IBrowserWorkbenchEnvironmentService),
    __param(3, ITelemetryService),
    __param(4, IWorkbenchExtensionEnablementService),
    __param(5, IFileService),
    __param(6, IProductService),
    __param(7, IWorkbenchExtensionManagementService),
    __param(8, IWorkspaceContextService),
    __param(9, IConfigurationService),
    __param(10, IExtensionManifestPropertiesService),
    __param(11, IWebExtensionsScannerService),
    __param(12, ILogService),
    __param(13, IRemoteAgentService),
    __param(14, IRemoteExtensionsScannerService),
    __param(15, ILifecycleService),
    __param(16, IRemoteAuthorityResolverService),
    __param(17, IUserDataInitializationService),
    __param(18, IUserDataProfileService),
    __param(19, IWorkspaceTrustManagementService),
    __param(20, IRemoteExplorerService),
    __param(21, IDialogService)
], ExtensionService);
export { ExtensionService };
let BrowserExtensionHostFactory = class BrowserExtensionHostFactory {
    constructor(_extensionsProposedApi, _scanWebExtensions, _getExtensionRegistrySnapshotWhenReady, _instantiationService, _remoteAgentService, _remoteAuthorityResolverService, _extensionEnablementService, _logService) {
        this._extensionsProposedApi = _extensionsProposedApi;
        this._scanWebExtensions = _scanWebExtensions;
        this._getExtensionRegistrySnapshotWhenReady = _getExtensionRegistrySnapshotWhenReady;
        this._instantiationService = _instantiationService;
        this._remoteAgentService = _remoteAgentService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        this._extensionEnablementService = _extensionEnablementService;
        this._logService = _logService;
    }
    createExtensionHost(runningLocations, runningLocation, isInitialStart) {
        switch (runningLocation.kind) {
            case 1 /* ExtensionHostKind.LocalProcess */: {
                return null;
            }
            case 2 /* ExtensionHostKind.LocalWebWorker */: {
                const startup = (isInitialStart
                    ? 2 /* ExtensionHostStartup.EagerManualStart */
                    : 1 /* ExtensionHostStartup.EagerAutoStart */);
                return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createLocalExtensionHostDataProvider(runningLocations, runningLocation, isInitialStart));
            }
            case 3 /* ExtensionHostKind.Remote */: {
                const remoteAgentConnection = this._remoteAgentService.getConnection();
                if (remoteAgentConnection) {
                    return this._instantiationService.createInstance(RemoteExtensionHost, runningLocation, this._createRemoteExtensionHostDataProvider(runningLocations, remoteAgentConnection.remoteAuthority));
                }
                return null;
            }
        }
    }
    _createLocalExtensionHostDataProvider(runningLocations, desiredRunningLocation, isInitialStart) {
        return {
            getInitData: async () => {
                if (isInitialStart) {
                    // Here we load even extensions that would be disabled by workspace trust
                    const localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, await this._scanWebExtensions(), /* ignore workspace trust */ true);
                    const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
                    const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
                    const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map(extension => extension.identifier));
                    return { extensions };
                }
                else {
                    // restart case
                    const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
                    const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
                    const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));
                    return { extensions };
                }
            }
        };
    }
    _createRemoteExtensionHostDataProvider(runningLocations, remoteAuthority) {
        return {
            remoteAuthority: remoteAuthority,
            getInitData: async () => {
                const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
                const remoteEnv = await this._remoteAgentService.getEnvironment();
                if (!remoteEnv) {
                    throw new Error('Cannot provide init data for remote extension host!');
                }
                const myExtensions = runningLocations.filterByExtensionHostKind(snapshot.extensions, 3 /* ExtensionHostKind.Remote */);
                const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));
                return {
                    connectionData: this._remoteAuthorityResolverService.getConnectionData(remoteAuthority),
                    pid: remoteEnv.pid,
                    appRoot: remoteEnv.appRoot,
                    extensionHostLogsPath: remoteEnv.extensionHostLogsPath,
                    globalStorageHome: remoteEnv.globalStorageHome,
                    workspaceStorageHome: remoteEnv.workspaceStorageHome,
                    extensions,
                };
            }
        };
    }
};
BrowserExtensionHostFactory = __decorate([
    __param(3, IInstantiationService),
    __param(4, IRemoteAgentService),
    __param(5, IRemoteAuthorityResolverService),
    __param(6, IWorkbenchExtensionEnablementService),
    __param(7, ILogService)
], BrowserExtensionHostFactory);
let BrowserExtensionHostKindPicker = BrowserExtensionHostKindPicker_1 = class BrowserExtensionHostKindPicker {
    constructor(_logService) {
        this._logService = _logService;
    }
    pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
        const result = BrowserExtensionHostKindPicker_1.pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference);
        this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(', ')}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
        return result;
    }
    static pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
        const result = [];
        let canRunRemotely = false;
        for (const extensionKind of extensionKinds) {
            if (extensionKind === 'ui' && isInstalledRemotely) {
                // ui extensions run remotely if possible (but only as a last resort)
                if (preference === 2 /* ExtensionRunningPreference.Remote */) {
                    return 3 /* ExtensionHostKind.Remote */;
                }
                else {
                    canRunRemotely = true;
                }
            }
            if (extensionKind === 'workspace' && isInstalledRemotely) {
                // workspace extensions run remotely if possible
                if (preference === 0 /* ExtensionRunningPreference.None */ || preference === 2 /* ExtensionRunningPreference.Remote */) {
                    return 3 /* ExtensionHostKind.Remote */;
                }
                else {
                    result.push(3 /* ExtensionHostKind.Remote */);
                }
            }
            if (extensionKind === 'web' && (isInstalledLocally || isInstalledRemotely)) {
                // web worker extensions run in the local web worker if possible
                if (preference === 0 /* ExtensionRunningPreference.None */ || preference === 1 /* ExtensionRunningPreference.Local */) {
                    return 2 /* ExtensionHostKind.LocalWebWorker */;
                }
                else {
                    result.push(2 /* ExtensionHostKind.LocalWebWorker */);
                }
            }
        }
        if (canRunRemotely) {
            result.push(3 /* ExtensionHostKind.Remote */);
        }
        return (result.length > 0 ? result[0] : null);
    }
};
BrowserExtensionHostKindPicker = BrowserExtensionHostKindPicker_1 = __decorate([
    __param(0, ILogService)
], BrowserExtensionHostKindPicker);
export { BrowserExtensionHostKindPicker };
registerSingleton(IExtensionService, ExtensionService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHaEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQW9CLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFeEYsT0FBTyxFQUFFLCtCQUErQixFQUFFLDRCQUE0QixFQUFrQixNQUFNLCtEQUErRCxDQUFDO0FBQzlKLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlG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