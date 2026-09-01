/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { ModelInfo, OnElicitation, Options, SDKSessionInfo, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Limiter, retry, SequencerByKey } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { IAgentSdkDownloader } from '../agentSdkDownloader.js';
import { AgentSdkSetupChannel } from '../agentSdkSetupChannel.js';
import { decodeProviderData, encodeProviderData, type IPersistedChat } from '../agentChatBackings.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostClaudeMultiRootEnabledConfigKey, createSchema, platformRootSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel } from '../../common/claudeModelConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentChatMigrationDeferred, type AgentChatMigrationResult, AgentProvider, AgentSession, AgentSignal, CLAUDE_AGENT_PROVIDER_ID, IActiveClient, IAgent, IAgentChatContext, IAgentChatDataChange, IAgentChatMetadata, IAgentChats, IAgentChatConfigCompletionsParams, IAgentCreateChatOptions, IAgentCreateChatResult, IAgentDescriptor, IAgentDiscoveredChat, IAgentMaterializeChatEvent, IAgentModelInfo, IAgentResolveChatConfigParams, IAgentSessionProjectInfo, IAgentSpawnChatEvent, IAgentSpawnedChatParent, SubagentChatSignal, resolveAgentChatContext, resolveAgentHostCustomizations, resolveAgentHostInstructions, resolveSubagentChatParent } from '../../common/agent.js';
import { ensureWorkspacelessScratchDir } from '../workspacelessScratchDir.js';
import { ActionType } from '../../common/state/sessionActions.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { PolicyState, ProtectedResourceMetadata, type AgentSelection, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { buildDefaultChatUri, ChatInputResponseKind, isDefaultChatUri, parseRequiredSessionUriFromChatUri, type ClientPluginCustomization, type Customization, type ISessionFolderPickerDecision, type MessageAttachment, type PendingMessage, type ChatInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IFileService } from '../../../files/common/files.js';
import { computeFolderPickerDecisionForRoots } from '../shared/folderPickerDecision.js';
import { claudeDirectoryQualifiesForPrimary } from './claudeFolderPickerCriteria.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { projectFromCopilotContext } from '../copilot/copilotGitProject.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { ClaudeSdkPackage, IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { buildModelEnumerationOptions } from './claudeSdkOptions.js';
import { isClaudeAccountSetUp, resolveClaudeTransportMode, type ClaudeTransportMode } from './claudeTransportMode.js';
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
import { IAgentHostSessionTitleSignal } from '../agentHostSessionTitleSignal.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';

const USER_AGENT_PREFIX = 'vscode_claude_code';

/** Where a user goes to establish Claude credentials; the workbench labels the link. */
const CLAUDE_SETUP_DOCS_URL = 'https://code.claude.com/docs/en/third-party-integrations';

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
 * {@link IAgentModelInfo} surface. The returned `provider` defaults to the
 * agent's id (`'claude'`), NOT the upstream `vendor: 'Anthropic'` field — the
 * chat model picker *groups* (does not filter) the model list by `provider`, so
 * a single, un-merged catalog buckets under the harness. When per-session
 * provider selection is on, {@link mergeClaudeModelCatalogs} re-stamps each model
 * with its transport provider (`copilot`/`anthropic`) to split the picker into a
 * Copilot group and an Anthropic group.
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
 * The SDK's synthetic "use whatever the CLI is configured to use" row:
 * `supportedModels()` projects the CLI's `null`-valued default option to
 * `value: 'default'`, displayed as "Default (recommended)".
 */
const SDK_DEFAULT_MODEL_VALUE = 'default';

/**
 * Whether `m` is the SDK's {@link SDK_DEFAULT_MODEL_VALUE} alias rather than a
 * real model. The alias resolves to a concrete model (`ModelInfo.resolvedModel`)
 * that the catalog already offers as its own row, so it adds no reachable
 * capability — and next to the Copilot-routed models it reads as a third,
 * unrelated choice whose target is invisible, which is why it is dropped from
 * the published catalog (microsoft/vscode#329983).
 */
function isSdkDefaultModel(m: ModelInfo): boolean {
	return m.value === SDK_DEFAULT_MODEL_VALUE;
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

// Narrowing an arbitrary runtime value to the closed `ClaudePermissionMode`
// union lives in `../../common/claudeSessionConfigKeys.ts` so it is shared by
// `ClaudeAgent`, `ClaudeSessionMetadataStore`, and other consumers. The live
// per-session read helper lives in `./claudeSessionPermissionMode.ts` so the
// session and materializer can read directly without threading callbacks
// through the agent.

// Provisional session state is hosted directly on {@link ClaudeAgentSession}
// (pre-materialize fields: project, abortController, provisionalModel,
// provisionalConfig).

/**
 * Provider-owned data that identifies one Claude SDK conversation.
 * It deliberately contains no Agent Host membership or persistence scope.
 */
interface IClaudeChatBacking {
	/** The SDK conversation this chat addresses. */
	readonly sdkSessionId: string;
	/** Model override recorded at creation or by a later {@link IAgentChats.changeModel}. */
	readonly model?: ModelSelection;
}

/**
 * What a new chat inherits from its fork source. Every field is
 * optional because a chat that inherits nothing returns an empty object; the
 * presence of `sdkSessionId` is what selects the inherited bind path.
 */
interface IClaudeInheritedConversation {
	readonly sdkSessionId?: string;
	readonly inheritedTurnId?: string;
}

/**
 * A chat's exact configuration/persistence-resource pair, recorded so a later
 * fork naming this chat as its source can resolve both without
 * deriving either from URI shape or from the destination's own context.
 */
interface IChatScopeBinding {
	/** The shared, session-wide configuration scope (`IAgentChatContext.configurationResource`). */
	readonly configurationResource: URI;
	/** This exact chat's own persistence resource (`IAgentChatContext.resource`) — the key its overlay is written under. */
	readonly resource: URI;
}

/**
 * One host-addressed chat operation, resolved against the provider's exact
 * chat backing.
 *
 * Every field except {@link target} / {@link sdkSessionId} is a host fact taken
 * verbatim from the operation's {@link IAgentChatContext}: the provider derives
 * nothing here from URI shape and reads nothing back from shared host state.
 */
interface IResolvedClaudeChatContext {
	/** The opaque configuration/persistence scope shared by this chat's related chats. */
	readonly configurationResource: URI;
	readonly sessionId: string;
	readonly resource: URI;
	readonly chat: URI;
	readonly chatKey: string;
	/**
	 * The spawning chat + tool call when {@link chat} is a provider-spawned
	 * subagent, read off the host-supplied origin. `undefined` for every other
	 * chat.
	 */
	readonly spawnedFrom: IAgentSpawnedChatParent | undefined;
	/**
	 * The owning session's last host-published customization snapshot.
	 * `undefined` means "no snapshot published yet" — deliberately distinct
	 * from an empty list, so the provider keeps its own reconciled view.
	 */
	readonly customizations: readonly Customization[] | undefined;
	readonly sdkSessionId: string | undefined;
	readonly sequencerKey: string;
	readonly target: ClaudeAgentSession | undefined;
}

/**
 * Projects a backing down to the opaque {@link IPersistedChat} shape the
 * orchestrator persists verbatim in its chat catalog — the wire format is
 * unchanged.
 */
function _toPersistedChat(backing: IClaudeChatBacking): IPersistedChat {
	return {
		sdkSessionId: backing.sdkSessionId,
		...(backing.model ? { model: backing.model } : {}),
	};
}

/**
 * Claude active-client handle, addressed to exactly one host-supplied chat.
 * Tools read/write through the live session's {@link SessionClientToolsModel};
 * customization assignment kicks off the agent's async sync (via the
 * provided closure). The handle caches the last assigned customization
 * inputs so the getter reflects what the client most recently published.
 *
 * There is no membership here: Agent Host addresses this handle to exactly
 * one chat at construction, and every later contribution (tools,
 * customizations) applies to that chat alone. A sibling chat needs its own
 * handle, obtained through its own `getOrCreateActiveClient` call.
 */
class ClaudeActiveClientHandle implements IActiveClient {
	private _tools: readonly ToolDefinition[] = [];
	private _customizations: readonly ClientPluginCustomization[] = [];
	private _customizationsAssigned = false;
	/**
	 * The last host-published customization snapshot for the owning
	 * configuration scope, refreshed on every host call. `undefined` until the
	 * host publishes one — never coerced to an empty list, which would read as
	 * "this chat has no customizations".
	 */
	private _hostCustomizations: readonly Customization[] | undefined;

	constructor(
		readonly clientId: string,
		readonly displayName: string | undefined,
		/** The exact chat this handle's contributions are addressed to. */
		readonly chat: URI,
		private readonly _setTools: (chat: URI, tools: readonly ToolDefinition[]) => void,
		private readonly _syncCustomizations: (chat: URI, customizations: readonly ClientPluginCustomization[], hostCustomizations: readonly Customization[] | undefined) => void,
	) { }

	get tools(): readonly ToolDefinition[] {
		return this._tools;
	}
	set tools(tools: readonly ToolDefinition[]) {
		this._tools = tools;
		this._setTools(this.chat, tools);
	}

	get customizations(): readonly ClientPluginCustomization[] {
		return this._customizations;
	}
	set customizations(customizations: readonly ClientPluginCustomization[]) {
		this._customizations = customizations;
		this._customizationsAssigned = true;
		this._syncCustomizations(this.chat, customizations, this._hostCustomizations);
	}

	/** The last host snapshot, for syncs this client's own assignment triggers. */
	get hostCustomizations(): readonly Customization[] | undefined {
		return this._hostCustomizations;
	}

	/** Records the host's latest published customization snapshot for this handle's owning scope, if supplied. */
	setHostCustomizations(hostCustomizations: readonly Customization[] | undefined): void {
		if (hostCustomizations !== undefined) {
			this._hostCustomizations = hostCustomizations;
		}
	}

	/**
	 * Re-applies this handle's currently-assigned tools and (if ever assigned)
	 * customizations to its chat. Used when the chat's live runtime just came
	 * up, so contributions made before the runtime existed still reach it.
	 */
	refresh(): void {
		this._setTools(this.chat, this._tools);
		if (this._customizationsAssigned) {
			this._syncCustomizations(this.chat, this._customizations, this._hostCustomizations);
		}
	}
}

/**
 * {@link IAgent} provider for the Claude Agent SDK.
 *
 * Handles descriptor/auth surfaces, model catalog enumeration (merging
 * proxy and native transports), chat lifecycle (create/resolve/dispose),
 * tool permissions, elicitation, and session persistence.
 */
export class ClaudeAgent extends Disposable implements IAgent {
	readonly id: AgentProvider = CLAUDE_AGENT_PROVIDER_ID;

	private readonly _onDidChatProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidChatProgress = this._onDidChatProgress.event;

	private readonly _onDidCustomizationsChange = this._register(new Emitter<void>());
	readonly onDidCustomizationsChange = this._onDidCustomizationsChange.event;

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
	 * Memoized teardown promise. Set on the first call to {@link shutdown},
	 * returned by every subsequent call, so concurrent callers share one
	 * drain pass rather than racing independent teardowns.
	 */
	private _shutdownPromise: Promise<void> | undefined;

	/**
	 * Owns every live SDK conversation, keyed by SDK session id. This is the
	 * single disposable owner of chat leaves and the reverse index used by
	 * SDK-originated callbacks (credit reports, `canUseTool`, elicitation),
	 * which only ever know the SDK's own id.
	 */
	private readonly _chatEntriesBySdkId = this._register(new DisposableMap<string, ClaudeChatEntry>());

	/**
	 * Maps each host-supplied concrete chat URI to its {@link IClaudeChatBacking}.
	 * This is the single, consolidated `chatUri → backing` mapping and the only
	 * way a chat resolves: every chat — a session's primary chat, a fork, a
	 * side chat, a restored legacy chat — has exactly one exact backing here.
	 * It encodes no membership kind and no persistence scope, so nothing
	 * about a chat is ever recovered from URI shape or from a
	 * provider-private classification.
	 */
	private readonly _chatBackings = new Map<string, IClaudeChatBacking>();

	/**
	 * Maps each host-supplied concrete chat URI to the exact
	 * {@link IChatScopeBinding} — both its configuration scope
	 * (`IAgentChatContext.configurationResource`, shared session-wide) and its
	 * own persistence resource (`IAgentChatContext.resource`, the exact key its
	 * overlay is written under) — recorded whenever that chat is created or
	 * (re-)materialized. This is the only state a fork/side-chat source's own
	 * scope is ever resolved from — never the destination chat's scope, never
	 * a sibling catalog grouped by session.
	 */
	private readonly _chatConfigScopes = new Map<string, IChatScopeBinding>();

	/**
	 * Fires when a concrete chat backing's opaque `providerData` changes after creation
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
	 * {@link onDidChatProgress}, so the orchestrator records the spawn edge
	 * on the unified chat catalog. See {@link IAgent.onDidSpawnChat}.
	 */
	private readonly _onDidSpawnChat = this._register(new Emitter<IAgentSpawnChatEvent>());
	readonly onDidSpawnChat: Event<IAgentSpawnChatEvent> = this._onDidSpawnChat.event;

	private readonly _onDidDiscoverChats = this._register(new Emitter<readonly IAgentDiscoveredChat[]>());
	readonly onDidDiscoverChats = this._onDidDiscoverChats.event;
	private _claudeCodeChatDiscovery: Promise<void> | undefined;

	/**
	 * Stable active-client handles, keyed by `${chatKey}\0${clientId}` — one
	 * handle per exact (chat, client) pair. There is no session- or
	 * membership-level entry: a client contributing to several chats of the
	 * same session gets one independent handle per chat, each obtained
	 * through its own {@link getOrCreateActiveClient} call.
	 */
	private readonly _activeClientHandles = new Map<string, ClaudeActiveClientHandle>();

	/**
	 * Fired once per session when {@link _materializeProvisional} promotes a
	 * provisional record into a real {@link ClaudeAgentSession}. The
	 * {@link IAgentService} subscribes via the platform contract to dispatch
	 * the deferred `sessionAdded` notification — observers don't see the
	 * session in their list until persistence has settled.
	 */
	private readonly _onDidMaterializeChat = this._register(new Emitter<IAgentMaterializeChatEvent>());
	readonly onDidMaterializeChat = this._onDidMaterializeChat.event;

	/**
	 * Per-SDK-session-id serializer for {@link shutdown}'s teardown pass, so
	 * the drain of every live chat inherits per-session serialization for its
	 * async teardown (`Query.interrupt()`, in-flight metadata writes).
	 */
	private readonly _disposeSequencer = new SequencerByKey<string>();

	/**
	 * Per-session-id serializer for {@link sendMessage}. Held across both
	 * {@link _materializeProvisional} AND `entry.send()` so two concurrent
	 * first-message calls on the same session collapse into one materialize
	 * plus two ordered sends. Separate from {@link _disposeSequencer} so
	 * teardown racing a first send still serializes without deadlocking
	 * inside the send sequencer.
	 */
	private readonly _sessionSequencer = new SequencerByKey<string>();

	private readonly _metadataStore: ClaudeSessionMetadataStore;

	private _findAnySession(sessionId: string): ClaudeAgentSession | undefined {
		return this._chatEntriesBySdkId.get(sessionId)?.chatSession;
	}

	/**
	 * The opaque half of a creation result: the blob the orchestrator persists
	 * verbatim, plus the separately-enumerable SDK conversation it must
	 * suppress from the top-level session list.
	 */
	private _chatBackingResult(backing: IClaudeChatBacking): IAgentCreateChatResult {
		return {
			providerData: encodeProviderData(_toPersistedChat(backing)),
			backingSession: AgentSession.uri(this.id, backing.sdkSessionId),
		};
	}

	private _findChatByUri(chat: URI | string): ClaudeAgentSession | undefined {
		const sdkSessionId = this._chatBackings.get(typeof chat === 'string' ? chat : chat.toString())?.sdkSessionId;
		return sdkSessionId ? this._findAnySession(sdkSessionId) : undefined;
	}

	/**
	 * Resolves a host-addressed chat operation against the exact chat URI it
	 * was addressed to.
	 *
	 * `context` is mandatory: Agent Host stamps the configuration/persistence
	 * scope, the exact-chat persistence scope, the provisioning intent, the
	 * catalog origin, and the session's customization snapshot on every
	 * addressed chat operation, and this provider consumes all of them
	 * verbatim. There is no implicit form — a chat is never resolved by
	 * treating its URI as a session, by scanning live runtimes, or by parsing
	 * URI shape. Resolution of the provider's own state is exactly one lookup:
	 * the chat's exact backing.
	 */
	private _resolveChatContext(chat: URI, context: URI | IAgentChatContext): IResolvedClaudeChatContext {
		const resolved = resolveAgentChatContext(context, chat);
		const chatKey = chat.toString();
		const backing = this._chatBackings.get(chatKey);
		const sdkSessionId = backing?.sdkSessionId;
		return {
			configurationResource: resolved.configurationResource,
			sessionId: AgentSession.id(resolved.configurationResource),
			resource: resolved.resource,
			chat,
			chatKey,
			spawnedFrom: resolveSubagentChatParent(resolved),
			customizations: resolveAgentHostCustomizations(resolved),
			sdkSessionId,
			sequencerKey: sdkSessionId ?? chatKey,
			target: sdkSessionId ? this._findAnySession(sdkSessionId) : undefined,
		};
	}

	/** Records `chat`'s exact scope binding, populated on create and materialize. */
	private _recordChatScope(chat: URI, configurationResource: URI, resource: URI): void {
		this._chatConfigScopes.set(chat.toString(), { configurationResource, resource });
	}

	/** Resolves the scope binding recorded for an exact source chat. */
	private _sourceChatScope(source: URI): IChatScopeBinding | undefined {
		return this._chatConfigScopes.get(source.toString());
	}

	/**
	 * Validates that Agent Host supplied context on a boundary whose protocol
	 * signature still types it as optional. It does on every one of them; a
	 * missing context is a host bug we surface rather than paper over by
	 * inventing the owning session from the chat URI.
	 */
	private _requireChatContext(chat: URI, context: URI | IAgentChatContext | undefined, operation: string): URI | IAgentChatContext {
		if (!context) {
			throw new Error(`[Claude] ${operation} requires host chat context for ${chat.toString()}`);
		}
		return context;
	}

	private _findSessionBySdkId(sdkSessionId: string): ClaudeAgentSession | undefined {
		return this._findAnySession(sdkSessionId);
	}

	/** Wrap a { ClaudeAgentSession} in a chat-leaf entry and forward its events. */
	private _wireEntry(session: ClaudeAgentSession): ClaudeChatEntry {
		const entry = new ClaudeChatEntry(session);
		entry.addDisposable(session.onDidSessionProgress(signal => {
			this._onDidChatProgress.fire(signal);
			this._emitSpawnedChatEvents(signal);
		}));
		entry.addDisposable(session.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
		return entry;
	}

	private _registerLiveChat(chat: URI, session: ClaudeAgentSession): void {
		const current = this._chatBackings.get(chat.toString());
		this._deleteLiveChat(chat.toString());
		this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
		this._chatEntriesBySdkId.set(session.sessionId, this._wireEntry(session));
		this._chatBackings.set(chat.toString(), {
			sdkSessionId: session.sessionId,
			...(current?.model ? { model: current.model } : {}),
		});
	}

	private _deleteLiveChat(chatKey: string): void {
		const backing = this._chatBackings.get(chatKey);
		if (backing?.sdkSessionId) {
			this._chatEntriesBySdkId.deleteAndDispose(backing.sdkSessionId);
		}
	}

	/**
	 * Tear down a chat's live entry only. Every caller that means to also
	 * forget the chat's backing (a true dispose, not a release/teardown that
	 * must resume later) does so explicitly — e.g. {@link _disposeChat}.
	 * Never touching `_chatBackings` here keeps release/cold-resume uniform
	 * for every concrete chat backing, since this operation does not encode
	 * provider-specific persistence classes.
	 */
	private _deleteSession(session: ClaudeAgentSession): void {
		this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
	}

	/**
	 * Bridges the agent's `subagent_started` signal onto the
	 * {@link onDidSpawnChat} membership channel. The signals are still forwarded
	 * verbatim on {@link onDidChatProgress} (the orchestrator's
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
		@IAgentSdkDownloader private readonly _agentSdkDownloader: IAgentSdkDownloader,
		@IAgentHostSessionTitleSignal private readonly _sessionTitleSignal: IAgentHostSessionTitleSignal,
		@IAgentHostOTelService private readonly _otelService: IAgentHostOTelService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostCheckpointService private readonly _checkpointService: IAgentHostCheckpointService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
		@IProductService private readonly _productService: IProductService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._metadataStore = _instantiationService.createInstance(ClaudeSessionMetadataStore);
		// CAPI reports each request's billed credits via the proxy (the SDK
		// strips `copilot_usage` from its `result`). Route every report to
		// the originating session by the session id the proxy decoded from
		// the Bearer token, so the session can surface real per-turn credits.
		this._register(this._claudeProxyService.onDidReportCredits(e => {
			this._findSessionBySdkId(e.sessionId)?.recordTurnCredits(e.totalNanoAiu);
		}));

		// Emit a host-produced session-title metadata span whenever this agent's
		// session title changes. The narrow host seam fires for every provider
		// (titles are host-owned), so gate on our own provider id; the
		// conversation id is precomputed for us.
		this._register(this._sessionTitleSignal.onDidChangeSessionTitle(({ provider, session, conversationId, title }) => {
			if (provider === this.id) {
				this._otelService.emitSessionTitleChanged(conversationId, session.toString(), title);
			}
		}));

		// The merged catalog enumerates both providers' models — the native half
		// needs no GitHub token — so bootstrap the model list here rather than
		// waiting for `authenticate()`. Without this a signed-out window with a local
		// Claude setup would show an empty picker. `queueMicrotask` runs it off the
		// ctor stack. The per-session transport is derived on demand at materialize
		// (see {@link _defaultTransportMode}), so a sign-in state change needs no
		// reactive re-resolve — the next session simply reads it live.
		queueMicrotask(() => { void this._startModelRefresh(); });

		this._sdkSetupChannel = this._register(new AgentSdkSetupChannel({
			id: this.id,
			sdkPackage: ClaudeSdkPackage,
			// Every Claude credential — subscription or `ANTHROPIC_API_KEY` — is
			// established outside the app, and the SDK exposes no login control
			// request, so the docs link is the only route this agent can offer.
			setupInfo: { setupDocsUrl: CLAUDE_SETUP_DOCS_URL },
			isSdkLocal: () => this._sdkService.canLoadWithoutDownload(),
			downloadSdk: () => this._sdkService.ensureAvailable(),
			restartChatDiscovery: () => this._restartChatDiscovery(),
			refreshModels: () => this._startModelRefresh(),
		}, this._configurationService, this._agentSdkDownloader, this._logService));
	}

	/**
	 * Publishes whether the SDK is on disk — and deliberately nothing about the
	 * account, which the workbench derives from the model list (`ready` + zero
	 * models → no account). Two wire sources for one truth could disagree.
	 */
	private readonly _sdkSetupChannel: AgentSdkSetupChannel;

	/**
	 * The fallback transport for a session whose model names no provider (model-less
	 * or a bare/legacy id). Read on demand at materialize — never cached — from live
	 * availability: a started {@link _proxyHandle} means Copilot is serveable now, a
	 * local Claude setup means native is. The precedence (sign-in state, then local
	 * setup) is delegated to the pure {@link resolveClaudeTransportMode}. A
	 * provider-qualified model bypasses this and routes on its own provider.
	 */
	private _defaultTransportMode(): ClaudeTransportMode {
		const allowSignedOutWhenUsable = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true;
		return resolveClaudeTransportMode({ allowSignedOutWhenUsable, hasGitHubToken: this._proxyHandle !== undefined, hasExistingSetup: this._nativeAccountSetUp });
	}

	/**
	 * The SDK's last answer to {@link isClaudeAccountSetUp}, kept current by
	 * {@link _refreshModels}. Starts `false`: unasked is not evidence of an account.
	 */
	private _nativeAccountSetUp = false;

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
		// Always listed, always optional. Listing it is what lets the host forward a
		// token to an already-signed-in user (matching ignores `required`); the
		// unconditional `required: false` is what stops `resolveSignedOutWindowGate`
		// walling off the whole Agents window before the user reaches a surface that
		// could explain itself.
		const copilotResource = this._gitHubEndpointService.getCopilotResource();
		return [
			{ ...copilotResource, required: false },
			this._gitHubEndpointService.getRepoResource(),
		];
	}

	/**
	 * Resolve the active {@link ClaudeTransport} for a session. The transport is
	 * derived from `model` via {@link resolveClaudeSessionTransport}: a
	 * native-Anthropic model routes native and a Copilot-routed model routes
	 * proxy; a model-less or bare/legacy-id session follows the on-demand
	 * {@link _defaultTransportMode}. In native mode the transport is always ready (the
	 * SDK owns credentials); in proxied mode a started proxy handle is required,
	 * otherwise {@link AHP_AUTH_REQUIRED} is thrown so the client can drive
	 * Copilot sign-in.
	 */
	private _ensureAuthenticated(model?: ModelSelection): ClaudeTransport {
		const transport = resolveClaudeSessionTransport({
			model,
			defaultMode: this._defaultTransportMode(),
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
		if (!token) {
			const oldHandle = this._proxyHandle;
			const changed = this._githubToken !== undefined || oldHandle !== undefined;
			this._githubToken = undefined;
			this._proxyHandle = undefined;
			oldHandle?.dispose();
			if (changed) {
				this._models.set([], undefined);
				void this._startModelRefresh();
			}
			this._logService.info(changed ? '[Claude] Auth token cleared' : '[Claude] Auth token unchanged');
			return true;
		}
		// A GitHub Copilot token is arriving (sign-in). Always start the proxy so a
		// session that picks a Copilot-routed model from the merged catalog has a
		// started handle to run against — even while model-less sessions still
		// default to native. Per-session routing is decided later in
		// `_ensureAuthenticated(model)`; the model-less default reads live
		// availability (see {@link _defaultTransportMode}), so acquiring the handle
		// here is all that's needed for it to prefer proxy afterwards.
		//
		// Short-circuit only when the token is unchanged AND a handle is already
		// live. `authenticate` sets `_githubToken` and `_proxyHandle` together and
		// clears them together (see the failure path below), so requiring the handle
		// keeps "unchanged, nothing to do" honest — and re-runs `start()` rather than
		// short-circuiting if any path ever left a token without its handle.
		if (this._githubToken === token && this._proxyHandle) {
			this._logService.info('[Claude] Auth token unchanged');
			return true;
		}
		// Acquire the new handle BEFORE committing the token or disposing the old
		// one. The proxy server's refcount stays >= 1 across the swap because the new
		// handle is acquired before the old one is disposed; {@link IClaudeProxyService}
		// applies most-recent-token-wins on subsequent `start()` calls.
		let newHandle: IClaudeProxyHandle;
		try {
			newHandle = await this._claudeProxyService.start(token);
		} catch (err) {
			// GitHub sign-in itself succeeded; only the Copilot proxy failed to
			// start. Don't fail sign-in — the merged catalog still serves any native
			// models, and a Copilot-routed model surfaces `AHP_AUTH_REQUIRED` on its
			// first send (which re-drives sign-in, retrying `start()`).
			//
			// A live handle here means this was a token *replacement* whose new
			// `start()` failed. The old handle backs a now-superseded account, so tear
			// it down rather than keep silently serving that stale account behind a
			// "successful" sign-in; clearing the token with it upholds the
			// `_githubToken` ↔ `_proxyHandle` invariant (a token never outlives its
			// handle) and lets the next sign-in retry `start()` instead of
			// short-circuiting as "unchanged". A first sign-in (no handle) leaves both
			// refs as-is — already `undefined` — which retries for the same reason.
			if (this._proxyHandle) {
				const staleHandle = this._proxyHandle;
				this._proxyHandle = undefined;
				this._githubToken = undefined;
				staleHandle.dispose();
				// Drop the superseded account's entitlements; the refresh below re-lists
				// native-only (no handle) and republishes the protected resources.
				this._models.set([], undefined);
			}
			this._logService.warn('[Claude] Copilot proxy start failed; Copilot-routed models unavailable until the next sign-in', err);
			void this._startModelRefresh();
			return true;
		}
		const oldHandle = this._proxyHandle;
		this._proxyHandle = newHandle;
		this._githubToken = token;
		this._logService.info('[Claude] Auth token updated');
		oldHandle?.dispose();
		// Blank the catalog only on a *replacement*: a different account can have
		// different model entitlements, so don't retain the previous list if
		// enumeration for the new token fails.
		//
		// A first sign-in (no `oldHandle`) must NOT blank. It has no superseded
		// account to drop, and the catalog it would clear is native-only — the
		// bootstrap list, which is account-independent and stays valid. Blanking
		// there publishes an empty catalog for the length of the refresh, which the
		// window gate reads as `SessionTypeAuthRequirement.Unusable` (an agent with
		// no models is unusable). That closes the `allowSignedOutWhenUsable` gate
		// mid-startup and forces the sign-in dialog on a user who is already signed
		// in — the GitHub session resolves before the Copilot default account does,
		// so the welcome flow still believes it is signed out.
		if (oldHandle) {
			this._models.set([], undefined);
		}
		void this._startModelRefresh();
		return true;
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

	/**
	 * Enumerate both providers' catalogs in parallel and publish them as one
	 * provider-qualified list via {@link mergeClaudeModelCatalogs}. Each source is
	 * optional — the proxy catalog needs a GitHub token, the native catalog needs the
	 * SDK on disk — so a source we can't attempt contributes an empty list rather
	 * than failing the whole refresh. {@link Promise.allSettled} tolerates one source
	 * erroring; only when *every* source we attempted fails do we keep the last
	 * known-good catalog instead of blanking, so a transient double failure never
	 * wipes the picker.
	 *
	 * Gating the native half on the SDK's own account report is deliberate and
	 * load-bearing, not just an optimization. `supportedModels()` returns a *static*
	 * list of models the SDK understands — it is not an entitlement or credential
	 * check, and it answers even with no `ANTHROPIC_API_KEY`, no
	 * `CLAUDE_CODE_OAUTH_TOKEN` and an empty `HOME`. Publishing it unconditionally
	 * would advertise models for an agent that cannot serve a single request, which
	 * reads downstream as "usable without GitHub" and would hold the Agents window
	 * open on an agent that fails on its first turn. An empty catalog is the honest
	 * signal: it surfaces as "no models" (`SessionTypeAuthRequirement.Unusable`)
	 * rather than a sign-in prompt that would not help. The empty list is also what
	 * the window reads account state *from*, so it must never be a guess.
	 *
	 * The native attempt is skipped while the SDK is not on disk: asking it anything
	 * costs a multi-hundred-megabyte download, and that download is the user's
	 * explicit choice to make.
	 */
	private async _refreshModels(): Promise<void> {
		const tokenAtStart = this._githubToken;
		// True only for a dev override, a dev bare import, or an already-cached SDK.
		const canAttemptNative = await this._sdkService.canLoadWithoutDownload();
		if (!canAttemptNative) {
			// No SDK, so no evidence of an account — say so rather than retaining a stale `true`.
			this._nativeAccountSetUp = false;
		}
		const [proxyOutcome, nativeOutcome] = await Promise.allSettled([
			tokenAtStart ? this._fetchProxyModels(tokenAtStart) : Promise.resolve<readonly IAgentModelInfo[]>([]),
			canAttemptNative ? this._fetchNativeModels() : Promise.resolve<readonly IAgentModelInfo[]>([]),
		]);
		// Stale-write guard: a newer refresh superseded this one while we were
		// awaiting — the proxy token rotated (sign-in / sign-out). A merged write
		// here would clobber the catalog that newer refresh published.
		if (this._githubToken !== tokenAtStart) {
			return;
		}
		const attempted = (tokenAtStart ? 1 : 0) + (canAttemptNative ? 1 : 0);
		const failed = (proxyOutcome.status === 'rejected' ? 1 : 0) + (nativeOutcome.status === 'rejected' ? 1 : 0);
		if (attempted > 0 && failed === attempted) {
			// Every source we attempted failed — keep the last known-good catalog
			// rather than blanking. Sources we didn't attempt resolve fulfilled-empty
			// and are not counted as failures.
			this._logService.error('[Claude] All attempted model sources failed (merged refresh); keeping last known-good catalog');
		} else {
			// Unwrap each settled fetch: its models on success, or an empty list on
			// rejection (logged) so the other provider's catalog still publishes.
			const settledCatalog = (outcome: PromiseSettledResult<readonly IAgentModelInfo[]>, label: string): readonly IAgentModelInfo[] => {
				if (outcome.status === 'fulfilled') {
					return outcome.value;
				}
				this._logService.error(outcome.reason, `[Claude] Failed to fetch ${label} models (merged refresh); keeping the other provider`);
				return [];
			};
			const proxyModels = settledCatalog(proxyOutcome, 'proxy');
			const nativeModels = settledCatalog(nativeOutcome, 'native');
			const merged = mergeClaudeModelCatalogs(proxyModels, nativeModels);
			this._logService.info(`[Claude] Models refreshed (merged). Count: ${merged.length}, ${merged.map(m => m.name).join(', ')}`);
			this._models.set(merged, undefined);
		}
		// Last, never first: this is a free republish of "is the SDK on disk" (some
		// other path may have fetched it), but announcing `ready` before the catalog
		// lands is exactly how the window renders "no account found".
		this._sdkSetupChannel.publishWith(canAttemptNative);
	}

	/**
	 * Native (BYO-Anthropic) model source: enumerate the SDK's built-in /
	 * subscription models by opening a throwaway {@link IClaudeAgentSdkService.query}
	 * (workspace-free options that read the user's real `~/.claude` config) and
	 * calling `Query.supportedModels()` on it, then `close()`. The prompt never
	 * yields, so no turn runs and no session transcript is written (verified
	 * Phase 19 E2E). Projected with no commercial metadata, minus the SDK's
	 * {@link isSdkDefaultModel} alias row.
	 *
	 * `accountInfo()` rides the *same* query, so asking is effectively free — and it
	 * is the only honest source for "does this user have a Claude setup": a
	 * `claude login` credential lives in the login keychain, where nothing on the
	 * filesystem can see it. When it says no, the catalog is published empty.
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
			const [account, models] = await Promise.all([query.accountInfo(), query.supportedModels()]);
			const setUp = isClaudeAccountSetUp(account);
			this._nativeAccountSetUp = setUp;
			// Origin only — never the credential itself.
			this._logService.info(`[Claude] Native account check: setUp=${setUp}, provider=${account.apiProvider ?? 'none'}, tokenSource=${account.tokenSource ?? 'absent'}, apiKeySource=${account.apiKeySource ?? 'absent'}`);
			if (!setUp) {
				return [];
			}
			return models
				.filter(m => !isSdkDefaultModel(m))
				.map(m => fromSdkModelInfo(m, this.id));
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

	// #region Chat truncation, permission/elicitation bridges, chat surface

	/**
	 * Seed the eagerly-claimed active client (tools + customizations) into the
	 * SDK at chat creation, mirroring the Copilot agent. Runs for fresh AND
	 * re-created chats: when the workbench session state already carries the
	 * active client, no follow-up `session/activeClientSet` is dispatched to
	 * trigger the customization sync, so the built-in skills bundle would never
	 * reach Claude otherwise. Progress is suppressed (`quiet`) because the AH
	 * service may not have created the session state yet — a
	 * `SessionCustomizationUpdated` envelope would be orphaned; the completed
	 * snapshot is provided via `getChatCustomizations` immediately after.
	 *
	 * The client's contribution is addressed to exactly the chat this call
	 * provisioned. A sibling chat of the same session never inherits it —
	 * Agent Host addresses that chat with its own `getOrCreateActiveClient`
	 * call on the next `session/activeClientSet` / `session/chatAdded` fan-out.
	 */
	private async _seedEagerActiveClient(chat: URI, context: IAgentChatContext, activeClient: IAgentCreateChatOptions['activeClient']): Promise<void> {
		if (!activeClient) {
			return;
		}
		// The host has published no customization snapshot for a session it is
		// still creating, so none is passed here — deliberately distinct from
		// publishing an empty list.
		const handle = this.getOrCreateActiveClient(chat, context, { clientId: activeClient.clientId, displayName: activeClient.displayName });
		handle.tools = activeClient.tools;
		if (activeClient.customizations !== undefined) {
			await this.syncClientCustomizations(chat, context, activeClient.clientId, activeClient.customizations, { quiet: true });
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
	 *
	 * The owning session comes from `context` like every other addressed chat
	 * operation, so the session-shaped first parameter is unused.
	 */
	async truncateChat(chat: URI, turnId: string | undefined, context?: URI | IAgentChatContext): Promise<void> {
		if (!context) {
			throw new Error(`[Claude] truncateChat requires host chat context for ${chat.toString()}`);
		}
		const initialContext = this._resolveChatContext(chat, context);
		await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, context);
			const existing = current.target;
			const sdkSessionId = current.sdkSessionId;
			if (!sdkSessionId) {
				throw new Error(`Cannot truncate chat ${chat.toString()}: backing SDK session not found`);
			}
			if (existing && !existing.isPipelineReady) {
				this._logService.info(`[Claude:${sdkSessionId}] truncateChat on a provisional chat — nothing to truncate`);
				return;
			}

			if (turnId === undefined) {
				await this._removeAllTurns(current, sdkSessionId, existing);
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
			const live = existing ?? await this._ensureResolvedChatSession(current);
			await live.truncateToTurn(turnId, anchor, current.resource);
			this._logService.info(`[Claude:${sdkSessionId}] truncateChat kept [0..${turnId}] (anchor=${anchor})`);
		});
	}

	/**
	 * Remove-all ("start over") branch of {@link truncateChat}: there is no
	 * anchor to resume at, so tear down the live Query, delete the on-disk
	 * transcript via the SDK, then recreate a fresh provisional bound to the
	 * SAME chat and SDK id, so the next `sendMessage` materializes non-resume
	 * `{ sessionId }` on a clean transcript. `deleteSession` is eagerly durable
	 * (unlike the lazy `turnId` path), matching its "clear / start over"
	 * semantic. `existing` is the live session, or `undefined` on the cold path
	 * (unloaded chat).
	 *
	 * The SDK's own record is read BEFORE the delete so the cold path still
	 * recovers the working directory the recreated conversation needs — after
	 * `deleteSession` the transcript (and its `cwd`) may be gone. Caller
	 * serializes on {@link _sessionSequencer}.
	 */
	private async _removeAllTurns(context: IResolvedClaudeChatContext, sdkSessionId: string, existing: ClaudeAgentSession | undefined): Promise<void> {
		const info = existing ? undefined : await this._sdkService.getSessionInfo(sdkSessionId);
		const workingDirectories = existing?.workingDirectories
			?? (info?.cwd ? [URI.file(info.cwd)] : undefined);
		await existing?.shutdownLiveQuery();
		if (existing) {
			this._deleteSession(existing);
		}
		await this._sdkService.deleteSession(sdkSessionId);
		const fresh = await this._createProvisionalChatSession(context.configurationResource, context.chat, context.resource, workingDirectories);
		await fresh.pruneAllTurns(context.resource);
		this._logService.info(`[Claude:${sdkSessionId}] truncateChat removed all turns (deleteSession + fresh same-id)`);
	}

	// ---- Chat surface ------------------------------------------------------
	//
	// `chats` exposes the per-chat operations addressed by a single, concrete
	// chat channel URI. Every chat's SDK id comes from the host-bound
	// provider data ({@link _chatBackings}); AH supplies any transient
	// operation context required to materialize that SDK conversation.

	/**
	 * The chat-addressed operation surface
	 * ({@link IAgentChats}). Every method addresses a chat by a single,
	 * already-resolved chat URI; `createChat` additionally receives transient
	 * host context from AH (see {@link IAgentChats.createChat}) — this maps to
	 * the `(session, chat)` pair the agent's internal SDK storage is keyed by
	 * (via {@link _resolveChatContext}).
	 *
	 * `createChat` is the only creation seam. It neither knows nor asks whether
	 * the chat it is creating is a session's first chat or an additional one,
	 * and there is no separate fork entry point: a fork is just a creation
	 * whose options name a source ({@link IAgentCreateChatOptions.fork}), so
	 * every creation form (fresh, fork, import, side chat) runs the one
	 * algorithm in {@link _createChat}.
	 */
	readonly chats: IAgentChats = {
		createChat: (chat, context, options) =>
			this._createChat(chat, resolveAgentChatContext(context, chat), options),
		disposeChat: (chat, context) => this._disposeChat(chat, context),
		releaseChat: (chat, context) => this._releaseChat(chat, context),
		sendMessage: (chatUri, prompt, workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientTypeOrContext, context) => {
			const workingDirectories = Array.isArray(workingDirectoriesOrDirectory) ? workingDirectoriesOrDirectory : workingDirectoriesOrDirectory ? [workingDirectoriesOrDirectory] : undefined;
			const operationContext = context ?? (typeof clientTypeOrContext === 'string' ? undefined : clientTypeOrContext);
			return this._sendMessage(chatUri, prompt, workingDirectories, attachments, turnId, senderClientId, operationContext);
		},
		abort: (chatUri, context) => {
			return this._abortSession(chatUri, context);
		},
		getModel: chatUri => this._chatBackings.get(chatUri.toString())?.model,
		changeModel: (chatUri, model, context) => {
			return this._changeModel(chatUri, model, context);
		},
		changeAgent: (chatUri, agent, context) => {
			return this._changeAgent(chatUri, agent, context);
		},
		getMessages: (chat, context) => this._getChatMessages(chat, context),
	};

	/**
	 * Builds the SDK `canUseTool` permission bridge for a session/chat. The
	 * resolver searches every live SDK conversation by SDK id so one
	 * chat's tool-permission requests reach its own pending-permission registry.
	 *
	 * `configurationResource` is the session-wide config scope, distinct from
	 * the invoking chat's own `resource` — a peer/side chat has its own
	 * `resource` but shares its owning session's `configurationResource`.
	 * `ExitPlanMode`'s permission-mode write (the bridge's one config
	 * mutation) must target that shared scope regardless of which chat
	 * approved the plan.
	 */
	private _makeCanUseTool(sdkSessionId: string, configurationResource: URI): NonNullable<Options['canUseTool']> {
		return (toolName, input, options) =>
			handleCanUseTool(
				{
					getSession: id => this._findSessionBySdkId(id),
					configurationService: this._configurationService,
					configurationResource,
					serverToolHost: this._serverToolHost,
				},
				sdkSessionId, toolName, input, options,
			);
	}

	/**
	 * Builds the SDK `onElicitation` bridge for a session/chat. Mirrors
	 * {@link _makeCanUseTool}: resolves the session by SDK id (all live
	 * chats) and delegates to the elicitation bridge, which parks on the
	 * session's user-input channel.
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
	private async _materializeProvisional(sessionId: string, context: IResolvedClaudeChatContext, workingDirectories?: readonly URI[]): Promise<ClaudeAgentSession> {
		const session = this._findAnySession(sessionId);
		if (!session) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const resource = context.resource;
		// Fail fast on a signed-out proxy before building anything, keeping the
		// throw at this pre-`try` site so a transient auth failure leaves the
		// provisional session intact for the next send to retry (rather than
		// disposing it). The resolved transport is handed to materialize as a
		// value: the agent owns transport resolution (it holds the live proxy
		// handle), the session just consumes it. A later per-session provider
		// switch is pushed in separately at send time (see `hasPendingTransportSwitch`).
		const transport = this._ensureAuthenticated(session.provisionalModel);

		const canUseTool = this._makeCanUseTool(sessionId, context.configurationResource);
		const onElicitation = this._makeOnElicitation(sessionId);
		this._recordChatScope(context.chat, context.configurationResource, context.resource);
		try {
			await session.materialize({
				transport,
				canUseTool,
				onElicitation,
				isResume: false,
				resource,
				configResource: context.configurationResource,
				customizations: context.customizations,
				workingDirectories,
				serverToolHost: this._serverToolHost,
			});
			await this._persistSessionOverlay(resource, context.configurationResource, session, transport.kind);
			if (session.abortController.signal.aborted) {
				throw new CancellationError();
			}
		} catch (err) {
			this._deleteSession(session);
			throw err;
		}

		// Emit the full resolved set (index 0 = process root, 1..N = additional
		// roots). Falls back to the session's own ordered set when the host
		// didn't hand us one (e.g. workspace-less single-root).
		const materializedWorkingDirectories = workingDirectories ?? session.workingDirectories;

		// Pass the resolved directories before the materialize event updates them in the state manager.
		this._checkpointService.captureBaselineCheckpoint(context.configurationResource, materializedWorkingDirectories).catch(err => {
			this._logService.warn(`[Claude:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
		});

		this._onDidMaterializeChat.fire({
			chat: context.chat,
			project: session.project,
			workingDirectories: materializedWorkingDirectories,
		});

		return session;
	}

	private async _persistSessionOverlay(resource: URI, configResource: URI, session: ClaudeAgentSession, transportKind: ClaudeTransport['kind']): Promise<void> {
		try {
			await this._metadataStore.write(resource, {
				customizationDirectory: session.workingDirectory,
				model: session.provisionalModel,
				permissionMode: readClaudePermissionMode(this._configurationService, configResource) ?? session.permissionModeFallback,
				transport: transportKind,
				workingDirectories: session.workingDirectories,
				...(session.provisionalAgent ? { agent: session.provisionalAgent } : {}),
			});
		} catch (err) {
			this._logService.error(`[Claude] Failed to persist customization directory; aborting materialize`, err);
			throw err;
		}
	}

	/**
	 * Pull `permissionMode` out of the post-validation `IAgentCreateChatOptions.config`
	 * bag, narrowing the runtime `unknown` value to the SDK's `PermissionMode`
	 * union (5/6 values, excluding `dontAsk`; sdk.d.ts:1560). Falls back to
	 * `'default'` when the bag is absent or carries something the schema
	 * validator shouldn't have accepted (defense-in-depth).
	 */
	private _resolvePermissionMode(config: Record<string, unknown> | undefined): ClaudePermissionMode {
		return narrowClaudePermissionMode(config?.[ClaudeSessionConfigKey.PermissionMode]) ?? 'default';
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

	// #region Chat creation — the one algorithm every chat is created by

	/**
	 * The single chat-creation algorithm.
	 *
	 * Every chat Agent Host creates runs exactly this path — a session's first
	 * chat, an additional chat, a fork, or an import. There is no
	 * session-versus-additional branch and no provider-side chat role: this
	 * consumes the fully-resolved options AH hands over (model, agent, working
	 * directories, project, config, active client, plus the optional
	 * import / fork sources), binds the addressed chat to exactly
	 * one SDK conversation, records that conversation as the chat's exact
	 * opaque backing, and hands the backing back.
	 *
	 * The result reports what this creation resolved for the chat itself — the
	 * resolved `project` / `resolvedWorkingDirectory`, and the `provisional`
	 * bit for a runtime that has not reached the SDK yet — next to the opaque
	 * `providerData` blob and the separately-enumerable `backingSession` AH
	 * suppresses from its session list. There is no `session` field: what any
	 * of that means for the chat's role in the session is Agent Host's
	 * decision, not this provider's.
	 */
	private async _createChat(chat: URI, context: IAgentChatContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		// `importConversation.model` (mirroring Copilot's `_importConversation`)
		// is the effective model of the imported turns' originating conversation,
		// not a caller override, so it takes precedence over `options.model`.
		// Mutually exclusive with `options.fork` (per the contract), so it never
		// changes the model a fork inherits below.
		const model = options?.importConversation?.model ?? options?.model;
		// An inherited model is resolved from the source conversation at materialization.
		if (model || !options?.fork) {
			this._ensureAuthenticated(model);
		}
		const chatKey = chat.toString();
		// Record this chat's own scope now — the only place a later fork
		// naming this chat as its source resolves that source's scope from.
		this._recordChatScope(chat, context.configurationResource, context.resource);
		return this._sessionSequencer.queue(chatKey, async () => {
			const existing = this._chatBackings.get(chatKey);
			const created = existing
				? this._recreatedChatResult(existing, options)
				: await this._bindChatConversation(chat, context, model, options);
			// Seed the eagerly-claimed active client on every creation, including
			// an idempotent re-create: AgentService re-issues provisioning for an
			// existing chat on reconnect, so the reconnected client's tools and
			// customizations must still reach Claude.
			await this._seedEagerActiveClient(chat, context, options?.activeClient);
			return created;
		});
	}

	/**
	 * Re-creation of a chat this provider already backs: hand the recorded
	 * backing back verbatim so the orchestrator re-persists a consistent blob,
	 * together with whatever its live runtime (if any) has resolved so far.
	 */
	private _recreatedChatResult(backing: IClaudeChatBacking, options?: IAgentCreateChatOptions): IAgentCreateChatResult {
		const live = this._findAnySession(backing.sdkSessionId);
		const resolvedWorkingDirectory = live?.workingDirectory ?? options?.workingDirectories?.[0];
		return {
			...(live?.project ? { project: live.project } : {}),
			...(resolvedWorkingDirectory ? { resolvedWorkingDirectory } : {}),
			...(live && !live.isPipelineReady ? { provisional: true } : {}),
			...this._chatBackingResult(backing),
		};
	}

	/**
	 * Bind the addressed chat to exactly one SDK conversation: the one
	 * inherited from a fork source when that source resolves, a
	 * freshly minted one otherwise.
	 */
	private async _bindChatConversation(chat: URI, context: IAgentChatContext, model: ModelSelection | undefined, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		const inherited = await this._inheritSourceConversation(options);
		return inherited.sdkSessionId !== undefined
			? this._bindInheritedConversation(chat, context, { ...inherited, sdkSessionId: inherited.sdkSessionId }, model, options)
			: this._bindFreshConversation(chat, context, inherited, model, options);
	}

	/**
	 * Resolve the SDK conversation a new chat inherits from its fork or
	 * fork source.
	 *
	 * An unresolvable source — the source chat has no backing, or its turn is
	 * absent from the SDK transcript, which is the normal case for a source
	 * conversation that is still live and unflushed — is deliberately not
	 * fatal: the chat is created fresh instead of inheriting the whole source
	 * backend or failing outright. A fresh backing is a degraded branch rather
	 * than a lost chat.
	 */
	private async _inheritSourceConversation(options?: IAgentCreateChatOptions): Promise<IClaudeInheritedConversation> {
		if (!options?.fork) {
			return {};
		}
		const forked = await this._forkChat(options.fork);
		return {
			...(forked ? { sdkSessionId: forked.sessionId } : {}),
			...(forked?.inheritedTurnId !== undefined ? { inheritedTurnId: forked.inheritedTurnId } : {}),
		};
	}

	/**
	 * Bind a chat to an SDK conversation inherited from a fork
	 * source. That conversation already owns a transcript on disk, so nothing
	 * is materialized here: recording the backing alone routes the chat's first
	 * send through {@link _createProvisionalChatSession}, which cold-resumes it
	 * (`isResume: true`) exactly like any other restored chat — see CONTEXT M9.
	 * Its resolved settings are persisted to the overlay right away precisely
	 * because there is no in-memory runtime holding them in the meantime.
	 *
	 * Everything inherited comes from the source's own provider state (its SDK
	 * `cwd`, its live runtime, its overlay); host-supplied options override it.
	 */
	private async _bindInheritedConversation(
		chat: URI,
		context: IAgentChatContext,
		inherited: IClaudeInheritedConversation & { readonly sdkSessionId: string },
		model: ModelSelection | undefined,
		options?: IAgentCreateChatOptions,
	): Promise<IAgentCreateChatResult> {
		const { sdkSessionId } = inherited;
		// The source's settings live under its own exact persistence resource —
		// the same key its own overlay was written under (see the write below
		// and `_persistSessionOverlay`) — never the shared configuration scope.
		// That resource is the one this provider recorded when the source chat
		// was itself created or materialized ({@link _sourceChatScope}); a
		// source whose scope was never recorded (no chat backing yet, e.g. a
		// stale reference) degrades to the source URI itself, which is exactly
		// its own persistence resource for any chat that isn't a session's
		// primary chat.
		const sourceChat = options?.fork?.source;
		const sourceBinding = sourceChat ? this._sourceChatScope(sourceChat) : undefined;
		const sourceResource = sourceBinding?.resource ?? sourceChat ?? context.resource;
		let sourceOverlay: IClaudeSessionOverlay = {};
		try {
			sourceOverlay = await this._metadataStore.read(sourceResource);
		} catch (err) {
			this._logService.warn(`[Claude] createChat: source overlay read failed for ${sourceResource.toString()}; continuing with defaults`, err);
		}
		const sourceSdkId = sourceChat ? this._sourceChatSdkId(sourceChat) : undefined;
		const liveSource = sourceSdkId ? this._findAnySession(sourceSdkId) : undefined;
		// A source that was created (recording a backing model) but never
		// materialized has no overlay entry yet, so the backing's own model —
		// the last resort, below the overlay once one exists — is the only
		// place its intended model survives a cold restart.
		const backingModel = sourceChat ? this._chatBackings.get(sourceChat.toString())?.model : undefined;
		const inheritedModel = model ?? liveSource?.provisionalModel ?? sourceOverlay.model ?? backingModel;
		const agent = options?.agent ?? liveSource?.provisionalAgent ?? sourceOverlay.agent;
		const permissionMode = narrowClaudePermissionMode(options?.config?.[ClaudeSessionConfigKey.PermissionMode]) ?? liveSource?.permissionModeFallback ?? sourceOverlay.permissionMode;

		// Resolve the inherited conversation's working directories now so we
		// fail fast rather than at the first `sendMessage`. The forked
		// conversation's own `cwd` is authoritative; its additional roots come
		// from the live source or, when the source is unloaded, its overlay.
		// The requested set is the last resort — an inherited conversation runs
		// where its transcript was recorded, not where the request pointed.
		const sdkInfo = await this._sdkService.getSessionInfo(sdkSessionId);
		const inheritedDirectories = liveSource?.workingDirectories ?? sourceOverlay.workingDirectories ?? options?.workingDirectories;
		const workingDirectory = sdkInfo?.cwd ? URI.file(sdkInfo.cwd) : inheritedDirectories?.[0];
		if (!workingDirectory) {
			throw new Error(`Cannot create chat ${chat.toString()}: inherited conversation ${sdkSessionId} has no working directory (SDK cwd and source working directories missing)`);
		}
		const workingDirectories = [workingDirectory, ...(inheritedDirectories?.slice(1) ?? [])];

		// Every later resolution/materialize site
		// (`_createProvisionalChatSession`, `_persistSessionOverlay`) reads this
		// chat's overlay back by its host-supplied persistence resource, so key
		// the write to exactly that.
		await this._metadataStore.write(context.resource, {
			...(inheritedModel ? { model: inheritedModel } : {}),
			...(permissionMode ? { permissionMode } : {}),
			...(agent ? { agent } : {}),
			workingDirectories,
		});
		const project = await this._resolveProject(workingDirectory);
		const backing = this._recordChatBacking(chat, {
			sdkSessionId,
			...(inheritedModel ? { model: inheritedModel } : {}),
		});
		this._logService.info(`[Claude] Bound chat ${chat.toString()} to inherited conversation ${sdkSessionId} for scope ${context.configurationResource.toString()}`);
		return {
			resolvedWorkingDirectory: workingDirectory,
			...(project ? { project } : {}),
			...(inherited.inheritedTurnId !== undefined ? { inheritedTurnId: inherited.inheritedTurnId } : {}),
			...this._chatBackingResult(backing),
		};
	}

	/**
	 * Bind a chat to a freshly minted SDK conversation, whose id is independent
	 * of the Agent Host session id. The conversation is provisional: nothing
	 * reaches the SDK (and nothing is persisted) until the chat's first send
	 * materializes it, so the in-memory {@link ClaudeAgentSession} carries the
	 * resolved model / agent / config / permission mode until
	 * {@link _persistSessionOverlay} writes them at materialize time.
	 *
	 * `importConversation` has no native transcript-seeding capability on
	 * Claude (unlike Copilot's JSONL event-log import): there is no SDK API to
	 * seed a conversation from arbitrary `Turn[]`. The imported turns' display
	 * is the host-level catalog's responsibility until this chat's first real
	 * `sendMessage` starts a genuine SDK transcript.
	 */
	private async _bindFreshConversation(
		chat: URI,
		context: IAgentChatContext,
		inherited: IClaudeInheritedConversation,
		model: ModelSelection | undefined,
		options?: IAgentCreateChatOptions,
	): Promise<IAgentCreateChatResult> {
		const sdkSessionId = generateUuid();
		// A chat AH resolved no working directory for (a workspace-less quick
		// chat) runs in a stable per-session scratch dir shared with the Copilot
		// agent; without a cwd Claude throws at materialize. The workspace-less
		// marker itself is owned/persisted centrally by the AH service.
		const requestedWorkingDirectory = options?.workingDirectories?.[0];
		const workingDirectory = requestedWorkingDirectory ?? await ensureWorkspacelessScratchDir(this._environmentService.userHome, AgentSession.id(context.configurationResource));
		// Only probe for a project when AH resolved a real folder; a scratch dir
		// is never a code project.
		const project = requestedWorkingDirectory ? await this._resolveProject(requestedWorkingDirectory) : undefined;
		const backing = this._recordChatBacking(chat, {
			sdkSessionId,
			...(model ? { model } : {}),
		});
		const session = ClaudeAgentSession.createProvisional(
			sdkSessionId,
			chat,
			workingDirectory,
			project,
			model,
			options?.agent,
			options?.config,
			new PendingRequestRegistry<CallToolResult>(),
			this._resolvePermissionMode(options?.config),
			this._instantiationService,
			options?.workingDirectories?.slice(1) ?? [],
		);
		this._registerLiveChat(chat, session);
		this._logService.info(`[Claude] Bound chat ${chat.toString()} to fresh conversation ${sdkSessionId} for scope ${context.configurationResource.toString()}`);
		return {
			resolvedWorkingDirectory: workingDirectory,
			provisional: true,
			...(project ? { project } : {}),
			...this._chatBackingResult(backing),
		};
	}

	/** Record a chat's exact backing, replacing any previous one. */
	private _recordChatBacking(chat: URI, backing: IClaudeChatBacking): IClaudeChatBacking {
		this._chatBackings.set(chat.toString(), backing);
		return backing;
	}

	/** Best-effort git project metadata for a resolved working directory. */
	private async _resolveProject(workingDirectory: URI): Promise<IAgentSessionProjectInfo | undefined> {
		try {
			return await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
		} catch (err) {
			this._logService.warn(`[Claude] project resolution failed for ${workingDirectory.toString()}; continuing without project`, err);
			return undefined;
		}
	}

	/**
	 * Dispose exactly one chat, tearing down its live SDK session (if any) and
	 * dropping its backing.
	 *
	 * Routed through {@link _sessionSequencer} (keyed on the chat's SDK id) so
	 * it waits for any in-flight {@link _resolveOrResumeChatSessionLocked} or
	 * {@link sendMessage} to finish before tearing down — prevents
	 * use-after-dispose if a send is concurrently in progress. The durable
	 * chat catalog is owned by the orchestrator now, so this only drops the
	 * live session and its provider backing data. There is no separate
	 * session-level finalization hook: the trace context keyed on the chat's
	 * own `resource` (the configuration scope, for a session's primary chat)
	 * is released right here, once, when that exact chat is disposed.
	 */
	private async _disposeChat(chat: URI, operationContext: URI | IAgentChatContext): Promise<void> {
		const chatKey = chat.toString();
		const initialContext = this._resolveChatContext(chat, operationContext);
		await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
			const target = this._findChatByUri(chatKey);
			if (target) {
				await this._disposeLiveSession(target);
			}
			this._chatBackings.delete(chatKey);
			this._chatConfigScopes.delete(chatKey);
			this._pruneActiveClientHandlesForChat(chat);
			this._otelService.releaseSessionTraceContext(initialContext.resource.toString());
		});
		// The Claude SDK exposes no delete-chat RPC, so the forked /
		// fresh transcript is left on disk; without a catalog entry it is never
		// resumed again.
	}

	private async _releaseChat(chat: URI, operationContext: URI | IAgentChatContext): Promise<void> {
		const chatKey = chat.toString();
		const initialContext = this._resolveChatContext(chat, operationContext);
		await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
			const target = this._findChatByUri(chatKey);
			if (!target || !target.isPipelineReady || target.hasActiveTurn) {
				return;
			}
			this._logService.info(`[Claude:${target.sessionId}] Releasing idle chat from memory (durable state preserved)`);
			await this._disposeLiveSession(target);
			// NB: `_chatBackings` retains the backing across release so the chat
			// resolves uniformly on the next cold resume-on-send.
		});
	}

	/**
	 * Fork the source chat's SDK conversation at the requested turn and return
	 * the new conversation's id plus the id of its final inherited turn. Returns
	 * `undefined` — so the caller mints a fresh conversation instead — when the
	 * source chat has no backing or the fork anchor is absent from the SDK
	 * transcript.
	 *
	 * Deliberately NOT serialized against the source conversation: a side chat
	 * branches from a turn that is typically still in flight, so waiting for
	 * the source's sequencer would park the new chat behind the very turn it
	 * branches from. The SDK's flushed transcript is read-only here.
	 */
	private async _forkChat(fork: { readonly source: URI; readonly turnId: string }): Promise<{ sessionId: string; inheritedTurnId: string | undefined } | undefined> {
		const sourceSdkId = this._sourceChatSdkId(fork.source);
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
		const inheritedTurns = mapSessionMessagesToTurns(messages.slice(0, anchorIndex + 1), fork.source, this._logService);
		return { sessionId, inheritedTurnId: inheritedTurns.at(-1)?.id };
	}


	/** Resolves the SDK conversation recorded for an exact source chat. */
	private _sourceChatSdkId(source: URI): string | undefined {
		return this._chatBackings.get(source.toString())?.sdkSessionId;
	}

	/**
	 * Returns the live {@link ClaudeAgentSession} for an exact chat, resuming
	 * its provider backing when necessary. The caller holds the chat sequencer.
	 */
	private async _resolveOrResumeChatSessionLocked(context: IResolvedClaudeChatContext, workingDirectories?: readonly URI[]): Promise<ClaudeAgentSession> {
		const { configurationResource, chat, chatKey, resource } = context;
		const existing = this._findChatByUri(chatKey);
		if (existing?.isPipelineReady) {
			return existing;
		}
		// The send's own resolved snapshot is the last-resort placement for a
		// chat whose conversation never reached the SDK and whose overlay was
		// never written (a fresh chat created in a previous window).
		const chatSession = existing ?? await this._createProvisionalChatSession(configurationResource, chat, resource, workingDirectories);
		// Resume when the SDK already has a transcript for this chat
		// (forked or restored); otherwise materialize a fresh one.
		const sdkInfo = await this._sdkService.getSessionInfo(chatSession.sessionId);
		// Fail fast on a signed-out proxy before materializing, keeping the throw at
		// this pre-`try` site so the freshly-built chat is left registered for a
		// retry rather than disposed. The resolved transport is passed into materialize
		// as a value; a per-session provider switch is pushed in later at send time.
		const transport = this._ensureAuthenticated(chatSession.provisionalModel);
		const canUseTool = this._makeCanUseTool(chatSession.sessionId, configurationResource);
		const onElicitation = this._makeOnElicitation(chatSession.sessionId);
		this._recordChatScope(chat, configurationResource, resource);
		try {
			await chatSession.materialize({
				transport,
				canUseTool,
				onElicitation,
				isResume: !!sdkInfo,
				resource,
				configResource: configurationResource,
				customizations: context.customizations,
				workingDirectories,
				serverToolHost: this._serverToolHost,
			});
			await this._persistSessionOverlay(resource, configurationResource, chatSession, transport.kind);
		} catch (err) {
			this._deleteLiveChat(chatKey);
			throw err;
		}
		this._onDidMaterializeChat.fire({
			chat: context.chat,
			project: chatSession.project,
			workingDirectories: workingDirectories ?? chatSession.workingDirectories,
		});
		return chatSession;
	}

	/**
	 * Resolves the live runtime for an addressed chat, materializing or
	 * cold-resuming its exact backing as needed.
	 *
	 * Uniform for every chat: there is one provider state to consult (the
	 * chat's exact backing) and one shape of resolution. A chat with no
	 * backing is a host contract violation — Agent Host creates or
	 * re-materializes a backing before addressing any operation to a chat —
	 * so it surfaces rather than being guessed at from the session identity.
	 */
	private async _ensureResolvedChatSession(context: IResolvedClaudeChatContext, workingDirectories?: readonly URI[]): Promise<ClaudeAgentSession> {
		const existing = context.target;
		if (existing?.isPipelineReady) {
			return existing;
		}
		if (existing) {
			return this._materializeProvisional(existing.sessionId, context, workingDirectories);
		}
		return this._resolveOrResumeChatSessionLocked(context, workingDirectories);
	}

	/**
	 * Build a provisional {@link ClaudeAgentSession} from an exact chat backing
	 * and its provider-owned overlay.
	 */
	private async _createProvisionalChatSession(configurationResource: URI, chat: URI, resource: URI, fallbackWorkingDirectories?: readonly URI[]): Promise<ClaudeAgentSession> {
		const info = this._chatBackings.get(chat.toString());
		if (!info) {
			throw new Error(`[Claude] no backing chat for chat ${chat.toString()}`);
		}
		let overlay: IClaudeSessionOverlay = {};
		try {
			overlay = await this._metadataStore.read(resource);
		} catch (err) {
			this._logService.warn(`[Claude] chat overlay read failed for ${chat.toString()}; continuing with defaults`, err);
		}
		const sdkInfo = await this._sdkService.getSessionInfo(info.sdkSessionId);
		// `fallbackWorkingDirectories` is only supplied by remove-all, which
		// captures the set before deleting the SDK transcript that would
		// otherwise answer for it.
		const workingDirectories = sdkInfo?.cwd
			? [URI.file(sdkInfo.cwd), ...(overlay.workingDirectories?.slice(1) ?? [])]
			: overlay.workingDirectories ?? fallbackWorkingDirectories;
		const workingDirectory = workingDirectories?.[0];
		if (!workingDirectory) {
			throw new Error(`[Claude] cannot materialize chat ${chat.toString()}: working directory missing (no SDK transcript and no persisted overlay)`);
		}
		const additionalDirectories = workingDirectories.slice(1);
		let project: IAgentSessionProjectInfo | undefined;
		try {
			project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
		} catch (err) {
			this._logService.warn(`[Claude] project resolution failed for chat ${chat.toString()}; continuing without project`, err);
		}
		const permissionMode = readClaudePermissionMode(this._configurationService, configurationResource) ?? overlay.permissionMode ?? 'default';
		// Overlay takes precedence over the backing: `changeModel` always writes
		// the overlay first (via `setModel` or `_metadataStore.write`) and then
		// the backing. If the backing update is lost, the overlay already holds
		// the newest model; preferring it here ensures a model change is never
		// silently reverted after a restart.
		const model = overlay.model ?? info.model;
		const chatSession = ClaudeAgentSession.createProvisional(
			info.sdkSessionId,
			chat,
			workingDirectory,
			project,
			model,
			overlay.agent,
			undefined,
			new PendingRequestRegistry<CallToolResult>(),
			permissionMode,
			this._instantiationService,
			additionalDirectories,
		);
		this._registerLiveChat(chat, chatSession);
		this._recordChatScope(chat, configurationResource, resource);
		// The chat now has a live runtime, so re-apply the contributions of
		// every client addressed to this exact chat. This replaces nothing —
		// it only pushes each handle's already-assigned tools/customizations
		// into the conversation that just came up.
		this._forEachActiveClientHandleForChat(chat, handle => handle.refresh());
		return chatSession;
	}

	/** Visits the active-client handles Agent Host registered for the exact `chat`. */
	private _forEachActiveClientHandleForChat(chat: URI, visit: (handle: ClaudeActiveClientHandle) => void): void {
		const prefix = `${chat.toString()}\u0000`;
		for (const [key, handle] of this._activeClientHandles) {
			if (key.startsWith(prefix)) {
				visit(handle);
			}
		}
	}

	/** Drops every active-client handle addressed to the exact `chat`, e.g. on dispose. */
	private _pruneActiveClientHandlesForChat(chat: URI): void {
		const prefix = `${chat.toString()}\u0000`;
		for (const key of [...this._activeClientHandles.keys()]) {
			if (key.startsWith(prefix)) {
				this._activeClientHandles.delete(key);
			}
		}
	}

	/**
	 * Update a concrete chat backing's model and push the refreshed opaque
	 * `providerData` blob to the orchestrator (via
	 * {@link onDidChangeChatData}) so the durable catalog stays in sync.
	 */
	private async _updateChatBackingModel(chat: URI, model: ModelSelection): Promise<void> {
		const existing = this._chatBackings.get(chat.toString());
		if (!existing) {
			return;
		}
		const updated: IClaudeChatBacking = { ...existing, model };
		this._chatBackings.set(chat.toString(), updated);
		this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(_toPersistedChat(updated)) });
	}

	/**
	 * Re-attach a concrete chat backing from opaque provider data, recording
	 * its exact scope binding (configuration scope AND own persistence
	 * resource) so a later fork naming this chat as its source can resolve
	 * both without deriving them from URI shape. This is the sole restore
	 * path for a chat that was never (re-)created in this process — a cold
	 * chat — so it is the only place that scope binding exists for it.
	 */
	async materializeChat(chat: URI, context: URI | IAgentChatContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
		const resolved = resolveAgentChatContext(context, chat);
		this._recordChatScope(chat, resolved.configurationResource, resolved.resource);
		if (providerData === undefined) {
			if (!isDefaultChatUri(chat)) {
				return;
			}
			const backing = { sdkSessionId: AgentSession.id(resolved.configurationResource) };
			this._chatBackings.set(chat.toString(), backing);
			return { providerData: encodeProviderData(_toPersistedChat(backing)) };
		}
		const persisted = decodeProviderData(providerData);
		if (!persisted) {
			this._logService.warn(`[Claude] materializeChat: dropping corrupt providerData for ${chat.toString()}`);
			return;
		}
		this._chatBackings.set(chat.toString(), {
			sdkSessionId: persisted.sdkSessionId,
			...(persisted.model ? { model: persisted.model } : {}),
		});
	}

	/**
	 * Recover the historical implicit default-chat SDK identity for a
	 * session that predates the exact-chat catalog's persisted
	 * `providerData`: before exact-chat backings existed, a session's
	 * primary chat was simply the SDK conversation sharing the session's
	 * own id (`AgentSession.id(session)`) — no separate blob was ever
	 * written to decode. Uses only the host-supplied
	 * `context.configurationResource` (never derives or recognizes a
	 * default-chat shape from `chat` itself, per the exact-chat-only
	 * restore contract) and records it as a plain, canonical exact backing.
	 * From here on the recovered chat resolves, routes, truncates, and
	 * releases exactly like every other chat.
	 *
	 * Performs no SDK I/O and reads no legacy metadata, so it is idempotent
	 * (recomputes the same identity on every call, and keeps an
	 * already-recorded backing) and non-destructive. Returns the canonical
	 * opaque blob so the orchestrator can persist it additively going
	 * forward.
	 */
	async recoverLegacyChat(chat: URI, context: URI | IAgentChatContext): Promise<IAgentCreateChatResult> {
		const { configurationResource, resource } = resolveAgentChatContext(context, chat);
		const chatKey = chat.toString();
		const backing = this._chatBackings.get(chatKey) ?? { sdkSessionId: AgentSession.id(configurationResource) };
		this._chatBackings.set(chatKey, backing);
		this._recordChatScope(chat, configurationResource, resource);
		return { providerData: encodeProviderData(_toPersistedChat(backing)) };
	}

	private async _getChatMessages(chat: URI, context: URI | IAgentChatContext): Promise<readonly Turn[]> {
		return this._readChatMessages(this._resolveChatContext(chat, context));
	}

	// #endregion

	/**
	 * Test-only accessor for the materialized {@link ClaudeAgentSession}, so
	 * tests can inspect `_isResumed` directly. Marked `ForTesting` so the
	 * production surface stays unaware of its existence; the protocol
	 * surface (`IAgent`) does not include it.
	 */
	getSessionForTesting(session: URI): ClaudeAgentSession | undefined {
		const sess = this._findChatByUri(URI.parse(buildDefaultChatUri(session))) ?? this._findAnySession(AgentSession.id(session));
		return sess?.isPipelineReady ? sess : undefined;
	}

	private async _readChatMessages(context: IResolvedClaudeChatContext): Promise<readonly Turn[]> {
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
		if (context.spawnedFrom) {
			return this._readSubagentMessages(context);
		}

		const sess = context.target;
		if (sess && !sess.isPipelineReady) {
			// Provisional session: the SDK chat has never been materialized, so
			// there is no on-disk transcript to read. Logged because an empty
			// transcript is otherwise indistinguishable from a failed read.
			this._logService.info(`[Claude] getMessages: chat ${context.chatKey} is not materialized yet; returning no turns`);
			return [];
		}
		if (!context.sdkSessionId) {
			return [];
		}
		return this._reconstructTurns(context.sdkSessionId, context.chat, sess?.subagents);
	}

	/**
	 * Reconstruct a provider-spawned subagent chat's transcript.
	 *
	 * A subagent has no backing of its own: its turns live inside the spawning
	 * chat's SDK transcript, keyed by the tool call that delegated to it. Both
	 * halves of that spawn edge come from the host-supplied origin
	 * ({@link IResolvedClaudeChatContext.spawnedFrom}) — the provider neither
	 * recovers them from shared host state nor re-derives them from URI shape.
	 * Without an origin (or without the spawning chat's backing) there is
	 * nothing to read, and the transcript is empty.
	 */
	private async _readSubagentMessages(context: IResolvedClaudeChatContext): Promise<readonly Turn[]> {
		const spawnedFrom = context.spawnedFrom;
		if (!spawnedFrom) {
			return [];
		}
		const parentChat = spawnedFrom.chat;
		const parentSessionId = this._chatBackings.get(parentChat.toString())?.sdkSessionId;
		if (!parentSessionId) {
			return [];
		}
		const parentSession = this._findAnySession(parentSessionId);
		const store = new DisposableStore();
		const subagents = parentSession?.subagents ?? store.add(new SubagentRegistry());
		try {
			if (!parentSession) {
				await this._reconstructTurns(parentSessionId, parentChat, subagents);
			}
			return await getSubagentTranscript(context.chat, parentChat, parentSessionId, spawnedFrom.toolCallId, subagents, this._sdkService, this._logService, CancellationToken.None);
		} catch (err) {
			this._logService.warn(`[Claude] getSubagentTranscript threw for ${context.chatKey}`, err);
			return [];
		} finally {
			store.dispose();
		}
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

	private async _listClaudeCodeChats(): Promise<IAgentChatMetadata[] | undefined> {
		// SDK is the source of truth; we deliberately do NOT filter entries
		// that lack a per-session DB — external Claude Code CLI sessions have
		// no DB and must still surface. The SDK entry supplies the
		// authoritative primary directory; an optional per-session overlay
		// hydrates the additional-directory tail. External sessions without
		// an overlay remain valid single-root entries.
		//
		// The orchestrator enumerates every provider independently. If our SDK dynamic import
		// fails (corrupt install, missing optional dep) and we let it reject,
		// *every* provider's legacy list disappears — the sibling Copilot
		// provider gets nuked too. Catch and log instead.
		let sdkEntries: readonly SDKSessionInfo[];
		try {
			sdkEntries = await this._sdkService.listSessions();
		} catch (err) {
			// SDK failed to load/enumerate — this is "can't enumerate yet",
			// not an authoritative empty result, so callers must not treat it
			// as "no external chats" and should retry later.
			this._logService.warn('[Claude] SDK listSessions failed; deferring chat discovery', err);
			return undefined;
		}
		return Promise.all(sdkEntries.map(entry => {
			const session = AgentSession.uri(this.id, entry.sessionId);
			const chat = URI.parse(buildDefaultChatUri(session));
			return this._withPersistedWorkingDirectories(session, { chat, ...this._metadataStore.project(entry) });
		}));
	}

	startChatDiscovery(): Promise<void> {
		return this._startClaudeCodeChatDiscovery();
	}

	async listChatsToMigrate(): Promise<AgentChatMigrationResult> {
		if (!(await this._sdkService.canLoadWithoutDownload())) {
			this._logService.info('[Claude] SDK not downloaded yet; deferring the migratable chat list');
			return AgentChatMigrationDeferred;
		}
		const chats = await this._listClaudeCodeChats();
		if (!chats) {
			return undefined;
		}
		const limiter = new Limiter<IAgentChatMetadata | undefined>(4);
		const known = await Promise.all(chats.map(chat => limiter.queue(async () => {
			return await this._isKnownClaudeCodeChat(chat) ? chat : undefined;
		})));
		return known.filter((chat): chat is IAgentChatMetadata => chat !== undefined);
	}

	private _startClaudeCodeChatDiscovery(): Promise<void> {
		if (!this._claudeCodeChatDiscovery) {
			this._claudeCodeChatDiscovery = retry(async () => {
				// Waits for the SDK rather than pulling it down — see
				// {@link listChatsToMigrate}. Returning leaves the retry loop happy,
				// since no amount of retrying will make the user press Download.
				if (!(await this._sdkService.canLoadWithoutDownload())) {
					this._logService.info('[Claude] SDK not downloaded yet; deferring chat discovery');
					return;
				}
				if (!(await this._emitClaudeCodeChats())) {
					throw new Error('Claude chat catalog is not available');
				}
			}, 5000, 3)
				.catch(err => this._logService.warn('[Claude] Chat discovery failed', err));
		}
		return this._claudeCodeChatDiscovery;
	}

	/** Runs discovery again for whoever is still subscribed, after it deferred for want of an SDK. */
	private _restartChatDiscovery(): void {
		if (this._claudeCodeChatDiscovery) {
			this._claudeCodeChatDiscovery = undefined;
			void this._startClaudeCodeChatDiscovery();
		}
	}

	private async _emitClaudeCodeChats(): Promise<boolean> {
		try {
			const chats = await this._listClaudeCodeChats();
			if (chats) {
				const limiter = new Limiter<IAgentDiscoveredChat | undefined>(4);
				const unknown = await Promise.all(chats.map(chat => limiter.queue(async () => {
					return await this._isKnownClaudeCodeChat(chat) ? undefined : { ...chat, external: true };
				})));
				this._onDidDiscoverChats.fire(unknown.filter((chat): chat is IAgentDiscoveredChat => chat !== undefined));
				return true;
			}
		} catch (err) {
			this._logService.warn('[Claude] Failed to emit discovered chats', err);
		}
		return false;
	}

	private async _isKnownClaudeCodeChat(chat: IAgentChatMetadata): Promise<boolean> {
		try {
			const session = URI.parse(parseRequiredSessionUriFromChatUri(chat.chat));
			return await this._metadataStore.hasKnownSession(session);
		} catch (err) {
			this._logService.warn(`[Claude] Failed to inspect stored metadata for ${chat.chat.toString()}`, err);
			return false;
		}
	}

	/**
	 * Per-chat lookup. Accepts the external-CLI case: a session that exists
	 * on disk via the raw Anthropic CLI has no per-session DB, so this MUST
	 * NOT gate on the sidecar. The SDK is the source of truth for existence.
	 *
	 * The SDK entry supplies the authoritative primary directory; an optional
	 * per-session overlay hydrates the additional-directory tail. External
	 * sessions without an overlay remain valid single-root entries. Failures in
	 * the SDK lookup propagate (the caller is doing a single targeted fetch and
	 * should learn that the SDK module is broken).
	 */
	async getChatMetadata(chat: URI, context: URI | IAgentChatContext, providerData?: string): Promise<IAgentChatMetadata | undefined> {
		// Don't trigger a cold SDK download just to hydrate metadata during
		// restore (the renderer subscribes to the last-active session on
		// startup). When the SDK isn't local yet, defer; the download fires
		// once the user sends the first message.
		if (!(await this._sdkService.canLoadWithoutDownload())) {
			this._logService.info('[Claude] SDK not downloaded yet; deferring chat metadata until a session triggers the download');
			return undefined;
		}
		const { configurationResource } = resolveAgentChatContext(context, chat);
		const sessionId = providerData ? decodeProviderData(providerData)?.sdkSessionId : AgentSession.id(configurationResource);
		if (!sessionId) {
			return undefined;
		}
		const sdkInfo = await this._sdkService.getSessionInfo(sessionId);
		if (!sdkInfo) {
			return undefined;
		}
		return this._withPersistedWorkingDirectories(configurationResource, { chat, ...this._metadataStore.project(sdkInfo) });
	}

	/**
	 * Merge the persisted additional working directories (index 1..N) onto a
	 * projected metadata's `workingDirectories`, keeping the SDK-derived `cwd`
	 * as the authoritative primary. The SDK catalog only stores `cwd`, so the
	 * tail of a multi-root session lives in the per-session overlay. Sessions
	 * without an overlay (external Claude CLI, single-root) are returned as-is.
	 */
	private async _withPersistedWorkingDirectories(session: URI, meta: IAgentChatMetadata): Promise<IAgentChatMetadata> {
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

	resolveChatConfig(_params: IAgentResolveChatConfigParams): Promise<ResolveSessionConfigResult> {
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

	getInheritedChatConfig(config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
		const inherited: Record<string, unknown> = {};
		for (const key of [ClaudeSessionConfigKey.PermissionMode, SessionConfigKey.Permissions]) {
			if (config[key] !== undefined) {
				inherited[key] = config[key];
			}
		}
		return Object.keys(inherited).length > 0 ? inherited : undefined;
	}

	getAutonomousSessionConfig(_config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostAutoApprovePolicyRestrictedConfigKey) !== true
			? { [ClaudeSessionConfigKey.PermissionMode]: 'auto' satisfies ClaudePermissionMode }
			: undefined;
	}

	chatConfigCompletions(_params: IAgentChatConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		// Claude's only schema property is the `permissionMode` static enum,
		// so dynamic completion is definitionally empty.
		return Promise.resolve({ items: [] });
	}

	shutdown(): Promise<void> {
		// Drain provisional sessions FIRST so any in-flight `await
		// sdk.startup()` (kicked off by a racing `sendMessage`) observes the
		// abort and unwinds. Each provisional record's AbortController is
		// wired into Options.abortController at materialize time, so
		// aborting here flips the same signal the SDK is racing on.
		//
		// Then drain the materialized sessions through the existing
		// per-session {@link _disposeSequencer} routing (`Query.interrupt()`,
		// in-flight metadata writes).
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
				})
			));
			// Shutdown is terminal for this agent instance: drop every chat
			// backing (and every active-client handle addressed to one) so
			// nothing can be cold-resumed or re-contributed-to out of drained
			// in-memory state afterwards. Durable data is untouched — Agent
			// Host re-materializes each chat's backing on the next restore.
			this._chatBackings.clear();
			this._activeClientHandles.clear();
		})();
	}

	private async _sendMessage(chat: URI, prompt: string, workingDirectories: readonly URI[] | undefined, attachments?: readonly MessageAttachment[], turnId?: string, _senderClientId?: string, operationContext?: URI | IAgentChatContext): Promise<void> {
		// `IAgent.sendMessage` declares `turnId?` but every production caller in
		// `AgentSideEffects` supplies one. Generate a fallback so the
		// session-side `QueuedRequest.turnId: string` invariant holds even if a
		// hypothetical caller forgets it.
		const effectiveTurnId = turnId ?? generateUuid();
		const sendContext = this._requireChatContext(chat, operationContext, 'sendMessage');
		const clientTelemetryContext = URI.isUri(operationContext) ? undefined : operationContext?.clientTelemetryContext;
		const context = this._resolveChatContext(chat, sendContext);

		return this._sessionSequencer.queue(context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, sendContext);
			const session = await this._ensureResolvedChatSession(current, workingDirectories);
			// The send carries the host's latest customization snapshot. An
			// absent snapshot means the host has published none yet, which must
			// not be read as "this session has no customizations" — keep the
			// session's own reconciled view in that case.
			if (current.customizations) {
				session.setHostCustomizations(current.customizations);
			}
			const switchTransport = session.hasPendingTransportSwitch ? this._ensureAuthenticated(session.provisionalModel) : undefined;
			await session.send(this._buildSdkPrompt(session.sessionId, prompt, attachments, effectiveTurnId), effectiveTurnId, current.configurationResource, workingDirectories, switchTransport, resolveAgentHostInstructions(operationContext), clientTelemetryContext);
			if (workingDirectories) {
				await this._metadataStore.write(current.resource, { workingDirectories });
			}
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

	private async _abortSession(chat: URI, context: URI | IAgentChatContext): Promise<void> {
		resolveAgentChatContext(context, chat);
		// Cancel via the abort controller, NOT `Query.interrupt()`. Abort is a
		// control-plane operation — it must NOT serialize through
		// `_sessionSequencer` because an in-flight `sendMessage` task is
		// parked on its turn deferred and would deadlock the abort behind the
		// very turn it's trying to cancel. Calling `chat.abort()` directly
		// rejects the in-flight deferred, which lets the queued sendMessage
		// task complete and frees the sequencer for the next caller.
		const sess = this._findChatByUri(chat);
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
		// Queued messages are intentionally a no-op. CONTEXT.md M10 +
		// AgentSideEffects confirm queued messages are consumed server-side;
		// the agent boundary always receives an empty queue.
		//
		// Control-plane operations carry no host context, and need none: the
		// exact chat backing is the only state they touch.
		const target = this._findChatByUri(chat);
		this._logService.info(`[Claude] setPendingMessages for ${chat.toString()}: steering=${steeringMessage?.id ?? 'none'} queued=${_queuedMessages.length}`);
		if (!target) {
			this._logService.warn(`[Claude] setPendingMessages: target not found for ${chat.toString()}`);
			return;
		}
		if (steeringMessage) {
			target.injectSteering(steeringMessage);
		}
	}

	private async _changeModel(chat: URI, model: ModelSelection, operationContext: URI | IAgentChatContext): Promise<void> {
		const context = this._resolveChatContext(chat, operationContext);
		await this._sessionSequencer.queue(context.sequencerKey, async () => {
			const current = this._resolveChatContext(chat, operationContext);
			await this._metadataStore.write(current.resource, { model });
			const sess = current.target;
			if (sess) {
				// The session owns the transport-crossing decision: a change that
				// crosses transports (Copilot ↔ native) on a live session can't
				// hot-swap and defers to a rebuild on the next send, while a
				// same-transport (or still-provisional) change hot-swaps in place.
				// See {@link ClaudeAgentSession.setModel}.
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
	private async _changeAgent(chat: URI, agent: AgentSelection | undefined, operationContext: URI | IAgentChatContext): Promise<void> {
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

	/**
	 * `chat` is the exact chat this client's contributions are addressed to.
	 * There is no membership to fan out — a client contributing to several
	 * chats of the same session gets one independent call (and handle) per
	 * chat, so nothing here synthesizes, extends, or remembers a chat set of
	 * its own.
	 */
	getOrCreateActiveClient(chat: URI, context: URI | IAgentChatContext, client: { readonly clientId: string; readonly displayName?: string }, hostCustomizations?: readonly Customization[]): IActiveClient {
		const { configurationResource } = resolveAgentChatContext(context, chat);
		const key = `${chat.toString()}\u0000${client.clientId}`;
		let handle = this._activeClientHandles.get(key);
		if (!handle) {
			handle = new ClaudeActiveClientHandle(
				client.clientId,
				client.displayName,
				chat,
				(targetChat, tools) => {
					this._logService.info(`[Claude:${AgentSession.id(configurationResource)}] active client ${client.clientId} tools=[${tools.map(t => t.name).join(', ') || '(none)'}] chat=${targetChat.toString()}`);
					this._findChatByUri(targetChat)?.setClientTools(client.clientId, tools);
				},
				(targetChat, customizations, snapshot) => { void this._syncClientCustomizations(targetChat, configurationResource, client.clientId, [...customizations], snapshot); },
			);
			this._activeClientHandles.set(key, handle);
		}
		handle.setHostCustomizations(hostCustomizations);
		return handle;
	}

	removeActiveClient(chat: URI, _context: URI | IAgentChatContext, clientId: string): void {
		const key = `${chat.toString()}\u0000${clientId}`;
		if (!this._activeClientHandles.delete(key)) {
			return;
		}
		const target = this._findChatByUri(chat);
		if (!target) {
			return;
		}
		target.removeClientTools(clientId);
		void this._sessionSequencer.queue(target.sessionId, async () => target.removeClientCustomizations(clientId)).catch(() => { /* chat torn down */ });
	}

	/**
	 * `chat` is the host-resolved routing target — already the ancestor chat
	 * when the completion was addressed to a subagent. When its runtime is not
	 * resident (a released ancestor, or a subagent whose spawning chat differs
	 * from the routing target), the spawn edge on the addressed chat's
	 * host-supplied origin names the conversation that owns the pending call.
	 */
	onClientToolCallComplete(chat: URI, toolCallId: string, result: ToolCallResult, context?: IAgentChatContext): void {
		const addressed = this._findChatByUri(chat);
		if (addressed) {
			addressed.completeClientToolCall(toolCallId, result);
			return;
		}
		const spawnedFrom = resolveSubagentChatParent(context);
		if (!spawnedFrom) {
			return;
		}
		// `AgentSideEffects` forwards every `ChatToolCallComplete` envelope
		// (including SDK-owned tools); silent on miss is the expected path.
		this._findChatByUri(spawnedFrom.chat)?.completeClientToolCall(toolCallId, result);
	}

	/**
	 * `hostCustomizations` is the host's last published snapshot for the
	 * chat's owning configuration scope, or `undefined` when it has published
	 * none yet. The public entry point reuses whatever the host last handed to
	 * this client's handle rather than reading it back from shared state.
	 */
	async syncClientCustomizations(chat: URI, context: URI | IAgentChatContext, clientId: string, customizations: ClientPluginCustomization[], options?: { readonly quiet?: boolean }): Promise<ISyncedCustomization[]> {
		const { configurationResource } = resolveAgentChatContext(context, chat);
		const handle = this._activeClientHandles.get(`${chat.toString()}\u0000${clientId}`);
		return this._syncClientCustomizations(chat, configurationResource, clientId, customizations, handle?.hostCustomizations, options);
	}

	private async _syncClientCustomizations(chat: URI, configurationResource: URI, clientId: string, customizations: ClientPluginCustomization[], hostCustomizations: readonly Customization[] | undefined, options?: { readonly quiet?: boolean }): Promise<ISyncedCustomization[]> {
		const sync = () => this._pluginManager.syncCustomizations(
			clientId,
			customizations,
			options?.quiet ? undefined : status => this._fireCustomizationUpdated(configurationResource, { customization: status }),
		);
		const target = this._findChatByUri(chat);
		if (target) {
			return this._sessionSequencer.queue(target.sessionId, async () => {
				const synced = await sync();
				// Only a real host snapshot is applied. `undefined` means the host
				// has published none yet — reconciling against an empty list there
				// would drop enablement state the session already resolved.
				if (hostCustomizations) {
					target.setHostCustomizations(hostCustomizations);
				}
				target.adoptClientCustomizations(clientId, synced, customizations);
				return synced;
			});
		}
		return sync();
	}

	/**
	 * Project a per-item sync result onto a `SessionCustomizationUpdated`
	 * action and emit it on {@link onDidChatProgress}. Lets the workbench
	 * flip each row to `Loaded` / `Error` as the underlying
	 * {@link IAgentPluginManager.syncCustomizations} resolves it.
	 */
	private _fireCustomizationUpdated(session: URI, item: ISyncedCustomization): void {
		this._onDidChatProgress.fire({
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

	/**
	 * `hostCustomizations` is the host's last published snapshot for `chat`,
	 * supplied explicitly at this boundary. `undefined` means the host has
	 * published none yet, which is deliberately distinct from an empty list:
	 * the session keeps its own reconciled view rather than clearing it.
	 *
	 * Resolves `chat` through its exact backing only ({@link _findChatByUri}) —
	 * never falls back to guessing the SDK conversation id from the
	 * configuration scope, since a fresh chat's SDK id is independent of it.
	 */
	async getChatCustomizations(chat: URI, _context: URI | IAgentChatContext, hostCustomizations?: readonly Customization[]): Promise<readonly Customization[]> {
		const sess = this._findChatByUri(chat);
		if (!sess) {
			return [];
		}
		if (hostCustomizations) {
			sess.setHostCustomizations(hostCustomizations);
		}
		return sess.getSessionCustomizations();
	}

	/**
	 * Hides the multi-root Folder picker unless several working directories carry
	 * Claude configuration that would pin them as the primary — an `.mcp.json`
	 * manifest or a non-empty `hooks` block in `.claude/settings.json` /
	 * `settings.local.json` (see {@link claudeDirectoryQualifiesForPrimary}). With
	 * one qualifying directory it pins that folder; with several it shows the
	 * picker so the user chooses. This only reads files to decide the picker — it
	 * never surfaces them as customizations.
	 */
	async computeFolderPickerDecision(workingDirectories: readonly URI[], token: CancellationToken = CancellationToken.None): Promise<ISessionFolderPickerDecision | undefined> {
		if (!this._isMultiRootEnabled()) {
			return undefined;
		}
		return computeFolderPickerDecisionForRoots(workingDirectories, (directory, t) => claudeDirectoryQualifiesForPrimary(this._fileService, directory, this._environmentService.userHome, t), token);
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
		// INVARIANT: SDK Query subprocesses (owned by individual
		// ClaudeAgentSession wrappers) MUST die BEFORE the proxy handle
		// is disposed. After proxy disposal the proxy may rebind on a
		// different port and a still-running subprocess would silently
		// lose its endpoint. See `IClaudeProxyHandle` doc in
		// `claudeProxyService.ts`.
		//
		// Step 1: abort every session AbortController. These are the
		// same controllers wired into `Options.abortController` at
		// materialize time, so any in-flight `await sdk.startup()` will
		// reject and any sequencer-queued materialize continuation will
		// trip its abort gates without reaching registration.
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
