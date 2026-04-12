/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { hostname, release } from 'os';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { onUnexpectedError, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
import { combinedDisposable, Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter } from '../../../base/common/event.js';
import { ProxyChannel, StaticRouter } from '../../../base/parts/ipc/common/ipc.js';
import { Server as UtilityProcessMessagePortServer, once } from '../../../base/parts/ipc/node/ipc.mp.js';
import { CodeCacheCleaner } from './contrib/codeCacheCleaner.js';
import { LanguagePackCachedDataCleaner } from './contrib/languagePackCachedDataCleaner.js';
import { LocalizationsUpdater } from './contrib/localizationsUpdater.js';
import { LogsDataCleaner } from './contrib/logsDataCleaner.js';
import { UnusedWorkspaceStorageDataCleaner } from './contrib/storageDataCleaner.js';
import { IChecksumService } from '../../../platform/checksum/common/checksumService.js';
import { ChecksumService } from '../../../platform/checksum/node/checksumService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ConfigurationService } from '../../../platform/configuration/common/configurationService.js';
import { IDiagnosticsService } from '../../../platform/diagnostics/common/diagnostics.js';
import { DiagnosticsService } from '../../../platform/diagnostics/node/diagnosticsService.js';
import { IDownloadService } from '../../../platform/download/common/download.js';
import { DownloadService } from '../../../platform/download/common/downloadService.js';
import { INativeEnvironmentService } from '../../../platform/environment/common/environment.js';
import { GlobalExtensionEnablementService } from '../../../platform/extensionManagement/common/extensionEnablementService.js';
import { ExtensionGalleryService } from '../../../platform/extensionManagement/common/extensionGalleryService.js';
import { IAllowedExtensionsService, IExtensionGalleryService, IExtensionManagementService, IExtensionTipsService, IGlobalExtensionEnablementService } from '../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionSignatureVerificationService, IExtensionSignatureVerificationService } from '../../../platform/extensionManagement/node/extensionSignatureVerificationService.js';
import { ExtensionManagementChannel, ExtensionTipsChannel } from '../../../platform/extensionManagement/common/extensionManagementIpc.js';
import { ExtensionManagementService, INativeServerExtensionManagementService } from '../../../platform/extensionManagement/node/extensionManagementService.js';
import { IExtensionRecommendationNotificationService } from '../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../platform/files/node/diskFileSystemProvider.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { ILanguagePackService } from '../../../platform/languagePacks/common/languagePacks.js';
import { NativeLanguagePackService } from '../../../platform/languagePacks/node/languagePacks.js';
import { ConsoleLogger, ILoggerService, ILogService } from '../../../platform/log/common/log.js';
import { LoggerChannelClient } from '../../../platform/log/common/logIpc.js';
import product from '../../../platform/product/common/product.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IRequestService } from '../../../platform/request/common/request.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { resolveCommonProperties } from '../../../platform/telemetry/common/commonProperties.js';
import { ICustomEndpointTelemetryService, ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { TelemetryAppenderChannel } from '../../../platform/telemetry/common/telemetryIpc.js';
import { TelemetryLogAppender } from '../../../platform/telemetry/common/telemetryLogAppender.js';
import { TelemetryService } from '../../../platform/telemetry/common/telemetryService.js';
import { supportsTelemetry, NullAppender, NullTelemetryService, getPiiPathsFromEnvironment, isInternalTelemetry, isLoggingOnly } from '../../../platform/telemetry/common/telemetryUtils.js';
import { CustomEndpointTelemetryService } from '../../../platform/telemetry/node/customEndpointTelemetryService.js';
import { ExtensionStorageService, IExtensionStorageService } from '../../../platform/extensionManagement/common/extensionStorage.js';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from '../../../platform/userDataSync/common/ignoredExtensions.js';
import { IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration as registerUserDataSyncConfiguration, IUserDataSyncResourceProviderService } from '../../../platform/userDataSync/common/userDataSync.js';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from '../../../platform/userDataSync/common/userDataSyncAccount.js';
import { UserDataSyncLocalStoreService } from '../../../platform/userDataSync/common/userDataSyncLocalStoreService.js';
import { UserDataSyncAccountServiceChannel, UserDataSyncStoreManagementServiceChannel } from '../../../platform/userDataSync/common/userDataSyncIpc.js';
import { UserDataSyncLogService } from '../../../platform/userDataSync/common/userDataSyncLog.js';
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from '../../../platform/userDataSync/common/userDataSyncMachines.js';
import { UserDataSyncEnablementService } from '../../../platform/userDataSync/common/userDataSyncEnablementService.js';
import { UserDataSyncService } from '../../../platform/userDataSync/common/userDataSyncService.js';
import { UserDataSyncServiceChannel } from '../../../platform/userDataSync/common/userDataSyncServiceIpc.js';
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from '../../../platform/userDataSync/common/userDataSyncStoreService.js';
import { IUserDataProfileStorageService } from '../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { SharedProcessUserDataProfileStorageService } from '../../../platform/userDataProfile/node/userDataProfileStorageService.js';
import { ActiveWindowManager } from '../../../platform/windows/node/windowTracker.js';
import { ISignService } from '../../../platform/sign/common/sign.js';
import { SignService } from '../../../platform/sign/node/signService.js';
import { ISharedTunnelsService } from '../../../platform/tunnel/common/tunnel.js';
import { SharedTunnelsService } from '../../../platform/tunnel/node/tunnelService.js';
import { ipcSharedProcessTunnelChannelName, ISharedProcessTunnelService } from '../../../platform/remote/common/sharedProcessTunnelService.js';
import { SharedProcessTunnelService } from '../../../platform/tunnel/node/sharedProcessTunnelService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../platform/uriIdentity/common/uriIdentityService.js';
import { isLinux } from '../../../base/common/platform.js';
import { FileUserDataProvider } from '../../../platform/userData/common/fileUserDataProvider.js';
import { DiskFileSystemProviderClient, LOCAL_FILE_SYSTEM_CHANNEL_NAME } from '../../../platform/files/common/diskFileSystemProviderClient.js';
import { InspectProfilingService as V8InspectProfilingService } from '../../../platform/profiling/node/profilingService.js';
import { IV8InspectProfilingService } from '../../../platform/profiling/common/profiling.js';
import { IExtensionsScannerService } from '../../../platform/extensionManagement/common/extensionsScannerService.js';
import { ExtensionsScannerService } from '../../../platform/extensionManagement/node/extensionsScannerService.js';
import { ISSHRemoteAgentHostMainService, SSH_REMOTE_AGENT_HOST_CHANNEL } from '../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { SSHRemoteAgentHostMainService } from '../../../platform/agentHost/node/sshRemoteAgentHostService.js';
import { IUserDataProfilesService } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { IExtensionsProfileScannerService } from '../../../platform/extensionManagement/common/extensionsProfileScannerService.js';
import { PolicyChannelClient } from '../../../platform/policy/common/policyIpc.js';
import { IPolicyService, NullPolicyService } from '../../../platform/policy/common/policy.js';
import { UserDataProfilesService } from '../../../platform/userDataProfile/common/userDataProfileIpc.js';
import { OneDataSystemAppender } from '../../../platform/telemetry/node/1dsAppender.js';
import { UserDataProfilesCleaner } from './contrib/userDataProfilesCleaner.js';
import { IRemoteTunnelService } from '../../../platform/remoteTunnel/common/remoteTunnel.js';
import { UserDataSyncResourceProviderService } from '../../../platform/userDataSync/common/userDataSyncResourceProvider.js';
import { ExtensionsContributions } from './contrib/extensions.js';
import { localize } from '../../../nls.js';
import { LogService } from '../../../platform/log/common/logService.js';
import { ISharedProcessLifecycleService, SharedProcessLifecycleService } from '../../../platform/lifecycle/node/sharedProcessLifecycleService.js';
import { RemoteTunnelService } from '../../../platform/remoteTunnel/node/remoteTunnelService.js';
import { ExtensionsProfileScannerService } from '../../../platform/extensionManagement/node/extensionsProfileScannerService.js';
import { ExtensionRecommendationNotificationServiceChannelClient } from '../../../platform/extensionRecommendations/common/extensionRecommendationsIpc.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { NativeHostService } from '../../../platform/native/common/nativeHostService.js';
import { UserDataAutoSyncService } from '../../../platform/userDataSync/node/userDataAutoSyncService.js';
import { ExtensionTipsService } from '../../../platform/extensionManagement/node/extensionTipsService.js';
import { IMainProcessService, MainProcessService } from '../../../platform/ipc/common/mainProcessService.js';
import { RemoteStorageService } from '../../../platform/storage/common/storageService.js';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from '../../../platform/remote/common/remoteSocketFactoryService.js';
import { nodeSocketFactory } from '../../../platform/remote/node/nodeSocketFactory.js';
import { NativeEnvironmentService } from '../../../platform/environment/node/environmentService.js';
import { SharedProcessRawConnection, SharedProcessLifecycle } from '../../../platform/sharedProcess/common/sharedProcess.js';
import { getOSReleaseInfo } from '../../../base/node/osReleaseInfo.js';
import { getDesktopEnvironment } from '../../../base/common/desktopEnvironmentInfo.js';
import { getCodeDisplayProtocol, getDisplayProtocol } from '../../../base/node/osDisplayProtocolInfo.js';
import { RequestService } from '../../../platform/request/electron-utility/requestService.js';
import { DefaultExtensionsInitializer } from './contrib/defaultExtensionsInitializer.js';
import { AllowedExtensionsService } from '../../../platform/extensionManagement/common/allowedExtensionsService.js';
import { IExtensionGalleryManifestService } from '../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestIPCService } from '../../../platform/extensionManagement/common/extensionGalleryManifestServiceIpc.js';
import { ISharedWebContentExtractorService } from '../../../platform/webContentExtractor/common/webContentExtractor.js';
import { SharedWebContentExtractorService } from '../../../platform/webContentExtractor/node/sharedWebContentExtractorService.js';
import { McpManagementService } from '../../../platform/mcp/node/mcpManagementService.js';
import { IAllowedMcpServersService, IMcpGalleryService, IMcpManagementService } from '../../../platform/mcp/common/mcpManagement.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../../platform/mcp/common/mcpResourceScannerService.js';
import { McpGalleryService } from '../../../platform/mcp/common/mcpGalleryService.js';
import { McpManagementChannel } from '../../../platform/mcp/common/mcpManagementIpc.js';
import { AllowedMcpServersService } from '../../../platform/mcp/common/allowedMcpServersService.js';
import { IMcpGalleryManifestService } from '../../../platform/mcp/common/mcpGalleryManifest.js';
import { McpGalleryManifestIPCService } from '../../../platform/mcp/common/mcpGalleryManifestServiceIpc.js';
import { IMeteredConnectionService } from '../../../platform/meteredConnection/common/meteredConnection.js';
import { MeteredConnectionChannelClient, METERED_CONNECTION_CHANNEL } from '../../../platform/meteredConnection/common/meteredConnectionIpc.js';
import { PlaywrightChannel } from '../../../platform/browserView/node/playwrightChannel.js';
class SharedProcessMain extends Disposable {
    constructor(configuration) {
        super();
        this.configuration = configuration;
        this.server = this._register(new UtilityProcessMessagePortServer(this));
        this.lifecycleService = undefined;
        this.onDidWindowConnectRaw = this._register(new Emitter());
        this.registerListeners();
    }
    registerListeners() {
        // Shared process lifecycle
        let didExit = false;
        const onExit = () => {
            if (!didExit) {
                didExit = true;
                this.lifecycleService?.fireOnWillShutdown();
                this.dispose();
            }
        };
        process.once('exit', onExit);
        once(process.parentPort, SharedProcessLifecycle.exit, onExit);
    }
    async init() {
        // Services
        const instantiationService = await this.initServices();
        // Config
        registerUserDataSyncConfiguration();
        instantiationService.invokeFunction(accessor => {
            const logService = accessor.get(ILogService);
            const telemetryService = accessor.get(ITelemetryService);
            // Log info
            logService.trace('sharedProcess configuration', JSON.stringify(this.configuration));
            // Channels
            this.initChannels(accessor);
            // Error handler
            this.registerErrorHandler(logService);
            // Report Client OS/DE Info
            this.reportClientOSInfo(telemetryService, logService);
        });
        // Instantiate Contributions
        this._register(combinedDisposable(instantiationService.createInstance(CodeCacheCleaner, this.configuration.codeCachePath), instantiationService.createInstance(LanguagePackCachedDataCleaner), instantiationService.createInstance(UnusedWorkspaceStorageDataCleaner), instantiationService.createInstance(LogsDataCleaner), instantiationService.createInstance(LocalizationsUpdater), instantiationService.createInstance(ExtensionsContributions), instantiationService.createInstance(UserDataProfilesCleaner), instantiationService.createInstance(DefaultExtensionsInitializer)));
    }
    async initServices() {
        const services = new ServiceCollection();
        // Product
        const productService = { _serviceBrand: undefined, ...product };
        services.set(IProductService, productService);
        // Main Process
        const mainRouter = new StaticRouter(ctx => ctx === 'main');
        const mainProcessService = new MainProcessService(this.server, mainRouter);
        services.set(IMainProcessService, mainProcessService);
        // Policies
        const policyService = this.configuration.policiesData ? new PolicyChannelClient(this.configuration.policiesData, mainProcessService.getChannel('policy')) : new NullPolicyService();
        services.set(IPolicyService, policyService);
        // Environment
        const environmentService = new NativeEnvironmentService(this.configuration.args, productService);
        services.set(INativeEnvironmentService, environmentService);
        // Logger
        const loggerService = new LoggerChannelClient(undefined, this.configuration.logLevel, environmentService.logsHome, this.configuration.loggers.map(loggerResource => ({ ...loggerResource, resource: URI.revive(loggerResource.resource) })), mainProcessService.getChannel('logger'));
        services.set(ILoggerService, loggerService);
        // Log
        const sharedLogGroup = { id: 'shared', name: localize('sharedLog', "Shared") };
        const logger = this._register(loggerService.createLogger('sharedprocess', { name: localize('sharedLog', "Shared"), group: sharedLogGroup }));
        const consoleLogger = this._register(new ConsoleLogger(logger.getLevel()));
        const logService = this._register(new LogService(logger, [consoleLogger]));
        services.set(ILogService, logService);
        // Lifecycle
        this.lifecycleService = this._register(new SharedProcessLifecycleService(logService));
        services.set(ISharedProcessLifecycleService, this.lifecycleService);
        // Files
        const fileService = this._register(new FileService(logService));
        services.set(IFileService, fileService);
        const diskFileSystemProvider = this._register(new DiskFileSystemProvider(logService));
        fileService.registerProvider(Schemas.file, diskFileSystemProvider);
        // URI Identity
        const uriIdentityService = new UriIdentityService(fileService);
        services.set(IUriIdentityService, uriIdentityService);
        // User Data Profiles
        const userDataProfilesService = this._register(new UserDataProfilesService(this.configuration.profiles.all, URI.revive(this.configuration.profiles.home).with({ scheme: environmentService.userRoamingDataHome.scheme }), mainProcessService.getChannel('userDataProfiles')));
        services.set(IUserDataProfilesService, userDataProfilesService);
        const userDataFileSystemProvider = this._register(new FileUserDataProvider(Schemas.file, 
        // Specifically for user data, use the disk file system provider
        // from the main process to enable atomic read/write operations.
        // Since user data can change very frequently across multiple
        // processes, we want a single process handling these operations.
        this._register(new DiskFileSystemProviderClient(mainProcessService.getChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME), { pathCaseSensitive: isLinux })), Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));
        fileService.registerProvider(Schemas.vscodeUserData, userDataFileSystemProvider);
        // Configuration
        const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, policyService, logService));
        services.set(IConfigurationService, configurationService);
        // Storage (global access only)
        const storageService = new RemoteStorageService(undefined, { defaultProfile: userDataProfilesService.defaultProfile, currentProfile: userDataProfilesService.defaultProfile }, mainProcessService, environmentService);
        services.set(IStorageService, storageService);
        this._register(toDisposable(() => storageService.flush()));
        // Initialize config & storage in parallel
        await Promise.all([
            configurationService.initialize(),
            storageService.initialize()
        ]);
        // Request
        const networkLogger = this._register(loggerService.createLogger(`network-shared`, { name: localize('networkk', "Network"), group: sharedLogGroup }));
        const requestService = new RequestService(configurationService, environmentService, this._register(new LogService(networkLogger)));
        services.set(IRequestService, requestService);
        // Checksum
        services.set(IChecksumService, new SyncDescriptor(ChecksumService, undefined, false /* proxied to other processes */));
        // V8 Inspect profiler
        services.set(IV8InspectProfilingService, new SyncDescriptor(V8InspectProfilingService, undefined, false /* proxied to other processes */));
        // Native Host
        const nativeHostService = new NativeHostService(-1 /* we are not running in a browser window context */, mainProcessService);
        services.set(INativeHostService, nativeHostService);
        // Metered Connection
        const meteredConnectionService = this._register(new MeteredConnectionChannelClient(mainProcessService.getChannel(METERED_CONNECTION_CHANNEL)));
        services.set(IMeteredConnectionService, meteredConnectionService);
        // Download
        services.set(IDownloadService, new SyncDescriptor(DownloadService, undefined, true));
        // Extension recommendations
        const activeWindowManager = this._register(new ActiveWindowManager(nativeHostService));
        const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
        services.set(IExtensionRecommendationNotificationService, new ExtensionRecommendationNotificationServiceChannelClient(this.server.getChannel('extensionRecommendationNotification', activeWindowRouter)));
        // Telemetry
        let telemetryService;
        const appenders = [];
        const internalTelemetry = isInternalTelemetry(productService, configurationService);
        if (supportsTelemetry(productService, environmentService)) {
            const logAppender = new TelemetryLogAppender('', false, loggerService, environmentService, productService);
            appenders.push(logAppender);
            if (!isLoggingOnly(productService, environmentService) && productService.aiConfig?.ariaKey) {
                const collectorAppender = new OneDataSystemAppender(requestService, internalTelemetry, 'monacoworkbench', null, productService.aiConfig.ariaKey);
                this._register(toDisposable(() => collectorAppender.flush())); // Ensure the 1DS appender is disposed so that it flushes remaining data
                appenders.push(collectorAppender);
            }
            telemetryService = new TelemetryService({
                appenders,
                commonProperties: resolveCommonProperties(release(), hostname(), process.arch, productService.commit, productService.version, this.configuration.machineId, this.configuration.sqmId, this.configuration.devDeviceId, internalTelemetry, productService.date, productService.telemetryAppName),
                sendErrorTelemetry: true,
                piiPaths: getPiiPathsFromEnvironment(environmentService),
                meteredConnectionService,
            }, configurationService, productService);
        }
        else {
            telemetryService = NullTelemetryService;
            const nullAppender = NullAppender;
            appenders.push(nullAppender);
        }
        this.server.registerChannel('telemetryAppender', new TelemetryAppenderChannel(appenders));
        services.set(ITelemetryService, telemetryService);
        // Custom Endpoint Telemetry
        const customEndpointTelemetryService = new CustomEndpointTelemetryService(configurationService, telemetryService, loggerService, environmentService, productService);
        services.set(ICustomEndpointTelemetryService, customEndpointTelemetryService);
        // Extension Management
        services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, undefined, true));
        services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, undefined, true));
        services.set(IExtensionSignatureVerificationService, new SyncDescriptor(ExtensionSignatureVerificationService, undefined, true));
        services.set(IAllowedExtensionsService, new SyncDescriptor(AllowedExtensionsService, undefined, true));
        services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService, undefined, true));
        // MCP Management
        services.set(IAllowedMcpServersService, new SyncDescriptor(AllowedMcpServersService, undefined, true));
        services.set(IMcpGalleryManifestService, new McpGalleryManifestIPCService(this.server));
        services.set(IMcpGalleryService, new SyncDescriptor(McpGalleryService, undefined, true));
        services.set(IMcpResourceScannerService, new SyncDescriptor(McpResourceScannerService, undefined, true));
        services.set(IMcpManagementService, new SyncDescriptor(McpManagementService, undefined, true));
        // Extension Gallery
        services.set(IExtensionGalleryManifestService, new ExtensionGalleryManifestIPCService(this.server, productService));
        services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService, undefined, true));
        // Extension Tips
        services.set(IExtensionTipsService, new SyncDescriptor(ExtensionTipsService, undefined, false /* Eagerly scans and computes exe based recommendations */));
        // Localizations
        services.set(ILanguagePackService, new SyncDescriptor(NativeLanguagePackService, undefined, false /* proxied to other processes */));
        // Diagnostics
        services.set(IDiagnosticsService, new SyncDescriptor(DiagnosticsService, undefined, false /* proxied to other processes */));
        // Settings Sync
        services.set(IUserDataSyncAccountService, new SyncDescriptor(UserDataSyncAccountService, undefined, true));
        services.set(IUserDataSyncLogService, new SyncDescriptor(UserDataSyncLogService, undefined, true));
        services.set(IUserDataSyncUtilService, ProxyChannel.toService(this.server.getChannel('userDataSyncUtil', client => client.ctx !== 'main')));
        services.set(IGlobalExtensionEnablementService, new SyncDescriptor(GlobalExtensionEnablementService, undefined, false /* Eagerly resets installed extensions */));
        services.set(IIgnoredExtensionsManagementService, new SyncDescriptor(IgnoredExtensionsManagementService, undefined, true));
        services.set(IExtensionStorageService, new SyncDescriptor(ExtensionStorageService));
        services.set(IUserDataSyncStoreManagementService, new SyncDescriptor(UserDataSyncStoreManagementService, undefined, true));
        services.set(IUserDataSyncStoreService, new SyncDescriptor(UserDataSyncStoreService, undefined, true));
        services.set(IUserDataSyncMachinesService, new SyncDescriptor(UserDataSyncMachinesService, undefined, true));
        services.set(IUserDataSyncLocalStoreService, new SyncDescriptor(UserDataSyncLocalStoreService, undefined, false /* Eagerly cleans up old backups */));
        services.set(IUserDataSyncEnablementService, new SyncDescriptor(UserDataSyncEnablementService, undefined, true));
        services.set(IUserDataSyncService, new SyncDescriptor(UserDataSyncService, undefined, false /* Initializes the Sync State */));
        services.set(IUserDataProfileStorageService, new SyncDescriptor(SharedProcessUserDataProfileStorageService, undefined, true));
        services.set(IUserDataSyncResourceProviderService, new SyncDescriptor(UserDataSyncResourceProviderService, undefined, true));
        // Signing
        services.set(ISignService, new SyncDescriptor(SignService, undefined, false /* proxied to other processes */));
        // Tunnel
        const remoteSocketFactoryService = new RemoteSocketFactoryService();
        services.set(IRemoteSocketFactoryService, remoteSocketFactoryService);
        remoteSocketFactoryService.register(0 /* RemoteConnectionType.WebSocket */, nodeSocketFactory);
        services.set(ISharedTunnelsService, new SyncDescriptor(SharedTunnelsService));
        services.set(ISharedProcessTunnelService, new SyncDescriptor(SharedProcessTunnelService));
        // Remote Tunnel
        services.set(IRemoteTunnelService, new SyncDescriptor(RemoteTunnelService));
        // Web Content Extractor
        services.set(ISharedWebContentExtractorService, new SyncDescriptor(SharedWebContentExtractorService));
        // SSH Remote Agent Host
        services.set(ISSHRemoteAgentHostMainService, new SyncDescriptor(SSHRemoteAgentHostMainService, undefined, true));
        return new InstantiationService(services);
    }
    initChannels(accessor) {
        // Extensions Management
        const channel = new ExtensionManagementChannel(accessor.get(IExtensionManagementService), () => null);
        this.server.registerChannel('extensions', channel);
        // Mcp Management
        const mcpManagementChannel = new McpManagementChannel(accessor.get(IMcpManagementService), () => null);
        this.server.registerChannel('mcpManagement', mcpManagementChannel);
        // Language Packs
        const languagePacksChannel = ProxyChannel.fromService(accessor.get(ILanguagePackService), this._store);
        this.server.registerChannel('languagePacks', languagePacksChannel);
        // Diagnostics
        const diagnosticsChannel = ProxyChannel.fromService(accessor.get(IDiagnosticsService), this._store);
        this.server.registerChannel('diagnostics', diagnosticsChannel);
        // Extension Tips
        const extensionTipsChannel = new ExtensionTipsChannel(accessor.get(IExtensionTipsService));
        this.server.registerChannel('extensionTipsService', extensionTipsChannel);
        // Checksum
        const checksumChannel = ProxyChannel.fromService(accessor.get(IChecksumService), this._store);
        this.server.registerChannel('checksum', checksumChannel);
        // Profiling
        const profilingChannel = ProxyChannel.fromService(accessor.get(IV8InspectProfilingService), this._store);
        this.server.registerChannel('v8InspectProfiling', profilingChannel);
        // Settings Sync
        const userDataSyncMachineChannel = ProxyChannel.fromService(accessor.get(IUserDataSyncMachinesService), this._store);
        this.server.registerChannel('userDataSyncMachines', userDataSyncMachineChannel);
        // Custom Endpoint Telemetry
        const customEndpointTelemetryChannel = ProxyChannel.fromService(accessor.get(ICustomEndpointTelemetryService), this._store);
        this.server.registerChannel('customEndpointTelemetry', customEndpointTelemetryChannel);
        const userDataSyncAccountChannel = new UserDataSyncAccountServiceChannel(accessor.get(IUserDataSyncAccountService));
        this.server.registerChannel('userDataSyncAccount', userDataSyncAccountChannel);
        const userDataSyncStoreManagementChannel = new UserDataSyncStoreManagementServiceChannel(accessor.get(IUserDataSyncStoreManagementService));
        this.server.registerChannel('userDataSyncStoreManagement', userDataSyncStoreManagementChannel);
        const userDataSyncChannel = new UserDataSyncServiceChannel(accessor.get(IUserDataSyncService), accessor.get(IUserDataProfilesService), accessor.get(ILogService));
        this.server.registerChannel('userDataSync', userDataSyncChannel);
        const userDataAutoSync = this._register(accessor.get(IInstantiationService).createInstance(UserDataAutoSyncService));
        this.server.registerChannel('userDataAutoSync', ProxyChannel.fromService(userDataAutoSync, this._store));
        this.server.registerChannel('IUserDataSyncResourceProviderService', ProxyChannel.fromService(accessor.get(IUserDataSyncResourceProviderService), this._store));
        // Tunnel
        const sharedProcessTunnelChannel = ProxyChannel.fromService(accessor.get(ISharedProcessTunnelService), this._store);
        this.server.registerChannel(ipcSharedProcessTunnelChannelName, sharedProcessTunnelChannel);
        // Remote Tunnel
        const remoteTunnelChannel = ProxyChannel.fromService(accessor.get(IRemoteTunnelService), this._store);
        this.server.registerChannel('remoteTunnel', remoteTunnelChannel);
        // Web Content Extractor
        const webContentExtractorChannel = ProxyChannel.fromService(accessor.get(ISharedWebContentExtractorService), this._store);
        this.server.registerChannel('sharedWebContentExtractor', webContentExtractorChannel);
        // Playwright
        const playwrightChannel = this._register(new PlaywrightChannel(this.server, accessor.get(IMainProcessService), accessor.get(ILogService)));
        this.server.registerChannel('playwright', playwrightChannel);
        // SSH Remote Agent Host
        const sshRemoteAgentHostChannel = ProxyChannel.fromService(accessor.get(ISSHRemoteAgentHostMainService), this._store);
        this.server.registerChannel(SSH_REMOTE_AGENT_HOST_CHANNEL, sshRemoteAgentHostChannel);
    }
    registerErrorHandler(logService) {
        // Listen on global error events
        process.on('uncaughtException', error => onUnexpectedError(error));
        process.on('unhandledRejection', (reason) => onUnexpectedError(reason));
        // Install handler for unexpected errors
        setUnexpectedErrorHandler(error => {
            const message = toErrorMessage(error, true);
            if (!message) {
                return;
            }
            logService.error(`[uncaught exception in sharedProcess]: ${message}`);
        });
    }
    async reportClientOSInfo(telemetryService, logService) {
        if (isLinux) {
            const [releaseInfo, displayProtocol] = await Promise.all([
                getOSReleaseInfo(logService.error.bind(logService)),
                getDisplayProtocol(logService.error.bind(logService))
            ]);
            const desktopEnvironment = getDesktopEnvironment();
            const codeSessionType = getCodeDisplayProtocol(displayProtocol, this.configuration.args['ozone-platform']);
            if (releaseInfo) {
                telemetryService.publicLog2('clientPlatformInfo', {
                    platformId: releaseInfo.id,
                    platformVersionId: releaseInfo.version_id,
                    platformIdLike: releaseInfo.id_like,
                    desktopEnvironment: desktopEnvironment,
                    displayProtocol: displayProtocol,
                    codeDisplayProtocol: codeSessionType
                });
            }
        }
    }
    handledClientConnection(e) {
        // This filter on message port messages will look for
        // attempts of a window to connect raw to the shared
        // process to handle these connections separate from
        // our IPC based protocol.
        if (e.data !== SharedProcessRawConnection.response) {
            return false;
        }
        const port = e.ports.at(0);
        if (port) {
            this.onDidWindowConnectRaw.fire(port);
            return true;
        }
        return false;
    }
}
export async function main(configuration) {
    // create shared process and signal back to main that we are
    // ready to accept message ports as client connections
    try {
        const sharedProcess = new SharedProcessMain(configuration);
        process.parentPort.postMessage(SharedProcessLifecycle.ipcReady);
        // await initialization and signal this back to electron-main
        await sharedProcess.init();
        process.parentPort.postMessage(SharedProcessLifecycle.initDone);
    }
    catch (error) {
        process.parentPort.postMessage({ error: error.toString() });
    }
}
const handle = setTimeout(() => {
    process.parentPort.postMessage({ warning: '[SharedProcess] did not receive configuration within 30s...' });
}, 30000);
process.parentPort.once('message', (e) => {
    clearTimeout(handle);
    main(e.data);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmVkUHJvY2Vzc01haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9jb2RlL2VsZWN0cm9uLXV0aWxpdHkvc2hhcmVkUHJvY2Vzcy9zaGFyZWRQcm9jZXNzTWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLElBQUksQ0FBQztBQUV2QyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDOUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25GLE9BQU8sRUFBMkIsTUFBTSxJQUFJLCtCQUErQixFQUFFLElBQUksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNw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