/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { AgentSession } from '../../common/agentService.js';
import { IActionEnvelope } from '../../common/state/sessionActions.js';
import { AgentService } from '../../node/agentService.js';
import { MockAgent } from './mockAgent.js';

suite('AgentService (node dispatcher)', () => {

	const disposables = new DisposableStore();
	let service: AgentService;
	let copilotAgent: MockAgent;

	setup(() => {
		service = disposables.add(new AgentService(new NullLogService(), disposables.add(new FileService(new NullLogService()))));
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
				{ type: 'session/turnStarted', session: session.toString(), turnId: 'turn-1', userMessage: { text: 'hello' } },
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
