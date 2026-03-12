/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Standalone agent host server with WebSocket protocol transport.
// Start with: node out/vs/platform/agentHost/node/agentHostServerMain.js [--port <port>] [--enable-mock-agent]

import { fileURLToPath } from 'url';

// This standalone process isn't bootstrapped via bootstrap-esm.ts, so we must
// set _VSCODE_FILE_ROOT ourselves so that FileAccess can resolve module paths.
// This file lives at out/vs/platform/agentHost/node/ - the root is `out/`.
globalThis._VSCODE_FILE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { parseArgs, OPTIONS } from '../../environment/node/argv.js';
import { getLogLevel, ILogService, NullLogService } from '../../log/common/log.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { CopilotAgent } from './copilot/copilotAgent.js';
import { type AgentProvider } from '../common/agentService.js';
import { SessionStatus } from '../common/state/sessionState.js';
import { AgentService } from './agentService.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { ProtocolServerHandler, type IProtocolSideEffectHandler } from './protocolServerHandler.js';

// ---- Options ----------------------------------------------------------------

interface IServerOptions {
	readonly port: number;
	readonly enableMockAgent: boolean;
	readonly quiet: boolean;
}

function parseServerOptions(): IServerOptions {
	const argv = process.argv.slice(2);
	const envPort = parseInt(process.env['VSCODE_AGENT_HOST_PORT'] ?? '8081', 10);
	const portIdx = argv.indexOf('--port');
	const port = portIdx >= 0 ? parseInt(argv[portIdx + 1], 10) : envPort;
	const enableMockAgent = argv.includes('--enable-mock-agent');
	const quiet = argv.includes('--quiet');
	return { port, enableMockAgent, quiet };
}

// ---- Main -------------------------------------------------------------------

async function main(): Promise<void> {
	const options = parseServerOptions();
	const disposables = new DisposableStore();

	// Services — production logging unless --quiet
	let logService: ILogService;
	let loggerService: LoggerService | undefined;

	if (options.quiet) {
		logService = new NullLogService();
	} else {
		const services = new ServiceCollection();
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);
		const args = parseArgs(process.argv.slice(2), OPTIONS);
		const environmentService = new NativeEnvironmentService(args, productService);
		services.set(INativeEnvironmentService, environmentService);
		loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
		const logger = loggerService.createLogger('agenthost-server', { name: localize('agentHostServer', "Agent Host Server") });
		logService = disposables.add(new LogService(logger));
		services.set(ILogService, logService);
	}

	logService.info('[AgentHostServer] Starting standalone agent host server');

	// Create agent service — handles agent registration, session lifecycle,
	// event mapping, and state management (reuses the same logic as the
	// utility-process entry point in agentHostMain.ts).
	const agentService = disposables.add(new AgentService(logService));

	// Register agents
	if (!options.quiet) {
		// Production agents (require DI)
		const services = new ServiceCollection();
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);
		const args = parseArgs(process.argv.slice(2), OPTIONS);
		const environmentService = new NativeEnvironmentService(args, productService);
		services.set(INativeEnvironmentService, environmentService);
		services.set(ILogService, logService);
		const instantiationService = new InstantiationService(services);
		const copilotAgent = disposables.add(instantiationService.createInstance(CopilotAgent));
		agentService.registerProvider(copilotAgent);
	}

	if (options.enableMockAgent) {
		// Dynamic import to avoid bundling test code in production
		import('../test/node/mockAgent.js').then(({ ScriptedMockAgent }) => {
			const mockAgent = disposables.add(new ScriptedMockAgent());
			agentService.registerProvider(mockAgent);
		}).catch(err => {
			logService.error('[AgentHostServer] Failed to load mock agent', err);
		});
	}

	// WebSocket server
	const wsServer = disposables.add(await WebSocketProtocolServer.create(options.port, logService));

	// Side-effect handler — delegates to AgentService for all orchestration
	const sideEffects: IProtocolSideEffectHandler = {
		handleAction(action) {
			agentService.dispatchAction(action, 'ws-server', 0);
		},
		async handleCreateSession(command) {
			await agentService.createSession({
				provider: command.provider as AgentProvider | undefined,
				model: command.model,
				workingDirectory: command.workingDirectory,
			});
		},
		handleDisposeSession(session) {
			agentService.disposeSession(session);
		},
		async handleListSessions() {
			const sessions = await agentService.listSessions();
			return sessions.map(s => ({
				resource: s.session,
				provider: '' as AgentProvider,
				title: s.summary ?? 'Session',
				status: SessionStatus.Idle,
				createdAt: s.startTime,
				modifiedAt: s.modifiedTime,
			}));
		},
	};

	// Wire up protocol handler
	disposables.add(new ProtocolServerHandler(agentService.stateManager, wsServer, sideEffects, logService));

	// Report ready
	const address = wsServer.address;
	if (address) {
		const listeningPort = address.split(':').pop();
		process.stdout.write(`READY:${listeningPort}\n`);
		logService.info(`[AgentHostServer] WebSocket server listening on ws://${address}`);
	} else {
		const interval = setInterval(() => {
			const addr = wsServer.address;
			if (addr) {
				clearInterval(interval);
				const listeningPort = addr.split(':').pop();
				process.stdout.write(`READY:${listeningPort}\n`);
				logService.info(`[AgentHostServer] WebSocket server listening on ws://${addr}`);
			}
		}, 10);
	}

	// Keep alive until stdin closes or signal
	process.stdin.resume();
	process.stdin.on('end', shutdown);
	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);

	function shutdown(): void {
		logService.info('[AgentHostServer] Shutting down...');
		disposables.dispose();
		loggerService?.dispose();
		process.exit(0);
	}
}

main();
