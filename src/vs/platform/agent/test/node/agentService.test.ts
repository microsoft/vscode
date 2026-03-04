/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession, IAgent, IAgentCreateSessionConfig, IAgentDescriptor, IAgentMessageEvent, IAgentModelInfo, IAgentProgressEvent, IAgentSessionMetadata, IAgentToolCompleteEvent, IAgentToolStartEvent, AgentProvider } from '../../common/agentService.js';
import { AgentService } from '../../node/agentService.js';

class MockAgent implements IAgent {
	private readonly _onDidSessionProgress = new Emitter<IAgentProgressEvent>();
	readonly onDidSessionProgress = this._onDidSessionProgress.event;

	private readonly _sessions = new Map<string, URI>();
	private _nextId = 1;

	readonly setAuthTokenCalls: string[] = [];
	readonly sendMessageCalls: { session: URI; prompt: string }[] = [];
	readonly disposeSessionCalls: URI[] = [];

	constructor(readonly id: AgentProvider) { }

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

	async abortSession(_session: URI): Promise<void> { }

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

suite('AgentService (node dispatcher)', () => {

	const disposables = new DisposableStore();
	let service: AgentService;
	let copilotAgent: MockAgent;
	let claudeAgent: MockAgent;

	setup(() => {
		service = disposables.add(new AgentService(new NullLogService()));
		copilotAgent = new MockAgent('copilot');
		claudeAgent = new MockAgent('claude');
		disposables.add(toDisposable(() => copilotAgent.dispose()));
		disposables.add(toDisposable(() => claudeAgent.dispose()));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider registration ------------------------------------------

	suite('registerProvider', () => {

		test('registers a provider successfully', () => {
			service.registerProvider(copilotAgent);
			// No throw - success
		});

		test('throws on duplicate provider registration', () => {
			service.registerProvider(copilotAgent);
			const duplicate = new MockAgent('copilot');
			disposables.add(toDisposable(() => duplicate.dispose()));
			assert.throws(() => service.registerProvider(duplicate), /already registered/);
		});

		test('forwards progress events from registered providers', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });

			const events: IAgentProgressEvent[] = [];
			disposables.add(service.onDidSessionProgress(e => events.push(e)));

			copilotAgent.fireProgress({ session, type: 'delta', messageId: 'msg-1', content: 'hello' });
			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].type, 'delta');
		});
	});

	// ---- listAgents -----------------------------------------------------

	suite('listAgents', () => {

		test('returns descriptors from all registered providers', async () => {
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			const agents = await service.listAgents();
			assert.strictEqual(agents.length, 2);
			assert.ok(agents.some(a => a.provider === 'copilot'));
			assert.ok(agents.some(a => a.provider === 'claude'));
		});

		test('returns empty array when no providers are registered', async () => {
			const agents = await service.listAgents();
			assert.strictEqual(agents.length, 0);
		});
	});

	// ---- createSession --------------------------------------------------

	suite('createSession', () => {

		test('creates session via specified provider', async () => {
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			const session = await service.createSession({ provider: 'claude' });
			assert.strictEqual(AgentSession.provider(session), 'claude');
		});

		test('uses default provider when none specified', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession();
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('throws when no provider is registered for the requested provider', async () => {
			service.registerProvider(copilotAgent);

			await assert.rejects(() => service.createSession({ provider: 'claude' }), /No agent provider/);
		});

		test('throws when no providers are registered at all', async () => {
			await assert.rejects(() => service.createSession(), /No agent provider/);
		});
	});

	// ---- sendMessage ----------------------------------------------------

	suite('sendMessage', () => {

		test('dispatches to the correct provider based on session tracking', async () => {
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			const session = await service.createSession({ provider: 'claude' });
			await service.sendMessage(session, 'hello');

			assert.strictEqual(claudeAgent.sendMessageCalls.length, 1);
			assert.strictEqual(claudeAgent.sendMessageCalls[0].prompt, 'hello');
			assert.strictEqual(copilotAgent.sendMessageCalls.length, 0);
		});

		test('infers provider from URI scheme for untracked sessions', async () => {
			service.registerProvider(copilotAgent);
			const session = AgentSession.uri('copilot', 'external-session');

			await service.sendMessage(session, 'hello from untracked');

			assert.strictEqual(copilotAgent.sendMessageCalls.length, 1);
		});

		test('falls back to default provider for unrecognized URI scheme', async () => {
			service.registerProvider(copilotAgent);
			const unknownSession = URI.from({ scheme: 'unknown', path: '/sess-1' });

			// Should not throw -- falls back to the default provider
			await service.sendMessage(unknownSession, 'hello');
			assert.strictEqual(copilotAgent.sendMessageCalls.length, 1);
		});
	});

	// ---- disposeSession -------------------------------------------------

	suite('disposeSession', () => {

		test('dispatches to the correct provider and cleans up tracking', async () => {
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			const session = await service.createSession({ provider: 'copilot' });
			await service.disposeSession(session);

			assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1);
		});

		test('is a no-op for unknown sessions', async () => {
			service.registerProvider(copilotAgent);
			const unknownSession = URI.from({ scheme: 'unknown', path: '/nope' });

			// Should not throw
			await service.disposeSession(unknownSession);
		});
	});

	// ---- setAuthToken ---------------------------------------------------

	suite('setAuthToken', () => {

		test('broadcasts token to all registered providers', async () => {
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			await service.setAuthToken('my-token');

			assert.strictEqual(copilotAgent.setAuthTokenCalls.length, 1);
			assert.strictEqual(copilotAgent.setAuthTokenCalls[0], 'my-token');
			assert.strictEqual(claudeAgent.setAuthTokenCalls.length, 1);
		});
	});

	// ---- listSessions / listModels --------------------------------------

	suite('aggregation', () => {

		test('listSessions aggregates sessions from all providers', async () => {
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			await service.createSession({ provider: 'copilot' });
			await service.createSession({ provider: 'claude' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 2);
		});

		test('listModels aggregates models from all providers', async () => {
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			const models = await service.listModels();
			assert.strictEqual(models.length, 2);
			assert.ok(models.some(m => m.provider === 'copilot'));
			assert.ok(models.some(m => m.provider === 'claude'));
		});
	});

	// ---- shutdown -------------------------------------------------------

	suite('shutdown', () => {

		test('shuts down all providers', async () => {
			let copilotShutdown = false;
			let claudeShutdown = false;
			copilotAgent.shutdown = async () => { copilotShutdown = true; };
			claudeAgent.shutdown = async () => { claudeShutdown = true; };

			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			await service.shutdown();
			assert.ok(copilotShutdown);
			assert.ok(claudeShutdown);
		});
	});
});
