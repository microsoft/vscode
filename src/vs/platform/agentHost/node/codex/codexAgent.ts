/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { type IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentBinaryPathEnvVar, AgentHostCodexAgentCodexHomeEnvVar, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE, IAgent, IAgentCreateSessionConfig, IAgentCreateSessionResult, IAgentDescriptor, IAgentMaterializeSessionEvent, IAgentModelInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, type AgentProvider } from '../../common/agentService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ActionType, type SessionAction } from '../../common/state/sessionActions.js';
import type { ModelSelection, ProtectedResourceMetadata, ToolDefinition } from '../../common/state/protocol/state.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import { type CustomizationRef, type MessageAttachment, type PendingMessage, type SessionInputAnswer, SessionInputResponseKind, type ToolCallResult, type Turn } from '../../common/state/sessionState.js';
import type { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { ICopilotApiService } from '../shared/copilotApiService.js';
import { CodexAppServerClient, JsonRpcError, transportFromChildProcess, type ICodexAppServerClient } from './codexAppServerClient.js';
import { ICodexProxyService, type ICodexProxyHandle } from './codexProxyService.js';
import { createCodexSessionMapState, mapAgentMessageDelta, mapItemCompleted, mapItemStarted, mapTurnCompleted, mapTurnStarted, type ICodexSessionMapState } from './codexMapAppServerEvents.js';
import { resolveCodexInput } from './codexPromptResolver.js';

const CLIENT_INFO = {
	name: 'vscode_agent_host',
	title: 'VS Code Agent Host',
	// The codex `clientInfo.version` is informational. Hardcoded to a
	// non-empty placeholder; bumping it isn't required when our code
	// changes.
	version: '0.1.0',
};

/**
 * Per-session bookkeeping. The codex thread is owned by the shared
 * connection in {@link CodexAgent}; this struct only tracks what the
 * `IAgent` surface needs.
 */
interface ICodexSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	readonly workingDirectory: URI | undefined;
	readonly mapState: ICodexSessionMapState;
	model: ModelSelection | undefined;
	currentTurnId: string | undefined;
	/** Set when this session was restored (Phase 3) and needs `thread/resume` before the first `turn/start`. */
	needsResume: boolean;
	/** Most recent user prompt sent on this session — used as fallback userMessage text in `turn/started`. */
	lastPromptText: string;
}

/**
 * Connection state machine. The codex process is spawned lazily on first
 * need (Decision 6) and stays alive for the agent's lifetime.
 */
type ConnectionState =
	| { readonly kind: 'idle' }
	| { readonly kind: 'starting'; readonly promise: Promise<IConnectionReady> }
	| ({ readonly kind: 'ready' } & IConnectionReady);

interface IConnectionReady {
	readonly client: ICodexAppServerClient;
	readonly proxyHandle: ICodexProxyHandle;
	readonly child: ChildProcessWithoutNullStreams;
}

/**
 * `IAgent` implementation backed by `codex app-server`.
 *
 * Phase 2 surface: createSession (blocks on `thread/start`), sendMessage
 * (one `turn/start`, streams `agentMessage` deltas), setPendingMessages
 * (steering via `turn/steer`), abortSession (`turn/interrupt`),
 * disposeSession (`thread/unsubscribe`, no process kill).
 *
 * Decisions 3 (shared process), 6 (lazy spawn), 7 (session id == threadId),
 * 10 (no cwd → reject), 15 (cancel, keep streamed content), 16 (steering),
 * 17 (attachments), 18 (apikey auth).
 */
export class CodexAgent extends Disposable implements IAgent {

	readonly id: AgentProvider = 'codex';

	private readonly _onDidSessionProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _onDidMaterializeSession = this._register(new Emitter<IAgentMaterializeSessionEvent>());
	readonly onDidMaterializeSession = this._onDidMaterializeSession.event;

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;

	private readonly _sessions = new Map<string, ICodexSession>();
	private _githubToken: string | undefined;
	private _connection: ConnectionState = { kind: 'idle' };

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@ICodexProxyService private readonly _codexProxyService: ICodexProxyService,
	) {
		super();
	}

	// #region Auth

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [GITHUB_COPILOT_PROTECTED_RESOURCE];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
			return false;
		}
		const changed = this._githubToken !== token;
		this._githubToken = token;
		if (changed && this._connection.kind === 'ready') {
			// Codex stays running — proxy reads the new token from its
			// own cell on the next request (Decision 4).
			this._connection.proxyHandle.setToken(token);
			void this._refreshModels(token);
		} else if (changed) {
			// Defer model refresh until the connection comes up.
			void this._refreshModels(token);
		}
		this._logService.info('[Codex] Auth token updated');
		return true;
	}

	private _ensureAuthenticated(): string {
		const token = this._githubToken;
		if (!token) {
			throw new ProtocolError(
				AHP_AUTH_REQUIRED,
				'Authentication is required to use Codex',
				this.getProtectedResources(),
			);
		}
		return token;
	}

	private async _refreshModels(token: string): Promise<void> {
		try {
			const all = await this._copilotApiService.models(token);
			if (this._githubToken !== token) {
				return;
			}
			const filtered = all
				.filter(m => /^(gpt-5|codex)/i.test(m.id) || /codex/i.test(m.name ?? ''))
				.map((m): IAgentModelInfo => ({
					provider: this.id,
					id: m.id,
					name: m.name ?? m.id,
					maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
					supportsVision: !!m.capabilities?.supports?.vision,
				}));
			this._models.set(filtered, undefined);
		} catch (err) {
			this._logService.warn(`[Codex] Failed to refresh models: ${err instanceof Error ? err.message : String(err)}`);
			if (this._githubToken === token) {
				this._models.set([], undefined);
			}
		}
	}

	// #endregion

	// #region Connection lifecycle

	/**
	 * Lazily spawn the codex app-server, initialize the connection,
	 * authenticate via apiKey, and return the ready connection. Idempotent
	 * — concurrent callers share the same promise.
	 */
	private _ensureConnection(): Promise<IConnectionReady> {
		if (this._connection.kind === 'ready') {
			return Promise.resolve(this._connection);
		}
		if (this._connection.kind === 'starting') {
			return this._connection.promise;
		}
		const token = this._ensureAuthenticated();
		const promise = this._startConnection(token).then(ready => {
			this._connection = { kind: 'ready', ...ready };
			return ready;
		}).catch(err => {
			this._connection = { kind: 'idle' };
			throw err;
		});
		this._connection = { kind: 'starting', promise };
		return promise;
	}

	private async _startConnection(token: string): Promise<IConnectionReady> {
		const binaryPath = process.env[AgentHostCodexAgentBinaryPathEnvVar];
		if (!binaryPath) {
			throw new Error(`Codex binary path not configured. Set 'chat.agentHost.codexAgent.path' to an absolute path to the codex CLI.`);
		}
		try {
			fs.accessSync(binaryPath, fs.constants.X_OK);
		} catch (err) {
			throw new Error(`Codex binary not executable: ${binaryPath} (${err instanceof Error ? err.message : String(err)})`);
		}

		const proxyHandle = await this._codexProxyService.start(token);

		// Build child env: inherit, override OPENAI_BASE_URL / OPENAI_API_KEY
		// so codex talks to our proxy instead of api.openai.com. CODEX_HOME
		// from setting overrides the default if set.
		const env: NodeJS.ProcessEnv = {
			...process.env,
			OPENAI_BASE_URL: `${proxyHandle.baseUrl}/v1`,
			OPENAI_API_KEY: proxyHandle.nonce,
		};
		const codexHome = process.env[AgentHostCodexAgentCodexHomeEnvVar];
		if (codexHome) {
			env.CODEX_HOME = codexHome;
		}

		// Extra args forwarded as JSON from the workbench setting.
		const extraArgs = parseBinaryArgs(process.env[AgentHostCodexAgentBinaryArgsEnvVar]);
		const args = ['app-server', ...extraArgs];

		this._logService.info(`[Codex] spawning ${binaryPath} ${args.join(' ')}`);
		const child = spawn(binaryPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

		// Surface stderr to the log channel — codex writes useful startup
		// diagnostics there. Mirror Claude's pattern.
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', chunk => this._logService.info(`[Codex stderr] ${String(chunk).trimEnd()}`));

		const transport = transportFromChildProcess(child);
		const client = new CodexAppServerClient(transport, (level, msg) => {
			this._logService.info(`[CodexClient ${level}] ${msg}`);
		});

		// Tear everything down if the child dies on its own.
		client.onExit(e => {
			this._logService.warn(`[Codex] app-server exited code=${e.code} signal=${e.signal}`);
			this._handleConnectionLost();
		});
		client.onTransportError(err => {
			this._logService.error(`[Codex] transport error: ${err.message}`);
			this._handleConnectionLost();
		});

		// Initialize handshake. Failure here is fatal for the connection.
		try {
			await client.request<'initialize'>('initialize', {
				clientInfo: CLIENT_INFO,
				capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: null },
			});
			client.notify<'initialized'>('initialized', undefined as never);
			// Wire up the apikey auth using the proxy's nonce (Decision 18).
			// Without this, codex's first turn fails with "requiresOpenaiAuth".
			await client.request<'account/login/start'>('account/login/start', {
				type: 'apiKey',
				apiKey: proxyHandle.nonce,
			});
		} catch (err) {
			client.dispose();
			proxyHandle.dispose();
			try { child.kill('SIGKILL'); } catch { /* already dead */ }
			throw err;
		}

		// Wire global notification → SessionAction dispatch.
		this._register(client.onNotification('thread/started', () => { /* no-op: createSession awaits the request response */ }));
		this._register(client.onNotification('turn/started', params => this._dispatchByThread(params.threadId, s => mapTurnStarted(s.mapState, params, s.lastPromptText))));
		this._register(client.onNotification('item/started', params => this._dispatchByThread(params.threadId, s => mapItemStarted(s.mapState, params))));
		this._register(client.onNotification('item/agentMessage/delta', params => this._dispatchByThread(params.threadId, s => mapAgentMessageDelta(s.mapState, params))));
		this._register(client.onNotification('item/completed', params => this._dispatchByThread(params.threadId, s => mapItemCompleted(s.mapState, params))));
		this._register(client.onNotification('turn/completed', params => this._dispatchByThread(params.threadId, s => {
			const out = mapTurnCompleted(s.mapState, params);
			if (s.currentTurnId === params.turn.id) {
				s.currentTurnId = undefined;
			}
			return out;
		})));

		return { client, proxyHandle, child };
	}

	private _dispatchByThread(threadId: string, mapFn: (s: ICodexSession) => ReturnType<typeof mapTurnStarted>): void {
		const session = this._sessions.get(threadId);
		if (!session) {
			// Notification for a session we don't track — most likely a
			// prewarmed thread (Phase 6) that hasn't been claimed yet.
			// Drop silently.
			return;
		}
		const actions = mapFn(session);
		for (const action of actions) {
			this._onDidSessionProgress.fire({ kind: 'action', session: session.sessionUri, action });
		}
	}

	private _handleConnectionLost(): void {
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		this._connection = { kind: 'idle' };
		// Notify every known session with a single SessionError + complete
		// pair so the UI surfaces "agent disconnected" cleanly.
		for (const session of this._sessions.values()) {
			const turnId = session.currentTurnId;
			session.currentTurnId = undefined;
			if (turnId) {
				this._onDidSessionProgress.fire({
					kind: 'action',
					session: session.sessionUri,
					action: {
						type: ActionType.SessionError,
						turnId,
						error: { errorType: 'CodexDisconnected', message: 'Codex app-server disconnected; session must restart.' },
					},
				});
				this._onDidSessionProgress.fire({
					kind: 'action',
					session: session.sessionUri,
					action: { type: ActionType.SessionTurnComplete, turnId },
				});
			}
		}
		// Release resources. The proxy handle is refcounted and drops
		// the underlying server once everyone releases.
		try { conn.client.dispose(); } catch { /* ignore */ }
		try { conn.proxyHandle.dispose(); } catch { /* ignore */ }
	}

	// #endregion

	// #region IAgent methods

	getDescriptor(): IAgentDescriptor {
		return {
			provider: this.id,
			displayName: localize('codexAgent.displayName', "Codex"),
			description: localize('codexAgent.description', "Codex agent backed by the OpenAI Codex app-server"),
		};
	}

	async createSession(config: IAgentCreateSessionConfig = {}): Promise<IAgentCreateSessionResult> {
		this._ensureAuthenticated();
		if (config.fork) {
			throw new Error('Codex agent does not support session forking');
		}
		if (!config.workingDirectory) {
			throw new Error('Codex requires a working directory; pass `workingDirectory` to createSession');
		}
		const conn = await this._ensureConnection();

		// Decision 7: codex's threadId IS our session id. Block until
		// `thread/start` resolves; no provisional state.
		const startResult = await conn.client.request<'thread/start', { thread: { id: string } }>('thread/start', {
			cwd: config.workingDirectory.fsPath,
			model: config.model?.id ?? null,
		});
		const threadId = startResult.thread.id;
		const sessionUri = AgentSession.uri(this.id, threadId);
		const session: ICodexSession = {
			sessionId: threadId,
			sessionUri,
			workingDirectory: config.workingDirectory,
			mapState: createCodexSessionMapState(),
			model: config.model,
			currentTurnId: undefined,
			needsResume: false,
			lastPromptText: '',
		};
		this._sessions.set(threadId, session);
		this._onDidMaterializeSession.fire({
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			project: undefined,
		});
		return {
			session: sessionUri,
			workingDirectory: config.workingDirectory,
			provisional: false,
		};
	}

	async sendMessage(sessionUri: URI, prompt: string, attachments?: readonly MessageAttachment[], turnId?: string): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`Codex session not found: ${sessionUri.toString()}`);
		}
		const conn = await this._ensureConnection();
		const effectiveTurnId = turnId ?? generateUuid();

		// Phase 3 resume path: defer to first sendMessage. If this session
		// was restored, we haven't yet told codex about it.
		if (session.needsResume) {
			try {
				await conn.client.request<'thread/resume'>('thread/resume', {
					threadId: session.sessionId,
				});
				session.needsResume = false;
			} catch (err) {
				this._fire(sessionUri, {
					type: ActionType.SessionError,
					turnId: effectiveTurnId,
					error: {
						errorType: 'CodexResumeFailed',
						message: err instanceof Error ? err.message : String(err),
					},
				});
				this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
				return;
			}
		}

		const { input, cleanupPaths } = resolveCodexInput(prompt, attachments);
		// Buffer the prompt text for `turn/started`'s userMessage fallback.
		session.lastPromptText = prompt;
		session.currentTurnId = effectiveTurnId;
		try {
			await conn.client.request<'turn/start'>('turn/start', {
				threadId: session.sessionId,
				input: input.slice(),
				model: session.model?.id ?? null,
			});
			// We don't await turn completion here — the notification
			// stream emits SessionTurnComplete asynchronously.
		} catch (err) {
			if (err instanceof CancellationError) {
				this._fire(sessionUri, { type: ActionType.SessionTurnCancelled, turnId: effectiveTurnId });
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._logService.error(`[Codex:${sessionId}] turn/start error: ${message}`);
			this._fire(sessionUri, {
				type: ActionType.SessionError,
				turnId: effectiveTurnId,
				error: { errorType: 'CodexTurnError', message },
			});
			this._fire(sessionUri, { type: ActionType.SessionTurnComplete, turnId: effectiveTurnId });
		} finally {
			// Best-effort temp-file cleanup. Image-on-localImage will be
			// re-read by codex synchronously during the turn so this is
			// safe to defer slightly; we delete after a generous grace.
			if (cleanupPaths.length > 0) {
				setTimeout(() => {
					for (const p of cleanupPaths) {
						try { fs.unlinkSync(p); } catch { /* ignore */ }
					}
				}, 30_000);
			}
		}
	}

	setPendingMessages(sessionUri: URI, steeringMessage: PendingMessage | undefined, _queuedMessages: readonly PendingMessage[]): void {
		if (!steeringMessage) {
			return;
		}
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		const turnId = session.currentTurnId;
		if (!turnId) {
			// No active turn — let the framework re-queue this as a normal sendMessage.
			return;
		}
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		const text = steeringMessage.userMessage?.text ?? '';
		if (text.length === 0 && (!steeringMessage.userMessage?.attachments || steeringMessage.userMessage.attachments.length === 0)) {
			return;
		}
		const { input } = resolveCodexInput(text, steeringMessage.userMessage?.attachments);
		void conn.client.request<'turn/steer'>('turn/steer', {
			threadId: sessionId,
			input: input.slice(),
			expectedTurnId: turnId,
		}).catch(err => {
			if (err instanceof JsonRpcError) {
				// `expectedTurnId` mismatch is benign — framework will requeue.
				this._logService.info(`[Codex:${sessionId}] turn/steer skipped: ${err.message}`);
				return;
			}
			this._logService.warn(`[Codex:${sessionId}] turn/steer failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	async abortSession(sessionUri: URI): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session || !session.currentTurnId) {
			return;
		}
		const conn = this._connection;
		if (conn.kind !== 'ready') {
			return;
		}
		try {
			await conn.client.request<'turn/interrupt'>('turn/interrupt', {
				threadId: sessionId,
				turnId: session.currentTurnId,
			});
		} catch (err) {
			this._logService.warn(`[Codex:${sessionId}] turn/interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async disposeSession(sessionUri: URI): Promise<void> {
		const sessionId = AgentSession.id(sessionUri);
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		this._sessions.delete(sessionId);
		const conn = this._connection;
		if (conn.kind === 'ready') {
			// `thread/unsubscribe` is the codex-native way to release a
			// session. Codex evicts after its 30-minute idle grace.
			try {
				await conn.client.request<'thread/unsubscribe'>('thread/unsubscribe', { threadId: sessionId });
			} catch (err) {
				this._logService.info(`[Codex:${sessionId}] thread/unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	async changeModel(sessionUri: URI, model: ModelSelection): Promise<void> {
		const session = this._sessions.get(AgentSession.id(sessionUri));
		if (session) {
			session.model = model;
		}
	}

	respondToPermissionRequest(_requestId: string, _approved: boolean): void {
		// Phase 4 wires this.
		this._logService.info('[Codex] respondToPermissionRequest called (Phase 4 stub)');
	}

	respondToUserInputRequest(_requestId: string, _response: SessionInputResponseKind, _answers?: Record<string, SessionInputAnswer>): void {
		// Phase 4 wires this.
		this._logService.info('[Codex] respondToUserInputRequest called (Phase 4 stub)');
	}

	getSessionMessages(_session: URI): Promise<readonly Turn[]> {
		// Phase 3 implements this via `thread/read`.
		return Promise.resolve([]);
	}

	listSessions(): Promise<IAgentSessionMetadata[]> {
		// Phase 3 implements this via `thread/list`.
		return Promise.resolve([]);
	}

	setClientTools(_session: URI, _clientId: string, _tools: ToolDefinition[]): void {
		// Phase 6+: in-process MCP client tools. Not implemented in Phase 2.
	}

	onClientToolCallComplete(_session: URI, _toolCallId: string, _result: ToolCallResult): void {
		// Phase 4+.
	}

	setClientCustomizations(_session: URI, _clientId: string, _customizations: CustomizationRef[]): Promise<ISyncedCustomization[]> {
		return Promise.resolve([]);
	}

	setCustomizationEnabled(_uri: string, _enabled: boolean): void {
		// no-op; customizations not yet wired for codex.
	}

	async shutdown(): Promise<void> {
		if (this._connection.kind === 'ready') {
			try { this._connection.client.dispose(); } catch { /* ignore */ }
			try { this._connection.proxyHandle.dispose(); } catch { /* ignore */ }
		}
		this._connection = { kind: 'idle' };
		this._sessions.clear();
	}

	resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		// Phase 5 adds the dynamic schema.
		return Promise.resolve({ values: {}, schema: { type: 'object', properties: {} } });
	}

	sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		return Promise.resolve({ items: [] });
	}

	// #endregion

	private _fire(sessionUri: URI, action: SessionAction): void {
		this._onDidSessionProgress.fire({ kind: 'action', session: sessionUri, action });
	}

	override dispose(): void {
		if (this._connection.kind === 'ready') {
			try { this._connection.client.dispose(); } catch { /* ignore */ }
			try { this._connection.proxyHandle.dispose(); } catch { /* ignore */ }
		}
		this._connection = { kind: 'idle' };
		this._sessions.clear();
		super.dispose();
	}
}

function parseBinaryArgs(json: string | undefined): string[] {
	if (!json) {
		return [];
	}
	try {
		const parsed = JSON.parse(json);
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
	} catch {
		return [];
	}
}
