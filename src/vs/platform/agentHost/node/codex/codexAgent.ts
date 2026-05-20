/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import { Codex, type Thread, type ThreadEvent, type ModelReasoningEffort } from '@openai/codex-sdk';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { createSchema, platformSessionSchema } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentProvider, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata } from '../../common/agentService.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import { ResponsePartKind, type ModelSelection, type ToolDefinition } from '../../common/state/protocol/state.js';
import { CustomizationRef, SessionInputResponseKind, type MessageAttachment, type PendingMessage, type SessionInputAnswer, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { ICodexProxyHandle, ICodexProxyService } from './codexProxyService.js';

/**
 * Heuristic for picking OpenAI-family models out of the Copilot CAPI
 * model list. Codex is happy with any chat-capable OpenAI model, so
 * we keep the filter loose.
 */
function isCodexModel(m: CCAModel): boolean {
	return m.vendor === 'OpenAI' && !!m.model_picker_enabled && !!m.capabilities?.supports?.tool_calls;
}

function toAgentModelInfo(m: CCAModel, provider: AgentProvider): IAgentModelInfo {
	return {
		provider,
		id: m.id,
		name: m.name,
		maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
		supportsVision: !!m.capabilities?.supports?.vision,
	};
}

const CODEX_EFFORT_LEVELS: readonly ModelReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];

function resolveCodexEffort(model: ModelSelection | undefined): ModelReasoningEffort | undefined {
	const raw = model?.config?.['reasoningEffort'] ?? model?.config?.['effort'];
	return CODEX_EFFORT_LEVELS.includes(raw as ModelReasoningEffort) ? raw as ModelReasoningEffort : undefined;
}

interface ICodexSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	readonly workingDirectory: URI | undefined;
	thread: Thread | undefined;
	model: ModelSelection | undefined;
	abortController: AbortController;
}

/**
 * Codex agent provider — wraps the bundled `@openai/codex-sdk`. The SDK
 * shells out to the `codex` CLI under the hood; if the CLI isn't on the
 * user's PATH, the first `sendMessage` will surface a `SessionError`.
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
	private readonly _sessions = new Map<string, ICodexSession>();
	private _shutdownPromise: Promise<void> | undefined;
	private _codex: Codex | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@ICodexProxyService private readonly _codexProxyService: ICodexProxyService,
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
		this._codex = new Codex({
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
		const existing = this._sessions.get(sessionId);
		if (existing) {
			return {
				session: existing.sessionUri,
				workingDirectory: existing.workingDirectory,
				provisional: !existing.thread,
			};
		}
		this._sessions.set(sessionId, {
			sessionId,
			sessionUri,
			workingDirectory: config.workingDirectory,
			thread: undefined,
			model: config.model,
			abortController: new AbortController(),
		});
		return {
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			provisional: true,
		};
	}

	resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		// Minimal Phase 1 surface: reuse only the platform `Permissions`
		// property so the host's auto-approval UI keeps working. Approval
		// modes, sandboxing, and web search are deferred.
		const sessionSchema = createSchema({
			[SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions],
		});
		const values = sessionSchema.validateOrDefault(_params.config, {});
		return Promise.resolve({ schema: sessionSchema.toProtocol(), values });
	}

	sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return Promise.resolve({ items: [] });
	}

	async sendMessage(sessionUri: URI, prompt: string, _attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			throw new Error(`Codex session not found: ${sessionId}`);
		}
		const effectiveTurnId = turnId ?? generateUuid();

		if (!entry.thread) {
			const codex = this._ensureAuthenticated();
			const effort = resolveCodexEffort(entry.model);
			entry.thread = codex.startThread({
				...(entry.workingDirectory ? { workingDirectory: entry.workingDirectory.fsPath } : {}),
				...(entry.model?.id ? { model: entry.model.id } : {}),
				...(effort ? { modelReasoningEffort: effort } : {}),
				skipGitRepoCheck: true,
			});
			this._onDidMaterializeSession.fire({
				session: sessionUri,
				workingDirectory: entry.workingDirectory,
				project: undefined,
			});
		}

		try {
			const { events } = await entry.thread.runStreamed(prompt, { signal: entry.abortController.signal });
			for await (const event of events) {
				this._mapEvent(sessionUri, effectiveTurnId, event);
			}
			this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
		} catch (err) {
			if (err instanceof CancellationError || entry.abortController.signal.aborted) {
				this._fire(sessionUri, { type: ActionType.SessionTurnCancelled, turnId: effectiveTurnId });
				// Re-arm the abort controller for the next turn.
				entry.abortController = new AbortController();
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._fire(sessionUri, {
				type: ActionType.SessionError,
				turnId: effectiveTurnId,
				error: { errorType: 'CodexError', message, ...(err instanceof Error && err.stack ? { stack: err.stack } : {}) },
			});
			this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
		}
	}

	private _mapEvent(sessionUri: URI, turnId: string, event: ThreadEvent): void {
		switch (event.type) {
			case 'item.completed': {
				const item = event.item;
				if (item.type === 'agent_message' && item.text) {
					this._fire(sessionUri, {
						type: ActionType.SessionResponsePart,
						turnId,
						part: { kind: ResponsePartKind.Markdown, id: item.id, content: item.text },
					});
				} else if (item.type === 'reasoning' && item.text) {
					this._fire(sessionUri, {
						type: ActionType.SessionResponsePart,
						turnId,
						part: { kind: ResponsePartKind.Reasoning, id: item.id, content: item.text },
					});
				} else if (item.type === 'error') {
					this._fire(sessionUri, {
						type: ActionType.SessionError,
						turnId,
						error: { errorType: 'CodexError', message: item.message },
					});
				}
				return;
			}
			case 'turn.completed': {
				const u = event.usage;
				this._fire(sessionUri, {
					type: ActionType.SessionUsage,
					turnId,
					usage: {
						inputTokens: u.input_tokens,
						outputTokens: u.output_tokens,
						cacheReadTokens: u.cached_input_tokens,
					},
				});
				return;
			}
			case 'turn.failed': {
				this._fire(sessionUri, {
					type: ActionType.SessionError,
					turnId,
					error: { errorType: 'CodexError', message: event.error.message },
				});
				return;
			}
			case 'error': {
				this._fire(sessionUri, {
					type: ActionType.SessionError,
					turnId,
					error: { errorType: 'CodexError', message: event.message },
				});
				return;
			}
			default:
				return;
		}
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

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			entry.abortController.abort();
			this._sessions.delete(sessionId);
		}
	}

	async abortSession(session: URI): Promise<void> {
		const entry = this._sessions.get(AgentSession.id(session));
		entry?.abortController.abort();
	}

	async changeModel(session: URI, model: ModelSelection): Promise<void> {
		const entry = this._sessions.get(AgentSession.id(session));
		if (entry) {
			entry.model = model;
			// Model swaps only take effect on the next thread, since
			// Codex threads bind their model at startThread().
		}
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		// Codex SDK does not currently expose mid-turn permission gating
		// through the events API — `approvalPolicy` is set at thread start.
	}

	respondToUserInputRequest(_requestId: string, _response: SessionInputResponseKind, _answers?: Record<string, SessionInputAnswer>): void {
		// Codex SDK has no equivalent of the Claude `ask_user` tool yet.
	}

	setPendingMessages(_session: URI, _steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		// Steering / mid-turn injection is not modeled by the Codex SDK.
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
				entry.abortController.abort();
			}
			this._sessions.clear();
		})();
	}

	override dispose(): void {
		for (const entry of this._sessions.values()) {
			entry.abortController.abort();
		}
		this._sessions.clear();
		super.dispose();
		this._proxyHandle?.dispose();
		this._proxyHandle = undefined;
		this._githubToken = undefined;
		this._codex = undefined;
		this._models.set([], undefined);
	}
}
