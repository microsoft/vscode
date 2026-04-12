/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Server as ChildProcessServer } from '../../../base/parts/ipc/node/ipc.cp.js';
import { Server as UtilityProcessServer } from '../../../base/parts/ipc/node/ipc.mp.js';
import { isUtilityProcess } from '../../../base/parts/sandbox/node/electronTypes.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import * as os from 'os';
import { AgentService } from './agentService.js';
import { CopilotAgent } from './copilot/copilotAgent.js';
import { ProtocolServerHandler } from './protocolServerHandler.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { parseArgs, OPTIONS } from '../../environment/node/argv.js';
import { getLogLevel, ILogService } from '../../log/common/log.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import { LoggerChannel } from '../../log/common/logIpc.js';
import { DefaultURITransformer } from '../../../base/common/uriIpc.js';
import product from '../../product/common/product.js';
import { localize } from '../../../nls.js';
import { FileService } from '../../files/common/fileService.js';
import { IFileService } from '../../files/common/files.js';
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../base/common/network.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { SessionDataService } from './sessionDataService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { AgentHostClientFileSystemProvider } from '../common/agentHostClientFileSystemProvider.js';
import { AGENT_CLIENT_SCHEME } from '../common/agentClientUri.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { AgentPluginManager } from './agentPluginManager.js';
// Entry point for the agent host utility process.
// Sets up IPC, logging, and registers agent providers (Copilot).
// When VSCODE_AGENT_HOST_PORT or VSCODE_AGENT_HOST_SOCKET_PATH env vars
// are set, also starts a WebSocket server for external clients.
startAgentHost();
function startAgentHost() {
    // Setup RPC - supports both Electron utility process and Node child process
    let server;
    if (isUtilityProcess(process)) {
        server = new UtilityProcessServer();
    }
    else {
        server = new ChildProcessServer("agentHost" /* AgentHostIpcChannels.AgentHost */);
    }
    const disposables = new DisposableStore();
    // Services
    const productService = { _serviceBrand: undefined, ...product };
    const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
    const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
    server.registerChannel("agentHostLogger" /* AgentHostIpcChannels.Logger */, new LoggerChannel(loggerService, () => DefaultURITransformer));
    const logger = loggerService.createLogger('agenthost', { name: localize('agentHost', "Agent Host") });
    const logService = new LogService(logger);
    logService.info('Agent Host process started successfully');
    // File service
    const fileService = disposables.add(new FileService(logService));
    disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
    // Session data service
    const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);
    // Create the real service implementation that lives in this process
    let agentService;
    try {
        agentService = new AgentService(logService, fileService, sessionDataService);
        const pluginManager = new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService);
        const diServices = new ServiceCollection();
        diServices.set(ILogService, logService);
        diServices.set(IFileService, fileService);
        diServices.set(ISessionDataService, sessionDataService);
        diServices.set(IAgentPluginManager, pluginManager);
        const instantiationService = new InstantiationService(diServices);
        agentService.registerProvider(instantiationService.createInstance(CopilotAgent));
    }
    catch (err) {
        logService.error('Failed to create AgentService', err);
        throw err;
    }
    const agentChannel = ProxyChannel.fromService(agentService, disposables);
    server.registerChannel("agentHost" /* AgentHostIpcChannels.AgentHost */, agentChannel);
    // Expose the WebSocket client connection count to the parent process via IPC.
    // This is NOT part of the agent host protocol -- it is only used by the
    // server process to manage the agent host process lifetime.
    const connectionCountEmitter = disposables.add(new Emitter());
    const connectionTrackerChannel = ProxyChannel.fromService({ onDidChangeConnectionCount: connectionCountEmitter.event }, disposables);
    server.registerChannel("agentHostConnectionTracker" /* AgentHostIpcChannels.ConnectionTracker */, connectionTrackerChannel);
    // Start WebSocket server for external clients if configured
    startWebSocketServer(agentService, fileService, logService, disposables, count => connectionCountEmitter.fire(count)).catch(err => {
        logService.error('Failed to start WebSocket server', err);
    });
    process.once('exit', () => {
        agentService.dispose();
        logService.dispose();
        disposables.dispose();
    });
}
/**
 * When the parent process passes WebSocket configuration via environment
 * variables, start a protocol server that external clients can connect to.
 * This reuses the same {@link AgentService} and {@link SessionStateManager}
 * that the IPC channel uses, so both IPC and WebSocket clients share state.
 */
async function startWebSocketServer(agentService, fileService, logService, disposables, onConnectionCountChanged) {
    const port = process.env['VSCODE_AGENT_HOST_PORT'];
    const socketPath = process.env['VSCODE_AGENT_HOST_SOCKET_PATH'];
    if (!port && !socketPath) {
        return;
    }
    const connectionToken = process.env['VSCODE_AGENT_HOST_CONNECTION_TOKEN'];
    const host = process.env['VSCODE_AGENT_HOST_HOST'] || 'localhost';
    const wsServer = disposables.add(await WebSocketProtocolServer.create(socketPath
        ? {
            socketPath,
            connectionTokenValidate: connectionToken
                ? (token) => token === connectionToken
                : undefined,
        }
        : {
            port: parseInt(port, 10),
            host,
            connectionTokenValidate: connectionToken
                ? (token) => token === connectionToken
                : undefined,
        }, logService));
    const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
    disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));
    const protocolHandler = disposables.add(new ProtocolServerHandler(agentService, agentService.stateManager, wsServer, { defaultDirectory: URI.file(os.homedir()).toString() }, clientFileSystemProvider, logService));
    disposables.add(protocolHandler.onDidChangeConnectionCount(onConnectionCountChanged));
    const listenTarget = socketPath ?? `${host}:${port}`;
    logService.info(`[AgentHost] WebSocket server listening on ${listenTarget}`);
    // Do not change this line. The CLI looks for this in the output.
    console.log(`Agent host server listening on ${listenTarget}`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0TWFpbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdE1haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxNQUFNLElBQUksa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN0RixPQUFPLEVBQUUsTUFBTSxJQUFJLG9CQUFvQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFFekIsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2pELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN6RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUs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