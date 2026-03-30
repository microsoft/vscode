/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, IActionEnvelope } from '../../common/state/sessionActions.js';
import { ResponsePartKind, SessionLifecycle, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type IMarkdownResponsePart, type IToolCallCompletedState, type IToolCallResponsePart } from '../../common/state/sessionState.js';
import { AgentService } from '../../node/agentService.js';
import { MockAgent } from './mockAgent.js';

suite('AgentService (node dispatcher)', () => {

	const disposables = new DisposableStore();
	let service: AgentService;
	let copilotAgent: MockAgent;
	let fileService: FileService;

	setup(async () => {
		const nullSessionDataService: ISessionDataService = {
			_serviceBrand: undefined,
			getSessionDataDir: () => URI.parse('inmemory:/session-data'),
			getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
			openDatabase: () => { throw new Error('not implemented'); },
			deleteSessionData: async () => { },
			cleanupOrphanedData: async () => { },
		};
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		// Seed a directory for browseDirectory tests
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/testDir' }));
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));

		service = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService));
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
				{ type: ActionType.SessionTurnStarted, session: session.toString(), turnId: 'turn-1', userMessage: { text: 'hello' } },
				'test-client', 1,
			);

			const envelopes: IActionEnvelope[] = [];
			disposables.add(service.onDidAction(e => envelopes.push(e)));

			copilotAgent.fireProgress({ session, type: 'delta', messageId: 'msg-1', content: 'hello' });
			assert.ok(envelopes.some(e => e.action.type === ActionType.SessionResponsePart));
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

			const agentsChanged = envelopes.find(e => e.action.type === ActionType.RootAgentsChanged);
			assert.ok(agentsChanged);
		});
	});

	// ---- getResourceMetadata --------------------------------------------

	suite('getResourceMetadata', () => {

		test('aggregates protected resources from all providers', async () => {
			service.registerProvider(copilotAgent);

			const mockAgent = new MockAgent('other');
			disposables.add(toDisposable(() => mockAgent.dispose()));
			service.registerProvider(mockAgent);

			const metadata = await service.getResourceMetadata();
			// copilot agent returns one resource (https://api.github.com),
			// generic MockAgent('other') returns empty
			assert.deepStrictEqual(metadata, {
				resources: [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'] }],
			});
		});

		test('returns empty resources when no providers registered', async () => {
			const metadata = await service.getResourceMetadata();
			assert.deepStrictEqual(metadata, { resources: [] });
		});
	});

	// ---- authenticate ---------------------------------------------------

	suite('authenticate', () => {

		test('routes token to provider matching the resource', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'ghp_test123' });

			assert.deepStrictEqual(result, { authenticated: true });
			assert.deepStrictEqual(copilotAgent.authenticateCalls, [{ resource: 'https://api.github.com', token: 'ghp_test123' }]);
		});

		test('returns not authenticated for unknown resource', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: 'https://unknown.example.com', token: 'tok' });

			assert.deepStrictEqual(result, { authenticated: false });
			assert.strictEqual(copilotAgent.authenticateCalls.length, 0);
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

	// ---- restoreSession -------------------------------------------------

	suite('restoreSession', () => {

		test('restores a session with message history', async () => {
			service.registerProvider(copilotAgent);
			const session = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi there!', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state, 'session should be in state manager');
			assert.strictEqual(state!.lifecycle, SessionLifecycle.Ready);
			assert.strictEqual(state!.turns.length, 1);
			assert.strictEqual(state!.turns[0].userMessage.text, 'Hello');
			const mdPart = state!.turns[0].responseParts.find((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdPart);
			assert.strictEqual(mdPart.content, 'Hi there!');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);
		});

		test('restores a session with tool calls', async () => {
			service.registerProvider(copilotAgent);
			const session = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Run a command', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'I will run a command.', toolRequests: [{ toolCallId: 'tc-1', name: 'shell' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'shell', displayName: 'Shell', invocationMessage: 'Running command...' },
				{ type: 'tool_complete', session, toolCallId: 'tc-1', result: { success: true, pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: 'output' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done!', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			const turn = state!.turns[0];
			const toolCallParts = turn.responseParts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(toolCallParts.length, 1);
			const tc = toolCallParts[0].toolCall as IToolCallCompletedState;
			assert.strictEqual(tc.status, ToolCallStatus.Completed);
			assert.strictEqual(tc.toolCallId, 'tc-1');
			assert.strictEqual(tc.confirmed, ToolCallConfirmationReason.NotNeeded);
		});

		test('flushes interrupted turns', async () => {
			service.registerProvider(copilotAgent);
			const session = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Interrupted', toolRequests: [] },
				{ type: 'message', session, role: 'user', messageId: 'msg-2', content: 'Retried', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Answer', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 2);
			assert.strictEqual(state!.turns[0].state, TurnState.Cancelled);
			assert.strictEqual(state!.turns[1].state, TurnState.Complete);
		});

		test('throws when session is not found on backend', async () => {
			service.registerProvider(copilotAgent);
			await assert.rejects(
				() => service.restoreSession(AgentSession.uri('copilot', 'nonexistent')),
				/Session not found on backend/,
			);
		});
	});

	// ---- browseDirectory ------------------------------------------------

	suite('browseDirectory', () => {

		test('throws when the directory does not exist', async () => {
			await assert.rejects(
				() => service.browseDirectory(URI.from({ scheme: Schemas.inMemory, path: '/nonexistent' })),
				/Directory not found/,
			);
		});

		test('throws when the target is not a directory', async () => {
			await assert.rejects(
				() => service.browseDirectory(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' })),
				/Not a directory/,
			);
		});
	});
});
