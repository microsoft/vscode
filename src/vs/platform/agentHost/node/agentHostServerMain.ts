/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Standalone agent host server with WebSocket protocol transport.
// Start with: node out/vs/platform/agentHost/node/agentHostServerMain.js [--port <port>] [--connection-token <token>] [--connection-token-file <path>] [--without-connection-token] [--enable-mock-agent] [--quiet] [--log <level>]

import { fileURLToPath } from 'url';

// This standalone process isn't bootstrapped via bootstrap-esm.ts, so we must
// set _VSCODE_FILE_ROOT ourselves so that FileAccess can resolve module paths.
// This file lives at out/vs/platform/agentHost/node/ - the root is `out/`.
globalThis._VSCODE_FILE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

import * as fs from 'fs';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
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
import { AgentSideEffects } from './agentSideEffects.js';
import { SessionStateManager } from './sessionStateManager.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { ProtocolServerHandler } from './protocolServerHandler.js';
import { FileService } from '../../files/common/fileService.js';
import { IFileService } from '../../files/common/files.js';
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../base/common/network.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { SessionDataService } from './sessionDataService.js';

/** Log to stderr so messages appear in the terminal alongside the process. */
function log(msg: string): void {
	process.stderr.write(`[AgentHostServer] ${msg}\n`);
}

// ---- Options ----------------------------------------------------------------

const connectionTokenRegex = /^[0-9A-Za-z_-]+$/;

interface IServerOptions {
	readonly port: number;
	readonly enableMockAgent: boolean;
	readonly quiet: boolean;
	/** Connection token string, or `undefined` when `--without-connection-token`. */
	readonly connectionToken: string | undefined;
}

function parseServerOptions(): IServerOptions {
	const argv = process.argv.slice(2);
	const envPort = parseInt(process.env['VSCODE_AGENT_HOST_PORT'] ?? '8081', 10);
	const portIdx = argv.indexOf('--port');
	const port = portIdx >= 0 ? parseInt(argv[portIdx + 1], 10) : envPort;
	const enableMockAgent = argv.includes('--enable-mock-agent');
	const quiet = argv.includes('--quiet');

	// Connection token
	const withoutConnectionToken = argv.includes('--without-connection-token');
	const connectionTokenIdx = argv.indexOf('--connection-token');
	const connectionTokenFileIdx = argv.indexOf('--connection-token-file');
	const rawToken = connectionTokenIdx >= 0 ? argv[connectionTokenIdx + 1] : undefined;
	const tokenFilePath = connectionTokenFileIdx >= 0 ? argv[connectionTokenFileIdx + 1] : undefined;

	let connectionToken: string | undefined;
	if (withoutConnectionToken) {
		if (rawToken !== undefined || tokenFilePath !== undefined) {
			log('Error: --without-connection-token cannot be used with --connection-token or --connection-token-file');
			process.exit(1);
		}
		connectionToken = undefined;
	} else if (tokenFilePath !== undefined) {
		if (rawToken !== undefined) {
			log('Error: --connection-token cannot be used with --connection-token-file');
			process.exit(1);
		}
		try {
			connectionToken = fs.readFileSync(tokenFilePath).toString().replace(/\r?\n$/, '');
		} catch {
			log(`Error: Unable to read connection token file at '${tokenFilePath}'`);
			process.exit(1);
		}
		if (!connectionTokenRegex.test(connectionToken!)) {
			log(`Error: The connection token in '${tokenFilePath}' does not adhere to the characters 0-9, a-z, A-Z, _, or -.`);
			process.exit(1);
		}
	} else if (rawToken !== undefined) {
		if (!connectionTokenRegex.test(rawToken)) {
			log(`Error: The connection token '${rawToken}' does not adhere to the characters 0-9, a-z, A-Z, _, or -.`);
			process.exit(1);
		}
		connectionToken = rawToken;
	} else {
		// Default: generate a random token (secure by default)
		connectionToken = generateUuid();
	}

	return { port, enableMockAgent, quiet, connectionToken };
}

// ---- Main -------------------------------------------------------------------

async function main(): Promise<void> {
	const options = parseServerOptions();
	const disposables = new DisposableStore();

	// Services
	const productService: IProductService = { _serviceBrand: undefined, ...product };
	const args = parseArgs(process.argv.slice(2), OPTIONS);
	const environmentService = new NativeEnvironmentService(args, productService);

	// Logging — production logging unless --quiet
	let logService: ILogService;
	let loggerService: LoggerService | undefined;

	if (options.quiet) {
		logService = new NullLogService();
	} else {
		const services = new ServiceCollection();
		services.set(IProductService, productService);
		services.set(INativeEnvironmentService, environmentService);
		loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
		const logger = loggerService.createLogger('agenthost-server', { name: localize('agentHostServer', "Agent Host Server") });
		logService = disposables.add(new LogService(logger));
		services.set(ILogService, logService);
		log('Starting standalone agent host server');
	}

	logService.info('[AgentHostServer] Starting standalone agent host server');

	// Create state manager
	const stateManager = disposables.add(new SessionStateManager(logService));

	// Agent registry — maps provider id to agent instance
	const agents = new Map<AgentProvider, IAgent>();

	// Observable agents list for root state
	const registeredAgents = observableValue<readonly IAgent[]>('agents', []);

	// File service
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));

	// Session data service
	const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);

	// Shared side-effect handler
	const sideEffects = disposables.add(new AgentSideEffects(stateManager, {
		getAgent(session) {
			const provider = AgentSession.provider(session);
			return provider ? agents.get(provider) : agents.values().next().value;
		},
		agents: registeredAgents,
		sessionDataService,
	}, logService, fileService));

	function registerAgent(agent: IAgent): void {
		agents.set(agent.id, agent);
		disposables.add(sideEffects.registerProgressListener(agent));
		registeredAgents.set([...agents.values()], undefined);
		logService.info(`[AgentHostServer] Registered agent: ${agent.id}`);
	}

	// Register agents
	if (!options.quiet) {
		// Production agents (require DI)
		const diServices = new ServiceCollection();
		diServices.set(IProductService, productService);
		diServices.set(INativeEnvironmentService, environmentService);
		diServices.set(ILogService, logService);
		diServices.set(IFileService, fileService);
		diServices.set(ISessionDataService, sessionDataService);
		const instantiationService = new InstantiationService(diServices);
		const copilotAgent = disposables.add(instantiationService.createInstance(CopilotAgent));
		registerAgent(copilotAgent);
		log('CopilotAgent registered');
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
	const wsServer = disposables.add(await WebSocketProtocolServer.create({
		port: options.port,
		connectionTokenValidate: options.connectionToken
			? token => token === options.connectionToken
			: undefined,
	}, logService));

	// Wire up protocol handler
	disposables.add(new ProtocolServerHandler(stateManager, wsServer, sideEffects, logService));

	// Report ready
	function reportReady(addr: string): void {
		const listeningPort = addr.split(':').pop();
		let wsUrl = `ws://${addr}`;
		if (options.connectionToken) {
			wsUrl += `?tkn=${options.connectionToken}`;
		}
		process.stdout.write(`READY:${listeningPort}\n`);
		log(`WebSocket server listening on ${wsUrl}`);
		logService.info(`[AgentHostServer] WebSocket server listening on ${wsUrl}`);
	}

	const address = wsServer.address;
	if (address) {
		reportReady(address);
	} else {
		const interval = setInterval(() => {
			const addr = wsServer.address;
			if (addr) {
				clearInterval(interval);
				reportReady(addr);
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
