/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, type SessionConfig } from '@github/copilot-sdk';
import { rgPath } from '@vscode/ripgrep';
import * as fs from 'fs/promises';
import { Limiter, SequencerByKey } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileAccess } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/objects.js';
import { basename, delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IParsedPlugin, parsePlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentHostSessionConfigBranchNameHintKey, AgentSession, IAgent, IAgentAttachment, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo, IAgentSubagentStartedEvent, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { ISessionDataService, SESSION_DB_FILENAME } from '../../common/sessionDataService.js';
import type { IResolveSessionConfigResult, ISessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { IProtectedResourceMetadata, type IConfigSchema, type IModelSelection, type IToolDefinition } from '../../common/state/protocol/state.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { CustomizationStatus, ICustomizationRef, SessionInputResponseKind, type IPendingMessage, type ISessionInputAnswer, type IToolCallResult, type PolicyState } from '../../common/state/sessionState.js';
import { IAgentHostGitService } from '../agentHostGitService.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';
import { CopilotAgentSession, SessionWrapperFactory, type IActiveClientSnapshot } from './copilotAgentSession.js';
import { ICopilotSessionContext, projectFromCopilotContext } from './copilotGitProject.js';
import { parsedPluginsEqual, toSdkCustomAgents, toSdkHooks, toSdkMcpServers, toSdkSkillDirectories } from './copilotPluginConverters.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { createShellTools, ShellManager } from './copilotShellTools.js';

interface ICreatedWorktree {
	readonly repositoryRoot: URI;
	readonly worktree: URI;
}

const ThinkingLevelConfigKey = 'thinkingLevel';
const ReasoningEfforts = ['low', 'medium', 'high', 'xhigh'] as const;
type ReasoningEffort = NonNullable<SessionConfig['reasoningEffort']>;

interface ISerializedModelSelection {
	id?: unknown;
	config?: unknown;
}

function isReasoningEffort(value: string | undefined): value is ReasoningEffort {
	return ReasoningEfforts.some(reasoningEffort => reasoningEffort === value);
}

export function getCopilotWorktreesRoot(repositoryRoot: URI): URI {
	return URI.joinPath(repositoryRoot, '..', `${basename(repositoryRoot.fsPath)}.worktrees`);
}

export function getCopilotWorktreeName(branchName: string): string {
	return branchName.replace(/\//g, '-');
}

export function getCopilotWorktreeBranchName(sessionId: string, branchNameHint: string | undefined): string {
	return `agents/${branchNameHint ? `${branchNameHint}-${sessionId.substring(0, 8)}` : sessionId}`;
}

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilot' as const;
	private static readonly _BRANCH_COMPLETION_LIMIT = 25;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models = this._models;

	private _client: CopilotClient | undefined;
	private _clientStarting: Promise<CopilotClient> | undefined;
	private _githubToken: string | undefined;
	private readonly _sessions = this._register(new DisposableMap<string, CopilotAgentSession>());
	private readonly _createdWorktrees = new Map<string, ICreatedWorktree>();
	private readonly _sessionSequencer = new SequencerByKey<string>();
	private _shutdownPromise: Promise<void> | undefined;
	private readonly _plugins: PluginController;
	/** Per-session active client state for tools + plugin snapshot tracking. */
	private readonly _activeClients = new ResourceMap<ActiveClient>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostTerminalManager private readonly _terminalManager: IAgentHostTerminalManager,
	) {
		super();
		this._plugins = this._instantiationService.createInstance(PluginController);
	}

	// ---- auth ---------------------------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: 'copilot',
			displayName: 'Copilot',
			description: 'Copilot SDK agent running in a dedicated process',
		};
	}

	getProtectedResources(): IProtectedResourceMetadata[] {
		return [{
			resource: 'https://api.github.com',
			resource_name: 'GitHub Copilot',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['read:user', 'user:email'],
			required: true,
		}];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== 'https://api.github.com') {
			return false;
		}
		const tokenChanged = this._githubToken !== token;
		this._githubToken = token;
		this._logService.info(`[Copilot] Auth token ${tokenChanged ? 'updated' : 'unchanged'}`);
		if (tokenChanged && this._client && this._sessions.size === 0) {
			this._logService.info('[Copilot] Restarting CopilotClient with new token');
			await this._stopClient();
		}
		if (tokenChanged) {
			void this._refreshModels();
		}
		return true;
	}

	private async _refreshModels(): Promise<void> {
		const tokenAtRefreshStart = this._githubToken;
		if (!tokenAtRefreshStart) {
			this._models.set([], undefined);
			return;
		}
		try {
			const models = await this._listModels();
			if (this._githubToken === tokenAtRefreshStart) {
				this._models.set(models, undefined);
			}
		} catch (err) {
			this._logService.error(err, '[Copilot] Failed to refresh models');
			if (this._githubToken === tokenAtRefreshStart) {
				this._models.set([], undefined);
			}
		}
	}

	private async _stopClient(): Promise<void> {
		const client = this._client;
		this._client = undefined;
		this._clientStarting = undefined;
		await client?.stop();
	}

	// ---- client lifecycle ---------------------------------------------------

	private async _ensureClient(): Promise<CopilotClient> {
		const tokenAtStartup = this._githubToken;
		if (!tokenAtStartup) {
			throw new ProtocolError(AHP_AUTH_REQUIRED, 'Authentication is required to use Copilot');
		}
		if (this._client) {
			return this._client;
		}
		if (this._clientStarting) {
			return this._clientStarting;
		}
		const clientStarting = (async () => {
			this._logService.info('[Copilot] Starting CopilotClient... (with token)');

			// Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
			// that can interfere with the Node.js process the SDK spawns.
			const env: Record<string, string | undefined> = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
			delete env['NODE_OPTIONS'];
			delete env['VSCODE_INSPECTOR_OPTIONS'];
			delete env['VSCODE_ESM_ENTRYPOINT'];
			delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
			for (const key of Object.keys(env)) {
				if (key === 'ELECTRON_RUN_AS_NODE') {
					continue;
				}
				if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
					delete env[key];
				}
			}
			env['COPILOT_CLI_RUN_AS_NODE'] = '1';
			env['USE_BUILTIN_RIPGREP'] = 'false';

			// Resolve the CLI entry point from node_modules. We can't use require.resolve()
			// because @github/copilot's exports map blocks direct subpath access.
			// FileAccess.asFileUri('') points to the `out/` directory; node_modules is one level up.
			const cliPath = URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules', '@github', 'copilot', 'index.js').fsPath;

			// Add VS Code's built-in ripgrep to PATH so the CLI subprocess can find it.
			// If @vscode/ripgrep is in an .asar file, the binary is unpacked.
			const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
			const rgDir = dirname(rgDiskPath);
			// On Windows the env key is typically "Path" (not "PATH"). Since we copied
			// process.env into a plain (case-sensitive) object, we must find the actual key.
			const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
			const currentPath = env[pathKey];
			env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
			this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);

			const client = new CopilotClient({
				githubToken: tokenAtStartup,
				useLoggedInUser: false,
				useStdio: true,
				autoStart: true,
				env,
				cliPath,
			});
			await client.start();
			if (this._githubToken !== tokenAtStartup) {
				await client.stop();
				throw new Error('Copilot authentication changed while the client was starting');
			}
			this._logService.info('[Copilot] CopilotClient started successfully');
			this._client = client;
			this._clientStarting = undefined;
			return client;
		})();
		this._clientStarting = clientStarting;
		void clientStarting.catch(() => {
			this._clientStarting = undefined;
		});
		return clientStarting;
	}

	// ---- session management -------------------------------------------------

	private _createThinkingLevelConfigSchema(supportedReasoningEfforts: readonly string[] | undefined, defaultReasoningEffort: string | undefined): IConfigSchema | undefined {
		if (!supportedReasoningEfforts?.length) {
			return undefined;
		}

		const enumLabels = supportedReasoningEfforts.map(value => {
			switch (value) {
				case 'low': return localize('copilot.modelThinkingLevel.low', "Low");
				case 'medium': return localize('copilot.modelThinkingLevel.medium', "Medium");
				case 'high': return localize('copilot.modelThinkingLevel.high', "High");
				case 'xhigh': return localize('copilot.modelThinkingLevel.xhigh', "Extra High");
				default: return value;
			}
		});

		return {
			type: 'object',
			properties: {
				[ThinkingLevelConfigKey]: {
					type: 'string',
					title: localize('copilot.modelThinkingLevel.title', "Thinking Level"),
					description: localize('copilot.modelThinkingLevel.description', "Controls how much reasoning effort the model uses."),
					default: defaultReasoningEffort,
					enum: [...supportedReasoningEfforts],
					enumLabels,
				},
			},
		};
	}

	private _getReasoningEffort(model: IModelSelection | undefined): SessionConfig['reasoningEffort'] {
		const thinkingLevel = model?.config?.[ThinkingLevelConfigKey];
		return isReasoningEffort(thinkingLevel) ? thinkingLevel : undefined;
	}

	private _serializeModelSelection(model: IModelSelection): string {
		return JSON.stringify(model);
	}

	private _parseModelSelection(raw: string | undefined): IModelSelection | undefined {
		if (!raw) {
			return undefined;
		}

		try {
			const value: ISerializedModelSelection | string | number | boolean | null = JSON.parse(raw);
			if (value && typeof value === 'object' && typeof value.id === 'string') {
				const modelSelection: IModelSelection = { id: value.id };
				if (value.config && typeof value.config === 'object') {
					const config: Record<string, string> = {};
					for (const [key, configValue] of Object.entries(value.config)) {
						if (typeof configValue === 'string') {
							config[key] = configValue;
						}
					}
					if (Object.keys(config).length > 0) {
						modelSelection.config = config;
					}
				}
				return modelSelection;
			}
		} catch {
			// Older session metadata stored the raw model id as a plain string.
		}

		return { id: raw };
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.info('[Copilot] Listing sessions...');
		if (!this._githubToken) {
			this._logService.trace('[Copilot] No auth token; returning no sessions');
			return [];
		}
		const client = await this._ensureClient();
		const sessions = await client.listSessions();
		const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(4);
		const projectByContext = new Map<string, Promise<IAgentSessionProjectInfo | undefined>>();
		const result: IAgentSessionMetadata[] = await Promise.all(sessions.map(async s => {
			const session = AgentSession.uri(this.id, s.sessionId);
			const metadata = await this._readStoredSessionMetadata(session);
			let { project, resolved } = metadata;
			if (!resolved) {
				project = await this._resolveSessionProject(s.context, projectLimiter, projectByContext);
				void this._storeSessionProjectResolution(session, project);
			}
			return {
				session,
				startTime: s.startTime.getTime(),
				modifiedTime: s.modifiedTime.getTime(),
				...(project ? { project } : {}),
				summary: s.summary,
				model: metadata.model,
				workingDirectory: metadata.workingDirectory ?? (typeof s.context?.cwd === 'string' ? URI.file(s.context.cwd) : undefined),
			};
		}));
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	private async _listModels(): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		if (!this._githubToken) {
			this._logService.trace('[Copilot] No auth token; returning no models');
			return [];
		}
		const client = await this._ensureClient();
		const models = await client.listModels();
		const result = models.map(m => ({
			provider: this.id,
			id: m.id,
			name: m.name,
			maxContextWindow: m.capabilities.limits.max_context_window_tokens,
			supportsVision: m.capabilities.supports.vision,
			configSchema: this._createThinkingLevelConfigSchema(m.supportedReasoningEfforts, m.defaultReasoningEffort),
			policyState: m.policy?.state as PolicyState | undefined,
		}));
		this._logService.info(`[Copilot] Found ${result.length} models`);
		return result;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<IAgentCreateSessionResult> {
		if (!config?.workingDirectory) {
			throw new Error('workingDirectory is required to create a Copilot session');
		}

		this._logService.info(`[Copilot] Creating session... ${config?.model ? `model=${config.model.id}` : ''}`);
		const client = await this._ensureClient();

		// When forking, use the SDK's sessions.fork RPC.
		if (config?.fork) {
			const sourceSessionId = AgentSession.id(config.fork.session);

			// Serialize against the source session to prevent concurrent
			// modifications while we read its state.
			return this._sessionSequencer.queue(sourceSessionId, async () => {
				this._logService.info(`[Copilot] Forking session ${sourceSessionId} at turnId=${config.fork!.turnId}`);

				// Ensure the source session is loaded so we can read its event IDs
				const sourceEntry = this._sessions.get(sourceSessionId) ?? await this._resumeSession(sourceSessionId);

				// Look up the SDK event ID for the turn *after* the fork point.
				// toEventId is exclusive — events before it are included.
				// If there's no next turn, omit toEventId to include all events.
				const toEventId = await sourceEntry.getNextTurnEventId(config.fork!.turnId);

				const forkResult = await client.rpc.sessions.fork({
					sessionId: sourceSessionId,
					...(toEventId ? { toEventId } : {}),
				});
				const newSessionId = forkResult.sessionId;

				// Copy the source session's database file so the forked session
				// inherits turn event IDs and file-edit snapshots.
				const sourceDbDir = this._sessionDataService.getSessionDataDir(config.fork!.session);
				const targetDbDir = this._sessionDataService.getSessionDataDirById(newSessionId);
				const sourceDbPath = URI.joinPath(sourceDbDir, SESSION_DB_FILENAME);
				const targetDbPath = URI.joinPath(targetDbDir, SESSION_DB_FILENAME);
				try {
					await fs.mkdir(targetDbDir.fsPath, { recursive: true });
					await fs.copyFile(sourceDbPath.fsPath, targetDbPath.fsPath);
				} catch (err) {
					this._logService.warn(`[Copilot] Failed to copy session database for fork: ${err instanceof Error ? err.message : String(err)}`);
				}

				// Resume the forked session so the SDK loads the forked history
				const agentSession = await this._resumeSession(newSessionId);

				// Remap turn IDs to match the new protocol turn IDs
				if (config.fork!.turnIdMapping) {
					await agentSession.remapTurnIds(config.fork!.turnIdMapping);
				}

				const session = agentSession.sessionUri;
				this._logService.info(`[Copilot] Forked session created: ${session.toString()}`);
				const project = await projectFromCopilotContext({ cwd: config.workingDirectory?.fsPath }, this._gitService);
				await this._storeSessionMetadata(session, config.model, config.workingDirectory, project, true);
				return { session, workingDirectory: config.workingDirectory, ...(project ? { project } : {}) };
			});
		}

		const sessionId = config?.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);
		const activeClient = this._activeClients.get(sessionUri);
		const snapshot = activeClient ? await activeClient.snapshot() : undefined;
		const workingDirectory = await this._resolveSessionWorkingDirectory(config, sessionId);
		const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, workingDirectory);
		const sessionConfig = this._buildSessionConfig(snapshot, shellManager);

		const factory: SessionWrapperFactory = async callbacks => {
			const raw = await client.createSession({
				model: config?.model?.id,
				reasoningEffort: this._getReasoningEffort(config?.model),
				sessionId,
				streaming: true,
				workingDirectory: workingDirectory?.fsPath,
				...await sessionConfig(callbacks),
			});
			return new CopilotSessionWrapper(raw);
		};

		let agentSession: CopilotAgentSession;
		try {
			agentSession = this._createAgentSession(factory, sessionId, shellManager, snapshot);
			await agentSession.initializeSession();
		} catch (error) {
			await this._removeCreatedWorktree(sessionId);
			throw error;
		}
		const session = agentSession.sessionUri;
		this._logService.info(`[Copilot] Session created: ${session.toString()}`);
		const project = await projectFromCopilotContext({ cwd: workingDirectory?.fsPath }, this._gitService);
		// Persist model, working directory, and project so we can recreate the
		// session if the SDK loses it and avoid rediscovering git metadata.
		await this._storeSessionMetadata(agentSession.sessionUri, config?.model, workingDirectory, project, true);
		return { session, workingDirectory, ...(project ? { project } : {}) };
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<IResolveSessionConfigResult> {
		const gitInfo = params.workingDirectory ? await this._getGitInfo(params.workingDirectory) : undefined;
		const isolationValue = params.config?.isolation === 'folder' || params.config?.isolation === 'worktree'
			? params.config.isolation
			: gitInfo ? 'worktree' : 'folder';

		const autoApproveValue = params.config?.autoApprove === 'default' || params.config?.autoApprove === 'autoApprove' || params.config?.autoApprove === 'autopilot'
			? params.config.autoApprove
			: 'default';

		const values: Record<string, string> = { isolation: isolationValue, autoApprove: autoApproveValue };
		if (gitInfo) {
			const branchForMode = isolationValue === 'worktree' ? gitInfo.defaultBranch : gitInfo.currentBranch;
			values.branch = typeof params.config?.branch === 'string' && isolationValue === 'worktree'
				? params.config.branch
				: branchForMode;
		}

		const properties: IResolveSessionConfigResult['schema']['properties'] = {
			isolation: {
				type: 'string',
				title: localize('agentHost.sessionConfig.isolation', "Isolation"),
				description: localize('agentHost.sessionConfig.isolationDescription', "Where the agent should make changes"),
				enum: gitInfo ? ['folder', 'worktree'] : ['folder'],
				enumLabels: gitInfo ? [localize('agentHost.sessionConfig.isolation.folder', "Folder"), localize('agentHost.sessionConfig.isolation.worktree', "Worktree")] : [localize('agentHost.sessionConfig.isolation.folder', "Folder")],
				enumDescriptions: gitInfo ? [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder"), localize('agentHost.sessionConfig.isolation.worktreeDescription', "Create a Git worktree for isolation")] : [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder")],
				default: gitInfo ? 'worktree' : 'folder',
				readOnly: !gitInfo,
			},
			autoApprove: {
				type: 'string',
				title: localize('agentHost.sessionConfig.autoApprove', "Approvals"),
				description: localize('agentHost.sessionConfig.autoApproveDescription', "Tool approval behavior for this session"),
				enum: ['default', 'autoApprove', 'autopilot'],
				enumLabels: [
					localize('agentHost.sessionConfig.autoApprove.default', "Default Approvals"),
					localize('agentHost.sessionConfig.autoApprove.bypass', "Bypass Approvals"),
					localize('agentHost.sessionConfig.autoApprove.autopilot', "Autopilot (Preview)"),
				],
				enumDescriptions: [
					localize('agentHost.sessionConfig.autoApprove.defaultDescription', "Copilot uses your configured settings"),
					localize('agentHost.sessionConfig.autoApprove.bypassDescription', "All tool calls are auto-approved"),
					localize('agentHost.sessionConfig.autoApprove.autopilotDescription', "Autonomously iterates from start to finish"),
				],
				default: 'default',
				sessionMutable: true,
			},
		};

		if (gitInfo) {
			const branchReadOnly = isolationValue === 'folder';
			const branchForMode = isolationValue === 'worktree' ? gitInfo.defaultBranch : gitInfo.currentBranch;
			properties.branch = {
				type: 'string',
				title: localize('agentHost.sessionConfig.branch', "Branch"),
				description: localize('agentHost.sessionConfig.branchDescription', "Base branch to work from"),
				enum: [branchForMode],
				enumLabels: [branchForMode],
				default: branchForMode,
				enumDynamic: !branchReadOnly,
				readOnly: branchReadOnly,
			};
		}

		return {
			schema: { type: 'object', properties },
			values,
		};
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<ISessionConfigCompletionsResult> {
		if (params.property !== 'branch' || !params.workingDirectory) {
			return { items: [] };
		}

		const branches = await this._getBranches(params.workingDirectory, params.query);
		return { items: branches.map(branch => ({ value: branch, label: branch })) };
	}

	async setClientCustomizations(clientId: string, customizations: ICustomizationRef[], progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		return this._plugins.sync(clientId, customizations, progress);
	}

	setClientTools(session: URI, clientId: string, tools: IToolDefinition[]): void {
		const activeClient = this._getOrCreateActiveClient(session);
		activeClient.updateTools(clientId, tools);
		this._logService.info(`[Copilot:${AgentSession.id(session)}] Client tools updated: ${tools.map(t => t.name).join(', ') || '(none)'}`);
	}

	onClientToolCallComplete(session: URI, toolCallId: string, result: IToolCallResult): void {
		const entry = this._sessions.get(AgentSession.id(session));
		entry?.handleClientToolCallComplete(toolCallId, result);
	}

	setCustomizationEnabled(uri: string, enabled: boolean): void {
		this._plugins.setEnabled(uri, enabled);
	}

	async sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[], turnId?: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {

			// If the active client's config changed (tools or plugins),
			// dispose this session so it gets resumed with the updated config.
			let entry = this._sessions.get(sessionId);
			const activeClient = this._activeClients.get(session);
			if (entry && activeClient && await activeClient.isOutdated(entry.appliedSnapshot)) {
				this._logService.info(`[Copilot:${sessionId}] Session config changed, refreshing session`);
				this._sessions.deleteAndDispose(sessionId);
				entry = undefined;
			}

			entry ??= await this._resumeSession(sessionId);
			await entry.send(prompt, attachments, turnId);
		});
	}

	setPendingMessages(session: URI, steeringMessage: IPendingMessage | undefined, _queuedMessages: readonly IPendingMessage[]): void {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			this._logService.warn(`[Copilot:${sessionId}] setPendingMessages: session not found`);
			return;
		}

		// Steering: send with mode 'immediate' so the SDK injects it mid-turn
		if (steeringMessage) {
			entry.sendSteering(steeringMessage);
		}

		// Queued messages are consumed by the server (AgentSideEffects)
		// which dispatches SessionTurnStarted and calls sendMessage directly.
		// No SDK-level enqueue is needed.
	}

	async getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent | IAgentSubagentStartedEvent)[]> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Failed to resume session for message lookup`, err);
			return undefined;
		});
		if (!entry) {
			return [];
		}
		return entry.getMessages();
	}

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			await this._destroyAndDisposeSession(sessionId);
		});
	}

	async abortSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			const entry = this._sessions.get(sessionId);
			if (entry) {
				await entry.abort();
			}
		});
	}

	async truncateSession(session: URI, turnId?: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			this._logService.info(`[Copilot:${sessionId}] Truncating session${turnId !== undefined ? ` at turnId=${turnId}` : ' (all turns)'}`);

			// Ensure the session is loaded so we can use the SDK RPC
			const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId);

			// Look up the SDK event ID for the truncation boundary.
			// The protocol semantics: turnId is the last turn to KEEP.
			// The SDK semantics: eventId and all events after it are removed.
			// So we need the event ID of the *next* turn after turnId.
			// For "remove all", we need the first turn's event ID.
			let eventId: string | undefined;
			if (turnId) {
				eventId = await entry.getNextTurnEventId(turnId);
			} else {
				eventId = await entry.getFirstTurnEventId();
			}

			if (eventId) {
				await entry.truncateAtEventId(eventId, turnId);
			} else {
				this._logService.info(`[Copilot:${sessionId}] No event ID found for truncation, nothing to truncate`);
			}

			this._logService.info(`[Copilot:${sessionId}] Session truncated`);
		});
	}

	async changeModel(session: URI, model: IModelSelection): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			await entry.setModel(model.id, this._getReasoningEffort(model));
		}
		await this._storeSessionMetadata(session, model, undefined, undefined);
	}

	async shutdown(): Promise<void> {
		this._shutdownPromise ??= (async () => {
			this._logService.info('[Copilot] Shutting down...');
			const sessionIds = new Set([...this._sessions.keys(), ...this._createdWorktrees.keys()]);
			for (const sessionId of sessionIds) {
				await this._sessionSequencer.queue(sessionId, () => this._destroyAndDisposeSession(sessionId));
			}
			await this._client?.stop();
			this._client = undefined;
		})();
		return this._shutdownPromise;
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		for (const [, session] of this._sessions) {
			if (session.respondToPermissionRequest(requestId, approved)) {
				return;
			}
		}
	}

	respondToUserInputRequest(requestId: string, response: SessionInputResponseKind, answers?: Record<string, ISessionInputAnswer>): void {
		for (const [, session] of this._sessions) {
			if (session.respondToUserInputRequest(requestId, response, answers)) {
				return;
			}
		}
	}

	/**
	 * Returns true if this provider owns the given session ID.
	 */
	hasSession(session: URI): boolean {
		return this._sessions.has(AgentSession.id(session));
	}

	// ---- helpers ------------------------------------------------------------

	private _getOrCreateActiveClient(session: URI): ActiveClient {
		let client = this._activeClients.get(session);
		if (!client) {
			client = new ActiveClient(() => this._plugins.getAppliedPlugins());
			this._activeClients.set(session, client);
		}
		return client;
	}

	/**
	 * Creates a {@link CopilotAgentSession}, registers it in the sessions map,
	 * and returns it. The caller must call {@link CopilotAgentSession.initializeSession}
	 * to wire up the SDK session.
	 */
	private _createAgentSession(wrapperFactory: SessionWrapperFactory, sessionId: string, shellManager: ShellManager, snapshot?: IActiveClientSnapshot): CopilotAgentSession {
		const sessionUri = AgentSession.uri(this.id, sessionId);

		const agentSession = this._instantiationService.createInstance(
			CopilotAgentSession,
			{
				sessionUri,
				rawSessionId: sessionId,
				onDidSessionProgress: this._onDidSessionProgress,
				wrapperFactory,
				shellManager,
				clientSnapshot: snapshot,
			},
		);

		this._sessions.set(sessionId, agentSession);
		return agentSession;
	}

	private async _destroyAndDisposeSession(sessionId: string): Promise<void> {
		const entry = this._sessions.get(sessionId);
		if (entry) {
			try {
				await entry.destroySession();
			} catch (error) {
				this._logService.warn(`[Copilot:${sessionId}] Failed to destroy session before cleanup: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this._sessions.deleteAndDispose(sessionId);
		await this._removeCreatedWorktree(sessionId);
	}

	/**
	 * Builds the common session configuration (plugins + shell tools) shared
	 * by both {@link createSession} and {@link _resumeSession}.
	 *
	 * Returns an async function that resolves the final config given the
	 * session's permission/hook callbacks, so it can be called lazily
	 * inside the {@link SessionWrapperFactory}.
	 */
	private _buildSessionConfig(snapshot: IActiveClientSnapshot | undefined, shellManager: ShellManager) {
		const shellTools = createShellTools(shellManager, this._terminalManager, this._logService);
		const plugins = snapshot?.plugins ?? [];

		return async (callbacks: Parameters<SessionWrapperFactory>[0]) => {
			const customAgents = await toSdkCustomAgents(plugins.flatMap(p => p.agents), this._fileService);
			return {
				onPermissionRequest: callbacks.onPermissionRequest,
				onUserInputRequest: callbacks.onUserInputRequest,
				hooks: toSdkHooks(plugins.flatMap(p => p.hooks), callbacks.hooks),
				mcpServers: toSdkMcpServers(plugins.flatMap(p => p.mcpServers)),
				customAgents,
				skillDirectories: toSdkSkillDirectories(plugins.flatMap(p => p.skills)),
				tools: [...shellTools, ...callbacks.clientTools],
			};
		};
	}

	private async _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this._logService.info(`[Copilot:${sessionId}] Session not in memory, resuming...`);
		const client = await this._ensureClient();

		const sessionUri = AgentSession.uri(this.id, sessionId);
		const activeClient = this._activeClients.get(sessionUri);
		const snapshot = activeClient ? await activeClient.snapshot() : undefined;
		const storedMetadata = await this._readSessionMetadata(sessionUri);
		const sessionMetadata = await client.getSessionMetadata(sessionId).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] getSessionMetadata failed`, err);
			return undefined;
		});
		const workingDirectory = storedMetadata.workingDirectory ?? (typeof sessionMetadata?.context?.cwd === 'string' ? URI.file(sessionMetadata.context.cwd) : undefined);
		if (!workingDirectory) {
			throw new Error(`workingDirectory is required to resume Copilot session '${sessionId}'`);
		}

		const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, workingDirectory);
		const sessionConfig = this._buildSessionConfig(snapshot, shellManager);

		const factory: SessionWrapperFactory = async callbacks => {
			const config = await sessionConfig(callbacks);
			try {
				const raw = await client.resumeSession(sessionId, {
					...config,
					workingDirectory: workingDirectory?.fsPath,
				});
				return new CopilotSessionWrapper(raw);
			} catch (err) {
				// The SDK fails to resume sessions that have no messages.
				// Fall back to creating a new session with the same ID,
				// seeding model & working directory from stored metadata.
				if (!err || (err as { code?: number }).code !== -32603) {
					throw err;
				}

				this._logService.warn(`[Copilot:${sessionId}] Resume failed (session not found in SDK), recreating`);
				const raw = await client.createSession({
					...config,
					sessionId,
					streaming: true,
					model: storedMetadata.model?.id,
					reasoningEffort: this._getReasoningEffort(storedMetadata.model),
					workingDirectory: workingDirectory?.fsPath,
				});

				return new CopilotSessionWrapper(raw);
			}
		};

		const agentSession = this._createAgentSession(factory, sessionId, shellManager, snapshot);
		await agentSession.initializeSession();

		return agentSession;
	}

	private async _getGitInfo(workingDirectory: URI): Promise<{ currentBranch: string; defaultBranch: string } | undefined> {
		if (!await this._gitService.isInsideWorkTree(workingDirectory)) {
			return undefined;
		}

		const currentBranch = await this._gitService.getCurrentBranch(workingDirectory) ?? 'HEAD';
		const defaultBranch = await this._gitService.getDefaultBranch(workingDirectory) ?? currentBranch;
		return { currentBranch, defaultBranch };
	}

	private async _getBranches(workingDirectory: URI, query?: string): Promise<string[]> {
		return this._gitService.getBranches(workingDirectory, { query, limit: CopilotAgent._BRANCH_COMPLETION_LIMIT });
	}

	private async _resolveSessionWorkingDirectory(config: IAgentCreateSessionConfig | undefined, sessionId: string): Promise<URI | undefined> {
		if (config?.config?.isolation !== 'worktree' || !config.workingDirectory || typeof config.config.branch !== 'string') {
			return config?.workingDirectory;
		}

		const repositoryRoot = await this._gitService.getRepositoryRoot(config.workingDirectory);
		if (!repositoryRoot) {
			return config.workingDirectory;
		}

		const worktreesRoot = getCopilotWorktreesRoot(repositoryRoot);
		const branchNameHint = config.config[AgentHostSessionConfigBranchNameHintKey];
		const branchName = getCopilotWorktreeBranchName(sessionId, branchNameHint);
		const worktree = URI.joinPath(worktreesRoot, getCopilotWorktreeName(branchName));
		await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
		await this._gitService.addWorktree(repositoryRoot, worktree, branchName, config.config.branch);
		this._createdWorktrees.set(sessionId, { repositoryRoot, worktree });
		return worktree;
	}

	private async _removeCreatedWorktree(sessionId: string): Promise<void> {
		const worktree = this._createdWorktrees.get(sessionId);
		if (!worktree) {
			return;
		}
		try {
			await this._gitService.removeWorktree(worktree.repositoryRoot, worktree.worktree);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to remove worktree '${worktree.worktree.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this._createdWorktrees.delete(sessionId);
		}
	}

	// ---- session metadata persistence --------------------------------------

	private static readonly _META_MODEL = 'copilot.model';
	private static readonly _META_CWD = 'copilot.workingDirectory';
	private static readonly _META_PROJECT_RESOLVED = 'copilot.project.resolved';
	private static readonly _META_PROJECT_URI = 'copilot.project.uri';
	private static readonly _META_PROJECT_DISPLAY_NAME = 'copilot.project.displayName';

	private async _storeSessionMetadata(session: URI, model: IModelSelection | undefined, workingDirectory: URI | undefined, project: IAgentSessionProjectInfo | undefined, projectResolved = project !== undefined): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		const db = dbRef.object;
		try {
			const work: Promise<void>[] = [];
			if (model) {
				work.push(db.setMetadata(CopilotAgent._META_MODEL, this._serializeModelSelection(model)));
			}
			if (workingDirectory) {
				work.push(db.setMetadata(CopilotAgent._META_CWD, workingDirectory.toString()));
			}
			if (projectResolved) {
				work.push(db.setMetadata(CopilotAgent._META_PROJECT_RESOLVED, 'true'));
			}
			if (project) {
				work.push(db.setMetadata(CopilotAgent._META_PROJECT_URI, project.uri.toString()));
				work.push(db.setMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME, project.displayName));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	private async _readSessionMetadata(session: URI): Promise<{ model?: IModelSelection; workingDirectory?: URI }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return {};
		}
		try {
			const [model, cwd] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_CWD),
			]);
			return {
				model: this._parseModelSelection(model),
				workingDirectory: cwd ? URI.parse(cwd) : undefined,
			};
		} finally {
			ref.dispose();
		}
	}

	private async _readStoredSessionMetadata(session: URI): Promise<{ model?: IModelSelection; workingDirectory?: URI; project?: IAgentSessionProjectInfo; resolved: boolean }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return { resolved: false };
		}
		try {
			const [model, cwd, resolved, uri, displayName] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_RESOLVED),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_URI),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME),
			]);
			const project = uri && displayName ? { uri: URI.parse(uri), displayName } : undefined;
			return { model: this._parseModelSelection(model), workingDirectory: cwd ? URI.parse(cwd) : undefined, project, resolved: resolved === 'true' || project !== undefined };
		} finally {
			ref.dispose();
		}
	}

	private async _storeSessionProjectResolution(session: URI, project: IAgentSessionProjectInfo | undefined): Promise<void> {
		await this._storeSessionMetadata(session, undefined, undefined, project, true);
	}

	private _resolveSessionProject(context: ICopilotSessionContext | undefined, limiter: Limiter<IAgentSessionProjectInfo | undefined>, projectByContext: Map<string, Promise<IAgentSessionProjectInfo | undefined>>): Promise<IAgentSessionProjectInfo | undefined> {
		const key = this._projectContextKey(context);
		if (!key) {
			return Promise.resolve(undefined);
		}

		let project = projectByContext.get(key);
		if (!project) {
			project = limiter.queue(() => projectFromCopilotContext(context, this._gitService));
			projectByContext.set(key, project);
		}
		return project;
	}

	private _projectContextKey(context: ICopilotSessionContext | undefined): string | undefined {
		if (context?.cwd) {
			return `cwd:${context.cwd}`;
		}
		if (context?.gitRoot) {
			return `gitRoot:${context.gitRoot}`;
		}
		if (context?.repository) {
			return `repository:${context.repository}`;
		}
		return undefined;
	}

	override dispose(): void {
		this.shutdown().catch(err => {
			this._logService.warn('[Copilot] Shutdown failed during dispose', err);
		}).finally(() => super.dispose());
	}
}

class PluginController {
	private readonly _enablement = new Map<string, boolean>();
	private _lastSynced: Promise<{ synced: ISyncedCustomization[]; parsed: IParsedPlugin[] }> = Promise.resolve({ synced: [], parsed: [] });

	constructor(
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
	) { }

	/**
	 * Returns the current parsed plugins, awaiting any pending sync.
	 */
	public async getAppliedPlugins(): Promise<readonly IParsedPlugin[]> {
		const { parsed } = await this._lastSynced;
		return parsed;
	}

	public setEnabled(pluginProtocolUri: string, enabled: boolean) {
		this._enablement.set(pluginProtocolUri, enabled);
	}

	public sync(clientId: string, customizations: ICustomizationRef[], progress?: (results: ISyncedCustomization[]) => void) {
		const prev = this._lastSynced;
		const promise = this._lastSynced = prev.catch(err => {
			this._logService.warn('[Copilot:PluginController] Previous customization sync failed', err);
		}).then(async () => {
			const result = await this._pluginManager.syncCustomizations(clientId, customizations, status => {
				progress?.(status.map(c => ({ customization: c })));
			});


			const parsed: IParsedPlugin[] = [];
			const synced: ISyncedCustomization[] = [];
			for (const dir of result) {
				if (dir.pluginDir) {
					try {
						parsed.push(await parsePlugin(dir.pluginDir, this._fileService, undefined, this._getUserHome()));
						synced.push(dir);
					} catch (e) {
						this._logService.warn(`[Copilot:PluginController] Error parsing plugin: ${e}`);
						synced.push({ customization: { ...dir.customization, status: CustomizationStatus.Error, statusMessage: `Error parsing plugin: ${e}` } });
					}
				} else {
					synced.push(dir);
				}
			}

			return { synced, parsed };
		});

		return promise.then(p => p.synced);
	}

	private _getUserHome(): string {
		return process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
	}
}

/**
 * Tracks per-session active client contributions (tools and plugins).
 * The {@link snapshot} captures the state at session creation time, and
 * {@link isOutdated} detects when the session needs to be refreshed.
 */
class ActiveClient {
	private _tools: readonly IToolDefinition[] = [];
	private _clientId = '';

	constructor(
		/** Resolves the current set of applied plugins. May block while a sync is in progress. */
		private readonly _resolvePlugins: () => Promise<readonly IParsedPlugin[]>,
	) { }

	updateTools(clientId: string, tools: readonly IToolDefinition[]): void {
		this._clientId = clientId;
		this._tools = tools;
	}

	async snapshot(): Promise<IActiveClientSnapshot> {
		return { clientId: this._clientId, tools: this._tools, plugins: await this._resolvePlugins() };
	}

	async isOutdated(snap: IActiveClientSnapshot): Promise<boolean> {
		const plugins = await this._resolvePlugins();
		if (!parsedPluginsEqual(snap.plugins, plugins)) {
			return true;
		}
		if (snap.tools.length !== this._tools.length) {
			return true;
		}
		// Compare tool definitions by name, description, and schema —
		// not just names — so schema/description changes trigger a refresh.
		const snapByName = new Map(snap.tools.map(t => [t.name, t]));
		for (const tool of this._tools) {
			const prev = snapByName.get(tool.name);
			if (!prev
				|| prev.description !== tool.description
				|| !equals(prev.inputSchema, tool.inputSchema)) {
				return true;
			}
		}
		return false;
	}
}
