/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { Codex, Thread, ModelReasoningEffort, ApprovalMode, SandboxMode, WebSearchMode } from '@openai/codex-sdk';
import { SequencerByKey } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, type IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata } from '../../common/agentService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { type ConfigSchema, type ModelSelection, type ToolDefinition, PolicyState } from '../../common/state/protocol/state.js';
import { CustomizationRef, SessionInputResponseKind, type MessageAttachment, type PendingMessage, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { ICodexProxyHandle, ICodexProxyService } from './codexProxyService.js';
import { ICodexAgentSdkService } from './codexAgentSdkService.js';
import { createCodexTurnState, mapCodexEvent } from './codexMapSessionEvents.js';
import { CodexSessionConfigKey, narrowAdditionalDirectories, narrowApprovalPolicy, narrowBoolean, narrowSandboxMode, narrowWebSearchMode } from './codexSessionConfigKeys.js';
import { resolvePromptWithAttachments } from './codexPromptResolver.js';

/**
 * Heuristic for picking OpenAI-family models out of the Copilot CAPI
 * model list. Codex is happy with any chat-capable OpenAI model, so
 * we keep the filter loose.
 */
function isCodexModel(m: CCAModel): boolean {
	return m.vendor === 'OpenAI' && !!m.model_picker_enabled && !!m.capabilities?.supports?.tool_calls;
}

/**
 * Augments the published `@vscode/copilot-api` `CCAModelSupports` with
 * the per-model `reasoning_effort` field the runtime CAPI `/models`
 * payload already carries but the SDK type doesn't yet declare.
 */
interface ICodexModelSupports {
	readonly reasoning_effort?: readonly string[];
}

function isCodexEffort(v: string): v is ModelReasoningEffort {
	return CODEX_EFFORT_LEVELS.includes(v as ModelReasoningEffort);
}

function createCodexEffortSchema(supportedEfforts: readonly ModelReasoningEffort[]): ConfigSchema | undefined {
	if (supportedEfforts.length === 0) {
		return undefined;
	}
	const defaultEffort = supportedEfforts.includes('medium') ? 'medium' : undefined;
	return {
		type: 'object',
		properties: {
			reasoningEffort: {
				type: 'string',
				title: localize('codex.modelEffort.title', "Reasoning Effort"),
				description: localize('codex.modelEffort.description', "Controls how much reasoning effort the model uses."),
				enum: [...supportedEfforts],
				...(defaultEffort !== undefined ? { default: defaultEffort } : {}),
			},
		},
	};
}

function toAgentModelInfo(m: CCAModel, provider: AgentProvider): IAgentModelInfo {
	const supports = m.capabilities?.supports;
	const supportedEfforts = ((supports as ICodexModelSupports | undefined)?.reasoning_effort ?? []).filter(isCodexEffort);
	const configSchema = createCodexEffortSchema(supportedEfforts);
	const policyState = m.policy?.state as PolicyState | undefined;
	const multiplier = m.billing?.multiplier;
	return {
		provider,
		id: m.id,
		name: m.name,
		maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
		supportsVision: !!supports?.vision,
		...(configSchema ? { configSchema } : {}),
		...(policyState ? { policyState } : {}),
		...(typeof multiplier === 'number' ? { _meta: { multiplierNumeric: multiplier } } : {}),
	};
}

const CODEX_EFFORT_LEVELS: readonly ModelReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];

function resolveCodexEffort(model: ModelSelection | undefined, supportedEfforts?: readonly IAgentModelInfo[]): ModelReasoningEffort | undefined {
	const raw = model?.config?.['reasoningEffort'] ?? model?.config?.['effort'];
	if (!CODEX_EFFORT_LEVELS.includes(raw as ModelReasoningEffort)) {
		return undefined;
	}
	const effort = raw as ModelReasoningEffort;
	// Validate against the target model's supported effort levels when
	// the model list is available. This prevents sending an effort level
	// that was valid for the previous model but not the current one
	// (e.g. 'low' is supported by gpt-5.3-codex but not gpt-5.2-codex).
	if (supportedEfforts && model?.id) {
		const modelInfo = supportedEfforts.find(m => m.id === model.id);
		const allowed = modelInfo?.configSchema?.properties?.['reasoningEffort']?.enum as string[] | undefined;
		if (allowed && !allowed.includes(effort)) {
			return undefined;
		}
	}
	return effort;
}

interface ICodexSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	readonly workingDirectory: URI | undefined;
	thread: Thread | undefined;
	model: ModelSelection | undefined;
	/** Active `approvalPolicy` for the thread; updated on each sendMessage from the live session config. */
	approvalPolicy: ApprovalMode | undefined;
	/** Active `sandboxMode` for the thread. */
	sandboxMode: SandboxMode | undefined;
	/** Active extra writable roots (absolute paths). */
	additionalDirectories: readonly string[] | undefined;
	/** Whether the sandbox is allowed to make outbound network requests. */
	networkAccessEnabled: boolean | undefined;
	/** Whether the model is allowed to use the web-search tool. */
	webSearchMode: WebSearchMode | undefined;
	/**
	 * `model.id|effort|approval|sandbox|writableRoots|network|webSearch`
	 * key captured when {@link thread} was constructed. The codex `Thread`
	 * binds these flags at `startThread()` / `resumeThread()` time and
	 * replays them on every `runStreamed()`, so any change requires
	 * rebuilding the wrapper.
	 */
	threadOptionsKey: string | undefined;
	abortController: AbortController;
	/** Steering prompt buffered by {@link CodexAgent.setPendingMessages}. Consumed on next `sendMessage`. */
	pendingSteeringPrompt: string | undefined;
}

function makeThreadOptionsKey(
	model: ModelSelection | undefined,
	approvalPolicy: ApprovalMode | undefined,
	sandboxMode: SandboxMode | undefined,
	additionalDirectories: readonly string[] | undefined,
	networkAccessEnabled: boolean | undefined,
	webSearchMode: WebSearchMode | undefined,
	models?: readonly IAgentModelInfo[],
): string {
	const dirs = additionalDirectories && additionalDirectories.length > 0 ? [...additionalDirectories].sort().join(',') : '';
	return [
		model?.id ?? '',
		resolveCodexEffort(model, models) ?? '',
		approvalPolicy ?? '',
		sandboxMode ?? '',
		dirs,
		networkAccessEnabled === undefined ? '' : String(networkAccessEnabled),
		webSearchMode ?? '',
	].join('|');
}

/**
 * Codex agent provider — wraps `@openai/codex-sdk` loaded dynamically
 * via {@link ICodexAgentSdkService} from the path supplied by the
 * `chat.agentHost.codexAgent.path` setting. The SDK shells out to a
 * bundled `codex` native CLI, so the SDK install must include the
 * platform-matching binary.
 *
 * Mirrors the shape of {@link ClaudeAgent}: protected-resource auth via
 * the GitHub Copilot token, models filtered from CAPI by vendor, and
 * provisional sessions that materialize on first message. Implementation
 * is intentionally thin — only text response/turn-complete events are
 * mapped today; tool calls, file edits, MCP, and subagents are left for
 * follow-up phases.
 */
export class CodexAgent extends Disposable implements IAgent {
	readonly id: AgentProvider = 'codex';

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
	readonly onDidMaterializeSession = this._onDidMaterializeSession.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

	private _githubToken: string | undefined;
	private _proxyHandle: ICodexProxyHandle | undefined;
	private readonly _sessions = new DisposableMap<string, ICodexSessionEntry>();
	private readonly _provisionalSessions = new Map<string, ICodexSession>();
	private readonly _sessionSequencer = new SequencerByKey<string>();
	private _shutdownPromise: Promise<void> | undefined;
	private _codex: Codex | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@ICodexProxyService private readonly _codexProxyService: ICodexProxyService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ICodexAgentSdkService private readonly _codexSdk: ICodexAgentSdkService,
	) {
		super();
	}

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('codexAgent.displayName', "Codex"),
			description: localize('codexAgent.description', "Codex agent backed by the OpenAI Codex SDK"),
		};
	}

	getProtectedResources() {
		return [GITHUB_COPILOT_PROTECTED_RESOURCE];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
			return false;
		}
		if (this._githubToken === token && this._codex) {
			this._logService.info('[Codex] Auth token unchanged');
			return true;
		}
		// Acquire the proxy handle BEFORE committing the new token /
		// instantiating Codex, so a transient proxy startup failure leaves
		// the previous state intact and a retry still sees the token as new.
		const newHandle = await this._codexProxyService.start(token);
		const oldHandle = this._proxyHandle;
		this._proxyHandle = newHandle;
		this._githubToken = token;
		// Point the Codex SDK at our local proxy. The codex CLI accepts a
		// per-thread `baseUrl` (rendered as `--config openai_base_url=...`)
		// and reads `CODEX_API_KEY` (set from `apiKey`). We also force
		// `preferred_auth_method=apikey` so the CLI doesn't try to use a
		// ChatGPT-account WebSocket path.
		this._codex = await this._codexSdk.createCodex({
			apiKey: newHandle.nonce,
			// Route the codex CLI through our local CAPI proxy via a CUSTOM
			// model provider. The built-in `openai` provider can't be
			// overridden (codex rejects `model_providers.openai = ...`),
			// and it has `supports_websockets = true` which would force
			// codex onto the Responses-over-WebSocket path. A custom
			// provider defaults `supports_websockets = false`, so the CLI
			// uses plain HTTP+SSE — exactly what our proxy serves.
			//
			// `env_key = 'CODEX_API_KEY'` makes the CLI read the bearer
			// from the env var the SDK already populates from `apiKey`.
			config: {
				preferred_auth_method: 'apikey',
				model_provider: 'capi-proxy',
				model_providers: {
					'capi-proxy': {
						name: 'CAPI (Codex Agent Host Proxy)',
						base_url: `${newHandle.baseUrl}/v1`,
						wire_api: 'responses',
						env_key: 'CODEX_API_KEY',
						requires_openai_auth: false,
					},
				},
			},
		});
		oldHandle?.dispose();
		this._logService.info('[Codex] Auth token updated');
		void this._refreshModels();
		return true;
	}

	private _ensureAuthenticated(): Codex {
		if (!this._githubToken || !this._codex) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				'Authentication is required to use Codex',
				this.getProtectedResources(),
			);
		}
		return this._codex;
	}

	private async _refreshModels(): Promise<void> {
		const tokenAtStart = this._githubToken;
		if (!tokenAtStart) {
			this._models.set([], undefined);
			return;
		}
		try {
			const all = await this._copilotApiService.models(tokenAtStart);
			if (this._githubToken !== tokenAtStart) {
				return;
			}
			const filtered = all
				.filter(isCodexModel)
				.sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default))
				.map(m => toAgentModelInfo(m, this.id));
			this._logService.info(`[Codex] Found ${filtered.length} models (from ${all.length} total): ${filtered.map(m => m.id).join(', ')}`);
			this._models.set(filtered, undefined);
		} catch (err) {
			this._logService.error(err, '[Codex] Failed to refresh models');
			if (this._githubToken === tokenAtStart) {
				this._models.set([], undefined);
			}
		}
	}

	async createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
		this._ensureAuthenticated();
		if (config.fork) {
			throw new Error('Codex agent does not yet support session forking');
		}
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);

		// Return existing materialized session.
		const existing = this._sessions.get(sessionId);
		if (existing) {
			return {
				session: existing.state.sessionUri,
				workingDirectory: existing.state.workingDirectory,
				provisional: !existing.state.thread,
			};
		}

		// Return existing provisional session.
		const existingProvisional = this._provisionalSessions.get(sessionId);
		if (existingProvisional) {
			return {
				session: existingProvisional.sessionUri,
				workingDirectory: existingProvisional.workingDirectory,
				provisional: true,
			};
		}

		this._provisionalSessions.set(sessionId, {
			sessionId,
			sessionUri,
			workingDirectory: config.workingDirectory,
			thread: undefined,
			model: config.model,
			approvalPolicy: narrowApprovalPolicy(config.config?.[CodexSessionConfigKey.ApprovalPolicy]),
			sandboxMode: narrowSandboxMode(config.config?.[CodexSessionConfigKey.SandboxMode]),
			additionalDirectories: narrowAdditionalDirectories(config.config?.[CodexSessionConfigKey.AdditionalDirectories]),
			networkAccessEnabled: narrowBoolean(config.config?.[CodexSessionConfigKey.NetworkAccessEnabled]),
			webSearchMode: narrowWebSearchMode(config.config?.[CodexSessionConfigKey.WebSearchMode]),
			threadOptionsKey: undefined,
			abortController: new AbortController(),
			pendingSteeringPrompt: undefined,
		});
		return {
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			provisional: true,
		};
	}

	resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		// Codex collapses the platform's `autoApprove` / `mode` two-axis
		// approval surface onto its single `approvalPolicy` axis (the codex
		// CLI's `--config approval_policy=`). `sandboxMode` mirrors the
		// codex CLI's `--sandbox` flag. Both default at codex's defaults
		// when omitted. The platform-shared `Permissions` property is
		// reused unchanged so the host's auto-approval UI still works.
		const sessionSchema = createSchema({
			[CodexSessionConfigKey.ApprovalPolicy]: schemaProperty<ApprovalMode>({
				type: 'string',
				title: localize('codex.sessionConfig.approvalPolicy', "Approvals"),
				description: localize('codex.sessionConfig.approvalPolicyDescription', "How Codex requests approval for tool calls."),
				enum: ['never', 'on-request', 'on-failure', 'untrusted'],
				enumLabels: [
					localize('codex.sessionConfig.approvalPolicy.never', "Never Ask"),
					localize('codex.sessionConfig.approvalPolicy.onRequest', "On Request"),
					localize('codex.sessionConfig.approvalPolicy.onFailure', "On Failure"),
					localize('codex.sessionConfig.approvalPolicy.untrusted', "Untrusted Only"),
				],
				enumDescriptions: [
					localize('codex.sessionConfig.approvalPolicy.neverDescription', "Auto-approve every tool call."),
					localize('codex.sessionConfig.approvalPolicy.onRequestDescription', "Let the model decide when to ask for approval."),
					localize('codex.sessionConfig.approvalPolicy.onFailureDescription', "Only ask for approval after a tool call fails."),
					localize('codex.sessionConfig.approvalPolicy.untrustedDescription', "Ask only when the model invokes an untrusted command."),
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
					localize('codex.sessionConfig.sandboxMode.readOnlyDescription', "Tool calls can read the workspace but cannot modify files or open network connections."),
					localize('codex.sessionConfig.sandboxMode.workspaceWriteDescription', "Tool calls can read and write within the workspace; network is still blocked."),
					localize('codex.sessionConfig.sandboxMode.dangerFullAccessDescription', "Tool calls have unrestricted disk and network access."),
				],
				default: 'workspace-write',
				sessionMutable: true,
			}),
			[CodexSessionConfigKey.AdditionalDirectories]: schemaProperty<string[]>({
				type: 'array',
				title: localize('codex.sessionConfig.additionalDirectories', "Additional Writable Directories"),
				description: localize('codex.sessionConfig.additionalDirectoriesDescription', "Absolute paths the sandbox is allowed to write to, in addition to the workspace. Only applies when Sandbox is 'Workspace Write'."),
				items: { type: 'string', title: localize('codex.sessionConfig.additionalDirectories.item', "Directory") },
				default: [],
				sessionMutable: true,
			}),
			[CodexSessionConfigKey.NetworkAccessEnabled]: schemaProperty<boolean>({
				type: 'boolean',
				title: localize('codex.sessionConfig.networkAccessEnabled', "Allow Network Access"),
				description: localize('codex.sessionConfig.networkAccessEnabledDescription', "Allow tool calls running inside the sandbox to make outbound network requests."),
				default: false,
				sessionMutable: true,
			}),
			[CodexSessionConfigKey.WebSearchMode]: schemaProperty<WebSearchMode>({
				type: 'string',
				title: localize('codex.sessionConfig.webSearchMode', "Web Search"),
				description: localize('codex.sessionConfig.webSearchModeDescription', "Web-search tool availability for the model. 'Disabled' hides the tool; 'Cached' allows cached results only; 'Live' permits real network requests."),
				enum: ['disabled', 'cached', 'live'],
				enumLabels: [
					localize('codex.sessionConfig.webSearchMode.disabled', "Disabled"),
					localize('codex.sessionConfig.webSearchMode.cached', "Cached Only"),
					localize('codex.sessionConfig.webSearchMode.live', "Live"),
				],
				enumDescriptions: [
					localize('codex.sessionConfig.webSearchMode.disabledDescription', "Hide the web-search tool from the model."),
					localize('codex.sessionConfig.webSearchMode.cachedDescription', "Expose the tool but only return cached results (no network)."),
					localize('codex.sessionConfig.webSearchMode.liveDescription', "Allow the tool to make live web-search requests."),
				],
				default: 'disabled',
				sessionMutable: true,
			}),
			[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
		});
		const values = sessionSchema.validateOrDefault(_params.config, {
			[CodexSessionConfigKey.ApprovalPolicy]: 'on-request' satisfies ApprovalMode,
			[CodexSessionConfigKey.SandboxMode]: 'workspace-write' satisfies SandboxMode,
			[CodexSessionConfigKey.AdditionalDirectories]: [],
			[CodexSessionConfigKey.NetworkAccessEnabled]: false,
			[CodexSessionConfigKey.WebSearchMode]: 'disabled' satisfies WebSearchMode,
		});
		return Promise.resolve({ schema: sessionSchema.toProtocol(), values });
	}

	sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return Promise.resolve({ items: [] });
	}

	async sendMessage(sessionUri: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		return this._sessionSequencer.queue(sessionId, () => this._sendMessageCore(sessionUri, sessionId, prompt, attachments, turnId));
	}

	private async _sendMessageCore(
		sessionUri: URI,
		sessionId: string,
		prompt: string,
		attachments: readonly MessageAttachment[] | undefined,
		turnId: string | undefined,
	): Promise<void> {
		const effectiveTurnId = turnId ?? generateUuid();
		const codex = this._ensureAuthenticated();

		// --- Resolve or materialize the session entry ---
		let entry = this._sessions.get(sessionId);
		if (!entry) {
			const provisional = this._provisionalSessions.get(sessionId);
			if (provisional) {
				entry = this._materializeProvisional(sessionId, provisional);
			} else {
				// Session exists on disk (e.g. after an agent-host restart)
				// but not in memory. Try to resume it. Mirrors Claude's
				// `_resumeSession` path in `sendMessage`.
				entry = this._resumeSession(sessionId, sessionUri);
			}
		}

		// --- Read live session config ---
		const liveConfig = this._configurationService.getSessionConfigValues(sessionUri.toString());
		const liveApproval = narrowApprovalPolicy(liveConfig?.[CodexSessionConfigKey.ApprovalPolicy]) ?? entry.state.approvalPolicy;
		const liveSandbox = narrowSandboxMode(liveConfig?.[CodexSessionConfigKey.SandboxMode]) ?? entry.state.sandboxMode;
		const liveDirs = narrowAdditionalDirectories(liveConfig?.[CodexSessionConfigKey.AdditionalDirectories]) ?? entry.state.additionalDirectories;
		const liveNetwork = narrowBoolean(liveConfig?.[CodexSessionConfigKey.NetworkAccessEnabled]) ?? entry.state.networkAccessEnabled;
		const liveWebSearch = narrowWebSearchMode(liveConfig?.[CodexSessionConfigKey.WebSearchMode]) ?? entry.state.webSearchMode;
		entry.state.approvalPolicy = liveApproval;
		entry.state.sandboxMode = liveSandbox;
		entry.state.additionalDirectories = liveDirs;
		entry.state.networkAccessEnabled = liveNetwork;
		entry.state.webSearchMode = liveWebSearch;

		this._logService.info(`[Codex:${sessionId}] _sendMessageCore: model=${entry.state.model?.id ?? '<default>'}, modelConfig=${JSON.stringify(entry.state.model?.config ?? {})}, approval=${liveApproval}, sandbox=${liveSandbox}, dirs=${liveDirs?.length ?? 0}, network=${liveNetwork ?? '<default>'}, webSearch=${liveWebSearch ?? '<default>'}`);

		// --- Rebuild the Thread when options drift ---
		const currentModels = this._models.get();
		const desiredKey = makeThreadOptionsKey(entry.state.model, liveApproval, liveSandbox, liveDirs, liveNetwork, liveWebSearch, currentModels);
		const effort = resolveCodexEffort(entry.state.model, currentModels);
		const threadOptions = {
			...(entry.state.workingDirectory ? { workingDirectory: entry.state.workingDirectory.fsPath } : {}),
			...(entry.state.model?.id ? { model: entry.state.model.id } : {}),
			...(effort ? { modelReasoningEffort: effort } : {}),
			...(liveApproval ? { approvalPolicy: liveApproval } : {}),
			...(liveSandbox ? { sandboxMode: liveSandbox } : {}),
			...(liveDirs && liveDirs.length > 0 ? { additionalDirectories: [...liveDirs] } : {}),
			...(liveNetwork !== undefined ? { networkAccessEnabled: liveNetwork } : {}),
			...(liveWebSearch ? { webSearchMode: liveWebSearch } : {}),
			skipGitRepoCheck: true,
		};

		this._logService.info(`[Codex:${sessionId}] thread state: hasThread=${!!entry.state.thread}, threadId=${entry.state.thread?.id ?? '<none>'}, currentKey=${entry.state.threadOptionsKey ?? '<none>'}, desiredKey=${desiredKey}, effort=${effort ?? '<none>'}`);
		this._logService.info(`[Codex:${sessionId}] threadOptions: ${JSON.stringify(threadOptions)}`);

		if (!entry.state.thread) {
			this._logService.info(`[Codex:${sessionId}] creating NEW thread (no existing thread)`);
			entry.state.thread = codex.startThread(threadOptions);
			entry.state.threadOptionsKey = desiredKey;
		} else if (entry.state.threadOptionsKey !== desiredKey) {
			const existingId = entry.state.thread.id;
			this._logService.info(`[Codex:${sessionId}] thread options CHANGED: existingId=${existingId ?? '<none>'}, using ${existingId ? 'resumeThread' : 'startThread'}`);
			entry.state.thread = existingId
				? codex.resumeThread(existingId, threadOptions)
				: codex.startThread(threadOptions);
			entry.state.threadOptionsKey = desiredKey;
			this._logService.info(`[Codex:${sessionId}] thread rebuilt for model swap: model=${entry.state.model?.id ?? '<default>'} effort=${effort ?? '<default>'}`);
		} else {
			this._logService.info(`[Codex:${sessionId}] thread REUSED (options unchanged)`);
		}

		// --- Resolve prompt with attachments + steering ---
		const resolvedPrompt = this._resolveFullPrompt(prompt, attachments, entry.state);

		try {
			// A previous turn that was aborted leaves `abortController` in
			// an aborted state. Re-arm here so the new turn's `signal`
			// starts fresh; otherwise `runStreamed` would short-circuit.
			if (entry.state.abortController.signal.aborted) {
				entry.state.abortController = new AbortController();
			}
			const turnState = createCodexTurnState();
			this._logService.info(`[Codex:${sessionId}] calling runStreamed: threadId=${entry.state.thread.id ?? '<pending>'}, promptLength=${resolvedPrompt.length}`);
			const { events } = await entry.state.thread.runStreamed(resolvedPrompt, { signal: entry.state.abortController.signal });
			for await (const event of events) {
				for (const signal of mapCodexEvent(sessionUri, effectiveTurnId, event, turnState)) {
					this._onDidSessionProgress.fire(signal);
				}
			}
			this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
		} catch (err) {
			if (err instanceof CancellationError || entry.state.abortController.signal.aborted) {
				this._logService.info(`[Codex:${sessionId}] turn cancelled`);
				this._fire(sessionUri, { type: ActionType.SessionTurnCancelled, turnId: effectiveTurnId });
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Codex:${sessionId}] turn ERROR: ${message}`, err instanceof Error ? err.stack : undefined);
			this._fire(sessionUri, {
				type: ActionType.SessionError,
				turnId: effectiveTurnId,
				error: { errorType: 'CodexError', message, ...(err instanceof Error && err.stack ? { stack: err.stack } : {}) },
			});
			this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
		}
	}

	/**
	 * Promote a provisional session into a materialized entry in
	 * {@link _sessions}. Fires {@link onDidMaterializeSession}.
	 */
	private _materializeProvisional(sessionId: string, provisional: ICodexSession): ICodexSessionEntry {
		this._provisionalSessions.delete(sessionId);
		const entry = this._createSessionEntry(provisional);
		this._onDidMaterializeSession.fire({
			session: provisional.sessionUri,
			workingDirectory: provisional.workingDirectory,
			project: undefined,
		});
		return entry;
	}

	/**
	 * Reconstruct a session entry for a session id that exists on disk
	 * but not in memory (e.g. after an agent-host restart). Mirrors
	 * Claude's `_resumeSession`. The codex SDK's `resumeThread(id)`
	 * re-attaches to an existing thread's JSONL on disk, so
	 * `sendMessage` can continue the conversation.
	 */
	private _resumeSession(sessionId: string, sessionUri: URI): ICodexSessionEntry {
		this._logService.info(`[Codex:${sessionId}] resuming session from disk`);
		const state: ICodexSession = {
			sessionId,
			sessionUri,
			workingDirectory: undefined,
			thread: undefined,
			model: undefined,
			approvalPolicy: undefined,
			sandboxMode: undefined,
			additionalDirectories: undefined,
			networkAccessEnabled: undefined,
			webSearchMode: undefined,
			threadOptionsKey: undefined,
			abortController: new AbortController(),
			pendingSteeringPrompt: undefined,
		};
		const entry = this._createSessionEntry(state);
		this._onDidMaterializeSession.fire({
			session: sessionUri,
			workingDirectory: undefined,
			project: undefined,
		});
		return entry;
	}

	private _createSessionEntry(state: ICodexSession): ICodexSessionEntry {
		const entry: ICodexSessionEntry = {
			state,
			sessionUri: state.sessionUri,
			workingDirectory: state.workingDirectory,
			dispose: () => {
				state.abortController.abort();
			},
		};
		this._sessions.set(state.sessionId, entry);
		return entry;
	}

	/**
	 * Build the final prompt string from the raw user prompt, protocol
	 * attachments, and any buffered steering message.
	 */
	private _resolveFullPrompt(
		prompt: string,
		attachments: readonly MessageAttachment[] | undefined,
		state: ICodexSession,
	): string {
		const resolved = resolvePromptWithAttachments(prompt, attachments);
		const steering = state.pendingSteeringPrompt;
		if (steering) {
			state.pendingSteeringPrompt = undefined;
			return `${steering}\n\n${resolved}`;
		}
		return resolved;
	}

	private _fire(sessionUri: URI, action: SessionAction): void {
		this._onDidSessionProgress.fire({ kind: 'action', session: sessionUri, action });
	}

	getSessionMessages(_session: URI): Promise<readonly Turn[]> {
		// Codex SDK does not currently expose a transcript-replay API; on
		// reload, sessions come back empty. Resume via `Codex.resumeThread`
		// can rebuild the in-memory conversation but not the protocol turns.
		return Promise.resolve([]);
	}

	listSessions(): Promise<IAgentSessionMetadata[]> {
		// The SDK persists threads under `~/.codex/sessions` but exposes no
		// enumeration API. Surface an empty list rather than reading that
		// directory directly — schema/format are not part of the SDK contract.
		return Promise.resolve([]);
	}

	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			const provisional = this._provisionalSessions.get(sessionId);
			if (!provisional) {
				return undefined;
			}
			return {
				session: provisional.sessionUri,
				startTime: Date.now(),
				modifiedTime: Date.now(),
				model: provisional.model,
				workingDirectory: provisional.workingDirectory,
			};
		}
		return {
			session: entry.state.sessionUri,
			startTime: Date.now(),
			modifiedTime: Date.now(),
			model: entry.state.model,
			workingDirectory: entry.state.workingDirectory,
		};
	}

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		// Remove from materialized sessions (DisposableMap calls dispose).
		if (this._sessions.has(sessionId)) {
			this._sessions.deleteAndDispose(sessionId);
			return;
		}
		// Remove from provisional sessions.
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			provisional.abortController.abort();
			this._provisionalSessions.delete(sessionId);
		}
	}

	async abortSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			entry.state.abortController.abort();
			return;
		}
		const provisional = this._provisionalSessions.get(sessionId);
		provisional?.abortController.abort();
	}

	async changeModel(session: URI, model: ModelSelection): Promise<void> {
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Codex:${sessionId}] changeModel called: newModel=${model.id ?? '<none>'}, config=${JSON.stringify(model.config ?? {})}`);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			this._logService.info(`[Codex:${sessionId}] changeModel: updating materialized session (oldModel=${entry.state.model?.id ?? '<none>'})`);
			entry.state.model = model;
			return;
		}
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			this._logService.info(`[Codex:${sessionId}] changeModel: updating provisional session (oldModel=${provisional.model?.id ?? '<none>'})`);
			provisional.model = model;
		}
		// Don't rebuild the thread here — the change only matters for the
		// next turn, and `sendMessage` will compare `threadOptionsKey`
		// against the desired key and call `resumeThread(id, newOptions)`.
		// Doing it lazily avoids spawning a transient codex process for a
		// model change that the user might still be tweaking in the picker.
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		// Codex SDK does not currently expose mid-turn permission gating
		// through the events API — `approvalPolicy` is set at thread start.
	}

	respondToUserInputRequest(_requestId: string, _response: SessionInputResponseKind, _answers?: Record<string, SessionInputAnswer>): void {
		// Codex SDK has no equivalent of the Claude `ask_user` tool yet.
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// The Codex SDK has no mid-turn injection mechanism, but we can
		// buffer a steering message and prepend it to the next user prompt.
		// Queued messages are consumed server-side and intentionally ignored.
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			entry.state.pendingSteeringPrompt = steeringMessage?.userMessage.text;
			if (steeringMessage) {
				this._logService.trace(`[Codex:${sessionId}] steering message buffered (${steeringMessage.userMessage.text.length} chars)`);
			}
			return;
		}
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			provisional.pendingSteeringPrompt = steeringMessage?.userMessage.text;
		}
	}

	setClientTools(_session: URI, _clientId: string, _tools: ToolDefinition[]): void {
		// Client-provided tools are not wired through Codex yet.
	}

	onClientToolCallComplete(_session: URI, _toolCallId: string, _result: ToolCallResult): void {
		// No client tools registered.
	}

	setClientCustomizations(_clientId: string, _customizations: CustomizationRef[], _progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		return Promise.resolve([]);
	}

	setCustomizationEnabled(_uri: string, _enabled: boolean): void {
		// No customizations to toggle.
	}

	shutdown(): Promise<void> {
		return this._shutdownPromise ??= (async () => {
			for (const entry of this._sessions.values()) {
				entry.state.abortController.abort();
			}
			this._sessions.clearAndDisposeAll();
			for (const provisional of this._provisionalSessions.values()) {
				provisional.abortController.abort();
			}
			this._provisionalSessions.clear();
		})();
	}

	override dispose(): void {
		for (const entry of this._sessions.values()) {
			entry.state.abortController.abort();
		}
		this._sessions.clearAndDisposeAll();
		for (const provisional of this._provisionalSessions.values()) {
			provisional.abortController.abort();
		}
		this._provisionalSessions.clear();
		super.dispose();
		this._proxyHandle?.dispose();
		this._proxyHandle = undefined;
		this._githubToken = undefined;
		this._codex = undefined;
		this._models.set([], undefined);
	}
}

/**
 * Materialized session entry held in the {@link DisposableMap}. Wraps the
 * mutable {@link ICodexSession} state with an `IDisposable` contract for
 * the map's lifecycle management.
 */
interface ICodexSessionEntry extends IDisposable {
	readonly state: ICodexSession;
	readonly sessionUri: URI;
	readonly workingDirectory: URI | undefined;
}
