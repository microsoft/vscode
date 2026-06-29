/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { ModelInfo, Options, SDKSessionInfo, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SequencerByKey } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel } from '../../common/claudeModelConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, CLAUDE_AGENT_PROVIDER_ID, GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, IActiveClient, IAgent, IAgentCreateChatOptions, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { PolicyState, ProtectedResourceMetadata, type AgentSelection, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { isSubagentSession, parseSubagentSessionUri, buildChatUri, parseChatUri, isDefaultChatUri, ChatInputResponseKind, type ClientPluginCustomization, type Customization, type MessageAttachment, type PendingMessage, type ChatInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { projectFromCopilotContext } from '../copilot/copilotGitProject.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { buildModelEnumerationOptions } from './claudeSdkOptions.js';
import { mapSessionMessagesToTurns, resolveForkAnchorUuid } from './claudeReplayMapper.js';
import { getSubagentTranscript } from './claudeSubagentResolver.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { handleCanUseTool } from './claudeCanUseTool.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { createPricingMetaFromBilling, type ICAPIModelBilling } from '../../common/agentModelPricing.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import { IClaudeProxyHandle, IClaudeProxyService, type ClaudeTransport } from './claudeProxyService.js';
import { readClaudePermissionMode } from './claudeSessionPermissionMode.js';
import { ClaudeSessionMetadataStore, IClaudeSessionOverlay } from './claudeSessionMetadataStore.js';
import { ISessionDataService } from '../../common/sessionDataService.js';

const USER_AGENT_PREFIX = 'vscode_claude_code';

/**
 * Persisted catalog entry for an additional (non-default) peer chat. Maps the
 * client-chosen chatId to the SDK conversation that backs it (and an optional
 * model override) so the chat can be re-resumed after a process restart even
 * though {@link ClaudeAgent._chatSessions} is empty in a fresh process.
 */
interface IPersistedChat {
	readonly sdkSessionId: string;
	readonly model?: ModelSelection;
}

/**
 * Returns true if `m` is a Claude-family model that should be advertised
 * to clients picking a model for the Claude provider.
 *
 * Combines the same surface checks the extension uses (vendor, picker
 * eligibility, tool-call support, `/v1/messages` endpoint) with a parse
 * of the model id via {@link tryParseClaudeModelId}, which excludes
 * synthetic ids like `auto` that aren't real Claude endpoints.
 */
function isClaudeModel(m: CCAModel): boolean {
	return (
		m.vendor === 'Anthropic' &&
		!!m.supported_endpoints?.includes('/v1/messages') &&
		!!m.model_picker_enabled &&
		!!m.capabilities?.supports?.tool_calls &&
		tryParseClaudeModelId(m.id) !== undefined
	);
}

/**
 * Augments the published `@vscode/copilot-api` `CCAModelSupports` with the
 * per-model `adaptive_thinking` / `reasoning_effort` fields the runtime
 * CAPI `/models` payload already carries but the SDK type doesn't yet
 * declare. Tracked at microsoft/vscode-capi#85; remove this when the SDK
 * catches up. Mirror of the same pattern at
 * `extensions/copilot/src/platform/endpoint/common/endpointProvider.ts`
 * (its locally-declared `IChatModelCapabilities`).
 */
interface IClaudeModelSupports {
	readonly adaptive_thinking?: boolean;
	readonly reasoning_effort?: readonly string[];
}

/**
 * Project a {@link CCAModel} into the agent host's
 * {@link IAgentModelInfo} surface. The returned `provider` is the
 * agent's id (`'claude'`) — clients filter the root state's model list
 * by provider, so this must match {@link ClaudeAgent.id}, NOT the
 * upstream `vendor: 'Anthropic'` field.
 */
function toAgentModelInfo(m: CCAModel, provider: AgentProvider): IAgentModelInfo {
	const supports = m.capabilities?.supports;
	const supportedEfforts = ((supports as IClaudeModelSupports | undefined)?.reasoning_effort ?? []).filter(isClaudeEffortLevel);
	const configSchema = createClaudeThinkingLevelSchema(supportedEfforts);
	const policyState = m.policy?.state as PolicyState | undefined;
	const billing = m.billing as ICAPIModelBilling | undefined;
	// priceCategory may appear as a top-level model field depending on the CAPI version.
	const priceCategory = typeof (m as { modelPickerPriceCategory?: string }).modelPickerPriceCategory === 'string'
		? (m as { modelPickerPriceCategory?: string }).modelPickerPriceCategory
		: undefined;
	return {
		provider,
		// CAPI/endpoint format, dotted version (e.g. `claude-haiku-4.5`) — the
		// canonical id through `ModelSelection.id`. Convert to SDK format at SDK
		// seams via `toSdkModelId`.
		id: m.id,
		name: m.name,
		maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
		maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
		maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
		supportsVision: !!supports?.vision,
		...(configSchema ? { configSchema } : {}),
		...(policyState ? { policyState } : {}),
		_meta: createPricingMetaFromBilling(billing, priceCategory),
	};
}

/**
 * Project an SDK {@link ModelInfo} into the agent host's
 * {@link IAgentModelInfo} surface for the native (BYO-Anthropic) transport.
 * Carries NO commercial metadata (no `policyState`, no pricing `_meta`) —
 * those are Copilot/CAPI concepts. Reuses the shared effort-schema helpers so
 * the thinking-level picker matches the proxied projection.
 */
export function fromSdkModelInfo(m: ModelInfo, provider: AgentProvider): IAgentModelInfo {
	const supportedEfforts = (m.supportedEffortLevels ?? []).filter(isClaudeEffortLevel);
	const configSchema = createClaudeThinkingLevelSchema(supportedEfforts);
	return {
		provider,
		// SDK-canonical id (`m.value`, e.g. `claude-sonnet-4-5-20250929`). Native
		// ids are SDK format end to end; `toSdkModelId` is identity at this seam.
		id: m.value,
		name: m.displayName,
		supportsVision: false,
		...(configSchema ? { configSchema } : {}),
	};
}

// Single source of truth for narrowing an arbitrary runtime value to
// the closed `ClaudePermissionMode` union now lives in
// `../../common/claudeSessionConfigKeys.ts` so it can be shared by
// `ClaudeAgent`, `ClaudeSessionMetadataStore`, and any other consumer
// that needs the same narrowing semantics. The live per-session read
// helper lives in `./claudeSessionPermissionMode.ts` so the session
// and materializer can read directly without threading callbacks
// through the agent.

// Provisional session state is hosted directly on {@link ClaudeAgentSession}
// (pre-materialize fields: project, abortController, provisionalModel,
// provisionalConfig). The legacy `IClaudeProvisionalSession` map shape
// was retired in Phase 10.5 Step 3a.

/**
 * Claude active-client handle. Tools read/write through the live session's
 * {@link SessionClientToolsModel}; customization assignment kicks off the
 * agent's async sync (via the provided closure). The handle caches the last
 * assigned customization inputs so the getter reflects what the client most
 * recently published.
 */
class ClaudeActiveClientHandle implements IActiveClient {
	private _customizations: readonly ClientPluginCustomization[] = [];

	constructor(
		readonly clientId: string,
		readonly displayName: string | undefined,
		private readonly _getTools: () => readonly ToolDefinition[],
		private readonly _setTools: (tools: readonly ToolDefinition[]) => void,
		private readonly _syncCustomizations: (customizations: readonly ClientPluginCustomization[]) => void,
	) { }

	get tools(): readonly ToolDefinition[] {
		return this._getTools();
	}
	set tools(tools: readonly ToolDefinition[]) {
		this._setTools(tools);
	}

	get customizations(): readonly ClientPluginCustomization[] {
		return this._customizations;
	}
	set customizations(customizations: readonly ClientPluginCustomization[]) {
		this._customizations = customizations;
		this._syncCustomizations(customizations);
	}
}

/**
 * Phase 4 skeleton {@link IAgent} provider for the Claude Agent SDK.
 *
 * What is implemented:
 * - Provider id, descriptor, and protected resources surface so root
 *   state advertises Claude alongside Copilot CLI.
 * - GitHub token capture via {@link authenticate} and lazy acquisition
 *   of an {@link IClaudeProxyHandle} from {@link IClaudeProxyService}.
 * - {@link models} observable derived from {@link ICopilotApiService.models}
 *   filtered to Claude-family entries via {@link isClaudeModel}.
 *
 * What is stubbed:
 * - All other {@link IAgent} methods throw `Error('TODO: Phase N')`. The
 *   exact phase numbers reference the roadmap in
 *   `src/vs/platform/agentHost/node/claude/roadmap.md`.
 *
 * The class is intentionally lean: each subsequent phase adds one
 * concern (sessions, sendMessage, permissions, etc.) so the surface area
 * of any single review stays small.
 */
export class ClaudeAgent extends Disposable implements IAgent {
	readonly id: AgentProvider = CLAUDE_AGENT_PROVIDER_ID;

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _onDidCustomizationsChange = this._register(new Emitter<void>());
	readonly onDidCustomizationsChange = this._onDidCustomizationsChange.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

	private _githubToken: string | undefined;
	private _proxyHandle: IClaudeProxyHandle | undefined;
	private _serverToolHost: IAgentServerToolHost | undefined;

	/**
	 * Resolved host transport mode (Phase 19). `proxy` (default) routes through
	 * the Copilot-CAPI proxy; `native` talks to Anthropic directly on the user's
	 * own credentials. Resolved once from the `ClaudeUseCopilotProxy` root
	 * config value and kept current by an `onDidRootConfigChange` subscription.
	 * Config changes affect FUTURE sessions only — never an in-flight subprocess.
	 */
	private _transportMode: 'proxy' | 'native' = 'proxy';

	/**
	 * Memoized teardown promise. Set on the first call to {@link shutdown},
	 * returned by every subsequent call. Mirrors `CopilotAgent.shutdown`
	 * at copilotAgent.ts:1246. Phase 5 has no async work so the race
	 * is benign, but the contract is locked now so Phase 6's real
	 * async teardown (Query.interrupt(), in-flight metadata writes)
	 * cannot regress.
	 */
	private _shutdownPromise: Promise<void> | undefined;

	/**
	 * Live in-memory session entries, keyed by raw session id (not URI).
	 * Each {@link ClaudeSessionEntry} owns its {@link ClaudeAgentSession} plus
	 * any per-session disposables registered against it (e.g. the forward
	 * subscription to the session's `onDidSessionProgress` event). Disposing
	 * the map disposes every entry, which in turn disposes everything
	 * registered to it — no parallel maps, no implicit lockstep invariants.
	 * {@link createSession} is the only writer; {@link disposeSession} and
	 * {@link shutdown} remove via {@link DisposableMap.deleteAndDispose}, which
	 * is idempotent if the key has already been removed.
	 */
	private readonly _sessions = this._register(new DisposableMap<string, ClaudeSessionEntry>());

	/**
	 * Live in-memory additional (non-default) peer chats, keyed by chat URI
	 * string (`ahp-chat://<chatId>/<base64(sessionUri)>`). Each entry owns a
	 * full {@link ClaudeAgentSession} whose `sessionUri` IS the chat URI and
	 * whose `sessionId` is the chat's own SDK conversation id — distinct from
	 * the parent session's. Parallel to {@link _sessions} (which holds default
	 * chats keyed by raw session id); see {@link CopilotAgent} for the mirror.
	 */
	private readonly _chatSessions = this._register(new DisposableMap<string, ClaudeSessionEntry>());

	/** Persisted peer-chat catalog metadata key, keyed per parent session. */
	private static readonly _META_CHATS = 'claude.chats';

	/** Stable active-client handles, keyed by `${sessionId}\0${clientId}`. */
	private readonly _activeClientHandles = new Map<string, ClaudeActiveClientHandle>();

	/**
	 * Phase 6: fired once per session when {@link _materializeProvisional}
	 * promotes a provisional record into a real {@link ClaudeAgentSession}.
	 * The {@link IAgentService} subscribes via the platform contract
	 * (`agentService.ts:412`) to dispatch the deferred `sessionAdded`
	 * notification — observers don't see the session in their list until
	 * persistence has settled.
	 */
	private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
	readonly onDidMaterializeSession = this._onDidMaterializeSession.event;

	/**
	 * Per-session-id serializer shared by {@link disposeSession} and
	 * {@link shutdown}. Phase 5 dispose work is synchronous, so the queued
	 * tasks resolve immediately and the sequencer is mostly a no-op. The
	 * routing is locked in now (per plan section 3.3.4 / section 3.3.6) so
	 * Phase 6's real async teardown (`Query.interrupt()`, in-flight metadata
	 * writes) inherits per-session serialization for free — a concurrent
	 * `disposeSession(uri)` already in flight is awaited before
	 * `shutdown()` reuses the same key.
	 */
	private readonly _disposeSequencer = new SequencerByKey<string>();

	/**
	 * Phase 6: per-session-id serializer for {@link sendMessage}. Held
	 * across both {@link _materializeProvisional} AND `entry.send()` so
	 * two concurrent first-message calls on the same session collapse
	 * into one materialize plus two ordered sends. Separate from
	 * {@link _disposeSequencer} so a `disposeSession` racing a first send
	 * still serializes against in-flight teardown without deadlocking
	 * inside the send sequencer (different key spaces, single
	 * race-resolution lattice via the underlying `AbortController`).
	 */
	private readonly _sessionSequencer = new SequencerByKey<string>();

	private readonly _metadataStore: ClaudeSessionMetadataStore;

	/**
	 * Unified per-session lookup. Returns the session whether it is
	 * still provisional or already materialized; callers branch on
	 * {@link ClaudeAgentSession.isPipelineReady} when behavior differs.
	 */
	private _findAnySession(sessionId: string): ClaudeAgentSession | undefined {
		return this._sessions.get(sessionId)?.session;
	}

	/**
	 * Resolve a live {@link ClaudeAgentSession} by its SDK conversation id,
	 * searching both default chats ({@link _sessions}, keyed directly by SDK
	 * id) and additional peer chats ({@link _chatSessions}, keyed by chat URI
	 * but whose `session.sessionId` is the SDK id). Used by SDK-id-addressed
	 * callbacks — proxy credit reports and the `canUseTool` permission bridge —
	 * which carry the SDK session id, not the chat URI.
	 */
	private _findSessionBySdkId(sdkSessionId: string): ClaudeAgentSession | undefined {
		const direct = this._sessions.get(sdkSessionId)?.session;
		if (direct) {
			return direct;
		}
		for (const entry of this._chatSessions.values()) {
			if (entry.session.sessionId === sdkSessionId) {
				return entry.session;
			}
		}
		return undefined;
	}

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@IProductService private readonly _productService: IProductService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
		this._metadataStore = _instantiationService.createInstance(ClaudeSessionMetadataStore, this.id);
		// CAPI reports each request's billed credits via the proxy (the SDK
		// strips `copilot_usage` from its `result`). Route every report to
		// the originating session by the session id the proxy decoded from
		// the Bearer token, so the session can surface real per-turn credits.
		this._register(this._claudeProxyService.onDidReportCredits(e => {
			this._findSessionBySdkId(e.sessionId)?.recordTurnCredits(e.totalNanoAiu);
		}));

		// Phase 19: resolve the transport mode now and re-resolve reactively.
		// A flip only affects sessions materialized afterwards; in-flight
		// subprocesses keep their original transport. When native, kick off an
		// initial model refresh since no GitHub auth (which would otherwise
		// trigger it) is required.
		this._transportMode = this._resolveTransportMode();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const next = this._resolveTransportMode();
			if (next !== this._transportMode) {
				this._transportMode = next;
				void this._refreshModels();
			}
		}));
		if (this._transportMode === 'native') {
			// Only native bootstraps its model list here. Proxy mode fetches
			// models from CAPI, which needs the GitHub token — so its first
			// refresh is triggered by `authenticate()` once that token arrives
			// (a refresh now would just hit the no-token early-return). Native
			// needs no GitHub auth and nothing else triggers a refresh, so we
			// kick off the initial enumeration ourselves. (Transport *flips*
			// after construction are covered by the `onDidRootConfigChange`
			// subscription above.) `queueMicrotask` runs it off the ctor stack.
			queueMicrotask(() => { void this._refreshModels(); });
		}
	}

	private _resolveTransportMode(): 'proxy' | 'native' {
		// Defaults to proxied when the `claudeUseCopilotProxy` root value is unset.
		const useProxy = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.ClaudeUseCopilotProxy) ?? true;
		return useProxy ? 'proxy' : 'native';
	}

	// #region Descriptor + auth

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('claudeAgent.displayName', "Claude"),
			description: localize('claudeAgent.description', "Claude agent backed by the Anthropic Claude Agent SDK"),
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		// Native (BYO-Anthropic) mode needs no GitHub Copilot auth — the SDK owns
		// the Anthropic credential — so the required Copilot resource is dropped.
		// The optional repo resource is kept for git operations either way.
		if (this._transportMode !== 'proxy') {
			return [GITHUB_REPO_PROTECTED_RESOURCE];
		}
		return [
			GITHUB_COPILOT_PROTECTED_RESOURCE,
			GITHUB_REPO_PROTECTED_RESOURCE,
		];
	}

	/**
	 * Resolve the active {@link ClaudeTransport}. In native mode the transport
	 * is always ready (the SDK owns credentials); in proxied mode a started
	 * proxy handle is required, otherwise {@link AHP_AUTH_REQUIRED} is thrown.
	 */
	private _ensureAuthenticated(): ClaudeTransport {
		if (this._transportMode !== 'proxy') {
			return { kind: 'native' };
		}
		const handle = this._proxyHandle;
		if (!handle) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				'Authentication is required to use Claude',
				this.getProtectedResources(),
			);
		}
		return { kind: 'proxy', handle };
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource === GITHUB_REPO_PROTECTED_RESOURCE.resource) {
			return true;
		}
		if (resource !== GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
			return false;
		}
		// Native (BYO-Anthropic) mode needs no proxy and no GitHub token. Record
		// the token (harmless; lets a later flip back to proxy reuse it) but do
		// NOT start the proxy or treat the absence of a token as unauthenticated.
		if (this._transportMode !== 'proxy') {
			this._githubToken = token;
			return true;
		}
		const tokenChanged = this._githubToken !== token;
		if (!tokenChanged) {
			this._logService.info('[Claude] Auth token unchanged');
			return true;
		}
		// Acquire the new handle BEFORE committing the token or disposing
		// the old one. If `start()` throws, leave `_githubToken` and
		// `_proxyHandle` untouched so the next `authenticate()` call still
		// sees the token as new and retries — otherwise a transient proxy
		// startup failure would leave us in a "token recorded, no proxy
		// running" state and the retry path would short-circuit as
		// "unchanged" and falsely return true.
		//
		// The proxy server's refcount stays >= 1 throughout this swap
		// because the new handle is acquired before the old one is
		// disposed; {@link IClaudeProxyService} applies most-recent-token-
		// wins on subsequent `start()` calls.
		const newHandle = await this._claudeProxyService.start(token);
		const oldHandle = this._proxyHandle;
		this._proxyHandle = newHandle;
		this._githubToken = token;
		this._logService.info('[Claude] Auth token updated');
		oldHandle?.dispose();
		void this._refreshModels();
		return true;
	}

	/**
	 * Whether the Claude provider routes through the Copilot-CAPI proxy.
	 * Reads the resolved {@link _transportMode} (Phase 19), which the
	 * constructor seeds from the `ClaudeUseCopilotProxy` root config value.
	 */
	private _isProxyEnabled(): boolean {
		return this._transportMode === 'proxy';
	}

	private async _refreshModels(): Promise<void> {
		const proxyAtStart = this._isProxyEnabled();
		const tokenAtStart = this._githubToken;
		if (proxyAtStart && !tokenAtStart) {
			this._models.set([], undefined);
			return;
		}
		try {
			const filtered = proxyAtStart
				? await this._fetchProxyModels(tokenAtStart!)
				: await this._fetchNativeModels();
			// Stale-write guard: bail if the transport flipped, or (proxy) the
			// token rotated, while we were awaiting — a newer refresh already
			// published the right list.
			if (this._isProxyEnabled() !== proxyAtStart || (proxyAtStart && this._githubToken !== tokenAtStart)) {
				return;
			}
			this._logService.info(`[Claude] Models refreshed. Count: ${filtered.length}, ${filtered.map(m => m.name).join(', ')}`);
			this._models.set(filtered, undefined);
		} catch (err) {
			this._logService.error(err, '[Claude] Failed to refresh models');
			if (this._isProxyEnabled() === proxyAtStart && (!proxyAtStart || this._githubToken === tokenAtStart)) {
				this._models.set([], undefined);
			}
		}
	}

	/**
	 * Native (BYO-Anthropic) model source: enumerate the SDK's built-in /
	 * subscription models by opening a throwaway {@link IClaudeAgentSdkService.query}
	 * (workspace-free options that read the user's real `~/.claude` config) and
	 * calling `Query.supportedModels()` on it, then `close()`. The prompt never
	 * yields, so no turn runs and no session transcript is written (verified
	 * Phase 19 E2E). Projected with no commercial metadata.
	 */
	private async _fetchNativeModels(): Promise<readonly IAgentModelInfo[]> {
		// A prompt iterable that never yields: enumeration only needs the
		// control-request channel (`Query.supportedModels()`), not a real turn.
		const neverYieldingPrompt: AsyncIterable<SDKUserMessage> = {
			[Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<SDKUserMessage>>(() => { /* never resolves */ }) }),
		};
		const options = buildModelEnumerationOptions();
		const query = await this._sdkService.query({ prompt: neverYieldingPrompt, options });
		try {
			const models = await query.supportedModels();
			return models.map(m => fromSdkModelInfo(m, this.id));
		} finally {
			// `close()` terminates the subprocess; aborting the controller is a
			// belt-and-suspenders teardown for anything `close()` leaves pending.
			query.close();
			options.abortController?.abort();
		}
	}

	/**
	 * Proxied (Copilot-CAPI) model source: fetch via {@link ICopilotApiService},
	 * keep the Claude family, and surface the CAPI-flagged chat-default first.
	 * The picker treats `models[0]` as the de facto default (modelPicker.ts:144
	 * — `_selectedModel ?? models[0]`) since `IAgentModelInfo` carries no
	 * explicit `isDefault` bit; the stable comparator returns 0 for equal-
	 * priority models so CAPI's ordering wins on ties.
	 */
	private async _fetchProxyModels(token: string): Promise<readonly IAgentModelInfo[]> {
		const userAgent = `${USER_AGENT_PREFIX}/${this._productService.version}`;
		const all = await this._copilotApiService.models(token, { headers: { 'User-Agent': userAgent }, suppressIntegrationId: true });
		return all
			.filter(isClaudeModel)
			.sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default))
			.map(m => toAgentModelInfo(m, this.id));
	}

	// #endregion

	// #region Stubs — implemented in later phases

	async createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
		this._ensureAuthenticated();
		if (config.fork) {
			return this._forkSession(config, config.fork);
		}
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);

		const existing = this._findAnySession(sessionId);
		if (existing) {
			if (!existing.isPipelineReady) {
				return {
					session: existing.sessionUri,
					workingDirectory: existing.workingDirectory,
					provisional: true,
					...(existing.project ? { project: existing.project } : {}),
				};
			}
			return { session: sessionUri, workingDirectory: config.workingDirectory };
		}

		const project = config.workingDirectory
			? await projectFromCopilotContext({ cwd: config.workingDirectory.fsPath }, this._gitService)
			: undefined;

		const permissionMode = this._resolvePermissionMode(config.config);

		const session = ClaudeAgentSession.createProvisional(
			sessionId,
			sessionUri,
			config.workingDirectory,
			project,
			config.model,
			config.agent,
			config.config,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._metadataStore,
			this._instantiationService,
		);
		const entry = new ClaudeSessionEntry(session);
		entry.addDisposable(session.onDidSessionProgress(signal => this._onDidSessionProgress.fire(signal)));
		entry.addDisposable(session.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
		this._sessions.set(sessionId, entry);

		return {
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			provisional: true,
			...(project ? { project } : {}),
		};
	}

	/**
	 * In-place "Restore Checkpoint" truncation. Keeps turns
	 * `[0..turnId]` INCLUSIVE (or removes all turns when `turnId` is
	 * omitted) on the **same** session id / URI — unlike fork, which mints a
	 * new id. The `turnId` path resolves the protocol turn to its SDK
	 * assistant-envelope uuid ({@link resolveForkAnchorUuid}) and stages it
	 * as a one-shot `resumeSessionAt` anchor that the next turn's rebuild
	 * applies (the truncation finalizes when the next turn writes the
	 * branch). Serialized on {@link _sessionSequencer} (same key as
	 * `sendMessage`) so the `ChatTruncated` → `ChatTurnStarted` dispatch pair
	 * stays ordered. Provisional sessions short-circuit.
	 */
	async truncateSession(session: URI, turnId?: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			const existing = this._findAnySession(sessionId);
			if (existing && !existing.isPipelineReady) {
				this._logService.info(`[Claude:${sessionId}] truncateSession on a provisional session — nothing to truncate`);
				return;
			}

			if (turnId === undefined) {
				await this._removeAllTurns(session, sessionId, existing);
				return;
			}

			const messages = await this._sdkService.getSessionMessages(sessionId, { includeSystemMessages: true });
			const anchor = resolveForkAnchorUuid(messages, turnId);
			if (anchor === undefined) {
				throw new Error(`Cannot truncate session ${sessionId}: turn ${turnId} not found in transcript`);
			}

			// Operate on a live session; cold-resume an unloaded one first so
			// there is a single code path that sets the anchor on a live
			// pipeline (the next send applies it).
			const live = existing ?? await this._resumeSession(sessionId, session);
			await live.truncateToTurn(turnId, anchor);
			this._logService.info(`[Claude:${sessionId}] truncateSession kept [0..${turnId}] (anchor=${anchor})`);
		});
	}

	/**
	 * Remove-all ("start over") branch of {@link truncateSession}: there is no
	 * anchor to resume at, so tear down the live Query, delete the on-disk
	 * transcript via the SDK, then recreate a fresh provisional under the SAME
	 * id/URI so the next `sendMessage` materializes non-resume `{ sessionId }`
	 * on a clean transcript (keeps the id stable). `deleteSession` is eagerly
	 * durable (unlike the lazy `turnId` path), matching its "clear / start
	 * over" semantic. `existing` is the live session, or `undefined` on the
	 * cold path (unloaded session). Caller serializes on {@link _sessionSequencer}.
	 */
	private async _removeAllTurns(session: URI, sessionId: string, existing: ClaudeAgentSession | undefined): Promise<void> {
		const info = existing ? undefined : await this._sdkService.getSessionInfo(sessionId);
		const workingDirectory = existing?.workingDirectory ?? (info?.cwd ? URI.file(info.cwd) : undefined);
		if (!workingDirectory) {
			// Mirror `_resumeSession` / fork: fail fast rather than recreate a
			// provisional with no cwd that would only fail later at materialize.
			throw new Error(`Cannot clear session ${sessionId}: workingDirectory missing (SDK cwd absent and no live session)`);
		}
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(session);
		} catch (err) {
			this._logService.warn(`[Claude:${sessionId}] overlay read failed during remove-all; continuing with defaults`, err);
		}

		// `shutdownLiveQuery` awaits the subprocess's actual exit (and its final
		// transcript flush), so the on-disk `<id>.jsonl` is now stable and safe
		// to delete: no live writer can recreate it before the next turn
		// respawns a fresh `--session-id <id>`.
		await existing?.shutdownLiveQuery();
		this._sessions.deleteAndDispose(sessionId);
		await this._sdkService.deleteSession(sessionId);

		await this.createSession({
			session,
			workingDirectory,
			...(overlay.model ? { model: overlay.model } : {}),
			...(overlay.agent ? { agent: overlay.agent } : {}),
			...(overlay.permissionMode ? { config: { [ClaudeSessionConfigKey.PermissionMode]: overlay.permissionMode } } : {}),
		});
		// Re-fetch (not reuse `existing`): `existing` is the OLD session, already
		// torn down by `deleteAndDispose` above, and is `undefined` entirely on
		// the cold path. `createSession` registered a fresh instance under the
		// same id — prune through that live session so a single path covers both
		// warm and cold remove-all.
		await this._findAnySession(sessionId)?.pruneAllTurns();
		this._logService.info(`[Claude:${sessionId}] truncateSession removed all turns (deleteSession + fresh same-id)`);
	}

	/**
	 * Fork an existing session at a protocol `turnId` (keep `[0..N]`
	 * INCLUSIVE) into a new, non-provisional session. The SDK `Query` is
	 * NOT started here (CONTEXT M9): `forkSession` writes the transcript to
	 * disk and we return; the `Query` materializes lazily on the first
	 * {@link sendMessage} via {@link _resumeSession}. `turnId` is translated
	 * to the SDK envelope `uuid` by {@link resolveForkAnchorUuid};
	 * `config.fork.turnIdMapping` is ignored (the SDK already remaps uuids).
	 */
	private async _forkSession(config: IAgentCreateSessionConfig, fork: NonNullable<IAgentCreateSessionConfig['fork']>): Promise<IAgentCreateSessionResult> {
		if (isSubagentSession(fork.session)) {
			throw new Error('Cannot fork a subagent session');
		}
		const sourceSessionId = AgentSession.id(fork.session);
		const existingSource = this._findAnySession(sourceSessionId);
		if (existingSource && !existingSource.isPipelineReady) {
			throw new Error('Cannot fork a provisional/never-sent session');
		}
		// Serialize against the SOURCE session so the transcript read + fork
		// can't race an in-flight `sendMessage` mutating that session.
		return this._sessionSequencer.queue(sourceSessionId, async () => {
			const messages = await this._sdkService.getSessionMessages(sourceSessionId, { includeSystemMessages: true });
			const upToMessageId = resolveForkAnchorUuid(messages, fork.turnId);
			if (upToMessageId === undefined) {
				throw new Error(`Cannot fork session ${sourceSessionId}: turn ${fork.turnId} not found in transcript`);
			}
			const { sessionId: newSessionId } = await this._sdkService.forkSession(sourceSessionId, { upToMessageId });
			const newSessionUri = AgentSession.uri(this.id, newSessionId);

			// Inherit the source's model / permissionMode / agent (create-config
			// overrides win) so the lazy `_resumeSession` seeds `Options` from
			// it. `customizationDirectory` is NOT inherited — it is the source's
			// per-session synced plugin dir (Phase 11); the fork re-syncs its own.
			let sourceOverlay: IClaudeSessionOverlay = {};
			try {
				sourceOverlay = await this._metadataStore.read(fork.session);
			} catch (err) {
				this._logService.warn(`[Claude] fork: source overlay read failed for ${sourceSessionId}; continuing with defaults`, err);
			}
			const model = config.model ?? sourceOverlay.model;
			const agent = config.agent ?? sourceOverlay.agent;
			const permissionMode = narrowClaudePermissionMode(config.config?.[ClaudeSessionConfigKey.PermissionMode]) ?? sourceOverlay.permissionMode;
			await this._metadataStore.write(newSessionUri, {
				...(model ? { model } : {}),
				...(permissionMode ? { permissionMode } : {}),
				...(agent ? { agent } : {}),
			});

			// Resolve the forked session's working directory now so we can fail
			// fast (rather than at the first `sendMessage` when `_resumeSession`
			// requires a cwd). The Query itself starts lazily — see the JSDoc.
			const sdkInfo = await this._sdkService.getSessionInfo(newSessionId);
			const workingDirectory = sdkInfo?.cwd ? URI.file(sdkInfo.cwd) : config.workingDirectory;
			if (!workingDirectory) {
				throw new Error(`Cannot fork session ${sourceSessionId}: forked session ${newSessionId} has no working directory (SDK cwd missing and none supplied)`);
			}
			let project: IAgentSessionProjectInfo | undefined;
			try {
				project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			} catch (err) {
				this._logService.warn(`[Claude] fork: project resolution failed for ${newSessionId}; continuing without project`, err);
			}
			return {
				session: newSessionUri,
				workingDirectory,
				...(project ? { project } : {}),
			};
		});
	}

	/**
	 * Builds the SDK `canUseTool` permission bridge for a session/chat. The
	 * resolver searches both default chats and peer chats by SDK id so a peer
	 * chat's tool-permission requests reach its own pending-permission registry.
	 */
	private _makeCanUseTool(sdkSessionId: string): NonNullable<Options['canUseTool']> {
		return (toolName, input, options) =>
			handleCanUseTool(
				{ getSession: id => this._findSessionBySdkId(id), configurationService: this._configurationService },
				sdkSessionId, toolName, input, options,
			);
	}

	/**
	 * Promote a provisional {@link ClaudeAgentSession} into a live one.
	 * Called from {@link sendMessage} inside the {@link _sessionSequencer.queue}
	 * block, so concurrent first sends serialize naturally — exactly
	 * one materialize per session.
	 *
	 * Failure modes:
	 * - Missing session entry → programmer error, throws.
	 * - Missing proxy handle → caller forgot {@link authenticate}, throws.
	 * - Aborted before SDK init returns → {@link ClaudeAgentSession.materialize}
	 *   disposes the `WarmQuery` and throws {@link CancellationError}.
	 * - Customization-directory persistence failure → fatal: the session's
	 *   `materialize` throws, the agent drops the entry, and the error
	 *   propagates so the caller learns about it.
	 * - Aborted post-metadata-write but pre-commit → second abort gate
	 *   inside `materialize` throws so we never expose a live pipeline
	 *   for a session the caller has already torn down.
	 */
	private async _materializeProvisional(sessionId: string): Promise<ClaudeAgentSession> {
		const session = this._findAnySession(sessionId);
		if (!session) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const transport = this._ensureAuthenticated();

		const canUseTool = this._makeCanUseTool(sessionId);

		try {
			await session.materialize({ transport, canUseTool, isResume: false, serverToolHost: this._serverToolHost });
		} catch (err) {
			this._sessions.deleteAndDispose(sessionId);
			throw err;
		}

		this._onDidMaterializeSession.fire({
			session: session.sessionUri,
			workingDirectory: session.workingDirectory,
			project: session.project,
		});

		return session;
	}

	/**
	 * Bring up a session whose state exists only on disk — created in
	 * another window, or before an agent-host restart. Mirror of
	 * `CopilotAgent._resumeSession`. Reads `workingDirectory` from the
	 * SDK's session record and `model` / `permissionMode` from the
	 * metadata overlay, constructs a provisional {@link ClaudeAgentSession},
	 * and calls {@link ClaudeAgentSession.materialize} with `isResume: true`
	 * so the SDK reloads the existing transcript instead of minting a
	 * fresh one.
	 *
	 * Caller must hold the session sequencer so two concurrent
	 * `sendMessage` calls for a freshly-resumed session collapse into
	 * one resume + two ordered sends.
	 */
	private async _resumeSession(sessionId: string, sessionUri: URI): Promise<ClaudeAgentSession> {
		this._logService.info(`[Claude:${sessionId}] _resumeSession — no in-memory state, rebuilding from disk`);
		const transport = this._ensureAuthenticated();
		const sdkInfo = await this._sdkService.getSessionInfo(sessionId);
		if (!sdkInfo) {
			throw new Error(`Cannot resume unknown session: ${sessionId} (not present in SDK transcript store)`);
		}
		const workingDirectory = sdkInfo.cwd ? URI.file(sdkInfo.cwd) : undefined;
		if (!workingDirectory) {
			throw new Error(`Cannot resume session ${sessionId}: workingDirectory missing from SDK transcript`);
		}
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(sessionUri);
		} catch (err) {
			this._logService.warn(`[Claude:${sessionId}] overlay read failed during resume; continuing with defaults`, err);
		}
		const permissionMode = readClaudePermissionMode(this._configurationService, sessionUri)
			?? overlay.permissionMode
			?? 'default';
		let project: IAgentSessionProjectInfo | undefined;
		try {
			project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
		} catch (err) {
			this._logService.warn(`[Claude:${sessionId}] project resolution failed during resume; continuing without project`, err);
		}

		const session = ClaudeAgentSession.createProvisional(
			sessionId,
			sessionUri,
			workingDirectory,
			project,
			overlay.model,
			overlay.agent,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._metadataStore,
			this._instantiationService,
		);
		const entry = new ClaudeSessionEntry(session);
		entry.addDisposable(session.onDidSessionProgress(signal => this._onDidSessionProgress.fire(signal)));
		entry.addDisposable(session.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
		this._sessions.set(sessionId, entry);

		const canUseTool = this._makeCanUseTool(sessionId);

		try {
			await session.materialize({ transport, canUseTool, isResume: true, serverToolHost: this._serverToolHost });
		} catch (err) {
			this._sessions.deleteAndDispose(sessionId);
			throw err;
		}

		this._onDidMaterializeSession.fire({
			session: sessionUri,
			workingDirectory,
			project,
		});

		return session;
	}

	/**
	 * Pull `permissionMode` out of the post-validation `IAgentCreateSessionConfig.config`
	 * bag, narrowing the runtime `unknown` value to the SDK's `PermissionMode`
	 * union (5/6 values, excluding `dontAsk`; sdk.d.ts:1560). Falls back to
	 * `'default'` when the bag is absent or carries something the schema
	 * validator shouldn't have accepted (defense-in-depth).
	 */
	private _resolvePermissionMode(config: Record<string, unknown> | undefined): ClaudePermissionMode {
		return narrowClaudePermissionMode(config?.[ClaudeSessionConfigKey.PermissionMode]) ?? 'default';
	}

	disposeSession(session: URI): Promise<void> {
		// Routed through {@link _disposeSequencer} so a concurrent
		// {@link shutdown} already serializing teardown for this same
		// session id awaits this work first (and vice versa). Phase 6
		// adds a provisional branch: when the session has not yet been
		// materialized, abort the controller (unblocks any racing
		// `await sdk.startup()`) and drop the record. No SDK contact,
		// no DB write — symmetric with `createSession`.
		const sessionId = AgentSession.id(session);
		return this._disposeSequencer.queue(sessionId, async () => {
			const sess = this._findAnySession(sessionId);
			if (sess && !sess.isPipelineReady) {
				sess.abortController.abort();
			}
			this._sessions.deleteAndDispose(sessionId);
			await this._disposeChildChats(sessionId);
			this._pruneActiveClientHandles(sessionId);
		});
	}

	// #region Multi-chat — additional (non-default) peer chats

	/**
	 * Create an additional peer chat within an existing session. The new chat
	 * is backed by its own SDK conversation (a fresh one, or a fork of the
	 * source chat at a turn) that shares the parent session's working directory
	 * and inherited model / agent / permission-mode scope. The conversation is
	 * recorded in the persisted catalog and the chat's metadata overlay; the
	 * live {@link ClaudeAgentSession} is built lazily on the chat's first send
	 * (mirroring how default sessions materialize lazily).
	 */
	async createChat(session: URI, chat: URI, options?: IAgentCreateChatOptions): Promise<void> {
		this._ensureAuthenticated();
		if (isDefaultChatUri(chat)) {
			return;
		}
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`[Claude] createChat: malformed chat URI ${chat.toString()}`);
		}
		const parentSessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(parentSessionId, async () => {
			const persisted = await this._readPersistedChats(session);
			if (persisted.has(parsed.chatId)) {
				return;
			}
			const scope = await this._resolveParentScope(session, parentSessionId);
			const model = options?.model ?? scope.model;

			let sdkSessionId: string | undefined;
			if (options?.fork) {
				// If the fork point can't be resolved, fall through to a fresh
				// conversation rather than inheriting the whole source backend.
				sdkSessionId = await this._forkChatConversation(session, options.fork);
			}
			sdkSessionId ??= generateUuid();

			persisted.set(parsed.chatId, { sdkSessionId, ...(model ? { model } : {}) });
			await this._writePersistedChats(session, persisted);

			// Seed the chat's own metadata overlay so a later lazy resume (this
			// process or a restart) inherits the parent's scope.
			await this._metadataStore.write(chat, {
				...(model ? { model } : {}),
				...(scope.agent ? { agent: scope.agent } : {}),
				...(scope.permissionMode ? { permissionMode: scope.permissionMode } : {}),
			});
			this._logService.info(`[Claude] Created additional chat ${chat.toString()} in session ${session.toString()}${options?.fork ? ' (forked)' : ''}`);
		});
	}

	/**
	 * Dispose an additional peer chat, tearing down its live conversation (if
	 * any) and removing it from the persisted catalog. The default chat cannot
	 * be disposed in isolation — it lives and dies with the session.
	 *
	 * Routed through {@link _sessionSequencer} (keyed on the chat URI) so it
	 * waits for any in-flight {@link _materializeChatLocked} or
	 * {@link sendMessage} to finish before tearing down — prevents
	 * use-after-dispose if a send is concurrently in progress.
	 */
	async disposeChat(session: URI, chat: URI): Promise<void> {
		if (isDefaultChatUri(chat)) {
			return;
		}
		const chatKey = chat.toString();
		await this._sessionSequencer.queue(chatKey, async () => {
			const entry = this._chatSessions.get(chatKey);
			if (entry) {
				if (!entry.session.isPipelineReady) {
					entry.session.abortController.abort();
				} else {
					entry.session.abort();
				}
			}
			this._chatSessions.deleteAndDispose(chatKey);
			const parsed = parseChatUri(chat);
			if (parsed) {
				// Serialize the catalog read-modify-write on the parent session
				// id so it can't lose updates against a concurrent createChat
				// (which mutates the same per-session catalog blob).
				await this._sessionSequencer.queue(AgentSession.id(session), async () => {
					const persisted = await this._readPersistedChats(session);
					if (persisted.delete(parsed.chatId)) {
						await this._writePersistedChats(session, persisted);
					}
				});
			}
		});
		// The Claude SDK exposes no delete-conversation RPC, so the forked /
		// fresh transcript is left on disk; without a catalog entry it is never
		// resumed again.
	}

	/**
	 * Returns the persisted catalog of additional peer chats for a session as
	 * `ahp-chat` channel URIs, so the agent service can re-register them (and
	 * seed their history) when a session is restored after a process restart.
	 */
	async getChats(session: URI): Promise<readonly URI[]> {
		const persisted = await this._readPersistedChats(session);
		const result: URI[] = [];
		for (const chatId of persisted.keys()) {
			result.push(URI.parse(buildChatUri(session.toString(), chatId)));
		}
		return result;
	}

	/**
	 * Resolve the inherited scope (working directory, project, model, agent,
	 * permission mode) a new or resumed peer chat copies from its parent
	 * session. Prefers the live in-memory parent; falls back to the SDK's
	 * on-disk session record + metadata overlay for an unloaded parent.
	 */
	private async _resolveParentScope(session: URI, parentSessionId: string): Promise<{ workingDirectory: URI; project: IAgentSessionProjectInfo | undefined; model: ModelSelection | undefined; agent: AgentSelection | undefined; permissionMode: ClaudePermissionMode }> {
		const parent = this._findAnySession(parentSessionId);
		let workingDirectory = parent?.workingDirectory;
		let project = parent?.project;
		if (!workingDirectory) {
			const sdkInfo = await this._sdkService.getSessionInfo(parentSessionId);
			workingDirectory = sdkInfo?.cwd ? URI.file(sdkInfo.cwd) : undefined;
		}
		if (!workingDirectory) {
			throw new Error(`[Claude] createChat: cannot resolve working directory for parent session ${session.toString()}`);
		}
		if (!project) {
			try {
				project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			} catch (err) {
				this._logService.warn(`[Claude] createChat: project resolution failed for ${session.toString()}; continuing without project`, err);
			}
		}
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(session);
		} catch (err) {
			this._logService.warn(`[Claude] createChat: parent overlay read failed for ${session.toString()}; continuing with defaults`, err);
		}
		const permissionMode = readClaudePermissionMode(this._configurationService, session) ?? overlay.permissionMode ?? 'default';
		return { workingDirectory, project, model: overlay.model, agent: overlay.agent, permissionMode };
	}

	/**
	 * Fork the source chat's SDK conversation at the requested turn into a new
	 * conversation and return its SDK session id. Returns `undefined` (so the
	 * caller creates a fresh chat instead) when the source conversation or the
	 * fork anchor cannot be resolved.
	 */
	private async _forkChatConversation(session: URI, fork: IAgentCreateChatOptions['fork'] & {}): Promise<string | undefined> {
		const sourceSdkId = await this._resolveChatSdkId(session, fork.source);
		if (!sourceSdkId) {
			this._logService.warn(`[Claude] createChat fork: source ${fork.source.toString()} has no SDK conversation; creating fresh chat`);
			return undefined;
		}
		const messages = await this._sdkService.getSessionMessages(sourceSdkId, { includeSystemMessages: true });
		const upToMessageId = resolveForkAnchorUuid(messages, fork.turnId);
		if (upToMessageId === undefined) {
			this._logService.warn(`[Claude] createChat fork: turn ${fork.turnId} not found in source ${sourceSdkId}; creating fresh chat`);
			return undefined;
		}
		const { sessionId } = await this._sdkService.forkSession(sourceSdkId, { upToMessageId });
		return sessionId;
	}

	/**
	 * Resolve the SDK conversation id backing a chat URI — the session's
	 * default chat (the parent session's own id) or an additional peer chat
	 * (from the in-memory entry, else the persisted catalog).
	 */
	private async _resolveChatSdkId(session: URI, chatUri: URI): Promise<string | undefined> {
		if (isDefaultChatUri(chatUri) || chatUri.toString() === session.toString()) {
			return AgentSession.id(session);
		}
		const inMemory = this._chatSessions.get(chatUri.toString())?.session.sessionId;
		if (inMemory) {
			return inMemory;
		}
		const parsed = parseChatUri(chatUri);
		if (!parsed) {
			return undefined;
		}
		const persisted = await this._readPersistedChats(session);
		return persisted.get(parsed.chatId)?.sdkSessionId;
	}

	/**
	 * Build + materialize the peer chat's live {@link ClaudeAgentSession},
	 * resuming its persisted SDK conversation when one already exists on disk
	 * (forked or restored chats) or starting fresh otherwise. The caller MUST
	 * hold the per-chat (`chat.toString()`) {@link _sessionSequencer} lock so
	 * concurrent first sends collapse into one materialize and teardown can't
	 * race the build.
	 */
	private async _materializeChatLocked(session: URI, chat: URI): Promise<ClaudeAgentSession> {
		const chatKey = chat.toString();
		const existing = this._chatSessions.get(chatKey)?.session;
		if (existing?.isPipelineReady) {
			return existing;
		}
		const chatSession = existing ?? await this._buildProvisionalChat(session, chat);
		// Resume when the SDK already has a transcript for this conversation
		// (forked or restored); otherwise materialize a fresh one.
		const sdkInfo = await this._sdkService.getSessionInfo(chatSession.sessionId);
		const transport = this._ensureAuthenticated();
		const canUseTool = this._makeCanUseTool(chatSession.sessionId);
		try {
			await chatSession.materialize({ transport, canUseTool, isResume: !!sdkInfo, serverToolHost: this._serverToolHost });
		} catch (err) {
			this._chatSessions.deleteAndDispose(chatKey);
			throw err;
		}
		return chatSession;
	}

	/**
	 * Build a provisional {@link ClaudeAgentSession} for a peer chat from its
	 * persisted catalog entry + overlay, bound to the chat URI as its identity
	 * and the persisted SDK conversation id. Registers it in
	 * {@link _chatSessions}; the caller materializes it.
	 */
	private async _buildProvisionalChat(session: URI, chat: URI): Promise<ClaudeAgentSession> {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`[Claude] malformed chat URI ${chat.toString()}`);
		}
		const persisted = await this._readPersistedChats(session);
		const info = persisted.get(parsed.chatId);
		if (!info) {
			throw new Error(`[Claude] no persisted conversation for chat ${chat.toString()}`);
		}
		const scope = await this._resolveParentScope(session, AgentSession.id(session));
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(chat);
		} catch (err) {
			this._logService.warn(`[Claude] chat overlay read failed for ${chat.toString()}; continuing with defaults`, err);
		}
		const permissionMode = readClaudePermissionMode(this._configurationService, chat) ?? overlay.permissionMode ?? scope.permissionMode;
		// Overlay takes precedence over the catalog: `changeModel` always writes
		// the overlay first (via `setModel` or `_metadataStore.write`) and then
		// the catalog. If the catalog write fails (transient I/O), the overlay
		// already holds the newest model; preferring it here ensures a model
		// change is never silently reverted after a restart.
		const model = overlay.model ?? info.model;
		const chatSession = ClaudeAgentSession.createProvisional(
			info.sdkSessionId,
			chat,
			scope.workingDirectory,
			scope.project,
			model,
			overlay.agent ?? scope.agent,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._metadataStore,
			this._instantiationService,
		);
		this._registerChatEntry(chat, chatSession);
		return chatSession;
	}

	/** Registers a peer chat's {@link ClaudeAgentSession} and forwards its events. */
	private _registerChatEntry(chat: URI, chatSession: ClaudeAgentSession): void {
		const entry = new ClaudeSessionEntry(chatSession);
		entry.addDisposable(chatSession.onDidSessionProgress(signal => this._onDidSessionProgress.fire(signal)));
		entry.addDisposable(chatSession.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
		this._chatSessions.set(chat.toString(), entry);
	}

	/** Reconstruct a peer chat's turn history from its SDK transcript. */
	private async _getChatMessages(chat: URI, chatInfo: { session: string; chatId: string }): Promise<readonly Turn[]> {
		const sessionUri = URI.parse(chatInfo.session);
		let sdkId = this._chatSessions.get(chat.toString())?.session.sessionId;
		if (!sdkId) {
			const persisted = await this._readPersistedChats(sessionUri);
			sdkId = persisted.get(chatInfo.chatId)?.sdkSessionId;
		}
		if (!sdkId) {
			return [];
		}
		let messages;
		try {
			messages = await this._sdkService.getSessionMessages(sdkId, { includeSystemMessages: true });
		} catch (err) {
			this._logService.warn(`[Claude] getSessionMessages SDK fetch failed for chat ${chat.toString()}`, err);
			return [];
		}
		try {
			return mapSessionMessagesToTurns(messages, chat, this._logService);
		} catch (err) {
			this._logService.warn(`[Claude] replay mapper threw for chat ${chat.toString()}`, err);
			return [];
		}
	}

	/** Update a peer chat's persisted model so a later resume picks it up. */
	private async _updateChatCatalogModel(session: URI, chat: URI, model: ModelSelection): Promise<void> {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			return;
		}
		// Serialize the catalog read-modify-write on the parent session id so it
		// can't lose updates against a concurrent createChat/disposeChat (which
		// mutate the same per-session catalog blob under the same key).
		await this._sessionSequencer.queue(AgentSession.id(session), async () => {
			const persisted = await this._readPersistedChats(session);
			const info = persisted.get(parsed.chatId);
			if (!info) {
				return;
			}
			persisted.set(parsed.chatId, { ...info, model });
			await this._writePersistedChats(session, persisted);
		});
	}

	/**
	 * Dispose every in-memory peer chat whose owning session matches
	 * `parentSessionId`. The chat URI encodes its parent session, so we recover
	 * it via {@link parseChatUri}. Each teardown serializes on the chat's own
	 * {@link _sessionSequencer} key so it waits for any in-flight
	 * materialize/send (which holds the same key) rather than disposing the
	 * session under it and letting a late {@link _registerChatEntry} resurrect
	 * a zombie entry whose parent is already gone.
	 */
	private async _disposeChildChats(parentSessionId: string): Promise<void> {
		const childKeys = [...this._chatSessions.keys()].filter(chatKey => {
			const parsed = parseChatUri(URI.parse(chatKey));
			return !!parsed && AgentSession.id(parsed.session) === parentSessionId;
		});
		await Promise.all(childKeys.map(chatKey =>
			this._sessionSequencer.queue(chatKey, async () => {
				const entry = this._chatSessions.get(chatKey);
				if (entry) {
					if (!entry.session.isPipelineReady) {
						entry.session.abortController.abort();
					} else {
						entry.session.abort();
					}
				}
				this._chatSessions.deleteAndDispose(chatKey);
			})
		));
	}

	/** Reads the persisted peer-chat catalog for a session, keyed by chatId. */
	private async _readPersistedChats(session: URI): Promise<Map<string, IPersistedChat>> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return new Map();
		}
		try {
			const raw = await ref.object.getMetadata(ClaudeAgent._META_CHATS);
			if (!raw) {
				return new Map();
			}
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			const result = new Map<string, IPersistedChat>();
			for (const [chatId, value] of Object.entries(parsed)) {
				if (!value || typeof value !== 'object') {
					continue;
				}
				const { sdkSessionId, model } = value as { sdkSessionId?: unknown; model?: unknown };
				if (typeof sdkSessionId !== 'string' || !sdkSessionId) {
					continue;
				}
				// The metadata blob is client-influenced and may be corrupted or
				// shape-shifted by a future serialization change: only accept a
				// `model` that actually looks like a `ModelSelection`.
				const validModel = model && typeof model === 'object' && typeof (model as { id?: unknown }).id === 'string'
					? model as ModelSelection
					: undefined;
				result.set(chatId, { sdkSessionId, ...(validModel ? { model: validModel } : {}) });
			}
			return result;
		} catch (err) {
			this._logService.warn(`[Claude] Failed to read persisted chats for ${session.toString()}`, err);
			return new Map();
		} finally {
			ref.dispose();
		}
	}

	/** Writes the persisted peer-chat catalog for a session. */
	private async _writePersistedChats(session: URI, chats: Map<string, IPersistedChat>): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		try {
			// Null-prototype object: chatIds derive from a client-chosen chat URI
			// authority, so a value like `__proto__` must not pollute the prototype.
			const obj: Record<string, IPersistedChat> = Object.create(null);
			for (const [chatId, info] of chats) {
				obj[chatId] = info;
			}
			await dbRef.object.setMetadata(ClaudeAgent._META_CHATS, JSON.stringify(obj));
		} finally {
			dbRef.dispose();
		}
	}

	// #endregion

	/**
	 * Test-only accessor for the materialized {@link ClaudeAgentSession}.
	 * Phase 6 section 5.1 Test 10 needs to inspect `_isResumed` directly because
	 * Phase 6 has no teardown+recreate flow yet to observe its effect
	 * (the flag drives `Options.resume = sessionId` in Phase 7+). Marked
	 * `ForTesting` so the production surface stays unaware of its
	 * existence; the protocol surface (`IAgent`) does not include it.
	 */
	getSessionForTesting(session: URI): ClaudeAgentSession | undefined {
		const sess = this._sessions.get(AgentSession.id(session))?.session;
		return sess?.isPipelineReady ? sess : undefined;
	}

	/**
	 * Phase 13 — reconstruct the full turn history from the SDK's on-disk
	 * JSONL transcript. Out-of-process: no live `Query` required. Subagent
	 * URIs (`<parent>/subagent/<toolCallId>`) throw `TODO: Phase 12` until
	 * Phase 12 wires `getSubagentMessages`. Provisional sessions return `[]`.
	 * Resilient: any failure (transcript fetch, mapping, backfill) warn-logs
	 * and returns `[]` rather than propagating — mirrors `listSessions`.
	 */
	async getSessionMessages(session: URI): Promise<readonly Turn[]> {
		// On restore, the agent service calls this with a peer-chat URI to seed
		// the additional chat's history from its own SDK conversation.
		const chatInfo = parseChatUri(session);
		if (chatInfo && !isDefaultChatUri(session)) {
			return this._getChatMessages(session, chatInfo);
		}
		const sessionId = AgentSession.id(session);
		const sess = this._findAnySession(sessionId);
		if (sess && !sess.isPipelineReady) {
			return [];
		}
		if (isSubagentSession(session)) {
			const parsed = parseSubagentSessionUri(session);
			const parentSession = parsed ? this._sessions.get(AgentSession.id(parsed.parentSession))?.session : undefined;
			if (!parentSession) {
				// Parent session is gone (disposed or never materialized).
				// The registry that holds the agentId cache lives on the
				// parent session, so we cannot resolve the subagent.
				this._logService.warn(`[Claude] getSessionMessages: parent session not found for subagent ${session.toString()} (registry unavailable)`);
				return [];
			}
			try {
				return await getSubagentTranscript(session, parentSession.subagents, this._sdkService, this._logService, CancellationToken.None);
			} catch (err) {
				this._logService.warn(`[Claude] getSubagentTranscript threw for ${session.toString()}`, err);
				return [];
			}
		}
		const parentSession = this._sessions.get(sessionId)?.session;
		let messages;
		try {
			messages = await this._sdkService.getSessionMessages(sessionId, { includeSystemMessages: true });
		} catch (err) {
			this._logService.warn(`[Claude] getSessionMessages SDK fetch failed for ${sessionId}`, err);
			return [];
		}
		let turns: readonly Turn[];
		try {
			turns = mapSessionMessagesToTurns(messages, session, this._logService);
		} catch (err) {
			// Defensive boundary: a single malformed SDK message must not
			// blow up the entire transcript read.
			this._logService.warn(`[Claude] replay mapper threw for ${sessionId}`, err);
			return [];
		}
		// If the parent session is materialized, prime its registry from
		// any agentId suffixes the SDK encoded in Task tool_result text
		// blocks so subsequent subagent transcript reads can short-circuit
		// the strategy chain. A bug in `primeFromTranscript` MUST NOT
		// break an otherwise-successful parent transcript read.
		try {
			parentSession?.subagents.primeFromTranscript(turns);
		} catch (err) {
			this._logService.warn(`[Claude] primeFromTranscript threw for ${sessionId}`, err);
		}
		return turns;
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		// Plan section 3.3.2: SDK is the source of truth; the per-session DB
		// is a pure overlay/cache for Claude-namespaced fields like
		// `customizationDirectory`. We deliberately do NOT filter
		// entries that lack a DB — external Claude Code CLI sessions
		// have no DB and must still surface (Phase-5 exit criterion).
		//
		// Each per-session overlay read is independently try/caught so a
		// single corrupt DB cannot poison the wider listing. CopilotAgent's
		// `Promise.all`-with-throwing-mapper pattern at copilotAgent.ts:519
		// has a latent bug; we follow AgentService.listSessions's resilient
		// pattern (`agentService.ts:188-204`) instead.
		//
		// `AgentService.listSessions` fans out across all providers via
		// `Promise.all` (agentService.ts:202-204). If our SDK dynamic
		// import fails (corrupt install, missing optional dep) and we let
		// it reject, *every* provider's session list disappears — the
		// sibling Copilot provider gets nuked too. Catch and log instead.
		let sdkEntries: readonly SDKSessionInfo[];
		try {
			sdkEntries = await this._sdkService.listSessions();
		} catch (err) {
			this._logService.warn('[Claude] SDK listSessions failed; surfacing empty list', err);
			return [];
		}
		return Promise.all(sdkEntries.map(async entry => {
			try {
				const sessionUri = AgentSession.uri(this.id, entry.sessionId);
				const overlay = await this._metadataStore.read(sessionUri);
				return this._metadataStore.project(entry, overlay);
			} catch (err) {
				this._logService.warn(`[Claude] Overlay read failed for session ${entry.sessionId}`, err);
			}
			// External session, or DB read failed: surface what the SDK gave us.
			return this._metadataStore.project(entry, {});
		}));
	}

	/**
	 * Phase 6.1 / Cycle D4 — per-session lookup. Mirrors
	 * {@link CopilotAgent.getSessionMetadata} but accepts the
	 * external-CLI case: a session that exists on disk via the raw
	 * Anthropic CLI has no per-session DB, so we MUST NOT gate on the
	 * sidecar (the way Copilot's variant does). The SDK is the source
	 * of truth for existence; the overlay merely decorates.
	 *
	 * Failures in the overlay read are swallowed — a corrupt DB on one
	 * session must not lose the SDK-supplied summary/cwd. Failures in
	 * the SDK lookup propagate (the caller is doing a single targeted
	 * fetch and should learn that the SDK module is broken).
	 */
	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		const sessionId = AgentSession.id(session);
		const sdkInfo = await this._sdkService.getSessionInfo(sessionId);
		if (!sdkInfo) {
			return undefined;
		}
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(session);
		} catch (err) {
			this._logService.warn(`[Claude] Overlay read failed for session ${sessionId}`, err);
		}
		return this._metadataStore.project(sdkInfo, overlay);
	}

	resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		// Decision B5 (plan section 3.3.5): Claude collapses the platform's
		// `autoApprove` × `mode` two-axis approval surface onto a single
		// `permissionMode` axis matching the SDK's native enum. The
		// platform `Permissions` key is reused unchanged because the
		// Claude SDK accepts `allowedTools` / `disallowedTools`
		// natively. Skipped: AutoApprove, Mode, Isolation, Branch,
		// BranchNameHint — workbench pickers key off the property names
		// to decide what to render, so omitting these intentionally
		// suppresses the default mode/branch UI for Claude sessions.
		const sessionSchema = createSchema({
			[ClaudeSessionConfigKey.PermissionMode]: schemaProperty<ClaudePermissionMode>({
				type: 'string',
				title: localize('claude.sessionConfig.permissionMode', "Approvals"),
				description: localize('claude.sessionConfig.permissionModeDescription', "How Claude handles tool approvals."),
				enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
				enumLabels: [
					localize('claude.sessionConfig.permissionMode.default', "Ask Before Edits"),
					localize('claude.sessionConfig.permissionMode.acceptEdits', "Edit Automatically"),
					localize('claude.sessionConfig.permissionMode.plan', "Plan Mode"),
					localize('claude.sessionConfig.permissionMode.auto', "Auto Mode"),
					localize('claude.sessionConfig.permissionMode.bypassPermissions', "Bypass Permissions"),
				],
				enumDescriptions: [
					localize('claude.sessionConfig.permissionMode.defaultDescription', "Claude asks before editing files."),
					localize('claude.sessionConfig.permissionMode.acceptEditsDescription', "Claude edits files without asking, and asks before using other tools."),
					localize('claude.sessionConfig.permissionMode.planDescription', "Claude creates a plan before making changes."),
					localize('claude.sessionConfig.permissionMode.autoDescription', "Claude decides whether to ask for each tool operation."),
					localize('claude.sessionConfig.permissionMode.bypassPermissionsDescription', "Claude runs all tools without asking."),
				],
				default: 'default',
				sessionMutable: true,
			}),
			[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
		});

		const values = sessionSchema.validateOrDefault(_params.config, {
			[ClaudeSessionConfigKey.PermissionMode]: 'default' satisfies ClaudePermissionMode,
			// Permissions intentionally omitted from defaults — leave
			// unset so auto-approval falls through to the host-level
			// default, materializing on the session only once the user
			// approves a tool "in this Session".
		});

		return Promise.resolve({
			schema: sessionSchema.toProtocol(),
			values,
		});
	}

	sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		// Plan section 3.3.5: Claude's only schema property is the
		// `permissionMode` static enum, so dynamic completion is
		// definitionally empty in Phase 5. Branch completion lands in
		// Phase 6 once worktree extraction (section 8) is settled.
		return Promise.resolve({ items: [] });
	}

	shutdown(): Promise<void> {
		// Phase 6: drain provisional sessions FIRST so any in-flight
		// `await sdk.startup()` (kicked off by a racing `sendMessage`)
		// observes the abort and unwinds. Each provisional record's
		// AbortController is wired into Options.abortController at
		// materialize time, so aborting here flips the same signal the
		// SDK is racing on.
		//
		// Then drain the materialized sessions through the existing
		// per-session {@link _disposeSequencer} routing — that path
		// inherits Phase 6's real async teardown (`Query.interrupt()`,
		// in-flight metadata writes) once those land.
		//
		// The promise is memoized so concurrent callers share a single
		// drain pass — see `_shutdownPromise` JSDoc.
		// NOTE: declared sync (returns Promise<void>) rather than async
		// so that re-entrant calls return the cached promise *identity*,
		// not a fresh outer-async wrapper around it.
		return this._shutdownPromise ??= (async () => {
			for (const entry of this._sessions.values()) {
				if (!entry.session.isPipelineReady) {
					entry.session.abortController.abort();
				}
			}
			// Provisional peer chats (e.g. a first send whose materialize is
			// in-flight) also race on their own abort controller — abort them
			// up front so a queued `sdk.startup()` unwinds promptly rather than
			// running past shutdown until its `_disposeChildChats` task dequeues.
			for (const entry of this._chatSessions.values()) {
				if (!entry.session.isPipelineReady) {
					entry.session.abortController.abort();
				}
			}

			const sessionIds = [...this._sessions.keys()];
			await Promise.all(sessionIds.map(sessionId =>
				this._disposeSequencer.queue(sessionId, async () => {
					this._sessions.deleteAndDispose(sessionId);
					await this._disposeChildChats(sessionId);
					this._pruneActiveClientHandles(sessionId);
				})
			));
		})();
	}

	async sendMessage(sessionUri: URI, chat: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string, _senderClientId?: string): Promise<void> {
		// `IAgent.sendMessage` declares `turnId?` but every production caller in
		// `AgentSideEffects` supplies one. Generate a fallback so the
		// session-side `QueuedRequest.turnId: string` invariant holds even if a
		// hypothetical caller forgets it.
		const effectiveTurnId = turnId ?? generateUuid();

		// Additional peer chat: route to its own conversation. Its SDK
		// `session_id` is the chat's conversation id, NOT the parent session's.
		// Hold the per-chat lock across BOTH materialize and send (mirroring the
		// default-chat path below) so concurrent sends to the same peer chat
		// serialize and a racing disposeChat/disposeSession (which queue on the
		// same chat key) waits for the in-flight turn instead of disposing the
		// session under it.
		if (!isDefaultChatUri(chat)) {
			const chatKey = chat.toString();
			return this._sessionSequencer.queue(chatKey, async () => {
				const chatSession = await this._materializeChatLocked(sessionUri, chat);
				await chatSession.send(this._buildSdkPrompt(chatSession.sessionId, prompt, attachments, effectiveTurnId), effectiveTurnId);
			});
		}

		// Plan section 3.8. The sequencer scope holds across BOTH materialize
		// and `session.send` so two concurrent first-message calls on the
		// same session collapse into one materialize plus two ordered
		// sends. A `disposeSession` racing a first send reaches its own
		// dispose-sequencer eventually but the in-flight materialize
		// completes first.
		const sessionId = AgentSession.id(sessionUri);
		return this._sessionSequencer.queue(sessionId, async () => {
			const existing = this._findAnySession(sessionId);
			let session: ClaudeAgentSession;
			if (existing?.isPipelineReady) {
				session = existing;
			} else if (existing) {
				session = await this._materializeProvisional(sessionId);
			} else {
				session = await this._resumeSession(sessionId, sessionUri);
			}

			await session.send(this._buildSdkPrompt(sessionId, prompt, attachments, effectiveTurnId), effectiveTurnId);
		});
	}

	/** Builds the SDK user message for a send, addressed to `sdkSessionId`. */
	private _buildSdkPrompt(sdkSessionId: string, prompt: string, attachments: readonly MessageAttachment[] | undefined, turnId: string): SDKUserMessage {
		const contentBlocks = resolvePromptToContentBlocks(prompt, attachments);
		return {
			type: 'user',
			message: { role: 'user', content: contentBlocks },
			session_id: sdkSessionId,
			parent_tool_use_id: null,
			// M1 / Glossary: `Turn.id ↔ SDKUserMessage.uuid`. The SDK types this
			// as a branded `${string}-…` template-literal alias of Node's
			// `crypto.UUID`; cast at the boundary rather than threading the brand
			// up to every caller.
			uuid: turnId as `${string}-${string}-${string}-${string}-${string}`,
		};
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		// `requestId` is the SDK's `tool_use_id` — globally unique, so a
		// single matching session is all we need. Silent on miss
		// (workbench may have raced a session dispose).
		for (const entry of this._sessions.values()) {
			if (entry.session.respondToPermissionRequest(requestId, approved)) {
				return;
			}
		}
		for (const entry of this._chatSessions.values()) {
			if (entry.session.respondToPermissionRequest(requestId, approved)) {
				return;
			}
		}
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void {
		// `requestId` is the SDK's `tool_use_id` (interactive tools
		// reuse it as the {@link ChatInputRequest.id}); globally
		// unique, so a single matching session is all we need. Silent
		// on miss for the same reasons as `respondToPermissionRequest`.
		for (const entry of this._sessions.values()) {
			if (entry.session.respondToUserInputRequest(requestId, response, answers)) {
				return;
			}
		}
		for (const entry of this._chatSessions.values()) {
			if (entry.session.respondToUserInputRequest(requestId, response, answers)) {
				return;
			}
		}
	}

	async abortSession(session: URI, chat?: URI): Promise<void> {
		// Phase 9 D1: cancel via the abort controller, NOT `Query.interrupt()`.
		// Abort is a control-plane operation — it must NOT serialize
		// through `_sessionSequencer` because an in-flight `sendMessage`
		// task is parked on its turn deferred and would deadlock the abort
		// behind the very turn it's trying to cancel. Calling
		// `entry.session.abort()` directly rejects the in-flight deferred,
		// which lets the queued sendMessage task complete and frees the
		// sequencer for the next caller.
		const sess = (chat && !isDefaultChatUri(chat))
			? this._chatSessions.get(chat.toString())?.session
			: this._findAnySession(AgentSession.id(session));
		if (!sess) {
			return;
		}
		if (!sess.isPipelineReady) {
			sess.abortController.abort();
			return;
		}
		sess.abort();
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// Phase 9 D5: queued messages are intentionally a no-op. CONTEXT.md
		// M10 + AgentSideEffects confirm queued messages are consumed
		// server-side; the agent boundary always receives an empty queue.
		//
		// Steering targets the chat that owns the in-flight turn: a peer chat is
		// addressed by its `ahp-chat` channel URI (resolved via _chatSessions),
		// the default chat by the session URI (resolved via _sessions).
		const isPeerChat = !!parseChatUri(session) && !isDefaultChatUri(session);
		const target = isPeerChat
			? this._chatSessions.get(session.toString())?.session
			: this._sessions.get(AgentSession.id(session))?.session;
		this._logService.info(`[Claude] setPendingMessages for ${session.toString()}: steering=${steeringMessage?.id ?? 'none'} queued=${_queuedMessages.length}`);
		if (!target) {
			this._logService.warn(`[Claude] setPendingMessages: ${isPeerChat ? 'chat' : 'session'} not found for ${session.toString()}`);
			return;
		}
		if (steeringMessage) {
			target.injectSteering(steeringMessage);
		}
	}

	async changeModel(session: URI, model: ModelSelection, chat?: URI): Promise<void> {
		// Additional peer chat: apply to its own conversation and persist the
		// model in the catalog (peer chats have no server summary, so their
		// model is tracked here rather than the session metadata overlay).
		if (chat && !isDefaultChatUri(chat)) {
			const chatKey = chat.toString();
			await this._sessionSequencer.queue(chatKey, async () => {
				const chatSession = this._chatSessions.get(chatKey)?.session;
				if (chatSession) {
					await chatSession.setModel(model);
				} else {
					await this._metadataStore.write(chat, { model });
				}
				await this._updateChatCatalogModel(session, chat, model);
			});
			return;
		}
		// Session owns its own provisional/runtime branching and metadata
		// write (see {@link ClaudeAgentSession.setModel}). The agent only
		// covers the "external-only session" case where there is no
		// in-memory record to delegate to.
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			const sess = this._findAnySession(sessionId);
			if (sess) {
				await sess.setModel(model);
			} else {
				await this._metadataStore.write(session, { model });
			}
		});
	}

	/**
	 * Switch (or clear with `undefined`) the selected custom agent for an
	 * existing session. Mirrors {@link changeModel}: session owns its
	 * provisional/runtime branching and metadata write
	 * (see {@link ClaudeAgentSession.setAgent}). For external-only
	 * sessions (no in-memory record), the agent is persisted directly to
	 * the overlay so a later resume picks it up. When `chat` is an additional
	 * peer chat, the change targets that chat's conversation.
	 */
	async changeAgent(session: URI, agent: AgentSelection | undefined, chat?: URI): Promise<void> {
		const target = (chat && !isDefaultChatUri(chat)) ? chat : session;
		const queueKey = (chat && !isDefaultChatUri(chat)) ? chat.toString() : AgentSession.id(session);
		const lookup = (chat && !isDefaultChatUri(chat))
			? () => this._chatSessions.get(chat.toString())?.session
			: () => this._findAnySession(AgentSession.id(session));
		await this._sessionSequencer.queue(queueKey, async () => {
			const sess = lookup();
			if (sess) {
				await sess.setAgent(agent);
			} else {
				await this._metadataStore.write(target, { agent: agent ?? null });
			}
		});
	}

	setServerToolHost(host: IAgentServerToolHost): void {
		this._serverToolHost = host;
	}

	getOrCreateActiveClient(session: URI, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		const sessionId = AgentSession.id(session);
		const key = `${sessionId}\u0000${client.clientId}`;
		let handle = this._activeClientHandles.get(key);
		if (!handle) {
			handle = new ClaudeActiveClientHandle(
				client.clientId,
				client.displayName,
				() => this._findAnySession(sessionId)?.getClientTools(client.clientId) ?? [],
				tools => {
					this._logService.info(`[Claude:${sessionId}] active client ${client.clientId} tools=[${tools.map(t => t.name).join(', ') || '(none)'}]`);
					this._findAnySession(sessionId)?.setClientTools(client.clientId, tools);
				},
				customizations => { void this.syncClientCustomizations(session, client.clientId, [...customizations]); },
			);
			this._activeClientHandles.set(key, handle);
		}
		return handle;
	}

	removeActiveClient(session: URI, clientId: string): void {
		const sessionId = AgentSession.id(session);
		this._activeClientHandles.delete(`${sessionId}\u0000${clientId}`);
		// Tools are written synchronously, so remove them immediately. The
		// customization sync runs inside the session sequencer, so serialize
		// its removal there too — otherwise a late in-flight sync could
		// resurrect the removed client's customizations after it has left.
		this._findAnySession(sessionId)?.removeClientTools(clientId);
		void this._sessionSequencer.queue(sessionId, async () => {
			this._findAnySession(sessionId)?.removeClientCustomizations(clientId);
		}).catch(() => { /* session torn down */ });
	}

	/** Drop cached active-client handles belonging to a session being torn down. */
	private _pruneActiveClientHandles(sessionId: string): void {
		const prefix = `${sessionId}\u0000`;
		for (const key of [...this._activeClientHandles.keys()]) {
			if (key.startsWith(prefix)) {
				this._activeClientHandles.delete(key);
			}
		}
	}

	onClientToolCallComplete(session: URI, _chat: URI, toolCallId: string, result: ToolCallResult): void {
		let target = session;
		let parsed;
		while ((parsed = parseSubagentSessionUri(target))) {
			target = parsed.parentSession;
		}
		const sessionId = AgentSession.id(target);
		const entry = this._sessions.get(sessionId);
		// `AgentSideEffects` forwards every `ChatToolCallComplete` envelope
		// (including SDK-owned tools); silent on miss is the expected path.
		entry?.session.completeClientToolCall(toolCallId, result);
	}

	async syncClientCustomizations(session: URI, clientId: string, customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
		const sessionId = AgentSession.id(session);
		const sess = this._findAnySession(sessionId);
		if (!sess) {
			this._logService.warn(`[Claude:${sessionId}] syncClientCustomizations: session not found`);
			return [];
		}
		// Run inside the session sequencer so that a fire-and-forget
		// customization sync cannot race ahead of a first `sendMessage`: if
		// `sendMessage` is already queued, the sync runs first or queues
		// behind it; either way the materialize call reads the most recently
		// adopted plugin set, never an empty one mid-sync.
		return this._sessionSequencer.queue(sessionId, async () => {
			const synced = await this._pluginManager.syncCustomizations(
				clientId,
				customizations,
				status => this._fireCustomizationUpdated(session, { customization: status }),
			);
			sess.adoptClientCustomizations(clientId, synced);
			return synced;
		});
	}

	/**
	 * Project a per-item sync result onto a `SessionCustomizationUpdated`
	 * action and emit it on {@link onDidSessionProgress}. Lets the workbench
	 * flip each row to `Loaded` / `Error` as the underlying
	 * {@link IAgentPluginManager.syncCustomizations} resolves it.
	 */
	private _fireCustomizationUpdated(session: URI, item: ISyncedCustomization): void {
		this._onDidSessionProgress.fire({
			kind: 'action',
			resource: session,
			action: {
				type: ActionType.SessionCustomizationUpdated,
				customization: item.customization,
			},
		});
	}

	setCustomizationEnabled(id: string, enabled: boolean): void {
		for (const entry of this._sessions.values()) {
			entry.session.setClientCustomizationEnabled(id, enabled);
		}
	}

	getCustomizations(): readonly Customization[] {
		// Provider-level customization catalogue — feeds `AgentInfo.customizations`
		// on `RootAgentsChanged`. Should advertise host-configured plugin refs
		// (the equivalent of Copilot's `agentHost.customizations` setting).
		// Claude has no such surface today; returning `[]` is correct rather
		// than aggregating client-pushed refs (those live on
		// `activeClient.customizations` per session).
		//
		// TODO: when host-level customizations become a real concept for the
		// agent host, lift `PluginController` out of `copilot/copilotAgent.ts`
		// into a shared service so both providers consume the same configured
		// host customization list rather than each maintaining their own.
		return [];
	}

	async getSessionCustomizations(session: URI): Promise<readonly Customization[]> {
		const sess = this._findAnySession(AgentSession.id(session));
		return sess ? await sess.getSessionCustomizations() : [];
	}

	// #endregion

	override dispose(): void {
		// Phase 6+ INVARIANT: SDK Query subprocesses (owned by individual
		// ClaudeAgentSession wrappers) MUST die BEFORE the proxy handle
		// is disposed. After proxy disposal the proxy may rebind on a
		// different port and a still-running subprocess would silently
		// lose its endpoint. See `IClaudeProxyHandle` doc in
		// `claudeProxyService.ts`.
		//
		// Step 1: abort every provisional AbortController. These are
		// the same controllers wired into `Options.abortController` at
		// materialize time (sdk.d.ts:982), so any in-flight
		// `await sdk.startup()` will reject and any sequencer-queued
		// `_materializeProvisional` continuation will trip its
		// post-startup or post-customization-write abort gates,
		// disposing the WarmQuery without ever reaching
		// `_sessions.set(...)`. Without this step, dispose during a
		// concurrent first `sendMessage` could orphan a WarmQuery
		// subprocess. (Copilot reviewer: dispose lifecycle.)
		//
		// Step 2: `super.dispose()` synchronously disposes the
		// `_sessions` DisposableMap, firing each session wrapper's
		// `dispose()` (which interrupts/asyncDisposes its WarmQuery).
		//
		// Step 3: only then release the proxy handle, preserving the
		// wrapper-before-proxy ordering invariant. This is locked by
		// test "dispose disposes the proxy handle and is idempotent".
		for (const entry of this._sessions.values()) {
			if (!entry.session.isPipelineReady) {
				entry.session.abortController.abort();
			}
		}
		super.dispose();
		this._proxyHandle?.dispose();
		this._proxyHandle = undefined;
		this._githubToken = undefined;
		this._models.set([], undefined);
	}
}

/**
 * Bundle of a {@link ClaudeAgentSession} and any per-session disposables
 * registered against it (e.g. the agent's forward subscription to the
 * session's `onDidSessionProgress` event). One entry per materialized
 * session in {@link ClaudeAgent._sessions}; disposing the entry disposes
 * the session AND every extra registered via {@link addDisposable}.
 *
 * Lets new per-session lifecycle bindings (future config listeners,
 * abort wirings, etc.) attach to the session's lifetime without growing
 * a new parallel `DisposableMap` on the agent.
 */
class ClaudeSessionEntry extends Disposable {
	readonly session: ClaudeAgentSession;

	constructor(session: ClaudeAgentSession) {
		super();
		this.session = this._register(session);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
