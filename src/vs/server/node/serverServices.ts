/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname, release } from 'os';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { getMachineId, getSqmMachineId, getdevDeviceId } from 'vs/base/node/id';
import { Promises } from 'vs/base/node/pfs';
import { ClientConnectionEvent, IMessagePassingProtocol, IPCServer, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { ProtocolConstants } from 'vs/base/parts/ipc/common/ipc.net';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadServiceChannelClient } from 'vs/platform/download/common/downloadIpc';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionGalleryServiceWithNoStorageService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionSignatureVerificationService, IExtensionSignatureVerificationService } from 'vs/platform/extensionManagement/node/extensionSignatureVerificationService';
import { ExtensionManagementCLI } from 'vs/platform/extensionManagement/common/extensionManagementCLI';
import { ExtensionManagementChannel } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { ExtensionManagementService, INativeServerExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { NativeLanguagePackService } from 'vs/platform/languagePacks/node/languagePacks';
import { AbstractLogger, DEFAULT_LOG_LEVEL, getLogLevel, ILoggerService, ILogService, log, LogLevel, LogLevelToString } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestChannel } from 'vs/platform/request/common/requestIpc';
import { RequestService } from 'vs/platform/request/node/requestService';
import { resolveCommonProperties } from 'vs/platform/telemetry/common/commonProperties';
import { ITelemetryService, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { getPiiPathsFromEnvironment, isInternalTelemetry, isLoggingOnly, ITelemetryAppender, NullAppender, supportsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import ErrorTelemetry from 'vs/platform/telemetry/node/errorTelemetry';
import { IPtyService, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { PtyHostService } from 'vs/platform/terminal/node/ptyHostService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { RemoteAgentEnvironmentChannel } from 'vs/server/node/remoteAgentEnvironmentImpl';
import { RemoteAgentFileSystemProviderChannel } from 'vs/server/node/remoteFileSystemProviderServer';
import { ServerTelemetryChannel } from 'vs/platform/telemetry/common/remoteTelemetryChannel';
import { IServerTelemetryService, ServerNullTelemetryService, ServerTelemetryService } from 'vs/platform/telemetry/common/serverTelemetryService';
import { RemoteTerminalChannel } from 'vs/server/node/remoteTerminalChannel';
import { createURITransformer } from 'vs/workbench/api/node/uriTransformer';
import { ServerConnectionToken } from 'vs/server/node/serverConnectionToken';
import { ServerEnvironmentService, ServerParsedArgs } from 'vs/server/node/serverEnvironmentService';
import { REMOTE_TERMINAL_CHANNEL_NAME } from 'vs/workbench/contrib/terminal/common/remote/remoteTerminalChannel';
import { REMOTE_FILE_SYSTEM_CHANNEL_NAME } from 'vs/workbench/services/remote/common/remoteFileSystemProviderClient';
import { ExtensionHostStatusService, IExtensionHostStatusService } from 'vs/server/node/extensionHostStatusService';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionsScannerService } from 'vs/server/node/extensionsScannerService';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { NullPolicyService } from 'vs/platform/policy/common/policy';
import { OneDataSystemAppender } from 'vs/platform/telemetry/node/1dsAppender';
import { LoggerService } from 'vs/platform/log/node/loggerService';
import { ServerUserDataProfilesService } from 'vs/platform/userDataProfile/node/userDataProfile';
import { ExtensionsProfileScannerService } from 'vs/platform/extensionManagement/node/extensionsProfileScannerService';
import { LogService } from 'vs/platform/log/common/logService';
import { LoggerChannel } from 'vs/platform/log/common/logIpc';
import { localize } from 'vs/nls';
import { RemoteExtensionsScannerChannel, RemoteExtensionsScannerService } from 'vs/server/node/remoteExtensionsScanner';
import { RemoteExtensionsScannerChannelName } from 'vs/platform/remote/common/remoteExtensionsScanner';
import { RemoteUserDataProfilesServiceChannel } from 'vs/platform/userDataProfile/common/userDataProfileIpc';
import { NodePtyHostStarter } from 'vs/platform/terminal/node/nodePtyHostStarter';
import { CSSDevelopmentService, ICSSDevelopmentService } from 'vs/platform/cssDev/node/cssDevService';

const eventPrefix = 'monacoworkbench';

export async function setupServerServices(connectionToken: ServerConnectionToken, args: ServerParsedArgs, REMOTE_DATA_FOLDER: string, disposables: DisposableStore) {
	const services = new ServiceCollection();
	const socketServer = new SocketServer<RemoteAgentConnectionContext>();

	const productService: IProductService = { _serviceBrand: undefined, ...product };
	services.set(IProductService, productService);

	const environmentService = new ServerEnvironmentService(args, productService);
	services.set(IEnvironmentService, environmentService);
	services.set(INativeEnvironmentService, environmentService);

	const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
	services.set(ILoggerService, loggerService);
	socketServer.registerChannel('logger', new LoggerChannel(loggerService, (ctx: RemoteAgentConnectionContext) => getUriTransformer(ctx.remoteAuthority)));

	const logger = loggerService.createLogger('remoteagent', { name: localize('remoteExtensionLog', "Server") });
	const logService = new LogService(logger, [new ServerLogger(getLogLevel(environmentService))]);
	services.set(ILogService, logService);
	setTimeout(() => cleanupOlderLogs(environmentService.logsHome.with({ scheme: Schemas.file }).fsPath).then(null, err => logService.error(err)), 10000);
	logService.onDidChangeLogLevel(logLevel => log(logService, logLevel, `Log level changed to ${LogLevelToString(logService.getLevel())}`));

	logService.trace(`Remote configuration data at ${REMOTE_DATA_FOLDER}`);
	logService.trace('process arguments:', environmentService.args);
	if (Array.isArray(productService.serverGreeting)) {
		logService.info(`\n\n${productService.serverGreeting.join('\n')}\n\n`);
	}

	// ExtensionHost Debug broadcast service
	socketServer.registerChannel(ExtensionHostDebugBroadcastChannel.ChannelName, new ExtensionHostDebugBroadcastChannel());

	// TODO: @Sandy @Joao need dynamic context based router
	const router = new StaticRouter<RemoteAgentConnectionContext>(ctx => ctx.clientId === 'renderer');

	// Files
	const fileService = disposables.add(new FileService(logService));
	services.set(IFileService, fileService);
	fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService)));

	// URI Identity
	const uriIdentityService = new UriIdentityService(fileService);
	services.set(IUriIdentityService, uriIdentityService);

	// Configuration
	const configurationService = new ConfigurationService(environmentService.machineSettingsResource, fileService, new NullPolicyService(), logService);
	services.set(IConfigurationService, configurationService);

	// User Data Profiles
	const userDataProfilesService = new ServerUserDataProfilesService(uriIdentityService, environmentService, fileService, logService);
	services.set(IUserDataProfilesService, userDataProfilesService);
	socketServer.registerChannel('userDataProfiles', new RemoteUserDataProfilesServiceChannel(userDataProfilesService, (ctx: RemoteAgentConnectionContext) => getUriTransformer(ctx.remoteAuthority)));

	// Dev Only: CSS service (for ESM)
	services.set(ICSSDevelopmentService, new SyncDescriptor(CSSDevelopmentService, undefined, true));

	// Initialize
	const [, , machineId, sqmId, devDeviceId] = await Promise.all([
		configurationService.initialize(),
		userDataProfilesService.init(),
		getMachineId(logService.error.bind(logService)),
		getSqmMachineId(logService.error.bind(logService)),
		getdevDeviceId(logService.error.bind(logService))
	]);

	const extensionHostStatusService = new ExtensionHostStatusService();
	services.set(IExtensionHostStatusService, extensionHostStatusService);

	// Request
	const requestService = new RequestService(configurationService, environmentService, logService, loggerService);
	services.set(IRequestService, requestService);

	let oneDsAppender: ITelemetryAppender = NullAppender;
	const isInternal = isInternalTelemetry(productService, configurationService);
	if (supportsTelemetry(productService, environmentService)) {
		if (!isLoggingOnly(productService, environmentService) && productService.aiConfig?.ariaKey) {
			oneDsAppender = new OneDataSystemAppender(requestService, isInternal, eventPrefix, null, productService.aiConfig.ariaKey);
			disposables.add(toDisposable(() => oneDsAppender?.flush())); // Ensure the AI appender is disposed so that it flushes remaining data
		}

		const config: ITelemetryServiceConfig = {
			appenders: [oneDsAppender],
			commonProperties: resolveCommonProperties(release(), hostname(), process.arch, productService.commit, productService.version + '-remote', machineId, sqmId, devDeviceId, isInternal, 'remoteAgent'),
			piiPaths: getPiiPathsFromEnvironment(environmentService)
		};
		const initialTelemetryLevelArg = environmentService.args['telemetry-level'];
		let injectedTelemetryLevel: TelemetryLevel = TelemetryLevel.USAGE;
		// Convert the passed in CLI argument into a telemetry level for the telemetry service
		if (initialTelemetryLevelArg === 'all') {
			injectedTelemetryLevel = TelemetryLevel.USAGE;
		} else if (initialTelemetryLevelArg === 'error') {
			injectedTelemetryLevel = TelemetryLevel.ERROR;
		} else if (initialTelemetryLevelArg === 'crash') {
			injectedTelemetryLevel = TelemetryLevel.CRASH;
		} else if (initialTelemetryLevelArg !== undefined) {
			injectedTelemetryLevel = TelemetryLevel.NONE;
		}
		services.set(IServerTelemetryService, new SyncDescriptor(ServerTelemetryService, [config, injectedTelemetryLevel]));
	} else {
		services.set(IServerTelemetryService, ServerNullTelemetryService);
	}

	services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryServiceWithNoStorageService));

	const downloadChannel = socketServer.getChannel('download', router);
	services.set(IDownloadService, new DownloadServiceChannelClient(downloadChannel, () => getUriTransformer('renderer') /* TODO: @Sandy @Joao need dynamic context based router */));

	services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService));
	services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService));
	services.set(IExtensionSignatureVerificationService, new SyncDescriptor(ExtensionSignatureVerificationService));
	services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService));

	const instantiationService: IInstantiationService = new InstantiationService(services);
	services.set(ILanguagePackService, instantiationService.createInstance(NativeLanguagePackService));

	const ptyHostStarter = instantiationService.createInstance(
		NodePtyHostStarter,
		{
			graceTime: ProtocolConstants.ReconnectionGraceTime,
			shortGraceTime: ProtocolConstants.ReconnectionShortGraceTime,
			scrollback: configurationService.getValue<number>(TerminalSettingId.PersistentSessionScrollback) ?? 100
		}
	);
	const ptyHostService = instantiationService.createInstance(PtyHostService, ptyHostStarter);
	services.set(IPtyService, ptyHostService);

	instantiationService.invokeFunction(accessor => {
		const extensionManagementService = accessor.get(INativeServerExtensionManagementService);
		const extensionsScannerService = accessor.get(IExtensionsScannerService);
		const extensionGalleryService = accessor.get(IExtensionGalleryService);
		const languagePackService = accessor.get(ILanguagePackService);
		const remoteExtensionEnvironmentChannel = new RemoteAgentEnvironmentChannel(connectionToken, environmentService, userDataProfilesService, extensionHostStatusService);
		socketServer.registerChannel('remoteextensionsenvironment', remoteExtensionEnvironmentChannel);

		const telemetryChannel = new ServerTelemetryChannel(accessor.get(IServerTelemetryService), oneDsAppender);
		socketServer.registerChannel('telemetry', telemetryChannel);

		socketServer.registerChannel(REMOTE_TERMINAL_CHANNEL_NAME, new RemoteTerminalChannel(environmentService, logService, ptyHostService, productService, extensionManagementService, configurationService));

		const remoteExtensionsScanner = new RemoteExtensionsScannerService(instantiationService.createInstance(ExtensionManagementCLI, logService), environmentService, userDataProfilesService, extensionsScannerService, logService, extensionGalleryService, languagePackService);
		socketServer.registerChannel(RemoteExtensionsScannerChannelName, new RemoteExtensionsScannerChannel(remoteExtensionsScanner, (ctx: RemoteAgentConnectionContext) => getUriTransformer(ctx.remoteAuthority)));

		const remoteFileSystemChannel = disposables.add(new RemoteAgentFileSystemProviderChannel(logService, environmentService));
		socketServer.registerChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME, remoteFileSystemChannel);

		socketServer.registerChannel('request', new RequestChannel(accessor.get(IRequestService)));

		const channel = new ExtensionManagementChannel(extensionManagementService, (ctx: RemoteAgentConnectionContext) => getUriTransformer(ctx.remoteAuthority));
		socketServer.registerChannel('extensions', channel);

		// clean up extensions folder
		remoteExtensionsScanner.whenExtensionsReady().then(() => extensionManagementService.cleanUp());

		disposables.add(new ErrorTelemetry(accessor.get(ITelemetryService)));

		return {
			telemetryService: accessor.get(ITelemetryService)
		};
	});

	return { socketServer, instantiationService };
}

const _uriTransformerCache: { [remoteAuthority: string]: IURITransformer } = Object.create(null);

function getUriTransformer(remoteAuthority: string): IURITransformer {
	if (!_uriTransformerCache[remoteAuthority]) {
		_uriTransformerCache[remoteAuthority] = createURITransformer(remoteAuthority);
	}
	return _uriTransformerCache[remoteAuthority];
}

export class SocketServer<TContext = string> extends IPCServer<TContext> {

	private _onDidConnectEmitter: Emitter<ClientConnectionEvent>;

	constructor() {
		const emitter = new Emitter<ClientConnectionEvent>();
		super(emitter.event);
		this._onDidConnectEmitter = emitter;
	}

	public acceptConnection(protocol: IMessagePassingProtocol, onDidClientDisconnect: Event<void>): void {
		this._onDidConnectEmitter.fire({ protocol, onDidClientDisconnect });
	}
}

class ServerLogger extends AbstractLogger {
	private useColors: boolean;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
		this.useColors = Boolean(process.stdout.isTTY);
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			if (this.useColors) {
				console.log(`\x1b[90m[${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[${now()}]`, message, ...args);
			}
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			if (this.useColors) {
				console.log(`\x1b[90m[${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[${now()}]`, message, ...args);
			}
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			if (this.useColors) {
				console.log(`\x1b[90m[${now()}]\x1b[0m`, message, ...args);
			} else {
				console.log(`[${now()}]`, message, ...args);
			}
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			if (this.useColors) {
				console.warn(`\x1b[93m[${now()}]\x1b[0m`, message, ...args);
			} else {
				console.warn(`[${now()}]`, message, ...args);
			}
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			if (this.useColors) {
				console.error(`\x1b[91m[${now()}]\x1b[0m`, message, ...args);
			} else {
				console.error(`[${now()}]`, message, ...args);
			}
		}
	}

	flush(): void {
		// noop
	}
}

function now(): string {
	const date = new Date();
	return `${twodigits(date.getHours())}:${twodigits(date.getMinutes())}:${twodigits(date.getSeconds())}`;
}

function twodigits(n: number): string {
	if (n < 10) {
		return `0${n}`;
	}
	return String(n);
}

/**
 * Cleans up older logs, while keeping the 10 most recent ones.
 */
async function cleanupOlderLogs(logsPath: string): Promise<void> {
	const currentLog = path.basename(logsPath);
	const logsRoot = path.dirname(logsPath);
	const children = await Promises.readdir(logsRoot);
	const allSessions = children.filter(name => /^\d{8}T\d{6}$/.test(name));
	const oldSessions = allSessions.sort().filter((d) => d !== currentLog);
	const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));

	await Promise.all(toDelete.map(name => Promises.rm(path.join(logsRoot, name))));
}
