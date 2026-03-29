/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient } from '@github/copilot-sdk';
import { rgPath } from '@vscode/ripgrep';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import type { IAuthorizationProtectedResourceMetadata } from '../../../../base/common/oauth.js';
import { delimiter, dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSession, IAgent, IAgentAttachment, IAgentCreateSessionConfig, IAgentDescriptor, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentSessionMetadata, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { type IPendingMessage, type PolicyState } from '../../common/state/sessionState.js';
import { CopilotAgentSession, SessionWrapperFactory } from './copilotAgentSession.js';
import { CopilotSessionWrapper } from './copilotSessionWrapper.js';

/**
 * Agent provider backed by the Copilot SDK {@link CopilotClient}.
 */
export class CopilotAgent extends Disposable implements IAgent {
	readonly id = 'copilot' as const;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private _client: CopilotClient | undefined;
	private _clientStarting: Promise<CopilotClient> | undefined;
	private _githubToken: string | undefined;
	private readonly _sessions = this._register(new DisposableMap<string, CopilotAgentSession>());

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	// ---- auth ---------------------------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: 'copilot',
			displayName: 'Agent Host - Copilot',
			description: 'Copilot SDK agent running in a dedicated process',
			requiresAuth: true,
		};
	}

	getProtectedResources(): IAuthorizationProtectedResourceMetadata[] {
		return [{
			resource: 'https://api.github.com',
			resource_name: 'GitHub Copilot',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['read:user', 'user:email'],
		}];
	}

	async authenticate(resource: string, token: string): Promise<boolean> {
		if (resource !== 'https://api.github.com') {
			return false;
		}
		const tokenChanged = this._githubToken !== token;
		this._githubToken = token;
		this._logService.info(`[Copilot] Auth token ${tokenChanged ? 'updated' : 'unchanged'}`);
		if (tokenChanged && this._client && this._sessions.size === 0) {
			this._logService.info('[Copilot] Restarting CopilotClient with new token');
			const client = this._client;
			this._client = undefined;
			this._clientStarting = undefined;
			await client.stop();
		}
		return true;
	}

	// ---- client lifecycle ---------------------------------------------------

	private async _ensureClient(): Promise<CopilotClient> {
		if (this._client) {
			return this._client;
		}
		if (this._clientStarting) {
			return this._clientStarting;
		}
		this._clientStarting = (async () => {
			this._logService.info(`[Copilot] Starting CopilotClient... ${this._githubToken ? '(with token)' : '(no token)'}`);

			// Build a clean env for the CLI subprocess, stripping Electron/VS Code vars
			// that can interfere with the Node.js process the SDK spawns.
			const env: Record<string, string | undefined> = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
			delete env['NODE_OPTIONS'];
			delete env['VSCODE_INSPECTOR_OPTIONS'];
			delete env['VSCODE_ESM_ENTRYPOINT'];
			delete env['VSCODE_HANDLES_UNCAUGHT_ERRORS'];
			for (const key of Object.keys(env)) {
				if (key === 'ELECTRON_RUN_AS_NODE') {
					continue;
				}
				if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
					delete env[key];
				}
			}
			env['COPILOT_CLI_RUN_AS_NODE'] = '1';
			env['USE_BUILTIN_RIPGREP'] = '0';

			// Resolve the CLI entry point from node_modules. We can't use require.resolve()
			// because @github/copilot's exports map blocks direct subpath access.
			// FileAccess.asFileUri('') points to the `out/` directory; node_modules is one level up.
			const cliPath = URI.joinPath(FileAccess.asFileUri(''), '..', 'node_modules', '@github', 'copilot', 'index.js').fsPath;

			// Add VS Code's built-in ripgrep to PATH so the CLI subprocess can find it.
			// If @vscode/ripgrep is in an .asar file, the binary is unpacked.
			const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
			const rgDir = dirname(rgDiskPath);
			// On Windows the env key is typically "Path" (not "PATH"). Since we copied
			// process.env into a plain (case-sensitive) object, we must find the actual key.
			const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
			const currentPath = env[pathKey];
			env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
			this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);

			const client = new CopilotClient({
				githubToken: this._githubToken,
				useLoggedInUser: !this._githubToken,
				useStdio: true,
				autoStart: true,
				env,
				cliPath,
			});
			await client.start();
			this._logService.info('[Copilot] CopilotClient started successfully');
			this._client = client;
			this._clientStarting = undefined;
			return client;
		})();
		return this._clientStarting;
	}

	// ---- session management -------------------------------------------------

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		this._logService.info('[Copilot] Listing sessions...');
		const client = await this._ensureClient();
		const sessions = await client.listSessions();
		const result: IAgentSessionMetadata[] = sessions.map(s => ({
			session: AgentSession.uri(this.id, s.sessionId),
			startTime: s.startTime.getTime(),
			modifiedTime: s.modifiedTime.getTime(),
			summary: s.summary,
			workingDirectory: typeof s.context?.cwd === 'string' ? s.context.cwd : undefined,
		}));
		this._logService.info(`[Copilot] Found ${result.length} sessions`);
		return result;
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		this._logService.info('[Copilot] Listing models...');
		const client = await this._ensureClient();
		const models = await client.listModels();
		const result = models.map(m => ({
			provider: this.id,
			id: m.id,
			name: m.name,
			maxContextWindow: m.capabilities.limits.max_context_window_tokens,
			supportsVision: m.capabilities.supports.vision,
			supportsReasoningEffort: m.capabilities.supports.reasoningEffort,
			supportedReasoningEfforts: m.supportedReasoningEfforts,
			defaultReasoningEffort: m.defaultReasoningEffort,
			policyState: m.policy?.state as PolicyState | undefined,
			billingMultiplier: m.billing?.multiplier,
		}));
		this._logService.info(`[Copilot] Found ${result.length} models`);
		return result;
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		this._logService.info(`[Copilot] Creating session... ${config?.model ? `model=${config.model}` : ''}`);
		const client = await this._ensureClient();

		const factory: SessionWrapperFactory = async callbacks => {
			const raw = await client.createSession({
				model: config?.model,
				sessionId: config?.session ? AgentSession.id(config.session) : undefined,
				streaming: true,
				workingDirectory: config?.workingDirectory,
				onPermissionRequest: callbacks.onPermissionRequest,
				hooks: callbacks.hooks,
			});
			return new CopilotSessionWrapper(raw);
		};

		const agentSession = this._createAgentSession(factory, config?.workingDirectory, config?.session ? AgentSession.id(config.session) : undefined);
		await agentSession.initializeSession();

		const session = agentSession.sessionUri;
		this._logService.info(`[Copilot] Session created: ${session.toString()}`);
		return session;
	}

	async sendMessage(session: URI, prompt: string, attachments?: IAgentAttachment[]): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId);
		await entry.send(prompt, attachments);
	}

	setPendingMessages(session: URI, steeringMessage: IPendingMessage | undefined, _queuedMessages: readonly IPendingMessage[]): void {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (!entry) {
			this._logService.warn(`[Copilot:${sessionId}] setPendingMessages: session not found`);
			return;
		}

		// Steering: send with mode 'immediate' so the SDK injects it mid-turn
		if (steeringMessage) {
			entry.sendSteering(steeringMessage);
		}

		// Queued messages are consumed by the server (AgentSideEffects)
		// which dispatches SessionTurnStarted and calls sendMessage directly.
		// No SDK-level enqueue is needed.
	}

	async getSessionMessages(session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId) ?? await this._resumeSession(sessionId).catch(() => undefined);
		if (!entry) {
			return [];
		}
		return entry.getMessages();
	}

	async disposeSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		this._sessions.deleteAndDispose(sessionId);
	}

	async abortSession(session: URI): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			await entry.abort();
		}
	}

	async changeModel(session: URI, model: string): Promise<void> {
		const sessionId = AgentSession.id(session);
		const entry = this._sessions.get(sessionId);
		if (entry) {
			await entry.setModel(model);
		}
	}

	async shutdown(): Promise<void> {
		this._logService.info('[Copilot] Shutting down...');
		this._sessions.clearAndDisposeAll();
		await this._client?.stop();
		this._client = undefined;
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		for (const [, session] of this._sessions) {
			if (session.respondToPermissionRequest(requestId, approved)) {
				return;
			}
		}
	}

	/**
	 * Returns true if this provider owns the given session ID.
	 */
	hasSession(session: URI): boolean {
		return this._sessions.has(AgentSession.id(session));
	}

	// ---- helpers ------------------------------------------------------------

	/**
	 * Creates a {@link CopilotAgentSession}, registers it in the sessions map,
	 * and returns it. The caller must call {@link CopilotAgentSession.initializeSession}
	 * to wire up the SDK session.
	 */
	private _createAgentSession(wrapperFactory: SessionWrapperFactory, workingDirectory: string | undefined, sessionIdOverride?: string): CopilotAgentSession {
		const rawId = sessionIdOverride ?? crypto.randomUUID();
		const sessionUri = AgentSession.uri(this.id, rawId);

		const agentSession = this._instantiationService.createInstance(
			CopilotAgentSession,
			sessionUri,
			rawId,
			workingDirectory,
			this._onDidSessionProgress,
			wrapperFactory,
		);

		this._sessions.set(rawId, agentSession);
		return agentSession;
	}

	private async _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this._logService.info(`[Copilot:${sessionId}] Session not in memory, resuming...`);
		const client = await this._ensureClient();

		const factory: SessionWrapperFactory = async callbacks => {
			const raw = await client.resumeSession(sessionId, {
				onPermissionRequest: callbacks.onPermissionRequest,
				workingDirectory: undefined,
				hooks: callbacks.hooks,
			});
			return new CopilotSessionWrapper(raw);
		};

		const agentSession = this._createAgentSession(factory, undefined, sessionId);
		await agentSession.initializeSession();
		return agentSession;
	}

	override dispose(): void {
		this._client?.stop().catch(() => { /* best-effort */ });
		super.dispose();
	}
}
