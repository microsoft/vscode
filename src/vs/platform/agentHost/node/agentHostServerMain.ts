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
import { URI } from '../../../base/common/uri.js';
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
import { AgentSession, type AgentProvider, type IAgent } from '../common/agentService.js';
import { SessionStateManager } from './sessionStateManager.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { ProtocolServerHandler, type IProtocolSideEffectHandler } from './protocolServerHandler.js';
import { mapProgressEventToAction } from './agentEventMapper.js';
import {
	ISessionModelInfo,
	SessionStatus, type ISessionSummary
} from '../common/state/sessionState.js';
import type { ISessionAction } from '../common/state/sessionActions.js';
import type { ICreateSessionParams } from '../common/state/sessionProtocol.js';

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

function main(): void {
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

	// Create state manager
	const stateManager = disposables.add(new SessionStateManager(logService));

	// Agent registry — maps provider id to agent instance
	const agents = new Map<AgentProvider, IAgent>();

	function registerAgent(agent: IAgent): void {
		agents.set(agent.id, agent);
		disposables.add(agent.onDidSessionProgress(e => {
			const turnId = stateManager.getActiveTurnId(e.session);
			if (turnId) {
				const action = mapProgressEventToAction(e, e.session, turnId);
				if (action) {
					stateManager.dispatchServerAction(action);
				}
			}
		}));
		// Publish agent to root state (models fetched async)
		publishAgentsToRootState();
		logService.info(`[AgentHostServer] Registered agent: ${agent.id}`);
	}

	async function publishAgentsToRootState(): Promise<void> {
		const agentInfos = await Promise.all([...agents.values()].map(async a => {
			const d = a.getDescriptor();
			let models: ISessionModelInfo[];
			try {
				const rawModels = await a.listModels();
				models = rawModels.map(m => ({
					id: m.id, provider: m.provider, name: m.name,
					maxContextWindow: m.maxContextWindow, supportsVision: m.supportsVision,
					policyState: m.policyState,
				}));
			} catch {
				models = [];
			}
			return { provider: d.provider, displayName: d.displayName, description: d.description, models };
		}));
		stateManager.dispatchServerAction({ type: 'root/agentsChanged', agents: agentInfos });
	}

	function getAgent(session: URI): IAgent | undefined {
		const provider = AgentSession.provider(session);
		return provider ? agents.get(provider) : agents.values().next().value;
	}

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
		registerAgent(copilotAgent);
	}

	if (options.enableMockAgent) {
		// Dynamic import to avoid bundling test code in production
		import('../test/node/mockAgent.js').then(({ ScriptedMockAgent }) => {
			const mockAgent = disposables.add(new ScriptedMockAgent());
			registerAgent(mockAgent);
		}).catch(err => {
			logService.error('[AgentHostServer] Failed to load mock agent', err);
		});
	}

	// WebSocket server
	const wsServer = disposables.add(new WebSocketProtocolServer(options.port, logService));

	// Side-effect handler — routes to the correct agent based on session URI
	const sideEffects: IProtocolSideEffectHandler = {
		handleAction(action: ISessionAction): void {
			switch (action.type) {
				case 'session/turnStarted': {
					const agent = getAgent(action.session);
					if (!agent) {
						stateManager.dispatchServerAction({
							type: 'session/error',
							session: action.session,
							turnId: action.turnId,
							error: { errorType: 'noAgent', message: 'No agent found for session' },
						});
						return;
					}
					const attachments = action.userMessage.attachments?.map(a => ({
						type: a.type,
						path: a.path,
						displayName: a.displayName,
					}));
					agent.sendMessage(action.session, action.userMessage.text, attachments).catch(err => {
						logService.error('[AgentHostServer] sendMessage failed', err);
						stateManager.dispatchServerAction({
							type: 'session/error',
							session: action.session,
							turnId: action.turnId,
							error: { errorType: 'sendFailed', message: String(err) },
						});
					});
					break;
				}
				case 'session/permissionResolved': {
					const agent = getAgent(action.session);
					agent?.respondToPermissionRequest(action.requestId, action.approved);
					break;
				}
				case 'session/turnCancelled': {
					const agent = getAgent(action.session);
					agent?.abortSession(action.session).catch(() => { });
					break;
				}
				case 'session/modelChanged': {
					const agent = getAgent(action.session);
					agent?.changeModel?.(action.session, action.model).catch(err => {
						logService.error('[AgentHostServer] changeModel failed', err);
					});
					break;
				}
			}
		},
		async handleCreateSession(command: ICreateSessionParams): Promise<void> {
			const provider = (command.provider ?? agents.keys().next().value) as AgentProvider;
			const agent = agents.get(provider);
			if (!agent) {
				throw new Error(`No agent registered for provider: ${provider}`);
			}
			const session = await agent.createSession({
				provider,
				model: command.model,
				workingDirectory: command.workingDirectory,
			});
			const summary: ISessionSummary = {
				resource: session,
				provider,
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			};
			stateManager.createSession(summary);
			stateManager.dispatchServerAction({ type: 'session/ready', session });
		},
		handleDisposeSession(session: URI): void {
			const agent = getAgent(session);
			agent?.disposeSession(session).catch(() => { });
			stateManager.removeSession(session);
		},
		async handleListSessions(): Promise<ISessionSummary[]> {
			const allSessions: ISessionSummary[] = [];
			for (const agent of agents.values()) {
				const sessions = await agent.listSessions();
				const provider = agent.id;
				for (const s of sessions) {
					allSessions.push({
						resource: s.session,
						provider,
						title: s.summary ?? 'Session',
						status: SessionStatus.Idle,
						createdAt: s.startTime,
						modifiedAt: s.modifiedTime,
					});
				}
			}
			return allSessions;
		},
	};

	// Wire up protocol handler
	disposables.add(new ProtocolServerHandler(stateManager, wsServer, sideEffects, logService));

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
