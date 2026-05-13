/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { Options, PermissionMode, SDKSessionInfo, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { SequencerByKey } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey, narrowClaudePermissionMode } from '../../common/claudeSessionConfigKeys.js';
import { clampEffortForRuntime, createClaudeThinkingLevelSchema, isClaudeEffortLevel, resolveClaudeEffort } from '../../common/claudeModelConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo } from '../../common/agentService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { PolicyState, ProtectedResourceMetadata, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { CustomizationRef, SessionInputResponseKind, type MessageAttachment, type PendingMessage, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { IAgentHostGitService } from '../agentHostGitService.js';
import { projectFromCopilotContext } from '../copilot/copilotGitProject.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { handleCanUseTool } from './claudeCanUseTool.js';
import { ClaudeMaterializer } from './claudeMaterializer.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import { IClaudeProxyHandle, IClaudeProxyService } from './claudeProxyService.js';
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
// that needs the same narrowing semantics.

/**
 * Phase 6: in-memory record for a provisional Claude session — one
 * created via {@link ClaudeAgent.createSession} that has NOT yet seen
 * its first {@link ClaudeAgent.sendMessage}.
 *
 * Holds:
 * - `sessionId` / `sessionUri`: stable identifiers minted at create time.
 * - `workingDirectory`: undefined when the caller didn't supply one
 *   (e.g. legacy `createSession({})` paths). Materialize fails fast if
 *   it's still missing then; until then a missing `cwd` is harmless
 *   because no SDK / DB / worktree work has happened.
 * - `abortController`: single source of cancellation. Wired into
 *   {@link Options.abortController} at materialize and aborted by
 *   {@link ClaudeAgent.shutdown} / {@link ClaudeAgent.disposeSession}
 *   for provisional records; the materialize path defends against an
 *   abort racing `await sdk.startup()` (Q8 belt-and-suspenders).
 * - `project`: the resolved {@link IAgentSessionProjectInfo} (if any),
 *   computed once at create time so duplicate `createSession` calls
 *   for the same URI return identical project metadata.
 * - `model` / `config`: the `IAgentCreateSessionConfig.model` and
 *   `IAgentCreateSessionConfig.config` bag from `createSession`.
 *   Carried verbatim through to materialize so the first `query()`'s
 *   `Options.*` reflect the user's choices instead of SDK defaults
 *   (M11 / Phase 6.1 C2). The bag is `Record<string, unknown>` because
 *   schema validation already happened at `resolveSessionConfig`; this
 *   is the post-validation runtime payload.
 */
interface IClaudeProvisionalSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	readonly workingDirectory: URI | undefined;
	readonly abortController: AbortController;
	readonly project: IAgentSessionProjectInfo | undefined;
	/**
	 * Mutable so {@link ClaudeAgent.changeModel} can update the pending
	 * model selection before materialize promotes the record. The first
	 * `sendMessage` reads this when building Options.
	 */
	model: ModelSelection | undefined;
	readonly config: Record<string, unknown> | undefined;
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
	readonly id: AgentProvider = 'claude';

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

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
	 * Phase 6: pending in-memory session records. A `createSession`
	 * (non-fork) entry lives here until the first {@link sendMessage}
	 * promotes it to a real {@link ClaudeAgentSession} via
	 * {@link _materializeProvisional}. Each entry owns an
	 * {@link AbortController} that is wired into {@link Options.abortController}
	 * at materialize time, so {@link shutdown} can abort any in-flight
	 * `await sdk.startup()` cleanly.
	 *
	 * Plan section 3.3: provisional state is in-memory only — NO DB write, NO
	 * SDK contact — until materialize.
	 */
	private readonly _provisionalSessions = new Map<string, IClaudeProvisionalSession>();

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

	private readonly _materializer: ClaudeMaterializer;
	private readonly _metadataStore: ClaudeSessionMetadataStore;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._materializer = instantiationService.createInstance(ClaudeMaterializer);
		this._metadataStore = instantiationService.createInstance(ClaudeSessionMetadataStore, this.id);
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
			// Fork moved to Phase 6.5: requires translating
			// `config.fork.turnId` (a protocol turn ID) to an SDK message UUID
			// via `sdk.getSessionMessages`. Phase 6's exit criteria explicitly
			// scope fork out so the rest of sendMessage can land first.
			throw new Error('TODO: Phase 6.5: fork requires message-UUID lookup via sdk.getSessionMessages');
		}
		// Non-fork path: provisional. NO subprocess fork, NO worktree, NO DB
		// write. Materialization happens lazily in `_materializeProvisional`
		// on the first `sendMessage`; AgentService defers `sessionAdded`
		// until then.
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);

		// Idempotency: a duplicate `createSession` for the same URI (already
		// materialized OR already provisional) returns the same URI without
		// overwriting the existing record. This protects against a workbench
		// retry collapsing a real session back into a provisional one.
		const existingProvisional = this._provisionalSessions.get(sessionId);
		if (existingProvisional) {
			return {
				session: existingProvisional.sessionUri,
				workingDirectory: existingProvisional.workingDirectory,
				provisional: true,
				...(existingProvisional.project ? { project: existingProvisional.project } : {}),
			};
		}
		if (this._sessions.has(sessionId)) {
			return { session: sessionUri, workingDirectory: config.workingDirectory };
		}

		// Resolve git project metadata when we have a cwd. Skipped when
		// `workingDirectory` is undefined — materialize will require it,
		// but a tests-only path (`createSession({})`) without a cwd is
		// allowed at Phase 5/6 boundaries; failing fast here would force
		// every legacy test to thread a cwd through.
		//
		// **Deviation from plan section 3.3 (deviation D1, ratified by review).**
		// The plan called for `if (!config.workingDirectory) { throw ... }`
		// at create time. We accept cwd-less calls and defer the throw to
		// `_materializeProvisional` instead. Trade-off: a programmer error
		// (forgetting to thread cwd) surfaces at first `sendMessage`
		// rather than `createSession`. This is acceptable because:
		// (a) the agent host's own callers always supply cwd via folder
		//     pick (`agentSideEffects.ts`) — the cwd-less path only exists
		//     for unit tests asserting protocol-only behavior; and
		// (b) materialize requires cwd anyway, so the failure mode is
		//     bounded and visible (no silent invalid sessions).
		const project = config.workingDirectory
			? await projectFromCopilotContext({ cwd: config.workingDirectory.fsPath }, this._gitService)
			: undefined;

		this._provisionalSessions.set(sessionId, {
			sessionId,
			sessionUri,
			workingDirectory: config.workingDirectory,
			abortController: new AbortController(),
			project,
			model: config.model,
			config: config.config,
		});

		return {
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			provisional: true,
			...(project ? { project } : {}),
		};
	}

	/**
	 * Promote a {@link IClaudeProvisionalSession} into a real
	 * {@link ClaudeAgentSession}. Called from {@link sendMessage} inside
	 * the {@link _sessionSequencer.queue} block, so concurrent first
	 * sends serialize naturally — exactly one materialize per session.
	 *
	 * Plan section 3.4. Failure modes:
	 * - Missing provisional record → programmer error, throws.
	 * - Missing proxy handle → caller forgot {@link authenticate}, throws.
	 * - Aborted before SDK init returns → {@link ClaudeMaterializer}
	 *   disposes the {@link WarmQuery} and throws {@link CancellationError}.
	 * - Customization-directory persistence failure → fatal: dispose the
	 *   wrapper (aborts the SDK subprocess), drop the provisional record,
	 *   re-throw. Avoids silent half-persisted state.
	 * - Aborted post-metadata-write but pre-commit → second abort gate
	 *   disposes the wrapper without committing into `_sessions`.
	 */
	private async _materializeProvisional(sessionId: string): Promise<ClaudeAgentSession> {
		const provisional = this._provisionalSessions.get(sessionId);
		if (!provisional) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		const proxyHandle = this._ensureAuthenticated();

		// Single read of the live permissionMode (plan S3.6): used both
		// for the SDK's `Options.permissionMode` and the metadata write
		// below, so a `SessionConfigChanged` landing mid-materialize can't
		// produce a split state where the SDK runs under one mode and the
		// DB records another.
		const permissionMode = this._readSessionPermissionMode(provisional.sessionUri)
			?? this._resolvePermissionMode(provisional.config);

		const canUseTool: NonNullable<Options['canUseTool']> = (toolName, input, options) =>
			handleCanUseTool(
				{ getSession: id => this._sessions.get(id)?.session, configurationService: this._configurationService },
				sessionId, toolName, input, options,
			);

		const session = await this._materializer.materialize(provisional, proxyHandle, permissionMode, canUseTool);

		// Phase 9 — wire the rematerializer hook so abort/crash recovery
		// can rebuild the SDK plumbing via resume mode without coupling the
		// session to the materializer service. Also seed the bijective state
		// cache so a rebuild re-applies the user's last-chosen model/effort
		// without losing the picker config.
		const initialEffort = clampEffortForRuntime(resolveClaudeEffort(provisional.model));
		session.seedBijectiveState({
			model: provisional.model?.id,
			effort: initialEffort,
			permissionMode,
		});
		session.attachRematerializer(async (_reason) => {
			// Re-read the live permissionMode so a SessionConfigChanged that
			// arrived since the last materialize is honored on rebuild.
			const liveMode = this._readSessionPermissionMode(provisional.sessionUri) ?? permissionMode;
			return this._materializer.materializeResume(provisional, proxyHandle, liveMode, canUseTool);
		});

		// Persist customization-directory metadata BEFORE firing the
		// materialize event — see plan section 3.4 ordering rationale.
		try {
			await this._metadataStore.write(provisional.sessionUri, {
				customizationDirectory: provisional.workingDirectory,
				model: provisional.model,
				permissionMode,
			});
		} catch (err) {
			session.dispose();
			this._provisionalSessions.delete(sessionId);
			this._logService.error(`[Claude] Failed to persist customization directory; aborting materialize`, err);
			throw err;
		}

		// Final pre-commit abort gate. The first abort gate (inside the
		// materializer) only catches an abort that lands while
		// `await sdk.startup()` was in flight; `_writeSessionMetadata` is a
		// SECOND async boundary where a racing `disposeSession` (which does
		// not await the materialize via `_disposeSequencer` because send and
		// dispose use different sequencers — plan section 3.8 / section 6)
		// can fire between the SDK init and the `_sessions.set(...)` commit.
		// Without this gate, the dispose returns successfully, the provisional
		// record is removed, and the materialize still completes — leaking a
		// WarmQuery subprocess into `_sessions` that nothing else references.
		// Council-review C1.
		if (provisional.abortController.signal.aborted) {
			session.dispose();
			this._provisionalSessions.delete(sessionId);
			throw new CancellationError();
		}

		// Forward session-progress signals through the agent's emitter and
		// bundle the subscription with the session in a single entry. The
		// entry's `dispose()` tears down the session AND every disposable
		// registered against it, so {@link disposeSession} / {@link shutdown}
		// only need to dispose the entry to release everything per-session.
		const entry = new ClaudeSessionEntry(session);
		entry.addDisposable(session.onDidSessionProgress(signal => this._onDidSessionProgress.fire(signal)));
		this._sessions.set(sessionId, entry);
		this._provisionalSessions.delete(sessionId);

		this._onDidMaterializeSession.fire({
			session: provisional.sessionUri,
			workingDirectory: provisional.workingDirectory,
			project: provisional.project,
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

	/**
	 * Read the live `permissionMode` for a session via
	 * {@link IAgentConfigurationService.getSessionConfigValues}. Returns
	 * `undefined` if the session has not been seeded — the caller picks
	 * the fallback (createSession-time intent at materialize, `'default'`
	 * at the canUseTool gate). Defends against malformed values that
	 * slipped past schema validation by returning `undefined`. Called
	 * on every canUseTool entry so a mid-turn `SessionConfigChanged`
	 * action wins over the materialize-time seed (plan S3.6).
	 */
	private _readSessionPermissionMode(sessionUri: URI): PermissionMode | undefined {
		return narrowClaudePermissionMode(this._configurationService.getSessionConfigValues(sessionUri.toString())?.[ClaudeSessionConfigKey.PermissionMode]);
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
			const provisional = this._provisionalSessions.get(sessionId);
			if (provisional) {
				provisional.abortController.abort();
				this._provisionalSessions.delete(sessionId);
				return;
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
		return this._sessions.get(AgentSession.id(session))?.session;
	}

	/**
	 * Full transcript reconstruction from the SDK event log lands in
	 * Phase 13; the bare method shape is required by {@link IAgent}.
	 */
	getSessionMessages(_session: URI): Promise<readonly Turn[]> {
		// Phase 5 has nothing to reconstruct: there is no SDK Query
		// running yet and no event log on disk has been read. The agent
		// service surfaces in-memory provisional turns until Phase 13
		// implements transcript reconstruction from the SDK event log.
		// A fresh array per call avoids leaking mutations across
		// subscribers.
		return Promise.resolve([]);
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
			for (const provisional of this._provisionalSessions.values()) {
				provisional.abortController.abort();
			}
			this._provisionalSessions.clear();

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
			let session = this._sessions.get(sessionId)?.session;
			if (!session) {
				if (!this._provisionalSessions.has(sessionId)) {
					throw new Error(`Cannot send to unknown session: ${sessionId}`);
				}
				// Materialize seeds permissionMode via Options.permissionMode,
				// so no setPermissionMode call needed on this turn.
				session = await this._materializeProvisional(sessionId);
			} else {
				// Plan S3.6: forward live `permissionMode` to the bound
				// `Query` immediately before yielding the next user message
				// so a `SessionConfigChanged` action that arrived between
				// turns wins. Awaited so the SDK has acknowledged the mode
				// change before `session.send(...)` yields the next prompt.
				await session.setPermissionMode(this._readSessionPermissionMode(sessionUri) ?? 'default');
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
		const provisional = this._provisionalSessions.get(sessionId);
		if (provisional) {
			provisional.abortController.abort();
			return;
		}
		const entry = this._sessions.get(sessionId);
		entry?.session.abort();
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
		// Phase 9 D6/D7: bundle-atomic. Provisional sessions mutate their
		// pending `model` field directly (next sendMessage reads it when
		// building Options). Materialized sessions queue a {@link
		// ClaudeAgentSession.queueModelChange} bundle that the prompt
		// iterable's yield-boundary applies via `Query.setModel` and
		// `Query.applyFlagSettings`. `'max'` effort is clamped to `'xhigh'`
		// on the runtime path — genuine `'max'` requires the
		// restart-required path which is deferred (see TODO).
		const sessionId = AgentSession.id(session);
		await this._sessionSequencer.queue(sessionId, async () => {
			const provisional = this._provisionalSessions.get(sessionId);
			if (provisional) {
				provisional.model = model;
				await this._metadataStore.write(session, { model });
				return;
			}
			const entry = this._sessions.get(sessionId);
			if (entry) {
				const requestedEffort = resolveClaudeEffort(model);
				const runtimeEffort = clampEffortForRuntime(requestedEffort);
				if (requestedEffort === 'max') {
					// Copilot CAPI does not currently expose a 'max' reasoning
					// tier, so the runtime hot-swap path clamps to 'xhigh'. Lift
					// when CAPI gains a 'max' model.
					this._logService.warn(`[Claude:${sessionId}] changeModel: 'max' effort clamped to 'xhigh' (Copilot CAPI has no 'max' model yet)`);
				}
				await entry.session.queueModelChange(model.id, runtimeEffort);
			}
			await this._metadataStore.write(session, { model });
		});
	}

	setClientTools(_session: URI, _clientId: string, _tools: ToolDefinition[]): void {
		throw new Error('TODO: Phase 10');
	}

	onClientToolCallComplete(_session: URI, _toolCallId: string, _result: ToolCallResult): void {
		throw new Error('TODO: Phase 10');
	}

	setClientCustomizations(_clientId: string, _customizations: CustomizationRef[], _progress?: (results: ISyncedCustomization[]) => void): Promise<ISyncedCustomization[]> {
		throw new Error('TODO: Phase 11');
	}

	setCustomizationEnabled(_uri: string, _enabled: boolean): void {
		throw new Error('TODO: Phase 11');
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
		for (const provisional of this._provisionalSessions.values()) {
			provisional.abortController.abort();
		}
		this._provisionalSessions.clear();
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
