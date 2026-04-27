/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Standalone agent host server with WebSocket protocol transport.
// Start with: node out/vs/platform/agentHost/node/agentHostServerMain.js [--port <port>] [--host <host>] [--connection-token <token>] [--connection-token-file <path>] [--without-connection-token] [--enable-mock-agent] [--quiet] [--log <level>]

import { fileURLToPath } from 'url';

// This standalone process isn't bootstrapped via bootstrap-esm.ts, so we must
// set _VSCODE_FILE_ROOT ourselves so that FileAccess can resolve module paths.
// This file lives at out/vs/platform/agentHost/node/ - the root is `out/`.
globalThis._VSCODE_FILE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

import * as fs from 'fs';
import * as os from 'os';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { raceTimeout } from '../../../base/common/async.js';
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
import { AgentService } from './agentService.js';
import { IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { ProtocolServerHandler } from './protocolServerHandler.js';
import { FileService } from '../../files/common/fileService.js';
import { IFileService } from '../../files/common/files.js';
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../base/common/network.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { SessionDataService } from './sessionDataService.js';
import { AgentHostClientFileSystemProvider } from '../common/agentHostClientFileSystemProvider.js';
import { AGENT_CLIENT_SCHEME } from '../common/agentClientUri.js';
import { resolveServerUrls } from './serverUrls.js';
import { AgentPluginManager } from './agentPluginManager.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { registerPendingEditContentProvider } from './copilot/pendingEditContentStore.js';
import { AgentHostGitService, IAgentHostGitService } from './agentHostGitService.js';

/** Log to stderr so messages appear in the terminal alongside the process. */
function log(msg: string): void {
	process.stderr.write(`[AgentHostServer] ${msg}\n`);
}

// ---- Options ----------------------------------------------------------------

const connectionTokenRegex = /^[0-9A-Za-z_-]+$/;

interface IServerOptions {
	readonly port: number;
	readonly host: string | undefined;
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
	const hostIdx = argv.indexOf('--host');
	const host = hostIdx >= 0 ? argv[hostIdx + 1] : undefined;
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

	return { port, host, enableMockAgent, quiet, connectionToken };
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

	// File service
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
	// In-memory filesystem backing transient file-edit previews shown during
	// tool-call confirmations.
	disposables.add(registerPendingEditContentProvider(fileService));

	// Session data service
	const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);

	// Build the DI container early so the git service can be created via
	// `createInstance` (it needs IFileService + INativeEnvironmentService).
	// The git service is shared by AgentService (for diff computation +
	// showBlob) and the production agent registration path.
	const diServices = new ServiceCollection();
	diServices.set(IProductService, productService);
	diServices.set(INativeEnvironmentService, environmentService);
	diServices.set(ILogService, logService);
	diServices.set(IFileService, fileService);
	diServices.set(ISessionDataService, sessionDataService);
	const instantiationService = new InstantiationService(diServices);
	const gitService = instantiationService.createInstance(AgentHostGitService);

	// Create the agent service (owns AgentHostStateManager + AgentSideEffects internally)
	const agentService = new AgentService(logService, fileService, sessionDataService, productService, gitService);
	disposables.add(agentService);

	// Register agents
	if (!options.quiet) {
		// Production agents (require DI)
		const pluginManager = new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService);
		diServices.set(IAgentPluginManager, pluginManager);
		diServices.set(IDiffComputeService, disposables.add(new NodeWorkerDiffComputeService(logService)));
		diServices.set(IAgentHostTerminalManager, agentService.terminalManager);
		diServices.set(IAgentHostGitService, gitService);
		const copilotAgent = disposables.add(instantiationService.createInstance(CopilotAgent));
		agentService.registerProvider(copilotAgent);
		log('CopilotAgent registered');
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
	const wsServer = disposables.add(await WebSocketProtocolServer.create({
		port: options.port,
		host: options.host,
		connectionTokenValidate: options.connectionToken
			? token => token === options.connectionToken
			: undefined,
	}, logService));


	const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
	disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));

	// Wire up protocol handler
	disposables.add(new ProtocolServerHandler(
		agentService,
		agentService.stateManager,
		wsServer,
		{ defaultDirectory: URI.file(os.homedir()).toString() },
		clientFileSystemProvider,
		logService,
	));

	// Report ready
	function reportReady(addr: string): void {
		const listeningPort = Number(addr.split(':').pop());
		process.stdout.write(`READY:${listeningPort}\n`);

		const urls = resolveServerUrls(options.host, listeningPort);
		for (const url of urls.local) {
			log(`  Local:   ${url}`);
			logService.info(`[AgentHostServer] Local:   ${url}`);
		}
		for (const url of urls.network) {
			log(`  Network: ${url}`);
			logService.info(`[AgentHostServer] Network: ${url}`);
		}
		if (urls.network.length === 0 && options.host === undefined) {
			log('  Network: use --host to expose');
			logService.info('[AgentHostServer] Network: use --host to expose');
		}
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
	process.stdin.on('end', () => { void shutdown(); });
	process.on('SIGTERM', () => { void shutdown(); });
	process.on('SIGINT', () => { void shutdown(); });

	let shuttingDown = false;
	async function shutdown(): Promise<void> {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		logService.info('[AgentHostServer] Shutting down...');
		// Close the WebSocket server first so no further actions can be
		// dispatched while we wait for in-flight writes to flush — otherwise
		// a late-arriving action could keep queuing DB writes and either
		// undermine the flush or push us past the timeout.
		wsServer.dispose();
		// Wait for in-flight persistence writes to flush to the per-session
		// SQLite databases. Without this, a SIGTERM arriving while a
		// `setMetadata` write (configValues, customTitle, isRead, isDone,
		// diffs) is in flight can drop the latest value — see the
		// "Session Config persistence across restarts" integration test.
		// Capped so a stuck write cannot hang shutdown indefinitely.
		await raceTimeout(sessionDataService.whenIdle(), 3000, () => {
			logService.warn('[AgentHostServer] Timed out waiting for session database writes to flush; exiting anyway.');
		});
		disposables.dispose();
		loggerService?.dispose();
		process.exit(0);
	}
}

main();
