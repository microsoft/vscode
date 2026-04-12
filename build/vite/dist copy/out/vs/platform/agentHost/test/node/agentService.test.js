/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { AgentSession } from '../../common/agentService.js';
import { SessionDataService } from '../../node/sessionDataService.js';
import { AgentService } from '../../node/agentService.js';
import { MockAgent } from './mockAgent.js';
suite('AgentService (node dispatcher)', () => {
    const disposables = new DisposableStore();
    let service;
    let copilotAgent;
    let fileService;
    setup(async () => {
        const nullSessionDataService = {
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
            service.dispatchAction({ type: "session/turnStarted" /* ActionType.SessionTurnStarted */, session: session.toString(), turnId: 'turn-1', userMessage: { text: 'hello' } }, 'test-client', 1);
            const envelopes = [];
            disposables.add(service.onDidAction(e => envelopes.push(e)));
            copilotAgent.fireProgress({ session, type: 'delta', messageId: 'msg-1', content: 'hello' });
            assert.ok(envelopes.some(e => e.action.type === "session/responsePart" /* ActionType.SessionResponsePart */));
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
        test('listSessions overlays custom title from session database', async () => {
            // Use a real SessionDataService with disk-backed SQLite to verify
            // that listSessions reads custom titles from the database.
            const testDir = join(tmpdir(), `vscode-agent-svc-test-${randomUUID()}`);
            mkdirSync(testDir, { recursive: true });
            const diskFileService = disposables.add(new FileService(new NullLogService()));
            disposables.add(diskFileService.registerProvider('file', disposables.add(new DiskFileSystemProvider(new NullLogService()))));
            const sessionDataService = new SessionDataService(URI.file(testDir), diskFileService, new NullLogService());
            // Pre-seed a custom title in the database for a known session ID
            const sessionId = 'test-session-abc';
            const sessionUri = AgentSession.uri('copilot', sessionId);
            const ref = sessionDataService.openDatabase(sessionUri);
            await ref.object.setMetadata('customTitle', 'My Custom Title');
            ref.dispose();
            // Create a mock that returns a session with that ID
            const agent = new MockAgent('copilot');
            disposables.add(toDisposable(() => agent.dispose()));
            agent.sessionMetadataOverrides = { summary: 'SDK Title' };
            // Manually add the session to the mock
            agent._sessions.set(sessionId, sessionUri);
            const svc = disposables.add(new AgentService(new NullLogService(), diskFileService, sessionDataService));
            svc.registerProvider(agent);
            const sessions = await svc.listSessions();
            assert.strictEqual(sessions.length, 1);
            assert.strictEqual(sessions[0].summary, 'My Custom Title');
            rmSync(testDir, { recursive: true, force: true });
        });
        test('listSessions uses SDK title when no custom title exists', async () => {
            service.registerProvider(copilotAgent);
            copilotAgent.sessionMetadataOverrides = { summary: 'Auto-generated Title' };
            await service.createSession({ provider: 'copilot' });
            const sessions = await service.listSessions();
            assert.strictEqual(sessions.length, 1);
            assert.strictEqual(sessions[0].summary, 'Auto-generated Title');
        });
        test('refreshModels publishes models in root state via agentsChanged', async () => {
            service.registerProvider(copilotAgent);
            const envelopes = [];
            disposables.add(service.onDidAction(e => envelopes.push(e)));
            service.refreshModels();
            // Model fetch is async inside AgentSideEffects — wait for it
            await new Promise(r => setTimeout(r, 50));
            const agentsChanged = envelopes.find(e => e.action.type === "root/agentsChanged" /* ActionType.RootAgentsChanged */);
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
            assert.strictEqual(state.lifecycle, "ready" /* SessionLifecycle.Ready */);
            assert.strictEqual(state.turns.length, 1);
            assert.strictEqual(state.turns[0].userMessage.text, 'Hello');
            const mdPart = state.turns[0].responseParts.find((p) => p.kind === "markdown" /* ResponsePartKind.Markdown */);
            assert.ok(mdPart);
            assert.strictEqual(mdPart.content, 'Hi there!');
            assert.strictEqual(state.turns[0].state, "complete" /* TurnState.Complete */);
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
                { type: 'tool_complete', session, toolCallId: 'tc-1', result: { success: true, pastTenseMessage: 'Ran command', content: [{ type: "text" /* ToolResultContentType.Text */, text: 'output' }] } },
                { type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done!', toolRequests: [] },
            ];
            await service.restoreSession(sessionResource);
            const state = service.stateManager.getSessionState(sessionResource.toString());
            assert.ok(state);
            const turn = state.turns[0];
            const toolCallParts = turn.responseParts.filter((p) => p.kind === "toolCall" /* ResponsePartKind.ToolCall */);
            assert.strictEqual(toolCallParts.length, 1);
            const tc = toolCallParts[0].toolCall;
            assert.strictEqual(tc.status, "completed" /* ToolCallStatus.Completed */);
            assert.strictEqual(tc.toolCallId, 'tc-1');
            assert.strictEqual(tc.confirmed, "not-needed" /* ToolCallConfirmationReason.NotNeeded */);
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
            assert.strictEqual(state.turns.length, 2);
            assert.strictEqual(state.turns[0].state, "cancelled" /* TurnState.Cancelled */);
            assert.strictEqual(state.turns[1].state, "complete" /* TurnState.Complete */);
        });
        test('throws when session is not found on backend', async () => {
            service.registerProvider(copilotAgent);
            await assert.rejects(() => service.restoreSession(AgentSession.uri('copilot', 'nonexistent')), /Session not found on backend/);
        });
    });
    // ---- resourceList ------------------------------------------------
    suite('resourceList', () => {
        test('throws when the directory does not exist', async () => {
            await assert.rejects(() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/nonexistent' })), /Directory not found/);
        });
        test('throws when the target is not a directory', async () => {
            await assert.rejects(() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' })), /Not a directory/);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9ub2RlL2FnZW50U2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDcEMsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDdkMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFNUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7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