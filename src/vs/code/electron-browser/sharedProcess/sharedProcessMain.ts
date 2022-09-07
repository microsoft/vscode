/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from 'electron';
import { hostname, release } from 'os';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { combinedDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ProxyChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { Server as MessagePortServer } from 'vs/base/parts/ipc/electron-browser/ipc.mp';
import { CodeCacheCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/codeCacheCleaner';
import { ExtensionsCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/extensionsCleaner';
import { LanguagePackCachedDataCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/languagePackCachedDataCleaner';
import { LocalizationsUpdater } from 'vs/code/electron-browser/sharedProcess/contrib/localizationsUpdater';
import { LogsDataCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/logsDataCleaner';
import { UnusedWorkspaceStorageDataCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/storageDataCleaner';
import { IChecksumService } from 'vs/platform/checksum/common/checksumService';
import { ChecksumService } from 'vs/platform/checksum/node/checksumService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IDiagnosticsService } from 'vs/platform/diagnostics/common/diagnostics';
import { DiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { SharedProcessEnvironmentService } from 'vs/platform/sharedProcess/node/sharedProcessEnvironmentService';
import { GlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService, IExtensionManagementService, IExtensionTipsService, IGlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannel, ExtensionTipsChannel } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { ExtensionTipsService } from 'vs/platform/extensionManagement/electron-sandbox/extensionTipsService';
import { ExtensionManagementService, INativeServerExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IExtensionRecommendationNotificationService } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { ExtensionRecommendationNotificationServiceChannelClient } from 'vs/platform/extensionRecommendations/electron-sandbox/extensionRecommendationsIpc';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { MessagePortMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { NativeLanguagePackService } from 'vs/platform/languagePacks/node/languagePacks';
import { ConsoleLogger, ILoggerService, ILogService, MultiplexLogService } from 'vs/platform/log/common/log';
import { FollowerLogService, LoggerChannelClient, LogLevelChannelClient } from 'vs/platform/log/common/logIpc';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService } from 'vs/platform/request/common/request';
import { ISharedProcessConfiguration } from 'vs/platform/sharedProcess/node/sharedProcess';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { NativeStorageService } from 'vs/platform/storage/electron-sandbox/storageService';
import { resolveCommonProperties } from 'vs/platform/telemetry/common/commonProperties';
import { ICustomEndpointTelemetryService, ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryAppenderChannel } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryLogAppender } from 'vs/platform/telemetry/common/telemetryLogAppender';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { supportsTelemetry, ITelemetryAppender, NullAppender, NullTelemetryService, getPiiPathsFromEnvironment, isInternalTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { CustomEndpointTelemetryService } from 'vs/platform/telemetry/node/customEndpointTelemetryService';
import { LocalReconnectConstants, TerminalIpcChannels, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { PtyHostService } from 'vs/platform/terminal/node/ptyHostService';
import { ExtensionStorageService, IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { IUserDataSyncBackupStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration as registerUserDataSyncConfiguration } from 'vs/platform/userDataSync/common/userDataSync';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { UserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSyncBackupStoreService';
import { UserDataAutoSyncChannel, UserDataSyncAccountServiceChannel, UserDataSyncMachinesServiceChannel, UserDataSyncStoreManagementServiceChannel, UserDataSyncUtilServiceClient } from 'vs/platform/userDataSync/common/userDataSyncIpc';
import { UserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSyncLog';
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { UserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSyncEnablementService';
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService';
import { UserDataSyncChannel } from 'vs/platform/userDataSync/common/userDataSyncServiceIpc';
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { UserDataAutoSyncService } from 'vs/platform/userDataSync/electron-sandbox/userDataAutoSyncService';
import { ActiveWindowManager } from 'vs/platform/windows/node/windowTracker';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/node/signService';
import { ISharedTunnelsService } from 'vs/platform/tunnel/common/tunnel';
import { SharedTunnelsService } from 'vs/platform/tunnel/node/tunnelService';
import { ipcSharedProcessTunnelChannelName, ISharedProcessTunnelService } from 'vs/platform/remote/common/sharedProcessTunnelService';
import { SharedProcessTunnelService } from 'vs/platform/tunnel/node/sharedProcessTunnelService';
import { ipcSharedProcessWorkerChannelName, ISharedProcessWorkerConfiguration, ISharedProcessWorkerService } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { SharedProcessWorkerService } from 'vs/platform/sharedProcess/electron-browser/sharedProcessWorkerService';
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
import { ExtensionsProfileScannerService, IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { PolicyChannelClient } from 'vs/platform/policy/common/policyIpc';
import { IPolicyService, NullPolicyService } from 'vs/platform/policy/common/policy';
import { UserDataProfilesNativeService } from 'vs/platform/userDataProfile/electron-sandbox/userDataProfile';
import { SharedProcessRequestService } from 'vs/platform/request/electron-browser/sharedProcessRequestService';
import { OneDataSystemAppender } from 'vs/platform/telemetry/node/1dsAppender';
import { UserDataProfilesCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/userDataProfilesCleaner';

class SharedProcessMain extends Disposable {

	private server = this._register(new MessagePortServer());

	private sharedProcessWorkerService: ISharedProcessWorkerService | undefined = undefined;

	constructor(private configuration: ISharedProcessConfiguration) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Shared process lifecycle
		const onExit = () => this.dispose();
		process.once('exit', onExit);
		ipcRenderer.once('vscode:electron-main->shared-process=exit', onExit);

		// Shared process worker lifecycle
		//
		// We dispose the listener when the shared process is
		// disposed to avoid disposing workers when the entire
		// application is shutting down anyways.
		//
		const eventName = 'vscode:electron-main->shared-process=disposeWorker';
		const onDisposeWorker = (event: unknown, configuration: ISharedProcessWorkerConfiguration) => { this.onDisposeWorker(configuration); };
		ipcRenderer.on(eventName, onDisposeWorker);
		this._register(toDisposable(() => ipcRenderer.removeListener(eventName, onDisposeWorker)));
	}

	private onDisposeWorker(configuration: ISharedProcessWorkerConfiguration): void {
		this.sharedProcessWorkerService?.disposeWorker(configuration);
	}

	async open(): Promise<void> {

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
			instantiationService.createInstance(ExtensionsCleaner),
			instantiationService.createInstance(UserDataProfilesCleaner)
		));
	}

	private async initServices(): Promise<IInstantiationService> {
		const services = new ServiceCollection();

		// Product
		const productService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);

		// Main Process
		const mainRouter = new StaticRouter(ctx => ctx === 'main');
		const mainProcessService = new MessagePortMainProcessService(this.server, mainRouter);
		services.set(IMainProcessService, mainProcessService);

		// Policies
		const policyService = this.configuration.policiesData ? new PolicyChannelClient(this.configuration.policiesData, mainProcessService.getChannel('policy')) : new NullPolicyService();
		services.set(IPolicyService, policyService);

		// Environment
		const environmentService = new SharedProcessEnvironmentService(this.configuration.args, productService);
		services.set(INativeEnvironmentService, environmentService);

		// Logger
		const logLevelClient = new LogLevelChannelClient(this.server.getChannel('logLevel', mainRouter));
		const loggerService = new LoggerChannelClient(this.configuration.logLevel, logLevelClient.onDidChangeLogLevel, mainProcessService.getChannel('logger'));
		services.set(ILoggerService, loggerService);

		// Log
		const multiplexLogger = this._register(new MultiplexLogService([
			this._register(new ConsoleLogger(this.configuration.logLevel)),
			this._register(loggerService.createLogger(joinPath(URI.file(environmentService.logsPath), 'sharedprocess.log'), { name: 'sharedprocess' }))
		]));

		const logService = this._register(new FollowerLogService(logLevelClient, multiplexLogger));
		services.set(ILogService, logService);

		// Worker
		this.sharedProcessWorkerService = new SharedProcessWorkerService(logService);
		services.set(ISharedProcessWorkerService, this.sharedProcessWorkerService);

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
		const userDataProfilesService = this._register(new UserDataProfilesNativeService(this.configuration.profiles, mainProcessService, environmentService));
		services.set(IUserDataProfilesService, userDataProfilesService);

		// Configuration
		const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, policyService, logService));
		services.set(IConfigurationService, configurationService);

		// Storage (global access only)
		const storageService = new NativeStorageService(undefined, { defaultProfile: userDataProfilesService.defaultProfile, currentProfile: userDataProfilesService.defaultProfile }, mainProcessService, environmentService);
		services.set(IStorageService, storageService);
		this._register(toDisposable(() => storageService.flush()));

		// Initialize config & storage in parallel
		await Promise.all([
			configurationService.initialize(),
			storageService.initialize()
		]);

		// URI Identity
		services.set(IUriIdentityService, new UriIdentityService(fileService));

		// Request
		services.set(IRequestService, new SharedProcessRequestService(mainProcessService, configurationService, logService));

		// Checksum
		services.set(IChecksumService, new SyncDescriptor(ChecksumService));

		// V8 Inspect profiler
		services.set(IV8InspectProfilingService, new SyncDescriptor(V8InspectProfilingService));

		// Native Host
		const nativeHostService = ProxyChannel.toService<INativeHostService>(mainProcessService.getChannel('nativeHost'), { context: this.configuration.windowId });
		services.set(INativeHostService, nativeHostService);

		// Download
		services.set(IDownloadService, new SyncDescriptor(DownloadService));

		// Extension recommendations
		const activeWindowManager = this._register(new ActiveWindowManager(nativeHostService));
		const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
		services.set(IExtensionRecommendationNotificationService, new ExtensionRecommendationNotificationServiceChannelClient(this.server.getChannel('extensionRecommendationNotification', activeWindowRouter)));

		// Telemetry
		let telemetryService: ITelemetryService;
		const appenders: ITelemetryAppender[] = [];
		const internalTelemetry = isInternalTelemetry(productService, configurationService);
		if (supportsTelemetry(productService, environmentService)) {
			const logAppender = new TelemetryLogAppender(loggerService, environmentService);
			appenders.push(logAppender);
			const { installSourcePath } = environmentService;
			if (productService.aiConfig?.ariaKey) {
				const collectorAppender = new OneDataSystemAppender(internalTelemetry, 'monacoworkbench', null, productService.aiConfig.ariaKey);
				this._register(toDisposable(() => collectorAppender.flush())); // Ensure the 1DS appender is disposed so that it flushes remaining data
				appenders.push(collectorAppender);
			}

			telemetryService = new TelemetryService({
				appenders,
				commonProperties: resolveCommonProperties(fileService, release(), hostname(), process.arch, productService.commit, productService.version, this.configuration.machineId, internalTelemetry, installSourcePath),
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
		const customEndpointTelemetryService = new CustomEndpointTelemetryService(configurationService, telemetryService, loggerService, environmentService, productService);
		services.set(ICustomEndpointTelemetryService, customEndpointTelemetryService);

		// Extension Management
		services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, undefined, true));
		services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, undefined, true));
		services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService, undefined, true));

		// Extension Gallery
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService, undefined, true));

		// Extension Tips
		services.set(IExtensionTipsService, new SyncDescriptor(ExtensionTipsService /* Eagerly scans and computes exe based recommendations */));

		// Localizations
		services.set(ILanguagePackService, new SyncDescriptor(NativeLanguagePackService));

		// Diagnostics
		services.set(IDiagnosticsService, new SyncDescriptor(DiagnosticsService));

		// Settings Sync
		services.set(IUserDataSyncAccountService, new SyncDescriptor(UserDataSyncAccountService, undefined, true));
		services.set(IUserDataSyncLogService, new SyncDescriptor(UserDataSyncLogService, undefined, true));
		services.set(IUserDataSyncUtilService, new UserDataSyncUtilServiceClient(this.server.getChannel('userDataSyncUtil', client => client.ctx !== 'main')));
		services.set(IGlobalExtensionEnablementService, new SyncDescriptor(GlobalExtensionEnablementService /* Eagerly resets installed extensions */));
		services.set(IIgnoredExtensionsManagementService, new SyncDescriptor(IgnoredExtensionsManagementService, undefined, true));
		services.set(IExtensionStorageService, new SyncDescriptor(ExtensionStorageService));
		services.set(IUserDataSyncStoreManagementService, new SyncDescriptor(UserDataSyncStoreManagementService, undefined, true));
		services.set(IUserDataSyncStoreService, new SyncDescriptor(UserDataSyncStoreService, undefined, true));
		services.set(IUserDataSyncMachinesService, new SyncDescriptor(UserDataSyncMachinesService, undefined, true));
		services.set(IUserDataSyncBackupStoreService, new SyncDescriptor(UserDataSyncBackupStoreService /* Eagerly cleans up old backups */));
		services.set(IUserDataSyncEnablementService, new SyncDescriptor(UserDataSyncEnablementService, undefined, true));
		services.set(IUserDataSyncService, new SyncDescriptor(UserDataSyncService /* Initializes the Sync State */));

		const ptyHostService = new PtyHostService({
			graceTime: LocalReconnectConstants.GraceTime,
			shortGraceTime: LocalReconnectConstants.ShortGraceTime,
			scrollback: configurationService.getValue<number>(TerminalSettingId.PersistentSessionScrollback) ?? 100
		},
			configurationService,
			environmentService,
			logService
		);
		ptyHostService.initialize();

		// Terminal
		services.set(ILocalPtyService, this._register(ptyHostService));

		// Signing
		services.set(ISignService, new SyncDescriptor(SignService));

		// Tunnel
		services.set(ISharedTunnelsService, new SyncDescriptor(SharedTunnelsService));
		services.set(ISharedProcessTunnelService, new SyncDescriptor(SharedProcessTunnelService));

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

		const userDataSyncChannel = new UserDataSyncChannel(accessor.get(IUserDataSyncService), accessor.get(ILogService));
		this.server.registerChannel('userDataSync', userDataSyncChannel);

		const userDataAutoSync = this._register(accessor.get(IInstantiationService).createInstance(UserDataAutoSyncService));
		const userDataAutoSyncChannel = new UserDataAutoSyncChannel(userDataAutoSync);
		this.server.registerChannel('userDataAutoSync', userDataAutoSyncChannel);

		// Terminal
		const localPtyService = accessor.get(ILocalPtyService);
		const localPtyChannel = ProxyChannel.fromService(localPtyService);
		this.server.registerChannel(TerminalIpcChannels.LocalPty, localPtyChannel);

		// Tunnel
		const sharedProcessTunnelChannel = ProxyChannel.fromService(accessor.get(ISharedProcessTunnelService));
		this.server.registerChannel(ipcSharedProcessTunnelChannelName, sharedProcessTunnelChannel);

		// Worker
		const sharedProcessWorkerChannel = ProxyChannel.fromService(accessor.get(ISharedProcessWorkerService));
		this.server.registerChannel(ipcSharedProcessWorkerChannelName, sharedProcessWorkerChannel);

	}

	private registerErrorHandler(logService: ILogService): void {

		// Listen on unhandled rejection events
		window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {

			// See https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
			onUnexpectedError(event.reason);

			// Prevent the printing of this event to the console
			event.preventDefault();
		});

		// Install handler for unexpected errors
		setUnexpectedErrorHandler(error => {
			const message = toErrorMessage(error, true);
			if (!message) {
				return;
			}

			logService.error(`[uncaught exception in sharedProcess]: ${message}`);
		});
	}
}

export async function main(configuration: ISharedProcessConfiguration): Promise<void> {

	// create shared process and signal back to main that we are
	// ready to accept message ports as client connections
	const sharedProcess = new SharedProcessMain(configuration);
	ipcRenderer.send('vscode:shared-process->electron-main=ipc-ready');

	// await initialization and signal this back to electron-main
	await sharedProcess.open();
	ipcRenderer.send('vscode:shared-process->electron-main=init-done');
}
