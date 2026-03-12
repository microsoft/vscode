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
import { IActionEnvelope } from '../../common/state/sessionActions.js';
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

	respondToPermissionRequest(_requestId: string, _approved: boolean): void { }

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

	setup(() => {
		service = disposables.add(new AgentService(new NullLogService()));
		copilotAgent = new MockAgent('copilot');
		disposables.add(toDisposable(() => copilotAgent.dispose()));
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

		test('maps progress events to protocol actions via onDidAction', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });

			// Start a turn so there's an active turn to map events to
			service.dispatchAction(
				{ type: 'session/turnStarted', session, turnId: 'turn-1', userMessage: { text: 'hello' } },
				'test-client', 1,
			);

			const envelopes: IActionEnvelope[] = [];
			disposables.add(service.onDidAction(e => envelopes.push(e)));

			copilotAgent.fireProgress({ session, type: 'delta', messageId: 'msg-1', content: 'hello' });
			assert.ok(envelopes.some(e => e.action.type === 'session/delta'));
		});
	});

	// ---- listAgents -----------------------------------------------------

	suite('listAgents', () => {

		test('returns descriptors from all registered providers', async () => {
			service.registerProvider(copilotAgent);

			const agents = await service.listAgents();
			assert.strictEqual(agents.length, 1);
			assert.ok(agents.some(a => a.provider === 'copilot'));
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

			const session = await service.createSession({ provider: 'copilot' });
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('uses default provider when none specified', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession();
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('throws when no providers are registered at all', async () => {
			await assert.rejects(() => service.createSession(), /No agent provider/);
		});
	});

	// ---- disposeSession -------------------------------------------------

	suite('disposeSession', () => {

		test('dispatches to the correct provider and cleans up tracking', async () => {
			service.registerProvider(copilotAgent);

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

			await service.setAuthToken('my-token');

			assert.strictEqual(copilotAgent.setAuthTokenCalls.length, 1);
			assert.strictEqual(copilotAgent.setAuthTokenCalls[0], 'my-token');
		});
	});

	// ---- listSessions / listModels --------------------------------------

	suite('aggregation', () => {

		test('listSessions aggregates sessions from all providers', async () => {
			service.registerProvider(copilotAgent);

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
		});

		test('refreshModels publishes models in root state via agentsChanged', async () => {
			service.registerProvider(copilotAgent);

			const envelopes: IActionEnvelope[] = [];
			disposables.add(service.onDidAction(e => envelopes.push(e)));

			service.refreshModels();

			// Model fetch is async inside AgentSideEffects — wait for it
			await new Promise(r => setTimeout(r, 50));

			const agentsChanged = envelopes.find(e => e.action.type === 'root/agentsChanged');
			assert.ok(agentsChanged);
		});
	});

	// ---- shutdown -------------------------------------------------------

	suite('shutdown', () => {

		test('shuts down all providers', async () => {
			let copilotShutdown = false;
			copilotAgent.shutdown = async () => { copilotShutdown = true; };

			service.registerProvider(copilotAgent);

			await service.shutdown();
			assert.ok(copilotShutdown);
		});
	});
});
