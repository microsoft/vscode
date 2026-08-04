/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { ModelInfo, OnElicitation, Options, SDKSessionInfo, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SequencerByKey } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSessionEntry, buildSideChatSourceContext, decodeProviderData, encodeProviderData, prepareSideChatPrompt, stripSideChatContext, type IPersistedChat } from '../agentPeerChats.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { AgentHostClaudeMultiRootEnabledConfigKey, createSchema, platformRootSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel } from '../../common/claudeModelConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, CLAUDE_AGENT_PROVIDER_ID, IActiveClient, IAgent, IAgentChatDataChange, IAgentChats, IAgentCreateChatForkSource, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo, IAgentSpawnChatEvent, SubagentChatSignal } from '../../common/agentService.js';
import { ensureWorkspacelessScratchDir } from '../workspacelessScratchDir.js';
import { ActionType, AuthRequiredReason, type AuthRequiredParams } from '../../common/state/sessionActions.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { PolicyState, ProtectedResourceMetadata, type AgentSelection, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { isSubagentSession, parseSubagentSessionUri, buildDefaultChatUri, parseChatUri, parseRequiredSessionUriFromChatUri, isDefaultChatUri, ChatInputResponseKind, type ChatState, type ClientPluginCustomization, type Customization, type MessageAttachment, type PendingMessage, type ChatInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { projectFromCopilotContext } from '../copilot/copilotGitProject.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { buildModelEnumerationOptions } from './claudeSdkOptions.js';
import { detectExistingClaudeSetup, resolveClaudeTransportMode, type ClaudeTransportMode } from './claudeTransportMode.js';
import { mergeClaudeModelCatalogs, resolveClaudeSessionTransport } from './claudeModelSelection.js';
import { mapSessionMessagesToTurns, resolveForkAnchorUuid } from './claudeReplayMapper.js';
import { getSubagentTranscript } from './claudeSubagentResolver.js';
import { SubagentRegistry } from './claudeSubagentRegistry.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { handleCanUseTool } from './claudeCanUseTool.js';
import { handleElicitation } from './claudeElicitationBridge.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { createPricingMetaFromBilling, normalizeCAPIBilling } from '../../common/agentModelPricing.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import { IClaudeProxyHandle, IClaudeProxyService, type ClaudeTransport } from './claudeProxyService.js';
import { readClaudePermissionMode } from './claudeSessionPermissionMode.js';
import { ClaudeSessionMetadataStore, IClaudeSessionOverlay } from './claudeSessionMetadataStore.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';

const USER_AGENT_PREFIX = 'vscode_claude_code';

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
	const billing = normalizeCAPIBilling(m.billing);
	// priceCategory may appear as a top-level model field depending on the CAPI version.
	const priceCategory = typeof m.model_picker_price_category === 'string'
		? m.model_picker_price_category
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

	private readonly _onDidRequireAuth = this._register(new Emitter<Omit<AuthRequiredParams, 'channel'>>());
	readonly onDidRequireAuth = this._onDidRequireAuth.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;
	/**
	 * In-flight {@link refreshModels} call, so overlapping triggers (an auth
	 * token change, a transport flip, or a periodic tick from the host's
	 * model-refresh scheduler) collapse into a single enumeration instead of
	 * racing each other's writes to {@link _models}.
	 */
	private _modelRefreshInFlight: Promise<void> | undefined;

	private _githubToken: string | undefined;
	private _proxyHandle: IClaudeProxyHandle | undefined;
	private _serverToolHost: IAgentServerToolHost | undefined;

	/**
	 * Resolved host transport mode (Phase 19). `proxy` (default) routes through
	 * the Copilot-CAPI proxy; `native` talks to Anthropic directly on the user's
	 * own credentials. Resolved from the precedence in {@link resolveClaudeTransportMode}
	 * (explicit `claudeUseCopilotProxy` override; else the experimentation flag,
	 * GitHub sign-in state, and any existing local Claude setup) and kept current
	 * by config-change and sign-in triggers. Config/auth changes affect FUTURE
	 * sessions only — never an in-flight subprocess.
	 */
	private _transportMode: ClaudeTransportMode = 'proxy';

	/**
	 * Cached value of the forwarded per-session provider experimentation flag
	 * ({@link AgentHostConfigKey.ClaudePerSessionProvider}). Held as a field —
	 * rather than read live on every use — so {@link _applyPerSessionProviderChange}
	 * can detect a false→true transition (the flag is typically *hydrated after
	 * construction* by its config forwarder) and trigger the initial merged-catalog
	 * enumeration; without that, a signed-out flag-on window would never populate
	 * its picker. Kept current by the `onDidRootConfigChange` subscription.
	 */
	private _perSessionProviderEnabled: boolean = false;

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
	 * Live, in-memory peer-chat backings keyed by the chat's `ahp-chat` channel
	 * URI string. Populated by {@link createChat} on creation and by
	 * {@link materializeChat} on session restore (decoding the opaque
	 * `providerData` the orchestrator persisted). This is the live source of the
	 * `chatUri → sdkSessionId` mapping.
	 */
	private readonly _chatBackings = new Map<string, IPersistedChat>();

	/**
	 * Fires when a peer chat's opaque `providerData` blob changes after creation
	 * (e.g. a per-chat model switch) so the orchestrator can re-persist the
	 * refreshed token. See {@link IAgent.onDidChangeChatData}.
	 */
	private readonly _onDidChangeChatData = this._register(new Emitter<IAgentChatDataChange>());
	readonly onDidChangeChatData: Event<IAgentChatDataChange> = this._onDidChangeChatData.event;

	/**
	 * Membership channel for chats the agent spawns itself — today the
	 * sub-agent chats delegated by a `Task`/`Agent` tool call (and, when the
	 * harness gains them, Claude Teams teammates). Derived from the
	 * `subagent_started` / `subagent_completed` signals that already flow on
	 * {@link onDidSessionProgress}, so the orchestrator records the spawn edge
	 * on the unified chat catalog. See {@link IAgent.onDidSpawnChat}.
	 */
	private readonly _onDidSpawnChat = this._register(new Emitter<IAgentSpawnChatEvent>());
	readonly onDidSpawnChat: Event<IAgentSpawnChatEvent> = this._onDidSpawnChat.event;

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
	 * Unified per-session lookup. Returns the session's default chat whether it
	 * is still provisional or already materialized; callers branch on
	 * {@link ClaudeAgentSession.isPipelineReady} when behavior differs.
	 */
	private _findAnySession(sessionId: string): ClaudeAgentSession | undefined {
		return this._sessions.get(sessionId)?.defaultChat;
	}

	/**
	 * Resolve the live {@link ClaudeAgentSession} for a chat — the session's
	 * default (main) chat, or an additional peer chat addressed by its
	 * `ahp-chat` channel URI — via a single uniform lookup in the owning
	 * session's chat map. Returns `undefined` when the session (or the chat) is
	 * not in memory.
	 */
	private _findChat(session: URI, chat: URI | undefined): ClaudeAgentSession | undefined {
		const entry = this._sessions.get(AgentSession.id(session));
		if (!entry) {
			return undefined;
		}
		return entry.getChat((chat ?? URI.parse(buildDefaultChatUri(session))).toString());
	}

	private _getChatContext(chatOrSession: URI): { session: URI; sessionId: string; chatKey: string; target: ClaudeAgentSession | undefined; isPeerChat: boolean } {
		// Accept either a chat channel URI or a bare session URI: per the AHP
		// convention the default chat's URI equals the session URI, so callers
		// that address the default chat by the session URI resolve here in one
		// place rather than each operational method re-deriving it.
		const chat = parseChatUri(chatOrSession) ? chatOrSession : URI.parse(buildDefaultChatUri(chatOrSession));
		const session = URI.parse(parseRequiredSessionUriFromChatUri(chat));
		const sessionId = AgentSession.id(session);
		const chatKey = chat.toString();
		const resolved = this._sessions.get(sessionId)?.resolveChat(chatKey);
		return {
			session,
			sessionId,
			chatKey,
			target: resolved?.chatSession,
			isPeerChat: resolved ? !resolved.isDefault : chatKey !== buildDefaultChatUri(session),
		};
	}

	/**
	 * Resolve a live {@link ClaudeAgentSession} by its SDK chat id,
	 * searching every session entry's default chat and its peer chats. Used by
	 * SDK-id-addressed callbacks — proxy credit reports and the `canUseTool`
	 * permission bridge — which carry the SDK session id, not the chat URI.
	 */
	private _findSessionBySdkId(sdkSessionId: string): ClaudeAgentSession | undefined {
		for (const entry of this._sessions.values()) {
			for (const chat of entry.allChatSessions()) {
				if (chat.sessionId === sdkSessionId) {
					return chat;
				}
			}
		}
		return undefined;
	}

	/** Wrap a {@link ClaudeAgentSession} in a chat-leaf entry and forward its events. */
	private _wireEntry(session: ClaudeAgentSession): ClaudeSessionEntry {
		const entry = new ClaudeSessionEntry(session);
		entry.addDisposable(session.onDidSessionProgress(signal => {
			this._onDidSessionProgress.fire(signal);
			this._emitSpawnedChatEvents(signal);
		}));
		entry.addDisposable(session.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
		return entry;
	}

	/**
	 * Create a session container seeding its default (main) chat as the first
	 * entry in the uniform chat map, keyed by the session's default-chat URI.
	 */
	private _seedSessionEntry(sessionId: string, session: URI, mainSession: ClaudeAgentSession): ClaudeSessionEntry {
		const container = new ClaudeSessionEntry();
		container.setDefaultChat(buildDefaultChatUri(session), this._wireEntry(mainSession));
		this._sessions.set(sessionId, container);
		return container;
	}

	/**
	 * Bridges the agent's `subagent_started` signal onto the
	 * {@link onDidSpawnChat} membership channel. The signals are still forwarded
	 * verbatim on {@link onDidSessionProgress} (the orchestrator's
	 * `AgentSideEffects` keeps driving the sub-agent turn + parent tool-call
	 * content); this event only mirrors the spawn into the unified chat catalog.
	 * A completed subagent chat stays live and subscribable (it is removed only
	 * on session teardown), so there is no corresponding end event. The catalog
	 * add is idempotent so the overlap with the orchestrator's own membership
	 * sequencing is safe.
	 */
	private _emitSpawnedChatEvents(signal: AgentSignal): void {
		const spawn = SubagentChatSignal.toSpawnEvent(signal);
		if (spawn) {
			this._onDidSpawnChat.fire(spawn);
		}
	}

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@IProductService private readonly _productService: IProductService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
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

		// Emit a host-produced session-title metadata span whenever this agent's
		// session title changes. The shared state manager fires for every
		// provider, so gate on our own provider id. Mirrors `CopilotAgent`.
		this._register(this._stateManager.onDidChangeSessionTitle(({ session, title }) => {
			if (AgentSession.provider(session) === this.id) {
				this._otelService.emitSessionTitleChanged(AgentSession.id(session), session, title);
			}
		}));

		// Phase 19: resolve the transport mode now and re-resolve reactively.
		// A flip only affects sessions materialized afterwards; in-flight
		// subprocesses keep their original transport. When native, kick off an
		// initial model refresh since no GitHub auth (which would otherwise
		// trigger it) is required.
		//
		// Resolution now depends on the `claudeUseCopilotProxy` setting, the
		// experimentation flag, and GitHub sign-in state. The setting and flag
		// both live in the root config, so `onDidRootConfigChange` covers them;
		// the sign-in trigger is wired in {@link authenticate}.
		this._transportMode = this._resolveTransportMode();
		this._perSessionProviderEnabled = this._readPerSessionProviderEnabled();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			// Reconcile the per-session flag first so the transport-mode change (and
			// any refresh it kicks off) observes the current flag value; the flag also
			// selects the merged-vs-single catalog and, when it first hydrates here,
			// triggers the initial merged enumeration.
			this._applyPerSessionProviderChange();
			this._applyTransportModeChange(this._resolveTransportMode());
		}));
		if (this._transportMode === 'native' || this._perSessionProviderEnabled) {
			// Native — and the per-session provider flag, whose merged catalog can
			// enumerate native models with no GitHub token — bootstraps the model list
			// here. Proxy-only mode instead waits for `authenticate()` to deliver the
			// token its CAPI enumeration needs (a refresh now would hit the no-token
			// early-return). Nothing else triggers a signed-out refresh, so without
			// this a signed-out flag-on window with a local Claude setup would show an
			// empty picker. (Transport *flips*, and a flag that only hydrates after
			// construction, are covered by the `onDidRootConfigChange` subscription
			// above.) `queueMicrotask` runs it off the ctor stack.
			queueMicrotask(() => { void this._startModelRefresh(); });
		}
	}

	/**
	 * Gather the four precedence inputs and delegate the decision to the pure
	 * {@link resolveClaudeTransportMode}. {@link authenticate} passes
	 * `hasGitHubToken: true` while a token is arriving, so resolution reflects the
	 * imminent sign-in before the token is committed to {@link _githubToken}.
	 */
	private _resolveTransportMode(hasGitHubToken: boolean = this._githubToken !== undefined): ClaudeTransportMode {
		// An absent `claudeUseCopilotProxy` stays `undefined` so the pure function
		// can tell an explicit override from "fall through to the flag/sign-in rules".
		const explicitProxy = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.ClaudeUseCopilotProxy);
		const allowSignedOutWhenUsable = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true;
		const hasExistingSetup = allowSignedOutWhenUsable && detectExistingClaudeSetup(this._environmentService.userHome.fsPath);
		return resolveClaudeTransportMode({ explicitProxy, allowSignedOutWhenUsable, hasGitHubToken, hasExistingSetup });
	}

	/**
	 * Apply a freshly-resolved transport mode. No-op when it matches the current
	 * mode. On a real flip it drops the stale model catalog — which also
	 * republishes the newly-resolved protected resources downstream, since the
	 * side-effects layer reads `models` and `getProtectedResources()` together —
	 * kicks off a fresh enumeration, and, when flipping into proxy with no proxy
	 * handle, proactively asks the client to authenticate rather than waiting for
	 * the next command to fail with `AHP_AUTH_REQUIRED`. A handle persists across
	 * a proxy→native→proxy round-trip (cleared only on dispose), so the auth
	 * prompt fires only when a credential is genuinely missing.
	 */
	private _applyTransportModeChange(next: ClaudeTransportMode): void {
		if (next === this._transportMode) {
			return;
		}
		this._transportMode = next;
		if (this._isPerSessionProviderEnabled()) {
			// Under the per-session provider flag `_transportMode` is only the
			// fallback for model-less sessions: the merged catalog always publishes
			// both providers' models and `getProtectedResources()` advertises
			// Copilot optional regardless of the default. So a default flip must
			// neither blank the catalog nor fire an `auth/required`; just
			// re-enumerate in case newly resolved credentials expose more models.
			void this._startModelRefresh();
			return;
		}
		this._models.set([], undefined);
		void this._startModelRefresh();
		if (next === 'proxy' && !this._proxyHandle) {
			this._onDidRequireAuth.fire({
				resource: this._gitHubEndpointService.getCopilotResource().resource,
				reason: AuthRequiredReason.Required,
			});
		}
	}

	// #region Descriptor + auth

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('claudeAgent.displayName', "Claude"),
			description: localize('claudeAgent.description', "Claude agent backed by the Anthropic Claude Agent SDK"),
			capabilities: {
				multipleChats: { fork: true, sideChat: true },
				...(this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}),
			},
		};
	}

	private _isMultiRootEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostClaudeMultiRootEnabledConfigKey) === true;
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		// Native (BYO-Anthropic) mode does not *require* GitHub Copilot auth — the
		// SDK owns the Anthropic credential. Rather than DROP the Copilot resource,
		// native keeps advertising it with `required: false` (mirroring Codex when
		// using a provider that does not require GitHub). Two effects, both
		// wanted:
		//   1. The host silently forwards a GitHub token IFF the user is already
		//      signed in (no prompt when signed out) — the sign-in probe that lets
		//      `authenticate()` flip a signed-in user from native to proxy at
		//      startup (precedence rule 3). Without advertising it, a signed-in
		//      user with a local Claude setup would be stuck in native forever.
		//   2. `required: false` still tells the window gate the type is usable
		//      without GitHub when signed out (see
		//      `protectedResourcesRequireGitHubCopilotSignIn`, which checks
		//      `required !== false`), so no sign-in is forced.
		// The optional repo resource is kept for git operations either way.
		//
		// Under the per-session provider flag the transport is chosen per session
		// from the picked model, so no host-global mode can make Copilot strictly
		// required: advertise it optional (mirroring Codex's always-optional
		// Copilot resource) and let `_ensureAuthenticated(model)` raise
		// `AHP_AUTH_REQUIRED` only for the sessions that actually pick a
		// Copilot-routed model without a proxy handle.
		const copilotResource = this._gitHubEndpointService.getCopilotResource();
		const copilotRequired = !this._isPerSessionProviderEnabled() && this._transportMode === 'proxy';
		return [
			copilotRequired ? copilotResource : { ...copilotResource, required: false },
			this._gitHubEndpointService.getRepoResource(),
		];
	}

	/**
	 * Resolve the active {@link ClaudeTransport} for a session. The transport is
	 * derived from `model` via {@link resolveClaudeSessionTransport}: with the
	 * per-session provider flag on, a native-Anthropic model routes native and a
	 * Copilot-routed (or absent) model routes proxy; with the flag off, every
	 * session follows the host-global {@link _transportMode}. In native mode the
	 * transport is always ready (the SDK owns credentials); in proxied mode a
	 * started proxy handle is required, otherwise {@link AHP_AUTH_REQUIRED} is
	 * thrown so the client can drive Copilot sign-in.
	 */
	private _ensureAuthenticated(model?: ModelSelection): ClaudeTransport {
		const transport = resolveClaudeSessionTransport({
			perSessionProviderEnabled: this._isPerSessionProviderEnabled(),
			model,
			defaultMode: this._transportMode,
		});
		if (transport !== 'proxy') {
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
		if (resource === this._gitHubEndpointService.getRepoResource().resource) {
			return true;
		}
		if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
			return false;
		}
		// A GitHub Copilot token is arriving (sign-in). Re-resolve the transport
		// with the token now available: absent an explicit `claudeUseCopilotProxy`,
		// signing in prefers proxy even over an existing native setup, so this can
		// flip a signed-out native session into proxy.
		const nextMode = this._resolveTransportMode(true);

		// Native (BYO-Anthropic) mode needs no proxy and no GitHub token. Record
		// the token (harmless; lets a later flip back to proxy reuse it) but do
		// NOT start the proxy or treat the absence of a token as unauthenticated.
		// The only way to resolve to native with a token present is an explicit
		// `claudeUseCopilotProxy=false`, so `_applyTransportModeChange` here is a
		// no-op unless a stale proxy mode still needs reconciling to native.
		//
		// Under the per-session provider flag we always fall through to acquire the
		// proxy handle even when the default transport is native: a session that
		// picks a Copilot-routed model from the merged catalog needs a started handle
		// to run, and because the resolved default is native nothing else would ever
		// acquire one. `_transportMode` stays the resolved default for model-less
		// sessions; per-session routing is decided
		// in `_ensureAuthenticated(model)`.
		if (nextMode === 'native' && !this._isPerSessionProviderEnabled()) {
			this._githubToken = token;
			this._applyTransportModeChange('native');
			return true;
		}

		const tokenChanged = this._githubToken !== token;
		const modeChanged = this._transportMode !== nextMode;
		if (!tokenChanged && !modeChanged && this._proxyHandle) {
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
		let newHandle: IClaudeProxyHandle;
		try {
			newHandle = await this._claudeProxyService.start(token);
		} catch (err) {
			// Under the per-session provider flag a native *default* still falls
			// through to here to acquire the proxy handle so the merged catalog's
			// Copilot-routed models can run. But native needs neither the proxy nor
			// the token, so a proxy start failure must NOT fail native sign-in:
			// commit native, leave `_proxyHandle` untouched, and let the Copilot half
			// stay unavailable until a picked Copilot model re-drives `authenticate()`.
			// A proxy *default* has no such fallback, so it keeps the original
			// behavior — propagate, leaving `_githubToken`/`_proxyHandle` untouched so
			// the retry still sees the token as new.
			if (nextMode === 'native') {
				this._githubToken = token;
				this._transportMode = 'native';
				this._logService.warn('[Claude] Proxy start failed during native-default sign-in (per-session provider); Copilot-routed models unavailable until the next sign-in', err);
				this._models.set([], undefined);
				void this._startModelRefresh();
				return true;
			}
			throw err;
		}
		const oldHandle = this._proxyHandle;
		this._proxyHandle = newHandle;
		this._githubToken = token;
		// Commit the (possibly flipped native→proxy) mode now that a handle is in
		// hand — do NOT route through `_applyTransportModeChange`, which would
		// fire a redundant `auth/required` even though we just authenticated.
		this._transportMode = nextMode;
		this._logService.info('[Claude] Auth token updated');
		oldHandle?.dispose();
		if (tokenChanged || modeChanged) {
			// A different account can have different model entitlements, and a
			// transport flip enumerates a different catalog. Do not retain the
			// previous list if enumeration for the new input fails. The `models`
			// write also republishes the (now proxy) protected resources downstream.
			this._models.set([], undefined);
		}
		void this._startModelRefresh();
		return true;
	}

	/**
	 * Whether the Claude provider routes through the Copilot-CAPI proxy.
	 * Reads the resolved {@link _transportMode} (Phase 19), kept current by
	 * {@link _resolveTransportMode} on construction, config change, and sign-in.
	 */
	private _isProxyEnabled(): boolean {
		return this._transportMode === 'proxy';
	}

	/**
	 * Whether the Claude per-session provider picker is enabled (experimentation
	 * flag, forwarded from the `chat.agentHost.claude.perSessionProvider` VS Code
	 * setting into the root config). When on, the provider publishes a single
	 * merged catalog of both its Copilot-routed and native-Anthropic models and
	 * derives each session's transport from the picked model's provider, rather
	 * than a host-global {@link _transportMode}. When off (the default) all Claude
	 * traffic follows the single resolved transport.
	 */
	private _isPerSessionProviderEnabled(): boolean {
		return this._perSessionProviderEnabled;
	}

	/** Live read of the forwarded per-session provider flag from the root config. */
	private _readPerSessionProviderEnabled(): boolean {
		return this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.ClaudePerSessionProvider) === true;
	}

	/**
	 * Reconcile a change to the per-session provider flag (forwarded live from the
	 * VS Code setting, and typically *hydrated after construction* by its
	 * forwarder). On a real transition re-enumerate: the flag reshapes both the
	 * catalog (merged both-providers vs single-transport) and the advertised
	 * protected resources (Copilot optional vs required), and the republished
	 * catalog re-reads those resources downstream. This is also the path that first
	 * populates the merged catalog when a signed-out window's flag arrives after
	 * the constructor's refresh gate has already run.
	 */
	private _applyPerSessionProviderChange(): void {
		const next = this._readPerSessionProviderEnabled();
		if (next === this._perSessionProviderEnabled) {
			return;
		}
		this._perSessionProviderEnabled = next;
		void this._startModelRefresh();
	}

	/**
	 * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh and
	 * never rejects — {@link _refreshModels} already logs and handles failure.
	 *
	 * Only safe for callers with no new input to apply (the host's periodic
	 * scheduler). Triggers that invalidate the in-flight request — a rotated
	 * token, a transport flip — must call {@link _startModelRefresh} so they
	 * are not answered by a refresh bound to the superseded input.
	 */
	refreshModels(): Promise<void> {
		return this._modelRefreshInFlight ?? this._startModelRefresh();
	}

	/**
	 * Unconditionally begins a refresh, superseding any in-flight one as the
	 * coalescing target. The superseded request stays harmless: its own
	 * stale-write guard drops the result if the token or transport moved on.
	 */
	private _startModelRefresh(): Promise<void> {
		const refresh = this._refreshModels().finally(() => {
			if (this._modelRefreshInFlight === refresh) {
				this._modelRefreshInFlight = undefined;
			}
		});
		this._modelRefreshInFlight = refresh;
		return refresh;
	}

	private _refreshModels(): Promise<void> {
		return this._isPerSessionProviderEnabled() ? this._refreshModelsMerged() : this._refreshModelsSingle();
	}

	/**
	 * Single-transport refresh (per-session provider flag off): enumerate exactly
	 * the catalog for the resolved {@link _transportMode} — proxy (CAPI) or native
	 * (SDK) — with stale-write guards for a mid-flight transport flip or token
	 * rotation.
	 */
	private async _refreshModelsSingle(): Promise<void> {
		const proxyAtStart = this._isProxyEnabled();
		const tokenAtStart = this._githubToken;
		if (proxyAtStart && !tokenAtStart) {
			this._models.set([], undefined);
			return;
		}
		// Native without a credential cannot run a turn. The SDK's
		// `supportedModels()` is a static catalog and answers regardless, so
		// publishing it would advertise models that fail on first use — and would
		// make the agent look usable-without-GitHub to the window gate. Report an
		// empty catalog instead, which surfaces as "no models" (see the `Unusable`
		// entry in `src/vs/sessions/CONTEXT.md`). Only reachable via an explicit
		// `claudeUseCopilotProxy: false`; the flag-driven path only picks native
		// when a setup was detected.
		if (!proxyAtStart && !detectExistingClaudeSetup(this._environmentService.userHome.fsPath)) {
			this._models.set([], undefined);
			return;
		}
		try {
			// A proxy refresh always has a token here (the `proxyAtStart &&
			// !tokenAtStart` case returned above); the inner check both re-asserts
			// that and narrows `tokenAtStart` to a string for the fetch.
			let filtered: readonly IAgentModelInfo[];
			if (proxyAtStart) {
				if (!tokenAtStart) {
					return;
				}
				filtered = await this._fetchProxyModels(tokenAtStart);
			} else {
				filtered = await this._fetchNativeModels();
			}
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
			// Keep the last known-good catalog. A periodic refresh is advisory;
			// a transient service failure must not make every model disappear.
			// Input changes that invalidate the catalog clear it at the point
			// where that input changes.
		}
	}

	/**
	 * Merged refresh (per-session provider flag on): enumerate both providers'
	 * catalogs in parallel and publish them as one provider-qualified list via
	 * {@link mergeClaudeModelCatalogs}. Each source is optional — the proxy catalog
	 * needs a GitHub token, the native catalog needs a local Claude setup — so a
	 * source we can't attempt contributes an empty list rather than failing the
	 * whole refresh. {@link Promise.allSettled} tolerates one source erroring;
	 * only when *every* source we attempted fails do we keep the last known-good
	 * catalog instead of blanking, so a transient double failure never wipes the
	 * picker.
	 */
	private async _refreshModelsMerged(): Promise<void> {
		const tokenAtStart = this._githubToken;
		const hasNativeSetup = detectExistingClaudeSetup(this._environmentService.userHome.fsPath);
		const [proxyOutcome, nativeOutcome] = await Promise.allSettled([
			tokenAtStart ? this._fetchProxyModels(tokenAtStart) : Promise.resolve<readonly IAgentModelInfo[]>([]),
			hasNativeSetup ? this._fetchNativeModels() : Promise.resolve<readonly IAgentModelInfo[]>([]),
		]);
		// Stale-write guard: a newer refresh (token rotation / sign-in / sign-out)
		// superseded the proxy half while we were awaiting.
		if (this._githubToken !== tokenAtStart) {
			return;
		}
		const attempted = (tokenAtStart ? 1 : 0) + (hasNativeSetup ? 1 : 0);
		const failed = (proxyOutcome.status === 'rejected' ? 1 : 0) + (nativeOutcome.status === 'rejected' ? 1 : 0);
		if (attempted > 0 && failed === attempted) {
			// Every source we attempted failed — keep the last known-good catalog
			// rather than blanking. Sources we didn't attempt resolve fulfilled-empty
			// and are not counted as failures.
			this._logService.error('[Claude] All attempted model sources failed (merged refresh); keeping last known-good catalog');
			return;
		}
		const proxyModels = this._settledCatalog(proxyOutcome, 'proxy');
		const nativeModels = this._settledCatalog(nativeOutcome, 'native');
		const merged = mergeClaudeModelCatalogs(proxyModels, nativeModels);
		this._logService.info(`[Claude] Models refreshed (merged). Count: ${merged.length}, ${merged.map(m => m.name).join(', ')}`);
		this._models.set(merged, undefined);
	}

	/**
	 * Unwrap one settled catalog fetch: its models on success, or an empty list on
	 * rejection (logged) so the other provider's catalog still publishes.
	 */
	private _settledCatalog(outcome: PromiseSettledResult<readonly IAgentModelInfo[]>, label: string): readonly IAgentModelInfo[] {
		if (outcome.status === 'fulfilled') {
			return outcome.value;
		}
		this._logService.error(outcome.reason, `[Claude] Failed to fetch ${label} models (merged refresh); keeping the other provider`);
		return [];
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
		this._ensureAuthenticated(config.model);
		if (config.fork) {
			return this._forkSession(config, config.fork);
		}
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);

		const existing = this._findAnySession(sessionId);
		if (existing) {
			// Re-apply the eager active client on reconnect: AgentService reissues
			// `createSession` for an existing URI, so the reconnected client's
			// tools/customizations must still reach Claude (mirrors Copilot).
			await this._seedEagerActiveClient(sessionUri, config.activeClient);
			if (!existing.isPipelineReady) {
				return {
					session: existing.sessionUri,
					resolvedWorkingDirectory: existing.workingDirectory,
					provisional: true,
					...(existing.project ? { project: existing.project } : {}),
				};
			}
			return { session: sessionUri, resolvedWorkingDirectory: config.workingDirectories?.[0] };
		}

		// A workspace-less session (no `workingDirectories` supplied, and not a
		// fork) runs in a stable per-session scratch dir shared with the Copilot
		// agent; without a cwd Claude throws at materialize. The workspace-less
		// marker itself is owned/persisted centrally by the AH service.
		const requestedWorkingDirectory = config.workingDirectories?.[0];
		const workingDirectory = requestedWorkingDirectory ?? await ensureWorkspacelessScratchDir(this._environmentService.userHome, sessionId);

		// Only probe for a project when the caller supplied a real folder; a
		// scratch dir is never a code project.
		const project = requestedWorkingDirectory
			? await projectFromCopilotContext({ cwd: requestedWorkingDirectory.fsPath }, this._gitService)
			: undefined;

		const permissionMode = this._resolvePermissionMode(config.config);

		// The additional (non-primary) roots of a multi-root session. Stable from
		// creation — a worktree remap only affects index 0 — so they are captured
		// here and preserved across every materialization. Empty for single-root.
		const additionalDirectories = config.workingDirectories?.slice(1) ?? [];

		const session = ClaudeAgentSession.createProvisional(
			sessionId,
			sessionUri,
			URI.parse(buildDefaultChatUri(sessionUri)),
			workingDirectory,
			project,
			config.model,
			config.agent,
			config.config,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._metadataStore,
			this._instantiationService,
			additionalDirectories,
		);
		this._seedSessionEntry(sessionId, sessionUri, session);
		await this._seedEagerActiveClient(sessionUri, config.activeClient);

		return {
			session: sessionUri,
			resolvedWorkingDirectory: workingDirectory,
			provisional: true,
			...(project ? { project } : {}),
		};
	}

	/**
	 * Seed the eagerly-claimed active client (tools + customizations) into the
	 * SDK at session creation, mirroring the Copilot agent. Runs for fresh AND
	 * reconnected sessions: when the workbench session state already carries the
	 * active client, no follow-up `session/activeClientSet` is dispatched to
	 * trigger the customization sync, so the built-in skills bundle would never
	 * reach Claude otherwise. Progress is suppressed (`quiet`) because the AH
	 * service has not created the session state yet — a
	 * `SessionCustomizationUpdated` envelope would be orphaned; the completed
	 * snapshot is provided via `getSessionCustomizations` immediately after.
	 */
	private async _seedEagerActiveClient(sessionUri: URI, activeClient: IAgentCreateSessionConfig['activeClient']): Promise<void> {
		if (!activeClient) {
			return;
		}
		const handle = this.getOrCreateActiveClient(sessionUri, { clientId: activeClient.clientId, displayName: activeClient.displayName });
		handle.tools = activeClient.tools;
		if (activeClient.customizations !== undefined) {
			await this.syncClientCustomizations(sessionUri, activeClient.clientId, activeClient.customizations, { quiet: true });
		}
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

		// Reconstruct the full ordered set so a multi-root session keeps every
		// granted root after the recreate. Prefer the live session's set; else
		// combine the resolved primary with the persisted overlay tail.
		const workingDirectories = existing?.workingDirectories
			?? (overlay.workingDirectories && overlay.workingDirectories.length > 1
				? [workingDirectory, ...overlay.workingDirectories.slice(1)]
				: [workingDirectory]);

		// `shutdownLiveQuery` awaits the subprocess's actual exit (and its final
		// transcript flush), so the on-disk `<id>.jsonl` is now stable and safe
		// to delete: no live writer can recreate it before the next turn
		// respawns a fresh `--session-id <id>`.
		await existing?.shutdownLiveQuery();
		this._sessions.deleteAndDispose(sessionId);
		await this._sdkService.deleteSession(sessionId);

		await this.createSession({
			session,
			workingDirectories,
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

	// ---- Chat surface ------------------------------------------------------
	//
	// `chats` exposes the per-chat operations addressed by a single,
	// concrete chat channel URI (the default chat channel or a peer/subagent
	// URI). The default chat's SDK id is still the owning session id, derived
	// inside the harness from the chat URI.

	/**
	 * The chat-addressed operation surface
	 * ({@link IAgentChats}). Every method addresses a chat by a single,
	 * already-resolved chat URI; this maps to the `(session, chat)` pair
	 * the agent's internal SDK storage is keyed by (via
	 * {@link _resolveChatTarget}).
	 */
	readonly chats: IAgentChats = {
		createChat: (chat, options) => this._createChat(chat, options),
		fork: (chat, source: IAgentCreateChatForkSource, options?: IAgentCreateChatOptions) =>
			this._createChat(chat, { ...options, fork: source }),
		disposeChat: chatUri => {
			const { session, chat } = this._resolveChatTarget(chatUri);
			return this._disposeChat(session, chat);
		},
		sendMessage: (chatUri, prompt, workingDirectories, attachments, turnId, senderClientId) => {
			return this._sendMessage(chatUri, prompt, workingDirectories, attachments, turnId, senderClientId);
		},
		abort: chatUri => {
			return this._abortSession(chatUri);
		},
		changeModel: (chatUri, model) => {
			return this._changeModel(chatUri, model);
		},
		changeAgent: (chatUri, agent) => {
			return this._changeAgent(chatUri, agent);
		},
		getMessages: chat => this.getSessionMessages(chat),
	};

	/**
	 * Map an already-resolved chat URI to the `(session, chat)` pair the agent's
	 * internal SDK storage is keyed by. A peer (or subagent) chat is addressed by
	 * its own `ahp-chat` channel URI, from which the owning session is recovered.
	 * The default chat is addressed by its deterministic chat channel URI.
	 */
	private _resolveChatTarget(chat: URI): { session: URI; chat: URI } {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`Claude chat operation requires an AHP chat URI: ${chat.toString()}`);
		}
		return { session: URI.parse(parsed.session), chat };
	}

	/**
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

			// Resolve the forked session's working directory now so we can fail
			// fast (rather than at the first `sendMessage` when `_resumeSession`
			// requires a cwd). The Query itself starts lazily — see the JSDoc.
			const sdkInfo = await this._sdkService.getSessionInfo(newSessionId);
			const workingDirectory = sdkInfo?.cwd
				? URI.file(sdkInfo.cwd)
				: existingSource?.workingDirectory ?? sourceOverlay.workingDirectories?.[0];
			if (!workingDirectory) {
				throw new Error(`Cannot fork session ${sourceSessionId}: forked session ${newSessionId} has no working directory (SDK cwd and source working directory missing)`);
			}

			// The protocol ignores request-time workingDirectories for forks:
			// inherit the live source set, or its persisted overlay when unloaded.
			const additionalDirectories = existingSource?.workingDirectories?.slice(1)
				?? sourceOverlay.workingDirectories?.slice(1)
				?? [];
			await this._metadataStore.write(newSessionUri, {
				...(model ? { model } : {}),
				...(permissionMode ? { permissionMode } : {}),
				...(agent ? { agent } : {}),
				...(additionalDirectories.length > 0 ? { workingDirectories: [workingDirectory, ...additionalDirectories] } : {}),
			});

			let project: IAgentSessionProjectInfo | undefined;
			try {
				project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
			} catch (err) {
				this._logService.warn(`[Claude] fork: project resolution failed for ${newSessionId}; continuing without project`, err);
			}
			return {
				session: newSessionUri,
				resolvedWorkingDirectory: workingDirectory,
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
	 * Builds the SDK `onElicitation` bridge for a session/chat. Mirrors
	 * {@link _makeCanUseTool}: resolves the session by SDK id (default and peer
	 * chats) and delegates to the elicitation bridge, which parks on the
	 * session's user-input channel. Phase 10.6.
	 */
	private _makeOnElicitation(sdkSessionId: string): OnElicitation {
		return (request, options) =>
			handleElicitation(
				{ getSession: id => this._findSessionBySdkId(id) },
				sdkSessionId, request, options,
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
	private async _materializeProvisional(sessionId: string, workingDirectories?: readonly URI[]): Promise<ClaudeAgentSession> {
		const session = this._findAnySession(sessionId);
		if (!session) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const transport = this._ensureAuthenticated(session.provisionalModel);

		const canUseTool = this._makeCanUseTool(sessionId);
		const onElicitation = this._makeOnElicitation(sessionId);
		try {
			await session.materialize({ transport, canUseTool, onElicitation, isResume: false, workingDirectory: workingDirectories?.[0], workingDirectories, serverToolHost: this._serverToolHost });
		} catch (err) {
			this._sessions.deleteAndDispose(sessionId);
			throw err;
		}

		// Emit the full resolved set (index 0 = process root, 1..N = additional
		// roots). Falls back to the session's own ordered set when the host
		// didn't hand us one (e.g. workspace-less single-root).
		const materializedWorkingDirectories = workingDirectories ?? session.workingDirectories;

		// Pass the resolved directories before the materialize event updates them in the state manager.
		this._checkpointService.captureBaselineCheckpoint(session.sessionUri, materializedWorkingDirectories).catch(err => {
			this._logService.warn(`[Claude:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
		});

		this._onDidMaterializeSession.fire({
			session: session.sessionUri,
			project: session.project,
			workingDirectories: materializedWorkingDirectories,
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
	private async _resumeSession(sessionId: string, sessionUri: URI, workingDirectories?: readonly URI[]): Promise<ClaudeAgentSession> {
		this._logService.info(`[Claude:${sessionId}] _resumeSession — no in-memory state, rebuilding from disk`);
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
		// Resolve the transport from the resumed session's own model (per-session
		// provider): a session persisted on a native-Anthropic model resumes native
		// even when the host default is proxy, and vice versa. Deferred until after
		// the overlay read so `overlay.model` is available.
		const transport = this._ensureAuthenticated(overlay.model);
		// The additional roots come from the send-time set when the host supplied
		// one (the caller carries it from `sendMessage`); otherwise from the
		// persisted overlay so a cold resume from disk still reaches every root.
		// The SDK's `cwd` stays authoritative for the primary (index 0).
		const additionalDirectories = workingDirectories
			? workingDirectories.slice(1)
			: overlay.workingDirectories?.slice(1) ?? [];
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
			URI.parse(buildDefaultChatUri(sessionUri)),
			workingDirectory,
			project,
			overlay.model,
			overlay.agent,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._metadataStore,
			this._instantiationService,
			additionalDirectories,
		);
		this._seedSessionEntry(sessionId, sessionUri, session);

		const canUseTool = this._makeCanUseTool(sessionId);
		const onElicitation = this._makeOnElicitation(sessionId);
		try {
			await session.materialize({ transport, canUseTool, onElicitation, isResume: true, workingDirectories, serverToolHost: this._serverToolHost });
		} catch (err) {
			this._sessions.deleteAndDispose(sessionId);
			throw err;
		}

		this._onDidMaterializeSession.fire({
			session: sessionUri,
			project,
			workingDirectories: session.workingDirectories,
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
		// session id awaits this work first (and vice versa). When the session
		// has not yet been materialized, abort the controller (unblocks any
		// racing `await sdk.startup()`) and drop the record. No SDK contact,
		// no DB write — symmetric with `createSession`.
		const sessionId = AgentSession.id(session);
		return this._disposeSequencer.queue(sessionId, async () => {
			await this._teardownEntry(sessionId);
			this._pruneActiveClientHandles(sessionId);
			this._otelService.releaseSessionTraceContext(session.toString());
		});
	}

	/**
	 * Non-destructive counterpart to {@link disposeSession}: releases the
	 * session's in-memory resources — its live SDK subprocess (via the disposed
	 * pipeline) and cached entry — but preserves the on-disk session so it can
	 * be transparently resumed later via {@link _resumeSession}. Used by
	 * idle-session eviction to bound memory in long-lived host processes.
	 *
	 * No-ops for provisional sessions (never materialized, so nothing on disk to
	 * resume from) and for sessions with a turn in flight — tearing the pipeline
	 * down mid-turn would abort live work. Shares the same in-memory teardown as
	 * {@link disposeSession}; the destructive difference (deleting durable data)
	 * lives in the orchestrator, which only invokes it on dispose.
	 */
	releaseSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		return this._disposeSequencer.queue(sessionId, async () => {
			const entry = this._sessions.get(sessionId);
			if (!entry) {
				return;
			}
			// Provisional sessions (default chat not materialized) have no
			// on-disk SDK session to resume from; releasing would lose state.
			if (!entry.defaultChat?.isPipelineReady) {
				return;
			}
			// Defensive active-turn guard: the orchestrator already skips
			// eviction while a turn is active, but `disposeSession` and
			// `sendMessage` run on separate sequencers, so a turn could be in
			// flight. Never tear the pipeline down under a live turn.
			if (entry.allChatSessions().some(chatSession => chatSession.hasActiveTurn)) {
				return;
			}
			this._logService.info(`[Claude:${sessionId}] Releasing idle session from memory (durable state preserved)`);
			await this._teardownEntry(sessionId);
			this._pruneActiveClientHandles(sessionId);
		});
	}

	/**
	 * Abort and dispose a session entry — its default chat and every peer chat.
	 * Each peer teardown serializes on the peer's own {@link _sessionSequencer}
	 * key so it waits for any in-flight materialize/send rather than disposing
	 * the chat under it.
	 */
	private async _teardownEntry(sessionId: string): Promise<void> {
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			return;
		}
		const defaultChat = entry.defaultChat;
		if (defaultChat && !defaultChat.isPipelineReady) {
			defaultChat.abortController.abort();
		}
		await Promise.all(entry.peerChatKeys().map(chatKey =>
			this._sessionSequencer.queue(chatKey, async () => {
				const peer = entry.getPeerChat(chatKey);
				if (peer) {
					if (!peer.isPipelineReady) {
						peer.abortController.abort();
					} else {
						peer.abort();
					}
				}
				entry.disposePeerChat(chatKey);
			})
		));
		this._sessions.deleteAndDispose(sessionId);
		// Drop the live backings for this session's peer chats. The chat URI
		// encodes its parent session, so we recover it via `parseChatUri`.
		for (const chatKey of [...this._chatBackings.keys()]) {
			const parsed = parseChatUri(URI.parse(chatKey));
			if (parsed && AgentSession.id(URI.parse(parsed.session)) === sessionId) {
				this._chatBackings.delete(chatKey);
			}
		}
	}

	// #region Multi-chat — additional (non-default) peer chats

	/**
	 * Create an additional peer chat within an existing session. The new chat
	 * is backed by its own SDK chat (a fresh one, or a fork of the
	 * source chat at a turn) that shares the parent session's working directory
	 * and inherited model / agent / permission-mode parentSession. The backing is
	 * recorded in the live {@link _chatBackings} map and returned as an opaque
	 * `providerData` blob for the orchestrator to persist; the chat's metadata
	 * overlay is seeded so a later lazy resume inherits the parent parentSession. The
	 * live {@link ClaudeAgentSession} is built lazily on the chat's first send
	 * (mirroring how default sessions materialize lazily).
	 */
	private async _createChat(chat: URI, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> {
		// Fast-fail when the requested transport plainly needs a proxy handle we
		// don't have. With the per-session flag on and no explicit chat model, the
		// effective model is inherited from the parent and only resolved inside the
		// queue below, so defer the gate to `_materializeChatLocked` (which sees the
		// resolved provisional model) rather than falsely gating an inherited native
		// chat on the proxy default. With the flag off the model is ignored, so this
		// preserves today's fast-fail behavior.
		if (!this._isPerSessionProviderEnabled() || options?.model) {
			this._ensureAuthenticated(options?.model);
		}
		if (isDefaultChatUri(chat)) {
			return;
		}
		const parsed = parseChatUri(chat);
		if (!parsed) {
			throw new Error(`[Claude] createChat: malformed chat URI ${chat.toString()}`);
		}
		const session = URI.parse(parsed.session);
		const chatKey = chat.toString();
		const parentSessionId = AgentSession.id(session);
		let result: IAgentCreateChatResult | undefined;
		const queueKey = options?.sideChat ? chatKey : parentSessionId;
		await this._sessionSequencer.queue(queueKey, async () => {
			const existing = this._chatBackings.get(chatKey);
			if (existing) {
				// Idempotent re-create: hand back the existing backing so the
				// orchestrator re-persists a consistent blob.
				result = { providerData: encodeProviderData(existing), backingSession: AgentSession.uri(this.id, existing.sdkSessionId) };
				return;
			}
			const parentSession = await this._resolveParentSession(session, parentSessionId);
			const model = options?.model ?? parentSession.model;

			let sdkSessionId: string | undefined;
			let sideChat: IPersistedChat['sideChat'];
			if (options?.fork) {
				// If the fork point can't be resolved, fall through to a fresh
				// chat rather than inheriting the whole source backend.
				sdkSessionId = (await this._forkChat(session, options.fork))?.sessionId;
			} else if (options?.sideChat) {
				const forked = await this._forkChat(session, { source: options.sideChat.source, turnId: options.sideChat.providerAnchorTurnId ?? options.sideChat.turnId });
				sdkSessionId = forked?.sessionId;
				const fallbackContext = options.sideChat.sourceContext ?? (!forked ? this._buildSideChatContext(session, options.sideChat.source, options.sideChat.turnId) : undefined);
				if (!forked && !fallbackContext && !options.sideChat.partialResponse) {
					throw new Error(`[Claude] createChat side chat: source turn ${options.sideChat.turnId} could not be forked`);
				}
				sideChat = {
					source: options.sideChat.source.toString(),
					turnId: options.sideChat.turnId,
					...(options.sideChat.selection ? { selection: options.sideChat.selection } : {}),
					...(options.sideChat.providerAnchorTurnId ? { providerAnchorTurnId: options.sideChat.providerAnchorTurnId } : {}),
					inheritedTurnCount: forked?.inheritedTurnCount ?? 0,
					...(fallbackContext ? { context: fallbackContext } : {}),
					...(options.sideChat.partialResponse ? { partialResponse: options.sideChat.partialResponse } : {}),
				};
			}
			sdkSessionId ??= generateUuid();

			// Record the live backing and hand the opaque blob back to the
			// orchestrator to persist.
			const backing: IPersistedChat = { sdkSessionId, ...(model ? { model } : {}), ...(sideChat ? { sideChat } : {}) };
			this._chatBackings.set(chatKey, backing);
			result = { providerData: encodeProviderData(backing), backingSession: AgentSession.uri(this.id, sdkSessionId) };

			// Seed the chat's own metadata overlay so a later lazy resume (this
			// process or a restart) inherits the parent's parentSession.
			await this._metadataStore.write(chat, {
				...(model ? { model } : {}),
				...(parentSession.agent ? { agent: parentSession.agent } : {}),
				...(parentSession.permissionMode ? { permissionMode: parentSession.permissionMode } : {}),
			});
			this._logService.info(`[Claude] Created additional chat ${chat.toString()} in session ${session.toString()}${options?.fork ? ' (forked)' : ''}`);
		});
		return result;
	}

	/**
	 * Dispose an additional peer chat, tearing down its live chat (if
	 * any) and dropping its live backing. The default chat cannot be disposed in
	 * isolation — it lives and dies with the session.
	 *
	 * Routed through {@link _sessionSequencer} (keyed on the chat URI) so it
	 * waits for any in-flight {@link _materializeChatLocked} or
	 * {@link sendMessage} to finish before tearing down — prevents
	 * use-after-dispose if a send is concurrently in progress. The durable
	 * peer-chat catalog is owned by the orchestrator now, so this only drops the
	 * live backing and chat.
	 */
	private async _disposeChat(session: URI, chat: URI): Promise<void> {
		if (isDefaultChatUri(chat)) {
			return;
		}
		const chatKey = chat.toString();
		const parentSessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(chatKey, async () => {
			const entry = this._sessions.get(parentSessionId);
			const peer = entry?.getPeerChat(chatKey);
			if (peer) {
				if (!peer.isPipelineReady) {
					peer.abortController.abort();
				} else {
					peer.abort();
				}
				entry!.disposePeerChat(chatKey);
			}
			this._chatBackings.delete(chatKey);
		});
		// The Claude SDK exposes no delete-chat RPC, so the forked /
		// fresh transcript is left on disk; without a catalog entry it is never
		// resumed again.
	}

	/**
	/**
	 * Resolve the inherited session settings (working directory, project, model, agent,
	 * permission mode) a new or resumed peer chat copies from its parent
	 * session. Prefers the live in-memory parent; falls back to the SDK's
	 * on-disk session record + metadata overlay for an unloaded parent.
	 */
	private async _resolveParentSession(session: URI, parentSessionId: string): Promise<{ workingDirectory: URI; additionalDirectories: readonly URI[]; project: IAgentSessionProjectInfo | undefined; model: ModelSelection | undefined; agent: AgentSelection | undefined; permissionMode: ClaudePermissionMode }> {
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
		// Peer chats span the same directories as their parent: prefer the live
		// parent's tail, else the persisted overlay's.
		const additionalDirectories = parent?.workingDirectories?.slice(1) ?? overlay.workingDirectories?.slice(1) ?? [];
		// Inherit the parent's model from the live session first, falling back to the
		// persisted overlay for an unloaded parent. A never-materialized parent holds
		// its picked model only in `provisionalModel` (the overlay is written at
		// materialize / `setModel`, not at `createSession`), so reading the overlay
		// alone would drop the inherited model — which, under the per-session provider
		// flag, would misroute the peer chat's transport to the host default.
		const model = parent?.provisionalModel ?? overlay.model;
		return { workingDirectory, additionalDirectories, project, model, agent: overlay.agent, permissionMode };
	}

	/**
	 * Fork the source chat's SDK chat at the requested turn into a new
	 * chat and return its SDK session id. Returns `undefined` (so the
	 * caller creates a fresh chat instead) when the source chat or the
	 * fork anchor cannot be resolved.
	 */
	private async _forkChat(session: URI, fork: IAgentCreateChatOptions['fork'] & {}): Promise<{ sessionId: string; inheritedTurnCount: number } | undefined> {
		const sourceSdkId = await this._resolveChatSdkId(session, fork.source);
		if (!sourceSdkId) {
			this._logService.warn(`[Claude] createChat fork: source ${fork.source.toString()} has no SDK chat; creating fresh chat`);
			return undefined;
		}
		const messages = await this._sdkService.getSessionMessages(sourceSdkId, { includeSystemMessages: true });
		const upToMessageId = resolveForkAnchorUuid(messages, fork.turnId);
		if (upToMessageId === undefined) {
			this._logService.warn(`[Claude] createChat fork: turn ${fork.turnId} not found in source ${sourceSdkId}; creating fresh chat`);
			return undefined;
		}
		const { sessionId } = await this._sdkService.forkSession(sourceSdkId, { upToMessageId });
		const anchorIndex = messages.findIndex(message => message.uuid === upToMessageId);
		const inheritedTurnCount = mapSessionMessagesToTurns(messages.slice(0, anchorIndex + 1), fork.source, this._logService).length;
		return { sessionId, inheritedTurnCount };
	}

	/**
	 * Resolve the SDK chat id backing a chat URI — the session's
	 * default chat (the parent session's own id) or an additional peer chat
	 * (from the in-memory entry, else the live/legacy backing).
	 */
	private async _resolveChatSdkId(session: URI, chatUri: URI): Promise<string | undefined> {
		if (isDefaultChatUri(chatUri) || chatUri.toString() === session.toString()) {
			return AgentSession.id(session);
		}
		const inMemory = this._findChat(session, chatUri)?.sessionId;
		if (inMemory) {
			return inMemory;
		}
		return this._resolveChatBacking(chatUri)?.sdkSessionId;
	}

	private _getSourceChatState(session: URI, chatUri: URI): ChatState | undefined {
		if (isDefaultChatUri(chatUri) || chatUri.toString() === session.toString()) {
			return this._stateManager.getDefaultChatState(session.toString());
		}
		return this._stateManager.getChatState(chatUri.toString());
	}

	private _buildSideChatContext(session: URI, chatUri: URI, turnId: string): string | undefined {
		const state = this._getSourceChatState(session, chatUri);
		if (!state) {
			return undefined;
		}
		const completedIndex = state.turns.findIndex(turn => turn.id === turnId);
		const boundedTurns = completedIndex >= 0
			? state.turns.slice(0, completedIndex + 1)
			: state.activeTurn?.id === turnId
				? state.turns
				: undefined;
		return boundedTurns ? buildSideChatSourceContext(boundedTurns, state.activeTurn?.id === turnId ? state.activeTurn : undefined) : undefined;
	}

	/**
	 * Resolves the live backing for a peer chat from the in-memory
	 * {@link _chatBackings} map. Returns `undefined` for a chat that has not been
	 * materialized via {@link materializeChat}.
	 */
	private _resolveChatBacking(chat: URI): IPersistedChat | undefined {
		return this._chatBackings.get(chat.toString());
	}

	/**
	 * Return the in-memory entry for a session, creating a provisional (not yet
	 * materialized) default chat to host its peer chats if none exists — e.g. a
	 * peer chat is sent to after a restart before the default chat is touched.
	 * Serialized on the session id so concurrent peer sends share one entry.
	 */
	private _ensureSessionEntry(session: URI): Promise<ClaudeSessionEntry> {
		const sessionId = AgentSession.id(session);
		return this._sessionSequencer.queue(sessionId, async () => {
			const existing = this._sessions.get(sessionId);
			if (existing) {
				return existing;
			}
			const parentSession = await this._resolveParentSession(session, sessionId);
			const mainSession = ClaudeAgentSession.createProvisional(
				sessionId,
				session,
				URI.parse(buildDefaultChatUri(session)),
				parentSession.workingDirectory,
				parentSession.project,
				parentSession.model,
				parentSession.agent,
				undefined,
				new PendingRequestRegistry<CallToolResult>(),
				parentSession.permissionMode,
				this._metadataStore,
				this._instantiationService,
				parentSession.additionalDirectories,
			);
			return this._seedSessionEntry(sessionId, session, mainSession);
		});
	}

	/**
	 * Build + materialize the peer chat's live {@link ClaudeAgentSession},
	 * resuming its persisted SDK chat when one already exists on disk
	 * (forked or restored chats) or starting fresh otherwise. The caller MUST
	 * hold the per-chat (`chat.toString()`) {@link _sessionSequencer} lock so
	 * concurrent first sends collapse into one materialize and teardown can't
	 * race the build.
	 */
	private async _materializeChatLocked(session: URI, chat: URI, workingDirectories: readonly URI[] | undefined): Promise<ClaudeAgentSession> {
		const chatKey = chat.toString();
		const entry = await this._ensureSessionEntry(session);
		const existing = entry.getPeerChat(chatKey);
		if (existing?.isPipelineReady) {
			return existing;
		}
		const chatSession = existing ?? await this._buildProvisionalChat(session, chat, entry);
		// Resume when the SDK already has a transcript for this chat
		// (forked or restored); otherwise materialize a fresh one.
		const sdkInfo = await this._sdkService.getSessionInfo(chatSession.sessionId);
		const transport = this._ensureAuthenticated(chatSession.provisionalModel);
		const canUseTool = this._makeCanUseTool(chatSession.sessionId);
		const onElicitation = this._makeOnElicitation(chatSession.sessionId);
		try {
			await chatSession.materialize({ transport, canUseTool, onElicitation, isResume: !!sdkInfo, workingDirectories, serverToolHost: this._serverToolHost });
		} catch (err) {
			entry.disposePeerChat(chatKey);
			throw err;
		}
		return chatSession;
	}

	/**
	 * Build a provisional peer-chat {@link ClaudeAgentSession} from its live (or
	 * legacy) backing + overlay: its `sessionUri` is the real parent session URI
	 * and its `chatChannelUri` is the chat's own channel (never overloaded),
	 * backed by the resolved SDK chat id. Registers it on the owning
	 * {@link ClaudeSessionEntry}; the caller materializes it.
	 */
	private async _buildProvisionalChat(session: URI, chat: URI, entry: ClaudeSessionEntry): Promise<ClaudeAgentSession> {
		const info = this._resolveChatBacking(chat);
		if (!info) {
			throw new Error(`[Claude] no backing chat for chat ${chat.toString()}`);
		}
		const parentSession = await this._resolveParentSession(session, AgentSession.id(session));
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(chat);
		} catch (err) {
			this._logService.warn(`[Claude] chat overlay read failed for ${chat.toString()}; continuing with defaults`, err);
		}
		const permissionMode = readClaudePermissionMode(this._configurationService, chat) ?? overlay.permissionMode ?? parentSession.permissionMode;
		// Overlay takes precedence over the backing: `changeModel` always writes
		// the overlay first (via `setModel` or `_metadataStore.write`) and then
		// the backing. If the backing update is lost, the overlay already holds
		// the newest model; preferring it here ensures a model change is never
		// silently reverted after a restart.
		const model = overlay.model ?? info.model;
		const chatSession = ClaudeAgentSession.createProvisional(
			info.sdkSessionId,
			session,
			chat,
			parentSession.workingDirectory,
			parentSession.project,
			model,
			overlay.agent ?? parentSession.agent,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._metadataStore,
			this._instantiationService,
			parentSession.additionalDirectories,
		);
		entry.registerPeerChat(chat.toString(), this._wireEntry(chatSession));
		return chatSession;
	}

	/**
	 * Update a peer chat's live backing model and push the refreshed opaque
	 * `providerData` blob to the orchestrator (via
	 * {@link onDidChangeChatData}) so the durable catalog stays in sync.
	 */
	private async _updateChatBackingModel(chat: URI, model: ModelSelection): Promise<void> {
		const backing = this._resolveChatBacking(chat);
		if (!backing) {
			return;
		}
		const updated: IPersistedChat = { ...backing, model };
		this._chatBackings.set(chat.toString(), updated);
		this._onDidChangeChatData.fire({ chat: chat, providerData: encodeProviderData(updated) });
	}

	/**
	 * Re-attach the in-memory backing for a peer chat on session restore,
	 * decoding the opaque `providerData` the orchestrator persisted at creation
	 * (or the latest {@link onDidChangeChatData}). After this resolves the
	 * chat's backing SDK chat can be resumed lazily on its first send.
	 * Best-effort — a corrupt/unknown blob is logged and dropped rather than
	 * thrown.
	 */
	async materializeChat(chat: URI, providerData: string | undefined): Promise<void> {
		if (isDefaultChatUri(chat)) {
			return;
		}
		const chatInfo = parseChatUri(chat);
		if (!chatInfo) {
			return;
		}
		if (providerData === undefined) {
			return;
		}
		const backing = decodeProviderData(providerData);
		if (!backing) {
			this._logService.warn(`[Claude] materializeChat: dropping corrupt providerData for ${chat.toString()}`);
			return;
		}
		this._chatBackings.set(chat.toString(), backing);
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
		const sess = this._sessions.get(AgentSession.id(session))?.defaultChat;
		return sess?.isPipelineReady ? sess : undefined;
	}

	/**
	 * Reconstruct the full turn history from the SDK's on-disk JSONL transcript.
	 * Provisional sessions return `[]`; transcript failures are logged and return `[]`.
	 */
	async getSessionMessages(session: URI): Promise<readonly Turn[]> {
		// Don't trigger a cold SDK download just to reconstruct a transcript
		// during restore (the renderer subscribes to the last-active session
		// on startup). Mirrors `listSessions` / `getSessionMetadata`: when the
		// SDK isn't local yet, defer with an empty transcript. The download
		// fires (with host-level progress) once the user sends the first
		// message, after which the transcript re-hydrates on the next restore.
		if (!(await this._sdkService.canLoadWithoutDownload())) {
			this._logService.info('[Claude] SDK not downloaded yet; deferring session messages until a session triggers the download');
			return [];
		}
		// Additional peer chat: reconstruct its own SDK chat (resolved
		// from the catalog/in-memory), routed to the chat channel URI. Shares
		// the same fetch+map path as the default chat via `_reconstructTurns`.
		if (isSubagentSession(session)) {
			const parsed = parseSubagentSessionUri(session);
			if (!parsed) {
				return [];
			}
			const parentSessionId = AgentSession.id(parsed.parentSession);
			const parentSession = this._sessions.get(parentSessionId)?.defaultChat;
			const store = new DisposableStore();
			const subagents = parentSession?.subagents ?? store.add(new SubagentRegistry());
			try {
				if (!parentSession) {
					await this._reconstructTurns(parentSessionId, parsed.parentSession, subagents);
				}
				return await getSubagentTranscript(session, subagents, this._sdkService, this._logService, CancellationToken.None);
			} catch (err) {
				this._logService.warn(`[Claude] getSubagentTranscript threw for ${session.toString()}`, err);
				return [];
			} finally {
				store.dispose();
			}
		}

		const chat = parseChatUri(session) ? session : URI.parse(buildDefaultChatUri(session));
		const chatInfo = parseChatUri(chat);
		if (!chatInfo) {
			return [];
		}
		const parentSessionUri = URI.parse(chatInfo.session);
		const sessionId = AgentSession.id(parentSessionUri);
		const context = this._getChatContext(chat);
		if (context.isPeerChat) {
			const sdkId = await this._resolveChatSdkId(parentSessionUri, chat);
			if (!sdkId) {
				return [];
			}
			const turns = await this._reconstructTurns(sdkId, chat, context.target?.subagents);
			const sideChat = this._resolveChatBacking(chat)?.sideChat;
			return stripSideChatContext(turns.slice(sideChat?.inheritedTurnCount ?? 0), sideChat);
		}

		const sess = context.target;
		if (sess && !sess.isPipelineReady) {
			// Provisional session: the SDK chat has never been materialized, so
			// there is no on-disk transcript to read. Logged because an empty
			// transcript is otherwise indistinguishable from a failed read.
			this._logService.info(`[Claude] getSessionMessages: chat ${chat.toString()} is not materialized yet; returning no turns`);
			return [];
		}
		// Default chat: its SDK chat id is the session id.
		return this._reconstructTurns(sessionId, parentSessionUri, sess?.subagents);
	}

	/**
	 * Fetch a chat's SDK transcript ({@link sdkSessionId}) and map it to
	 * protocol {@link Turn}s routed to {@link routingUri} (the session or chat
	 * channel URI). When {@link subagents} is supplied, it is primed from the agentId suffixes the
	 * SDK encoded in Task tool_result blocks. Resilient: any failure warn-logs
	 * and returns `[]` rather than propagating.
	 */
	private async _reconstructTurns(sdkSessionId: string, routingUri: URI, subagents: SubagentRegistry | undefined): Promise<readonly Turn[]> {
		let messages;
		try {
			messages = await this._sdkService.getSessionMessages(sdkSessionId, { includeSystemMessages: true });
		} catch (err) {
			this._logService.warn(`[Claude] getSessionMessages SDK fetch failed for ${sdkSessionId}`, err);
			return [];
		}
		let turns: readonly Turn[];
		try {
			turns = mapSessionMessagesToTurns(messages, routingUri, this._logService);
		} catch (err) {
			// Defensive boundary: a single malformed SDK message must not
			// blow up the entire transcript read.
			this._logService.warn(`[Claude] replay mapper threw for ${sdkSessionId}`, err);
			return [];
		}
		// Always a bug: the SDK handed back a transcript but replay produced
		// nothing, which surfaces to the user as a chat that opens completely
		// empty. Warn so the next report is diagnosable from the log alone.
		if (turns.length === 0 && messages.length > 0) {
			this._logService.warn(`[Claude] replay produced no turns from ${messages.length} transcript message(s) for ${sdkSessionId}; chat will render empty`);
		}
		// A bug in `primeFromTranscript` MUST NOT break an otherwise-successful
		// transcript read.
		try {
			subagents?.primeFromTranscript(turns);
		} catch (err) {
			this._logService.warn(`[Claude] primeFromTranscript threw for ${sdkSessionId}`, err);
		}
		return turns;
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		// Plan section 3.3.2: SDK is the source of truth; we deliberately do
		// NOT filter entries that lack a per-session DB — external Claude Code
		// CLI sessions have no DB and must still surface (Phase-5 exit
		// criterion). The SDK entry supplies the authoritative primary directory;
		// an optional per-session overlay hydrates the additional-directory tail.
		// External sessions without an overlay remain valid single-root entries.
		//
		// `AgentService.listSessions` fans out across all providers via
		// `Promise.all` (agentService.ts:202-204). If our SDK dynamic
		// import fails (corrupt install, missing optional dep) and we let
		// it reject, *every* provider's session list disappears — the
		// sibling Copilot provider gets nuked too. Catch and log instead.
		let sdkEntries: readonly SDKSessionInfo[];
		try {
			// Don't trigger a cold SDK download just to populate the session
			// list at startup. When the SDK isn't local yet, surface an empty
			// list; the download fires (with host-level progress) once the user
			// starts a session, and the next `listSessions` — driven by the
			// renderer's post-turn refresh — returns the full list.
			if (!(await this._sdkService.canLoadWithoutDownload())) {
				this._logService.info('[Claude] SDK not downloaded yet; deferring session list until a session triggers the download');
				return [];
			}
			sdkEntries = await this._sdkService.listSessions();
		} catch (err) {
			this._logService.warn('[Claude] SDK listSessions failed; surfacing empty list', err);
			return [];
		}
		return Promise.all(sdkEntries.map(entry => {
			const meta = this._metadataStore.project(entry);
			return this._withPersistedWorkingDirectories(meta.session, meta);
		}));
	}

	/**
	 * Phase 6.1 / Cycle D4 — per-session lookup. Mirrors
	 * {@link CopilotAgent.getSessionMetadata} but accepts the
	 * external-CLI case: a session that exists on disk via the raw
	 * Anthropic CLI has no per-session DB, so we MUST NOT gate on the
	 * sidecar (the way Copilot's variant does). The SDK is the source
	 * of truth for existence.
	 *
	 * The SDK entry supplies the authoritative primary directory; an optional
	 * per-session overlay hydrates the additional-directory tail. External
	 * sessions without an overlay remain valid single-root entries. Failures in
	 * the SDK lookup propagate (the caller is doing a single targeted fetch and
	 * should learn that the SDK module is broken).
	 */
	async getSessionMetadata(session: URI): Promise<IAgentSessionMetadata | undefined> {
		// Don't trigger a cold SDK download just to hydrate session metadata
		// during restore (the renderer subscribes to the last-active session
		// on startup). Mirrors `listSessions` / `getSessionMessages`: when the
		// SDK isn't local yet, defer. The download fires (with host-level
		// progress) once the user sends the first message, after which the
		// session re-hydrates on the next restore.
		if (!(await this._sdkService.canLoadWithoutDownload())) {
			this._logService.info('[Claude] SDK not downloaded yet; deferring session metadata until a session triggers the download');
			return undefined;
		}
		const sessionId = AgentSession.id(session);
		const sdkInfo = await this._sdkService.getSessionInfo(sessionId);
		if (!sdkInfo) {
			return undefined;
		}
		return this._withPersistedWorkingDirectories(session, this._metadataStore.project(sdkInfo));
	}

	/**
	 * Merge the persisted additional working directories (index 1..N) onto a
	 * projected metadata's `workingDirectories`, keeping the SDK-derived `cwd`
	 * as the authoritative primary. The SDK catalog only stores `cwd`, so the
	 * tail of a multi-root session lives in the per-session overlay. Sessions
	 * without an overlay (external Claude CLI, single-root) are returned as-is.
	 */
	private async _withPersistedWorkingDirectories(session: URI, meta: IAgentSessionMetadata): Promise<IAgentSessionMetadata> {
		const primary = meta.workingDirectories?.[0];
		if (!primary) {
			return meta;
		}
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(session);
		} catch (err) {
			this._logService.warn(`[Claude] overlay read failed while hydrating working directories for ${session.toString()}; using SDK cwd only`, err);
		}
		const tail = overlay.workingDirectories?.slice(1) ?? [];
		if (tail.length === 0) {
			return meta;
		}
		return { ...meta, workingDirectories: [primary, ...tail] };
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
				// Provisional chats (a default or peer whose first send's
				// materialize is in-flight) race on their own abort controller —
				// abort them up front so a queued `sdk.startup()` unwinds
				// promptly rather than running past shutdown until its teardown
				// task dequeues.
				for (const chat of entry.allChatSessions()) {
					if (!chat.isPipelineReady) {
						chat.abortController.abort();
					}
				}
			}

			const sessionIds = [...this._sessions.keys()];
			await Promise.all(sessionIds.map(sessionId =>
				this._disposeSequencer.queue(sessionId, async () => {
					await this._teardownEntry(sessionId);
					this._pruneActiveClientHandles(sessionId);
				})
			));
		})();
	}

	private async _sendMessage(chat: URI, prompt: string, workingDirectories: readonly URI[] | undefined, attachments?: readonly MessageAttachment[], turnId?: string, _senderClientId?: string): Promise<void> {
		// `IAgent.sendMessage` declares `turnId?` but every production caller in
		// `AgentSideEffects` supplies one. Generate a fallback so the
		// session-side `QueuedRequest.turnId: string` invariant holds even if a
		// hypothetical caller forgets it.
		const effectiveTurnId = turnId ?? generateUuid();
		const context = this._getChatContext(chat);

		// Additional peer chat: route to its own chat. Its SDK
		// `session_id` is the chat's chat id, NOT the parent session's.
		// Hold the per-chat lock across BOTH materialize and send (mirroring the
		// default-chat path below) so concurrent sends to the same peer chat
		// serialize and a racing disposeChat/disposeSession (which queue on the
		// same chat key) waits for the in-flight turn instead of disposing the
		// session under it.
		if (context.isPeerChat) {
			return this._sessionSequencer.queue(context.chatKey, async () => {
				const chatSession = await this._materializeChatLocked(context.session, chat, workingDirectories);
				const sideChat = this._resolveChatBacking(chat)?.sideChat;
				const turns = sideChat ? await this._reconstructTurns(chatSession.sessionId, chat, chatSession.subagents) : [];
				const sdkPrompt = prepareSideChatPrompt(prompt, turns, sideChat);
				await chatSession.send(this._buildSdkPrompt(chatSession.sessionId, sdkPrompt, attachments, effectiveTurnId), effectiveTurnId, workingDirectories);
			});
		}

		// Plan section 3.8. The sequencer scope holds across BOTH materialize
		// and `session.send` so two concurrent first-message calls on the
		// same session collapse into one materialize plus two ordered
		// sends. A `disposeSession` racing a first send reaches its own
		// dispose-sequencer eventually but the in-flight materialize
		// completes first.
		return this._sessionSequencer.queue(context.sessionId, async () => {
			const existing = this._getChatContext(chat).target;
			let session: ClaudeAgentSession;
			if (existing?.isPipelineReady) {
				session = existing;
			} else if (existing) {
				session = await this._materializeProvisional(context.sessionId, workingDirectories);
			} else {
				session = await this._resumeSession(context.sessionId, context.session, workingDirectories);
			}

			await session.send(this._buildSdkPrompt(context.sessionId, prompt, attachments, effectiveTurnId), effectiveTurnId, workingDirectories);
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
		// single matching chat is all we need. Silent on miss (workbench may
		// have raced a session dispose).
		for (const sess of this._allLiveSessions()) {
			if (sess.respondToPermissionRequest(requestId, approved)) {
				return;
			}
		}
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void {
		// `requestId` is the SDK's `tool_use_id` (interactive tools reuse it as
		// the {@link ChatInputRequest.id}); globally unique, so a single
		// matching chat is all we need. Silent on miss for the same reasons as
		// {@link respondToPermissionRequest}.
		for (const sess of this._allLiveSessions()) {
			if (sess.respondToUserInputRequest(requestId, response, answers)) {
				return;
			}
		}
	}

	/** Every live chat — each session's default chat and its peers. */
	private _allLiveSessions(): ClaudeAgentSession[] {
		const all: ClaudeAgentSession[] = [];
		for (const entry of this._sessions.values()) {
			all.push(...entry.allChatSessions());
		}
		return all;
	}

	private async _abortSession(chat: URI): Promise<void> {
		// Phase 9 D1: cancel via the abort controller, NOT `Query.interrupt()`.
		// Abort is a control-plane operation — it must NOT serialize
		// through `_sessionSequencer` because an in-flight `sendMessage`
		// task is parked on its turn deferred and would deadlock the abort
		// behind the very turn it's trying to cancel. Calling
		// `chat.abort()` directly rejects the in-flight deferred,
		// which lets the queued sendMessage task complete and frees the
		// sequencer for the next caller.
		const sess = this._getChatContext(chat).target;
		if (!sess) {
			return;
		}
		if (!sess.isPipelineReady) {
			sess.abortController.abort();
			return;
		}
		sess.abort();
	}

	setPendingMessages(chat: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// Phase 9 D5: queued messages are intentionally a no-op. CONTEXT.md
		// M10 + AgentSideEffects confirm queued messages are consumed
		// server-side; the agent boundary always receives an empty queue.
		//
		// Steering targets the chat that owns the in-flight turn — the caller
		// always addresses a concrete chat channel (the session's default chat
		// or an additional peer chat).
		const context = this._getChatContext(chat);
		this._logService.info(`[Claude] setPendingMessages for ${chat.toString()}: steering=${steeringMessage?.id ?? 'none'} queued=${_queuedMessages.length}`);
		if (!context.target) {
			this._logService.warn(`[Claude] setPendingMessages: chat not found for ${chat.toString()}`);
			return;
		}
		if (steeringMessage) {
			context.target.injectSteering(steeringMessage);
		}
	}

	/**
	 * Forward a user/picker `permissionMode` change to the running SDK so it
	 * applies to the next tool this turn, not only from the next `send()`
	 * (issue #321691). Only fires for client-originated changes (the host routes
	 * internal server writes elsewhere), so this can forward without re-entering
	 * a `canUseTool` callback.
	 *
	 * `permissionMode` is a **session-scoped** config value today (AHP has no
	 * per-chat config), so — matching Copilot's session-scoped approvals — we
	 * apply it to EVERY materialized chat's `Query` in the session, not just the
	 * one the change arrived on. A `replace` that deletes the key resolves to the
	 * chat's `permissionModeFallback`, the same value the next `send()` would
	 * apply, so live state mirrors the reducer. Provisional chats are skipped —
	 * their first `send()` seeds the mode into `Options.permissionMode`. Fire-and-
	 * forget: the SDK control round-trip isn't awaited here; the pipeline caches
	 * the mode so a later rebind / send re-applies it.
	 *
	 * TODO: adopt per-chat config when the protocol allows for such — see
	 * https://github.com/microsoft/agent-host-protocol/issues/335 — so a picker
	 * change scopes to its own chat instead of the whole session.
	 */
	onSessionConfigChanged(session: URI, values: Record<string, unknown>): void {
		const entry = this._sessions.get(this._getChatContext(session).sessionId);
		if (!entry) {
			return;
		}
		const narrowed = narrowClaudePermissionMode(values[ClaudeSessionConfigKey.PermissionMode]);
		for (const chat of entry.allChatSessions()) {
			if (!chat.isPipelineReady) {
				continue;
			}
			const mode = narrowed ?? chat.permissionModeFallback;
			chat.setPermissionMode(mode).catch(err => {
				this._logService.warn(`[Claude:${chat.sessionId}] mid-turn setPermissionMode(${mode}) failed`, err);
			});
		}
	}

	private async _changeModel(chat: URI, model: ModelSelection): Promise<void> {
		const context = this._getChatContext(chat);
		const queueKey = context.isPeerChat ? context.chatKey : context.sessionId;
		await this._sessionSequencer.queue(queueKey, async () => {
			const current = this._getChatContext(chat);
			const sess = current.target;
			if (sess) {
				await sess.setModel(model);
			} else if (current.isPeerChat) {
				await this._metadataStore.write(chat, { model });
			} else {
				await this._metadataStore.write(current.session, { model });
			}
			if (current.isPeerChat) {
				await this._updateChatBackingModel(chat, model);
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
	 * peer chat, the change targets that chat's chat.
	 */
	private async _changeAgent(chat: URI, agent: AgentSelection | undefined): Promise<void> {
		const context = this._getChatContext(chat);
		const queueKey = context.isPeerChat ? context.chatKey : context.sessionId;
		await this._sessionSequencer.queue(queueKey, async () => {
			const current = this._getChatContext(chat);
			const sess = current.target;
			if (sess) {
				await sess.setAgent(agent);
			} else {
				await this._metadataStore.write(current.isPeerChat ? chat : current.session, { agent: agent ?? null });
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
		entry?.defaultChat?.completeClientToolCall(toolCallId, result);
	}

	async syncClientCustomizations(session: URI, clientId: string, customizations: ClientPluginCustomization[], options?: { readonly quiet?: boolean }): Promise<ISyncedCustomization[]> {
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
				options?.quiet ? undefined : status => this._fireCustomizationUpdated(session, { customization: status }),
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

	async startMcpServer(session: URI, id: string): Promise<void> {
		const sess = this._findAnySession(AgentSession.id(session));
		await sess?.startMcpServer(id);
	}

	async stopMcpServer(session: URI, id: string): Promise<void> {
		const sess = this._findAnySession(AgentSession.id(session));
		await sess?.stopMcpServer(id);
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
			for (const chat of entry.allChatSessions()) {
				if (!chat.isPipelineReady) {
					chat.abortController.abort();
				}
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
 * Per-session container. Owns the session's default (main) chat and any
 * additional peer chats — each a {@link ClaudeAgentSession} plus the
 * event-forwarding subscriptions registered against it (e.g. the agent's
 * forward subscription to the session's `onDidSessionProgress` event). A single
 * {@link ClaudeAgent._sessions} map of these entries keeps all chats of a
 * session together (no parallel maps), so dispatch resolves a chat by looking
 * up its owning session and then the chat within it. Disposing the entry
 * disposes the session AND every extra registered via
 * {@link AgentSessionEntry.addDisposable}.
 */
class ClaudeSessionEntry extends AgentSessionEntry<ClaudeAgentSession> {
	/** Claude sessions always have a materialized default chat once seeded. */
	override get defaultChat(): ClaudeAgentSession {
		return super.defaultChat!;
	}
}
