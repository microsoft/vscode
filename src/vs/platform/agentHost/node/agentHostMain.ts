/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Server as ChildProcessServer } from '../../../base/parts/ipc/node/ipc.cp.js';
import { Server as UtilityProcessServer } from '../../../base/parts/ipc/node/ipc.mp.js';
import { isUtilityProcess } from '../../../base/parts/sandbox/node/electronTypes.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import * as os from 'os';
import { AgentHostIpcChannels, AgentSession } from '../common/agentService.js';
import { SessionStatus } from '../common/state/sessionState.js';
import { AgentService } from './agentService.js';
import { CopilotAgent } from './copilot/copilotAgent.js';
import { ProtocolServerHandler, type IProtocolSideEffectHandler } from './protocolServerHandler.js';
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
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../base/common/network.js';

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

	// Create the real service implementation that lives in this process
	let agentService: AgentService;
	try {
		agentService = new AgentService(logService, fileService);
		agentService.registerProvider(new CopilotAgent(logService));
	} catch (err) {
		logService.error('Failed to create AgentService', err);
		throw err;
	}
	const agentChannel = ProxyChannel.fromService(agentService, disposables);
	server.registerChannel(AgentHostIpcChannels.AgentHost, agentChannel);

	// Start WebSocket server for external clients if configured
	startWebSocketServer(agentService, logService, disposables).catch(err => {
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
async function startWebSocketServer(agentService: AgentService, logService: ILogService, disposables: DisposableStore): Promise<void> {
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

	// Create a side-effect handler that delegates to AgentService
	const sideEffects: IProtocolSideEffectHandler = {
		handleAction(action) {
			agentService.dispatchAction(action, 'ws-server', 0);
		},
		async handleCreateSession(command) {
			await agentService.createSession({
				provider: command.provider,
				model: command.model,
				workingDirectory: command.workingDirectory,
				session: URI.parse(command.session),
			});
		},
		handleDisposeSession(session) {
			agentService.disposeSession(URI.parse(session));
		},
		async handleListSessions() {
			const sessions = await agentService.listSessions();
			return sessions.map(s => ({
				resource: s.session.toString(),
				provider: AgentSession.provider(s.session) ?? 'copilot',
				title: s.summary ?? 'Session',
				status: SessionStatus.Idle,
				createdAt: s.startTime,
				modifiedAt: s.modifiedTime,
				workingDirectory: s.workingDirectory,
			}));
		},

		handleGetResourceMetadata() {
			return agentService.getResourceMetadataSync();
		},
		async handleAuthenticate(params) {
			return agentService.authenticate(params);
		},
		handleBrowseDirectory(uri) {
			return agentService.browseDirectory(URI.parse(uri));
		},
		getDefaultDirectory() {
			return URI.file(os.homedir()).toString();
		},
	};

	disposables.add(new ProtocolServerHandler(agentService.stateManager, wsServer, sideEffects, logService));

	const listenTarget = socketPath ?? `${host}:${port}`;
	logService.info(`[AgentHost] WebSocket server listening on ${listenTarget}`);
	// Do not change this line. The CLI looks for this in the output.
	console.log(`Agent host server listening on ${listenTarget}`);
}
