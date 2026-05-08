/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { Options, SDKSessionInfo, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { rgPath } from '@vscode/ripgrep';
import { SequencerByKey } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey } from '../../common/claudeSessionConfigKeys.js';
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel, resolveClaudeEffort } from '../../common/claudeModelConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAgentSessionProjectInfo } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { PolicyState, ProtectedResourceMetadata, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { CustomizationRef, SessionInputResponseKind, type MessageAttachment, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { IAgentHostGitService } from '../agentHostGitService.js';
import { projectFromCopilotContext } from '../copilot/copilotGitProject.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { resolvePromptToContentBlocks } from './claudePromptResolver.js';
import { IClaudeProxyHandle, IClaudeProxyService } from './claudeProxyService.js';

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
	readonly model: ModelSelection | undefined;
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
	 * Live in-memory session wrappers, keyed by raw session id (not URI).
	 * Disposing the map disposes every wrapper still in it, so no
	 * additional teardown is needed in {@link dispose}. {@link createSession}
	 * is the only writer; {@link disposeSession} and {@link shutdown}
	 * remove via {@link DisposableMap.deleteAndDispose}, which is idempotent
	 * if the key has already been removed — the contract that prevents
	 * double-dispose when the two methods race.
	 */
	private readonly _sessions = this._register(new DisposableMap<string, ClaudeAgentSession>());

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

	/**
	 * Per-session DB metadata key for the user-picked customization
	 * directory. Anchors agent customization (instructions, tools, prompts)
	 * to the user's original folder pick even after Phase 6+ worktree
	 * materialization moves the working directory. Phase 5 only reads
	 * this overlay in {@link listSessions}; Phase 6's `sendMessage`
	 * writes it on first turn and fork's `vacuumInto` carries it forward.
	 */
	private static readonly _META_CUSTOMIZATION_DIRECTORY = 'claude.customizationDirectory';
	private static readonly _META_MODEL = 'claude.model';
	private static readonly _META_PERMISSION_MODE = 'claude.permissionMode';

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
	) {
		super();
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
	 * Factory hook for the per-session wrapper. Tests override this to
	 * inject a recording subclass and observe dispose order/count without
	 * monkey-patching the live `_sessions` map. Mirrors CopilotAgent's
	 * `_createCopilotClient` pattern (`copilotAgent.ts:286`).
	 */
	protected _createSessionWrapper(
		sessionId: string,
		sessionUri: URI,
		workingDirectory: URI | undefined,
		warm: import('@anthropic-ai/claude-agent-sdk').WarmQuery,
		abortController: AbortController,
	): ClaudeAgentSession {
		return new ClaudeAgentSession(
			sessionId,
			sessionUri,
			workingDirectory,
			warm,
			abortController,
			this._onDidSessionProgress,
			this._logService,
		);
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
	 * - Aborted before SDK init returns → dispose the {@link WarmQuery}
	 *   and throw {@link CancellationError}.
	 * - Customization-directory persistence failure → fatal: dispose the
	 *   wrapper (aborts the SDK subprocess), drop the provisional record,
	 *   re-throw. Avoids silent half-persisted state.
	 */
	private async _materializeProvisional(sessionId: string): Promise<ClaudeAgentSession> {
		const provisional = this._provisionalSessions.get(sessionId);
		if (!provisional) {
			throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
		}
		if (!provisional.workingDirectory) {
			throw new Error(`Cannot materialize Claude session ${sessionId}: workingDirectory is required`);
		}
		const proxyHandle = this._ensureAuthenticated();

		const subprocessEnv = this._buildSubprocessEnv();
		// Settings env: forwarded to the Claude subprocess via the SDK's
		// `Options.settings.env` channel (separate from `Options.env` which
		// is the spawn env). PATH composition uses `delimiter` (`:` or `;`)
		// so Windows agent hosts don't corrupt PATH on subprocess fork.
		// In packaged builds @vscode/ripgrep lives inside node_modules.asar; the
		// rg binary itself is unpacked next door, so rewrite the path before
		// putting it on PATH (matches `copilotAgent.ts` and the workbench
		// search engine helpers).
		const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
		const settingsEnv: Record<string, string> = {
			ANTHROPIC_BASE_URL: proxyHandle.baseUrl,
			ANTHROPIC_AUTH_TOKEN: `${proxyHandle.nonce}.${sessionId}`,
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
			USE_BUILTIN_RIPGREP: '0',
			PATH: `${dirname(rgDiskPath)}${delimiter}${process.env.PATH ?? ''}`,
		};

		const options: Options = {
			cwd: provisional.workingDirectory.fsPath,
			executable: process.execPath as 'node',
			env: subprocessEnv,
			abortController: provisional.abortController,
			allowDangerouslySkipPermissions: true,
			canUseTool: async (_name, _input) => ({
				behavior: 'deny',
				message: 'Tools are not yet enabled for this session (Phase 6).',
			}),
			disallowedTools: ['WebSearch'],
			includeHookEvents: true,
			includePartialMessages: true,
			// M11 / Phase 6.1 C2 + I2: surface the user's createSession choices
			// to the SDK. `Options.permissionMode` accepts the SDK's six-value
			// `PermissionMode` union (sdk.d.ts:1560); our schema mirrors it,
			// so the validated string flows through with no translation.
			//
			// The latest model lives on the provisional record (kept in
			// sync via `changeModel` once Phase 9 ships). The latest
			// session config bag lives there too — no sidecar re-read
			// here because the in-memory record is already authoritative
			// for the create-time → first-send window. Mirrors
			// CopilotAgent's pattern at `copilotAgent.ts:777` where
			// `provisional.model` is the source of truth at materialize.
			model: provisional.model?.id,
			effort: resolveClaudeEffort(provisional.model),
			permissionMode: this._resolvePermissionMode(provisional.config),
			sessionId,
			settingSources: ['user', 'project', 'local'],
			settings: { env: settingsEnv },
			systemPrompt: { type: 'preset', preset: 'claude_code' },
			stderr: data => this._logService.error(`[Claude SDK stderr] ${data}`),
		};

		const warm = await this._sdkService.startup({ options });

		// Q8 belt-and-suspenders: the SDK's comment guarantees abort cleanup
		// (sdk.d.ts:982), but if `startup()` resolved despite a racing abort,
		// dispose the WarmQuery and surface cancellation. The agent has been
		// shutting down while we awaited; do NOT materialize.
		if (provisional.abortController.signal.aborted) {
			await warm[Symbol.asyncDispose]();
			throw new CancellationError();
		}

		const session = this._createSessionWrapper(
			sessionId,
			provisional.sessionUri,
			provisional.workingDirectory,
			warm,
			provisional.abortController,
		);

		// Persist customization-directory metadata BEFORE firing the
		// materialize event — see plan section 3.4 ordering rationale.
		try {
			await this._writeSessionMetadata(provisional.sessionUri, {
				customizationDirectory: provisional.workingDirectory,
				model: provisional.model,
				permissionMode: this._resolvePermissionMode(provisional.config),
			});
		} catch (err) {
			session.dispose();
			this._provisionalSessions.delete(sessionId);
			this._logService.error(`[Claude] Failed to persist customization directory; aborting materialize`, err);
			throw err;
		}

		// Final pre-commit abort gate. The first abort gate above only
		// catches an abort that lands while `await sdk.startup()` was in
		// flight; `_writeCustomizationDirectory` is a SECOND async
		// boundary where a racing `disposeSession` (which does not await
		// the materialize via `_disposeSequencer` because send and dispose
		// use different sequencers — plan section 3.8 / section 6) can fire between
		// the SDK init and the `_sessions.set(...)` commit. Without this
		// gate, the dispose returns successfully, the provisional record
		// is removed, and the materialize still completes — leaking a
		// WarmQuery subprocess into `_sessions` that nothing else
		// references. Council-review C1.
		if (provisional.abortController.signal.aborted) {
			session.dispose();
			this._provisionalSessions.delete(sessionId);
			throw new CancellationError();
		}

		this._sessions.set(sessionId, session);
		this._provisionalSessions.delete(sessionId);

		this._onDidMaterializeSession.fire({
			session: provisional.sessionUri,
			workingDirectory: provisional.workingDirectory,
			project: provisional.project,
		});

		return session;
	}

	/**
	 * Build the {@link Options.env} payload for the Claude subprocess.
	 *
	 * The agent host runs in an Electron utility process; the spawn env
	 * inherits the parent's env which contains `NODE_OPTIONS`,
	 * `ELECTRON_*`, and `VSCODE_*` variables that break the Claude
	 * subprocess (it's a plain Node script driven by Electron's
	 * `process.execPath` + `ELECTRON_RUN_AS_NODE`). Strip them via
	 * {@link Options.env} `undefined` semantics (sdk.d.ts:1075-1078:
	 * "Set a key to `undefined` to remove an inherited variable").
	 *
	 * Mirror of CopilotAgent's strip pattern at copilotAgent.ts:434-450.
	 */
	private _buildSubprocessEnv(): Record<string, string | undefined> {
		const env: Record<string, string | undefined> = {
			ELECTRON_RUN_AS_NODE: '1',
			NODE_OPTIONS: undefined,
			ANTHROPIC_API_KEY: undefined,
		};
		for (const key of Object.keys(process.env)) {
			if (key === 'ELECTRON_RUN_AS_NODE') { continue; }
			if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
				env[key] = undefined;
			}
		}
		return env;
	}

	/**
	 * Pull `permissionMode` out of the post-validation `IAgentCreateSessionConfig.config`
	 * bag, narrowing the runtime `unknown` value to the SDK's six-value
	 * `PermissionMode` union (sdk.d.ts:1560). Falls back to `'default'`
	 * when the bag is absent or carries something the schema validator
	 * shouldn't have accepted (defense-in-depth).
	 */
	private _resolvePermissionMode(config: Record<string, unknown> | undefined): ClaudePermissionMode {
		const raw = config?.[ClaudeSessionConfigKey.PermissionMode];
		switch (raw) {
			case 'default':
			case 'acceptEdits':
			case 'bypassPermissions':
			case 'plan':
			case 'dontAsk':
			case 'auto':
				return raw;
			default:
				return 'default';
		}
	}

	/**
	 * Persist Claude-namespaced session metadata (customizationDirectory,
	 * `ModelSelection`, `permissionMode`) to the per-session DB so
	 * {@link listSessions} can surface it (and Phase 6+ worktree
	 * materialization can find the original folder). Mirrors
	 * CopilotAgent's `_storeSessionMetadata` pattern
	 * (`copilotAgent.ts:1532`): single `openDatabase` ref, `Promise.all`
	 * batching, only-write-on-defined.
	 *
	 * `model` is JSON-encoded via {@link _serializeModelSelection} so the
	 * parallel `{ id, config }` shape round-trips. `permissionMode` is
	 * stored verbatim (single string from a closed enum).
	 */
	private async _writeSessionMetadata(session: URI, fields: { customizationDirectory?: URI; model?: ModelSelection; permissionMode?: ClaudePermissionMode }): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(session);
		const db = dbRef.object;
		try {
			const work: Promise<void>[] = [];
			if (fields.customizationDirectory) {
				work.push(db.setMetadata(ClaudeAgent._META_CUSTOMIZATION_DIRECTORY, fields.customizationDirectory.toString()));
			}
			if (fields.model) {
				work.push(db.setMetadata(ClaudeAgent._META_MODEL, this._serializeModelSelection(fields.model)));
			}
			if (fields.permissionMode) {
				work.push(db.setMetadata(ClaudeAgent._META_PERMISSION_MODE, fields.permissionMode));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	/**
	 * Read all Claude-namespaced session metadata from the per-session DB.
	 * Returns `{}` when no DB is present (external Claude CLI session,
	 * fresh install). Mirrors CopilotAgent's `_readSessionMetadata`
	 * (`copilotAgent.ts:1559`) — `tryOpenDatabase` so absence is not an
	 * error, single `Promise.all` for the parallel reads.
	 */
	private async _readSessionMetadata(session: URI): Promise<{ customizationDirectory?: URI; model?: ModelSelection; permissionMode?: ClaudePermissionMode }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return {};
		}
		try {
			const [customizationDirectoryRaw, modelRaw, permissionModeRaw] = await Promise.all([
				ref.object.getMetadata(ClaudeAgent._META_CUSTOMIZATION_DIRECTORY),
				ref.object.getMetadata(ClaudeAgent._META_MODEL),
				ref.object.getMetadata(ClaudeAgent._META_PERMISSION_MODE),
			]);
			return {
				customizationDirectory: customizationDirectoryRaw ? URI.parse(customizationDirectoryRaw) : undefined,
				model: this._parseModelSelection(modelRaw),
				permissionMode: this._narrowPermissionMode(permissionModeRaw),
			};
		} finally {
			ref.dispose();
		}
	}

	private _serializeModelSelection(model: ModelSelection): string {
		return JSON.stringify(model);
	}

	private _parseModelSelection(raw: string | undefined): ModelSelection | undefined {
		if (!raw) {
			return undefined;
		}
		try {
			const value: { id?: unknown; config?: unknown } | string | number | boolean | null = JSON.parse(raw);
			if (value && typeof value === 'object' && typeof value.id === 'string') {
				const result: ModelSelection = { id: value.id };
				if (value.config && typeof value.config === 'object') {
					const config: Record<string, string> = {};
					for (const [key, configValue] of Object.entries(value.config)) {
						if (typeof configValue === 'string') {
							config[key] = configValue;
						}
					}
					if (Object.keys(config).length > 0) {
						result.config = config;
					}
				}
				return result;
			}
		} catch {
			// Older session metadata stored the raw model id as a plain string.
		}
		return { id: raw };
	}

	private _narrowPermissionMode(raw: string | undefined): ClaudePermissionMode | undefined {
		switch (raw) {
			case 'default':
			case 'acceptEdits':
			case 'bypassPermissions':
			case 'plan':
			case 'dontAsk':
			case 'auto':
				return raw;
			default:
				return undefined;
		}
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
		return this._sessions.get(AgentSession.id(session));
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
				const overlay = await this._readSessionMetadata(sessionUri);
				return this._toAgentSessionMetadata(entry, overlay);
			} catch (err) {
				this._logService.warn(`[Claude] Overlay read failed for session ${entry.sessionId}`, err);
			}
			// External session, or DB read failed: surface what the SDK gave us.
			return this._toAgentSessionMetadata(entry, {});
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
		let overlay: { customizationDirectory?: URI; model?: ModelSelection } = {};
		try {
			overlay = await this._readSessionMetadata(session);
		} catch (err) {
			this._logService.warn(`[Claude] Overlay read failed for session ${sessionId}`, err);
		}
		return this._toAgentSessionMetadata(sdkInfo, overlay);
	}

	private _toAgentSessionMetadata(entry: SDKSessionInfo, overlay: { customizationDirectory?: URI; model?: ModelSelection }): IAgentSessionMetadata {
		return {
			session: AgentSession.uri(this.id, entry.sessionId),
			startTime: entry.createdAt ?? entry.lastModified,
			modifiedTime: entry.lastModified,
			summary: entry.customTitle ?? entry.summary,
			workingDirectory: entry.cwd ? URI.file(entry.cwd) : undefined,
			customizationDirectory: overlay.customizationDirectory,
			model: overlay.model,
		};
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

	async sendMessage(session: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		// Plan section 3.8. The sequencer scope holds across BOTH materialize
		// and `entry.send` so two concurrent first-message calls on the
		// same session collapse into one materialize plus two ordered
		// sends. A `disposeSession` racing a first send reaches its own
		// dispose-sequencer eventually but the in-flight materialize
		// completes first.
		const sessionId = AgentSession.id(session);
		// `IAgent.sendMessage` declares `turnId?` (agentService.ts:424) but
		// every production caller in `AgentSideEffects` supplies one. Generate
		// a fallback so the session-side `QueuedRequest.turnId: string`
		// invariant holds even if a hypothetical caller forgets it.
		const effectiveTurnId = turnId ?? generateUuid();
		return this._sessionSequencer.queue(sessionId, async () => {
			let entry = this._sessions.get(sessionId);
			if (!entry) {
				if (this._provisionalSessions.has(sessionId)) {
					entry = await this._materializeProvisional(sessionId);
				} else {
					throw new Error(`Cannot send to unknown session: ${sessionId}`);
				}
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

			await entry.send(sdkPrompt, effectiveTurnId);
		});
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		throw new Error('TODO: Phase 7');
	}

	respondToUserInputRequest(_requestId: string, _response: SessionInputResponseKind, _answers?: Record<string, SessionInputAnswer>): void {
		throw new Error('TODO: Phase 7');
	}

	async abortSession(_session: URI): Promise<void> {
		// `async` for the same reason as `sendMessage` — abort flows through
		// `.catch()` chains in the agent service.
		throw new Error('TODO: Phase 9');
	}

	async changeModel(_session: URI, _model: ModelSelection): Promise<void> {
		throw new Error('TODO: Phase 9');
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
