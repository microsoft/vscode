/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { type IObservable, observableValue } from '../../../../base/common/observable.js';
import { basename, dirname, isAbsolute, join, resolve, sep } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentCodexHomeEnvVar, AgentHostCodexAgentSdkRootEnvVar, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, type AgentProvider } from '../../common/agentService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import type { ConfigSchema, ModelSelection, ProtectedResourceMetadata, ToolDefinition } from '../../common/state/protocol/state.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { type ClientPluginCustomization, type MessageAttachment, type PendingMessage, type SessionInputAnswer, SessionInputResponseKind, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import type { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { IAgentSdkDownloader, IAgentSdkPackage } from '../agentSdkDownloader.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { CodexAppServerClient, JsonRpcError, transportFromChildProcess, type ICodexAppServerClient } from './codexAppServerClient.js';
import { ICodexProxyService, type ICodexProxyHandle } from './codexProxyService.js';
import { createCodexSessionMapState, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapFileChangeOutputDelta, mapFileChangePatchUpdated, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageUpdated, mapTurnCompleted, mapTurnStarted, type ICodexSessionMapState } from './codexMapAppServerEvents.js';
import { resolveCodexInput } from './codexPromptResolver.js';
import { replayThreadToTurns } from './codexReplayMapper.js';
import { CodexSessionMetadataStore } from './codexSessionMetadataStore.js';
import { CodexSessionConfigKey, isCodexSupportedModel, narrowAdditionalDirectories, narrowApprovalPolicy, narrowBoolean, narrowReasoningEffort, narrowSandboxMode, narrowWebSearchMode, normalizeCodexModelId, type CodexApprovalPolicy } from './codexSessionConfigKeys.js';
import type { ReasoningEffort } from './protocol/generated/ReasoningEffort.js';
import type { WebSearchMode } from './protocol/generated/WebSearchMode.js';
import type { SandboxMode } from './protocol/generated/v2/SandboxMode.js';
import type { SandboxPolicy } from './protocol/generated/v2/SandboxPolicy.js';
import type { CommandExecutionApprovalDecision } from './protocol/generated/v2/CommandExecutionApprovalDecision.js';
import type { CommandExecutionRequestApprovalParams } from './protocol/generated/v2/CommandExecutionRequestApprovalParams.js';
import type { CommandExecutionRequestApprovalResponse } from './protocol/generated/v2/CommandExecutionRequestApprovalResponse.js';
import type { GetAccountResponse } from './protocol/generated/v2/GetAccountResponse.js';
import type { ModelListResponse } from './protocol/generated/v2/ModelListResponse.js';
import type { Thread } from './protocol/generated/v2/Thread.js';
import type { ThreadListResponse } from './protocol/generated/v2/ThreadListResponse.js';
import type { ThreadReadResponse } from './protocol/generated/v2/ThreadReadResponse.js';
import type { TurnCompletedNotification } from './protocol/generated/v2/TurnCompletedNotification.js';
import type { TurnStartedNotification } from './protocol/generated/v2/TurnStartedNotification.js';
import type { TurnStartParams } from './protocol/generated/v2/TurnStartParams.js';

const CLIENT_INFO = {
	name: 'vscode_agent_host',
	title: 'VS Code Agent Host',
	// The codex `clientInfo.version` is informational. Hardcoded to a
	// non-empty placeholder; bumping it isn't required when our code
	// changes.
	version: '0.1.0',
};

const CODEX_THINKING_LEVEL_KEY = 'thinkingLevel';
const CODEX_REASONING_EFFORTS: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

const codexSessionConfigSchema = createSchema({
	[CodexSessionConfigKey.ApprovalPolicy]: schemaProperty<CodexApprovalPolicy>({
		type: 'string',
		title: localize('codex.sessionConfig.approvalPolicy', "Approvals"),
		description: localize('codex.sessionConfig.approvalPolicyDescription', "How Codex requests approval for tool calls."),
		enum: ['never', 'on-request', 'on-failure', 'untrusted'],
		enumLabels: [
			localize('codex.sessionConfig.approvalPolicy.never', "No Escalations"),
			localize('codex.sessionConfig.approvalPolicy.onRequest', "Ask When Needed"),
			localize('codex.sessionConfig.approvalPolicy.onFailure', "Ask on Failure"),
			localize('codex.sessionConfig.approvalPolicy.untrusted', "Ask More Often"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.approvalPolicy.neverDescription', "Never ask for elevated permission; commands that cannot run in the sandbox are rejected."),
			localize('codex.sessionConfig.approvalPolicy.onRequestDescription', "Ask only when Codex determines a command needs elevated permission."),
			localize('codex.sessionConfig.approvalPolicy.onFailureDescription', "Try commands in the sandbox first, then ask to retry with elevated permission if the sandbox blocks them."),
			localize('codex.sessionConfig.approvalPolicy.untrustedDescription', "Ask before more command categories so you can review actions more closely."),
		],
		default: 'on-request',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.SandboxMode]: schemaProperty<SandboxMode>({
		type: 'string',
		title: localize('codex.sessionConfig.sandboxMode', "Sandbox"),
		description: localize('codex.sessionConfig.sandboxModeDescription', "Filesystem and network restrictions applied to tool calls."),
		enum: ['read-only', 'workspace-write', 'danger-full-access'],
		enumLabels: [
			localize('codex.sessionConfig.sandboxMode.readOnly', "Read-Only"),
			localize('codex.sessionConfig.sandboxMode.workspaceWrite', "Workspace Write"),
			localize('codex.sessionConfig.sandboxMode.dangerFullAccess', "Full Access (Dangerous)"),
		],
		enumDescriptions: [
			localize('codex.sessionConfig.sandboxMode.readOnlyDescription', "Tool calls can read the workspace but cannot modify files."),
			localize('codex.sessionConfig.sandboxMode.workspaceWriteDescription', "Tool calls can read and write within the workspace; network is controlled separately."),
			localize('codex.sessionConfig.sandboxMode.dangerFullAccessDescription', "Tool calls have unrestricted disk and network access."),
		],
		default: 'workspace-write',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.WebSearchMode]: schemaProperty<WebSearchMode>({
		type: 'string',
		title: localize('codex.sessionConfig.webSearchMode', "Web Search"),
		description: localize('codex.sessionConfig.webSearchModeDescription', "Web-search tool availability for the model."),
		enum: ['disabled', 'cached', 'live'],
		enumLabels: [
			localize('codex.sessionConfig.webSearchMode.disabled', "Disabled"),
			localize('codex.sessionConfig.webSearchMode.cached', "Cached Only"),
			localize('codex.sessionConfig.webSearchMode.live', "Live"),
		],
		default: 'disabled',
		sessionMutable: false,
	}),
	[CodexSessionConfigKey.ModelReasoningEffort]: schemaProperty<ReasoningEffort>({
		type: 'string',
		title: localize('codex.sessionConfig.modelReasoningEffort', "Reasoning Effort"),
		description: localize('codex.sessionConfig.modelReasoningEffortDescription', "Controls how much reasoning effort Codex uses."),
		enum: [...CODEX_REASONING_EFFORTS],
		enumLabels: [
			localize('codex.sessionConfig.modelReasoningEffort.minimal', "Minimal"),
			localize('codex.sessionConfig.modelReasoningEffort.low', "Low"),
			localize('codex.sessionConfig.modelReasoningEffort.medium', "Medium"),
			localize('codex.sessionConfig.modelReasoningEffort.high', "High"),
		],
		default: 'medium',
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.AdditionalDirectories]: schemaProperty<string[]>({
		type: 'array',
		title: localize('codex.sessionConfig.additionalDirectories', "Additional Writable Directories"),
		description: localize('codex.sessionConfig.additionalDirectoriesDescription', "Absolute paths the sandbox is allowed to write to, in addition to the workspace. Only applies when Sandbox is Workspace Write."),
		items: { type: 'string', title: localize('codex.sessionConfig.additionalDirectories.item', "Directory") },
		enumDynamic: true,
		default: [],
		sessionMutable: true,
	}),
	[CodexSessionConfigKey.NetworkAccessEnabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('codex.sessionConfig.networkAccessEnabled', "Network"),
		description: localize('codex.sessionConfig.networkAccessEnabledDescription', "Allow sandboxed tool calls to make outbound network requests. Only applies when Sandbox is Workspace Write."),
		default: false,
		sessionMutable: true,
	}),
	[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
});

const codexVisibleSessionConfigSchema = createSchema({
	[CodexSessionConfigKey.ApprovalPolicy]: codexSessionConfigSchema.definition[CodexSessionConfigKey.ApprovalPolicy],
	[CodexSessionConfigKey.SandboxMode]: codexSessionConfigSchema.definition[CodexSessionConfigKey.SandboxMode],
	[CodexSessionConfigKey.WebSearchMode]: codexSessionConfigSchema.definition[CodexSessionConfigKey.WebSearchMode],
	[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
});

const codexWorkspaceWriteSessionConfigSchema = createSchema({
	...codexVisibleSessionConfigSchema.definition,
	[CodexSessionConfigKey.NetworkAccessEnabled]: codexSessionConfigSchema.definition[CodexSessionConfigKey.NetworkAccessEnabled],
});

interface ICodexSessionConfigDefaults {
	readonly [CodexSessionConfigKey.ApprovalPolicy]: CodexApprovalPolicy;
	readonly [CodexSessionConfigKey.SandboxMode]: SandboxMode;
	readonly [CodexSessionConfigKey.WebSearchMode]: WebSearchMode;
	readonly [CodexSessionConfigKey.ModelReasoningEffort]: ReasoningEffort;
	readonly [CodexSessionConfigKey.AdditionalDirectories]: string[];
	readonly [CodexSessionConfigKey.NetworkAccessEnabled]: boolean;
}

const codexSessionConfigDefaults: ICodexSessionConfigDefaults = {
	[CodexSessionConfigKey.ApprovalPolicy]: 'on-request',
	[CodexSessionConfigKey.SandboxMode]: 'workspace-write',
	[CodexSessionConfigKey.WebSearchMode]: 'disabled',
	[CodexSessionConfigKey.ModelReasoningEffort]: 'medium',
	[CodexSessionConfigKey.AdditionalDirectories]: [],
	[CodexSessionConfigKey.NetworkAccessEnabled]: false,
};

const CodexPrewarmTtlMs = 60_000;

/**
 * Per-session bookkeeping. The codex thread is owned by the shared
 * connection in {@link CodexAgent}; this struct only tracks what the
 * `IAgent` surface needs.
 */
interface ICodexSession {
	/** Caller-facing session id used in the `codex:/<id>` URI; may differ from the codex thread id. */
	readonly sessionId: string;
	/**
	 * Codex app-server thread id used in JSON-RPC `thread/*` and `turn/*` calls.
	 * Undefined until the session has been materialized (first `sendMessage`
	 * triggers `thread/start`). Decoupling materialization from
	 * `createSession` mirrors the Claude harness's provisional/materialize
	 * split and avoids spawning an orphan codex thread when the workbench
	 * rebinds a provisional URI after a chip-selection.
	 */
	threadId: string | undefined;
	readonly sessionUri: URI;
	readonly workingDirectory: URI | undefined;
	readonly mapState: ICodexSessionMapState;
	/**
	 * Phase 4: parked deferreds for `item/commandExecution/requestApproval`,
	 * keyed by the host-side toolCallId. Resolved by
	 * {@link CodexAgent.respondToPermissionRequest}.
	 */
	readonly pendingCommandApprovals: PendingRequestRegistry<CommandExecutionApprovalDecision>;
	/**
	 * Per-session set of "accept for session" decisions. When the user
	 * picks Accept-for-Session in a previous approval, subsequent
	 * approval requests on the same session resolve automatically.
	 */
	readonly acceptedForSession: Set<string>;
	model: ModelSelection | undefined;
	/** Workbench-facing turn id for the active turn. */
	currentTurnId: string | undefined;
	/** Codex app-server turn id for the active turn. */
	currentAppTurnId: string | undefined;
	/** Codex app-server turn id -> workbench-facing turn id. */
	readonly hostTurnIdByAppTurnId: Map<string, string>;
	/** Set when this session was restored (Phase 3) and needs `thread/resume` before the first `turn/start`. */
	needsResume: boolean;
	/** Most recent user prompt sent on this session — used as fallback userMessage text in `turn/started`. */
	lastPromptText: string;
	/** True once the workbench has disposed this session. Guards background prewarm continuations. */
	disposed: boolean;
	/** In-flight background or foreground materialization, shared across callers. */
	materializePromise: Promise<void> | undefined;
	/** Whether the workbench-facing materialize event has been emitted. */
	materializedEventFired: boolean;
	/** TTL timer for a materialized-but-unused prewarmed thread. */
	prewarmTimer: ReturnType<typeof setTimeout> | undefined;
	/** True once the prewarmed session has been claimed by a user turn. */
	prewarmClaimed: boolean;
}

/**
 * Connection state machine. The codex process is spawned lazily on first
 * need (Decision 6) and stays alive for the agent's lifetime.
 */
type ConnectionState =
	| { readonly kind: 'idle' }
	| { readonly kind: 'starting'; readonly promise: Promise<IConnectionReady> }
	| ({ readonly kind: 'ready' } & IConnectionReady);

interface IConnectionReady {
	readonly client: ICodexAppServerClient;
	readonly proxyHandle: ICodexProxyHandle;
	readonly child: ChildProcessWithoutNullStreams;
}

/**
 * `IAgent` implementation backed by `codex app-server`.
 *
 * Phase 2 surface: createSession (blocks on `thread/start`), sendMessage
 * (one `turn/start`, streams `agentMessage` deltas), setPendingMessages
 * (steering via `turn/steer`), abortSession (`turn/interrupt`),
 * disposeSession (`thread/unsubscribe`, no process kill).
 *
 * Decisions 3 (shared process), 6 (lazy spawn), 7 (session id == threadId),
 * 10 (no cwd → reject), 15 (cancel, keep streamed content), 16 (steering),
 * 17 (attachments), 18 (apikey auth).
 */

/**
 * `@openai/codex` distribution descriptor. Lives in this file because it
 * encodes Codex-specific knowledge — the env-var name and the fact that
 * Codex's Linux binaries are statically musl-linked and ship as a single
 * `linux-*` SKU regardless of host libc.
 */
export const CodexSdkPackage: IAgentSdkPackage = {
	id: 'codex',
	devOverrideEnvVar: AgentHostCodexAgentSdkRootEnvVar,
	hasSeparateMuslLinuxPackage: false,
};

export class CodexAgent extends Disposable implements IAgent {

	readonly id: AgentProvider = 'codex';

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
	readonly onDidMaterializeSession = this._onDidMaterializeSession.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

	/** Keyed by caller-facing sessionId (the URI host). */
	private readonly _sessions = new Map<string, ICodexSession>();
	/** Inverse map: codex threadId → caller-facing sessionId, for routing codex notifications back to sessions. */
	private readonly _sessionIdByThreadId = new Map<string, string>();
	private _githubToken: string | undefined;
	private _connection: ConnectionState = { kind: 'idle' };
	private _modelsRefreshPromise: Promise<void> | undefined;
	private readonly _metadataStore: CodexSessionMetadataStore;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@ICodexProxyService private readonly _codexProxyService: ICodexProxyService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentSdkDownloader private readonly _agentSdkDownloader: IAgentSdkDownloader,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._metadataStore = instantiationService.createInstance(CodexSessionMetadataStore);
	}

	// #region Auth

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [GITHUB_COPILOT_PROTECTED_RESOURCE];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
			return false;
		}
		const changed = this._githubToken !== token;
		this._githubToken = token;
		if (changed && this._connection.kind === 'ready') {
			// Codex stays running — proxy reads the new token from its
			// own cell on the next request (Decision 4).
			this._connection.proxyHandle.setToken(token);
			this._queueModelRefresh(token);
		} else if (changed) {
			// Defer model refresh until the connection comes up.
			this._queueModelRefresh(token);
		}
		this._logService.info('[Codex] Auth token updated');
		return true;
	}

	private _queueModelRefresh(token: string): void {
		const refreshPromise = this._refreshModels(token).finally(() => {
			if (this._modelsRefreshPromise === refreshPromise) {
				this._modelsRefreshPromise = undefined;
			}
		});
		this._modelsRefreshPromise = refreshPromise;
		void this._modelsRefreshPromise;
	}

	private _ensureAuthenticated(): string {
		const token = this._githubToken;
		if (!token) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				'Authentication is required to use Codex',
				this.getProtectedResources(),
			);
		}
		return token;
	}

	private _defaultModel(): ModelSelection | undefined {
		const models = this._models.get();
		const chosen = models[0];
		return chosen ? { id: chosen.id } : undefined;
	}

	private _supportedModelOrUndefined(model: ModelSelection | undefined): ModelSelection | undefined {
		if (model) {
			const normalizedId = normalizeCodexModelId(model.id);
			if (normalizedId) {
				return normalizedId === model.id ? model : { ...model, id: normalizedId };
			}
		}
		if (model) {
			this._logService.warn(`[Codex] Ignoring unsupported model '${model.id}'`);
		}
		return this._defaultModel();
	}

	private async _resolveModel(session: ICodexSession): Promise<ModelSelection> {
		const selected = this._supportedModelOrUndefined(session.model);
		if (selected) {
			session.model = selected;
			return selected;
		}
		if (this._modelsRefreshPromise) {
			await this._modelsRefreshPromise;
		}
		const refreshed = this._defaultModel();
		if (refreshed) {
			session.model = refreshed;
			return refreshed;
		}
		throw new Error('Codex requires a GPT-5 or Codex model, but no supported models are available.');
	}

	private _createReasoningEffortConfigSchema(): ConfigSchema {
		return {
			type: 'object',
			properties: {
				[CODEX_THINKING_LEVEL_KEY]: {
					type: 'string',
					title: localize('codex.modelThinkingLevel.title', "Thinking Level"),
					description: localize('codex.modelThinkingLevel.description', "Controls how much reasoning effort Codex uses."),
					default: 'medium',
					enum: [...CODEX_REASONING_EFFORTS],
					enumLabels: [
						localize('codex.modelThinkingLevel.minimal', "Minimal"),
						localize('codex.modelThinkingLevel.low', "Low"),
						localize('codex.modelThinkingLevel.medium', "Medium"),
						localize('codex.modelThinkingLevel.high', "High"),
					],
				},
			},
		};
	}

	private _getReasoningEffort(session: ICodexSession): ReasoningEffort | undefined {
		const modelConfigEffort = narrowReasoningEffort(session.model?.config?.[CODEX_THINKING_LEVEL_KEY]);
		if (modelConfigEffort) {
			return modelConfigEffort;
		}
		const config = this._configurationService.getSessionConfigValues(session.sessionUri.toString());
		return narrowReasoningEffort(config?.[CodexSessionConfigKey.ModelReasoningEffort]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ModelReasoningEffort];
	}

	private _readSessionConfig(session: ICodexSession): ReturnType<typeof codexSessionConfigSchema.validateOrDefault> {
		return codexSessionConfigSchema.validateOrDefault(
			this._configurationService.getSessionConfigValues(session.sessionUri.toString()),
			codexSessionConfigDefaults,
		);
	}

	private _sandboxPolicy(session: ICodexSession, config: ReturnType<typeof codexSessionConfigSchema.validateOrDefault>): SandboxPolicy {
		const mode = narrowSandboxMode(config[CodexSessionConfigKey.SandboxMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode];
		if (mode === 'danger-full-access') {
			return { type: 'dangerFullAccess' };
		}
		const networkAccess = narrowBoolean(config[CodexSessionConfigKey.NetworkAccessEnabled]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.NetworkAccessEnabled];
		if (mode === 'read-only') {
			return { type: 'readOnly', networkAccess: false };
		}
		const writableRoots = [
			...(session.workingDirectory ? [session.workingDirectory.fsPath] : []),
			...(narrowAdditionalDirectories(config[CodexSessionConfigKey.AdditionalDirectories]) ?? []),
		];
		return {
			type: 'workspaceWrite',
			writableRoots,
			networkAccess,
			excludeTmpdirEnvVar: false,
			excludeSlashTmp: false,
		};
	}

	private _turnStartOptions(session: ICodexSession): Pick<TurnStartParams, 'approvalPolicy' | 'sandboxPolicy' | 'effort' | 'runtimeWorkspaceRoots'> {
		const config = this._readSessionConfig(session);
		const approvalPolicy = narrowApprovalPolicy(config[CodexSessionConfigKey.ApprovalPolicy]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy];
		const sandboxPolicy = this._sandboxPolicy(session, config);
		const runtimeWorkspaceRoots = sandboxPolicy.type === 'workspaceWrite' ? sandboxPolicy.writableRoots : undefined;
		return {
			approvalPolicy,
			sandboxPolicy,
			effort: this._getReasoningEffort(session),
			...(runtimeWorkspaceRoots ? { runtimeWorkspaceRoots } : {}),
		};
	}

	private async _refreshModels(token: string): Promise<void> {
		try {
			const all = await this._copilotApiService.models(token);
			const conn = await this._ensureConnection();
			const codexModelDefaults = new Map<string, boolean>();
			let cursor: string | null | undefined = null;
			do {
				const response: ModelListResponse = await conn.client.request<'model/list', ModelListResponse>('model/list', { cursor, includeHidden: false });
				for (const model of response.data) {
					if (!model.hidden) {
						codexModelDefaults.set(model.model, model.isDefault);
					}
				}
				cursor = response.nextCursor;
			} while (cursor);
			if (this._githubToken !== token) {
				return;
			}
			const configSchema = this._createReasoningEffortConfigSchema();
			const filtered = all
				.filter(m => !!m.supported_endpoints?.includes('/responses') && codexModelDefaults.has(m.id) && isCodexSupportedModel(m.id, m.name))
				.sort((a, b) => (Number(b.is_chat_default) - Number(a.is_chat_default)) || (Number(codexModelDefaults.get(b.id)) - Number(codexModelDefaults.get(a.id))))
				.map((m): IAgentModelInfo => ({
					provider: this.id,
					id: m.id,
					name: m.name ?? m.id,
					maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
					supportsVision: !!m.capabilities?.supports?.vision,
					configSchema,
				}));
			this._models.set(filtered, undefined);
		} catch (err) {
			this._logService.warn(`[Codex] Failed to refresh models: ${err instanceof Error ? err.message : String(err)}`);
			if (this._githubToken === token) {
				this._models.set([], undefined);
			}
		}
	}

	// #endregion

	// #region Connection lifecycle

	/**
	 * Lazily spawn the codex app-server, initialize the connection,
	 * authenticate via apiKey, and return the ready connection. Idempotent
	 * — concurrent callers share the same promise.
	 */
	private _ensureConnection(): Promise<IConnectionReady> {
		if (this._connection.kind === 'ready') {
			return Promise.resolve(this._connection);
		}
		if (this._connection.kind === 'starting') {
			return this._connection.promise;
		}
		const token = this._ensureAuthenticated();
		const promise = this._startConnection(token).then(ready => {
			this._connection = { kind: 'ready', ...ready };
			return ready;
		}).catch(err => {
			this._connection = { kind: 'idle' };
			throw err;
		});
		this._connection = { kind: 'starting', promise };
		return promise;
	}

	private async _startConnection(token: string): Promise<IConnectionReady> {
		// Resolve the Codex SDK root via the downloader: dev override → cache →
		// download from `product.agentSdks.codex`. We spawn the native codex
		// binary inside the platform package directly (the same shape the JS
		// shim at `node_modules/@openai/codex/bin/codex.js` would resolve to)
		// — going through the shim adds a launcher hop and forces an
		// `ELECTRON_RUN_AS_NODE` round-trip when the agent host runs as an
		// Electron utility process.
		const root = await this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, CancellationToken.None);
		const codexTarget = codexPackageSuffix(process.platform, process.arch);
		if (!codexTarget) {
			throw new Error(`Codex: unsupported platform ${process.platform}-${process.arch}`);
		}
		const triple = codexBinaryTriple(codexTarget);
		if (!triple) {
			throw new Error(`Codex: no binary triple known for sdkTarget '${codexTarget}'`);
		}
		const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
		const binaryPath = join(root, 'node_modules', `@openai/codex-${codexTarget}`, 'vendor', triple, 'bin', binaryName);
		try {
			fs.accessSync(binaryPath, fs.constants.X_OK);
		} catch (err) {
			throw new Error(`Codex binary not executable: ${binaryPath} (${err instanceof Error ? err.message : String(err)})`);
		}

		const proxyHandle = await this._codexProxyService.start(token);

		// Build child env: inherit, override OPENAI_API_KEY so the proxy's
		// nonce check passes. The proxy provider is plumbed via `-c` CLI
		// overrides below; we deliberately do NOT write a config.toml,
		// which would force a managed CODEX_HOME and trip codex's
		// "refusing to write helper binaries under TMPDIR" warning.
		const env: NodeJS.ProcessEnv = {
			...process.env,
			OPENAI_API_KEY: proxyHandle.nonce,
		};
		const userCodexHome = process.env[AgentHostCodexAgentCodexHomeEnvVar];
		if (userCodexHome) {
			env.CODEX_HOME = userCodexHome;
		}

		// Define an in-memory `vscode-proxy` provider that points at our
		// local proxy with WebSocket transport disabled. Using `-c`
		// overrides composes with the user's ~/.codex/config.toml — their
		// other settings (model, MCP servers, etc.) still apply.
		const providerOverrides = [
			`model_provider="vscode-proxy"`,
			`model_providers.vscode-proxy.name="VS Code Proxy"`,
			`model_providers.vscode-proxy.base_url="${proxyHandle.baseUrl}/v1"`,
			`model_providers.vscode-proxy.wire_api="responses"`,
			`model_providers.vscode-proxy.env_key="OPENAI_API_KEY"`,
			`model_providers.vscode-proxy.requires_openai_auth=false`,
			`model_providers.vscode-proxy.supports_websockets=false`,
		];

		// Extra args forwarded as JSON from the workbench setting.
		const extraArgs = parseBinaryArgs(process.env[AgentHostCodexAgentBinaryArgsEnvVar]);
		const args = ['app-server', ...providerOverrides.flatMap(kv => ['-c', kv]), ...extraArgs];

		this._logService.info(`[Codex] spawning ${binaryPath} ${args.join(' ')}`);
		const child = spawn(binaryPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

		// Surface stderr to the log channel — codex writes useful startup
		// diagnostics there. Mirror Claude's pattern.
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', chunk => this._logService.info(`[Codex stderr] ${String(chunk).trimEnd()}`));

		const transport = transportFromChildProcess(child);
		const client = new CodexAppServerClient(transport, (level, msg) => {
			this._logService.info(`[CodexClient ${level}] ${msg}`);
		});

		// Tear everything down if the child dies on its own.
		client.onExit(e => {
			this._logService.warn(`[Codex] app-server exited code=${e.code} signal=${e.signal}`);
			this._handleConnectionLost();
		});
		client.onTransportError(err => {
			this._logService.error(`[Codex] transport error: ${err.message}`);
			this._handleConnectionLost();
		});

		// Initialize handshake. Failure here is fatal for the connection.
		try {
			await client.request<'initialize'>('initialize', {
				clientInfo: CLIENT_INFO,
				capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: null },
			});
			client.notify<'initialized'>('initialized', undefined as never);
			// With `requires_openai_auth = false` on the proxy provider,
			// codex does not require a separate login step — the proxy
			// nonce is read from OPENAI_API_KEY by the provider's env_key.
			if (userCodexHome) {
				// User-provided CODEX_HOME may target a provider that
				// still requires auth; preserve the apiKey login path.
				await client.request<'account/login/start'>('account/login/start', {
					type: 'apiKey',
					apiKey: proxyHandle.nonce,
				});
			}
			void this._logAccountSnapshot(client);
		} catch (err) {
			client.dispose();
			proxyHandle.dispose();
			try { child.kill('SIGKILL'); } catch { /* already dead */ }
			throw err;
		}

		// Wire global notification → SessionAction dispatch.
		this._registerIgnoredNotifications(client);
		this._register(client.onNotification('turn/started', params => this._dispatchByThread(params.threadId, s => this._handleTurnStartedNotification(s, params))));
		this._register(client.onNotification('item/started', params => this._dispatchByThread(params.threadId, s => mapItemStarted(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/agentMessage/delta', params => this._dispatchByThread(params.threadId, s => mapAgentMessageDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/commandExecution/outputDelta', params => this._dispatchByThread(params.threadId, s => mapCommandExecutionOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/fileChange/patchUpdated', params => this._dispatchByThread(params.threadId, s => mapFileChangePatchUpdated(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/fileChange/outputDelta', params => this._dispatchByThread(params.threadId, s => mapFileChangeOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/mcpToolCall/progress', params => this._dispatchByThread(params.threadId, s => mapMcpToolCallProgress(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/reasoning/summaryPartAdded', params => this._dispatchByThread(params.threadId, s => mapReasoningSummaryPartAdded(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/reasoning/summaryTextDelta', params => this._dispatchByThread(params.threadId, s => mapReasoningSummaryTextDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/reasoning/textDelta', params => this._dispatchByThread(params.threadId, s => mapReasoningTextDelta(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('thread/tokenUsage/updated', params => this._dispatchByThread(params.threadId, s => mapTokenUsageUpdated(this._withHostTurnId(s, params)))));
		this._register(client.onNotification('item/completed', params => this._dispatchByThread(params.threadId, s => mapItemCompleted(s.mapState, this._withHostTurnId(s, params)))));
		this._register(client.onNotification('turn/completed', params => this._dispatchByThread(params.threadId, s => this._handleTurnCompletedNotification(s, params))));

		// Phase 4: command-execution approval requests. Park on a
		// per-session deferred, emit `SessionToolCallReady` in the
		// PendingConfirmation state, and answer codex when the user
		// (or accept-for-session memoization) decides.
		this._register(client.onRequest<'item/commandExecution/requestApproval'>(
			'item/commandExecution/requestApproval',
			params => this._handleCommandApprovalRequestRpc(params),
		));

		return { client, proxyHandle, child };
	}

	private _hostTurnId(session: ICodexSession, appTurnId: string): string {
		return session.hostTurnIdByAppTurnId.get(appTurnId) ?? appTurnId;
	}

	private _withHostTurnId<T extends { readonly turnId: string }>(session: ICodexSession, params: T): T {
		const turnId = this._hostTurnId(session, params.turnId);
		return turnId === params.turnId ? params : { ...params, turnId };
	}

	private _withHostTurn<T extends { readonly turn: { readonly id: string } }>(session: ICodexSession, params: T): T {
		const appTurnId = params.turn.id;
		const hostTurnId = session.currentTurnId ?? this._hostTurnId(session, appTurnId);
		session.hostTurnIdByAppTurnId.set(appTurnId, hostTurnId);
		session.currentAppTurnId = appTurnId;
		return hostTurnId === appTurnId ? params : { ...params, turn: { ...params.turn, id: hostTurnId } };
	}

	private _handleTurnStartedNotification(session: ICodexSession, params: TurnStartedNotification): SessionAction[] {
		// The workbench already dispatched the canonical turn start before sendMessage.
		// Codex's event only establishes app-server turn id correlation for later items.
		mapTurnStarted(session.mapState, this._withHostTurn(session, params), session.lastPromptText);
		return [];
	}

	private _handleTurnCompletedNotification(session: ICodexSession, params: TurnCompletedNotification): SessionAction[] {
		const appTurnId = params.turn.id;
		const out = mapTurnCompleted(session.mapState, this._withHostTurn(session, params));
		// Codex reports app-server turn ids, while the workbench owns host turn ids.
		// Clear the correlation after completion so later turns cannot reuse stale ids.
		if (session.currentAppTurnId === appTurnId || session.currentTurnId === this._hostTurnId(session, appTurnId)) {
			session.currentTurnId = undefined;
			session.currentAppTurnId = undefined;
		}
		session.hostTurnIdByAppTurnId.delete(appTurnId);
		return out;
	}

	private _registerIgnoredNotifications(client: ICodexAppServerClient): void {
		const ignored = [
			'thread/started', // thread/start response is authoritative for session materialization.
			'thread/status/changed', // Codex thread status is not surfaced in Agent Host state yet.
			'thread/settings/updated', // VS Code owns session config; Codex settings echoes are not consumed yet.
			'thread/goal/updated', // Goals are not surfaced in the Agent Host UI yet.
			'thread/goal/cleared', // Goals are not surfaced in the Agent Host UI yet.
			'account/updated', // Account state is read on connect; live account updates are not surfaced yet.
			'account/rateLimits/updated', // Rate-limit UI/state is not implemented yet.
			'remoteControl/status/changed', // Remote-control state is not part of the VS Code integration.
			'serverRequest/resolved', // We resolve requests through JSON-RPC responses, so this echo is informational.
		] as const;
		for (const method of ignored) {
			this._register(client.onNotification(method, () => { /* intentionally ignored */ }));
		}
	}

	private async _logAccountSnapshot(client: ICodexAppServerClient): Promise<void> {
		try {
			const response = await client.request<'account/read', GetAccountResponse>('account/read', { refreshToken: false });
			const accountType = response.account?.type ?? 'none';
			const planType = response.account?.type === 'chatgpt' ? response.account.planType : undefined;
			this._logService.info(`[Codex] account/read accountType=${accountType} requiresOpenaiAuth=${response.requiresOpenaiAuth}${planType ? ` planType=${planType}` : ''}`);
		} catch (err) {
			this._logService.warn(`[Codex] account/read failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _dispatchByThread(threadId: string, mapFn: (s: ICodexSession) => ReturnType<typeof mapTurnStarted>): void {
		const sessionId = this._sessionIdByThreadId.get(threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			// Usually an unclaimed prewarm; ignore.
			this._logService.trace(`[Codex] Ignoring notification for untracked threadId=${threadId}; likely unclaimed prewarm`);
			return;
		}
		const actions = mapFn(session);
		for (const action of actions) {
			this._onDidSessionProgress.fire({ kind: 'action', session: session.sessionUri, action });
		}
	}

	/**
	 * Phase 4: handle `item/commandExecution/requestApproval` from
	 * codex. Look up the host-side tool call for the item, emit a
	 * `SessionToolCallReady` in PendingConfirmation, park on a deferred
	 * keyed by toolCallId, and resolve when the user (or the
	 * accept-for-session memo) decides. Unknown sessions / items
	 * decline silently so codex stops blocking.
	 */
	private async _handleCommandApprovalRequestRpc(params: CommandExecutionRequestApprovalParams): Promise<{ readonly result: CommandExecutionRequestApprovalResponse }> {
		// The request handler must return Codex's JSON-RPC result wrapper; keep
		// the approval method below focused on the host-side permission decision.
		const decision = await this._handleCommandApprovalRequest(params);
		return { result: { decision } };
	}

	private async _handleCommandApprovalRequest(params: {
		readonly threadId: string;
		readonly turnId: string;
		readonly itemId: string;
		readonly command?: string | null;
		readonly reason?: string | null;
	}): Promise<CommandExecutionApprovalDecision> {
		const sessionId = this._sessionIdByThreadId.get(params.threadId);
		const session = sessionId ? this._sessions.get(sessionId) : undefined;
		if (!session) {
			this._logService.warn(`[Codex] commandExecution/requestApproval for unknown threadId=${params.threadId}; declining`);
			return 'decline';
		}
		const entry = session.mapState.itemToToolCall.get(params.itemId);
		if (!entry) {
			this._logService.warn(`[Codex:${sessionId}] commandExecution/requestApproval for unknown itemId=${params.itemId}; declining`);
			return 'decline';
		}
		const command = params.command ?? '';
		// Accept-for-session memo: if the user previously accepted this
		// exact command for the session, auto-accept without prompting.
		if (command && session.acceptedForSession.has(command)) {
			return 'acceptForSession';
		}
		const confirmationTitle = params.reason ?? 'Run shell command';
		// Atomically register the deferred and fire the
		// PendingConfirmation signal so a synchronous responder can't
		// miss the registration.
		const decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
			this._fire(session.sessionUri, {
				type: ActionType.SessionToolCallReady,
				turnId: entry.turnId,
				toolCallId: entry.toolCallId,
				invocationMessage: command,
				toolInput: command,
				confirmationTitle,
			});
		});
		// Track accept-for-session decisions for the next request.
		if (decision === 'acceptForSession' && command) {
			session.acceptedForSession.add(command);
		}
		return decision;
	}

	private _handleConnectionLost(): void {
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		this._connection = { kind: 'idle' };
		// Notify every known session with a single SessionError + complete
		// pair so the UI surfaces "agent disconnected" cleanly.
		for (const session of this._sessions.values()) {
			// Unpark any pending approvals so awaiters unwind.
			session.pendingCommandApprovals.denyAll('decline');
			const turnId = session.currentTurnId;
			const appTurnId = session.currentAppTurnId;
			session.currentTurnId = undefined;
			session.currentAppTurnId = undefined;
			if (appTurnId) {
				session.hostTurnIdByAppTurnId.delete(appTurnId);
			}
			if (turnId) {
				this._onDidSessionProgress.fire({
					kind: 'action',
					session: session.sessionUri,
					action: {
						type: ActionType.SessionError,
						turnId,
						error: { errorType: 'CodexDisconnected', message: 'Codex app-server disconnected; session must restart.' },
					},
				});
				this._onDidSessionProgress.fire({
					kind: 'action',
					session: session.sessionUri,
					action: { type: ActionType.SessionTurnComplete, turnId },
				});
			}
		}
		// Release resources. The proxy handle is refcounted and drops
		// the underlying server once everyone releases.
		try {
			conn.client.dispose();
		} catch (err) {
			this._logService.error(`[Codex] Failed to dispose app-server client after connection lost: ${err instanceof Error ? err.message : String(err)}`);
		}
		try {
			conn.proxyHandle.dispose();
		} catch (err) {
			this._logService.error(`[Codex] Failed to dispose proxy handle after connection lost: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// #endregion

	// #region IAgent methods

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('codexAgent.displayName', "Codex"),
			description: localize('codexAgent.description', "Codex agent backed by the OpenAI Codex app-server"),
		};
	}

	async createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
		this._logService.info(`[Codex DEBUG] createSession session=${config.session?.toString() ?? '(none)'} model=${config.model?.id ?? '(none)'} cwd=${config.workingDirectory?.toString() ?? '(none)'}`);
		this._ensureAuthenticated();
		if (config.fork) {
			throw new Error('Codex agent does not support session forking');
		}
		if (!config.workingDirectory) {
			throw new Error('Codex requires a working directory; pass `workingDirectory` to createSession');
		}

		// Provisional / lazy materialize. We DON'T call `thread/start` here
		// because the workbench may rebind this URI to a fresh one when the
		// user changes a chip selection, and we'd otherwise leak an
		// orphan codex thread per rebind. The actual `thread/start` happens
		// on the first `sendMessage` (or `getSessionMetadata` for restore).
		const effectiveModel = this._supportedModelOrUndefined(config.model);
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = config.session ?? AgentSession.uri(this.id, sessionId);

		// If the workbench is rebinding this URI (createSession arriving
		// after a previous dispose for the same id), reuse the existing
		// entry so we don't lose accumulated state.
		const existing = this._sessions.get(sessionId);
		if (existing) {
			existing.model = effectiveModel ?? existing.model;
			return {
				session: sessionUri,
				workingDirectory: existing.workingDirectory ?? config.workingDirectory,
				provisional: existing.threadId === undefined,
			};
		}

		const session: ICodexSession = {
			sessionId,
			threadId: undefined,
			sessionUri,
			workingDirectory: config.workingDirectory,
			mapState: createCodexSessionMapState(),
			pendingCommandApprovals: new PendingRequestRegistry<CommandExecutionApprovalDecision>(),
			acceptedForSession: new Set<string>(),
			model: effectiveModel,
			currentTurnId: undefined,
			currentAppTurnId: undefined,
			hostTurnIdByAppTurnId: new Map<string, string>(),
			needsResume: false,
			lastPromptText: '',
			disposed: false,
			materializePromise: undefined,
			materializedEventFired: false,
			prewarmTimer: undefined,
			prewarmClaimed: false,
		};
		this._sessions.set(sessionId, session);
		this._schedulePrewarm(session);
		return {
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			provisional: true,
		};
	}

	/**
	 * Lazily start (or resume) a codex thread for `session`. Idempotent:
	 * if `threadId` is already populated, just returns. Called from
	 * `sendMessage` before the first `turn/start`.
	 */
	private async _materializeIfNeeded(session: ICodexSession, fireMaterializedEvent = true): Promise<void> {
		if (session.disposed) {
			return;
		}
		if (session.threadId !== undefined) {
			if (fireMaterializedEvent) {
				this._fireMaterialized(session);
			}
			return;
		}
		if (session.materializePromise) {
			await session.materializePromise;
			if (fireMaterializedEvent) {
				this._fireMaterialized(session);
			}
			return;
		}
		session.materializePromise = this._materialize(session).finally(() => {
			session.materializePromise = undefined;
		});
		await session.materializePromise;
		if (fireMaterializedEvent) {
			this._fireMaterialized(session);
		}
	}

	private async _materialize(session: ICodexSession): Promise<void> {
		if (session.disposed) {
			return;
		}
		if (!session.workingDirectory) {
			throw new Error(`Cannot materialize codex session ${session.sessionId}: no working directory`);
		}
		const conn = await this._ensureConnection();
		const config = this._readSessionConfig(session);
		const model = await this._resolveModel(session);
		const startResult = await conn.client.request<'thread/start', { thread: { id: string } }>('thread/start', {
			cwd: session.workingDirectory.fsPath,
			model: model.id,
			approvalPolicy: narrowApprovalPolicy(config[CodexSessionConfigKey.ApprovalPolicy]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
			sandbox: narrowSandboxMode(config[CodexSessionConfigKey.SandboxMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode],
			config: {
				web_search: narrowWebSearchMode(config[CodexSessionConfigKey.WebSearchMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.WebSearchMode],
			},
		});
		const threadId = startResult.thread.id;
		if (session.disposed) {
			try {
				await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			} catch (err) {
				this._logService.info(`[Codex:${threadId}] thread/unsubscribe after disposed prewarm failed: ${err instanceof Error ? err.message : String(err)}`);
			}
			return;
		}
		session.threadId = threadId;
		this._logService.info(`[Codex DEBUG] materialized session=${session.sessionUri.toString()} threadId=${session.threadId}`);
		this._sessionIdByThreadId.set(session.threadId, session.sessionId);
	}

	private _fireMaterialized(session: ICodexSession): void {
		if (session.disposed) {
			return;
		}
		if (session.materializedEventFired) {
			return;
		}
		session.materializedEventFired = true;
		this._onDidMaterializeSession.fire({
			session: session.sessionUri,
			workingDirectory: session.workingDirectory,
			project: undefined,
		});
	}

	private _schedulePrewarm(session: ICodexSession): void {
		if (!session.workingDirectory) {
			return;
		}
		void this._materializeIfNeeded(session, false).then(() => {
			if (session.prewarmClaimed || session.threadId === undefined) {
				return;
			}
			this._logService.info(`[Codex] prewarm ready session=${session.sessionUri.toString()} threadId=${session.threadId}`);
			const prewarmTimer = setTimeout(() => {
				void this._expirePrewarm(session);
			}, CodexPrewarmTtlMs);
			session.prewarmTimer = prewarmTimer;
		}).catch(err => {
			this._logService.warn(`[Codex] prewarm failed session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	private async _expirePrewarm(session: ICodexSession): Promise<void> {
		if (session.disposed || session.prewarmClaimed || session.threadId === undefined) {
			return;
		}
		const threadId = session.threadId;
		session.threadId = undefined;
		this._sessionIdByThreadId.delete(threadId);
		try {
			const conn = await this._ensureConnection();
			await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			this._logService.info(`[Codex] prewarm TTL eviction session=${session.sessionUri.toString()} threadId=${threadId}`);
		} catch (err) {
			this._logService.warn(`[Codex] prewarm TTL eviction failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _persistMaterializedSession(session: ICodexSession): void {
		if (session.disposed || !session.threadId) {
			return;
		}
		// Persist only once the prewarmed thread is claimed by a turn. This
		// avoids restoring an expired, never-used prewarm as a live session.
		void this._metadataStore.write(session.sessionUri, {
			threadId: session.threadId,
			cwd: session.workingDirectory,
			modelId: session.model?.id,
		});
	}

	private _claimPrewarm(session: ICodexSession): void {
		session.prewarmClaimed = true;
		if (session.prewarmTimer) {
			clearTimeout(session.prewarmTimer);
			session.prewarmTimer = undefined;
		}
	}

	async sendMessage(sessionUri: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		this._logService.info(`[Codex DEBUG] sendMessage session=${sessionUri.toString()} prompt=${JSON.stringify(prompt).slice(0, 60)}`);
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Codex session not found: ${sessionUri.toString()}`);
		}
		const conn = await this._ensureConnection();
		const effectiveTurnId = turnId ?? generateUuid();

		// Materialize codex thread on first send (provisional → live).
		// `_materializeIfNeeded` is idempotent.
		try {
			this._claimPrewarm(session);
			await this._materializeIfNeeded(session);
			this._persistMaterializedSession(session);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Codex:${sessionId}] materialize failed: ${message}`);
			this._fire(sessionUri, {
				type: ActionType.SessionError,
				turnId: effectiveTurnId,
				error: { errorType: 'CodexMaterializeFailed', message },
			});
			this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
			return;
		}
		const threadId = session.threadId!;

		// Phase 3 resume path: defer to first sendMessage. If this session
		// was restored, we haven't yet told codex about it.
		if (session.needsResume) {
			try {
				await conn.client.request<'thread/resume'>('thread/resume', {
					threadId,
				});
				session.needsResume = false;
			} catch (err) {
				this._fire(sessionUri, {
					type: ActionType.SessionError,
					turnId: effectiveTurnId,
					error: {
						errorType: 'CodexResumeFailed',
						message: err instanceof Error ? err.message : String(err),
					},
				});
				this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
				return;
			}
		}

		const { input, cleanupPaths } = resolveCodexInput(prompt, attachments);
		// Buffer the prompt text for `turn/started`'s userMessage fallback.
		session.lastPromptText = prompt;
		session.currentTurnId = effectiveTurnId;
		try {
			const turnOptions = this._turnStartOptions(session);
			const model = await this._resolveModel(session);
			await conn.client.request<'turn/start'>('turn/start', {
				threadId,
				input: input.slice(),
				model: model.id,
				...turnOptions,
			});
			// We don't await turn completion here — the notification
			// stream emits SessionTurnComplete asynchronously.
		} catch (err) {
			if (err instanceof CancellationError) {
				this._fire(sessionUri, { type: ActionType.SessionTurnCancelled, turnId: effectiveTurnId });
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Codex:${sessionId}] turn/start error: ${message}`);
			this._fire(sessionUri, {
				type: ActionType.SessionError,
				turnId: effectiveTurnId,
				error: { errorType: 'CodexTurnError', message },
			});
			this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
		} finally {
			// Best-effort temp-file cleanup. Image-on-localImage will be
			// re-read by codex synchronously during the turn so this is
			// safe to defer slightly; we delete after a generous grace.
			if (cleanupPaths.length > 0) {
				setTimeout(() => {
					for (const p of cleanupPaths) {
						try { fs.unlinkSync(p); } catch { /* ignore */ }
					}
				}, 30_000);
			}
		}
	}

	setPendingMessages(sessionUri: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		if (!steeringMessage) {
			return;
		}
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		const appTurnId = session.currentAppTurnId;
		if (!appTurnId) {
			// No active turn — let the framework re-queue this as a normal sendMessage.
			return;
		}
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		const text = steeringMessage.message.text;
		if (text.length === 0 && (!steeringMessage.message.attachments || steeringMessage.message.attachments.length === 0)) {
			return;
		}
		const { input } = resolveCodexInput(text, steeringMessage.message.attachments);
		if (session.threadId === undefined) {
			return;
		}
		const threadId = session.threadId;
		void conn.client.request<'turn/steer'>('turn/steer', {
			threadId,
			input: input.slice(),
			expectedTurnId: appTurnId,
		}).catch(err => {
			if (err instanceof JsonRpcError) {
				// `expectedTurnId` mismatch is benign — framework will requeue.
				this._logService.info(`[Codex:${sessionId}] turn/steer skipped: ${err.message}`);
				return;
			}
			this._logService.warn(`[Codex:${sessionId}] turn/steer failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	async abortSession(sessionUri: URI): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session || !session.currentAppTurnId || session.threadId === undefined) {
			return;
		}
		const threadId = session.threadId;
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		try {
			await conn.client.request<'turn/interrupt'>('turn/interrupt', {
				threadId,
				turnId: session.currentAppTurnId,
			});
		} catch (err) {
			this._logService.warn(`[Codex:${sessionId}] turn/interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async disposeSession(sessionUri: URI): Promise<void> {
		this._logService.info(`[Codex DEBUG] disposeSession session=${sessionUri.toString()}`);
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		session.disposed = true;
		this._claimPrewarm(session);
		this._sessions.delete(sessionId);
		if (session.threadId !== undefined) {
			this._sessionIdByThreadId.delete(session.threadId);
		}
		// Unpark any pending approvals so codex doesn't deadlock waiting
		// on a response we will never deliver.
		session.pendingCommandApprovals.denyAll('decline');
		const conn = this._connection;
		if (conn.kind === 'ready' && session.threadId !== undefined) {
			const threadId = session.threadId;
			// `thread/unsubscribe` is the codex-native way to release a
			// session. Codex evicts after its 30-minute idle grace.
			try {
				await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId });
			} catch (err) {
				this._logService.info(`[Codex:${threadId}] thread/unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	async changeModel(sessionUri: URI, model: ModelSelection): Promise<void> {
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (session) {
			const supported = this._supportedModelOrUndefined(model);
			if (supported) {
				session.model = supported;
			}
		}
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		// `requestId` is the host-side toolCallId; iterate sessions and
		// resolve the first match. Mirrors the Claude/Copilot agents.
		for (const session of this._sessions.values()) {
			if (session.pendingCommandApprovals.respond(requestId, approved ? 'accept' : 'decline')) {
				return;
			}
		}
		this._logService.info(`[Codex] respondToPermissionRequest: unknown requestId=${requestId}`);
	}

	respondToUserInputRequest(_requestId: string, _response: SessionInputResponseKind, _answers?: Record<string, SessionInputAnswer>): void {
		// Phase 4 wires this.
		this._logService.info('[Codex] respondToUserInputRequest called (Phase 4 stub)');
	}

	getSessionMessages(session: URI): Promise<readonly Turn[]> {
		return this._readSession(session).then(read => read ? replayThreadToTurns(read.thread) : []);
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionId = AgentSession.id(session);
		const read = await this._readSession(session);
		if (!read) {
			return undefined;
		}
		// Register the session in our map so subsequent sendMessage triggers
		// thread/resume (Decision 8). The threadId came from the metadata
		// overlay or from `thread/list` (when the session was materialized
		// in a prior process); `_readSession` returns the resolved id.
		if (!this._sessions.has(sessionId)) {
			const workingDirectory = read.thread.cwd ? URI.file(read.thread.cwd) : undefined;
			const threadId = read.thread.id;
			this._sessions.set(sessionId, {
				sessionId,
				threadId,
				sessionUri: session,
				workingDirectory,
				mapState: createCodexSessionMapState(),
				pendingCommandApprovals: new PendingRequestRegistry<CommandExecutionApprovalDecision>(),
				acceptedForSession: new Set<string>(),
				model: undefined,
				currentTurnId: undefined,
				currentAppTurnId: undefined,
				hostTurnIdByAppTurnId: new Map<string, string>(),
				needsResume: true,
				lastPromptText: '',
				disposed: false,
				materializePromise: undefined,
				materializedEventFired: true,
				prewarmTimer: undefined,
				prewarmClaimed: true,
			});
			this._sessionIdByThreadId.set(threadId, sessionId);
		}
		return this._threadToMetadata(read.thread, session);
	}

	private async _readSession(session: URI): Promise<ThreadReadResponse | undefined> {
		// Resolve the codex thread id for this session URI. Resolution
		// order: in-memory session → persisted metadata overlay → URI host
		// (for sessions materialized in a prior process where sessionId
		// equals threadId by convention).
		const sessionId = AgentSession.id(session);
		const existing = this._sessions.get(sessionId);
		let threadId = existing?.threadId;
		if (threadId === undefined) {
			const overlay = await this._metadataStore.read(session);
			threadId = overlay.threadId ?? sessionId;
		}
		try {
			const conn = await this._ensureConnection();
			const response = await conn.client.request<'thread/read', ThreadReadResponse>('thread/read', {
				threadId,
				includeTurns: true,
			});
			return response;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			// `thread not loaded` is app-server's expected response for any
			// thread we have not yet resumed in this process; sendMessage's
			// `thread/resume` path will handle it. Log at info level.
			if (/thread not loaded/i.test(message)) {
				this._logService.info(`[Codex:${threadId}] thread/read: not loaded yet (will resume on first send)`);
			} else {
				this._logService.warn(`[Codex:${threadId}] thread/read failed: ${message}`);
			}
			return undefined;
		}
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		if (!this._githubToken) {
			return [];
		}
		try {
			const conn = await this._ensureConnection();
			const response = await conn.client.request<'thread/list', ThreadListResponse>('thread/list', {
				limit: 200,
			});
			// Map persisted threads back to the URI the workbench already
			// knows them by. After `_materializeIfNeeded` runs, the codex
			// thread is persisted to disk under its thread id but the
			// workbench/state-manager keyed the session by its provisional
			// URI (`codex:/<provisional-uuid>`). If we returned a fresh
			// `codex:/<threadId>` URI here, `_refreshSessions` would treat
			// the provisional URI as missing and evict the live session
			// the user is actively viewing.
			const liveUriByThreadId = new Map<string, URI>();
			for (const s of this._sessions.values()) {
				if (s.threadId !== undefined) {
					liveUriByThreadId.set(s.threadId, s.sessionUri);
				}
			}
			return response.data.map(t => this._threadToMetadata(
				t,
				liveUriByThreadId.get(t.id) ?? AgentSession.uri(this.id, t.id),
			));
		} catch (err) {
			this._logService.warn(`[Codex] thread/list failed: ${err instanceof Error ? err.message : String(err)}`);
			return [];
		}
	}

	private _threadToMetadata(thread: Thread, sessionUri: URI): IAgentSessionMetadata {
		return {
			session: sessionUri,
			// Codex returns Unix seconds; the agent host expects ms.
			startTime: (thread.createdAt ?? 0) * 1000,
			modifiedTime: (thread.updatedAt ?? thread.createdAt ?? 0) * 1000,
			summary: thread.name ?? thread.preview ?? undefined,
			workingDirectory: thread.cwd ? URI.file(thread.cwd) : undefined,
		};
	}

	setClientTools(_session: URI, _clientId: string | undefined, _tools: ToolDefinition[]): void {
		// Phase 6+: in-process MCP client tools. Not implemented in Phase 2.
	}

	onClientToolCallComplete(_session: URI, _toolCallId: string, _result: ToolCallResult): void {
		// Phase 4+.
	}

	setClientCustomizations(_session: URI, _clientId: string, _customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
		return Promise.resolve([]);
	}

	setCustomizationEnabled(_uri: string, _enabled: boolean): void {
		// no-op; customizations not yet wired for codex.
	}

	async shutdown(): Promise<void> {
		if (this._connection.kind === 'ready') {
			try { this._connection.client.dispose(); } catch { /* ignore */ }
			try { this._connection.proxyHandle.dispose(); } catch { /* ignore */ }
		}
		this._connection = { kind: 'idle' };
		for (const s of this._sessions.values()) {
			s.pendingCommandApprovals.denyAll('decline');
		}
		this._sessions.clear();
		this._sessionIdByThreadId.clear();
	}

	resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		const values = codexSessionConfigSchema.validateOrDefault(params.config, codexSessionConfigDefaults);
		const isWorkspaceWrite = values[CodexSessionConfigKey.SandboxMode] === 'workspace-write';
		const schema = isWorkspaceWrite
			? codexWorkspaceWriteSessionConfigSchema.toProtocol()
			: codexVisibleSessionConfigSchema.toProtocol();
		const resolvedValues: Record<string, unknown> = {
			[CodexSessionConfigKey.ApprovalPolicy]: values[CodexSessionConfigKey.ApprovalPolicy],
			[CodexSessionConfigKey.SandboxMode]: values[CodexSessionConfigKey.SandboxMode],
			[CodexSessionConfigKey.WebSearchMode]: values[CodexSessionConfigKey.WebSearchMode],
		};
		if (isWorkspaceWrite) {
			resolvedValues[CodexSessionConfigKey.NetworkAccessEnabled] = values[CodexSessionConfigKey.NetworkAccessEnabled];
		}
		return Promise.resolve({ values: resolvedValues, schema });
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		if (params.property !== CodexSessionConfigKey.AdditionalDirectories) {
			return { items: [] };
		}
		const query = params.query?.trim();
		if (!query) {
			return { items: [] };
		}
		const workingDirectory = params.workingDirectory?.fsPath;
		const resolved = isAbsolute(query)
			? query
			: resolve(workingDirectory ?? process.cwd(), query);
		const parent = query.endsWith(sep) ? resolved : dirname(resolved);
		const prefix = query.endsWith(sep) ? '' : basename(resolved).toLowerCase();
		try {
			const entries = await fs.promises.readdir(parent, { withFileTypes: true });
			return {
				items: entries
					.filter(entry => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix))
					.slice(0, 50)
					.map(entry => {
						const value = join(parent, entry.name);
						return { value, label: entry.name, description: value };
					}),
			};
		} catch {
			return { items: [] };
		}
	}

	// #endregion

	private _fire(sessionUri: URI, action: SessionAction): void {
		this._onDidSessionProgress.fire({ kind: 'action', session: sessionUri, action });
	}

	override dispose(): void {
		if (this._connection.kind === 'ready') {
			try { this._connection.client.dispose(); } catch { /* ignore */ }
			try { this._connection.proxyHandle.dispose(); } catch { /* ignore */ }
		}
		this._connection = { kind: 'idle' };
		for (const s of this._sessions.values()) {
			s.pendingCommandApprovals.denyAll('decline');
		}
		this._sessions.clear();
		this._sessionIdByThreadId.clear();
		super.dispose();
	}
}

function parseBinaryArgs(json: string | undefined): string[] {
	if (!json) {
		return [];
	}
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

/**
 * The suffix Codex uses for its platform `optionalDependencies` packages
 * (`@openai/codex-${suffix}`). Codex's Linux binaries are statically
 * musl-linked and ship under the same `linux-<arch>` package regardless of
 * host libc, so this never returns a `-musl` suffix.
 *
 * Returns undefined for unsupported `(platform, arch)` combinations — the
 * caller surfaces the error.
 */
export function codexPackageSuffix(platform: NodeJS.Platform, arch: string): string | undefined {
	if ((platform !== 'linux' && platform !== 'darwin' && platform !== 'win32') ||
		(arch !== 'x64' && arch !== 'arm64')) {
		return undefined;
	}
	return `${platform}-${arch}`;
}

/**
 * Mirrors the triple table inside `@openai/codex/bin/codex.js` so we can spawn
 * the native binary at `vendor/<triple>/bin/codex` directly without going
 * through the JS shim launcher.
 */
export function codexBinaryTriple(sdkTarget: string): string | undefined {
	switch (sdkTarget) {
		case 'linux-x64': return 'x86_64-unknown-linux-musl';
		case 'linux-arm64': return 'aarch64-unknown-linux-musl';
		case 'darwin-x64': return 'x86_64-apple-darwin';
		case 'darwin-arm64': return 'aarch64-apple-darwin';
		case 'win32-x64': return 'x86_64-pc-windows-msvc';
		case 'win32-arm64': return 'aarch64-pc-windows-msvc';
		default: return undefined;
	}
}
