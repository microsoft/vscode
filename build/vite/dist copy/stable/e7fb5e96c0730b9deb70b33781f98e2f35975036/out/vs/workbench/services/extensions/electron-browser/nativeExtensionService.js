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
var NativeExtensionHostKindPicker_1;
import { runWhenWindowIdle } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import * as performance from '../../../../base/common/performance.js';
import { isCI } from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, getRemoteAuthorityPrefix } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { getRemoteName, parseAuthorityWithPort } from '../../../../platform/remote/common/remoteHosts.js';
import { updateProxyConfigurationsScope } from '../../../../platform/request/common/request.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { WebWorkerExtensionHost } from '../browser/webWorkerExtensionHost.js';
import { AbstractExtensionService, ExtensionHostCrashTracker, LocalExtensions, RemoteExtensions, ResolverExtensions, checkEnabledAndProposedAPI, extensionIsEnabled, isResolverExtension } from '../common/abstractExtensionService.js';
import { parseExtensionDevOptions } from '../common/extensionDevOptions.js';
import { extensionHostKindToString, extensionRunningPreferenceToString } from '../common/extensionHostKind.js';
import { IExtensionManifestPropertiesService } from '../common/extensionManifestPropertiesService.js';
import { filterExtensionDescriptions } from '../common/extensionRunningLocationTracker.js';
import { ExtensionHostExtensions, IExtensionService, toExtension, webWorkerExtHostConfig } from '../common/extensions.js';
import { ExtensionsProposedApi } from '../common/extensionsProposedApi.js';
import { RemoteExtensionHost } from '../common/remoteExtensionHost.js';
import { CachedExtensionScanner } from './cachedExtensionScanner.js';
import { NativeLocalProcessExtensionHost } from './localProcessExtensionHost.js';
import { IHostService } from '../../host/browser/host.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IRemoteExplorerService } from '../../remote/common/remoteExplorerService.js';
import { AsyncIterableProducer } from '../../../../base/common/async.js';
let NativeExtensionService = class NativeExtensionService extends AbstractExtensionService {
    constructor(instantiationService, notificationService, environmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, _nativeHostService, _hostService, _remoteExplorerService, _extensionGalleryService, _workspaceTrustManagementService, dialogService) {
        const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
        const extensionScanner = instantiationService.createInstance(CachedExtensionScanner);
        const extensionHostFactory = new NativeExtensionHostFactory(extensionsProposedApi, extensionScanner, () => this._getExtensionRegistrySnapshotWhenReady(), instantiationService, environmentService, extensionEnablementService, configurationService, remoteAgentService, remoteAuthorityResolverService, logService);
        super({ hasLocalProcess: true, allowRemoteExtensionsInLocalWebWorker: false }, extensionsProposedApi, extensionHostFactory, new NativeExtensionHostKindPicker(environmentService, configurationService, logService), instantiationService, notificationService, environmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, dialogService);
        this._nativeHostService = _nativeHostService;
        this._hostService = _hostService;
        this._remoteExplorerService = _remoteExplorerService;
        this._extensionGalleryService = _extensionGalleryService;
        this._workspaceTrustManagementService = _workspaceTrustManagementService;
        this._localCrashTracker = new ExtensionHostCrashTracker();
        this._extensionScanner = extensionScanner;
        // delay extension host creation and extension scanning
        // until the workbench is running. we cannot defer the
        // extension host more (LifecyclePhase.Restored) because
        // some editors require the extension host to restore
        // and this would result in a deadlock
        // see https://github.com/microsoft/vscode/issues/41322
        lifecycleService.when(2 /* LifecyclePhase.Ready */).then(() => {
            // reschedule to ensure this runs after restoring viewlets, panels, and editors
            runWhenWindowIdle(mainWindow, () => {
                this._initializeIfNeeded();
            }, 50 /*max delay*/);
        });
    }
    async _scanAllLocalExtensions() {
        return this._extensionScanner.scannedExtensions;
    }
    _onExtensionHostCrashed(extensionHost, code, signal) {
        const activatedExtensions = [];
        const extensionsStatus = this.getExtensionsStatus();
        for (const key of Object.keys(extensionsStatus)) {
            const extensionStatus = extensionsStatus[key];
            if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
                activatedExtensions.push(extensionStatus.id);
            }
        }
        super._onExtensionHostCrashed(extensionHost, code, signal);
        if (extensionHost.kind === 1 /* ExtensionHostKind.LocalProcess */) {
            if (code === 55 /* ExtensionHostExitCode.VersionMismatch */) {
                this._notificationService.prompt(Severity.Error, nls.localize('extensionService.versionMismatchCrash', "Extension host cannot start: version mismatch."), [{
                        label: nls.localize('relaunch', "Relaunch VS Code"),
                        run: () => {
                            this._instantiationService.invokeFunction((accessor) => {
                                const hostService = accessor.get(IHostService);
                                hostService.restart();
                            });
                        }
                    }]);
                return;
            }
            this._logExtensionHostCrash(extensionHost);
            this._sendExtensionHostCrashTelemetry(code, signal, activatedExtensions);
            this._localCrashTracker.registerCrash();
            if (this._localCrashTracker.shouldAutomaticallyRestart()) {
                this._logService.info(`Automatically restarting the extension host.`);
                this._notificationService.status(nls.localize('extensionService.autoRestart', "The extension host terminated unexpectedly. Restarting..."), { hideAfter: 5000 });
                this.startExtensionHosts();
            }
            else {
                const choices = [];
                if (this._environmentService.isBuilt) {
                    choices.push({
                        label: nls.localize('startBisect', "Start Extension Bisect"),
                        run: () => {
                            this._instantiationService.invokeFunction(accessor => {
                                const commandService = accessor.get(ICommandService);
                                commandService.executeCommand('extension.bisect.start');
                            });
                        }
                    });
                }
                else {
                    choices.push({
                        label: nls.localize('devTools', "Open Developer Tools"),
                        run: () => this._nativeHostService.openDevTools()
                    });
                }
                choices.push({
                    label: nls.localize('restart', "Restart Extension Host"),
                    run: () => this.startExtensionHosts()
                });
                if (this._environmentService.isBuilt) {
                    choices.push({
                        label: nls.localize('learnMore', "Learn More"),
                        run: () => {
                            this._instantiationService.invokeFunction(accessor => {
                                const openerService = accessor.get(IOpenerService);
                                openerService.open('https://aka.ms/vscode-extension-bisect');
                            });
                        }
                    });
                }
                this._notificationService.prompt(Severity.Error, nls.localize('extensionService.crash', "Extension host terminated unexpectedly 3 times within the last 5 minutes."), choices);
            }
        }
    }
    _sendExtensionHostCrashTelemetry(code, signal, activatedExtensions) {
        this._telemetryService.publicLog2('extensionHostCrash', {
            code,
            signal,
            extensionIds: activatedExtensions.map(e => e.value)
        });
        for (const extensionId of activatedExtensions) {
            this._telemetryService.publicLog2('extensionHostCrashExtension', {
                code,
                signal,
                extensionId: extensionId.value
            });
        }
    }
    // --- impl
    async _resolveAuthority(remoteAuthority) {
        const authorityPlusIndex = remoteAuthority.indexOf('+');
        if (authorityPlusIndex === -1) {
            // This authority does not need to be resolved, simply parse the port number
            const { host, port } = parseAuthorityWithPort(remoteAuthority);
            return {
                authority: {
                    authority: remoteAuthority,
                    connectTo: {
                        type: 0 /* RemoteConnectionType.WebSocket */,
                        host,
                        port
                    },
                    connectionToken: undefined
                }
            };
        }
        return this._resolveAuthorityOnExtensionHosts(1 /* ExtensionHostKind.LocalProcess */, remoteAuthority);
    }
    async _getCanonicalURI(remoteAuthority, uri) {
        const authorityPlusIndex = remoteAuthority.indexOf('+');
        if (authorityPlusIndex === -1) {
            // This authority does not use a resolver
            return uri;
        }
        const localProcessExtensionHosts = this._getExtensionHostManagers(1 /* ExtensionHostKind.LocalProcess */);
        if (localProcessExtensionHosts.length === 0) {
            // no local process extension hosts
            throw new Error(`Cannot resolve canonical URI`);
        }
        const results = await Promise.all(localProcessExtensionHosts.map(extHost => extHost.getCanonicalURI(remoteAuthority, uri)));
        for (const result of results) {
            if (result) {
                return result;
            }
        }
        // we can only reach this if there was no resolver extension that can return the cannonical uri
        throw new Error(`Cannot get canonical URI because no extension is installed to resolve ${getRemoteAuthorityPrefix(remoteAuthority)}`);
    }
    _resolveExtensions() {
        return new AsyncIterableProducer(emitter => this._doResolveExtensions(emitter));
    }
    async _doResolveExtensions(emitter) {
        this._extensionScanner.startScanningExtensions();
        const remoteAuthority = this._environmentService.remoteAuthority;
        let remoteEnv = null;
        let remoteExtensions = [];
        if (remoteAuthority) {
            this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => {
                if (uri.scheme !== Schemas.vscodeRemote || uri.authority !== remoteAuthority) {
                    // The current remote authority resolver cannot give the canonical URI for this URI
                    return uri;
                }
                performance.mark(`code/willGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
                if (isCI) {
                    this._logService.info(`Invoking getCanonicalURI for authority ${getRemoteAuthorityPrefix(remoteAuthority)}...`);
                }
                try {
                    return this._getCanonicalURI(remoteAuthority, uri);
                }
                finally {
                    performance.mark(`code/didGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
                    if (isCI) {
                        this._logService.info(`getCanonicalURI returned for authority ${getRemoteAuthorityPrefix(remoteAuthority)}.`);
                    }
                }
            });
            if (isCI) {
                this._logService.info(`Starting to wait on IWorkspaceTrustManagementService.workspaceResolved...`);
            }
            // Now that the canonical URI provider has been registered, we need to wait for the trust state to be
            // calculated. The trust state will be used while resolving the authority, however the resolver can
            // override the trust state through the resolver result.
            await this._workspaceTrustManagementService.workspaceResolved;
            if (isCI) {
                this._logService.info(`Finished waiting on IWorkspaceTrustManagementService.workspaceResolved.`);
            }
            const localExtensions = await this._scanAllLocalExtensions();
            const resolverExtensions = localExtensions.filter(extension => isResolverExtension(extension));
            if (resolverExtensions.length) {
                emitter.emitOne(new ResolverExtensions(resolverExtensions));
            }
            let resolverResult;
            try {
                resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
            }
            catch (err) {
                if (RemoteAuthorityResolverError.isNoResolverFound(err)) {
                    err.isHandled = await this._handleNoResolverFound(remoteAuthority);
                }
                else {
                    if (RemoteAuthorityResolverError.isHandled(err)) {
                        console.log(`Error handled: Not showing a notification for the error`);
                    }
                }
                this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
                // Proceed with the local extension host
                return this._startLocalExtensionHost(emitter);
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
            // fetch the remote environment
            [remoteEnv, remoteExtensions] = await Promise.all([
                this._remoteAgentService.getEnvironment(),
                this._remoteExtensionsScannerService.scanExtensions()
            ]);
            if (!remoteEnv) {
                this._notificationService.notify({ severity: Severity.Error, message: nls.localize('getEnvironmentFailure', "Could not fetch remote environment") });
                // Proceed with the local extension host
                return this._startLocalExtensionHost(emitter);
            }
            const useHostProxyDefault = remoteEnv.useHostProxy;
            this._register(this._configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('http.useLocalProxyConfiguration')) {
                    updateProxyConfigurationsScope(this._configurationService.getValue('http.useLocalProxyConfiguration'), useHostProxyDefault);
                }
            }));
            updateProxyConfigurationsScope(this._configurationService.getValue('http.useLocalProxyConfiguration'), useHostProxyDefault);
        }
        else {
            this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => uri);
        }
        return this._startLocalExtensionHost(emitter, remoteExtensions);
    }
    async _startLocalExtensionHost(emitter, remoteExtensions = []) {
        // Ensure that the workspace trust state has been fully initialized so
        // that the extension host can start with the correct set of extensions.
        await this._workspaceTrustManagementService.workspaceTrustInitialized;
        if (remoteExtensions.length) {
            emitter.emitOne(new RemoteExtensions(remoteExtensions));
        }
        emitter.emitOne(new LocalExtensions(await this._scanAllLocalExtensions()));
    }
    async _onExtensionHostExit(code) {
        // Dispose everything associated with the extension host
        await this._doStopExtensionHosts();
        // Dispose the management connection to avoid reconnecting after the extension host exits
        const connection = this._remoteAgentService.getConnection();
        connection?.dispose();
        if (parseExtensionDevOptions(this._environmentService).isExtensionDevTestFromCli) {
            // When CLI testing make sure to exit with proper exit code
            if (isCI) {
                this._logService.info(`Asking native host service to exit with code ${code}.`);
            }
            this._nativeHostService.exit(code);
        }
        else {
            // Expected development extension termination: When the extension host goes down we also shutdown the window
            this._nativeHostService.closeWindow();
        }
    }
    async _handleNoResolverFound(remoteAuthority) {
        const remoteName = getRemoteName(remoteAuthority);
        const recommendation = this._productService.remoteExtensionTips?.[remoteName];
        if (!recommendation) {
            return false;
        }
        const resolverExtensionId = recommendation.extensionId;
        const allExtensions = await this._scanAllLocalExtensions();
        const extension = allExtensions.filter(e => e.identifier.value === resolverExtensionId)[0];
        if (extension) {
            if (!extensionIsEnabled(this._logService, this._extensionEnablementService, extension, false)) {
                const message = nls.localize('enableResolver', "Extension '{0}' is required to open the remote window.\nOK to enable?", recommendation.friendlyName);
                this._notificationService.prompt(Severity.Info, message, [{
                        label: nls.localize('enable', 'Enable and Reload'),
                        run: async () => {
                            await this._extensionEnablementService.setEnablement([toExtension(extension)], 12 /* EnablementState.EnabledGlobally */);
                            await this._hostService.reload();
                        }
                    }], {
                    sticky: true,
                    priority: NotificationPriority.URGENT
                });
            }
        }
        else {
            // Install the Extension and reload the window to handle.
            const message = nls.localize('installResolver', "Extension '{0}' is required to open the remote window.\nDo you want to install the extension?", recommendation.friendlyName);
            this._notificationService.prompt(Severity.Info, message, [{
                    label: nls.localize('install', 'Install and Reload'),
                    run: async () => {
                        const [galleryExtension] = await this._extensionGalleryService.getExtensions([{ id: resolverExtensionId }], CancellationToken.None);
                        if (galleryExtension) {
                            await this._extensionManagementService.installFromGallery(galleryExtension);
                            await this._hostService.reload();
                        }
                        else {
                            this._notificationService.error(nls.localize('resolverExtensionNotFound', "`{0}` not found on marketplace"));
                        }
                    }
                }], {
                sticky: true,
                priority: NotificationPriority.URGENT,
            });
        }
        return true;
    }
};
NativeExtensionService = __decorate([
    __param(0, IInstantiationService),
    __param(1, INotificationService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, ITelemetryService),
    __param(4, IWorkbenchExtensionEnablementService),
    __param(5, IFileService),
    __param(6, IProductService),
    __param(7, IWorkbenchExtensionManagementService),
    __param(8, IWorkspaceContextService),
    __param(9, IConfigurationService),
    __param(10, IExtensionManifestPropertiesService),
    __param(11, ILogService),
    __param(12, IRemoteAgentService),
    __param(13, IRemoteExtensionsScannerService),
    __param(14, ILifecycleService),
    __param(15, IRemoteAuthorityResolverService),
    __param(16, INativeHostService),
    __param(17, IHostService),
    __param(18, IRemoteExplorerService),
    __param(19, IExtensionGalleryService),
    __param(20, IWorkspaceTrustManagementService),
    __param(21, IDialogService)
], NativeExtensionService);
export { NativeExtensionService };
let NativeExtensionHostFactory = class NativeExtensionHostFactory {
    constructor(_extensionsProposedApi, _extensionScanner, _getExtensionRegistrySnapshotWhenReady, _instantiationService, environmentService, _extensionEnablementService, configurationService, _remoteAgentService, _remoteAuthorityResolverService, _logService) {
        this._extensionsProposedApi = _extensionsProposedApi;
        this._extensionScanner = _extensionScanner;
        this._getExtensionRegistrySnapshotWhenReady = _getExtensionRegistrySnapshotWhenReady;
        this._instantiationService = _instantiationService;
        this._extensionEnablementService = _extensionEnablementService;
        this._remoteAgentService = _remoteAgentService;
        this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
        this._logService = _logService;
        this._webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
    }
    createExtensionHost(runningLocations, runningLocation, isInitialStart) {
        switch (runningLocation.kind) {
            case 1 /* ExtensionHostKind.LocalProcess */: {
                const startup = (isInitialStart
                    ? 2 /* ExtensionHostStartup.EagerManualStart */
                    : 1 /* ExtensionHostStartup.EagerAutoStart */);
                return this._instantiationService.createInstance(NativeLocalProcessExtensionHost, runningLocation, startup, this._createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, runningLocation));
            }
            case 2 /* ExtensionHostKind.LocalWebWorker */: {
                if (this._webWorkerExtHostEnablement !== 0 /* LocalWebWorkerExtHostEnablement.Disabled */) {
                    const startup = this._webWorkerExtHostEnablement === 2 /* LocalWebWorkerExtHostEnablement.Lazy */ ? 3 /* ExtensionHostStartup.LazyAutoStart */ : 2 /* ExtensionHostStartup.EagerManualStart */;
                    return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createWebWorkerExtensionHostDataProvider(runningLocations, runningLocation));
                }
                return null;
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
    _createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, desiredRunningLocation) {
        return {
            getInitData: async () => {
                if (isInitialStart) {
                    // Here we load even extensions that would be disabled by workspace trust
                    const scannedExtensions = await this._extensionScanner.scannedExtensions;
                    if (isCI) {
                        this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.scannedExtensions: ${scannedExtensions.map(ext => ext.identifier.value).join(',')}`);
                    }
                    const localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, scannedExtensions, /* ignore workspace trust */ true);
                    if (isCI) {
                        this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.localExtensions: ${localExtensions.map(ext => ext.identifier.value).join(',')}`);
                    }
                    const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
                    const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
                    const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map(extension => extension.identifier));
                    if (isCI) {
                        this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.myExtensions: ${myExtensions.map(ext => ext.identifier.value).join(',')}`);
                    }
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
    _createWebWorkerExtensionHostDataProvider(runningLocations, desiredRunningLocation) {
        return {
            getInitData: async () => {
                const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
                const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
                const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));
                return { extensions };
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
NativeExtensionHostFactory = __decorate([
    __param(3, IInstantiationService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IWorkbenchExtensionEnablementService),
    __param(6, IConfigurationService),
    __param(7, IRemoteAgentService),
    __param(8, IRemoteAuthorityResolverService),
    __param(9, ILogService)
], NativeExtensionHostFactory);
function determineLocalWebWorkerExtHostEnablement(environmentService, configurationService) {
    if (environmentService.isExtensionDevelopment && environmentService.extensionDevelopmentKind?.some(k => k === 'web')) {
        return 1 /* LocalWebWorkerExtHostEnablement.Eager */;
    }
    else {
        const config = configurationService.getValue(webWorkerExtHostConfig);
        if (config === true) {
            return 1 /* LocalWebWorkerExtHostEnablement.Eager */;
        }
        else if (config === 'auto') {
            return 2 /* LocalWebWorkerExtHostEnablement.Lazy */;
        }
        else {
            return 0 /* LocalWebWorkerExtHostEnablement.Disabled */;
        }
    }
}
var LocalWebWorkerExtHostEnablement;
(function (LocalWebWorkerExtHostEnablement) {
    LocalWebWorkerExtHostEnablement[LocalWebWorkerExtHostEnablement["Disabled"] = 0] = "Disabled";
    LocalWebWorkerExtHostEnablement[LocalWebWorkerExtHostEnablement["Eager"] = 1] = "Eager";
    LocalWebWorkerExtHostEnablement[LocalWebWorkerExtHostEnablement["Lazy"] = 2] = "Lazy";
})(LocalWebWorkerExtHostEnablement || (LocalWebWorkerExtHostEnablement = {}));
let NativeExtensionHostKindPicker = NativeExtensionHostKindPicker_1 = class NativeExtensionHostKindPicker {
    constructor(environmentService, configurationService, _logService) {
        this._logService = _logService;
        this._hasRemoteExtHost = Boolean(environmentService.remoteAuthority);
        const webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
        this._hasWebWorkerExtHost = (webWorkerExtHostEnablement !== 0 /* LocalWebWorkerExtHostEnablement.Disabled */);
    }
    pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
        const result = NativeExtensionHostKindPicker_1.pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, this._hasRemoteExtHost, this._hasWebWorkerExtHost);
        this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(', ')}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
        return result;
    }
    static pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, hasRemoteExtHost, hasWebWorkerExtHost) {
        const result = [];
        for (const extensionKind of extensionKinds) {
            if (extensionKind === 'ui' && isInstalledLocally) {
                // ui extensions run locally if possible
                if (preference === 0 /* ExtensionRunningPreference.None */ || preference === 1 /* ExtensionRunningPreference.Local */) {
                    return 1 /* ExtensionHostKind.LocalProcess */;
                }
                else {
                    result.push(1 /* ExtensionHostKind.LocalProcess */);
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
            if (extensionKind === 'workspace' && !hasRemoteExtHost) {
                // workspace extensions also run locally if there is no remote
                if (preference === 0 /* ExtensionRunningPreference.None */ || preference === 1 /* ExtensionRunningPreference.Local */) {
                    return 1 /* ExtensionHostKind.LocalProcess */;
                }
                else {
                    result.push(1 /* ExtensionHostKind.LocalProcess */);
                }
            }
            if (extensionKind === 'web' && isInstalledLocally && hasWebWorkerExtHost) {
                // web worker extensions run in the local web worker if possible
                if (preference === 0 /* ExtensionRunningPreference.None */ || preference === 1 /* ExtensionRunningPreference.Local */) {
                    return 2 /* ExtensionHostKind.LocalWebWorker */;
                }
                else {
                    result.push(2 /* ExtensionHostKind.LocalWebWorker */);
                }
            }
        }
        return (result.length > 0 ? result[0] : null);
    }
};
NativeExtensionHostKindPicker = NativeExtensionHostKindPicker_1 = __decorate([
    __param(0, IWorkbenchEnvironmentService),
    __param(1, IConfigurationService),
    __param(2, ILogService)
], NativeExtensionHostKindPicker);
export { NativeExtensionHostKindPicker };
class RestartExtensionHostAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.restartExtensionHost',
            title: nls.localize2('restartExtensionHost', "Restart Extension Host"),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const extensionService = accessor.get(IExtensionService);
        const stopped = await extensionService.stopExtensionHosts(nls.localize('restartExtensionHost.reason', "An explicit request"));
        if (stopped) {
            extensionService.startExtensionHosts();
        }
    }
}
registerAction2(RestartExtensionHostAction);
registerSingleton(IExtensionService, NativeExtensionService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlRXh0ZW5zaW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvbmF0aXZlRXh0ZW5zaW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEtBQUssV0FBVyxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUzRCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFaEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFFbEgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMv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