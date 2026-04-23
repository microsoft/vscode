/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, ResumeSessionConfig, type CopilotClientOptions, type SessionConfig } from '@github/copilot-sdk';
import { rgPath } from '@vscode/ripgrep';
import * as fs from 'fs/promises';
import { Limiter, SequencerByKey } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { appendEscapedMarkdownInlineCode } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileAccess } from '../../../../base/common/network.js';
import { equals } from '../../../../base/common/objects.js';
import { observableValue } from '../../../../base/common/observable.js';
import { basename, delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IParsedPlugin, parsePlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentHostSessionConfigBranchNameHintKey, AgentSession, IAgent, IAgentAttachment, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentDeltaEvent, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo, IAgentSubagentStartedEvent, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { ISessionDataService, SESSION_DB_FILENAME } from '../../common/sessionDataService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { ProtectedResourceMetadata, type ConfigSchema, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { CustomizationStatus, CustomizationRef, SessionInputResponseKind, type PendingMessage, type SessionInputAnswer, type ToolCallResult, type PolicyState } from '../../common/state/sessionState.js';
import { IAgentHostGitService } from '../agentHostGitService.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';
import { SessionPermissionManager } from '../sessionPermissions.js';
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

/**
 * Narrow surface of {@link CopilotClient} used by this provider. The SDK class
 * has private members, so tests use this structural type to inject a fake.
 */
export interface ICopilotClient {
	start(): Promise<void>;
	stop: CopilotClient['stop'];
	listSessions: CopilotClient['listSessions'];
	listModels: () => Promise<ICopilotModelInfo[]>;
	createSession: CopilotClient['createSession'];
	resumeSession: CopilotClient['resumeSession'];
	getSessionMetadata: CopilotClient['getSessionMetadata'];
	readonly rpc: { readonly sessions: { readonly fork: CopilotClient['rpc']['sessions']['fork'] } };
}

/**
 * Corrected shape of {@link CopilotClient.listModels} entries.
 *
 * The SDK's `ModelInfo` type declares `capabilities`, `capabilities.limits`,
 * and `capabilities.limits.max_context_window_tokens` as required, but at
 * runtime synthetic entries (e.g. the `auto` router) ship with an empty
 * `capabilities: {}` object. We mirror the SDK fields we consume but mark the
 * unreliable parts as optional so callers must defensively handle them.
 */
export interface ICopilotModelInfo {
	readonly id: string;
	readonly name: string;
	readonly capabilities?: {
		readonly supports?: { readonly vision?: boolean };
		readonly limits?: { readonly max_context_window_tokens?: number };
	};
	readonly policy?: { readonly state?: string };
	readonly supportedReasoningEfforts?: readonly string[];
	readonly defaultReasoningEffort?: string;
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
 * Builds the localized "Created isolated worktree for branch X" markdown
 * shown at the top of the first response in worktree-isolated sessions.
 * The branch name is wrapped as inline code so the localized template
 * doesn't have to embed markdown punctuation. The trailing blank line
 * keeps the announcement visually separated when it gets merged into the
 * same markdown part as the model's reply.
 */
function buildWorktreeAnnouncementText(branchName: string): string {
	return localize(
		'copilotAgent.worktreeCreated',
		"Created isolated worktree for branch {0}",
		appendEscapedMarkdownInlineCode(branchName)
	) + '\n\n';
}

type AgentMessageOrEvent = IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent | IAgentSubagentStartedEvent;

/**
 * Returns a copy of `messages` where `announcement` has been prepended to
 * the first top-level assistant message's content. Subagent inner messages
 * (those with a `parentToolCallId`) are skipped so the announcement lands
 * on the parent turn. If no assistant message exists yet, returns the
 * messages unchanged — the live announcement path is responsible for the
 * very first turn before any reply has been recorded.
 */
function prependAnnouncementToFirstAssistantMessage(
	messages: readonly AgentMessageOrEvent[],
	announcement: string,
): readonly AgentMessageOrEvent[] {
	const firstAssistantIdx = messages.findIndex(m => m.type === 'message' && m.role === 'assistant' && !m.parentToolCallId);
	if (firstAssistantIdx === -1) {
		return messages;
	}
	const target = messages[firstAssistantIdx] as IAgentMessageEvent;
	const updated: IAgentMessageEvent = { ...target, content: announcement + target.content };
	return [
		...messages.slice(0, firstAssistantIdx),
		updated,
		...messages.slice(firstAssistantIdx + 1),
	];
}

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilotcli' as const;
	private static readonly _BRANCH_COMPLETION_LIMIT = 25;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models = this._models;

	private _client: ICopilotClient | undefined;
	private _clientStarting: Promise<ICopilotClient> | undefined;
	private _githubToken: string | undefined;
	private readonly _sessions = this._register(new DisposableMap<string, CopilotAgentSession>());
	private readonly _createdWorktrees = new Map<string, ICreatedWorktree>();
	/**
	 * Per-session announcement (markdown string) that should be emitted as
	 * a synthetic streaming `delta` event the first time {@link sendMessage}
	 * is called for the session. Currently used to surface the "Created
	 * isolated worktree for branch X" message live during the first turn.
	 * The same announcement is also injected on restore via
	 * {@link getSessionMessages} by prepending to the first assistant
	 * message's content so it stays visible after the session is reopened.
	 */
	private readonly _pendingFirstTurnAnnouncements = new Map<string, string>();
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

	protected _createCopilotClient(options: CopilotClientOptions): ICopilotClient {
		return new CopilotClient(options);
	}

	// ---- auth ---------------------------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: 'copilotcli',
			displayName: 'Copilot CLI',
			description: 'Copilot SDK agent running in a dedicated process',
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
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

	private async _ensureClient(): Promise<ICopilotClient> {
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

			const client = this._createCopilotClient({
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

	private _createThinkingLevelConfigSchema(supportedReasoningEfforts: readonly string[] | undefined, defaultReasoningEffort: string | undefined): ConfigSchema | undefined {
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

	private _getReasoningEffort(model: ModelSelection | undefined): SessionConfig['reasoningEffort'] {
		const thinkingLevel = model?.config?.[ThinkingLevelConfigKey];
		return isReasoningEffort(thinkingLevel) ? thinkingLevel : undefined;
	}

	private _serializeModelSelection(model: ModelSelection): string {
		return JSON.stringify(model);
	}

	private _parseModelSelection(raw: string | undefined): ModelSelection | undefined {
		if (!raw) {
			return undefined;
		}

		try {
			const value: ISerializedModelSelection | string | number | boolean | null = JSON.parse(raw);
			if (value && typeof value === 'object' && typeof value.id === 'string') {
				const modelSelection: ModelSelection = { id: value.id };
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
		const client = await this._ensureClient();
		const sessions = await client.listSessions();
		const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(4);
		const projectByContext = new Map<string, Promise<IAgentSessionProjectInfo | undefined>>();
		const mapped = await Promise.all(sessions.map(async s => {
			const session = AgentSession.uri(this.id, s.sessionId);
			const metadata = await this._readStoredSessionMetadata(session);
			if (!metadata) {
				return undefined;
			}
			let { project, resolved } = metadata;
			if (!resolved) {
				project = await this._resolveSessionProject(s.context, projectLimiter, projectByContext);
				void this._storeSessionProjectResolution(session, project);
			}
			const workingDirectory = metadata.workingDirectory ?? (typeof s.context?.cwd === 'string' ? URI.file(s.context.cwd) : undefined);
			const result: IAgentSessionMetadata = {
				session,
				startTime: s.startTime.getTime(),
				modifiedTime: s.modifiedTime.getTime(),
				project,
				summary: s.summary,
				model: metadata.model,
				workingDirectory,
			};
			return result;
		}));
		const result = mapped.filter((s): s is IAgentSessionMetadata => s !== undefined);
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	private async _listModels(): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const models = await client.listModels();
		const result = models.map((m): IAgentModelInfo => ({
			provider: this.id,
			id: m.id,
			name: m.name,
			// Synthetic SDK entries like `auto` ship with `capabilities: {}` and
			// no fixed context window — surface them with maxContextWindow undefined.
			maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
			supportsVision: !!m.capabilities?.supports?.vision,
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

				// Copy the source session's database using VACUUM INTO so the
				// forked session inherits turn event IDs and file-edit snapshots.
				// VACUUM INTO is safe even while the source DB is open.
				const targetDbDir = this._sessionDataService.getSessionDataDirById(newSessionId);
				const targetDbPath = URI.joinPath(targetDbDir, SESSION_DB_FILENAME);
				try {
					const sourceDbRef = await this._sessionDataService.tryOpenDatabase(config.fork!.session);
					if (sourceDbRef) {
						try {
							await fs.mkdir(targetDbDir.fsPath, { recursive: true });
							await sourceDbRef.object.vacuumInto(targetDbPath.fsPath);
						} finally {
							sourceDbRef.dispose();
						}
					}
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
		let seededActiveClient = false;
		if (config?.activeClient) {
			const ac = this._getOrCreateActiveClient(sessionUri);
			seededActiveClient = true;
			ac.updateTools(config.activeClient.clientId, config.activeClient.tools);
			if (config.activeClient.customizations !== undefined) {
				await this._plugins.sync(config.activeClient.clientId, config.activeClient.customizations);
			}
		}
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
			agentSession = this._createAgentSession(factory, sessionId, shellManager, workingDirectory, snapshot);
			await agentSession.initializeSession();
		} catch (error) {
			if (seededActiveClient) {
				this._activeClients.delete(sessionUri);
			}
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

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const gitInfo = params.workingDirectory ? await this._getGitInfo(params.workingDirectory) : undefined;
		const isolationValue = params.config?.isolation === 'folder' || params.config?.isolation === 'worktree'
			? params.config.isolation
			: gitInfo ? 'worktree' : 'folder';

		const autoApproveValue = params.config?.autoApprove === 'default' || params.config?.autoApprove === 'autoApprove' || params.config?.autoApprove === 'autopilot'
			? params.config.autoApprove
			: 'default';

		const values: Record<string, unknown> = {
			isolation: isolationValue,
			autoApprove: autoApproveValue,
			[SessionPermissionManager.PERMISSIONS_CONFIG_KEY]: params.config?.[SessionPermissionManager.PERMISSIONS_CONFIG_KEY] || { allow: [], deny: [] },
		};
		if (gitInfo) {
			const branchForMode = isolationValue === 'worktree' ? gitInfo.defaultBranch : gitInfo.currentBranch;
			values.branch = typeof params.config?.branch === 'string' && isolationValue === 'worktree'
				? params.config.branch
				: branchForMode;
		}

		const properties: ResolveSessionConfigResult['schema']['properties'] = {
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
			[SessionPermissionManager.PERMISSIONS_CONFIG_KEY]: {
				type: 'object',
				title: localize('agentHost.sessionConfig.permissions', "Permissions"),
				description: localize('agentHost.sessionConfig.permissionsDescription', "Per-tool session permissions. Updated automatically when approving a tool \"in this Session\"."),
				properties: {
					allow: {
						type: 'array',
						title: localize('agentHost.sessionConfig.permissions.allow', "Allowed tools"),
						items: {
							type: 'string',
							title: localize('agentHost.sessionConfig.permissions.toolName', "Tool name"),
						},
					},
					deny: {
						type: 'array',
						title: localize('agentHost.sessionConfig.permissions.deny', "Denied tools"),
						items: {
							type: 'string',
							title: localize('agentHost.sessionConfig.permissions.toolName', "Tool name"),
						},
					},
				},
				default: { allow: [], deny: [] },
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

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		if (params.property !== 'branch' || !params.workingDirectory) {
			return { items: [] };
		}

		const branches = await this._getBranches(params.workingDirectory, params.query);
		return { items: branches.map(branch => ({ value: branch, label: branch })) };
	}

	async setClientCustomizations(clientId: string, customizations: CustomizationRef[], progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		return this._plugins.sync(clientId, customizations, progress);
	}

	setClientTools(session: URI, clientId: string, tools: ToolDefinition[]): void {
		const sessionId = AgentSession.id(session);
		const activeClient = this._getOrCreateActiveClient(session);
		const hasCachedEntry = this._sessions.has(sessionId);
		this._logService.info(`[Copilot:${sessionId}] setClientTools: clientId=${clientId}, tools=[${tools.map(t => t.name).join(', ') || '(none)'}], hasCachedSdkSession=${hasCachedEntry}`);
		activeClient.updateTools(clientId, tools);
	}

	onClientToolCallComplete(session: URI, toolCallId: string, result: ToolCallResult): void {
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
			const hadCachedEntry = !!entry;
			this._logService.info(`[Copilot:${sessionId}] sendMessage: cachedEntry=${hadCachedEntry}, hasActiveClient=${!!activeClient}, activeClientId=${activeClient ? '(set)' : '(none)'}`);
			if (entry && activeClient && await activeClient.isOutdated(entry.appliedSnapshot)) {
				this._logService.info(`[Copilot:${sessionId}] Session config changed (isOutdated=true), refreshing session. snapshotClientId=${entry.appliedSnapshot.clientId}`);
				this._sessions.deleteAndDispose(sessionId);
				entry = undefined;
			}

			if (!entry) {
				this._logService.info(`[Copilot:${sessionId}] No cached entry${hadCachedEntry ? ' (was evicted by isOutdated)' : ''}, calling _resumeSession`);
			}
			entry ??= await this._resumeSession(sessionId);

			// Emit any pending first-turn announcements (e.g. worktree
			// created) as a synthetic streaming delta before delegating to
			// the SDK. The mapper treats it like any other assistant text —
			// the SDK's subsequent deltas append to the same markdown part.
			// The active turn has already been started by the state manager
			// at this point, so the event mapper can attach the delta to it.
			const pending = this._pendingFirstTurnAnnouncements.get(sessionId);
			if (pending) {
				this._pendingFirstTurnAnnouncements.delete(sessionId);
				const messageId = `copilot-announcement-${generateUuid()}`;
				const event: IAgentDeltaEvent = { type: 'delta', session, messageId, content: pending };
				this._onDidSessionProgress.fire(event);
			}

			try {
				await entry.send(prompt, attachments, turnId);
			} catch (err) {
				const errCode = (err as { code?: number })?.code;
				const errMsg = err instanceof Error ? err.message : String(err);
				this._logService.error(`[Copilot:${sessionId}] entry.send() failed: code=${errCode}, message=${errMsg}, hadCachedEntry=${hadCachedEntry}, errorType=${err?.constructor?.name}`);
				throw err;
			}
		});
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
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
		const rawMessages = await entry.getMessages();

		// If a worktree was created for this session at create-time, prepend
		// the announcement to the first assistant message's content so it
		// appears at the top of the first response when the session is
		// reopened. The live path (sendMessage) handles the very first turn
		// when the session is fresh; this path takes over on subsequent
		// loads, where _pendingFirstTurnAnnouncements is empty.
		const branchName = await this._readWorktreeBranchMetadata(session).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Failed to read worktree branch metadata`, err);
			return undefined;
		});
		if (!branchName) {
			return rawMessages;
		}
		return [...prependAnnouncementToFirstAssistantMessage(rawMessages, buildWorktreeAnnouncementText(branchName))];
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

	async changeModel(session: URI, model: ModelSelection): Promise<void> {
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

	respondToUserInputRequest(requestId: string, response: SessionInputResponseKind, answers?: Record<string, SessionInputAnswer>): void {
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
	private _createAgentSession(wrapperFactory: SessionWrapperFactory, sessionId: string, shellManager: ShellManager, workingDirectory: URI | undefined, snapshot?: IActiveClientSnapshot): CopilotAgentSession {
		const sessionUri = AgentSession.uri(this.id, sessionId);

		const agentSession = this._instantiationService.createInstance(
			CopilotAgentSession,
			{
				sessionUri,
				rawSessionId: sessionId,
				onDidSessionProgress: this._onDidSessionProgress,
				wrapperFactory,
				shellManager,
				workingDirectory,
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
	private _buildSessionConfig(snapshot: IActiveClientSnapshot | undefined, shellManager: ShellManager): (args: Parameters<SessionWrapperFactory>[0]) => Promise<ResumeSessionConfig> {
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

	protected async _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this._logService.info(`[Copilot:${sessionId}] _resumeSession called — session not in memory, resuming...`);
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
				this._logService.info(`[Copilot:${sessionId}] Calling SDK resumeSession...`);
				const raw = await client.resumeSession(sessionId, {
					...config,
					workingDirectory: workingDirectory?.fsPath,
				});
				this._logService.info(`[Copilot:${sessionId}] SDK resumeSession succeeded`);
				return new CopilotSessionWrapper(raw);
			} catch (err) {
				const errCode = (err as { code?: number })?.code;
				const errMsg = err instanceof Error ? err.message : String(err);
				this._logService.warn(`[Copilot:${sessionId}] SDK resumeSession failed: code=${errCode}, message=${errMsg}`);
				// The SDK fails to resume sessions that have no messages.
				// Fall back to creating a new session with the same ID,
				// seeding model & working directory from stored metadata.
				if (!err || errCode !== -32603) {
					throw err;
				}

				this._logService.warn(`[Copilot:${sessionId}] Resume failed (code=-32603), falling back to createSession with same ID`);
				const raw = await client.createSession({
					...config,
					sessionId,
					streaming: true,
					model: storedMetadata.model?.id,
					reasoningEffort: this._getReasoningEffort(storedMetadata.model),
					workingDirectory: workingDirectory?.fsPath,
				});
				this._logService.info(`[Copilot:${sessionId}] Fallback createSession succeeded`);

				return new CopilotSessionWrapper(raw);
			}
		};

		const agentSession = this._createAgentSession(factory, sessionId, shellManager, workingDirectory, snapshot);
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

	protected async _resolveSessionWorkingDirectory(config: IAgentCreateSessionConfig | undefined, sessionId: string): Promise<URI | undefined> {
		if (config?.config?.isolation !== 'worktree' || !config.workingDirectory || typeof config.config.branch !== 'string') {
			return config?.workingDirectory;
		}

		const repositoryRoot = await this._gitService.getRepositoryRoot(config.workingDirectory);
		if (!repositoryRoot) {
			return config.workingDirectory;
		}

		const worktreesRoot = getCopilotWorktreesRoot(repositoryRoot);
		const branchNameHintRaw = config.config[AgentHostSessionConfigBranchNameHintKey];
		const branchNameHint = typeof branchNameHintRaw === 'string' ? branchNameHintRaw : undefined;
		const branchName = getCopilotWorktreeBranchName(sessionId, branchNameHint);
		const worktree = URI.joinPath(worktreesRoot, getCopilotWorktreeName(branchName));
		await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
		const baseBranch = typeof config.config.branch === 'string' ? config.config.branch : undefined;
		// `addWorktree`'s signature requires a startPoint, but historically the
		// runtime accepted undefined when `branch` was not set in config. Preserve
		// that behavior by passing through whatever value (or undefined) was set.
		await this._gitService.addWorktree(repositoryRoot, worktree, branchName, baseBranch as string);
		this._createdWorktrees.set(sessionId, { repositoryRoot, worktree });
		// Queue the worktree announcement so the first turn (live) and any
		// subsequent restore (history) both surface the message in the chat.
		this._pendingFirstTurnAnnouncements.set(sessionId, buildWorktreeAnnouncementText(branchName));
		const sessionUri = AgentSession.uri(this.id, sessionId);
		try {
			await this._writeWorktreeBranchMetadata(sessionUri, branchName);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to persist worktree branch metadata: ${error instanceof Error ? error.message : String(error)}`);
		}
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
	private static readonly _META_WORKTREE_BRANCH = 'copilot.worktree.branchName';

	private async _writeWorktreeBranchMetadata(session: URI, branchName: string): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		try {
			await dbRef.object.setMetadata(CopilotAgent._META_WORKTREE_BRANCH, branchName);
		} finally {
			dbRef.dispose();
		}
	}

	private async _readWorktreeBranchMetadata(session: URI): Promise<string | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const value = await ref.object.getMetadata(CopilotAgent._META_WORKTREE_BRANCH);
			return value ?? undefined;
		} finally {
			ref.dispose();
		}
	}

	private async _storeSessionMetadata(session: URI, model: ModelSelection | undefined, workingDirectory: URI | undefined, project: IAgentSessionProjectInfo | undefined, projectResolved = project !== undefined): Promise<void> {
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

	private async _readSessionMetadata(session: URI): Promise<{ model?: ModelSelection; workingDirectory?: URI }> {
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

	private async _readStoredSessionMetadata(session: URI): Promise<{ model?: ModelSelection; workingDirectory?: URI; project?: IAgentSessionProjectInfo; resolved: boolean } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const [model, cwd, resolved, uri, displayName] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_RESOLVED),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_URI),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME),
			]);
			const workingDirectory = cwd ? URI.parse(cwd) : undefined;
			const project = uri && displayName ? { uri: URI.parse(uri), displayName } : undefined;
			return { model: this._parseModelSelection(model), workingDirectory, project, resolved: resolved === 'true' || project !== undefined };
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

	public sync(clientId: string, customizations: CustomizationRef[], progress?: (results: ISyncedCustomization[]) => void) {
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
	private _tools: readonly ToolDefinition[] = [];
	private _clientId = '';

	constructor(
		/** Resolves the current set of applied plugins. May block while a sync is in progress. */
		private readonly _resolvePlugins: () => Promise<readonly IParsedPlugin[]>,
	) { }

	updateTools(clientId: string, tools: readonly ToolDefinition[]): void {
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
