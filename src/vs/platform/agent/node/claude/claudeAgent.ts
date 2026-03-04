/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentCreateSessionConfig, IAgentModelInfo, IAgentProgressEvent, IAgentMessageEvent, IAgent, IAgentSessionMetadata, IAgentToolStartEvent, IAgentToolCompleteEvent, AgentSession, IAgentDescriptor } from '../../common/agentService.js';
import { ClaudeSession } from './claudeSession.js';

/**
 * Agent provider backed by the Claude Agent SDK.
 */
export class ClaudeAgent extends Disposable implements IAgent {
	readonly id = 'claude' as const;

	private readonly _onDidSessionProgress = this._register(new Emitter<IAgentProgressEvent>());
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = this._register(new DisposableMap<string, ClaudeSession>());

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
	}

	// ---- auth ---------------------------------------------------------------

	getDescriptor(): IAgentDescriptor {
		return {
			provider: 'claude',
			displayName: 'Agent Host - Claude',
			description: 'Claude SDK agent running in a dedicated process',
			requiresAuth: false,
		};
	}

	async setAuthToken(_token: string): Promise<void> {
		// Claude SDK uses its own API key; no-op for GitHub tokens.
	}

	// ---- session management -------------------------------------------------

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		// Claude SDK doesn't persist sessions.
		return [];
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		// Model selection is handled by the SDK's Options.model field.
		return [];
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const rawId = config?.session ? AgentSession.id(config.session) : generateUuid();
		this._logService.info(`[Claude] Creating session ${rawId}${config?.model ? ` model=${config.model}` : ''}`);
		const session = new ClaudeSession(rawId, config?.model, process.cwd(), this._logService);
		session.onProgress(e => this._onDidSessionProgress.fire(e));
		await session.start();
		this._sessions.set(rawId, session);
		const sessionUri = AgentSession.uri(this.id, rawId);
		this._logService.info(`[Claude] Session created: ${sessionUri.toString()}`);
		return sessionUri;
	}

	async sendMessage(session: URI, prompt: string): Promise<void> {
		const rawId = AgentSession.id(session);
		const sess = this._sessions.get(rawId);
		if (!sess) {
			throw new Error(`[Claude] Unknown session: ${session.toString()}`);
		}
		this._logService.info(`[Claude:${rawId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
		await sess.send(prompt);
		this._logService.info(`[Claude:${rawId}] send() returned`);
	}

	async getSessionMessages(_session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		// Claude SDK doesn't support message history retrieval.
		return [];
	}

	async disposeSession(session: URI): Promise<void> {
		this._sessions.deleteAndDispose(AgentSession.id(session));
	}

	async shutdown(): Promise<void> {
		this._logService.info('[Claude] Shutting down...');
		this._sessions.clearAndDisposeAll();
	}

	/**
	 * Returns true if this provider owns the given session ID.
	 */
	hasSession(session: URI): boolean {
		return this._sessions.has(AgentSession.id(session));
	}
}
