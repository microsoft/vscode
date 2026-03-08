/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSession, type AgentProvider, type IAgent, type IAgentAttachment, type IAgentCreateSessionConfig, type IAgentDescriptor, type IAgentMessageEvent, type IAgentModelInfo, type IAgentProgressEvent, type IAgentSessionMetadata, type IAgentToolCompleteEvent, type IAgentToolStartEvent } from '../../common/agentService.js';

export class ScriptedMockAgent implements IAgent {
	readonly id: AgentProvider = 'mock';

	private readonly _onDidSessionProgress = new Emitter<IAgentProgressEvent>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;

	// Track pending permission requests
	private readonly _pendingPermissions = new Map<string, (approved: boolean) => void>();

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

	async abortSession(_session: URI): Promise<void> { }

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
