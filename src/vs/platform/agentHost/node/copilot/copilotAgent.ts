/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, ResumeSessionConfig, type CopilotClientOptions, type SessionConfig } from '@github/copilot-sdk';
import { rgPath } from '@vscode/ripgrep';
import * as fs from 'fs/promises';
import { Limiter, SequencerByKey } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { appendEscapedMarkdownInlineCode } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../base/common/lifecycle.js';
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
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { AutoApproveLevel, ISchemaProperty, SessionMode, createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo } from '../../common/agentService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ISessionDataService, SESSION_DB_FILENAME } from '../../common/sessionDataService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { ProtectedResourceMetadata, type ConfigSchema, type ModelSelection, type SessionCustomization, type ToolDefinition } from '../../common/state/protocol/state.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { CustomizationRef, CustomizationStatus, ResponsePartKind, SessionInputResponseKind, parseSubagentSessionUri, type MessageAttachment, type PendingMessage, type PolicyState, type ResponsePart, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from '../agentHostGitService.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';
import { CopilotAgentSession, SessionWrapperFactory, type CopilotSdkMode, type IActiveClientSnapshot } from './copilotAgentSession.js';
import { ICopilotSessionContext, projectFromCopilotContext } from './copilotGitProject.js';
import { parsedPluginsEqual, toSdkCustomAgents, toSdkHooks, toSdkMcpServers, toSdkSkillDirectories } from './copilotPluginConverters.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';
import { ShellManager, createShellTools } from './copilotShellTools.js';

interface ICreatedWorktree {
	readonly repositoryRoot: URI;
	readonly worktree: URI;
}

/**
 * A session that has been requested by a client but has not yet been
 * materialized into a real Copilot SDK session, worktree, or persisted
 * metadata. Created by {@link CopilotAgent.createSession} when no fork is
 * requested, and consumed by {@link CopilotAgent._materializeProvisional}
 * on the first {@link CopilotAgent.sendMessage}.
 *
 * Until materialization the session occupies only an in-memory slot and
 * an entry in the state manager. Disposing a provisional session is a
 * cheap no-op compared with tearing down a real session — there is no
 * worktree to remove and no on-disk state to delete.
 *
 * `model` absorbs {@link CopilotAgent.changeModel} updates that arrive
 * before the first message. The latest session config (isolation / branch /
 * etc.) is read straight from the state manager via
 * {@link IAgentConfigurationService.getSessionConfigValues} at
 * materialization time, so no bespoke forwarding is required for it.
 */
interface IProvisionalSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	/**
	 * Folder the user picked at create time. Used as both the
	 * pre-worktree working directory and the customization directory
	 * (plugin discovery is anchored to the original folder, not to a
	 * worktree path that may not exist yet).
	 */
	readonly workingDirectory: URI;
	/** Most recent model selection. Updated by `changeModel` while provisional. */
	model: ModelSelection | undefined;
	/** Project info eagerly resolved at create time so the summary renders. */
	readonly project: IAgentSessionProjectInfo | undefined;
}

const ThinkingLevelConfigKey = 'thinkingLevel';
const ReasoningEfforts = ['low', 'medium', 'high', 'xhigh'] as const;
type ReasoningEffort = NonNullable<SessionConfig['reasoningEffort']>;

export const COPILOT_AGENT_HOST_SYSTEM_MESSAGE = {
	mode: 'customize',
	sections: {
		identity: {
			action: 'replace',
			content: 'You are an AI assistant using Copilot CLI runtime in VS Code. You help users with software engineering tasks. When asked about your identity, you must state that you are an AI assistant using Copilot CLI runtime in VS Code.',
		},
	},
} satisfies NonNullable<ResumeSessionConfig['systemMessage']>;

interface ISerializedModelSelection {
	id?: unknown;
	config?: unknown;
}

/**
 * Subset of the JSON-RPC `MessageConnection` we reach into via the SDK's
 * private `connection` field to wire plan mode. See {@link CopilotAgent._enablePlanModeOnClient}.
 */
interface IExitPlanModeConnection {
	sendRequest(method: string, params: unknown): Promise<unknown>;
	onRequest(method: string, handler: (params: IExitPlanModeRequestParams) => Promise<IExitPlanModeResponse>): { dispose(): void };
}

/**
 * Payload of the CLI's `exitPlanMode.request` RPC. The CLI dispatches one
 * per `exit_plan_mode` tool invocation when the session was created with
 * `requestExitPlanMode: true`.
 */
export interface IExitPlanModeRequestParams {
	readonly sessionId: string;
	readonly summary: string;
	readonly planContent: string;
	readonly actions: readonly string[];
	readonly recommendedAction: string;
}

/**
 * Response for the CLI's `exitPlanMode.request` RPC. The CLI feeds this
 * directly into `session.respondToExitPlanMode`, which resolves the
 * pending tool call and (when approved) updates the SDK's `currentMode`.
 */
export interface IExitPlanModeResponse {
	readonly approved: boolean;
	readonly selectedAction?: string;
	readonly autoApproveEdits?: boolean;
	readonly feedback?: string;
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
 * Derive a slug-style branch-name hint from the user's first message. Used
 * by the worktree isolation flow so the generated branch name reflects the
 * intent of the session instead of being just a session id.
 *
 * Returns `undefined` if the message has no slug-able content (e.g. only
 * punctuation), in which case the caller falls back to a session-id-only
 * branch name.
 */
export function getCopilotBranchNameHintFromMessage(message: string): string | undefined {
	const words = message
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.split('-')
		.filter(word => word.length > 0)
		.slice(0, 8);
	const hint = words.join('-').slice(0, 48).replace(/-+$/g, '');
	return hint.length > 0 ? hint : undefined;
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

/**
 * Returns a copy of `turns` where `announcement` has been prepended to the
 * first top-level assistant turn's first markdown response part. Used on
 * session restore so the worktree announcement remains visible after the
 * session is reopened. If no assistant content exists yet, a fresh
 * markdown part is inserted at the top of the first turn.
 */
function prependAnnouncementToFirstTurn(
	turns: readonly Turn[],
	announcement: string,
): readonly Turn[] {
	if (turns.length === 0) {
		return turns;
	}
	const result = turns.slice();
	const first = result[0];
	const partIdx = first.responseParts.findIndex(rp => rp.kind === ResponsePartKind.Markdown);
	if (partIdx >= 0) {
		const part = first.responseParts[partIdx];
		const updated: ResponsePart = part.kind === ResponsePartKind.Markdown
			? { ...part, content: announcement + part.content }
			: part;
		const responseParts = first.responseParts.slice();
		responseParts[partIdx] = updated;
		result[0] = { ...first, responseParts };
	} else {
		const responseParts: ResponsePart[] = [
			{ kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
			...first.responseParts,
		];
		result[0] = { ...first, responseParts };
	}
	return result;
}

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilotcli' as const;
	private static readonly _BRANCH_COMPLETION_LIMIT = 25;

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;
	private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
	readonly onDidMaterializeSession = this._onDidMaterializeSession.event;
	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models = this._models;

	private _client: CopilotClient | undefined;
	private _clientStarting: Promise<CopilotClient> | undefined;
	private _githubToken: string | undefined;
	private readonly _sessions = this._register(new DisposableMap<string, CopilotAgentSession>());
	/**
	 * Sessions created by a client but not yet materialized into a Copilot
	 * SDK session + worktree + on-disk metadata. Materialization is deferred
	 * until the first {@link sendMessage}, at which point the entry moves
	 * out of this map and into {@link _sessions}. See {@link IProvisionalSession}.
	 */
	private readonly _provisionalSessions = new Map<string, IProvisionalSession>();
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
	readonly onDidCustomizationsChange: Event<void>;
	/** Per-session active client state for tools + plugin snapshot tracking. */
	private readonly _activeClients = new ResourceMap<ActiveClient>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostTerminalManager private readonly _terminalManager: IAgentHostTerminalManager,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this._plugins = this._register(this._instantiationService.createInstance(PluginController));
		this.onDidCustomizationsChange = this._plugins.onDidChange;
	}

	protected _createCopilotClient(options: CopilotClientOptions): CopilotClient {
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
		return [GITHUB_COPILOT_PROTECTED_RESOURCE];
	}

	getCustomizations(): readonly CustomizationRef[] {
		return this._plugins.getConfiguredHostCustomizations();
	}

	async getSessionCustomizations(session: URI): Promise<readonly SessionCustomization[]> {
		const sessionId = AgentSession.id(session);
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			return this._plugins.getSessionCustomizations(provisional.workingDirectory);
		}
		const entry = this._sessions.get(sessionId);
		const metadata = entry ? undefined : await this._readSessionMetadata(session);
		return this._plugins.getSessionCustomizations(entry?.customizationDirectory ?? metadata?.customizationDirectory ?? metadata?.workingDirectory);
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
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

	/**
	 * Enables plan mode by injecting `requestExitPlanMode: true` into the
	 * payload of every `session.create` / `session.resume` JSON-RPC request,
	 * and registers a connection-level handler for the resulting
	 * `exitPlanMode.request` RPC the CLI sends back.
	 *
	 * The SDK (`@github/copilot-sdk@^0.3.0`) does not expose `onExitPlanMode`
	 * in its public {@link SessionConfig} surface, so both the wire flag and
	 * the response handler are wired through the SDK's private
	 * `MessageConnection`. Once the SDK adds first-class support, this shim
	 * should be removed.
	 */
	protected _enablePlanModeOnClient(client: CopilotClient): void {
		// `connection` is declared private on `CopilotClient` at the type
		// level but is a plain field at runtime — see the SDK's compiled
		// `dist/client.js`.
		const connection = (client as unknown as { connection?: IExitPlanModeConnection }).connection;
		if (!connection) {
			this._logService.warn('[Copilot] Could not enable plan mode: client.connection is null');
			return;
		}
		if (typeof connection.sendRequest !== 'function') {
			this._logService.warn(`[Copilot] Could not enable plan mode: client.connection.sendRequest is ${typeof connection.sendRequest}`);
			return;
		}
		if (typeof connection.onRequest !== 'function') {
			this._logService.warn(`[Copilot] Could not enable plan mode: client.connection.onRequest is ${typeof connection.onRequest}`);
			return;
		}
		const originalSendRequest = connection.sendRequest.bind(connection);
		connection.sendRequest = (method: string, params: unknown) => {
			if ((method === 'session.create' || method === 'session.resume') && params && typeof params === 'object') {
				return originalSendRequest(method, { ...params as Record<string, unknown>, requestExitPlanMode: true });
			}
			return originalSendRequest(method, params);
		};

		// Handle the inbound `exitPlanMode.request` RPC the CLI dispatches
		// when the model invokes `exit_plan_mode`. Routing by `sessionId`
		// hands the request off to the matching {@link CopilotAgentSession},
		// which surfaces it as a {@link SessionInputRequest} and resolves
		// this promise with the user's choice.
		const handlerDisposable = connection.onRequest('exitPlanMode.request', async (params: IExitPlanModeRequestParams): Promise<IExitPlanModeResponse> => {
			const session = this._sessions.get(params.sessionId);
			if (!session) {
				this._logService.warn(`[Copilot] exitPlanMode.request for unknown session ${params.sessionId}`);
				return { approved: false };
			}
			return session.handleExitPlanModeRequest(params);
		});
		this._register(toDisposable(() => handlerDisposable.dispose()));
	}

	// ---- client lifecycle ---------------------------------------------------

	private async _ensureClient(): Promise<CopilotClient> {
		const tokenAtStartup = this._githubToken;
		if (!tokenAtStartup) {
			throw new ProtocolError(AHP_AUTH_REQUIRED, 'Authentication is required to use Copilot', this.getProtectedResources());
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
				gitHubToken: tokenAtStartup,
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
			this._enablePlanModeOnClient(client);
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
				customizationDirectory: metadata.customizationDirectory,
			};
			return result;
		}));
		const result = mapped.filter((s): s is IAgentSessionMetadata => s !== undefined);
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionId = AgentSession.id(session);
		const storedMetadata = await this._readStoredSessionMetadata(session);
		if (!storedMetadata) {
			return undefined;
		}

		const client = await this._ensureClient();
		const sessionMetadata = await client.getSessionMetadata(sessionId);
		if (!sessionMetadata) {
			return undefined;
		}

		let project = storedMetadata?.project;
		if (storedMetadata && !storedMetadata.resolved) {
			const projectLimiter = new Limiter<IAgentSessionProjectInfo | undefined>(1);
			project = await this._resolveSessionProject(sessionMetadata?.context, projectLimiter, new Map<string, Promise<IAgentSessionProjectInfo | undefined>>());
			void this._storeSessionProjectResolution(session, project);
		}

		const workingDirectory = storedMetadata?.workingDirectory ?? (typeof sessionMetadata?.context?.cwd === 'string' ? URI.file(sessionMetadata.context.cwd) : undefined);
		return {
			session,
			startTime: sessionMetadata?.startTime.getTime() ?? Date.now(),
			modifiedTime: sessionMetadata?.modifiedTime.getTime() ?? Date.now(),
			project,
			summary: sessionMetadata?.summary,
			model: storedMetadata?.model,
			workingDirectory,
			customizationDirectory: storedMetadata?.customizationDirectory,
		};
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
			_meta: typeof m.billing?.multiplier === 'number' ? {
				multiplierNumeric: m.billing.multiplier,
			} : undefined,
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

		// When forking, use the SDK's sessions.fork RPC. Forking from a source
		// session that has no turns is equivalent to creating a fresh session;
		// in that case the agent service drops `config.fork` before calling us,
		// so we never enter this branch with a provisional source.
		if (config?.fork) {
			const sourceSessionId = AgentSession.id(config.fork.session);

			// Serialize against the source session to prevent concurrent
			// modifications while we read its state.
			return this._sessionSequencer.queue(sourceSessionId, async () => {
				this._logService.info(`[Copilot] Forking session ${sourceSessionId} at turnId=${config.fork!.turnId}`);

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
				await this._storeSessionMetadata(session, config.model, config.workingDirectory, config.workingDirectory, project, true);
				return { session, workingDirectory: config.workingDirectory, ...(project ? { project } : {}) };
			});
		}

		// Non-fork path: create a *provisional* session. The Copilot SDK
		// session, the worktree (if any), and the on-disk metadata are all
		// deferred until the first {@link sendMessage} via
		// {@link _materializeProvisional}. Until then this session occupies
		// only an in-memory slot plus a state-manager entry, so a workspace
		// switch (or quick close) costs nothing on disk.
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);

		// Idempotency for already-materialized sessions: a duplicate
		// `createSession` for a URI that has already been promoted to a real
		// SDK session (or restored from disk) is a no-op; we return the
		// non-provisional result so the caller doesn't re-fire `SessionAdded`.
		// This guards against client retries that race a successful first
		// message.
		if (this._sessions.has(sessionId)) {
			this._logService.info(`[Copilot] createSession is a no-op: session already materialized: ${sessionUri.toString()}`);
			const project = await projectFromCopilotContext({ cwd: config.workingDirectory.fsPath }, this._gitService);
			return { session: sessionUri, workingDirectory: config.workingDirectory, ...(project ? { project } : {}) };
		}

		// Idempotent: a duplicate `createSession` for a still-provisional URI
		// (e.g. a client retried on reconnect with the same URI) keeps the
		// existing record. We deliberately do NOT overwrite `model` or
		// `workingDirectory`: a re-create payload from a fresh connection sends
		// the eager-create defaults (model: undefined, the same workingDirectory),
		// which would clobber the user's selections accumulated since the
		// original create. The active-client / plugin sync below still runs so
		// the new connection's claim takes effect.
		const alreadyProvisional = this._provisionalSessions.has(sessionId);

		// Seed active-client snapshot if the client claimed it eagerly. This
		// runs identically for provisional and real sessions; the SDK side
		// of activeClient state isn't engaged until materialization.
		if (config.activeClient) {
			const ac = this._getOrCreateActiveClient(sessionUri);
			ac.updateTools(config.activeClient.clientId, config.activeClient.tools);
			if (config.activeClient.customizations !== undefined) {
				await this._plugins.sync(config.activeClient.clientId, config.activeClient.customizations);
			}
		}

		// Compute project metadata cheaply from the original working dir.
		// Worktrees aren't created until materialization, so the project is
		// reported relative to the user's chosen folder.
		const project = await projectFromCopilotContext({ cwd: config.workingDirectory.fsPath }, this._gitService);

		if (!alreadyProvisional) {
			this._provisionalSessions.set(sessionId, {
				sessionId,
				sessionUri,
				workingDirectory: config.workingDirectory,
				model: config.model,
				project,
			});
		}

		this._logService.info(`[Copilot] Session created (provisional): ${sessionUri.toString()}`);
		return { session: sessionUri, workingDirectory: config.workingDirectory, provisional: true, ...(project ? { project } : {}) };
	}

	/**
	 * Promotes a {@link IProvisionalSession} into a real Copilot SDK session
	 * by performing the work that {@link createSession} previously did
	 * eagerly: resolves the working directory (creating a worktree if
	 * `isolation === 'worktree'`), instantiates the {@link CopilotAgentSession},
	 * persists session metadata, and notifies the {@link IAgentService} via
	 * {@link onDidMaterializeSession} so it can fire the deferred
	 * `sessionAdded` protocol notification.
	 *
	 * Called from {@link sendMessage} immediately before a turn is dispatched.
	 * Already runs inside the session sequencer, so concurrent sends serialize
	 * naturally.
	 *
	 * The latest model lives on the provisional record (kept in sync via
	 * {@link changeModel}). The latest session config (isolation / branch /
	 * etc.) is read straight from the state manager via
	 * {@link IAgentConfigurationService.getSessionConfigValues} so any
	 * `SessionConfigChanged` actions that arrived after `createSession` are
	 * honoured without bespoke forwarding.
	 */
	private async _materializeProvisional(sessionId: string, prompt: string): Promise<CopilotAgentSession> {
		const provisional = this._provisionalSessions.get(sessionId);
		if (!provisional) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const client = await this._ensureClient();
		const sessionUri = provisional.sessionUri;
		const liveSessionConfig = this._configurationService.getSessionConfigValues(sessionUri.toString());

		const materializedConfig: IAgentCreateSessionConfig = {
			provider: this.id,
			session: sessionUri,
			workingDirectory: provisional.workingDirectory,
			model: provisional.model,
			config: liveSessionConfig,
		};

		const customizationDirectory = provisional.workingDirectory;
		const activeClient = this._activeClients.get(sessionUri);
		const snapshot = activeClient ? await activeClient.snapshot(customizationDirectory) : undefined;
		const workingDirectory = await this._resolveSessionWorkingDirectory(materializedConfig, sessionId, prompt);
		const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, workingDirectory);
		const sessionConfigBuilder = this._buildSessionConfig(snapshot, shellManager);

		const factory: SessionWrapperFactory = async callbacks => {
			const raw = await client.createSession({
				model: provisional.model?.id,
				reasoningEffort: this._getReasoningEffort(provisional.model),
				sessionId,
				streaming: true,
				workingDirectory: workingDirectory?.fsPath,
				...await sessionConfigBuilder(callbacks),
			});
			return new CopilotSessionWrapper(raw);
		};

		let agentSession: CopilotAgentSession;
		try {
			agentSession = this._createAgentSession(factory, sessionId, shellManager, workingDirectory, customizationDirectory, snapshot);
			await agentSession.initializeSession();
		} catch (error) {
			await this._removeCreatedWorktree(sessionId);
			throw error;
		}

		const project = await projectFromCopilotContext({ cwd: workingDirectory?.fsPath }, this._gitService);

		this._provisionalSessions.delete(sessionId);
		await this._storeSessionMetadata(sessionUri, provisional.model, workingDirectory, customizationDirectory, project, true);

		this._logService.info(`[Copilot] Session materialized: ${sessionUri.toString()}`);
		this._onDidMaterializeSession.fire({ session: sessionUri, workingDirectory, project });
		return agentSession;
	}

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const gitInfo = params.workingDirectory ? await this._getGitInfo(params.workingDirectory) : undefined;

		const isolationProperty = schemaProperty<'folder' | 'worktree'>({
			type: 'string',
			title: localize('agentHost.sessionConfig.isolation', "Isolation"),
			description: localize('agentHost.sessionConfig.isolationDescription', "Where the agent should make changes"),
			enum: gitInfo ? ['folder', 'worktree'] : ['folder'],
			enumLabels: gitInfo ? [localize('agentHost.sessionConfig.isolation.folder', "Folder"), localize('agentHost.sessionConfig.isolation.worktree', "Worktree")] : [localize('agentHost.sessionConfig.isolation.folder', "Folder")],
			enumDescriptions: gitInfo ? [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder"), localize('agentHost.sessionConfig.isolation.worktreeDescription', "Create a Git worktree for isolation")] : [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder")],
			default: gitInfo ? 'worktree' : 'folder',
			readOnly: !gitInfo,
		});

		// Resolve isolation first — downstream schema shapes (branch's
		// read-only mode + enum restriction) depend on the effective value.
		const isolationDefault: 'folder' | 'worktree' = gitInfo ? 'worktree' : 'folder';
		const isolationValue = isolationProperty.validate(params.config?.[SessionConfigKey.Isolation])
			? params.config[SessionConfigKey.Isolation] as 'folder' | 'worktree'
			: isolationDefault;

		let branchProperty: ISchemaProperty<string> | undefined;
		let branchDefault: string | undefined;
		if (gitInfo) {
			const branchReadOnly = isolationValue === 'folder';
			branchDefault = isolationValue === 'worktree' ? gitInfo.defaultBranch : gitInfo.currentBranch;
			branchProperty = schemaProperty<string>({
				type: 'string',
				title: localize('agentHost.sessionConfig.branch', "Branch"),
				description: localize('agentHost.sessionConfig.branchDescription', "Base branch to work from"),
				enum: [branchDefault],
				enumLabels: [branchDefault],
				default: branchDefault,
				enumDynamic: !branchReadOnly,
				readOnly: branchReadOnly,
			});
		}

		const sessionSchema = createSchema({
			[SessionConfigKey.Isolation]: isolationProperty,
			...platformSessionSchema.definition,
			...(branchProperty ? { [SessionConfigKey.Branch]: branchProperty } : {}),
		});

		const values = sessionSchema.validateOrDefault(params.config, {
			[SessionConfigKey.Isolation]: isolationValue,
			[SessionConfigKey.AutoApprove]: 'default' satisfies AutoApproveLevel,
			[SessionConfigKey.Mode]: 'interactive' satisfies SessionMode,
			// Permissions intentionally omitted — leave unset so auto-approval
			// falls through to the host-level `permissions` default, and only
			// materializes on the session once the user hits "Allow in this
			// Session".
			...(branchDefault !== undefined ? { [SessionConfigKey.Branch]: branchDefault } : {}),
		});

		return {
			schema: sessionSchema.toProtocol(),
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
		// Walk up the subagent chain to reach the root SDK session entry;
		// _sessions is keyed by root session IDs only.
		let target = session;
		let parsed;
		while ((parsed = parseSubagentSessionUri(target))) {
			target = parsed.parentSession;
		}
		const sessionId = AgentSession.id(target);
		const entry = this._sessions.get(sessionId);
		entry?.handleClientToolCallComplete(toolCallId, result);
	}

	setCustomizationEnabled(uri: string, enabled: boolean): void {
		this._plugins.setEnabled(uri, enabled);
	}

	async sendMessage(session: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {

			// First message on a provisional session: materialize the SDK
			// session, worktree, and on-disk metadata before continuing. The
			// prompt is forwarded so a worktree-isolated session can derive
			// its branch-name hint from the user's first message.
			let entry: CopilotAgentSession | undefined;
			if (this._provisionalSessions.has(sessionId)) {
				entry = await this._materializeProvisional(sessionId, prompt);
			} else {
				entry = this._sessions.get(sessionId);
			}

			// If the active client's config changed (tools or plugins),
			// dispose this session so it gets resumed with the updated config.
			const activeClient = this._activeClients.get(session);
			const hadCachedEntry = !!entry;
			this._logService.info(`[Copilot:${sessionId}] sendMessage: cachedEntry=${hadCachedEntry}, hasActiveClient=${!!activeClient}, activeClientId=${activeClient ? '(set)' : '(none)'}`);
			if (entry && activeClient && await activeClient.isOutdated(entry.appliedSnapshot, entry.customizationDirectory)) {
				this._logService.info(`[Copilot:${sessionId}] Session config changed (isOutdated=true), refreshing session. snapshotClientId=${entry.appliedSnapshot.clientId}`);
				this._sessions.deleteAndDispose(sessionId);
				entry = undefined;
			}

			if (!entry) {
				this._logService.info(`[Copilot:${sessionId}] No cached entry${hadCachedEntry ? ' (was evicted by isOutdated)' : ''}, calling _resumeSession`);
			}
			entry ??= await this._resumeSession(sessionId);

			// Reset per-turn streaming state on the session so that the
			// next text/reasoning chunk (and any host-emitted announcement)
			// allocates a fresh response part.
			if (turnId) {
				entry.resetTurnState(turnId);
			}

			// Emit any pending first-turn announcement (e.g. worktree
			// created) as a synthetic markdown response part before
			// delegating to the SDK. The SDK's subsequent deltas append to
			// the same markdown part because the session has already
			// allocated `_currentMarkdownPartId`.
			const announcement = this._pendingFirstTurnAnnouncements.get(sessionId);
			if (announcement !== undefined) {
				this._pendingFirstTurnAnnouncements.delete(sessionId);
				entry.emitInitialMarkdown(announcement);
			}

			try {
				const sdkMode = this._resolveSdkMode(session);
				await entry.send(prompt, attachments, turnId, sdkMode);
			} catch (err) {
				const errCode = (err as { code?: number })?.code;
				const errMsg = err instanceof Error ? err.message : String(err);
				this._logService.error(`[Copilot:${sessionId}] entry.send() failed: code=${errCode}, message=${errMsg}, hadCachedEntry=${hadCachedEntry}, errorType=${err?.constructor?.name}`);
				throw err;
			}
		});
	}

	/**
	 * Translates the AHP-side `(mode, autoApprove)` pair to the Copilot
	 * SDK's three-mode space (`interactive` / `plan` / `autopilot`):
	 *
	 *  - `mode='plan'` → SDK `plan` (auto-approval is irrelevant; the
	 *    agent host's existing session-state auto-approval logic handles
	 *    `plan.md` writes).
	 *  - `mode='interactive'` + `autoApprove='autopilot'` → SDK `autopilot`
	 *    (the SDK auto-approves all tool calls).
	 *  - `mode='interactive'` + any other autoApprove → SDK `interactive`
	 *    (the agent host's own auto-approval logic continues to gate tool
	 *    calls based on `autoApprove`).
	 *
	 * Returns `undefined` when no mode is configured for the session, so
	 * the SDK's current mode is left untouched.
	 */
	private _resolveSdkMode(session: URI): CopilotSdkMode | undefined {
		const sessionKey = session.toString();
		const mode = this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Mode);
		if (mode === 'plan') {
			return 'plan';
		}
		if (mode === 'interactive') {
			const autoApprove = this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove);
			return autoApprove === 'autopilot' ? 'autopilot' : 'interactive';
		}
		return undefined;
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

	async getSessionMessages(session: URI): Promise<readonly Turn[]> {
		// If the URI describes a subagent child session (`<parent>/subagent/<toolCallId>`),
		// load the parent's events once and extract the child's filtered turns.
		const subagentInfo = parseSubagentSessionUri(session);
		if (subagentInfo) {
			// Walk up the subagent chain to find the root SDK session entry;
			// _sessions is keyed by root session IDs only.
			let rootSession = subagentInfo.parentSession;
			let parentParsed;
			while ((parentParsed = parseSubagentSessionUri(rootSession))) {
				rootSession = parentParsed.parentSession;
			}
			const rootSessionId = AgentSession.id(rootSession);
			const parentEntry = this._sessions.get(rootSessionId) ?? await this._resumeSession(rootSessionId).catch(err => {
				this._logService.warn(`[Copilot:${rootSessionId}] Failed to resume root for subagent restore`, err);
				return undefined;
			});
			if (!parentEntry) {
				return [];
			}
			return parentEntry.getSubagentMessages(subagentInfo.toolCallId, session.toString());
		}

		const sessionId = AgentSession.id(session);
		// Provisional sessions have no SDK history yet.
		if (this._provisionalSessions.has(sessionId)) {
			return [];
		}
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Failed to resume session for message lookup`, err);
			return undefined;
		});
		if (!entry) {
			return [];
		}
		const rawTurns = await entry.getMessages();

		// If a worktree was created for this session at create-time, prepend
		// If a worktree was created for this session at create-time, prepend
		// the announcement to the first turn so it appears at the top of the
		// first response when the session is reopened. The live path
		// (sendMessage) handles the very first turn when the session is fresh;
		// this path takes over on subsequent loads, where
		// _pendingFirstTurnAnnouncements is empty.
		const worktreeMeta = await this._readWorktreeMetadata(session).catch(err => {
			this._logService.warn(`[Copilot:${sessionId}] Failed to read worktree branch metadata`, err);
			return undefined;
		});
		if (!worktreeMeta?.branchName) {
			return rawTurns;
		}
		return prependAnnouncementToFirstTurn(rawTurns, buildWorktreeAnnouncementText(worktreeMeta.branchName));
	}

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			await this._destroyAndDisposeSession(sessionId);
		});
	}

	async onArchivedChanged(session: URI, isArchived: boolean): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			if (isArchived) {
				await this._cleanupWorktreeOnArchive(session, sessionId);
			} else {
				await this._recreateWorktreeOnUnarchive(session, sessionId);
			}
		});
	}

	private async _cleanupWorktreeOnArchive(session: URI, sessionId: string): Promise<void> {
		const meta = await this._readWorktreeMetadata(session).catch(() => undefined);
		if (!meta?.worktreePath || !meta.repositoryRoot) {
			return;
		}
		const { branchName, worktreePath, repositoryRoot } = meta;

		// Skip if the worktree directory is already gone — nothing to clean.
		try {
			await fs.access(worktreePath.fsPath);
		} catch {
			this._createdWorktrees.delete(sessionId);
			return;
		}

		// Skip if the branch is missing — without it we can't safely recreate
		// the worktree on unarchive, so leave the working tree intact.
		const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
		if (!branchPresent) {
			this._logService.info(`[Copilot:${sessionId}] Skipping worktree cleanup: branch '${branchName}' is missing`);
			return;
		}

		// Skip if there are uncommitted changes — don't silently destroy work.
		const dirty = await this._gitService.hasUncommittedChanges(worktreePath).catch(() => true);
		if (dirty) {
			this._logService.info(`[Copilot:${sessionId}] Skipping worktree cleanup: '${worktreePath.fsPath}' has uncommitted changes`);
			return;
		}

		try {
			await this._gitService.removeWorktree(repositoryRoot, worktreePath);
			this._logService.info(`[Copilot:${sessionId}] Removed worktree '${worktreePath.fsPath}' on archive`);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to remove worktree '${worktreePath.fsPath}' on archive: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this._createdWorktrees.delete(sessionId);
		}
	}

	private async _recreateWorktreeOnUnarchive(session: URI, sessionId: string): Promise<void> {
		const meta = await this._readWorktreeMetadata(session).catch(() => undefined);
		if (!meta?.worktreePath || !meta.repositoryRoot) {
			return;
		}
		const { branchName, worktreePath, repositoryRoot } = meta;

		// Skip if the worktree directory already exists — nothing to do.
		try {
			await fs.access(worktreePath.fsPath);
			return;
		} catch {
			// expected when the worktree was cleaned up on archive
		}

		// Skip if the branch is missing — we have no commit to attach the
		// recreated worktree to.
		const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
		if (!branchPresent) {
			this._logService.info(`[Copilot:${sessionId}] Skipping worktree recreation: branch '${branchName}' is missing`);
			return;
		}

		try {
			await fs.mkdir(URI.joinPath(worktreePath, '..').fsPath, { recursive: true });
			await this._gitService.addExistingWorktree(repositoryRoot, worktreePath, branchName);
			this._createdWorktrees.set(sessionId, { repositoryRoot, worktree: worktreePath });
			this._logService.info(`[Copilot:${sessionId}] Recreated worktree '${worktreePath.fsPath}' on unarchive`);
		} catch (error) {
			this._logService.warn(`[Copilot:${sessionId}] Failed to recreate worktree '${worktreePath.fsPath}' on unarchive: ${error instanceof Error ? error.message : String(error)}`);
		}
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
		if (this._provisionalSessions.has(sessionId)) {
			return;
		}
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
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			provisional.model = model;
			return;
		}
		const entry = this._sessions.get(sessionId);
		if (entry) {
			await entry.setModel(model.id, this._getReasoningEffort(model));
		}
		await this._storeSessionMetadata(session, model, undefined, undefined, undefined);
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
	 * Returns true if this provider owns the given session ID. Includes
	 * provisional sessions that have not yet been materialized.
	 */
	hasSession(session: URI): boolean {
		const sessionId = AgentSession.id(session);
		return this._sessions.has(sessionId) || this._provisionalSessions.has(sessionId);
	}

	// ---- helpers ------------------------------------------------------------

	private _getOrCreateActiveClient(session: URI): ActiveClient {
		let client = this._activeClients.get(session);
		if (!client) {
			client = new ActiveClient(directory => this._plugins.getAppliedPlugins(directory));
			this._activeClients.set(session, client);
		}
		return client;
	}

	/**
	 * Creates a {@link CopilotAgentSession}, registers it in the sessions map,
	 * and returns it. The caller must call {@link CopilotAgentSession.initializeSession}
	 * to wire up the SDK session.
	 */
	private _createAgentSession(wrapperFactory: SessionWrapperFactory, sessionId: string, shellManager: ShellManager, workingDirectory: URI | undefined, customizationDirectory: URI | undefined, snapshot?: IActiveClientSnapshot): CopilotAgentSession {
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
				customizationDirectory,
				clientSnapshot: snapshot,
			},
		);

		this._sessions.set(sessionId, agentSession);
		return agentSession;
	}

	private async _destroyAndDisposeSession(sessionId: string): Promise<void> {
		// Provisional sessions have no SDK session, no worktree, and no
		// on-disk metadata — drop the in-memory record and clean up the
		// active-client snapshot. The state-manager entry is removed by the
		// caller via {@link IAgentService.disposeSession}.
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			this._provisionalSessions.delete(sessionId);
			this._activeClients.delete(provisional.sessionUri);
			return;
		}
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
		const plugins = snapshot?.plugins ?? [];

		return async (callbacks: Parameters<SessionWrapperFactory>[0]) => {
			const shellTools = await createShellTools(shellManager, this._terminalManager, this._logService);
			const customAgents = await toSdkCustomAgents(plugins.flatMap(p => p.agents), this._fileService);
			return {
				onPermissionRequest: callbacks.onPermissionRequest,
				onUserInputRequest: callbacks.onUserInputRequest,
				hooks: toSdkHooks(plugins.flatMap(p => p.hooks), callbacks.hooks),
				mcpServers: toSdkMcpServers(plugins.flatMap(p => p.mcpServers)),
				customAgents,
				skillDirectories: toSdkSkillDirectories(plugins.flatMap(p => p.skills)),
				systemMessage: COPILOT_AGENT_HOST_SYSTEM_MESSAGE,
				tools: [...shellTools, ...callbacks.clientTools],
				// Enable infinite sessions so the SDK provisions a workspace
				// directory (containing `plan.md`, `checkpoints/`, `files/`).
				// The workspace is required for plan mode to work — without
				// it, `rpc.plan.read()` returns `path: null` and the SDK
				// never emits `exit_plan_mode.requested`.
				infiniteSessions: { enabled: true },
			};
		};
	}

	protected async _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this._logService.info(`[Copilot:${sessionId}] _resumeSession called — session not in memory, resuming...`);
		const client = await this._ensureClient();

		const sessionUri = AgentSession.uri(this.id, sessionId);
		const storedMetadata = await this._readSessionMetadata(sessionUri);
		const customizationDirectory = storedMetadata.customizationDirectory ?? storedMetadata.workingDirectory;
		const activeClient = this._activeClients.get(sessionUri);
		const snapshot = activeClient ? await activeClient.snapshot(customizationDirectory) : undefined;
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

		const agentSession = this._createAgentSession(factory, sessionId, shellManager, workingDirectory, customizationDirectory, snapshot);
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

	protected async _resolveSessionWorkingDirectory(config: IAgentCreateSessionConfig | undefined, sessionId: string, prompt?: string): Promise<URI | undefined> {
		if (config?.config?.isolation !== 'worktree' || !config.workingDirectory || typeof config.config.branch !== 'string') {
			return config?.workingDirectory;
		}

		const repositoryRoot = await this._gitService.getRepositoryRoot(config.workingDirectory);
		if (!repositoryRoot) {
			return config.workingDirectory;
		}

		const worktreesRoot = getCopilotWorktreesRoot(repositoryRoot);
		const branchNameHint = prompt ? getCopilotBranchNameHintFromMessage(prompt) : undefined;
		const branchName = getCopilotWorktreeBranchName(sessionId, branchNameHint);
		const worktree = URI.joinPath(worktreesRoot, getCopilotWorktreeName(branchName));
		await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
		const baseBranch = typeof config.config[SessionConfigKey.Branch] === 'string' ? config.config[SessionConfigKey.Branch] as string : undefined;
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
			await this._writeWorktreeMetadata(sessionUri, { branchName, baseBranch, worktreePath: worktree, repositoryRoot });
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
	private static readonly _META_CUSTOMIZATION_DIRECTORY = 'copilot.customizationDirectory';
	private static readonly _META_PROJECT_RESOLVED = 'copilot.project.resolved';
	private static readonly _META_PROJECT_URI = 'copilot.project.uri';
	private static readonly _META_PROJECT_DISPLAY_NAME = 'copilot.project.displayName';
	private static readonly _META_WORKTREE_BRANCH = 'copilot.worktree.branchName';
	private static readonly _META_WORKTREE_PATH = 'copilot.worktree.path';
	private static readonly _META_WORKTREE_REPOSITORY_ROOT = 'copilot.worktree.repositoryRoot';

	private async _writeWorktreeMetadata(session: URI, metadata: { branchName: string; baseBranch: string | undefined; worktreePath: URI; repositoryRoot: URI }): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		try {
			const work: Promise<void>[] = [
				dbRef.object.setMetadata(CopilotAgent._META_WORKTREE_BRANCH, metadata.branchName),
				dbRef.object.setMetadata(CopilotAgent._META_WORKTREE_PATH, metadata.worktreePath.toString()),
				dbRef.object.setMetadata(CopilotAgent._META_WORKTREE_REPOSITORY_ROOT, metadata.repositoryRoot.toString()),
			];
			if (metadata.baseBranch) {
				work.push(dbRef.object.setMetadata(META_DIFF_BASE_BRANCH, metadata.baseBranch));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	private async _readWorktreeMetadata(session: URI): Promise<{ branchName: string; worktreePath?: URI; repositoryRoot?: URI } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const [branchName, worktreePathRaw, repositoryRootRaw] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_WORKTREE_BRANCH),
				ref.object.getMetadata(CopilotAgent._META_WORKTREE_PATH),
				ref.object.getMetadata(CopilotAgent._META_WORKTREE_REPOSITORY_ROOT),
			]);
			if (!branchName) {
				return undefined;
			}
			const worktreePath = worktreePathRaw ? URI.parse(worktreePathRaw) : undefined;
			const repositoryRoot = repositoryRootRaw ? URI.parse(repositoryRootRaw) : undefined;
			return { branchName, worktreePath, repositoryRoot };
		} finally {
			ref.dispose();
		}
	}

	private async _storeSessionMetadata(session: URI, model: ModelSelection | undefined, workingDirectory: URI | undefined, customizationDirectory: URI | undefined, project: IAgentSessionProjectInfo | undefined, projectResolved = project !== undefined): Promise<void> {
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
			if (customizationDirectory) {
				work.push(db.setMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY, customizationDirectory.toString()));
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

	private async _readSessionMetadata(session: URI): Promise<{ model?: ModelSelection; workingDirectory?: URI; customizationDirectory?: URI }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return {};
		}
		try {
			const [model, cwd, customizationDirectory] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
			]);
			return {
				model: this._parseModelSelection(model),
				workingDirectory: cwd ? URI.parse(cwd) : undefined,
				customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : undefined,
			};
		} finally {
			ref.dispose();
		}
	}

	private async _readStoredSessionMetadata(session: URI): Promise<{ model?: ModelSelection; workingDirectory?: URI; customizationDirectory?: URI; project?: IAgentSessionProjectInfo; resolved: boolean } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const [model, cwd, customizationDirectory, resolved, uri, displayName] = await Promise.all([
				ref.object.getMetadata(CopilotAgent._META_MODEL),
				ref.object.getMetadata(CopilotAgent._META_CWD),
				ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_RESOLVED),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_URI),
				ref.object.getMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME),
			]);
			const workingDirectory = cwd ? URI.parse(cwd) : undefined;
			const project = uri && displayName ? { uri: URI.parse(uri), displayName } : undefined;
			return {
				model: this._parseModelSelection(model),
				workingDirectory,
				customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : undefined,
				project,
				resolved: resolved === 'true' || project !== undefined,
			};
		} finally {
			ref.dispose();
		}
	}

	private async _storeSessionProjectResolution(session: URI, project: IAgentSessionProjectInfo | undefined): Promise<void> {
		await this._storeSessionMetadata(session, undefined, undefined, undefined, project, true);
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

interface IResolvedCustomization {
	readonly customization: SessionCustomization;
	readonly pluginDir?: URI;
	readonly plugin?: IParsedPlugin;
}

class PluginController extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _enablement = new Map<string, boolean>();
	private _clientCustomizations: readonly IResolvedCustomization[] = [];
	private _hostCustomizations: readonly IResolvedCustomization[] = [];
	private _clientSync: Promise<readonly IResolvedCustomization[]> = Promise.resolve([]);
	private _hostSync: Promise<readonly IResolvedCustomization[]> = Promise.resolve([]);
	private _clientRevision = 0;
	private _hostRevision = 0;
	private _lastAppliedRefs: readonly CustomizationRef[] = [];

	constructor(
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();

		// Seed from current root config and subscribe to future changes.
		this._applyHostCustomizations();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			this._applyHostCustomizations();
		}));
	}

	public getConfiguredHostCustomizations(): readonly CustomizationRef[] {
		return this._hostCustomizations.map(item => item.customization.customization);
	}

	public getSessionCustomizations(directory: URI | undefined): readonly SessionCustomization[] {
		return [
			...this._hostCustomizations.map(item => this._applyEnablement(item.customization)),
			...this._clientCustomizations.map(item => this._applyEnablement(item.customization)),
		];
	}

	/**
	 * Returns the current parsed plugins, awaiting any pending sync.
	 */
	public async getAppliedPlugins(directory: URI | undefined): Promise<readonly IParsedPlugin[]> {
		const [host, client] = await Promise.all([
			this._hostSync.catch(err => {
				this._logService.warn('[Copilot:PluginController] Host customization update failed', err);
				return this._hostCustomizations;
			}),
			this._clientSync.catch(err => {
				this._logService.warn('[Copilot:PluginController] Customization sync failed', err);
				return this._clientCustomizations;
			}),
		]);

		return [
			...host.filter(item =>
				!!item.plugin
				&& this._isEnabled(item.customization)
			).map(item => item.plugin!),
			...client.filter(item =>
				!!item.plugin
				&& this._isEnabled(item.customization)
			).map(item => item.plugin!),
		];
	}

	public setEnabled(pluginProtocolUri: string, enabled: boolean) {
		this._enablement.set(pluginProtocolUri, enabled);
	}

	/**
	 * Reads the current host customizations from the root config and
	 * resolves them. Skips the update when the configured refs have not
	 * changed since the last application.
	 */
	private _applyHostCustomizations(): void {
		const customizations = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.Customizations) ?? [];
		if (equals(customizations, this._lastAppliedRefs)) {
			return;
		}
		this._lastAppliedRefs = customizations;

		const revision = ++this._hostRevision;
		this._hostCustomizations = customizations.map(customization => ({
			customization: {
				customization,
				enabled: true,
				status: CustomizationStatus.Loading,
			},
		}));
		this._onDidChange.fire();
		this._hostSync = Promise.all(customizations.map(customization => this._resolveConfiguredCustomization(customization))).then(resolved => {
			if (revision === this._hostRevision) {
				this._hostCustomizations = resolved;
			}
			return resolved;
		}).finally(() => {
			if (revision === this._hostRevision) {
				this._onDidChange.fire();
			}
		});
	}

	public sync(clientId: string, customizations: CustomizationRef[], progress?: (results: ISyncedCustomization[]) => void) {
		const revision = ++this._clientRevision;
		this._clientCustomizations = customizations.map(customization => ({
			customization: {
				customization,
				clientId,
				enabled: true,
				status: CustomizationStatus.Loading,
			},
		}));
		progress?.(this._clientCustomizations.map(item => ({ customization: this._applyEnablement(item.customization) })));

		const prev = this._clientSync;
		const promise = this._clientSync = prev.catch(err => {
			this._logService.warn('[Copilot:PluginController] Previous customization sync failed', err);
		}).then(async () => {
			const result = await this._pluginManager.syncCustomizations(clientId, customizations, status => {
				if (revision !== this._clientRevision) {
					return;
				}

				this._clientCustomizations = status.map(customization => ({
					customization: {
						...customization,
						clientId,
					},
				}));
				progress?.(this._clientCustomizations.map(item => ({ customization: this._applyEnablement(item.customization) })));
			});

			const resolved = await Promise.all(result.map(item => this._resolveSyncedCustomization(item, clientId)));
			if (revision === this._clientRevision) {
				this._clientCustomizations = resolved;
			}
			return resolved;
		});

		return promise.then(results => results.map(item => ({
			customization: this._applyEnablement(item.customization),
			...(item.pluginDir ? { pluginDir: item.pluginDir } : {}),
		})));
	}

	private _isEnabled(customization: SessionCustomization): boolean {
		return this._enablement.get(customization.customization.uri) ?? customization.enabled;
	}

	private _applyEnablement(customization: SessionCustomization): SessionCustomization {
		const enabled = this._isEnabled(customization);
		return customization.enabled === enabled ? customization : { ...customization, enabled };
	}

	private async _resolveConfiguredCustomization(customization: CustomizationRef): Promise<IResolvedCustomization> {
		const pluginDir = URI.parse(customization.uri);
		const parsed = await this._tryParsePlugin(pluginDir);
		if (!parsed) {
			return {
				customization: {
					customization,
					enabled: true,
					status: CustomizationStatus.Error,
					statusMessage: localize('copilotAgent.pluginParseError', "Error parsing plugin."),
				},
			};
		}

		return {
			customization: {
				customization,
				enabled: true,
				status: CustomizationStatus.Loaded,
			},
			pluginDir,
			plugin: parsed,
		};
	}

	private async _resolveSyncedCustomization(item: ISyncedCustomization, clientId: string): Promise<IResolvedCustomization> {
		if (!item.pluginDir) {
			return {
				customization: {
					...item.customization,
					clientId,
				},
			};
		}

		const parsed = await this._tryParsePlugin(item.pluginDir);
		if (!parsed) {
			return {
				customization: {
					...item.customization,
					clientId,
					status: CustomizationStatus.Error,
					statusMessage: localize('copilotAgent.pluginParseError', "Error parsing plugin."),
				},
			};
		}

		return {
			customization: {
				...item.customization,
				clientId,
			},
			pluginDir: item.pluginDir,
			plugin: parsed,
		};
	}

	private async _tryParsePlugin(pluginDir: URI): Promise<IParsedPlugin | undefined> {
		try {
			return await parsePlugin(pluginDir, this._fileService, undefined, this._getUserHome());
		} catch (error) {
			this._logService.warn(`[Copilot:PluginController] Error parsing plugin '${pluginDir.toString()}': ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
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
		private readonly _resolvePlugins: (directory: URI | undefined) => Promise<readonly IParsedPlugin[]>,
	) { }

	updateTools(clientId: string, tools: readonly ToolDefinition[]): void {
		this._clientId = clientId;
		this._tools = tools;
	}

	async snapshot(directory: URI | undefined): Promise<IActiveClientSnapshot> {
		return { clientId: this._clientId, tools: this._tools, plugins: await this._resolvePlugins(directory) };
	}

	async isOutdated(snap: IActiveClientSnapshot, directory: URI | undefined): Promise<boolean> {
		const plugins = await this._resolvePlugins(directory);
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
