/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Server as ChildProcessServer } from '../../../base/parts/ipc/node/ipc.cp.js';
import { Server as UtilityProcessServer } from '../../../base/parts/ipc/node/ipc.mp.js';
import { isUtilityProcess } from '../../../base/parts/sandbox/node/electronTypes.js';
import { Emitter, type Event } from '../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as os from 'os';
import * as inspector from 'inspector';
import { AgentHostByokModelsEnabledEnvVar, AgentHostClaudeAgentEnabledEnvVar, AgentHostCodexAgentEnabledEnvVar, AgentHostIpcChannels, IAgentHostInspectInfo, IAgentHostSocketInfo, IAgentService, IConnectionTrackerService, isAgentEnabled } from '../common/agentService.js';
import { AgentHostCodexEnabledConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentService } from './agentService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { IAgentHostTerminalManager } from './agentHostTerminalManager.js';
import { CopilotAgent } from './copilot/copilotAgent.js';
import { CopilotBranchNameGenerator, ICopilotBranchNameGenerator } from './copilot/copilotBranchNameGenerator.js';
import { CopilotApiService, ICopilotApiService } from './shared/copilotApiService.js';
import { ClaudeAgent } from './claude/claudeAgent.js';
import { ClaudeAgentSdkService, ClaudeSdkPackage, IClaudeAgentSdkService } from './claude/claudeAgentSdkService.js';
import { ClaudeProxyService, IClaudeProxyService } from './claude/claudeProxyService.js';
import { CodexAgent, CodexSdkPackage } from './codex/codexAgent.js';
import { CodexProxyService, ICodexProxyService } from './codex/codexProxyService.js';
import { ByokLmProxyService, IByokLmProxyService } from './copilot/byokLmProxyService.js';
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from './byokLmBridgeRegistry.js';
import { AgentHostProxyResolver, IAgentHostProxyResolver } from './agentHostProxyResolver.js';
import { AgentSdkDownloader, IAgentSdkDownloader, type IAgentSdkDownloadProgress } from './agentSdkDownloader.js';
import { IAgentHostOTelService } from '../common/otel/agentHostOTelService.js';
import { AgentHostOTelService } from './otel/agentHostOTelService.js';
import { ProtocolServerHandler } from './protocolServerHandler.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { parseArgs, OPTIONS } from '../../environment/node/argv.js';
import { getLogLevel, ILogService, isDevConsoleLogForwardingEnabled, registerDevConsoleLogForwarder } from '../../log/common/log.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import { LoggerChannel } from '../../log/common/logIpc.js';
import { OtlpEmitterLogger, OtlpLogEmitter } from '../common/otlp/otlpLogEmitter.js';
import { DefaultURITransformer } from '../../../base/common/uriIpc.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { localize } from '../../../nls.js';
import { FileService } from '../../files/common/fileService.js';
import { IFileService } from '../../files/common/files.js';
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../base/common/network.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { registerAgentHostNetworkServices } from './agentHostBootstrap.js';
import { BANG_COMMAND_PREFIX } from './agentHostBangCommand.js';
import { SessionDataService } from './sessionDataService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from '../../sandbox/common/terminalSandboxMxcRuntime.js';
import { ISandboxHelperService } from '../../sandbox/common/sandboxHelperService.js';
import { SandboxHelperService } from '../../sandbox/node/sandboxHelper.js';
import { IDiffComputeService } from '../common/diffComputeService.js';
import { NodeWorkerDiffComputeService } from './diffComputeService.js';
import { IEditSurvivalReporterFactory, EditSurvivalReporterFactory } from './shared/editSurvivalReporter.js';
import { AgentHostClientFileSystemProvider } from '../common/agentHostClientFileSystemProvider.js';
import { AGENT_CLIENT_SCHEME } from '../common/agentClientUri.js';
import { AGENT_HOST_CLIENT_RESOURCE_CHANNEL, createAgentHostClientResourceConnection } from '../common/agentHostClientResourceChannel.js';
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, createAgentHostClientByokLmConnection } from '../common/agentHostClientByokLmChannel.js';
import { AGENT_HOST_CLIENT_PROXY_CHANNEL, createAgentHostClientProxyConnection } from '../common/agentHostClientProxyChannel.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { AgentPluginManager } from './agentPluginManager.js';
import { AgentHostGitService } from './agentHostGitService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentHostCheckpointService } from './agentHostCheckpointService.js';
import { IAgentHostCheckpointService } from '../common/agentHostCheckpointService.js';
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from './agentHostFileMonitorService.js';
import { registerPendingEditContentProvider } from './copilot/pendingEditContentStore.js';
import { join } from '../../../base/common/path.js';
import { createAgentHostTelemetryService } from './agentHostTelemetryService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

// Entry point for the agent host utility process.
// Sets up IPC, logging, and registers agent providers (Copilot).
// When VSCODE_AGENT_HOST_PORT or VSCODE_AGENT_HOST_SOCKET_PATH env vars
// are set, also starts a WebSocket server for external clients.

void startAgentHost().catch(err => {
	console.error(err);
	process.exit(1);
});

async function startAgentHost(): Promise<void> {
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
	// OTLP log fan-out: any consumer that subscribes to the host's
	// `ahp-otlp://logs/{level}` channel will receive every log record this
	// `ILogService` produces, in addition to the regular file logger. The
	// emitter is created here so it can be shared by every protocol
	// handler instantiated below.
	const otlpLogEmitter = disposables.add(new OtlpLogEmitter());
	const otlpLogger = disposables.add(new OtlpEmitterLogger(otlpLogEmitter));
	const logService = new LogService(logger, [otlpLogger]);
	if (!environmentService.isBuilt && isDevConsoleLogForwardingEnabled) {
		disposables.add(registerDevConsoleLogForwarder(logService));
	}
	logService.info('Agent Host process started successfully');

	// File service
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
	// In-memory filesystem backing transient file-edit previews shown during
	// tool-call confirmations.
	disposables.add(registerPendingEditContentProvider(fileService));

	// Session data service
	const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);
	const rootConfigResource = joinPath(environmentService.appSettingsHome, 'globalStorage', 'agent-host-config.json');
	const telemetryService = await createAgentHostTelemetryService({ environmentService, productService, fileService, loggerService, logService, disposables });

	// Create the real service implementation that lives in this process
	let agentService: AgentService;
	let instantiationService: IInstantiationService;
	// Hoisted out of the `try` below so the protocol handlers (constructed
	// after the block) can forward agent-SDK download progress to clients.
	let sdkDownloadProgress: Event<IAgentSdkDownloadProgress> | undefined;
	let byokLmBridgeRegistry: ByokLmBridgeRegistry;
	let proxyResolver: AgentHostProxyResolver | undefined;
	// Gate BYOK *use* behind the opt-in `chat.agentHost.byokModels.enabled`
	// setting, forwarded from the renderer as an env var. The proxy and bridge
	// registry are always constructed below (so the session launcher can inject
	// them), but when off they stay inert: the per-connection bridge and the
	// renderer's BYOK server channel are not wired, so the registry stays empty
	// and the proxy never binds.
	const byokLmEnabled = isAgentEnabled(process.env[AgentHostByokModelsEnabledEnvVar], true);
	try {
		// Build the DI container early so the git service can be created via
		// `createInstance` (it needs IFileService + INativeEnvironmentService).
		const diServices = new ServiceCollection();
		diServices.set(INativeEnvironmentService, environmentService);
		diServices.set(ILogService, logService);
		diServices.set(IFileService, fileService);
		diServices.set(ISessionDataService, sessionDataService);
		diServices.set(IProductService, productService);
		diServices.set(ITelemetryService, telemetryService);
		// Wire `IPolicyService` + `IConfigurationService` + `IRequestService`
		// — the trio that `IAgentSdkDownloader` depends on for proxy-aware
		// downloads. Must run before any downstream service that injects them.
		await registerAgentHostNetworkServices(diServices, fileService, environmentService, logService, disposables);
		instantiationService = new InstantiationService(diServices);
		const fileMonitorService = disposables.add(instantiationService.createInstance(AgentHostFileMonitorService));
		diServices.set(IAgentHostFileMonitorService, fileMonitorService);
		diServices.set(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
		diServices.set(ISandboxHelperService, new SandboxHelperService());
		const gitService = instantiationService.createInstance(AgentHostGitService);
		diServices.set(IAgentHostGitService, gitService);
		// Checkpoint service depends on session data + git services, so
		// construct it AFTER both are registered. Consumed by CopilotAgent
		// (baseline capture) and AgentService's inner DI (changeset
		// pipeline / end-of-turn capture).
		const checkpointService = disposables.add(instantiationService.createInstance(AgentHostCheckpointService));
		diServices.set(IAgentHostCheckpointService, checkpointService);
		// Register the agent SDK downloader BEFORE any service that injects it
		// (ClaudeAgentSdkService and CodexAgent below). The downloader resolves
		// dev-override env var → on-disk cache → product.agentSdks download.
		const agentSdkDownloader = disposables.add(instantiationService.createInstance(AgentSdkDownloader));
		diServices.set(IAgentSdkDownloader, agentSdkDownloader);
		sdkDownloadProgress = agentSdkDownloader.onDidDownloadProgress;
		const claudeAgentSdkService = instantiationService.createInstance(ClaudeAgentSdkService);
		diServices.set(IClaudeAgentSdkService, claudeAgentSdkService);
		// BYOK language-model proxy + bridge registry. Always registered so the
		// session launcher can inject them, but BYOK *use* is gated: the
		// per-connection bridge below (and the renderer's server channel) are only
		// wired when `chat.agentHost.byokModels.enabled` is on, so the registry
		// stays empty and the proxy never binds when the feature is off.
		byokLmBridgeRegistry = new ByokLmBridgeRegistry();
		diServices.set(IByokLmBridgeRegistry, byokLmBridgeRegistry);
		proxyResolver = instantiationService.createInstance(AgentHostProxyResolver);
		diServices.set(IAgentHostProxyResolver, proxyResolver);
		const byokLmProxyService = disposables.add(instantiationService.createInstance(ByokLmProxyService));
		diServices.set(IByokLmProxyService, byokLmProxyService);
		const agentHostOTelService = disposables.add(instantiationService.createInstance(AgentHostOTelService));
		diServices.set(IAgentHostOTelService, agentHostOTelService);
		agentService = new AgentService(logService, fileService, sessionDataService, productService, gitService, checkpointService, rootConfigResource, telemetryService, fileMonitorService, undefined);
		diServices.set(IAgentService, agentService);
		const pluginManager = new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService);
		diServices.set(IAgentPluginManager, pluginManager);
		const diffComputeService = disposables.add(new NodeWorkerDiffComputeService(logService));
		diServices.set(IDiffComputeService, diffComputeService);
		diServices.set(IEditSurvivalReporterFactory, instantiationService.createInstance(EditSurvivalReporterFactory));

		diServices.set(IAgentHostTerminalManager, agentService.terminalManager);
		diServices.set(IAgentConfigurationService, agentService.configurationService);
		diServices.set(IAgentHostGitHubEndpointService, agentService.gitHubEndpointService);
		diServices.set(IAgentHostCompletions, agentService.completionsService);

		// CopilotApiService and the proxies that consume it are created AFTER the
		// GitHub endpoint service is re-exported (above) so CAPI endpoint discovery
		// can target a GitHub Enterprise host. Matches agentHostServerMain ordering.
		const copilotApiService = instantiationService.createInstance(CopilotApiService, undefined);
		diServices.set(ICopilotApiService, copilotApiService);
		diServices.set(ICopilotBranchNameGenerator, instantiationService.createInstance(CopilotBranchNameGenerator));
		const claudeProxyService = disposables.add(instantiationService.createInstance(ClaudeProxyService));
		diServices.set(IClaudeProxyService, claudeProxyService);
		const codexProxyService = disposables.add(instantiationService.createInstance(CodexProxyService));
		diServices.set(ICodexProxyService, codexProxyService);
		agentService.registerProvider(instantiationService.createInstance(CopilotAgent));
		// Claude and Codex providers are gated on two things:
		//  1. The user-facing enable toggle (`chat.agentHost.<x>Agent.enabled`,
		//     forwarded as an env var by the starters). Claude defaults to on,
		//     Codex defaults to off.
		//  2. The SDK being reachable. Claude is a devDependency of this repo
		//     so the bare-import path in `ClaudeAgentSdkService._loadSdk`
		//     always succeeds in dev; in built products the SDK ships via
		//     `product.agentSdks.claude` and the downloader handles it. Codex
		//     is likewise a devDependency, so `CodexAgent._resolveSdkRoot`
		//     resolves it from `node_modules` in dev; built products use the
		//     env-var override or a `product.agentSdks.codex` entry.
		// If either gate fails, the provider is not registered and never appears
		// in the agent picker (matches the pre-CDN UX exactly).
		if (isAgentEnabled(process.env[AgentHostClaudeAgentEnabledEnvVar], true) && (!environmentService.isBuilt || agentSdkDownloader.isAvailable(ClaudeSdkPackage))) {
			agentService.registerProvider(instantiationService.createInstance(ClaudeAgent));
		}
		// Codex registration is one-way (register-on-enable): the env-var toggle
		// or the renderer-forwarded `codexAgentEnabled` root config enables it.
		// Disabling requires an agent host restart.
		if (!environmentService.isBuilt || agentSdkDownloader.isAvailable(CodexSdkPackage)) {
			const agentConfigurationService = agentService.configurationService;
			let codexRegistered = false;
			const registerCodexIfEnabled = () => {
				if (codexRegistered) {
					return;
				}
				const enabledByEnv = isAgentEnabled(process.env[AgentHostCodexAgentEnabledEnvVar], false);
				const enabledByRootConfig = agentConfigurationService.getRootValue(platformRootSchema, AgentHostCodexEnabledConfigKey) === true;
				if (enabledByEnv || enabledByRootConfig) {
					codexRegistered = true;
					agentService.registerProvider(instantiationService.createInstance(CodexAgent));
				}
			};
			registerCodexIfEnabled();
			disposables.add(agentConfigurationService.onDidRootConfigChange(() => registerCodexIfEnabled()));
		}
	} catch (err) {
		logService.error('Failed to create AgentService', err);
		throw err;
	}

	// Surface agent-SDK download progress to clients as generic `progress`
	// notifications. The downloader fires process-global frames keyed by package
	// id; the agent service fans each out to the `createSession` progress tokens
	// of the sessions waiting on that provider's SDK, routed through the state
	// manager so both the local (IPC) and any external (WebSocket) renderer
	// receive them via the same path as session updates.
	if (sdkDownloadProgress) {
		disposables.add(sdkDownloadProgress(p => agentService.emitDownloadProgress(
			p.packageId,
			p.displayName,
			p.receivedBytes,
			p.totalBytes,
			p.phase === 'completed' || p.phase === 'failed',
		)));
	}

	const agentChannel = ProxyChannel.fromService(agentService, disposables);
	server.registerChannel(AgentHostIpcChannels.AgentHost, agentChannel);

	// Single shared `vscode-agent-client` filesystem provider. Per-client
	// authorities are added either by ProtocolServerHandler (for WebSocket
	// transports) or by the IPC connection lifecycle below (for the local
	// in-process renderer-to-utility-process MessagePort transport).
	const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
	disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));

	// Wire reverse-RPC for in-process renderer connections. The renderer's
	// `MessagePortClient` ctx is its `clientId`, and it exposes the
	// `AGENT_HOST_CLIENT_RESOURCE_CHANNEL` (filesystem reads) and
	// `AGENT_HOST_CLIENT_BYOK_LM_CHANNEL` (BYOK language-model calls).
	if (server instanceof UtilityProcessServer) {
		const authorityRegistrations = new Map<unknown, IDisposable>();
		const registerConnection = (connection: (typeof server.connections)[number]) => {
			if (authorityRegistrations.has(connection)) {
				return;
			}
			const clientId = connection.ctx;
			if (typeof clientId !== 'string' || !clientId) {
				return;
			}
			const connectionStore = new DisposableStore();
			const getChannel = (channelName: string) => server.getChannel(channelName, c => c.ctx === clientId);
			const fsConnection = createAgentHostClientResourceConnection(getChannel(AGENT_HOST_CLIENT_RESOURCE_CHANNEL));
			connectionStore.add(clientFileSystemProvider.registerAuthority(clientId, fsConnection));
			const proxyConnection = createAgentHostClientProxyConnection(getChannel(AGENT_HOST_CLIENT_PROXY_CHANNEL));
			connectionStore.add(proxyResolver.register(clientId, proxyConnection));
			// BYOK bridge is gated: only wire it when the feature is enabled, so
			// the registry stays empty (and the launcher synthesizes no BYOK
			// providers/models) when `chat.agentHost.byokModels.enabled` is off.
			if (byokLmEnabled && byokLmBridgeRegistry) {
				const byokLmConnection = createAgentHostClientByokLmConnection(getChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL));
				connectionStore.add(byokLmBridgeRegistry.register(clientId, byokLmConnection));
			}
			authorityRegistrations.set(connection, connectionStore);
		};
		disposables.add(server.onDidAddConnection(registerConnection));
		disposables.add(server.onDidRemoveConnection(connection => {
			const reg = authorityRegistrations.get(connection);
			if (reg) {
				reg.dispose();
				authorityRegistrations.delete(connection);
			}
		}));
		for (const connection of server.connections) {
			registerConnection(connection);
		}
	}

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
				{ instantiationService, logsHome: environmentService.logsHome },
			));

			const protocolHandler = disposables.add(new ProtocolServerHandler(
				agentService,
				agentService.stateManager,
				wsServer,
				{
					defaultDirectory: URI.file(os.homedir()).toString(),
					completionTriggerCharacters: agentService.completionTriggerCharacters,
					terminalCommandPrefix: BANG_COMMAND_PREFIX,
					otlpLogEmitter,
				},
				clientFileSystemProvider,
				logService,
			));
			disposables.add(protocolHandler.onDidChangeConnectionCount(count => connectionCountEmitter.fire(count)));

			logService.info(`[AgentHost] Dynamic WebSocket server listening on ${socketPath}`);
			dynamicSocketInfo = { socketPath };
			return dynamicSocketInfo;
		},
		async getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
			let url = inspector.url();
			if (!url && tryEnable) {
				try {
					inspector.open(0, '127.0.0.1', false);
				} catch (err) {
					logService.error('[AgentHost] Failed to open inspector', err);
					return undefined;
				}
				url = inspector.url();
			}
			if (!url) {
				return undefined;
			}
			// Inspector URL looks like: ws://host:port/uuid (host may be IPv6 in brackets)
			try {
				const parsedUrl = new URL(url);
				if (parsedUrl.protocol !== 'ws:') {
					logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
					return undefined;
				}

				const port = Number(parsedUrl.port);
				const auth = parsedUrl.pathname.replace(/^\/+/, '');
				if (!Number.isInteger(port) || !auth) {
					logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
					return undefined;
				}

				const host = parsedUrl.hostname === '0.0.0.0'
					? '127.0.0.1'
					: parsedUrl.hostname === '::'
						? '::1'
						: parsedUrl.hostname;
				const devtoolsHost = host.includes(':') ? `[${host}]` : host;

				return {
					host,
					port,
					devtoolsUrl: `devtools://devtools/bundled/js_app.html?v8only=true&ws=${devtoolsHost}:${parsedUrl.port}/${auth}`,
				};
			} catch {
				logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
				return undefined;
			}
		},
	};
	const connectionTrackerChannel = ProxyChannel.fromService(connectionTrackerService, disposables);
	server.registerChannel(AgentHostIpcChannels.ConnectionTracker, connectionTrackerChannel);

	// Start WebSocket server for external clients if configured (env-var flow for CLI/server)
	startWebSocketServer(
		agentService,
		clientFileSystemProvider,
		instantiationService,
		environmentService.logsHome,
		logService,
		otlpLogEmitter,
		disposables,
		count => connectionCountEmitter.fire(count),
	).catch(err => {
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
async function startWebSocketServer(
	agentService: AgentService,
	clientFileSystemProvider: AgentHostClientFileSystemProvider,
	instantiationService: IInstantiationService,
	logsHome: URI,
	logService: ILogService,
	otlpLogEmitter: OtlpLogEmitter,
	disposables: DisposableStore,
	onConnectionCountChanged: (count: number) => void,
): Promise<void> {
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
		{ instantiationService, logsHome },
	));

	const protocolHandler = disposables.add(new ProtocolServerHandler(
		agentService,
		agentService.stateManager,
		wsServer,
		{
			defaultDirectory: URI.file(os.homedir()).toString(),
			completionTriggerCharacters: agentService.completionTriggerCharacters,
			terminalCommandPrefix: BANG_COMMAND_PREFIX,
			otlpLogEmitter,
		},
		clientFileSystemProvider,
		logService,
	));
	disposables.add(protocolHandler.onDidChangeConnectionCount(onConnectionCountChanged));

	// Wait for the listener to actually bind before reporting readiness.
	// When the caller requested `port: 0` (let the OS pick), the bound
	// port is only known after this point — emitting the requested port
	// would print `localhost:0` and break the CLI's readiness parser.
	await wsServer.whenListening;
	const listenTarget = socketPath ?? `${host}:${wsServer.boundPort ?? port}`;
	logService.info(`[AgentHost] WebSocket server listening on ${listenTarget}`);
	// Do not change this line. The CLI looks for this in the output.
	console.log(`Agent host server listening on ${listenTarget}`);
}
