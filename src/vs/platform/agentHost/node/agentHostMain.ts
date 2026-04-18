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
import { isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as os from 'os';
import { AgentHostIpcChannels, IAgentHostSocketInfo, IConnectionTrackerService } from '../common/agentService.js';
import { AgentService } from './agentService.js';
import { IAgentHostTerminalManager } from './agentHostTerminalManager.js';
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
import { IProductService } from '../../product/common/productService.js';
import { localize } from '../../../nls.js';
import { FileService } from '../../files/common/fileService.js';
import { IFileService } from '../../files/common/files.js';
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../base/common/network.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { SessionDataService } from './sessionDataService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { AgentHostClientFileSystemProvider } from '../common/agentHostClientFileSystemProvider.js';
import { AGENT_CLIENT_SCHEME } from '../common/agentClientUri.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { AgentPluginManager } from './agentPluginManager.js';
import { AgentHostGitService, IAgentHostGitService } from './agentHostGitService.js';
import { registerPendingEditContentProvider } from './copilot/pendingEditContentStore.js';
import { join } from '../../../base/common/path.js';

// Entry point for the agent host utility process.
// Sets up IPC, logging, and registers agent providers (Copilot).
// When VSCODE_AGENT_HOST_PORT or VSCODE_AGENT_HOST_SOCKET_PATH env vars
// are set, also starts a WebSocket server for external clients.

startAgentHost();

function startAgentHost(): void {
	// Setup RPC - supports both Electron utility process and Node child process
	let server: ChildProcessServer<string> | UtilityProcessServer;
	if (isUtilityProcess(process)) {
		server = new UtilityProcessServer();
	} else {
		server = new ChildProcessServer(AgentHostIpcChannels.AgentHost);
	}

	const disposables = new DisposableStore();

	// Services
	const productService: IProductService = { _serviceBrand: undefined, ...product };
	const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
	const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
	server.registerChannel(AgentHostIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
	const logger = loggerService.createLogger('agenthost', { name: localize('agentHost', "Agent Host") });
	const logService = new LogService(logger);
	logService.info('Agent Host process started successfully');

	// File service
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
	// In-memory filesystem backing transient file-edit previews shown during
	// tool-call confirmations.
	disposables.add(registerPendingEditContentProvider(fileService));

	// Session data service
	const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);

	// Create the real service implementation that lives in this process
	let agentService: AgentService;
	try {
		agentService = new AgentService(logService, fileService, sessionDataService, productService);
		const pluginManager = new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService);
		const diServices = new ServiceCollection();
		diServices.set(ILogService, logService);
		diServices.set(IFileService, fileService);
		diServices.set(ISessionDataService, sessionDataService);
		diServices.set(IAgentPluginManager, pluginManager);
		const diffComputeService = disposables.add(new NodeWorkerDiffComputeService(logService));
		diServices.set(IDiffComputeService, diffComputeService);

		diServices.set(IAgentHostTerminalManager, agentService.terminalManager);
		const instantiationService = new InstantiationService(diServices);
		diServices.set(IAgentHostGitService, instantiationService.createInstance(AgentHostGitService));
		agentService.registerProvider(instantiationService.createInstance(CopilotAgent));
	} catch (err) {
		logService.error('Failed to create AgentService', err);
		throw err;
	}
	const agentChannel = ProxyChannel.fromService(agentService, disposables);
	server.registerChannel(AgentHostIpcChannels.AgentHost, agentChannel);

	// Expose the WebSocket client connection count to the parent process via IPC.
	// This is NOT part of the agent host protocol -- it is only used by the
	// server process to manage the agent host process lifetime.
	const connectionCountEmitter = disposables.add(new Emitter<number>());
	let dynamicSocketInfo: IAgentHostSocketInfo | undefined;
	const connectionTrackerService: IConnectionTrackerService = {
		onDidChangeConnectionCount: connectionCountEmitter.event,
		async startWebSocketServer(): Promise<IAgentHostSocketInfo> {
			if (dynamicSocketInfo) {
				return dynamicSocketInfo;
			}

			const socketPath = isWindows
				? `\\\\.\\pipe\\vscode-agent-host-${generateUuid().replace(/-/g, '')}`
				: join(os.tmpdir(), `vscode-agent-host-${generateUuid().replace(/-/g, '')}.sock`);

			const wsServer = disposables.add(await WebSocketProtocolServer.create(
				{ socketPath },
				logService,
			));

			const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
			disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));

			const protocolHandler = disposables.add(new ProtocolServerHandler(
				agentService,
				agentService.stateManager,
				wsServer,
				{ defaultDirectory: URI.file(os.homedir()).toString() },
				clientFileSystemProvider,
				logService,
			));
			disposables.add(protocolHandler.onDidChangeConnectionCount(count => connectionCountEmitter.fire(count)));

			logService.info(`[AgentHost] Dynamic WebSocket server listening on ${socketPath}`);
			dynamicSocketInfo = { socketPath };
			return dynamicSocketInfo;
		},
	};
	const connectionTrackerChannel = ProxyChannel.fromService(connectionTrackerService, disposables);
	server.registerChannel(AgentHostIpcChannels.ConnectionTracker, connectionTrackerChannel);

	// Start WebSocket server for external clients if configured (env-var flow for CLI/server)
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
 * This reuses the same {@link AgentService} and {@link AgentHostStateManager}
 * that the IPC channel uses, so both IPC and WebSocket clients share state.
 */
async function startWebSocketServer(agentService: AgentService, fileService: IFileService, logService: ILogService, disposables: DisposableStore, onConnectionCountChanged: (count: number) => void): Promise<void> {
	const port = process.env['VSCODE_AGENT_HOST_PORT'];
	const socketPath = process.env['VSCODE_AGENT_HOST_SOCKET_PATH'];

	if (!port && !socketPath) {
		return;
	}

	const connectionToken = process.env['VSCODE_AGENT_HOST_CONNECTION_TOKEN'];
	const host = process.env['VSCODE_AGENT_HOST_HOST'] || 'localhost';

	const wsServer = disposables.add(await WebSocketProtocolServer.create(
		socketPath
			? {
				socketPath,
				connectionTokenValidate: connectionToken
					? (token) => token === connectionToken
					: undefined,
			}
			: {
				port: parseInt(port!, 10),
				host,
				connectionTokenValidate: connectionToken
					? (token) => token === connectionToken
					: undefined,
			},
		logService,
	));

	const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
	disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));

	const protocolHandler = disposables.add(new ProtocolServerHandler(
		agentService,
		agentService.stateManager,
		wsServer,
		{ defaultDirectory: URI.file(os.homedir()).toString() },
		clientFileSystemProvider,
		logService,
	));
	disposables.add(protocolHandler.onDidChangeConnectionCount(onConnectionCountChanged));

	const listenTarget = socketPath ?? `${host}:${port}`;
	logService.info(`[AgentHost] WebSocket server listening on ${listenTarget}`);
	// Do not change this line. The CLI looks for this in the output.
	console.log(`Agent host server listening on ${listenTarget}`);
}
