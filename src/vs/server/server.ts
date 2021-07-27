/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as net from 'net';
import { hostname, release } from 'os';
import * as path from 'path';
import { Emitter } from 'vs/base/common/event';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { getMachineId } from 'vs/base/node/id';
import { ClientConnectionEvent, IPCServer, IServerChannel, ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { main } from 'vs/code/node/cliProcessMain';
import { Query, VscodeInitializationOptions, WorkbenchOptions } from 'vs/base/common/ipc';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannel } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { LocalizationsService } from 'vs/platform/localizations/node/localizations';
import { ConsoleLogger, ConsoleMainLogger, getLogLevel, ILoggerService, ILogService, MultiplexLogService } from 'vs/platform/log/common/log';
import { LogLevelChannel } from 'vs/platform/log/common/logIpc';
import { LoggerService } from 'vs/platform/log/node/loggerService';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { ConnectionType, ConnectionTypeRequest } from 'vs/platform/remote/common/remoteAgentConnection';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestChannel } from 'vs/platform/request/common/requestIpc';
import { RequestService } from 'vs/platform/request/node/requestService';
import ErrorTelemetry from 'vs/platform/telemetry/node/errorTelemetry';
import { resolveCommonProperties } from 'vs/platform/telemetry/common/commonProperties';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryLogAppender } from 'vs/platform/telemetry/common/telemetryLogAppender';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { combinedAppender, NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { AppInsightsAppender } from 'vs/platform/telemetry/node/appInsightsAppender';
import { ExtensionEnvironmentChannel, FileProviderChannel, TerminalProviderChannel } from 'vs/server/channel';
import { Connection, ExtensionHostConnection, ManagementConnection } from 'vs/server/connection';
import { TelemetryClient } from 'vs/server/insights';
import { getLocaleFromConfig, getNlsConfiguration } from 'vs/server/nls';
import { Protocol } from 'vs/server/protocol';
import { REMOTE_TERMINAL_CHANNEL_NAME } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { REMOTE_FILE_SYSTEM_CHANNEL_NAME } from 'vs/workbench/services/remote/common/remoteAgentFileSystemChannel';
import { RemoteExtensionLogFileName } from 'vs/workbench/services/remote/common/remoteAgentService';
import { PtyHostService } from 'vs/platform/terminal/node/ptyHostService';
import { LogsDataCleaner } from 'vs/code/electron-browser/sharedProcess/contrib/logsDataCleaner';
import { createServerURITransformer } from 'vs/base/common/uriServer';

const commit = product.commit || 'development';
const logger = new ConsoleMainLogger();

/**
 * Handles client connections to a VSCode instance via IPC.
 */
export class VscodeServer {
	public readonly _onDidClientConnect = new Emitter<ClientConnectionEvent>();
	public readonly onDidClientConnect = this._onDidClientConnect.event;
	private readonly ipc = new IPCServer<RemoteAgentConnectionContext>(this.onDidClientConnect);

	private readonly maxExtraOfflineConnections = 0;
	private readonly connections = new Map<ConnectionType, Map<string, Connection>>();

	private readonly services = new ServiceCollection();
	private servicesPromise?: Promise<void>;

	public async cli(args: NativeParsedArgs): Promise<void> {
		return main(args);
	}

	public async initialize(options: VscodeInitializationOptions): Promise<WorkbenchOptions> {
		const transformer = createServerURITransformer(options.remoteAuthority);
		if (!this.servicesPromise) {
			this.servicesPromise = this.initializeServices(options.args);
		}
		await this.servicesPromise;
		const environment = this.services.get(IEnvironmentService) as INativeEnvironmentService;
		const startPath = options.startPath;
		const parseUrl = (url: string): URI => {
			// This might be a fully-specified URL or just a path.
			try {
				return URI.parse(url, true);
			} catch (error) {
				return URI.from({
					scheme: Schemas.vscodeRemote,
					authority: options.remoteAuthority,
					path: url,
				});
			}
		};
		return {
			workbenchWebConfiguration: {
				workspaceUri: startPath && startPath.workspace ? parseUrl(startPath.url) : undefined,
				folderUri: startPath && !startPath.workspace ? parseUrl(startPath.url) : undefined,
				remoteAuthority: options.remoteAuthority,
				logLevel: getLogLevel(environment),
				workspaceProvider: {
					payload: [
						['userDataPath', environment.userDataPath],
						['enableProposedApi', JSON.stringify(options.args['enable-proposed-api'] || [])]
					],
				},
			},
			remoteUserDataUri: transformer.transformOutgoing(URI.file(environment.userDataPath)),
			productConfiguration: product,
			nlsConfiguration: await getNlsConfiguration(environment.args.locale || await getLocaleFromConfig(environment.userDataPath), environment.userDataPath),
			commit,
		};
	}

	public async handleWebSocket(socket: net.Socket, query: Query, permessageDeflate: boolean): Promise<true> {
		if (!query.reconnectionToken) {
			throw new Error('Reconnection token is missing from query parameters');
		}
		const protocol = new Protocol(socket, {
			reconnectionToken: <string>query.reconnectionToken,
			reconnection: query.reconnection === 'true',
			skipWebSocketFrames: query.skipWebSocketFrames === 'true',
			permessageDeflate,
		});
		try {
			await this.connect(await protocol.handshake(), protocol);
		} catch (error) {
			protocol.destroy(error.message);
		}
		return true;
	}

	private async connect(message: ConnectionTypeRequest, protocol: Protocol): Promise<void> {
		if (product.commit && message.commit !== product.commit) {
			logger.warn(`Version mismatch (${message.commit} instead of ${product.commit})`);
		}

		switch (message.desiredConnectionType) {
			case ConnectionType.ExtensionHost:
			case ConnectionType.Management:
				// Initialize connection map for this type of connection.
				if (!this.connections.has(message.desiredConnectionType)) {
					this.connections.set(message.desiredConnectionType, new Map());
				}
				const connections = this.connections.get(message.desiredConnectionType)!;

				const token = protocol.options.reconnectionToken;
				let connection = connections.get(token);
				if (protocol.options.reconnection && connection) {
					return connection.reconnect(protocol);
				}

				// This probably means the process restarted so the session was lost
				// while the browser remained open.
				if (protocol.options.reconnection) {
					throw new Error(`Unable to reconnect; session no longer exists (${token})`);
				}

				// This will probably never happen outside a chance collision.
				if (connection) {
					throw new Error('Unable to connect; token is already in use');
				}

				// Now that the initial exchange has completed we can create the actual
				// connection on top of the protocol then send it to whatever uses it.
				if (message.desiredConnectionType === ConnectionType.Management) {
					// The management connection is used by firing onDidClientConnect
					// which makes the IPC server become aware of the connection.
					connection = new ManagementConnection(protocol);
					this._onDidClientConnect.fire({
						protocol,
						onDidClientDisconnect: connection.onClose,
					});
				} else {
					// The extension host connection is used by spawning an extension host
					// and passing the socket into it.
					connection = new ExtensionHostConnection(
						protocol,
						{
							language: 'en',
							...message.args,
						},
						this.services.get(IEnvironmentService) as INativeEnvironmentService,
					);
				}
				connections.set(token, connection);
				connection.onClose(() => connections.delete(token));

				this.disposeOldOfflineConnections(connections);
				logger.debug(`${connections.size} active ${connection.name} connection(s)`);
				break;
			case ConnectionType.Tunnel:
				return protocol.tunnel();
			default:
				throw new Error(`Unrecognized connection type ${message.desiredConnectionType}`);
		}
	}

	private disposeOldOfflineConnections(connections: Map<string, Connection>): void {
		const offline = Array.from(connections.values())
			.filter((connection) => typeof connection.offline !== 'undefined');
		for (let i = 0, max = offline.length - this.maxExtraOfflineConnections; i < max; ++i) {
			offline[i].dispose('old');
		}
	}

	// References:
	// ../../electron-browser/sharedProcess/sharedProcessMain.ts#L148
	// ../../../code/electron-main/app.ts
	private async initializeServices(args: NativeParsedArgs): Promise<void> {
		const productService = { _serviceBrand: undefined, ...product };
		const environmentService = new NativeEnvironmentService(args, productService);

		await Promise.all([
			environmentService.extensionsPath,
			environmentService.logsPath,
			environmentService.globalStorageHome.fsPath,
			environmentService.workspaceStorageHome.fsPath,
			...environmentService.extraExtensionPaths,
			...environmentService.extraBuiltinExtensionPaths,
		].map((p) => fs.mkdir(p, { recursive: true }).catch((error) => {
			logger.warn(error.message || error);
		})));

		const logService = new MultiplexLogService([
			new ConsoleLogger(getLogLevel(environmentService)),
			new SpdLogLogger(RemoteExtensionLogFileName, path.join(environmentService.logsPath, `${RemoteExtensionLogFileName}.log`), false, getLogLevel(environmentService))
		]);
		const fileService = new FileService(logService);
		fileService.registerProvider(Schemas.file, new DiskFileSystemProvider(logService));

		const loggerService = new LoggerService(logService, fileService);

		const piiPaths = [
			path.join(environmentService.userDataPath, 'clp'), // Language packs.
			environmentService.appRoot,
			environmentService.extensionsPath,
			environmentService.builtinExtensionsPath,
			...environmentService.extraExtensionPaths,
			...environmentService.extraBuiltinExtensionPaths,
		];

		this.ipc.registerChannel('logger', new LogLevelChannel(logService));
		this.ipc.registerChannel(ExtensionHostDebugBroadcastChannel.ChannelName, new ExtensionHostDebugBroadcastChannel());

		this.services.set(ILogService, logService);
		this.services.set(IEnvironmentService, environmentService);
		this.services.set(INativeEnvironmentService, environmentService);
		this.services.set(ILoggerService, loggerService);

		const configurationService = new ConfigurationService(environmentService.settingsResource, fileService);
		await configurationService.initialize();
		this.services.set(IConfigurationService, configurationService);

		this.services.set(IRequestService, new SyncDescriptor(RequestService));
		this.services.set(IFileService, fileService);
		this.services.set(IProductService, productService);

		const machineId = await getMachineId();

		await new Promise((resolve) => {
			const instantiationService = new InstantiationService(this.services);

			instantiationService.invokeFunction((accessor) => {
				instantiationService.createInstance(LogsDataCleaner);

				let telemetryService: ITelemetryService;

				if (!environmentService.isExtensionDevelopment && !environmentService.disableTelemetry && !!productService.enableTelemetry) {
					telemetryService = new TelemetryService({
						appender: combinedAppender(
							new AppInsightsAppender('code-server', null, () => new TelemetryClient() as any),
							new TelemetryLogAppender(accessor.get(ILoggerService), environmentService)
						),
						sendErrorTelemetry: true,
						commonProperties: resolveCommonProperties(
							fileService, release(), hostname(), process.arch, commit, product.version, machineId,
							undefined, environmentService.installSourcePath, 'code-server',
						),
						piiPaths,
					}, configurationService);
				} else {
					telemetryService = NullTelemetryService;
				}

				this.services.set(ITelemetryService, telemetryService);

				this.services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
				this.services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));
				this.services.set(ILocalizationsService, new SyncDescriptor(LocalizationsService));

				this.ipc.registerChannel('extensions', new ExtensionManagementChannel(
					accessor.get(IExtensionManagementService),
					(context) => createServerURITransformer(context.remoteAuthority),
				));
				this.ipc.registerChannel('remoteextensionsenvironment', new ExtensionEnvironmentChannel(
					environmentService, logService, telemetryService, '',
				));
				this.ipc.registerChannel('request', new RequestChannel(accessor.get(IRequestService)));
				this.ipc.registerChannel('localizations', <IServerChannel<any>>ProxyChannel.fromService(accessor.get(ILocalizationsService)));
				this.ipc.registerChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME, new FileProviderChannel(environmentService, logService));

				const ptyHostService = new PtyHostService({ GraceTime: 60000, ShortGraceTime: 6000 }, configurationService, logService, telemetryService);
				this.ipc.registerChannel(REMOTE_TERMINAL_CHANNEL_NAME, new TerminalProviderChannel(logService, ptyHostService));

				resolve(new ErrorTelemetry(telemetryService));
			});
		});
	}
}
