/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasKey } from '../../../../base/common/types.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { ActionType, IActionEnvelope } from '../../common/state/sessionActions.js';
import { ResponsePartKind, SessionLifecycle, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri, type IMarkdownResponsePart, type IToolCallCompletedState, type IToolCallResponsePart } from '../../common/state/sessionState.js';
import { IProductService } from '../../../product/common/productService.js';
import { AgentService } from '../../node/agentService.js';
import { MockAgent } from './mockAgent.js';
import { mapSessionEvents, type ISessionEvent } from '../../node/copilot/mapSessionEvents.js';

/**
 * Loads a JSONL fixture of raw Copilot SDK events, runs them through
 * {@link mapSessionEvents}, and returns the result suitable for setting
 * on {@link MockAgent.sessionMessages}. This tests the full pipeline:
 * SDK events → mapSessionEvents → _buildTurnsFromMessages → ITurn[].
 *
 * Fixture files live in `test-cases/` and are sanitized copies of real
 * `events.jsonl` files from `~/.copilot/session-state/`.
 */
async function loadFixtureMessages(fixtureName: string, session: URI) {
	// Resolve the fixture from the source tree (test-cases/ is not compiled to out/)
	const thisFile = fileURLToPath(import.meta.url);
	// Navigate from out/vs/... to src/vs/... by replacing the out/ prefix.
	// Use a regex that handles both / and \ separators for Windows compat.
	const srcFile = thisFile.replace(/[/\\]out[/\\]/, (m) => m.replace('out', 'src'));
	const lastSep = Math.max(srcFile.lastIndexOf('/'), srcFile.lastIndexOf('\\'));
	const fixtureDir = srcFile.substring(0, lastSep);
	const sep = srcFile.includes('\\') ? '\\' : '/';
	const raw = readFileSync(`${fixtureDir}${sep}test-cases${sep}${fixtureName}`, 'utf-8');
	const events: ISessionEvent[] = raw.trim().split('\n').map(line => JSON.parse(line));
	return mapSessionEvents(session, undefined, events);
}

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
			tryOpenDatabase: async () => undefined,
			deleteSessionData: async () => { },
			cleanupOrphanedData: async () => { },
		};
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		// Seed a directory for browseDirectory tests
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/testDir' }));
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));

		service = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService));
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

		test('listSessions overlays custom title from session database', async () => {
			// Pre-seed a custom title in an in-memory database
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.setMetadata('customTitle', 'My Custom Title');

			const sessionId = 'test-session-abc';
			const sessionUri = AgentSession.uri('copilot', sessionId);

			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({
					object: db,
					dispose: () => { },
				}),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({
					object: db,
					dispose: () => { },
				}),
				deleteSessionData: async () => { },
				cleanupOrphanedData: async () => { },
			};

			// Create a mock that returns a session with that ID
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = { summary: 'SDK Title' };
			// Manually add the session to the mock
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'My Custom Title');
		});

		test('listSessions uses SDK title when no custom title exists', async () => {
			service.registerProvider(copilotAgent);
			copilotAgent.sessionMetadataOverrides = { summary: 'Auto-generated Title' };

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'Auto-generated Title');
		});

		test('createSession stores live session config', async () => {
			service.registerProvider(copilotAgent);

			const config = { isolation: 'worktree', branch: 'feature/config' };
			const session = await service.createSession({ provider: 'copilot', config });

			assert.deepStrictEqual(service.stateManager.getSessionState(session.toString())?.config?.values, config);
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
			const { session } = await copilotAgent.createSession();
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
			const { session } = await copilotAgent.createSession();
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
			const { session } = await copilotAgent.createSession();
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

		test('restores a session with subagent tool calls', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review this code', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent' as const, toolArguments: JSON.stringify({ description: 'Find related files', agentName: 'explore' }) },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				// Inner tool calls from the subagent (have parentToolCallId)
				{ type: 'tool_start', session, toolCallId: 'tc-inner-1', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner-1', result: { success: true, pastTenseMessage: 'Ran ls', content: [{ type: ToolResultContentType.Text, text: 'file1.ts' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner-2', toolName: 'view', displayName: 'View File', invocationMessage: 'Reading file1.ts', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner-2', result: { success: true, pastTenseMessage: 'Read file1.ts' }, parentToolCallId: 'tc-sub' },
				// Parent tool completes
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [{ type: ToolResultContentType.Text, text: 'Found 3 issues' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'The review found 3 issues.', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);

			// Should produce exactly one turn
			assert.strictEqual(state!.turns.length, 1, `Expected 1 turn but got ${state!.turns.length}`);

			const turn = state!.turns[0];
			assert.strictEqual(turn.userMessage.text, 'Review this code');

			// The parent turn should only have the parent tool call — inner
			// tool calls are excluded from the parent and belong to the
			// child subagent session instead.
			const toolCallParts = turn.responseParts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(toolCallParts.length, 1, `Expected 1 tool call (parent only) but got ${toolCallParts.length}`);

			// Parent subagent tool call
			const parentTc = toolCallParts[0].toolCall as IToolCallCompletedState;
			assert.strictEqual(parentTc.toolCallId, 'tc-sub');
			assert.strictEqual(parentTc.status, ToolCallStatus.Completed);
			assert.strictEqual(parentTc._meta?.toolKind, 'subagent');
			assert.strictEqual(parentTc._meta?.subagentDescription, 'Find related files');
			assert.strictEqual(parentTc._meta?.subagentAgentName, 'explore');

			// Parent tool should have subagent content entry
			const content = parentTc.content ?? [];
			const subagentEntry = content.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
			assert.ok(subagentEntry, 'Completed tool call should have subagent content entry');

			// Subscribing to the child session should restore it with inner tool calls
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), 'tc-sub');
			const snapshot = await service.subscribe(URI.parse(childSessionUri));
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(snapshot?.state, 'Child session snapshot should exist');
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(childToolParts.length, 2, `Child session should have 2 inner tool calls but got ${childToolParts.length}`);
			assert.ok(childToolParts.some(p => p.toolCall.toolCallId === 'tc-inner-1'), 'Should have tc-inner-1');
			assert.ok(childToolParts.some(p => p.toolCall.toolCallId === 'tc-inner-2'), 'Should have tc-inner-2');

			// The turn should also have the final markdown
			const mdParts = turn.responseParts.filter((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdParts.some(p => p.content.includes('3 issues')), 'Should have the final markdown response');
		});

		test('inner assistant messages from subagent do not create extra turns (fixture)', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Load real SDK events from fixture (sanitized from ~/.copilot/session-state/)
			copilotAgent.sessionMessages = await loadFixtureMessages('subagent-session.jsonl', session);

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 1, `Expected 1 turn but got ${state!.turns.length}: ${state!.turns.map(t => `"${t.userMessage.text.substring(0, 40)}"`).join(', ')}`);
			assert.strictEqual(state!.turns[0].userMessage.text, 'Run a sync subagent to do some searches, just testing subagent rendering');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);

			// Should have the parent subagent tool call with subagent content
			const toolCallParts = state!.turns[0].responseParts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			const parentTc = toolCallParts.find(p => p.toolCall.toolName === 'task');
			assert.ok(parentTc, 'Should have a task tool call');
			assert.strictEqual(parentTc!.toolCall._meta?.toolKind, 'subagent');

			// Inner tool calls should NOT be in the parent turn — they belong
			// to the child subagent session.
			const parentToolCallId = parentTc!.toolCall.toolCallId;
			const nonParentTools = toolCallParts.filter(p => p.toolCall.toolCallId !== parentToolCallId);
			assert.strictEqual(nonParentTools.length, 0, `Parent turn should only contain the task tool call, but found ${nonParentTools.length} extra tool calls`);

			// Subscribe to the child subagent session and verify inner tools
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), parentToolCallId);
			const snapshot = await service.subscribe(URI.parse(childSessionUri));
			assert.ok(snapshot?.state, 'Child session snapshot should exist');
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.ok(childToolParts.length > 0, `Child session should have inner tool calls but got ${childToolParts.length}`);

			// Should have the final markdown
			const mdParts = state!.turns[0].responseParts.filter((p): p is IMarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdParts.length > 0, 'Should have markdown content');
		});
	});

	// ---- resourceList ------------------------------------------------

	suite('resourceList', () => {

		test('throws when the directory does not exist', async () => {
			await assert.rejects(
				() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/nonexistent' })),
				/Directory not found/,
			);
		});

		test('throws when the target is not a directory', async () => {
			await assert.rejects(
				() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' })),
				/Not a directory/,
			);
		});
	});

	// ---- worktree working directory -------------------------------------

	suite('worktree working directory', () => {

		test('createSession uses agent-resolved working directory in state', async () => {
			// Simulate an agent that resolves a worktree path different from the input
			const worktreeDir = URI.file('/source/repo.worktrees/agents-xyz');
			copilotAgent.resolvedWorkingDirectory = worktreeDir;
			service.registerProvider(copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectory: sourceDir });

			// The state manager should have the worktree path, not the source path
			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.summary.workingDirectory, worktreeDir.toString());
		});

		test('createSession falls back to config working directory when agent does not resolve', async () => {
			// Agent does not override the working directory (e.g. folder isolation)
			copilotAgent.resolvedWorkingDirectory = undefined;
			service.registerProvider(copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectory: sourceDir });

			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.summary.workingDirectory, sourceDir.toString());
		});

		test('restoreSession uses agent working directory in state', async () => {
			// Agent returns the worktree path through listSessions
			const worktreeDir = URI.file('/source/repo.worktrees/agents-xyz');
			copilotAgent.sessionMetadataOverrides = { workingDirectory: worktreeDir };
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Delete from state to simulate a server restart
			service.stateManager.deleteSession(session.toString());
			assert.strictEqual(service.stateManager.getSessionState(session.toString()), undefined);

			// Restore the session (simulates a client subscribing after restart)
			await service.restoreSession(session);

			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.summary.workingDirectory, worktreeDir.toString());
		});
	});
});
