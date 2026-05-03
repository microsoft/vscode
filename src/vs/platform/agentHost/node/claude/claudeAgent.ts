/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { SequencerByKey } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { createSchema, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { ClaudePermissionMode, ClaudeSessionConfigKey } from '../../common/claudeSessionConfigKeys.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentAttachment, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { ProtectedResourceMetadata, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { CustomizationRef, SessionInputResponseKind, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { IClaudeAgentSdkService } from './claudeAgentSdkService.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
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
 * Project a {@link CCAModel} into the agent host's
 * {@link IAgentModelInfo} surface. The returned `provider` is the
 * agent's id (`'claude'`) — clients filter the root state's model list
 * by provider, so this must match {@link ClaudeAgent.id}, NOT the
 * upstream `vendor: 'Anthropic'` field.
 */
function toAgentModelInfo(m: CCAModel, provider: AgentProvider): IAgentModelInfo {
	return {
		provider,
		id: m.id,
		name: m.name,
		maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
		supportsVision: !!m.capabilities?.supports?.vision,
	};
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
	 * Per-session DB metadata key for the user-picked customization
	 * directory. Anchors agent customization (instructions, tools, prompts)
	 * to the user's original folder pick even after Phase 6+ worktree
	 * materialization moves the working directory. Phase 5 only reads
	 * this overlay in {@link listSessions}; Phase 6's `sendMessage`
	 * writes it on first turn and fork's `vacuumInto` carries it forward.
	 */
	private static readonly _META_CUSTOMIZATION_DIRECTORY = 'claude.customizationDirectory';

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IClaudeProxyService private readonly _claudeProxyService: IClaudeProxyService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IClaudeAgentSdkService private readonly _sdkService: IClaudeAgentSdkService,
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
			const filtered = all.filter(isClaudeModel).map(m => toAgentModelInfo(m, this.id));
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
		if (config.fork) {
			// Fork requires translating `config.fork.turnId` (a protocol turn ID)
			// to an SDK event ID via the live source SDK session handle. Phase 5
			// has no SDK session machinery, so the translation is structurally
			// unavailable. Phase 6 picks this up alongside sendMessage by
			// resuming the source via `_resumeSession` and calling
			// `getNextTurnEventId(...)` (mirrors CopilotAgent at
			// copilotAgent.ts:589-592).
			throw new Error('TODO: Phase 6: fork requires SDK session handle');
		}
		// Non-fork path: in-memory only. Mirrors Claude Code's "no message → no
		// session" semantic. First sendMessage (Phase 6) writes the SDK session
		// record and metadata. AgentService now eagerly creates sessions on
		// folder-pick (PR #313841) and arms a 30s GC that calls disposeSession
		// if the user abandons the new-chat view; for an empty Claude session
		// that's a cheap in-memory drop because nothing has been persisted yet.
		// Honor `config.session` when the workbench pre-mints the URI (also a
		// PR #313841 contract — AgentService asserts the returned URI matches
		// and surfaces "Agent host returned unexpected session URI" otherwise).
		// Mirrors CopilotAgent (`copilotAgent.ts` createSession).
		const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
		const sessionUri = AgentSession.uri(this.id, sessionId);
		this._sessions.set(sessionId, this._createSessionWrapper(sessionId, sessionUri, config.workingDirectory));
		return { session: sessionUri, workingDirectory: config.workingDirectory };
	}

	/**
	 * Factory hook for the per-session wrapper. Tests override this to
	 * inject a recording subclass and observe dispose order/count without
	 * monkey-patching the live `_sessions` map. Mirrors CopilotAgent's
	 * `_createCopilotClient` pattern (`copilotAgent.ts:286`).
	 */
	protected _createSessionWrapper(sessionId: string, sessionUri: URI, workingDirectory: URI | undefined): ClaudeAgentSession {
		return new ClaudeAgentSession(sessionId, sessionUri, workingDirectory);
	}

	disposeSession(session: URI): Promise<void> {
		// Routed through {@link _disposeSequencer} so a concurrent
		// {@link shutdown} already serializing teardown for this same
		// session id awaits this work first (and vice versa). Phase 5
		// teardown is synchronous via {@link DisposableMap.deleteAndDispose}
		// (idempotent for absent keys), so the sequencer is mostly a no-op
		// today; the routing is locked in for Phase 6's real async teardown
		// (Query abort, in-flight metadata writes). Plan section 3.3.4.
		const sessionId = AgentSession.id(session);
		return this._disposeSequencer.queue(sessionId, async () => {
			this._sessions.deleteAndDispose(sessionId);
		});
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
		const sdkEntries = await this._sdkService.listSessions();
		return Promise.all(sdkEntries.map(async entry => {
			try {
				const sessionUri = AgentSession.uri(this.id, entry.sessionId);
				const dbRef = await this._sessionDataService.tryOpenDatabase(sessionUri);
				if (dbRef) {
					try {
						const raw = await dbRef.object.getMetadata(ClaudeAgent._META_CUSTOMIZATION_DIRECTORY);
						return this._toAgentSessionMetadata(entry, {
							customizationDirectory: raw ? URI.parse(raw) : undefined,
						});
					} finally {
						dbRef.dispose();
					}
				}
			} catch (err) {
				this._logService.warn(`[Claude] Overlay read failed for session ${entry.sessionId}`, err);
			}
			// External session, or DB read failed: surface what the SDK gave us.
			return this._toAgentSessionMetadata(entry, {});
		}));
	}

	private _toAgentSessionMetadata(entry: SDKSessionInfo, overlay: { customizationDirectory?: URI }): IAgentSessionMetadata {
		return {
			session: AgentSession.uri(this.id, entry.sessionId),
			startTime: entry.createdAt ?? entry.lastModified,
			modifiedTime: entry.lastModified,
			summary: entry.customTitle ?? entry.summary,
			workingDirectory: entry.cwd ? URI.file(entry.cwd) : undefined,
			customizationDirectory: overlay.customizationDirectory,
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
				enum: ['default', 'acceptEdits', 'bypassPermissions', 'plan'],
				enumLabels: [
					localize('claude.sessionConfig.permissionMode.default', "Ask Each Time"),
					localize('claude.sessionConfig.permissionMode.acceptEdits', "Auto-Approve Edits"),
					localize('claude.sessionConfig.permissionMode.bypassPermissions', "Bypass Approvals"),
					localize('claude.sessionConfig.permissionMode.plan', "Plan Only (Read-Only)"),
				],
				enumDescriptions: [
					localize('claude.sessionConfig.permissionMode.defaultDescription', "Prompt for every tool call."),
					localize('claude.sessionConfig.permissionMode.acceptEditsDescription', "Auto-approve file edits; prompt for shell and other tools."),
					localize('claude.sessionConfig.permissionMode.bypassPermissionsDescription', "Auto-approve every tool call."),
					localize('claude.sessionConfig.permissionMode.planDescription', "Read-only research mode; no tool calls executed."),
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
		// Phase 5 carries no async teardown work yet (no SDK Query
		// subprocesses, no in-flight metadata writes), so per-session
		// disposal is synchronous. Routing every per-session teardown
		// through the same {@link _disposeSequencer} that {@link disposeSession}
		// uses guarantees that a concurrent `disposeSession(uri)` in flight
		// is awaited before shutdown reuses the same key — the contract
		// Phase 6 will rely on once `Query.interrupt()` lands. Plan section 3.3.6.
		// The promise is memoized so concurrent callers share a single
		// drain pass — see `_shutdownPromise` JSDoc.
		// NOTE: declared sync (returns Promise<void>) rather than async
		// so that re-entrant calls return the cached promise *identity*,
		// not a fresh outer-async wrapper around it.
		return this._shutdownPromise ??= (async () => {
			const sessionIds = [...this._sessions.keys()];
			await Promise.all(sessionIds.map(sessionId =>
				this._disposeSequencer.queue(sessionId, async () => {
					this._sessions.deleteAndDispose(sessionId);
				})
			));
		})();
	}

	async sendMessage(_session: URI, _prompt: string, _attachments?: IAgentAttachment[], _turnId?: string): Promise<void> {
		// MUST be `async` (or return `Promise.reject`): AgentSideEffects.handleAction
		// chains `.catch()` on the returned promise and surfaces the error to the
		// workbench as a `SessionError` action. A synchronous throw escapes that
		// chain and the workbench is left waiting for a turn that never finishes
		// (the live smoke caught this in the Phase 5 walk).
		throw new Error('TODO: Phase 6');
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
		// `claudeProxyService.ts`. We honour that ordering by calling
		// `super.dispose()` first — it synchronously disposes the
		// `_sessions` DisposableMap, firing each session wrapper's
		// `dispose()` — and only then releasing the proxy handle. This
		// is locked by test "dispose awaits shutdown before releasing
		// the proxy handle".
		super.dispose();
		this._proxyHandle?.dispose();
		this._proxyHandle = undefined;
		this._githubToken = undefined;
		this._models.set([], undefined);
	}
}
