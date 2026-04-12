/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { hostname, release } from 'os';
import { Emitter } from '../../base/common/event.js';
import { toDisposable } from '../../base/common/lifecycle.js';
import { Schemas } from '../../base/common/network.js';
import * as path from '../../base/common/path.js';
import { getMachineId, getSqmMachineId, getDevDeviceId } from '../../base/node/id.js';
import { Promises } from '../../base/node/pfs.js';
import { IPCServer, StaticRouter } from '../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ConfigurationService } from '../../platform/configuration/common/configurationService.js';
import { ExtensionHostDebugBroadcastChannel } from '../../platform/debug/common/extensionHostDebugIpc.js';
import { IDownloadService } from '../../platform/download/common/download.js';
import { DownloadServiceChannelClient } from '../../platform/download/common/downloadIpc.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../platform/environment/common/environment.js';
import { ExtensionGalleryServiceWithNoStorageService } from '../../platform/extensionManagement/common/extensionGalleryService.js';
import { IAllowedExtensionsService, IExtensionGalleryService } from '../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionSignatureVerificationService, IExtensionSignatureVerificationService } from '../../platform/extensionManagement/node/extensionSignatureVerificationService.js';
import { ExtensionManagementCLI } from '../../platform/extensionManagement/common/extensionManagementCLI.js';
import { ExtensionManagementChannel } from '../../platform/extensionManagement/common/extensionManagementIpc.js';
import { ExtensionManagementService, INativeServerExtensionManagementService } from '../../platform/extensionManagement/node/extensionManagementService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILanguagePackService } from '../../platform/languagePacks/common/languagePacks.js';
import { NativeLanguagePackService } from '../../platform/languagePacks/node/languagePacks.js';
import { AbstractLogger, DEFAULT_LOG_LEVEL, getLogLevel, ILoggerService, ILogService, log, LogLevel, LogLevelToString } from '../../platform/log/common/log.js';
import product from '../../platform/product/common/product.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IRequestService } from '../../platform/request/common/request.js';
import { RequestChannel } from '../../platform/request/common/requestIpc.js';
import { RequestService } from '../../platform/request/node/requestService.js';
import { resolveCommonProperties } from '../../platform/telemetry/common/commonProperties.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { getPiiPathsFromEnvironment, isInternalTelemetry, isLoggingOnly, NullAppender, supportsTelemetry } from '../../platform/telemetry/common/telemetryUtils.js';
import ErrorTelemetry from '../../platform/telemetry/node/errorTelemetry.js';
import { IPtyService } from '../../platform/terminal/common/terminal.js';
import { PtyHostService } from '../../platform/terminal/node/ptyHostService.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService.js';
import { RemoteAgentEnvironmentChannel } from './remoteAgentEnvironmentImpl.js';
import { RemoteAgentFileSystemProviderChannel } from './remoteFileSystemProviderServer.js';
import { ServerTelemetryChannel } from '../../platform/telemetry/common/remoteTelemetryChannel.js';
import { IServerTelemetryService, ServerNullTelemetryService, ServerTelemetryService } from '../../platform/telemetry/common/serverTelemetryService.js';
import { RemoteTerminalChannel } from './remoteTerminalChannel.js';
import { createURITransformer } from '../../base/common/uriTransformer.js';
import { ServerEnvironmentService } from './serverEnvironmentService.js';
import { REMOTE_TERMINAL_CHANNEL_NAME } from '../../workbench/contrib/terminal/common/remote/remoteTerminalChannel.js';
import { REMOTE_FILE_SYSTEM_CHANNEL_NAME } from '../../workbench/services/remote/common/remoteFileSystemProviderClient.js';
import { ExtensionHostStatusService, IExtensionHostStatusService } from './extensionHostStatusService.js';
import { IExtensionsScannerService } from '../../platform/extensionManagement/common/extensionsScannerService.js';
import { ExtensionsScannerService } from './extensionsScannerService.js';
import { IExtensionsProfileScannerService } from '../../platform/extensionManagement/common/extensionsProfileScannerService.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { NullPolicyService } from '../../platform/policy/common/policy.js';
import { OneDataSystemAppender } from '../../platform/telemetry/node/1dsAppender.js';
import { LoggerService } from '../../platform/log/node/loggerService.js';
import { ServerUserDataProfilesService } from '../../platform/userDataProfile/node/userDataProfile.js';
import { ExtensionsProfileScannerService } from '../../platform/extensionManagement/node/extensionsProfileScannerService.js';
import { LogService } from '../../platform/log/common/logService.js';
import { LoggerChannel } from '../../platform/log/common/logIpc.js';
import { localize } from '../../nls.js';
import { RemoteExtensionsScannerChannel, RemoteExtensionsScannerService } from './remoteExtensionsScanner.js';
import { RemoteExtensionsScannerChannelName } from '../../platform/remote/common/remoteExtensionsScanner.js';
import { RemoteUserDataProfilesServiceChannel } from '../../platform/userDataProfile/common/userDataProfileIpc.js';
import { NodePtyHostStarter } from '../../platform/terminal/node/nodePtyHostStarter.js';
import { NodeAgentHostStarter } from '../../platform/agentHost/node/nodeAgentHostStarter.js';
import { ServerAgentHostManager } from './serverAgentHostManager.js';
import { IServerLifetimeService, ServerLifetimeService } from './serverLifetimeService.js';
import { CSSDevelopmentService, ICSSDevelopmentService } from '../../platform/cssDev/node/cssDevService.js';
import { AllowedExtensionsService } from '../../platform/extensionManagement/common/allowedExtensionsService.js';
import { TelemetryLogAppender } from '../../platform/telemetry/common/telemetryLogAppender.js';
import { INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from '../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { NativeMcpDiscoveryHelperChannel } from '../../platform/mcp/node/nativeMcpDiscoveryHelperChannel.js';
import { NativeMcpDiscoveryHelperService } from '../../platform/mcp/node/nativeMcpDiscoveryHelperService.js';
import { IMcpGatewayService, McpGatewayChannelName } from '../../platform/mcp/common/mcpGateway.js';
import { McpGatewayService } from '../../platform/mcp/node/mcpGatewayService.js';
import { McpGatewayChannel } from '../../platform/mcp/node/mcpGatewayChannel.js';
import { IExtensionGalleryManifestService } from '../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionGalleryManifestIPCService } from '../../platform/extensionManagement/common/extensionGalleryManifestServiceIpc.js';
import { IAllowedMcpServersService, IMcpGalleryService, IMcpManagementService } from '../../platform/mcp/common/mcpManagement.js';
import { McpManagementService } from '../../platform/mcp/node/mcpManagementService.js';
import { McpGalleryService } from '../../platform/mcp/common/mcpGalleryService.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../platform/mcp/common/mcpResourceScannerService.js';
import { McpManagementChannel } from '../../platform/mcp/common/mcpManagementIpc.js';
import { AllowedMcpServersService } from '../../platform/mcp/common/allowedMcpServersService.js';
import { IMcpGalleryManifestService } from '../../platform/mcp/common/mcpGalleryManifest.js';
import { McpGalleryManifestIPCService } from '../../platform/mcp/common/mcpGalleryManifestServiceIpc.js';
import { SANDBOX_HELPER_CHANNEL_NAME, SandboxHelperChannel } from '../../platform/sandbox/common/sandboxHelperIpc.js';
import { SandboxHelperService } from '../../platform/sandbox/node/sandboxHelper.js';
const eventPrefix = 'monacoworkbench';
export async function setupServerServices(connectionToken, args, REMOTE_DATA_FOLDER, disposables) {
    const services = new ServiceCollection();
    const socketServer = new SocketServer();
    const productService = { _serviceBrand: undefined, ...product };
    services.set(IProductService, productService);
    const environmentService = new ServerEnvironmentService(args, productService);
    services.set(IEnvironmentService, environmentService);
    services.set(INativeEnvironmentService, environmentService);
    const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
    services.set(ILoggerService, loggerService);
    socketServer.registerChannel('logger', new LoggerChannel(loggerService, (ctx) => getUriTransformer(ctx.remoteAuthority)));
    const logger = loggerService.createLogger('remoteagent', { name: localize('remoteExtensionLog', "Server") });
    const logService = disposables.add(new LogService(logger, [new ServerLogger(getLogLevel(environmentService))]));
    services.set(ILogService, logService);
    setTimeout(() => cleanupOlderLogs(environmentService.logsHome.with({ scheme: Schemas.file }).fsPath).then(null, err => logService.error(err)), 10000);
    disposables.add(logService.onDidChangeLogLevel(logLevel => log(logService, logLevel, `Log level changed to ${LogLevelToString(logService.getLevel())}`)));
    logService.trace(`Remote configuration data at ${REMOTE_DATA_FOLDER}`);
    logService.trace('process arguments:', environmentService.args);
    if (Array.isArray(productService.serverGreeting)) {
        logService.info(`\n\n${productService.serverGreeting.join('\n')}\n\n`);
    }
    // ExtensionHost Debug broadcast service
    socketServer.registerChannel(ExtensionHostDebugBroadcastChannel.ChannelName, new ExtensionHostDebugBroadcastChannel());
    // TODO: @Sandy @Joao need dynamic context based router
    const router = new StaticRouter(ctx => ctx.clientId === 'renderer');
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
    socketServer.registerChannel('userDataProfiles', new RemoteUserDataProfilesServiceChannel(userDataProfilesService, (ctx) => getUriTransformer(ctx.remoteAuthority)));
    // Dev Only: CSS service (for ESM)
    services.set(ICSSDevelopmentService, new SyncDescriptor(CSSDevelopmentService, undefined, true));
    // Initialize
    const [, , machineId, sqmId, devDeviceId] = await Promise.all([
        configurationService.initialize(),
        userDataProfilesService.init(),
        getMachineId(logService.error.bind(logService)),
        getSqmMachineId(logService.error.bind(logService)),
        getDevDeviceId(logService.error.bind(logService))
    ]);
    const extensionHostStatusService = new ExtensionHostStatusService();
    services.set(IExtensionHostStatusService, extensionHostStatusService);
    // Request
    const requestService = new RequestService('remote', configurationService, environmentService, logService);
    services.set(IRequestService, requestService);
    let oneDsAppender = NullAppender;
    const isInternal = isInternalTelemetry(productService, configurationService);
    if (supportsTelemetry(productService, environmentService)) {
        if (!isLoggingOnly(productService, environmentService) && productService.aiConfig?.ariaKey) {
            oneDsAppender = new OneDataSystemAppender(requestService, isInternal, eventPrefix, null, productService.aiConfig.ariaKey);
            disposables.add(toDisposable(() => oneDsAppender?.flush())); // Ensure the AI appender is disposed so that it flushes remaining data
        }
        const config = {
            appenders: [oneDsAppender, new TelemetryLogAppender('', true, loggerService, environmentService, productService)],
            commonProperties: resolveCommonProperties(release(), hostname(), process.arch, productService.commit, productService.version + '-remote', machineId, sqmId, devDeviceId, isInternal, productService.date, 'remoteAgent'),
            piiPaths: getPiiPathsFromEnvironment(environmentService)
        };
        const initialTelemetryLevelArg = environmentService.args['telemetry-level'];
        let injectedTelemetryLevel = 3 /* TelemetryLevel.USAGE */;
        // Convert the passed in CLI argument into a telemetry level for the telemetry service
        if (initialTelemetryLevelArg === 'all') {
            injectedTelemetryLevel = 3 /* TelemetryLevel.USAGE */;
        }
        else if (initialTelemetryLevelArg === 'error') {
            injectedTelemetryLevel = 2 /* TelemetryLevel.ERROR */;
        }
        else if (initialTelemetryLevelArg === 'crash') {
            injectedTelemetryLevel = 1 /* TelemetryLevel.CRASH */;
        }
        else if (initialTelemetryLevelArg !== undefined) {
            injectedTelemetryLevel = 0 /* TelemetryLevel.NONE */;
        }
        services.set(IServerTelemetryService, new SyncDescriptor(ServerTelemetryService, [config, injectedTelemetryLevel]));
    }
    else {
        services.set(IServerTelemetryService, ServerNullTelemetryService);
    }
    services.set(IExtensionGalleryManifestService, new ExtensionGalleryManifestIPCService(socketServer, productService));
    services.set(IMcpGalleryManifestService, new McpGalleryManifestIPCService(socketServer));
    services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryServiceWithNoStorageService));
    const downloadChannel = socketServer.getChannel('download', router);
    services.set(IDownloadService, new DownloadServiceChannelClient(downloadChannel, () => getUriTransformer('renderer') /* TODO: @Sandy @Joao need dynamic context based router */));
    services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService));
    services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService));
    services.set(IExtensionSignatureVerificationService, new SyncDescriptor(ExtensionSignatureVerificationService));
    services.set(IAllowedExtensionsService, new SyncDescriptor(AllowedExtensionsService));
    services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
    services.set(INativeMcpDiscoveryHelperService, new SyncDescriptor(NativeMcpDiscoveryHelperService));
    services.set(IMcpGatewayService, new SyncDescriptor(McpGatewayService));
    const instantiationService = new InstantiationService(services);
    services.set(ILanguagePackService, instantiationService.createInstance(NativeLanguagePackService));
    const ptyHostStarter = instantiationService.createInstance(NodePtyHostStarter, {
        graceTime: environmentService.reconnectionGraceTime,
        shortGraceTime: environmentService.reconnectionGraceTime > 0 ? Math.min(300000 /* ProtocolConstants.ReconnectionShortGraceTime */, environmentService.reconnectionGraceTime) : 0,
        scrollback: configurationService.getValue("terminal.integrated.persistentSessionScrollback" /* TerminalSettingId.PersistentSessionScrollback */) ?? 100
    });
    const ptyHostService = instantiationService.createInstance(PtyHostService, ptyHostStarter);
    services.set(IPtyService, ptyHostService);
    const serverLifetimeService = instantiationService.createInstance(ServerLifetimeService, {
        enableAutoShutdown: !!args['enable-remote-auto-shutdown'],
        shutdownWithoutDelay: !!args['remote-auto-shutdown-without-delay'],
    });
    services.set(IServerLifetimeService, serverLifetimeService);
    if (args['agent-host-port'] || args['agent-host-path']) {
        const agentHostStarter = instantiationService.createInstance(NodeAgentHostStarter);
        agentHostStarter.setWebSocketConfig({
            port: args['agent-host-port'],
            socketPath: args['agent-host-path'],
            host: args.host || 'localhost',
            connectionToken: connectionToken.type === 2 /* ServerConnectionTokenType.Mandatory */ ? connectionToken.value : undefined,
        });
        disposables.add(instantiationService.createInstance(ServerAgentHostManager, agentHostStarter));
    }
    services.set(IAllowedMcpServersService, new SyncDescriptor(AllowedMcpServersService));
    services.set(IMcpResourceScannerService, new SyncDescriptor(McpResourceScannerService));
    services.set(IMcpGalleryService, new SyncDescriptor(McpGalleryService));
    services.set(IMcpManagementService, new SyncDescriptor(McpManagementService));
    instantiationService.invokeFunction(accessor => {
        const mcpManagementService = accessor.get(IMcpManagementService);
        const extensionManagementService = accessor.get(INativeServerExtensionManagementService);
        const extensionsScannerService = accessor.get(IExtensionsScannerService);
        const extensionGalleryService = accessor.get(IExtensionGalleryService);
        const languagePackService = accessor.get(ILanguagePackService);
        const remoteExtensionEnvironmentChannel = new RemoteAgentEnvironmentChannel(connectionToken, environmentService, userDataProfilesService, extensionHostStatusService, logService);
        socketServer.registerChannel('remoteextensionsenvironment', remoteExtensionEnvironmentChannel);
        const telemetryChannel = new ServerTelemetryChannel(accessor.get(IServerTelemetryService), oneDsAppender);
        socketServer.registerChannel('telemetry', telemetryChannel);
        socketServer.registerChannel(SANDBOX_HELPER_CHANNEL_NAME, new SandboxHelperChannel(new SandboxHelperService()));
        socketServer.registerChannel(REMOTE_TERMINAL_CHANNEL_NAME, new RemoteTerminalChannel(environmentService, logService, ptyHostService, productService, extensionManagementService, configurationService));
        const remoteExtensionsScanner = new RemoteExtensionsScannerService(instantiationService.createInstance(ExtensionManagementCLI, productService.extensionsForceVersionByQuality ?? [], logService), environmentService, userDataProfilesService, extensionsScannerService, logService, extensionGalleryService, languagePackService, extensionManagementService);
        socketServer.registerChannel(RemoteExtensionsScannerChannelName, new RemoteExtensionsScannerChannel(remoteExtensionsScanner, (ctx) => getUriTransformer(ctx.remoteAuthority)));
        socketServer.registerChannel(NativeMcpDiscoveryHelperChannelName, instantiationService.createInstance(NativeMcpDiscoveryHelperChannel, (ctx) => getUriTransformer(ctx.remoteAuthority)));
        socketServer.registerChannel(McpGatewayChannelName, instantiationService.createInstance((McpGatewayChannel), socketServer));
        const remoteFileSystemChannel = disposables.add(new RemoteAgentFileSystemProviderChannel(logService, environmentService, configurationService));
        socketServer.registerChannel(REMOTE_FILE_SYSTEM_CHANNEL_NAME, remoteFileSystemChannel);
        socketServer.registerChannel('request', new RequestChannel(accessor.get(IRequestService)));
        const channel = new ExtensionManagementChannel(extensionManagementService, (ctx) => getUriTransformer(ctx.remoteAuthority));
        socketServer.registerChannel('extensions', channel);
        socketServer.registerChannel('mcpManagement', new McpManagementChannel(mcpManagementService, (ctx) => getUriTransformer(ctx.remoteAuthority)));
        // clean up extensions folder
        remoteExtensionsScanner.whenExtensionsReady().then(() => extensionManagementService.cleanUp());
        disposables.add(new ErrorTelemetry(accessor.get(ITelemetryService)));
        return {
            telemetryService: accessor.get(ITelemetryService)
        };
    });
    return { socketServer, instantiationService };
}
const _uriTransformerCache = Object.create(null);
function getUriTransformer(remoteAuthority) {
    if (!_uriTransformerCache[remoteAuthority]) {
        _uriTransformerCache[remoteAuthority] = createURITransformer(remoteAuthority);
    }
    return _uriTransformerCache[remoteAuthority];
}
export class SocketServer extends IPCServer {
    constructor() {
        const emitter = new Emitter();
        super(emitter.event);
        this._onDidConnectEmitter = emitter;
    }
    acceptConnection(protocol, onDidClientDisconnect) {
        this._onDidConnectEmitter.fire({ protocol, onDidClientDisconnect });
    }
}
class ServerLogger extends AbstractLogger {
    constructor(logLevel = DEFAULT_LOG_LEVEL) {
        super();
        this.setLevel(logLevel);
        this.useColors = Boolean(process.stdout.isTTY);
    }
    trace(message, ...args) {
        if (this.canLog(LogLevel.Trace)) {
            if (this.useColors) {
                console.log(`\x1b[90m[${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.log(`[${now()}]`, message, ...args);
            }
        }
    }
    debug(message, ...args) {
        if (this.canLog(LogLevel.Debug)) {
            if (this.useColors) {
                console.log(`\x1b[90m[${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.log(`[${now()}]`, message, ...args);
            }
        }
    }
    info(message, ...args) {
        if (this.canLog(LogLevel.Info)) {
            if (this.useColors) {
                console.log(`\x1b[90m[${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.log(`[${now()}]`, message, ...args);
            }
        }
    }
    warn(message, ...args) {
        if (this.canLog(LogLevel.Warning)) {
            if (this.useColors) {
                console.warn(`\x1b[93m[${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.warn(`[${now()}]`, message, ...args);
            }
        }
    }
    error(message, ...args) {
        if (this.canLog(LogLevel.Error)) {
            if (this.useColors) {
                console.error(`\x1b[91m[${now()}]\x1b[0m`, message, ...args);
            }
            else {
                console.error(`[${now()}]`, message, ...args);
            }
        }
    }
    flush() {
        // noop
    }
}
function now() {
    const date = new Date();
    return `${twodigits(date.getHours())}:${twodigits(date.getMinutes())}:${twodigits(date.getSeconds())}`;
}
function twodigits(n) {
    if (n < 10) {
        return `0${n}`;
    }
    return String(n);
}
/**
 * Cleans up older logs, while keeping the 10 most recent ones.
 */
async function cleanupOlderLogs(logsPath) {
    const currentLog = path.basename(logsPath);
    const logsRoot = path.dirname(logsPath);
    if (!await Promises.exists(logsRoot)) {
        return; // Logs root doesn't exist yet, nothing to clean up
    }
    const children = await Promises.readdir(logsRoot);
    const allSessions = children.filter(name => /^\d{8}T\d{6}$/.test(name));
    const oldSessions = allSessions.sort().filter((d) => d !== currentLog);
    const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));
    await Promise.all(toDelete.map(name => Promises.rm(path.join(logsRoot, name))));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyU2VydmljZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXJ2ZXIvbm9kZS9zZXJ2ZXJTZXJ2aWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLElBQUksQ0FBQztBQUN2QyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sNEJBQTRCLENBQUM7QUFDNUQsT0FBTyxFQUFtQixZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdkQsT0FBTyxLQUFLLElBQUksTUFBTSwyQkFBMkIsQ0FBQztBQUVsRCxPQUFPLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN0RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDbEQsT0FBTyxFQUFrRCxTQUFTLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0gsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDN0YsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDOUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEgsT0FBTyxFQUFFLDJDQUEyQyxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDbkksT0FBTyxFQUFFLHlCQUF5QixFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDdkksT0FBTyxFQUFFLHFDQUFxQyxFQUFFLHNDQUFzQyxFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDakwsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDN0csT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDakgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDNUosT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFcEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDNUYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDL0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEssT0FBTyxPQUFPLE1BQU0sMENBQTBDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxpQkFBaUIsRUFBa0IsTUFBTSw4Q0FBOEMsQ0FBQztBQUVqRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsbUJBQW1CLEVBQUUsYUFBYSxFQUFzQixZQUFZLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4TCxPQUFPLGNBQWMsTUFBTSxpREFBaUQsQ0FBQztBQUM3RSxPQUFPLEVBQUUsV0FBVyxFQUFxQixNQUFNLDRDQUE0QyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN4SixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUzRSxPQUFPLEVBQUUsd0JBQXdCLEVBQW9CLE1BQU0sK0JBQStCLENBQUM7QUFDM0YsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDdkgsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sMEVBQTBFLENBQUM7QUFDM0gsT0FBTyxFQUFFLDBCQUEwQixFQUFFLDJCQUEyQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDbEgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekUsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sOEVBQThFLENBQUM7QUFDaEksT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDcEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDckYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQzdILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4QyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM5RyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN4RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUMzRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNqSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5SSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUN6SCxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxpRkFBaUYsQ0FBQztBQUNySSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsa0JBQWtCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNsSSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMvSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN6RyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0SCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVwRixNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQztBQUV0QyxNQUFNLENBQUMsS0FBSyxVQUFVLG1CQUFtQixDQUFDLGVBQXNDLEVBQUUsSUFBc0IsRUFBRSxrQkFBMEIsRUFBRSxXQUE0QjtJQUNqSyxNQUFNLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7SUFDekMsTUFBTSxZQUFZLEdBQUcsSUFBSSxZQUFZLEVBQWdDLENBQUM7SUFFdEUsTUFBTSxjQUFjLEdBQW9CLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sRUFBRSxDQUFDO0lBQ2pGLFFBQVEsQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBRTlDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDOUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3RELFFBQVEsQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUU1RCxNQUFNLGFBQWEsR0FBRyxJQUFJLGFBQWEsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN0RyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUM1QyxZQUFZLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxJQUFJLGFBQWEsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxHQUFpQyxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXhKLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDN0csTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hILFFBQVEsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3RDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdEosV0FBVyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRSx3QkFBd0IsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUxSixVQUFVLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7SUFDdkUsVUFBVSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNoRSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7UUFDbEQsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLGNBQWMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRUQsd0NBQXdDO0lBQ3hDLFlBQVksQ0FBQyxlQUFlLENBQUMsa0NBQWtDLENBQUMsV0FBVyxFQUFFLElBQUksa0NBQWtDLEVBQUUsQ0FBQyxDQUFDO0lBRXZILHVEQUF1RDtJQUN2RCxNQUFNLE1BQU0sR0FBRyxJQUFJLFlBQVksQ0FBK0IsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxLQUFLLFVBQVUsQ0FBQyxDQUFDO0lBRWxHLFFBQVE7SUFDUixNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDakUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDeEMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVwRyxlQUFlO0lBQ2YsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQy9ELFFBQVEsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUV0RCxnQkFBZ0I7SUFDaEIsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLG9CQUFvQixDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixFQUFFLFdBQVcsRUFBRSxJQUFJLGlCQUFpQixFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDcEosUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBRTFELHFCQUFxQjtJQUNyQixNQUFNLHVCQUF1QixHQUFHLElBQUksNkJBQTZCLENBQUMsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ25JLFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztJQUNoRSxZQUFZLENBQUMsZUFBZSxDQUFDLGtCQUFrQixFQUFFLElBQUksb0NBQW9DLENBQUMsdUJBQXVCLEVBQUUsQ0FBQyxHQUFpQyxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRW5NLGtDQUFrQztJQUNsQyxRQUFRLENBQUMsR0FBRyxDQUFDLHNCQUFzQixFQUFFLElBQUksY0FBYyxDQUFDLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBRWpHLGFBQWE7SUFDYixNQUFNLENBQUMsRUFBRSxBQUFELEVBQUcsU0FBUyxFQUFFLEtBQUssRUFBRSxXQUFXLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7UUFDN0Qsb0JBQW9CLENBQUMsVUFBVSxFQUFFO1FBQ2pDLHVCQUF1QixDQUFDLElBQUksRUFBRTtRQUM5QixZQUFZLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDL0MsZUFBZSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELGNBQWMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztLQUNqRCxDQUFDLENBQUM7SUFFSCxNQUFNLDBCQUEwQixHQUFHLElBQUksMEJBQTBCLEVBQUUsQ0FBQztJQUNwRSxRQUFRLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLDBCQUEwQixDQUFDLENBQUM7SUFFdEUsVUFBVTtJQUNWLE1BQU0sY0FBYyxHQUFHLElBQUksY0FBYyxDQUFDLFFBQVEsRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUMxRyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUU5QyxJQUFJLGFBQWEsR0FBdUIsWUFBWSxDQUFDO0lBQ3JELE1BQU0sVUFBVSxHQUFHLG1CQUFtQixDQUFDLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQzdFLElBQUksaUJBQWlCLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztRQUMzRCxJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsRUFBRSxrQkFBa0IsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDNUYsYUFBYSxHQUFHLElBQUkscUJBQXFCLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDMUgsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsYUFBYSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLHVFQUF1RTtRQUNySSxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQTRCO1lBQ3ZDLFNBQVMsRUFBRSxDQUFDLGFBQWEsRUFBRSxJQUFJLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ2pILGdCQUFnQixFQUFFLHVCQUF1QixDQUFDLE9BQU8sRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsT0FBTyxHQUFHLFNBQVMsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsY0FBYyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUM7WUFDeE4sUUFBUSxFQUFFLDBCQUEwQixDQUFDLGtCQUFrQixDQUFDO1NBQ3hELENBQUM7UUFDRixNQUFNLHdCQUF3QixHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzVFLElBQUksc0JBQXNCLCtCQUF1QyxDQUFDO1FBQ2xFLHNGQUFzRjtRQUN0RixJQUFJLHdCQUF3QixLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3hDLHNCQUFzQiwrQkFBdUIsQ0FBQztRQUMvQyxDQUFDO2FBQU0sSUFBSSx3QkFBd0IsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUNqRCxzQkFBc0IsK0JBQXVCLENBQUM7UUFDL0MsQ0FBQzthQUFNLElBQUksd0JBQXdCLEtBQUssT0FBTyxFQUFFLENBQUM7WUFDakQsc0JBQXNCLCtCQUF1QixDQUFDO1FBQy9DLENBQUM7YUFBTSxJQUFJLHdCQUF3QixLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ25ELHNCQUFzQiw4QkFBc0IsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsUUFBUSxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLGNBQWMsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNySCxDQUFDO1NBQU0sQ0FBQztRQUNQLFFBQVEsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxJQUFJLGtDQUFrQyxDQUFDLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO0lBQ3JILFFBQVEsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsSUFBSSw0QkFBNEIsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO0lBQ3pGLFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxjQUFjLENBQUMsMkNBQTJDLENBQUMsQ0FBQyxDQUFDO0lBRXhHLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3BFLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSw0QkFBNEIsQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLENBQUMsMERBQTBELENBQUMsQ0FBQyxDQUFDO0lBRWxMLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLEVBQUUsSUFBSSxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDO0lBQ3BHLFFBQVEsQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsSUFBSSxjQUFjLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO0lBQ3RGLFFBQVEsQ0FBQyxHQUFHLENBQUMsc0NBQXNDLEVBQUUsSUFBSSxjQUFjLENBQUMscUNBQXFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hILFFBQVEsQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsSUFBSSxjQUFjLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO0lBQ3RGLFFBQVEsQ0FBQyxHQUFHLENBQUMsdUNBQXVDLEVBQUUsSUFBSSxjQUFjLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO0lBQ3RHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLEVBQUUsSUFBSSxjQUFjLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDO0lBQ3BHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBRXhFLE1BQU0sb0JBQW9CLEdBQTBCLElBQUksb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdkYsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxvQkFBb0IsQ0FBQyxjQUFjLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDO0lBRW5HLE1BQU0sY0FBYyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FDekQsa0JBQWtCLEVBQ2xCO1FBQ0MsU0FBUyxFQUFFLGtCQUFrQixDQUFDLHFCQUFxQjtRQUNuRCxjQUFjLEVBQUUsa0JBQWtCLENBQUMscUJBQXFCLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyw0REFBK0Msa0JBQWtCLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuSyxVQUFVLEVBQUUsb0JBQW9CLENBQUMsUUFBUSx1R0FBdUQsSUFBSSxHQUFHO0tBQ3ZHLENBQ0QsQ0FBQztJQUNGLE1BQU0sY0FBYyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDM0YsUUFBUSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFFMUMsTUFBTSxxQkFBcUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMscUJBQXFCLEVBQUU7UUFDeEYsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQztRQUN6RCxvQkFBb0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxDQUFDO0tBQ2xFLENBQUMsQ0FBQztJQUNILFFBQVEsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUU1RCxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7UUFDeEQsTUFBTSxnQkFBZ0IsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNuRixnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQztZQUNuQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDO1lBQzdCLFVBQVUsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUM7WUFDbkMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLElBQUksV0FBVztZQUM5QixlQUFlLEVBQUUsZUFBZSxDQUFDLElBQUksZ0RBQXdDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDakgsQ0FBQyxDQUFDO1FBQ0gsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFRCxRQUFRLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLElBQUksY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztJQUN0RixRQUFRLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLElBQUksY0FBYyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztJQUN4RixRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLElBQUksY0FBYyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztJQUN4RSxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLElBQUksY0FBYyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztJQUU5RSxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDOUMsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDakUsTUFBTSwwQkFBMEIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDekYsTUFBTSx3QkFBd0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDekUsTUFBTSx1QkFBdUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDdkUsTUFBTSxtQkFBbUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDL0QsTUFBTSxpQ0FBaUMsR0FBRyxJQUFJLDZCQUE2QixDQUFDLGVBQWUsRUFBRSxrQkFBa0IsRUFBRSx1QkFBdUIsRUFBRSwwQkFBMEIsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNsTCxZQUFZLENBQUMsZUFBZSxDQUFDLDZCQUE2QixFQUFFLGlDQUFpQyxDQUFDLENBQUM7UUFFL0YsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUMxRyxZQUFZLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTVELFlBQVksQ0FBQyxlQUFlLENBQUMsMkJBQTJCLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLG9CQUFvQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRWhILFlBQVksQ0FBQyxlQUFlLENBQUMsNEJBQTRCLEVBQUUsSUFBSSxxQkFBcUIsQ0FBQyxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLGNBQWMsRUFBRSwwQkFBMEIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFeE0sTUFBTSx1QkFBdUIsR0FBRyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsRUFBRSxjQUFjLENBQUMsK0JBQStCLElBQUksRUFBRSxFQUFFLFVBQVUsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLHVCQUF1QixFQUFFLHdCQUF3QixFQUFFLFVBQVUsRUFBRSx1QkFBdUIsRUFBRSxtQkFBbUIsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1FBQy9WLFlBQVksQ0FBQyxlQUFlLENBQUMsa0NBQWtDLEVBQUUsSUFBSSw4QkFBOEIsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLEdBQWlDLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN00sWUFBWSxDQUFDLGVBQWUsQ0FBQyxtQ0FBbUMsRUFBRSxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsK0JBQStCLEVBQUUsQ0FBQyxHQUFpQyxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZOLFlBQVksQ0FBQyxlQUFlLENBQUMscUJBQXFCLEVBQUUsb0JBQW9CLENBQUMsY0FBYyxDQUFDLENBQUEsaUJBQStDLENBQUEsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBRXhKLE1BQU0sdUJBQXVCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLG9DQUFvQyxDQUFDLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDaEosWUFBWSxDQUFDLGVBQWUsQ0FBQywrQkFBK0IsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBRXZGLFlBQVksQ0FBQyxlQUFlLENBQUMsU0FBUyxFQUFFLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTNGLE1BQU0sT0FBTyxHQUFHLElBQUksMEJBQTBCLENBQUMsMEJBQTBCLEVBQUUsQ0FBQyxHQUFpQyxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUMxSixZQUFZLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVwRCxZQUFZLENBQUMsZUFBZSxDQUFDLGVBQWUsRUFBRSxJQUFJLG9CQUFvQixDQUFDLG9CQUFvQixFQUFFLENBQUMsR0FBaUMsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3Syw2QkFBNkI7UUFDN0IsdUJBQXVCLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsMEJBQTBCLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUUvRixXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFckUsT0FBTztZQUNOLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUM7U0FDakQsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0FBQy9DLENBQUM7QUFFRCxNQUFNLG9CQUFvQixHQUFtRCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRWpHLFNBQVMsaUJBQWlCLENBQUMsZUFBdUI7SUFDakQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDNUMsb0JBQW9CLENBQUMsZUFBZSxDQUFDLEdBQUcsb0JBQW9CLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0UsQ0FBQztJQUNELE9BQU8sb0JBQW9CLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDOUMsQ0FBQztBQUVELE1BQU0sT0FBTyxZQUFnQyxTQUFRLFNBQW1CO0lBSXZFO1FBQ0MsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLEVBQXlCLENBQUM7UUFDckQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQixJQUFJLENBQUMsb0JBQW9CLEdBQUcsT0FBTyxDQUFDO0lBQ3JDLENBQUM7SUFFTSxnQkFBZ0IsQ0FBQyxRQUFpQyxFQUFFLHFCQUFrQztRQUM1RixJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztJQUNyRSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLFlBQWEsU0FBUSxjQUFjO0lBR3hDLFlBQVksV0FBcUIsaUJBQWlCO1FBQ2pELEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFRCxLQUFLLENBQUMsT0FBZSxFQUFFLEdBQUcsSUFBZTtRQUN4QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDakMsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQzVELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUM3QyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBZSxFQUFFLEdBQUcsSUFBZTtRQUN4QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDakMsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQzVELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUM3QyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLENBQUMsT0FBZSxFQUFFLEdBQUcsSUFBZTtRQUN2QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDaEMsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDO1lBQzVELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUM3QyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLENBQUMsT0FBdUIsRUFBRSxHQUFHLElBQWU7UUFDL0MsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ25DLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNwQixPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksR0FBRyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUM3RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDOUMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQWUsRUFBRSxHQUFHLElBQWU7UUFDeEMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLFlBQVksR0FBRyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUM5RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDL0MsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSztRQUNKLE9BQU87SUFDUixDQUFDO0NBQ0Q7QUFFRCxTQUFTLEdBQUc7SUFDWCxNQUFNLElBQUksR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO0lBQ3hCLE9BQU8sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDO0FBQ3hHLENBQUM7QUFFRCxTQUFTLFNBQVMsQ0FBQyxDQUFTO0lBQzNCLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQ1osT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ2hCLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsUUFBZ0I7SUFDL0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMzQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXhDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUN0QyxPQUFPLENBQUMsbURBQW1EO0lBQzVELENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLFFBQVEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbEQsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN4RSxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssVUFBVSxDQUFDLENBQUM7SUFDdkUsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTNFLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqRixDQUFDIn0=