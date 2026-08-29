/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Standalone agent host server with WebSocket protocol transport.
// Start with: node out/vs/platform/agentHost/node/agentHostServerMain.js [--port <port>] [--host <host>] [--connection-token <token>] [--connection-token-file <path>] [--without-connection-token] [--enable-mock-agent] [--claude-sdk-root <path>] [--codex-sdk-root <path>] [--quiet] [--log <level>]

import { fileURLToPath } from 'url';

// This standalone process isn't bootstrapped via bootstrap-esm.ts, so we must
// set _VSCODE_FILE_ROOT ourselves so that FileAccess can resolve module paths.
// This file lives at out/vs/platform/agentHost/node/ - the root is `out/`.
globalThis._VSCODE_FILE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

import * as fs from 'fs';
import * as os from 'os';
import type { Event } from '../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { parseArgs, OPTIONS } from '../../environment/node/argv.js';
import { IFileService } from '../../files/common/files.js';
import { getLogLevel, ILogService } from '../../log/common/log.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import { OtlpEmitterLogger, OtlpLogEmitter } from '../common/otlp/otlpLogEmitter.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { flushAgentHostPersistenceBeforeShutdown } from './agentHostShutdown.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { createAgentHostRuntime } from './agentHostBootstrap.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { IAgentHostCustomizationEnablementService } from './agentHostCustomizationEnablementService.js';
import { IAgentHostStateManager } from './agentHostStateManager.js';
import { BANG_COMMAND_PREFIX } from './agentHostBangCommand.js';
import { CopilotAgent } from './copilot/copilotAgent.js';
import { ClaudeAgent } from './claude/claudeAgent.js';
import { ClaudeSdkPackage } from './claude/claudeAgentSdkService.js';
import { CodexAgent, CodexSdkPackage } from './codex/codexAgent.js';
import { createCodexProviderConfiguration } from './codex/codexProviderConfiguration.js';
import { IAgentSdkDownloader, type IAgentSdkDownloadProgress } from './agentSdkDownloader.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostCodexEnabledConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentModelRefreshScheduler, MODEL_REFRESH_INTERVAL_MS } from './agentModelRefreshScheduler.js';
import { AgentHostClaudeAgentEnabledEnvVar, AgentHostClaudeSdkRootEnvVar, AgentHostCodexAgentEnabledEnvVar, AgentHostCodexAgentSdkRootEnvVar, isAgentEnabled } from '../common/agentService.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { ProtocolServerHandler } from './protocolServerHandler.js';
import { AgentHostClientFileSystemProvider } from '../common/agentHostClientFileSystemProvider.js';
import { AGENT_CLIENT_SCHEME } from '../common/agentClientUri.js';
import { resolveServerUrls } from './serverUrls.js';
import ErrorTelemetry from '../../telemetry/node/errorTelemetry.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import { ISessionDataService } from '../common/sessionDataService.js';

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
	/**
	 * Absolute path to the **SDK root directory** that contains
	 * `node_modules/@anthropic-ai/claude-agent-sdk`. Acts as the dev override
	 * for the Claude agent; empty falls through to `product.agentSdks.claude`.
	 */
	readonly claudeSdkRoot: string;
	/**
	 * Absolute path to the **SDK root directory** that contains
	 * `node_modules/@openai/codex`. Acts as the dev override for the Codex
	 * agent; empty falls through to `product.agentSdks.codex`.
	 */
	readonly codexSdkRoot: string;
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
	// `--claude-sdk-root` and `--codex-sdk-root` are dev overrides — they
	// short-circuit the on-demand download from `product.agentSdks`. They must
	// point at an SDK ROOT DIRECTORY (the parent of `node_modules/`), not the
	// package directory or the binary file itself. Required in air-gapped
	// deployments where the CDN is unreachable AND no product config is
	// present; in those environments, set one of these flags or the matching
	// env var, otherwise the corresponding provider will not register.
	const claudeSdkRootIdx = argv.indexOf('--claude-sdk-root');
	const claudeSdkRoot = (claudeSdkRootIdx >= 0 ? argv[claudeSdkRootIdx + 1] : process.env[AgentHostClaudeSdkRootEnvVar]) ?? '';
	const codexSdkRootIdx = argv.indexOf('--codex-sdk-root');
	const codexSdkRoot = (codexSdkRootIdx >= 0 ? argv[codexSdkRootIdx + 1] : process.env[AgentHostCodexAgentSdkRootEnvVar]) ?? '';
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

	return { port, host, enableMockAgent, claudeSdkRoot, codexSdkRoot, quiet, connectionToken };
}

// ---- Main -------------------------------------------------------------------

async function main(): Promise<void> {
	const options = parseServerOptions();
	const disposables = new DisposableStore();
	const errorTelemetry = disposables.add(new MutableDisposable<ErrorTelemetry>());

	// Services
	const productService: IProductService = { _serviceBrand: undefined, ...product };
	const args = parseArgs(process.argv.slice(2), OPTIONS);
	const environmentService = new NativeEnvironmentService(args, productService);

	// Logging — production logging unless --quiet
	let logService: ILogService;
	let loggerService: LoggerService | undefined;
	// Shared by every ProtocolServerHandler this process spawns. Always
	// created (cost is negligible) so that the OTLP logs channel is
	// available even in `--quiet` mode where there is no file logger.
	const otlpLogEmitter = disposables.add(new OtlpLogEmitter());
	const otlpLogger = disposables.add(new OtlpEmitterLogger(otlpLogEmitter));

	if (options.quiet) {
		logService = disposables.add(new LogService(otlpLogger));
	} else {
		loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
		const logger = loggerService.createLogger('agenthost-server', { name: localize('agentHostServer', "Agent Host Server") });
		logService = disposables.add(new LogService(logger, [otlpLogger]));
		log('Starting standalone agent host server');
	}

	logService.info('[AgentHostServer] Starting standalone agent host server');

	if (!options.quiet) {
		if (options.claudeSdkRoot) {
			process.env[AgentHostClaudeSdkRootEnvVar] = options.claudeSdkRoot;
		}
		if (options.codexSdkRoot) {
			process.env[AgentHostCodexAgentSdkRootEnvVar] = options.codexSdkRoot;
		}
	}

	const runtime = await createAgentHostRuntime({
		environmentService,
		productService,
		logService,
		loggerService,
		disableTelemetry: options.quiet,
		transientProxyConfiguration: false,
		hostLaunchKind: AgentHostLaunchKind.VSCodeCLI,
		providerConfigurations: [createCodexProviderConfiguration(environmentService.userHome)],
		byok: { kind: 'unavailable' },
	});
	disposables.add(runtime);
	const { agentService, instantiationService } = runtime;
	const runtimeServices = instantiationService.invokeFunction(accessor => ({
		configurationService: accessor.get(IAgentConfigurationService),
		fileService: accessor.get(IFileService),
		sessionDataService: accessor.get(ISessionDataService),
		telemetryService: accessor.get(ITelemetryService),
		agentSdkDownloader: accessor.get(IAgentSdkDownloader),
		providerService: accessor.get(IAgentHostProviderService),
		stateManager: accessor.get(IAgentHostStateManager),
		completions: accessor.get(IAgentHostCompletions),
		customizationEnablementService: accessor.get(IAgentHostCustomizationEnablementService),
	}));
	const {
		configurationService: agentConfigurationService,
		fileService,
		sessionDataService,
		agentSdkDownloader,
		providerService,
		stateManager,
		completions,
		customizationEnablementService,
	} = runtimeServices;
	errorTelemetry.value = new ErrorTelemetry(runtimeServices.telemetryService);

	// Register agents
	let sdkDownloadProgress: Event<IAgentSdkDownloadProgress> | undefined;
	if (!options.quiet) {
		sdkDownloadProgress = runtime.sdkDownloadProgress;
		providerService.registerProvider(instantiationService.createInstance(CopilotAgent));
		log('CopilotAgent registered');
		// Claude and Codex providers are gated on two things:
		//  1. The user-facing enable toggle (`chat.agentHost.<x>Agent.enabled`,
		//     forwarded as an env var by the renderer-side starters; the remote
		//     server reads the env directly). Claude defaults to on, Codex
		//     defaults to off.
		//  2. The SDK being reachable. Claude is a devDependency of this repo
		//     so the bare-import path in `ClaudeAgentSdkService._loadSdk`
		//     always succeeds in dev; in built/shipped server installs the
		//     SDK comes from the CLI flag / env var dev override or a
		//     `product.agentSdks.claude` entry. Codex is likewise a
		//     devDependency, so `CodexAgent._resolveSdkRoot` resolves it from
		//     `node_modules` in dev; built/shipped installs use the env-var
		//     override or `product.agentSdks.codex`.
		if (isAgentEnabled(process.env[AgentHostClaudeAgentEnabledEnvVar], true) && (!environmentService.isBuilt || agentSdkDownloader.isAvailable(ClaudeSdkPackage))) {
			providerService.registerProvider(instantiationService.createInstance(ClaudeAgent));
			log('ClaudeAgent registered');
		}
		if (!environmentService.isBuilt || agentSdkDownloader.isAvailable(CodexSdkPackage)) {
			let codexRegistered = false;
			const registerCodexIfEnabled = () => {
				if (codexRegistered) {
					return;
				}
				const enabledByEnv = isAgentEnabled(process.env[AgentHostCodexAgentEnabledEnvVar], false);
				const enabledByRootConfig = agentConfigurationService.getRootValue(platformRootSchema, AgentHostCodexEnabledConfigKey) === true;
				if (enabledByEnv || enabledByRootConfig) {
					codexRegistered = true;
					providerService.registerProvider(instantiationService.createInstance(CodexAgent));
					log('CodexAgent registered');
				}
			};
			registerCodexIfEnabled();
			disposables.add(agentConfigurationService.onDidRootConfigChange(() => registerCodexIfEnabled()));
		}
	}

	// Surface agent-SDK download progress to clients as generic `progress`
	// notifications. The downloader fires process-global frames keyed by package
	// id; the agent service surfaces frames requested by a waiting session or
	// another user-initiated flow, routed through the state manager so both local
	// (IPC) and remote (WebSocket) renderers receive them via the same path as
	// session updates.
	if (sdkDownloadProgress) {
		disposables.add(sdkDownloadProgress(p => agentService.emitDownloadProgress(
			p.packageId,
			p.displayName,
			p.receivedBytes,
			p.totalBytes,
			p.phase === 'completed' || p.phase === 'failed',
			p.explicitlyRequested,
		)));
	}

	if (options.enableMockAgent) {
		// Dynamic import to avoid bundling test code in production
		import('../test/node/mockAgent.js').then(({ ScriptedMockAgent }) => {
			providerService.registerProvider(new ScriptedMockAgent());
		}).catch(err => {
			logService.error('[AgentHostServer] Failed to load mock agent', err);
		});
	}

	// Keep every provider's model catalog fresh. Provider-owned refresh
	// triggers (authentication, transport flips, client restarts) are all
	// edge-based, so this periodic tick is the only thing that notices a model
	// added service-side while the host stays up. Owned here, at process
	// lifetime, rather than inside `AgentHostService`: a service that arms a
	// recurring timer in its constructor is one that no faked-timer unit test
	// can ever drain.
	disposables.add(instantiationService.createInstance(AgentModelRefreshScheduler, runtime.agents, runtime.onDidStartTurn, MODEL_REFRESH_INTERVAL_MS));

	// WebSocket server
	const wsServer = disposables.add(await WebSocketProtocolServer.create({
		port: options.port,
		host: options.host,
		connectionTokenValidate: options.connectionToken
			? token => token === options.connectionToken
			: undefined,
	}, logService, { instantiationService, logsHome: environmentService.logsHome }));


	const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
	disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));
	// Wire up protocol handler
	disposables.add(instantiationService.createInstance(
		ProtocolServerHandler,
		agentService,
		stateManager,
		wsServer,
		{
			hostLaunchKind: AgentHostLaunchKind.VSCodeCLI,
			defaultDirectory: URI.file(os.homedir()).toString(),
			completionTriggerCharacters: completions.triggerCharacters,
			terminalCommandPrefix: BANG_COMMAND_PREFIX,
			otlpLogEmitter,
		},
		clientFileSystemProvider,
	));

	// Report ready
	function reportReady(addr: string): void {
		const listeningPort = Number(addr.split(':').pop());
		process.stdout.write(`READY:${listeningPort}\n`);
		agentService.markStartupComplete();

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
		// Wait for in-flight persistence writes to flush. Without this, a
		// SIGTERM arriving during a session or agent-host storage write can
		// drop the latest decision.
		// Capped so a stuck write cannot hang shutdown indefinitely.
		await flushAgentHostPersistenceBeforeShutdown(
			[sessionDataService.whenIdle(), customizationEnablementService.whenIdle()],
			3000,
			logService,
		);
		disposables.dispose();
		loggerService?.dispose();
		process.exit(0);
	}
}

main();
