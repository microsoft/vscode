/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname, release } from 'os';
import { MessagePortMain, MessageEvent } from 'vs/base/parts/sandbox/node/electronTypes';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { combinedDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { firstOrDefault } from 'vs/base/common/arrays';
import { Emitter } from 'vs/base/common/event';
import { ProxyChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { IClientConnectionFilter, Server as UtilityProcessMessagePortServer, once } from 'vs/base/parts/ipc/node/ipc.mp';
import { CodeCacheCleaner } from 'vs/code/node/sharedProcess/contrib/codeCacheCleaner';
import { LanguagePackCachedDataCleaner } from 'vs/code/node/sharedProcess/contrib/languagePackCachedDataCleaner';
import { LocalizationsUpdater } from 'vs/code/node/sharedProcess/contrib/localizationsUpdater';
import { LogsDataCleaner } from 'vs/code/node/sharedProcess/contrib/logsDataCleaner';
import { UnusedWorkspaceStorageDataCleaner } from 'vs/code/node/sharedProcess/contrib/storageDataCleaner';
import { IChecksumService } from 'vs/platform/checksum/common/checksumService';
import { ChecksumService } from 'vs/platform/checksum/node/checksumService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IDiagnosticsService } from 'vs/platform/diagnostics/common/diagnostics';
import { DiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { GlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService, IExtensionManagementService, IExtensionTipsService, IGlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionSignatureVerificationService, IExtensionSignatureVerificationService } from 'vs/platform/extensionManagement/node/extensionSignatureVerificationService';
import { ExtensionManagementChannel, ExtensionTipsChannel } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { ExtensionManagementService, INativeServerExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IExtensionRecommendationNotificationService } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { NativeLanguagePackService } from 'vs/platform/languagePacks/node/languagePacks';
import { ConsoleLogger, ILoggerService, ILogService } from 'vs/platform/log/common/log';
import { LoggerChannelClient } from 'vs/platform/log/common/logIpc';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService } from 'vs/platform/request/common/request';
import { ISharedProcessConfiguration } from 'vs/platform/sharedProcess/node/sharedProcess';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { resolveCommonProperties } from 'vs/platform/telemetry/common/commonProperties';
import { ICustomEndpointTelemetryService, ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryAppenderChannel } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryLogAppender } from 'vs/platform/telemetry/common/telemetryLogAppender';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { supportsTelemetry, ITelemetryAppender, NullAppender, NullTelemetryService, getPiiPathsFromEnvironment, isInternalTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { CustomEndpointTelemetryService } from 'vs/platform/telemetry/node/customEndpointTelemetryService';
import { ExtensionStorageService, IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { IUserDataSyncBackupStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration as registerUserDataSyncConfiguration, IUserDataSyncResourceProviderService } from 'vs/platform/userDataSync/common/userDataSync';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { UserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSyncBackupStoreService';
import { UserDataAutoSyncChannel, UserDataSyncAccountServiceChannel, UserDataSyncMachinesServiceChannel, UserDataSyncStoreManagementServiceChannel, UserDataSyncUtilServiceClient } from 'vs/platform/userDataSync/common/userDataSyncIpc';
import { UserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSyncLog';
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { UserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSyncEnablementService';
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService';
import { UserDataSyncChannel } from 'vs/platform/userDataSync/common/userDataSyncServiceIpc';
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IUserDataProfileStorageService } from 'vs/platform/userDataProfile/common/userDataProfileStorageService';
import { NativeUserDataProfileStorageService } from 'vs/platform/userDataProfile/node/userDataProfileStorageService';
import { ActiveWindowManager } from 'vs/platform/windows/node/windowTracker';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/node/signService';
import { ISharedTunnelsService } from 'vs/platform/tunnel/common/tunnel';
import { SharedTunnelsService } from 'vs/platform/tunnel/node/tunnelService';
import { ipcSharedProcessTunnelChannelName, ISharedProcessTunnelService } from 'vs/platform/remote/common/sharedProcessTunnelService';
import { SharedProcessTunnelService } from 'vs/platform/tunnel/node/sharedProcessTunnelService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { isLinux } from 'vs/base/common/platform';
import { FileUserDataProvider } from 'vs/platform/userData/common/fileUserDataProvider';
import { DiskFileSystemProviderClient, LOCAL_FILE_SYSTEM_CHANNEL_NAME } from 'vs/platform/files/common/diskFileSystemProviderClient';
import { InspectProfilingService as V8InspectProfilingService } from 'vs/platform/profiling/node/profilingService';
import { IV8InspectProfilingService } from 'vs/platform/profiling/common/profiling';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionsScannerService } from 'vs/platform/extensionManagement/node/extensionsScannerService';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { PolicyChannelClient } from 'vs/platform/policy/common/policyIpc';
import { IPolicyService, NullPolicyService } from 'vs/platform/policy/common/policy';
import { UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfileIpc';
import { OneDataSystemAppender } from 'vs/platform/telemetry/node/1dsAppender';
import { UserDataProfilesCleaner } from 'vs/code/node/sharedProcess/contrib/userDataProfilesCleaner';
import { IRemoteTunnelService } from 'vs/platform/remoteTunnel/common/remoteTunnel';
import { UserDataSyncResourceProviderService } from 'vs/platform/userDataSync/common/userDataSyncResourceProvider';
import { ExtensionsContributions } from 'vs/code/node/sharedProcess/contrib/extensions';
import { localize } from 'vs/nls';
import { LogService } from 'vs/platform/log/common/logService';
import { ISharedProcessLifecycleService, SharedProcessLifecycleService } from 'vs/platform/lifecycle/node/sharedProcessLifecycleService';
import { RemoteTunnelService } from 'vs/platform/remoteTunnel/node/remoteTunnelService';
import { ExtensionsProfileScannerService } from 'vs/platform/extensionManagement/node/extensionsProfileScannerService';
import { RequestChannelClient } from 'vs/platform/request/common/requestIpc';
import { ExtensionRecommendationNotificationServiceChannelClient } from 'vs/platform/extensionRecommendations/common/extensionRecommendationsIpc';
import { INativeHostService } from 'vs/platform/native/common/native';
import { UserDataAutoSyncService } from 'vs/platform/userDataSync/node/userDataAutoSyncService';
import { ExtensionTipsService } from 'vs/platform/extensionManagement/node/extensionTipsService';
import { IMainProcessService, MainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { RemoteStorageService } from 'vs/platform/storage/common/storageService';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from 'vs/platform/remote/common/remoteSocketFactoryService';
import { RemoteConnectionType } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { nodeSocketFactory } from 'vs/platform/remote/node/nodeSocketFactory';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IVoiceRecognitionService, VoiceRecognitionService } from 'vs/platform/voiceRecognition/node/voiceRecognitionService';
import { VoiceTranscriptionManager } from 'vs/code/node/sharedProcess/contrib/voiceTranscriber';
import { SharedProcessRawConnection, SharedProcessLifecycle } from 'vs/platform/sharedProcess/common/sharedProcess';

class SharedProcessMain extends Disposable implements IClientConnectionFilter {

	private readonly server = this._register(new UtilityProcessMessagePortServer(this));

	private lifecycleService: SharedProcessLifecycleService | undefined = undefined;

	private readonly onDidWindowConnectRaw = this._register(new Emitter<MessagePortMain>());

	constructor(private configuration: ISharedProcessConfiguration) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

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

	async init(): Promise<void> {

		// Services
		const instantiationService = await this.initServices();

		// Config
		registerUserDataSyncConfiguration();

		instantiationService.invokeFunction(accessor => {
			const logService = accessor.get(ILogService);

			// Log info
			logService.trace('sharedProcess configuration', JSON.stringify(this.configuration));

			// Channels
			this.initChannels(accessor);

			// Error handler
			this.registerErrorHandler(logService);
		});

		// Instantiate Contributions
		this._register(combinedDisposable(
			instantiationService.createInstance(CodeCacheCleaner, this.configuration.codeCachePath),
			instantiationService.createInstance(LanguagePackCachedDataCleaner),
			instantiationService.createInstance(UnusedWorkspaceStorageDataCleaner),
			instantiationService.createInstance(LogsDataCleaner),
			instantiationService.createInstance(LocalizationsUpdater),
			instantiationService.createInstance(ExtensionsContributions),
			instantiationService.createInstance(UserDataProfilesCleaner),
			instantiationService.createInstance(VoiceTranscriptionManager, this.onDidWindowConnectRaw.event)
		));
	}

	private async initServices(): Promise<IInstantiationService> {
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
		const logger = this._register(loggerService.createLogger('sharedprocess', { name: localize('sharedLog', "Shared") }));
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

		const userDataFileSystemProvider = this._register(new FileUserDataProvider(
			Schemas.file,
			// Specifically for user data, use the disk file system provider
			// from the main process to enable atomic read/write operations.
			// Since user data can change very frequently across multiple
			// processes, we want a single process handling these operations.
			this._register(new DiskFileSystemProviderClient(mainProcessService.getChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME), { pathCaseSensitive: isLinux })),
			Schemas.vscodeUserData,
			logService
		));
		fileService.registerProvider(Schemas.vscodeUserData, userDataFileSystemProvider);

		// User Data Profiles
		const userDataProfilesService = this._register(new UserDataProfilesService(this.configuration.profiles.all, URI.revive(this.configuration.profiles.home).with({ scheme: environmentService.userRoamingDataHome.scheme }), mainProcessService.getChannel('userDataProfiles')));
		services.set(IUserDataProfilesService, userDataProfilesService);

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

		// URI Identity
		const uriIdentityService = new UriIdentityService(fileService);
		services.set(IUriIdentityService, uriIdentityService);

		// Request
		const requestService = new RequestChannelClient(mainProcessService.getChannel('request'));
		services.set(IRequestService, requestService);

		// Checksum
		services.set(IChecksumService, new SyncDescriptor(ChecksumService, undefined, false /* proxied to other processes */));

		// V8 Inspect profiler
		services.set(IV8InspectProfilingService, new SyncDescriptor(V8InspectProfilingService, undefined, false /* proxied to other processes */));

		// Native Host
		const nativeHostService = ProxyChannel.toService<INativeHostService>(mainProcessService.getChannel('nativeHost'));
		services.set(INativeHostService, nativeHostService);

		// Download
		services.set(IDownloadService, new SyncDescriptor(DownloadService, undefined, true));

		// Extension recommendations
		const activeWindowManager = this._register(new ActiveWindowManager(nativeHostService));
		const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
		services.set(IExtensionRecommendationNotificationService, new ExtensionRecommendationNotificationServiceChannelClient(this.server.getChannel('extensionRecommendationNotification', activeWindowRouter)));

		// Telemetry
		let telemetryService: ITelemetryService;
		const appenders: ITelemetryAppender[] = [];
		const internalTelemetry = isInternalTelemetry(productService, configurationService);
		if (supportsTelemetry(productService, environmentService)) {
			const logAppender = new TelemetryLogAppender(logService, loggerService, environmentService, productService);
			appenders.push(logAppender);
			if (productService.aiConfig?.ariaKey) {
				const collectorAppender = new OneDataSystemAppender(requestService, internalTelemetry, 'monacoworkbench', null, productService.aiConfig.ariaKey);
				this._register(toDisposable(() => collectorAppender.flush())); // Ensure the 1DS appender is disposed so that it flushes remaining data
				appenders.push(collectorAppender);
			}

			telemetryService = new TelemetryService({
				appenders,
				commonProperties: resolveCommonProperties(release(), hostname(), process.arch, productService.commit, productService.version, this.configuration.machineId, internalTelemetry),
				sendErrorTelemetry: true,
				piiPaths: getPiiPathsFromEnvironment(environmentService),
			}, configurationService, productService);
		} else {
			telemetryService = NullTelemetryService;
			const nullAppender = NullAppender;
			appenders.push(nullAppender);
		}

		this.server.registerChannel('telemetryAppender', new TelemetryAppenderChannel(appenders));
		services.set(ITelemetryService, telemetryService);

		// Custom Endpoint Telemetry
		const customEndpointTelemetryService = new CustomEndpointTelemetryService(configurationService, telemetryService, logService, loggerService, environmentService, productService);
		services.set(ICustomEndpointTelemetryService, customEndpointTelemetryService);

		// Extension Management
		services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, undefined, true));
		services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, undefined, true));
		services.set(IExtensionSignatureVerificationService, new SyncDescriptor(ExtensionSignatureVerificationService, undefined, true));
		services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService, undefined, true));

		// Extension Gallery
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
		services.set(IUserDataSyncUtilService, new UserDataSyncUtilServiceClient(this.server.getChannel('userDataSyncUtil', client => client.ctx !== 'main')));
		services.set(IGlobalExtensionEnablementService, new SyncDescriptor(GlobalExtensionEnablementService, undefined, false /* Eagerly resets installed extensions */));
		services.set(IIgnoredExtensionsManagementService, new SyncDescriptor(IgnoredExtensionsManagementService, undefined, true));
		services.set(IExtensionStorageService, new SyncDescriptor(ExtensionStorageService));
		services.set(IUserDataSyncStoreManagementService, new SyncDescriptor(UserDataSyncStoreManagementService, undefined, true));
		services.set(IUserDataSyncStoreService, new SyncDescriptor(UserDataSyncStoreService, undefined, true));
		services.set(IUserDataSyncMachinesService, new SyncDescriptor(UserDataSyncMachinesService, undefined, true));
		services.set(IUserDataSyncBackupStoreService, new SyncDescriptor(UserDataSyncBackupStoreService, undefined, false /* Eagerly cleans up old backups */));
		services.set(IUserDataSyncEnablementService, new SyncDescriptor(UserDataSyncEnablementService, undefined, true));
		services.set(IUserDataSyncService, new SyncDescriptor(UserDataSyncService, undefined, false /* Initializes the Sync State */));
		services.set(IUserDataProfileStorageService, new SyncDescriptor(NativeUserDataProfileStorageService, undefined, true));
		services.set(IUserDataSyncResourceProviderService, new SyncDescriptor(UserDataSyncResourceProviderService, undefined, true));

		// Signing
		services.set(ISignService, new SyncDescriptor(SignService, undefined, false /* proxied to other processes */));

		// Tunnel
		const remoteSocketFactoryService = new RemoteSocketFactoryService();
		services.set(IRemoteSocketFactoryService, remoteSocketFactoryService);
		remoteSocketFactoryService.register(RemoteConnectionType.WebSocket, nodeSocketFactory);
		services.set(ISharedTunnelsService, new SyncDescriptor(SharedTunnelsService));
		services.set(ISharedProcessTunnelService, new SyncDescriptor(SharedProcessTunnelService));

		// Remote Tunnel
		services.set(IRemoteTunnelService, new SyncDescriptor(RemoteTunnelService));

		// Voice Recognition
		services.set(IVoiceRecognitionService, new SyncDescriptor(VoiceRecognitionService));

		return new InstantiationService(services);
	}

	private initChannels(accessor: ServicesAccessor): void {

		// Extensions Management
		const channel = new ExtensionManagementChannel(accessor.get(IExtensionManagementService), () => null);
		this.server.registerChannel('extensions', channel);

		// Language Packs
		const languagePacksChannel = ProxyChannel.fromService(accessor.get(ILanguagePackService));
		this.server.registerChannel('languagePacks', languagePacksChannel);

		// Diagnostics
		const diagnosticsChannel = ProxyChannel.fromService(accessor.get(IDiagnosticsService));
		this.server.registerChannel('diagnostics', diagnosticsChannel);

		// Extension Tips
		const extensionTipsChannel = new ExtensionTipsChannel(accessor.get(IExtensionTipsService));
		this.server.registerChannel('extensionTipsService', extensionTipsChannel);

		// Checksum
		const checksumChannel = ProxyChannel.fromService(accessor.get(IChecksumService));
		this.server.registerChannel('checksum', checksumChannel);

		// Profiling
		const profilingChannel = ProxyChannel.fromService(accessor.get(IV8InspectProfilingService));
		this.server.registerChannel('v8InspectProfiling', profilingChannel);

		// Settings Sync
		const userDataSyncMachineChannel = new UserDataSyncMachinesServiceChannel(accessor.get(IUserDataSyncMachinesService));
		this.server.registerChannel('userDataSyncMachines', userDataSyncMachineChannel);

		// Custom Endpoint Telemetry
		const customEndpointTelemetryChannel = ProxyChannel.fromService(accessor.get(ICustomEndpointTelemetryService));
		this.server.registerChannel('customEndpointTelemetry', customEndpointTelemetryChannel);

		const userDataSyncAccountChannel = new UserDataSyncAccountServiceChannel(accessor.get(IUserDataSyncAccountService));
		this.server.registerChannel('userDataSyncAccount', userDataSyncAccountChannel);

		const userDataSyncStoreManagementChannel = new UserDataSyncStoreManagementServiceChannel(accessor.get(IUserDataSyncStoreManagementService));
		this.server.registerChannel('userDataSyncStoreManagement', userDataSyncStoreManagementChannel);

		const userDataSyncChannel = new UserDataSyncChannel(accessor.get(IUserDataSyncService), accessor.get(IUserDataProfilesService), accessor.get(ILogService));
		this.server.registerChannel('userDataSync', userDataSyncChannel);

		const userDataAutoSync = this._register(accessor.get(IInstantiationService).createInstance(UserDataAutoSyncService));
		const userDataAutoSyncChannel = new UserDataAutoSyncChannel(userDataAutoSync);
		this.server.registerChannel('userDataAutoSync', userDataAutoSyncChannel);

		// Tunnel
		const sharedProcessTunnelChannel = ProxyChannel.fromService(accessor.get(ISharedProcessTunnelService));
		this.server.registerChannel(ipcSharedProcessTunnelChannelName, sharedProcessTunnelChannel);

		// Remote Tunnel
		const remoteTunnelChannel = ProxyChannel.fromService(accessor.get(IRemoteTunnelService));
		this.server.registerChannel('remoteTunnel', remoteTunnelChannel);
	}

	private registerErrorHandler(logService: ILogService): void {

		// Listen on global error events
		process.on('uncaughtException', error => onUnexpectedError(error));
		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));

		// Install handler for unexpected errors
		setUnexpectedErrorHandler(error => {
			const message = toErrorMessage(error, true);
			if (!message) {
				return;
			}

			logService.error(`[uncaught exception in sharedProcess]: ${message}`);
		});
	}

	handledClientConnection(e: MessageEvent): boolean {

		// This filter on message port messages will look for
		// attempts of a window to connect raw to the shared
		// process to handle these connections separate from
		// our IPC based protocol.

		if (e.data !== SharedProcessRawConnection.response) {
			return false;
		}

		const port = firstOrDefault(e.ports);
		if (port) {
			this.onDidWindowConnectRaw.fire(port);

			return true;
		}

		return false;
	}
}

export async function main(configuration: ISharedProcessConfiguration): Promise<void> {

	// create shared process and signal back to main that we are
	// ready to accept message ports as client connections

	const sharedProcess = new SharedProcessMain(configuration);
	process.parentPort.postMessage(SharedProcessLifecycle.ipcReady);

	// await initialization and signal this back to electron-main
	await sharedProcess.init();

	process.parentPort.postMessage(SharedProcessLifecycle.initDone);
}

process.parentPort.once('message', (e: Electron.MessageEvent) => {
	main(e.data as ISharedProcessConfiguration);
});
