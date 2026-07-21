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
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { decodeProviderData, encodeProviderData, type IPersistedChat } from '../agentChatBackings.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel } from '../../common/claudeModelConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, CLAUDE_AGENT_PROVIDER_ID, IActiveClient, IAgent, IAgentChatContext, IAgentChatDataChange, IAgentChats, IAgentCreateChatForkSource, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo, IAgentSpawnChatEvent, SubagentChatSignal, resolveAgentChatContext } from '../../common/agentService.js';
import { ensureWorkspacelessScratchDir } from '../workspacelessScratchDir.js';
import { ActionType, AuthRequiredReason, type AuthRequiredParams } from '../../common/state/sessionActions.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { PolicyState, ProtectedResourceMetadata, type AgentSelection, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { isSubagentSession, parseSubagentSessionUri, ChatInputResponseKind, type ClientPluginCustomization, type Customization, type MessageAttachment, type PendingMessage, type ChatInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
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
import { handleElicitation } from './claudeElicitationBridge.js';
import type { IAgentServerToolHost } from '../../common/agentServerTools.js';
import { createPricingMetaFromBilling, normalizeCAPIBilling } from '../../common/agentModelPricing.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import { IClaudeProxyHandle, IClaudeProxyService, type ClaudeTransport } from './claudeProxyService.js';
import { readClaudePermissionMode } from './claudeSessionPermissionMode.js';
import { ClaudeSessionMetadataStore, IClaudeSessionOverlay } from './claudeSessionMetadataStore.js';

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
 * The host-supplied binding for exactly one concrete chat channel URI:
 * the live SDK conversation it addresses plus any provider-owned overlay
 * data that must round-trip through AH's opaque `providerData`. Every chat
 * the host binds gets exactly this record; it deliberately does not retain
 * its AH parent session, storage scope, or membership role.
 */
interface IClaudeChatBinding {
	/** The SDK conversation this chat addresses. */
	readonly sdkSessionId: string;
	/** Model override recorded at creation or by a later {@link IAgentChats.changeModel}. */
	readonly model?: ModelSelection;
}

interface IResolvedClaudeChatContext {
	readonly session: URI;
	readonly sessionId: string;
	readonly resource: URI;
	readonly chat: URI;
	readonly chatKey: string;
	readonly sdkSessionId: string | undefined;
	readonly sequencerKey: string;
	readonly target: ClaudeAgentSession | undefined;
}

/**
 * Projects a binding down to the opaque {@link IPersistedChat} shape the
 * orchestrator persists verbatim in its chat catalog — the wire format is
 * unchanged; only `sdkSessionId`/`model` ever travel in it.
 */
function _toPersistedChat(binding: IClaudeChatBinding): IPersistedChat {
	return { sdkSessionId: binding.sdkSessionId, ...(binding.model ? { model: binding.model } : {}) };
}

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
	 * Owns every live SDK conversation (bound or not yet bound), keyed by SDK
	 * session id. This is the single disposable owner of chat leaves and the
	 * reverse index used by SDK-originated callbacks.
	 */
	private readonly _chatEntriesBySdkId = this._register(new DisposableMap<string, ClaudeChatEntry>());

	/**
	 * Maps each host-supplied concrete chat URI to its {@link IClaudeChatBinding}.
	 * Default-chat vs additional-chat routing is derived from the exact chat URI
	 * itself (shared AHP semantics), never from provider-private optional fields.
	 * This is the single, consolidated `chatUri → binding` mapping — routing reads
	 * its concrete fields directly and encodes no membership kind.
	 */
	private readonly _chatBindings = new Map<string, IClaudeChatBinding>();

	/**
	 * Fires when a concrete chat binding's opaque `providerData` changes after creation
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

	private _findAnySession(sessionId: string): ClaudeAgentSession | undefined {
		return this._chatEntriesBySdkId.get(sessionId)?.chatSession;
	}

	private _isUnboundSession(sessionId: string): boolean {
		const session = this._findAnySession(sessionId);
		return !!session && !this._chatBindings.has(session.chatChannelUri.toString());
	}

	private _findChatByUri(chat: URI | string): ClaudeAgentSession | undefined {
		const sdkSessionId = this._chatBindings.get(typeof chat === 'string' ? chat : chat.toString())?.sdkSessionId;
		return sdkSessionId ? this._findAnySession(sdkSessionId) : undefined;
	}

	private _findChat(session: URI, chat: URI | undefined): ClaudeAgentSession | undefined {
		return chat ? this._resolveChatContext(chat, session).target : this._findAnySession(AgentSession.id(session));
	}

	/**
	 * Finds a live session whose exact chat URI has not been host-bound yet.
	 * Direct `createSession` compatibility reaches that SDK conversation through
	 * its bare session URI until AH binds a concrete chat URI.
	 */
	private _findLiveSessionForChat(sessionId: string, chatKey: string): ClaudeAgentSession | undefined {
		for (const entry of this._chatEntriesBySdkId.values()) {
			const candidate = entry.chatSession;
			if (this._chatBindings.has(candidate.chatChannelUri.toString())) {
				continue; // already bound to a concrete chat — reachable via the binding lookup instead.
			}
			if (chatKey === candidate.chatChannelUri.toString() || candidate.sessionId === sessionId) {
				return candidate;
			}
		}
		return undefined;
	}

	/**
	 * Resolves a host-addressed chat operation against the exact chat URI it was
	 * addressed to. AH may additionally supply transient `{ session, resource }`
	 * context for operations that need the owning session or persistence scope.
	 * Without that context, resolution falls back only to already-live state or
	 * the exact chat binding — never to URI-shape parsing.
	 */
	private _resolveChatContext(chat: URI, sessionOrContext?: URI | IAgentChatContext): IResolvedClaudeChatContext {
		const explicit = sessionOrContext ? resolveAgentChatContext(sessionOrContext, chat) : undefined;
		const chatKey = chat.toString();
		const binding = this._chatBindings.get(chatKey);
		const boundTarget = binding ? this._findAnySession(binding.sdkSessionId) : undefined;
		const session = explicit?.session
			?? boundTarget?.sessionUri
			?? (binding ? AgentSession.uri(this.id, binding.sdkSessionId) : chat);
		const sessionId = AgentSession.id(session);
		const sessionAddressedTarget = !binding && chatKey === session.toString()
			? this._findAnySession(sessionId)
			: undefined;
		const target = binding
			? boundTarget
			: sessionAddressedTarget ?? this._findLiveSessionForChat(sessionId, chatKey);
		const sdkSessionId = binding?.sdkSessionId ?? target?.sessionId;
		return {
			session,
			sessionId,
			resource: explicit?.resource ?? session,
			chat,
			chatKey,
			sdkSessionId,
			sequencerKey: sdkSessionId ?? chatKey,
			target,
		};
	}

	private _findSessionBySdkId(sdkSessionId: string): ClaudeAgentSession | undefined {
		return this._findAnySession(sdkSessionId);
	}

	/** Wrap a { ClaudeAgentSession} in a chat-leaf entry and forward its events. */
	private _wireEntry(session: ClaudeAgentSession): ClaudeChatEntry {
		const entry = new ClaudeChatEntry(session);
		entry.addDisposable(session.onDidSessionProgress(signal => {
			this._onDidSessionProgress.fire(signal);
			this._emitSpawnedChatEvents(signal);
		}));
		entry.addDisposable(session.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
		return entry;
	}

	private _registerLiveChat(chat: URI, session: ClaudeAgentSession): void {
		const current = this._chatBindings.get(chat.toString());
		this._deleteLiveChat(chat.toString());
		this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
		this._chatEntriesBySdkId.set(session.sessionId, this._wireEntry(session));
		this._chatBindings.set(chat.toString(), { sdkSessionId: session.sessionId, ...(current?.model ? { model: current.model } : {}) });
	}

	/** Register an SDK conversation AH has bound to a concrete chat URI. */
	private _registerSessionChat(chat: URI, session: ClaudeAgentSession): void {
		this._registerLiveChat(chat, session);
	}

	private _registerUnboundSession(session: ClaudeAgentSession): void {
		this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
		this._chatEntriesBySdkId.set(session.sessionId, this._wireEntry(session));
	}

	/** Bind an unaddressed SDK conversation to the host-supplied chat URI. */
	private _bindSessionChat(sessionId: string, chat: URI): ClaudeAgentSession | undefined {
		const existingBinding = this._chatBindings.get(chat.toString());
		if (existingBinding) {
			const existing = this._findAnySession(existingBinding.sdkSessionId);
			if (existing) {
				this._chatBindings.set(chat.toString(), { sdkSessionId: existing.sessionId });
			}
			return existing;
		}
		const entry = this._chatEntriesBySdkId.get(sessionId);
		if (!entry) {
			return undefined;
		}
		entry.chatSession.bindChatChannel(chat);
		this._chatBindings.set(chat.toString(), { sdkSessionId: sessionId });
		return entry.chatSession;
	}

	private _deleteLiveChat(chatKey: string): void {
		const binding = this._chatBindings.get(chatKey);
		if (binding?.sdkSessionId) {
			this._chatEntriesBySdkId.deleteAndDispose(binding.sdkSessionId);
		}
	}

	/**
	 * Tear down a chat's live entry only. Every caller that means to also
	 * forget the chat's binding (a true dispose, not a release/teardown that
	 * must resume later) does so explicitly — e.g. {@link _disposeChat}.
	 * Never touching `_chatBindings` here keeps release/cold-resume uniform
	 * for every concrete chat binding, since this operation does not encode
	 * provider-specific persistence classes.
	 */
	private _deleteSession(session: ClaudeAgentSession): void {
		this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
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
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
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
				// Flipping into proxy makes GitHub Copilot auth newly required.
				// If no proxy handle was ever established, proactively ask the
				// client to authenticate rather than waiting for the next command
				// to fail with `AHP_AUTH_REQUIRED`. A handle persists across a
				// proxy→native→proxy round-trip (cleared only on dispose), so this
				// fires only when a credential is genuinely missing.
				if (next === 'proxy' && !this._proxyHandle) {
					this._onDidRequireAuth.fire({
						resource: this._gitHubEndpointService.getCopilotResource().resource,
						reason: AuthRequiredReason.Required,
					});
				}
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
			capabilities: { multipleChats: { fork: true } },
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		// Native (BYO-Anthropic) mode needs no GitHub Copilot auth — the SDK owns
		// the Anthropic credential — so the required Copilot resource is dropped.
		// The optional repo resource is kept for git operations either way.
		if (this._transportMode !== 'proxy') {
			return [this._gitHubEndpointService.getRepoResource()];
		}
		return [
			this._gitHubEndpointService.getCopilotResource(),
			this._gitHubEndpointService.getRepoResource(),
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
		if (resource === this._gitHubEndpointService.getRepoResource().resource) {
			return true;
		}
		if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
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
		if (!tokenChanged && this._proxyHandle) {
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

	createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
		return this._createSession(config, { kind: 'unbound' });
	}

	private async _createSession(
		config: IAgentCreateSessionConfig,
		target: { readonly kind: 'unbound' } | { readonly kind: 'chat'; readonly chat: URI },
	): Promise<IAgentCreateSessionResult> {
		const chat = target.kind === 'chat' ? target.chat : undefined;
		this._ensureAuthenticated();
		if (config.fork) {
			return this._forkSession(config, config.fork);
		}
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);

		let existing = this._findAnySession(sessionId);
		if (existing) {
			if (chat && this._isUnboundSession(sessionId)) {
				existing = this._bindSessionChat(sessionId, chat) ?? existing;
			}
			// Re-apply the eager active client on reconnect: AgentService reissues
			// `createSession` for an existing URI, so the reconnected client's
			// tools/customizations must still reach Claude (mirrors Copilot).
			await this._seedEagerActiveClient(sessionUri, config.activeClient);
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

		// A workspace-less session (no `workingDirectory` supplied, and not a
		// fork) runs in a stable per-session scratch dir shared with the Copilot
		// agent; without a cwd Claude throws at materialize. The workspace-less
		// marker itself is owned/persisted centrally by the AH service.
		const workingDirectory = config.workingDirectory ?? await ensureWorkspacelessScratchDir(this._environmentService.userHome, sessionId);

		// Only probe for a project when the caller supplied a real folder; a
		// scratch dir is never a code project.
		const project = config.workingDirectory
			? await projectFromCopilotContext({ cwd: config.workingDirectory.fsPath }, this._gitService)
			: undefined;

		const permissionMode = this._resolvePermissionMode(config.config);

		const chatChannel = chat ?? sessionUri;
		// The storage-scoped chat's per-chat resources are scoped to the SESSION URI —
		// preserving the existing on-disk keying (DB / overlay / config).
		const session = ClaudeAgentSession.createProvisional(
			sessionId,
			sessionUri,
			chatChannel,
			workingDirectory,
			project,
			config.model,
			config.agent,
			config.config,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._instantiationService,
		);
		if (chat) {
			this._registerSessionChat(chat, session);
		} else {
			this._registerUnboundSession(session);
		}
		await this._seedEagerActiveClient(sessionUri, config.activeClient);

		return {
			session: sessionUri,
			workingDirectory,
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
	async truncateSession(session: URI, turnId?: string, chat?: URI): Promise<void> {
		const addressedChat = chat ?? this._findAnySession(AgentSession.id(session))?.chatChannelUri ?? session;
		const initialContext = this._resolveChatContext(addressedChat, session);
		await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
			const context = this._resolveChatContext(addressedChat, session);
			const existing = context.target;
			const sdkSessionId = context.sdkSessionId ?? await this._resolveChatSdkId(context);
			if (!sdkSessionId) {
				throw new Error(`Cannot truncate chat ${addressedChat.toString()}: backing SDK session not found`);
			}
			const usesSessionBacking = sdkSessionId === context.sessionId;
			if (existing && !existing.isPipelineReady) {
				this._logService.info(`[Claude:${sdkSessionId}] truncateSession on a provisional session — nothing to truncate`);
				return;
			}

			if (turnId === undefined) {
				await (usesSessionBacking
					? this._removeAllTurns(context.session, context.chat, context.resource, sdkSessionId, existing)
					: this._removeAllAdditionalChatTurns(context.session, context.chat, context.resource, sdkSessionId, existing));
				return;
			}

			const messages = await this._sdkService.getSessionMessages(sdkSessionId, { includeSystemMessages: true });
			const anchor = resolveForkAnchorUuid(messages, turnId);
			if (anchor === undefined) {
				throw new Error(`Cannot truncate session ${sdkSessionId}: turn ${turnId} not found in transcript`);
			}

			// Operate on a live session; cold-resume an unloaded one first so
			// there is a single code path that sets the anchor on a live
			// pipeline (the next send applies it).
			const live = existing ?? await this._ensureResolvedChatSession(context);
			await live.truncateToTurn(turnId, anchor, context.resource);
			this._logService.info(`[Claude:${sdkSessionId}] truncateSession kept [0..${turnId}] (anchor=${anchor})`);
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
	private async _removeAllTurns(session: URI, chat: URI, resource: URI, sessionId: string, existing: ClaudeAgentSession | undefined): Promise<void> {
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
		if (existing) {
			this._deleteSession(existing);
		}
		await this._sdkService.deleteSession(sessionId);

		await this._createSession({
			session,
			workingDirectory,
			...(overlay.model ? { model: overlay.model } : {}),
			...(overlay.agent ? { agent: overlay.agent } : {}),
			...(overlay.permissionMode ? { config: { [ClaudeSessionConfigKey.PermissionMode]: overlay.permissionMode } } : {}),
		}, { kind: 'chat', chat });
		// Re-fetch (not reuse `existing`): `existing` is the OLD session, already
		// torn down by `deleteAndDispose` above, and is `undefined` entirely on
		// the cold path. `createSession` registered a fresh instance under the
		// same id — prune through that live session so a single path covers both
		// warm and cold remove-all.
		await this._findAnySession(sessionId)?.pruneAllTurns(resource);
		this._logService.info(`[Claude:${sessionId}] truncateSession removed all turns (deleteSession + fresh same-id)`);
	}

	private async _removeAllAdditionalChatTurns(session: URI, chat: URI, resource: URI, sdkSessionId: string, existing: ClaudeAgentSession | undefined): Promise<void> {
		await existing?.shutdownLiveQuery();
		if (existing) {
			this._deleteSession(existing);
		}
		await this._sdkService.deleteSession(sdkSessionId);
		const fresh = await this._buildProvisionalChat(session, chat, resource);
		await fresh.pruneAllTurns(resource);
		this._logService.info(`[Claude:${sdkSessionId}] truncateSession removed all turns (deleteSession + fresh same-id)`);
	}

	// ---- Chat surface ------------------------------------------------------
	//
	// `chats` exposes the per-chat operations addressed by a single, concrete
	// chat channel URI. Every chat's SDK id comes from the host-bound
	// provider data ({@link _chatBindings}); AH supplies any transient
	// operation context required to materialize that SDK conversation.

	/**
	 * The chat-addressed operation surface
	 * ({@link IAgentChats}). Every method addresses a chat by a single,
	 * already-resolved chat URI; `createChat`/`fork` additionally receive
	 * transient host context from AH (see
	 * {@link IAgentChats.createChat}) — this maps to the `(session, chat)`
	 * pair the agent's internal SDK storage is keyed by (via
	 * {@link _resolveChatContext}).
	 */
	readonly chats: IAgentChats = {
		createChat: (chat, context, options) => {
			return this._createChat(chat, resolveAgentChatContext(context, chat), options);
		},
		fork: (chat, context, source: IAgentCreateChatForkSource, options?: IAgentCreateChatOptions) =>
			this._createChat(chat, resolveAgentChatContext(context, chat), { ...options, fork: source }),
		bindSessionChat: (chat, context) => this._bindSessionChatOnRestore(chat, resolveAgentChatContext(context, chat).session),
		disposeChat: chat => this._disposeChat(chat),
		releaseChat: chat => this._releaseChat(chat),
		sendMessage: (chatUri, prompt, workingDirectory, attachments, turnId, senderClientId, context) => {
			return this._sendMessage(chatUri, prompt, workingDirectory, attachments, turnId, senderClientId, context);
		},
		abort: chatUri => {
			return this._abortSession(chatUri);
		},
		changeModel: (chatUri, model, context) => {
			return this._changeModel(chatUri, model, context);
		},
		changeAgent: (chatUri, agent, context) => {
			return this._changeAgent(chatUri, agent, context);
		},
		getMessages: (chat, context) => this._getChatMessages(chat, context),
	};

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
	 * resolver searches every live SDK conversation by SDK id so one
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
	 * {@link _makeCanUseTool}: resolves the session by SDK id (all live
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
	private async _materializeProvisional(sessionId: string, workingDirectory?: URI): Promise<ClaudeAgentSession> {
		const session = this._findAnySession(sessionId);
		if (!session) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const transport = this._ensureAuthenticated();
		const resource = session.sessionUri;

		const canUseTool = this._makeCanUseTool(sessionId);
		const onElicitation = this._makeOnElicitation(sessionId);
		try {
			await session.materialize({ transport, canUseTool, onElicitation, isResume: false, resource, workingDirectory, serverToolHost: this._serverToolHost });
			await this._persistSessionOverlay(resource, session, transport.kind);
			if (session.abortController.signal.aborted) {
				throw new CancellationError();
			}
		} catch (err) {
			this._deleteSession(session);
			throw err;
		}

		this._onDidMaterializeSession.fire({
			session: session.sessionUri,
			workingDirectory: session.workingDirectory,
			project: session.project,
		});

		return session;
	}

	private async _persistSessionOverlay(resource: URI, session: ClaudeAgentSession, transportKind: ClaudeTransport['kind']): Promise<void> {
		try {
			await this._metadataStore.write(resource, {
				customizationDirectory: session.workingDirectory,
				model: session.provisionalModel,
				permissionMode: readClaudePermissionMode(this._configurationService, resource) ?? session.permissionModeFallback,
				transport: transportKind,
				...(session.provisionalAgent ? { agent: session.provisionalAgent } : {}),
			});
		} catch (err) {
			this._logService.error(`[Claude] Failed to persist customization directory; aborting materialize`, err);
			throw err;
		}
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
	private async _resumeSession(sessionId: string, sessionUri: URI, chatChannel: URI, resource: URI): Promise<ClaudeAgentSession> {
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
			overlay = await this._metadataStore.read(resource);
		} catch (err) {
			this._logService.warn(`[Claude:${sessionId}] overlay read failed during resume; continuing with defaults`, err);
		}
		const permissionMode = readClaudePermissionMode(this._configurationService, resource)
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
			chatChannel,
			workingDirectory,
			project,
			overlay.model,
			overlay.agent,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._instantiationService,
		);
		// `_resumeSession` rebuilds the primary chat: its storage scope is the
		// session URI and it registers as the session's storage-scoped chat binding.
		this._registerSessionChat(chatChannel, session);

		const canUseTool = this._makeCanUseTool(sessionId);
		const onElicitation = this._makeOnElicitation(sessionId);
		try {
			await session.materialize({ transport, canUseTool, onElicitation, isResume: true, resource, serverToolHost: this._serverToolHost });
		} catch (err) {
			this._deleteSession(session);
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
		const sessionId = AgentSession.id(session);
		return this._disposeSequencer.queue(sessionId, async () => {
			const target = this._findAnySession(sessionId);
			if (target) {
				await this._disposeLiveSession(target);
			}
			this._pruneActiveClientHandles(sessionId);
		});
	}

	releaseSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		return this._disposeSequencer.queue(sessionId, async () => {
			const target = this._findAnySession(sessionId);
			if (!target || !target.isPipelineReady || target.hasActiveTurn) {
				return;
			}
			this._logService.info(`[Claude:${sessionId}] Releasing idle session from memory (durable state preserved)`);
			await this._disposeLiveSession(target);
			this._pruneActiveClientHandles(sessionId);
		});
	}

	private async _disposeLiveSession(session: ClaudeAgentSession): Promise<void> {
		session.abortController.abort();
		if (!session.isPipelineReady) {
			// Nothing else to tear down yet.
		} else {
			session.abort();
		}
		this._deleteSession(session);
	}

	// #region Concrete chat bindings

	/**
	 * Create a concrete chat binding using the host-supplied context `session`.
	 * its own SDK chat (a fresh one, or a fork of the source chat at a turn)
	 * that shares the session's working directory and inherited model / agent
	 * / permission-mode. The binding is recorded in {@link _chatBindings} and
	 * returned as an opaque `providerData` blob for the orchestrator to
	 * persist; the chat's metadata overlay is seeded so a later lazy resume
	 * inherits the session's settings. The live {@link ClaudeAgentSession} is
	 * built lazily on the chat's first send (mirroring how the session's own
	 * conversation materializes lazily).
	 */
	private async _createChat(chat: URI, context: IAgentChatContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult | void> {
		this._ensureAuthenticated();
		const chatKey = chat.toString();
		const parentSessionId = AgentSession.id(context.session);
		let result: IAgentCreateChatResult | undefined;
		await this._sessionSequencer.queue(parentSessionId, async () => {
			const existing = this._chatBindings.get(chatKey);
			if (existing) {
				// Idempotent re-create: hand back the existing binding so the
				// orchestrator re-persists a consistent blob.
				result = { providerData: encodeProviderData(_toPersistedChat(existing)), backingSession: AgentSession.uri(this.id, existing.sdkSessionId) };
				return;
			}
			// Model/agent arrive via the client (model) and the draft path
			// (agent) — never read back from the parent session. The permission
			// mode is inherited from the orchestrator-supplied config.
			const model = options?.model;

			let sdkSessionId: string | undefined;
			if (options?.fork) {
				// If the fork point can't be resolved, fall through to a fresh
				// chat rather than inheriting the whole source backend.
				sdkSessionId = await this._forkChat(context.session, options.fork);
			}
			sdkSessionId ??= generateUuid();

			// Record the binding and hand the opaque blob back to the
			// orchestrator to persist.
			const binding: IClaudeChatBinding = { sdkSessionId, ...(model ? { model } : {}) };
			this._chatBindings.set(chatKey, binding);
			result = { providerData: encodeProviderData(_toPersistedChat(binding)), backingSession: AgentSession.uri(this.id, sdkSessionId) };

			// Seed the chat's own metadata overlay so a later lazy resume (this
			// process or a restart) inherits the session's permission mode.
			const permissionMode = narrowClaudePermissionMode(options?.inheritedContext?.config?.[ClaudeSessionConfigKey.PermissionMode]);
			await this._metadataStore.write(context.resource, {
				...(model ? { model } : {}),
				...(permissionMode ? { permissionMode } : {}),
			});
			this._logService.info(`[Claude] Created chat binding ${chat.toString()} for context ${context.session.toString()}${options?.fork ? ' (forked)' : ''}`);
		});
		return result;
	}

	/**
	 * Bind a session's storage-scoped chat on restore (host-driven, before any
	 * operation). Records the chat binding so cold-path resolution
	 * (resume-on-send / history load) treats it uniformly, and adopts any
	 * pending direct-create leaf. Lazy: the live SDK query materializes on the
	 * chat's first send, exactly like any other chat's {@link materializeChat}.
	 */
	private async _bindSessionChatOnRestore(chat: URI, session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		this._bindSessionChat(sessionId, chat);
		if (!this._chatBindings.has(chat.toString())) {
			// No live/unbound leaf yet (the common restart case): record the
			// binding so the chat resolves without a live entry until its
			// first send resumes it.
			this._chatBindings.set(chat.toString(), { sdkSessionId: sessionId });
		}
	}

	/**
	 * Dispose exactly one chat, tearing down its live SDK session (if any) and
	 * dropping its binding.
	 *
	 * Routed through {@link _sessionSequencer} (keyed on the chat's SDK id) so
	 * it waits for any in-flight {@link _materializeChatLocked} or
	 * {@link sendMessage} to finish before tearing down — prevents
	 * use-after-dispose if a send is concurrently in progress. The durable
	 * chat catalog is owned by the orchestrator now, so this only drops the
	 * live backing and binding.
	 */
	private async _disposeChat(chat: URI): Promise<void> {
		const chatKey = chat.toString();
		const initialContext = this._resolveChatContext(chat);
		await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
			const target = this._resolveChatContext(chat).target;
			if (target) {
				await this._disposeLiveSession(target);
				if (target.sessionId === initialContext.sessionId) {
					this._pruneActiveClientHandles(target.sessionId);
				}
			}
			this._chatBindings.delete(chatKey);
		});
		// The Claude SDK exposes no delete-chat RPC, so the forked /
		// fresh transcript is left on disk; without a catalog entry it is never
		// resumed again.
	}

	private async _releaseChat(chat: URI): Promise<void> {
		const chatKey = chat.toString();
		const initialContext = this._resolveChatContext(chat);
		await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
			const target = this._findChatByUri(chatKey);
			if (!target || !target.isPipelineReady || target.hasActiveTurn) {
				return;
			}
			this._logService.info(`[Claude:${target.sessionId}] Releasing idle chat from memory (durable state preserved)`);
			await this._disposeLiveSession(target);
			if (target.sessionId === initialContext.sessionId) {
				this._pruneActiveClientHandles(target.sessionId);
			}
			// NB: `_chatBindings` retains the binding across release so the chat
			// resolves uniformly on the next cold resume-on-send.
		});
	}

	/**
	 * Resolve the inherited session settings (working directory, project, model, agent,
	 * permission mode) a new or resumed concrete chat binding copies from its
	 * session. Prefers the live in-memory parent; falls back to the SDK's
	 * on-disk session record + metadata overlay for an unloaded parent.
	 */
	private async _resolveParentSession(session: URI, parentSessionId: string): Promise<{ workingDirectory: URI; project: IAgentSessionProjectInfo | undefined; model: ModelSelection | undefined; agent: AgentSelection | undefined; permissionMode: ClaudePermissionMode }> {
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
	 * Fork the source chat's SDK chat at the requested turn into a new
	 * chat and return its SDK session id. Returns `undefined` (so the
	 * caller creates a fresh chat instead) when the source chat or the
	 * fork anchor cannot be resolved.
	 */
	private async _forkChat(session: URI, fork: IAgentCreateChatOptions['fork'] & {}): Promise<string | undefined> {
		const sourceSdkId = await this._resolveChatSdkId(this._resolveChatContext(fork.source, session));
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
		return sessionId;
	}

	/**
	 * Resolve the SDK chat id backing a chat URI — from its host-supplied
	 * binding or a live direct-create session. Never recovers ownership by
	 * parsing the chat URI.
	 */
	private async _resolveChatSdkId(context: IResolvedClaudeChatContext): Promise<string | undefined> {
		return context.sdkSessionId
			?? (context.chat.toString() === context.session.toString() ? context.sessionId : undefined);
	}

	/**
	 * Build + materialize a concrete chat binding's live {@link ClaudeAgentSession},
	 * resuming its persisted SDK chat when one already exists on disk
	 * (forked or restored chats) or starting fresh otherwise. The caller MUST
	 * hold the per-chat (`chat.toString()`) {@link _sessionSequencer} lock so
	 * concurrent first sends collapse into one materialize and teardown can't
	 * race the build.
	 */
	private async _materializeChatLocked(context: IResolvedClaudeChatContext): Promise<ClaudeAgentSession> {
		const { session, chat, chatKey, resource } = context;
		const existing = this._findChatByUri(chatKey);
		if (existing?.isPipelineReady) {
			return existing;
		}
		const chatSession = existing ?? await this._buildProvisionalChat(session, chat, resource);
		// Resume when the SDK already has a transcript for this chat
		// (forked or restored); otherwise materialize a fresh one.
		const sdkInfo = await this._sdkService.getSessionInfo(chatSession.sessionId);
		const transport = this._ensureAuthenticated();
		const canUseTool = this._makeCanUseTool(chatSession.sessionId);
		const onElicitation = this._makeOnElicitation(chatSession.sessionId);
		try {
			await chatSession.materialize({ transport, canUseTool, onElicitation, isResume: !!sdkInfo, resource, serverToolHost: this._serverToolHost });
			if (!sdkInfo) {
				await this._persistSessionOverlay(resource, chatSession, transport.kind);
			}
		} catch (err) {
			this._deleteLiveChat(chatKey);
			throw err;
		}
		return chatSession;
	}

	private async _ensureResolvedChatSession(context: IResolvedClaudeChatContext, workingDirectory?: URI): Promise<ClaudeAgentSession> {
		const existing = context.target;
		if (existing?.isPipelineReady) {
			return existing;
		}
		if (existing) {
			if (this._isUnboundSession(context.sessionId)) {
				this._bindSessionChat(context.sessionId, context.chat);
			}
			return this._materializeProvisional(context.sessionId, workingDirectory);
		}
		if (this._chatBindings.has(context.chatKey)) {
			if (context.sdkSessionId === context.sessionId && context.resource.toString() === context.session.toString()) {
				return this._resumeSession(context.sessionId, context.session, context.chat, context.resource);
			}
			return this._materializeChatLocked(context);
		}
		return this._resumeSession(context.sessionId, context.session, context.chat, context.resource);
	}

	/**
	 * Build a provisional {@link ClaudeAgentSession} from a concrete chat binding
	 * binding + overlay: its `sessionUri` is the real owning session URI and
	 * its `chatChannelUri` is the chat's own channel (never overloaded),
	 * backed by the bound SDK chat id. The caller materializes it.
	 */
	private async _buildProvisionalChat(session: URI, chat: URI, resource: URI): Promise<ClaudeAgentSession> {
		const info = this._chatBindings.get(chat.toString());
		if (!info) {
			throw new Error(`[Claude] no backing chat for chat ${chat.toString()}`);
		}
		const parentSession = await this._resolveParentSession(session, AgentSession.id(session));
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(resource);
		} catch (err) {
			this._logService.warn(`[Claude] chat overlay read failed for ${chat.toString()}; continuing with defaults`, err);
		}
		const permissionMode = readClaudePermissionMode(this._configurationService, resource) ?? parentSession.permissionMode;
		// Overlay takes precedence over the binding: `changeModel` always writes
		// the overlay first (via `setModel` or `_metadataStore.write`) and then
		// the binding. If the binding update is lost, the overlay already holds
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
			this._instantiationService,
		);
		this._registerLiveChat(chat, chatSession);
		return chatSession;
	}

	/**
	 * Update a concrete chat binding's model and push the refreshed opaque
	 * `providerData` blob to the orchestrator (via
	 * {@link onDidChangeChatData}) so the durable catalog stays in sync.
	 */
	private async _updateChatBackingModel(chat: URI, model: ModelSelection): Promise<void> {
		const existing = this._chatBindings.get(chat.toString());
		if (!existing) {
			return;
		}
		const updated: IClaudeChatBinding = { ...existing, model };
		this._chatBindings.set(chat.toString(), updated);
		this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(_toPersistedChat(updated)) });
	}

	/**
	 * Re-attach a concrete chat binding on session
	 * restore, decoding the opaque `providerData` the orchestrator persisted
	 * at creation (or the latest {@link onDidChangeChatData}). `session` is
	 * the chat's owning session, supplied explicitly by AH. After this
	 * resolves the chat's backing SDK chat can be resumed lazily on its first
	 * send. Best-effort — a corrupt/unknown blob is logged and dropped rather
	 * than thrown.
	 */
	async materializeChat(chat: URI, _context: URI | IAgentChatContext, providerData: string | undefined): Promise<void> {
		if (providerData === undefined) {
			return;
		}
		const persisted = decodeProviderData(providerData);
		if (!persisted) {
			this._logService.warn(`[Claude] materializeChat: dropping corrupt providerData for ${chat.toString()}`);
			return;
		}
		this._chatBindings.set(chat.toString(), { sdkSessionId: persisted.sdkSessionId, ...(persisted.model ? { model: persisted.model } : {}) });
	}

	private async _getChatMessages(chat: URI, context?: URI | IAgentChatContext): Promise<readonly Turn[]> {
		return this._readChatMessages(chat, context ? resolveAgentChatContext(context, chat) : undefined);
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
		const sess = this._findAnySession(AgentSession.id(session));
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
		return this._readChatMessages(session);
	}

	private async _readChatMessages(address: URI, context?: IAgentChatContext): Promise<readonly Turn[]> {
		// Don't trigger a cold SDK download just to reconstruct a transcript
		// during restore (the renderer subscribes to the last-active session
		// on startup). Mirrors `listSessions` / `getConversationMetadata`: when the
		// SDK isn't local yet, defer with an empty transcript. The download
		// fires (with host-level progress) once the user sends the first
		// message, after which the transcript re-hydrates on the next restore.
		if (!(await this._sdkService.canLoadWithoutDownload())) {
			this._logService.info('[Claude] SDK not downloaded yet; deferring session messages until a session triggers the download');
			return [];
		}
		// Additional chat: reconstruct its own SDK chat (resolved
		// from the catalog/in-memory), routed to the chat channel URI. Shares
		// the same fetch+map path as the storage-scoped chat via `_reconstructTurns`.
		if (isSubagentSession(address)) {
			const parsed = parseSubagentSessionUri(address);
			const parentSession = parsed ? this._findAnySession(AgentSession.id(parsed.parentSession)) : undefined;
			if (!parentSession) {
				// Parent session is gone (disposed or never materialized).
				// The registry that holds the agentId cache lives on the
				// parent session, so we cannot resolve the subagent.
				this._logService.warn(`[Claude] getSessionMessages: parent session not found for subagent ${address.toString()} (registry unavailable)`);
				return [];
			}
			try {
				return await getSubagentTranscript(address, parentSession.subagents, this._sdkService, this._logService, CancellationToken.None);
			} catch (err) {
				this._logService.warn(`[Claude] getSubagentTranscript threw for ${address.toString()}`, err);
				return [];
			}
		}

		const resolved = this._resolveChatContext(address, context);
		const sess = resolved.target;
		if (sess && !sess.isPipelineReady) {
			return [];
		}
		const sdkSessionId = resolved.sdkSessionId ?? await this._resolveChatSdkId(resolved);
		if (!sdkSessionId) {
			return [];
		}
		const routingUri = context
			? (sdkSessionId === resolved.sessionId ? resolved.session : resolved.chat)
			: (resolved.chat.toString() === resolved.session.toString() ? resolved.session : resolved.chat);
		return this._reconstructTurns(sdkSessionId, routingUri, sess);
	}

	/**
	 * Fetch a chat's SDK transcript ({@link sdkSessionId}) and map it to
	 * protocol {@link Turn}s routed to {@link routingUri} (the session or chat
	 * channel URI). When {@link primeOn} is supplied (the materialized owning
	 * session), its subagent registry is primed from the agentId suffixes the
	 * SDK encoded in Task tool_result blocks. Resilient: any failure warn-logs
	 * and returns `[]` rather than propagating.
	 */
	private async _reconstructTurns(sdkSessionId: string, routingUri: URI, primeOn: ClaudeAgentSession | undefined): Promise<readonly Turn[]> {
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
		// A bug in `primeFromTranscript` MUST NOT break an otherwise-successful
		// transcript read.
		try {
			primeOn?.subagents.primeFromTranscript(turns);
		} catch (err) {
			this._logService.warn(`[Claude] primeFromTranscript threw for ${sdkSessionId}`, err);
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
		// Don't trigger a cold SDK download just to hydrate metadata during
		// restore (the renderer subscribes to the last-active session on
		// startup). When the SDK isn't local yet, defer; the download fires
		// once the user sends the first message.
		if (!(await this._sdkService.canLoadWithoutDownload())) {
			this._logService.info('[Claude] SDK not downloaded yet; deferring session metadata until a session triggers the download');
			return undefined;
		}
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
			const sessions = this._allLiveSessions();
			for (const chat of sessions) {
				if (!chat.isPipelineReady) {
					chat.abortController.abort();
				}
			}

			await Promise.all(sessions.map(chat =>
				this._disposeSequencer.queue(chat.sessionId, async () => {
					await this._disposeLiveSession(chat);
					this._pruneActiveClientHandles(chat.sessionId);
				})
			));
		})();
	}

	private async _sendMessage(chat: URI, prompt: string, workingDirectory: URI | undefined, attachments?: readonly MessageAttachment[], turnId?: string, _senderClientId?: string, operationContext?: URI | IAgentChatContext): Promise<void> {
		// `IAgent.sendMessage` declares `turnId?` but every production caller in
		// `AgentSideEffects` supplies one. Generate a fallback so the
		// session-side `QueuedRequest.turnId: string` invariant holds even if a
		// hypothetical caller forgets it.
		const effectiveTurnId = turnId ?? generateUuid();
		const context = this._resolveChatContext(chat, operationContext);

		return this._sessionSequencer.queue(context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			const session = await this._ensureResolvedChatSession(current, workingDirectory);
			await session.send(this._buildSdkPrompt(current.sessionId, prompt, attachments, effectiveTurnId), effectiveTurnId, current.resource);
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

	/** Every live or direct-create provisional SDK conversation. */
	private _allLiveSessions(): ClaudeAgentSession[] {
		return [...this._chatEntriesBySdkId.values()].map(entry => entry.chatSession);
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
		const sess = this._resolveChatContext(chat).target;
		if (!sess) {
			return;
		}
		if (!sess.isPipelineReady) {
			sess.abortController.abort();
			return;
		}
		sess.abort();
	}

	setPendingMessages(session: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[], chat?: URI): void {
		// Phase 9 D5: queued messages are intentionally a no-op. CONTEXT.md
		// M10 + AgentSideEffects confirm queued messages are consumed
		// server-side; the agent boundary always receives an empty queue.
		//
		// Steering targets the chat that owns the in-flight turn: an
		// concrete chat is addressed by its `chat` channel URI, the
		// storage-scoped chat by the session URI.
		const target = this._findChat(session, chat);
		this._logService.info(`[Claude] setPendingMessages for ${(chat ?? session).toString()}: steering=${steeringMessage?.id ?? 'none'} queued=${_queuedMessages.length}`);
		if (!target) {
			this._logService.warn(`[Claude] setPendingMessages: target not found for ${(chat ?? session).toString()}`);
			return;
		}
		if (steeringMessage) {
			target.injectSteering(steeringMessage);
		}
	}

	onChatConfigChanged(chat: URI, values: Record<string, unknown>): void {
		const target = this._resolveChatContext(chat).target;
		if (!target) {
			return;
		}
		const narrowed = narrowClaudePermissionMode(values[ClaudeSessionConfigKey.PermissionMode]);
		const mode = narrowed ?? target.permissionModeFallback;
		target.setInheritedPermissionMode(narrowed).catch(err => {
			this._logService.warn(`[Claude:${target.sessionId}] mid-turn setPermissionMode(${mode}) failed`, err);
		});
	}

	private async _changeModel(chat: URI, model: ModelSelection, operationContext?: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._sessionSequencer.queue(context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			await this._metadataStore.write(current.resource, { model });
			const sess = current.target;
			if (sess) {
				await sess.setModel(model);
			}
			if (current.sdkSessionId !== current.sessionId) {
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
	 * chat, the change targets that chat's own overlay.
	 */
	private async _changeAgent(chat: URI, agent: AgentSelection | undefined, operationContext?: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._sessionSequencer.queue(context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			await this._metadataStore.write(current.resource, { agent: agent ?? null });
			const sess = current.target;
			if (sess) {
				await sess.setAgent(agent);
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

	onClientToolCallComplete(session: URI, chat: URI, toolCallId: string, result: ToolCallResult): void {
		const addressed = this._findChat(session, chat);
		if (addressed) {
			addressed.completeClientToolCall(toolCallId, result);
			return;
		}
		let target = session;
		let parsed;
		while ((parsed = parseSubagentSessionUri(target))) {
			target = parsed.parentSession;
		}
		const sessionId = AgentSession.id(target);
		// `AgentSideEffects` forwards every `ChatToolCallComplete` envelope
		// (including SDK-owned tools); silent on miss is the expected path.
		this._findAnySession(sessionId)?.completeClientToolCall(toolCallId, result);
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
		// Step 1: abort every session AbortController. These are the
		// same controllers wired into `Options.abortController` at
		// materialize time (sdk.d.ts:982), so any in-flight
		// `await sdk.startup()` will reject and any sequencer-queued
		// materialize continuation will trip its abort gates without
		// reaching registration.
		//
		// Step 2: `super.dispose()` synchronously disposes both chat maps.
		//
		// Step 3: only then release the proxy handle, preserving the
		// wrapper-before-proxy ordering invariant. This is locked by
		// test "dispose disposes the proxy handle and is idempotent".
		for (const chat of this._allLiveSessions()) {
			chat.abortController.abort();
		}
		super.dispose();
		this._proxyHandle?.dispose();
		this._proxyHandle = undefined;
		this._githubToken = undefined;
		this._models.set([], undefined);
	}
}

class ClaudeChatEntry extends Disposable {
	constructor(readonly chatSession: ClaudeAgentSession) {
		super();
		this._register(chatSession);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
