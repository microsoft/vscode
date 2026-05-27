/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { Options, SDKSessionInfo, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
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
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel } from '../../common/claudeModelConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { PolicyState, ProtectedResourceMetadata, type AgentSelection, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { isSubagentSession, parseSubagentSessionUri, SessionInputResponseKind, type ClientPluginCustomization, type Customization, type MessageAttachment, type PendingMessage, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitService } from '../agentHostGitService.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';
import { projectFromCopilotContext } from '../copilot/copilotGitProject.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { mapSessionMessagesToTurns } from './claudeReplayMapper.js';
import { getSubagentTranscript } from './claudeSubagentResolver.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { handleCanUseTool } from './claudeCanUseTool.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import { IClaudeProxyHandle, IClaudeProxyService } from './claudeProxyService.js';
import { readClaudePermissionMode } from './claudeSessionPermissionMode.js';
import { ClaudeSessionMetadataStore, IClaudeSessionOverlay } from './claudeSessionMetadataStore.js';

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
	readonly id: AgentProvider = 'claude';

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _onDidCustomizationsChange = this._register(new Emitter<void>());
	readonly onDidCustomizationsChange = this._onDidCustomizationsChange.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

	private _githubToken: string | undefined;
	private _proxyHandle: IClaudeProxyHandle | undefined;

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

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
	) {
		super();
		this._metadataStore = _instantiationService.createInstance(ClaudeSessionMetadataStore, this.id);
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
		return [GITHUB_COPILOT_PROTECTED_RESOURCE];
	}

	private _ensureAuthenticated(): IClaudeProxyHandle {
		const handle = this._proxyHandle;
		if (!handle) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				'Authentication is required to use Claude',
				this.getProtectedResources(),
			);
		}
		return handle;
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
			return false;
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

	private async _refreshModels(): Promise<void> {
		const tokenAtStart = this._githubToken;
		if (!tokenAtStart) {
			this._models.set([], undefined);
			return;
		}
		try {
			const all = await this._copilotApiService.models(tokenAtStart);
			// Stale-write guard: if `authenticate()` rotated the token
			// while we were awaiting the model list, a newer refresh has
			// already published the right value — don't overwrite it.
			if (this._githubToken !== tokenAtStart) {
				return;
			}
			// Stable sort surfaces the CAPI-flagged chat-default model
			// first. The picker treats `models[0]` as the de facto
			// default (modelPicker.ts:144 — `_selectedModel ?? models[0]`)
			// since `IAgentModelInfo` carries no explicit `isDefault`
			// bit. Stable comparator returns 0 for equal-priority models
			// so CAPI's ordering wins on ties.
			const filtered = all
				.filter(isClaudeModel)
				.sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default))
				.map(m => toAgentModelInfo(m, this.id));
			this._models.set(filtered, undefined);
		} catch (err) {
			this._logService.error(err, '[Claude] Failed to refresh models');
			if (this._githubToken === tokenAtStart) {
				this._models.set([], undefined);
			}
		}
	}

	// #endregion

	// #region Stubs — implemented in later phases

	async createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
		this._ensureAuthenticated();
		if (config.fork) {
			throw new Error('TODO: Phase 6.5: fork requires message-UUID lookup via sdk.getSessionMessages');
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
		const proxyHandle = this._ensureAuthenticated();

		const canUseTool: NonNullable<Options['canUseTool']> = (toolName, input, options) =>
			handleCanUseTool(
				{ getSession: id => this._findAnySession(id), configurationService: this._configurationService },
				sessionId, toolName, input, options,
			);

		try {
			await session.materialize({ proxyHandle, canUseTool, isResume: false });
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
		const proxyHandle = this._ensureAuthenticated();
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

		const canUseTool: NonNullable<Options['canUseTool']> = (toolName, input, options) =>
			handleCanUseTool(
				{ getSession: id => this._findAnySession(id), configurationService: this._configurationService },
				sessionId, toolName, input, options,
			);

		try {
			await session.materialize({ proxyHandle, canUseTool, isResume: true });
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
	 * bag, narrowing the runtime `unknown` value to the SDK's six-value
	 * `PermissionMode` union (sdk.d.ts:1560). Falls back to `'default'`
	 * when the bag is absent or carries something the schema validator
	 * shouldn't have accepted (defense-in-depth).
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
		});
	}

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
				enum: ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'],
				enumLabels: [
					localize('claude.sessionConfig.permissionMode.default', "Ask Each Time"),
					localize('claude.sessionConfig.permissionMode.acceptEdits', "Auto-Approve Edits"),
					localize('claude.sessionConfig.permissionMode.bypassPermissions', "Bypass Approvals"),
					localize('claude.sessionConfig.permissionMode.plan', "Plan Only (Read-Only)"),
					localize('claude.sessionConfig.permissionMode.dontAsk', "Don't Ask"),
					localize('claude.sessionConfig.permissionMode.auto', "Auto"),
				],
				enumDescriptions: [
					localize('claude.sessionConfig.permissionMode.defaultDescription', "Prompt for every tool call."),
					localize('claude.sessionConfig.permissionMode.acceptEditsDescription', "Auto-approve file edits; prompt for shell and other tools."),
					localize('claude.sessionConfig.permissionMode.bypassPermissionsDescription', "Auto-approve every tool call."),
					localize('claude.sessionConfig.permissionMode.planDescription', "Read-only research mode; no tool calls executed."),
					localize('claude.sessionConfig.permissionMode.dontAskDescription', "Auto-approve every tool call without prompting."),
					localize('claude.sessionConfig.permissionMode.autoDescription', "Let the model classifier choose between approve and prompt per call."),
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

			const sessionIds = [...this._sessions.keys()];
			await Promise.all(sessionIds.map(sessionId =>
				this._disposeSequencer.queue(sessionId, async () => {
					this._sessions.deleteAndDispose(sessionId);
				})
			));
		})();
	}

	async sendMessage(sessionUri: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		// Plan section 3.8. The sequencer scope holds across BOTH materialize
		// and `session.send` so two concurrent first-message calls on the
		// same session collapse into one materialize plus two ordered
		// sends. A `disposeSession` racing a first send reaches its own
		// dispose-sequencer eventually but the in-flight materialize
		// completes first.
		const sessionId = AgentSession.id(sessionUri);
		// `IAgent.sendMessage` declares `turnId?` (agentService.ts:424) but
		// every production caller in `AgentSideEffects` supplies one. Generate
		// a fallback so the session-side `QueuedRequest.turnId: string`
		// invariant holds even if a hypothetical caller forgets it.
		const effectiveTurnId = turnId ?? generateUuid();
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

			const contentBlocks = resolvePromptToContentBlocks(prompt, attachments);
			const sdkPrompt: SDKUserMessage = {
				type: 'user',
				message: { role: 'user', content: contentBlocks },
				session_id: sessionId,
				parent_tool_use_id: null,
				// M1 / Glossary: `Turn.id ↔ SDKUserMessage.uuid`. The SDK
				// types this as a branded `${string}-…` template-literal
				// alias of Node's `crypto.UUID`; cast at the boundary
				// rather than threading the brand up to every caller.
				// Mirrors the reference extension at
				// `extensions/copilot/src/extension/chatSessions/claude/node/claudeCodeAgent.ts:585`.
				uuid: effectiveTurnId as `${string}-${string}-${string}-${string}-${string}`,
			};

			await session.send(sdkPrompt, effectiveTurnId);
		});
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
	}

	respondToUserInputRequest(requestId: string, response: SessionInputResponseKind, answers?: Record<string, SessionInputAnswer>): void {
		// `requestId` is the SDK's `tool_use_id` (interactive tools
		// reuse it as the {@link SessionInputRequest.id}); globally
		// unique, so a single matching session is all we need. Silent
		// on miss for the same reasons as `respondToPermissionRequest`.
		for (const entry of this._sessions.values()) {
			if (entry.session.respondToUserInputRequest(requestId, response, answers)) {
				return;
			}
		}
	}

	async abortSession(session: URI): Promise<void> {
		// Phase 9 D1: cancel via the abort controller, NOT `Query.interrupt()`.
		// Abort is a control-plane operation — it must NOT serialize
		// through `_sessionSequencer` because an in-flight `sendMessage`
		// task is parked on its turn deferred and would deadlock the abort
		// behind the very turn it's trying to cancel. Calling
		// `entry.session.abort()` directly rejects the in-flight deferred,
		// which lets the queued sendMessage task complete and frees the
		// sequencer for the next caller.
		const sessionId = AgentSession.id(session);
		const sess = this._findAnySession(sessionId);
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
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Claude:${sessionId}] setPendingMessages called: steering=${steeringMessage?.id ?? 'none'} queued=${_queuedMessages.length}`);
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			this._logService.warn(`[Claude:${sessionId}] setPendingMessages: session not found`);
			return;
		}
		if (steeringMessage) {
			entry.session.injectSteering(steeringMessage);
		}
	}

	async changeModel(session: URI, model: ModelSelection): Promise<void> {
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
	 * the overlay so a later resume picks it up.
	 */
	async changeAgent(session: URI, agent: AgentSelection | undefined): Promise<void> {
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			const sess = this._findAnySession(sessionId);
			if (sess) {
				await sess.setAgent(agent);
			} else {
				await this._metadataStore.write(session, { agent: agent ?? null });
			}
		});
	}

	setClientTools(session: URI, clientId: string, tools: ToolDefinition[]): void {
		const sessionId = AgentSession.id(session);
		this._logService.info(`[Claude:${sessionId}] setClientTools clientId=${clientId} tools=[${tools.map(t => t.name).join(', ') || '(none)'}]`);
		const sess = this._findAnySession(sessionId);
		if (!sess) {
			return;
		}
		sess.setClientTools(tools, clientId);
	}

	onClientToolCallComplete(session: URI, toolCallId: string, result: ToolCallResult): void {
		// Walk subagent URIs to the root — nested subagents require iterated
		// parsing. `_sessions` is keyed by root session ids only. Mirrors
		// copilotAgent.ts:947.
		let target = session;
		let parsed;
		while ((parsed = parseSubagentSessionUri(target))) {
			target = parsed.parentSession;
		}
		const sessionId = AgentSession.id(target);
		const entry = this._sessions.get(sessionId);
		// `AgentSideEffects` forwards every `SessionToolCallComplete` envelope
		// (including SDK-owned tools); silent on miss is the expected path.
		entry?.session.completeClientToolCall(toolCallId, result);
	}

	async setClientCustomizations(session: URI, clientId: string, customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
		const sessionId = AgentSession.id(session);
		const sess = this._findAnySession(sessionId);
		if (!sess) {
			this._logService.warn(`[Claude:${sessionId}] setClientCustomizations: session not found`);
			return [];
		}
		// Run inside the session sequencer so that a fire-and-forget
		// `setClientCustomizations` from `AgentSideEffects` cannot race
		// ahead of a first `sendMessage`: if `sendMessage` is already
		// queued, the sync runs first or queues behind it; either way
		// the materialize call reads the most recently adopted plugin
		// set, never an empty one mid-sync.
		return this._sessionSequencer.queue(sessionId, async () => {
			const synced = await this._pluginManager.syncCustomizations(
				clientId,
				customizations,
				status => this._fireCustomizationUpdated(session, { customization: status }),
			);
			sess.adoptClientCustomizations(synced);
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
			session,
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
