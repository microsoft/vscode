/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSession, type AgentProvider, type IAgent, type IAgentAttachment, type IAgentCreateSessionConfig, type IAgentDescriptor, type IAgentMessageEvent, type IAgentModelInfo, type IAgentProgressEvent, type IAgentSessionMetadata, type IAgentToolCompleteEvent, type IAgentToolStartEvent } from '../../common/agentService.js';

/**
 * General-purpose mock agent for unit tests. Tracks all method calls
 * for assertion and exposes {@link fireProgress} to inject progress events.
 */
export class MockAgent implements IAgent {
	private readonly _onDidSessionProgress = new Emitter<IAgentProgressEvent>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;

	readonly setAuthTokenCalls: string[] = [];
	readonly sendMessageCalls: { session: URI; prompt: string }[] = [];
	readonly disposeSessionCalls: URI[] = [];
	readonly abortSessionCalls: URI[] = [];
	readonly respondToPermissionCalls: { requestId: string; approved: boolean }[] = [];
	readonly changeModelCalls: { session: URI; model: string }[] = [];

	constructor(readonly id: AgentProvider = 'mock') { }

	getDescriptor(): IAgentDescriptor {
		return { provider: this.id, displayName: `Agent ${this.id}`, description: `Test ${this.id} agent`, requiresAuth: this.id === 'copilot' };
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		return [{ provider: this.id, id: `${this.id}-model`, name: `${this.id} Model`, maxContextWindow: 128000, supportsVision: false, supportsReasoningEffort: false }];
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()].map(s => ({ session: s, startTime: Date.now(), modifiedTime: Date.now() }));
	}

	async createSession(_config?: IAgentCreateSessionConfig): Promise<URI> {
		const rawId = `${this.id}-session-${this._nextId++}`;
		const session = AgentSession.uri(this.id, rawId);
		this._sessions.set(rawId, session);
		return session;
	}

	async sendMessage(session: URI, prompt: string): Promise<void> {
		this.sendMessageCalls.push({ session, prompt });
	}

	async getSessionMessages(_session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		return [];
	}

	async disposeSession(session: URI): Promise<void> {
		this.disposeSessionCalls.push(session);
		this._sessions.delete(AgentSession.id(session));
	}

	async abortSession(session: URI): Promise<void> {
		this.abortSessionCalls.push(session);
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		this.respondToPermissionCalls.push({ requestId, approved });
	}

	async changeModel(session: URI, model: string): Promise<void> {
		this.changeModelCalls.push({ session, model });
	}

	async setAuthToken(token: string): Promise<void> {
		this.setAuthTokenCalls.push(token);
	}

	async shutdown(): Promise<void> { }

	fireProgress(event: IAgentProgressEvent): void {
		this._onDidSessionProgress.fire(event);
	}

	dispose(): void {
		this._onDidSessionProgress.dispose();
	}
}

export class ScriptedMockAgent implements IAgent {
	readonly id: AgentProvider = 'mock';

	private readonly _onDidSessionProgress = new Emitter<IAgentProgressEvent>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;

	// Track pending permission requests
	private readonly _pendingPermissions = new Map<string, (approved: boolean) => void>();
	// Track pending abort callbacks for slow responses
	private readonly _pendingAborts = new Map<string, () => void>();

	getDescriptor(): IAgentDescriptor {
		return { provider: 'mock', displayName: 'Mock Agent', description: 'Scripted test agent', requiresAuth: false };
	}

	async listModels(): Promise<IAgentModelInfo[]> {
		return [{ provider: 'mock', id: 'mock-model', name: 'Mock Model', maxContextWindow: 128000, supportsVision: false, supportsReasoningEffort: false }];
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		return [...this._sessions.values()].map(s => ({ session: s, startTime: Date.now(), modifiedTime: Date.now() }));
	}

	async createSession(_config?: IAgentCreateSessionConfig): Promise<URI> {
		const rawId = `mock-session-${this._nextId++}`;
		const session = AgentSession.uri('mock', rawId);
		this._sessions.set(rawId, session);
		return session;
	}

	async sendMessage(session: URI, prompt: string, _attachments?: IAgentAttachment[]): Promise<void> {
		switch (prompt) {
			case 'hello':
				this._fireSequence(session, [
					{ type: 'delta', session, messageId: 'msg-1', content: 'Hello, world!' },
					{ type: 'idle', session },
				]);
				break;

			case 'use-tool':
				this._fireSequence(session, [
					{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'echo_tool', displayName: 'Echo Tool', invocationMessage: 'Running echo tool...' },
					{ type: 'tool_complete', session, toolCallId: 'tc-1', success: true, pastTenseMessage: 'Ran echo tool', toolOutput: 'echoed' },
					{ type: 'delta', session, messageId: 'msg-1', content: 'Tool done.' },
					{ type: 'idle', session },
				]);
				break;

			case 'error':
				this._fireSequence(session, [
					{ type: 'error', session, errorType: 'test_error', message: 'Something went wrong' },
				]);
				break;

			case 'permission': {
				// Fire permission_request, then wait for respondToPermissionRequest
				const permEvent: IAgentProgressEvent = {
					type: 'permission_request',
					session,
					requestId: 'perm-1',
					permissionKind: 'shell',
					fullCommandText: 'echo test',
					intention: 'Run a test command',
					rawRequest: JSON.stringify({ permissionKind: 'shell', fullCommandText: 'echo test', intention: 'Run a test command' }),
				};
				setTimeout(() => this._onDidSessionProgress.fire(permEvent), 10);
				this._pendingPermissions.set('perm-1', (approved) => {
					if (approved) {
						this._fireSequence(session, [
							{ type: 'delta', session, messageId: 'msg-1', content: 'Allowed.' },
							{ type: 'idle', session },
						]);
					}
				});
				break;
			}

			case 'with-usage':
				this._fireSequence(session, [
					{ type: 'delta', session, messageId: 'msg-1', content: 'Usage response.' },
					{ type: 'usage', session, inputTokens: 100, outputTokens: 50, model: 'mock-model' },
					{ type: 'idle', session },
				]);
				break;

			case 'slow': {
				// Slow response for cancel testing — fires delta after a long delay
				const timer = setTimeout(() => {
					this._fireSequence(session, [
						{ type: 'delta', session, messageId: 'msg-1', content: 'Slow response.' },
						{ type: 'idle', session },
					]);
				}, 5000);
				this._pendingAborts.set(session.toString(), () => clearTimeout(timer));
				break;
			}

			default:
				this._fireSequence(session, [
					{ type: 'delta', session, messageId: 'msg-1', content: 'Unknown prompt: ' + prompt },
					{ type: 'idle', session },
				]);
				break;
		}
	}

	async getSessionMessages(_session: URI): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
		return [];
	}

	async disposeSession(session: URI): Promise<void> {
		this._sessions.delete(AgentSession.id(session));
	}

	async abortSession(session: URI): Promise<void> {
		const callback = this._pendingAborts.get(session.toString());
		if (callback) {
			this._pendingAborts.delete(session.toString());
			callback();
		}
	}

	async changeModel(_session: URI, _model: string): Promise<void> {
		// Mock agent doesn't track model state
	}

	respondToPermissionRequest(requestId: string, approved: boolean): void {
		const callback = this._pendingPermissions.get(requestId);
		if (callback) {
			this._pendingPermissions.delete(requestId);
			callback(approved);
		}
	}

	async setAuthToken(_token: string): Promise<void> { }

	async shutdown(): Promise<void> { }

	dispose(): void {
		this._onDidSessionProgress.dispose();
	}

	private _fireSequence(session: URI, events: IAgentProgressEvent[]): void {
		let delay = 0;
		for (const event of events) {
			delay += 10;
			setTimeout(() => this._onDidSessionProgress.fire(event), delay);
		}
	}
}
