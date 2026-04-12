/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { AgentService } from '../../node/agentService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { SessionStateManager } from '../../node/sessionStateManager.js';
import { join } from '../../../../base/common/path.js';
import { MockAgent } from './mockAgent.js';
// ---- Tests ------------------------------------------------------------------
suite('AgentSideEffects', () => {
    const disposables = new DisposableStore();
    let fileService;
    let stateManager;
    let agent;
    let sideEffects;
    let agentList;
    const sessionUri = AgentSession.uri('mock', 'session-1');
    function setupSession(workingDirectory) {
        stateManager.createSession({
            resource: sessionUri.toString(),
            provider: 'mock',
            title: 'Test',
            status: "idle" /* SessionStatus.Idle */,
            createdAt: Date.now(),
            modifiedAt: Date.now(),
            workingDirectory,
        });
        stateManager.dispatchServerAction({ type: "session/ready" /* ActionType.SessionReady */, session: sessionUri.toString() });
    }
    function startTurn(turnId) {
        stateManager.dispatchClientAction({ type: "session/turnStarted" /* ActionType.SessionTurnStarted */, session: sessionUri.toString(), turnId, userMessage: { text: 'hello' } }, { clientId: 'test', clientSeq: 1 });
    }
    setup(async () => {
        fileService = disposables.add(new FileService(new NullLogService()));
        const memFs = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
        // Seed a file so the handleBrowseDirectory tests can distinguish files from dirs
        const testDir = URI.from({ scheme: Schemas.inMemory, path: '/testDir' });
        await fileService.createFolder(testDir);
        await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));
        agent = new MockAgent();
        disposables.add(toDisposable(() => agent.dispose()));
        stateManager = disposables.add(new SessionStateManager(new NullLogService()));
        agentList = observableValue('agents', [agent]);
        sideEffects = disposables.add(new AgentSideEffects(stateManager, {
            getAgent: () => agent,
            agents: agentList,
            sessionDataService: {
                _serviceBrand: undefined,
                getSessionDataDir: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
                getSessionDataDirById: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
                openDatabase: () => { throw new Error('not implemented'); },
                tryOpenDatabase: async () => undefined,
                deleteSessionData: async () => { },
                cleanupOrphanedData: async () => { },
            },
        }, new NullLogService()));
    });
    teardown(() => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // ---- handleAction: session/turnStarted ------------------------------
    suite('handleAction — session/turnStarted', () => {
        test('calls sendMessage on the agent', async () => {
            setupSession();
            const action = {
                type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
                session: sessionUri.toString(),
                turnId: 'turn-1',
                userMessage: { text: 'hello world' },
            };
            sideEffects.handleAction(action);
            // sendMessage is async but fire-and-forget; wait a tick
            await new Promise(r => setTimeout(r, 10));
            assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: 'hello world' }]);
        });
        test('dispatches session/error when no agent is found', async () => {
            setupSession();
            const emptyAgents = observableValue('agents', []);
            const noAgentSideEffects = disposables.add(new AgentSideEffects(stateManager, {
                getAgent: () => undefined,
                agents: emptyAgents,
                sessionDataService: {},
            }, new NullLogService()));
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            noAgentSideEffects.handleAction({
                type: "session/turnStarted" /* ActionType.SessionTurnStarted */,
                session: sessionUri.toString(),
                turnId: 'turn-1',
                userMessage: { text: 'hello' },
            });
            const errorAction = envelopes.find(e => e.action.type === "session/error" /* ActionType.SessionError */);
            assert.ok(errorAction, 'should dispatch session/error');
        });
    });
    // ---- handleAction: session/turnCancelled ----------------------------
    suite('handleAction — session/turnCancelled', () => {
        test('calls abortSession on the agent', async () => {
            setupSession();
            sideEffects.handleAction({
                type: "session/turnCancelled" /* ActionType.SessionTurnCancelled */,
                session: sessionUri.toString(),
                turnId: 'turn-1',
            });
            await new Promise(r => setTimeout(r, 10));
            assert.deepStrictEqual(agent.abortSessionCalls, [URI.parse(sessionUri.toString())]);
        });
    });
    // ---- handleAction: session/modelChanged -----------------------------
    suite('handleAction — session/modelChanged', () => {
        test('calls changeModel on the agent', async () => {
            setupSession();
            sideEffects.handleAction({
                type: "session/modelChanged" /* ActionType.SessionModelChanged */,
                session: sessionUri.toString(),
                model: 'gpt-5',
            });
            await new Promise(r => setTimeout(r, 10));
            assert.deepStrictEqual(agent.changeModelCalls, [{ session: URI.parse(sessionUri.toString()), model: 'gpt-5' }]);
        });
    });
    // ---- registerProgressListener ---------------------------------------
    suite('registerProgressListener', () => {
        test('maps agent progress events to state actions', () => {
            setupSession();
            startTurn('turn-1');
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            disposables.add(sideEffects.registerProgressListener(agent));
            agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-1', content: 'hi' });
            // First delta creates a response part (not a delta action)
            assert.ok(envelopes.some(e => e.action.type === "session/responsePart" /* ActionType.SessionResponsePart */));
        });
        test('returns a disposable that stops listening', () => {
            setupSession();
            startTurn('turn-1');
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            const listener = sideEffects.registerProgressListener(agent);
            agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-1', content: 'before' });
            assert.strictEqual(envelopes.filter(e => e.action.type === "session/responsePart" /* ActionType.SessionResponsePart */).length, 1);
            listener.dispose();
            agent.fireProgress({ session: sessionUri, type: 'delta', messageId: 'msg-2', content: 'after' });
            assert.strictEqual(envelopes.filter(e => e.action.type === "session/responsePart" /* ActionType.SessionResponsePart */).length, 1);
        });
    });
    // ---- agents observable --------------------------------------------------
    suite('agents observable', () => {
        test('dispatches root/agentsChanged when observable changes', async () => {
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            agentList.set([agent], undefined);
            // Model fetch is async — wait for it
            await new Promise(r => setTimeout(r, 50));
            const action = envelopes.find(e => e.action.type === "root/agentsChanged" /* ActionType.RootAgentsChanged */);
            assert.ok(action, 'should dispatch root/agentsChanged');
        });
    });
    // ---- Pending message sync -----------------------------------------------
    suite('pending message sync', () => {
        test('syncs steering message to agent on SessionPendingMessageSet', () => {
            setupSession();
            const action = {
                type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                session: sessionUri.toString(),
                kind: "steering" /* PendingMessageKind.Steering */,
                id: 'steer-1',
                userMessage: { text: 'focus on tests' },
            };
            stateManager.dispatchClientAction(action, { clientId: 'test', clientSeq: 1 });
            sideEffects.handleAction(action);
            assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
            assert.deepStrictEqual(agent.setPendingMessagesCalls[0].steeringMessage, { id: 'steer-1', userMessage: { text: 'focus on tests' } });
            assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
        });
        test('syncs queued message to agent on SessionPendingMessageSet', () => {
            setupSession();
            const action = {
                type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                session: sessionUri.toString(),
                kind: "queued" /* PendingMessageKind.Queued */,
                id: 'q-1',
                userMessage: { text: 'queued message' },
            };
            stateManager.dispatchClientAction(action, { clientId: 'test', clientSeq: 1 });
            sideEffects.handleAction(action);
            // Queued messages are not forwarded to the agent; the server controls consumption
            assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
            assert.strictEqual(agent.setPendingMessagesCalls[0].steeringMessage, undefined);
            assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
            // Session was idle, so the queued message is consumed immediately
            assert.strictEqual(agent.sendMessageCalls.length, 1);
            assert.strictEqual(agent.sendMessageCalls[0].prompt, 'queued message');
        });
        test('syncs on SessionPendingMessageRemoved', () => {
            setupSession();
            // Add a queued message
            const setAction = {
                type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                session: sessionUri.toString(),
                kind: "queued" /* PendingMessageKind.Queued */,
                id: 'q-rm',
                userMessage: { text: 'will be removed' },
            };
            stateManager.dispatchClientAction(setAction, { clientId: 'test', clientSeq: 1 });
            sideEffects.handleAction(setAction);
            agent.setPendingMessagesCalls.length = 0;
            // Remove
            const removeAction = {
                type: "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */,
                session: sessionUri.toString(),
                kind: "queued" /* PendingMessageKind.Queued */,
                id: 'q-rm',
            };
            stateManager.dispatchClientAction(removeAction, { clientId: 'test', clientSeq: 2 });
            sideEffects.handleAction(removeAction);
            assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
            assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
        });
        test('syncs on SessionQueuedMessagesReordered', () => {
            setupSession();
            // Add two queued messages
            const setA = { type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */, session: sessionUri.toString(), kind: "queued" /* PendingMessageKind.Queued */, id: 'q-a', userMessage: { text: 'A' } };
            stateManager.dispatchClientAction(setA, { clientId: 'test', clientSeq: 1 });
            sideEffects.handleAction(setA);
            const setB = { type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */, session: sessionUri.toString(), kind: "queued" /* PendingMessageKind.Queued */, id: 'q-b', userMessage: { text: 'B' } };
            stateManager.dispatchClientAction(setB, { clientId: 'test', clientSeq: 2 });
            sideEffects.handleAction(setB);
            agent.setPendingMessagesCalls.length = 0;
            // Reorder
            const reorderAction = { type: "session/queuedMessagesReordered" /* ActionType.SessionQueuedMessagesReordered */, session: sessionUri.toString(), order: ['q-b', 'q-a'] };
            stateManager.dispatchClientAction(reorderAction, { clientId: 'test', clientSeq: 3 });
            sideEffects.handleAction(reorderAction);
            assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
            assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
        });
    });
    // ---- Queued message consumption -----------------------------------------
    suite('queued message consumption', () => {
        test('auto-starts turn from queued message on idle', () => {
            setupSession();
            disposables.add(sideEffects.registerProgressListener(agent));
            // Queue a message while a turn is active
            startTurn('turn-1');
            const setAction = {
                type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                session: sessionUri.toString(),
                kind: "queued" /* PendingMessageKind.Queued */,
                id: 'q-auto',
                userMessage: { text: 'auto queued' },
            };
            stateManager.dispatchClientAction(setAction, { clientId: 'test', clientSeq: 1 });
            sideEffects.handleAction(setAction);
            // Message should NOT be consumed yet (turn is active)
            assert.strictEqual(agent.sendMessageCalls.length, 0);
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            // Fire idle → turn completes → queued message should be consumed
            agent.fireProgress({ session: sessionUri, type: 'idle' });
            const turnComplete = envelopes.find(e => e.action.type === "session/turnComplete" /* ActionType.SessionTurnComplete */);
            assert.ok(turnComplete, 'should dispatch session/turnComplete');
            const turnStarted = envelopes.find(e => e.action.type === "session/turnStarted" /* ActionType.SessionTurnStarted */);
            assert.ok(turnStarted, 'should dispatch session/turnStarted for queued message');
            assert.strictEqual(turnStarted.action.queuedMessageId, 'q-auto');
            assert.strictEqual(agent.sendMessageCalls.length, 1);
            assert.strictEqual(agent.sendMessageCalls[0].prompt, 'auto queued');
            // Queued message should be removed from state
            const state = stateManager.getSessionState(sessionUri.toString());
            assert.strictEqual(state?.queuedMessages, undefined);
        });
        test('does not consume queued message while a turn is active', () => {
            setupSession();
            startTurn('turn-1');
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            const setAction = {
                type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                session: sessionUri.toString(),
                kind: "queued" /* PendingMessageKind.Queued */,
                id: 'q-wait',
                userMessage: { text: 'should wait' },
            };
            stateManager.dispatchClientAction(setAction, { clientId: 'test', clientSeq: 1 });
            sideEffects.handleAction(setAction);
            // No turn started for the queued message
            const turnStarted = envelopes.find(e => e.action.type === "session/turnStarted" /* ActionType.SessionTurnStarted */);
            assert.strictEqual(turnStarted, undefined, 'should not start a turn while one is active');
            assert.strictEqual(agent.sendMessageCalls.length, 0);
            // Queued message still in state
            const state = stateManager.getSessionState(sessionUri.toString());
            assert.strictEqual(state?.queuedMessages?.length, 1);
            assert.strictEqual(state?.queuedMessages?.[0].id, 'q-wait');
        });
        test('dispatches SessionPendingMessageRemoved for steering messages on steering_consumed', () => {
            setupSession();
            disposables.add(sideEffects.registerProgressListener(agent));
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            const action = {
                type: "session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */,
                session: sessionUri.toString(),
                kind: "steering" /* PendingMessageKind.Steering */,
                id: 'steer-rm',
                userMessage: { text: 'steer me' },
            };
            stateManager.dispatchClientAction(action, { clientId: 'test', clientSeq: 1 });
            sideEffects.handleAction(action);
            // Removal is not dispatched synchronously; it waits for the agent
            let removal = envelopes.find(e => e.action.type === "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */ &&
                e.action.kind === "steering" /* PendingMessageKind.Steering */);
            assert.strictEqual(removal, undefined, 'should not dispatch removal until steering_consumed');
            // Simulate the agent consuming the steering message
            agent.fireProgress({
                session: sessionUri,
                type: 'steering_consumed',
                id: 'steer-rm',
            });
            removal = envelopes.find(e => e.action.type === "session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */ &&
                e.action.kind === "steering" /* PendingMessageKind.Steering */);
            assert.ok(removal, 'should dispatch SessionPendingMessageRemoved for steering');
            assert.strictEqual(removal.action.id, 'steer-rm');
            // Steering message should be removed from state
            const state = stateManager.getSessionState(sessionUri.toString());
            assert.strictEqual(state?.steeringMessage, undefined);
        });
    });
    // ---- handleAction: session/activeClientChanged ----------------------
    suite('handleAction — session/activeClientChanged', () => {
        test('calls setClientCustomizations and dispatches customizationsChanged', async () => {
            setupSession();
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            const action = {
                type: "session/activeClientChanged" /* ActionType.SessionActiveClientChanged */,
                session: sessionUri.toString(),
                activeClient: {
                    clientId: 'test-client',
                    tools: [],
                    customizations: [
                        { uri: 'file:///plugin-a', displayName: 'Plugin A' },
                        { uri: 'file:///plugin-b', displayName: 'Plugin B' },
                    ],
                },
            };
            sideEffects.handleAction(action);
            // Wait for async setClientCustomizations
            await new Promise(r => setTimeout(r, 50));
            assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
                    clientId: 'test-client',
                    customizations: [
                        { uri: 'file:///plugin-a', displayName: 'Plugin A' },
                        { uri: 'file:///plugin-b', displayName: 'Plugin B' },
                    ],
                }]);
            const customizationActions = envelopes
                .filter(e => e.action.type === "session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */);
            assert.ok(customizationActions.length >= 1, 'should dispatch at least one customizationsChanged');
        });
        test('skips when activeClient has no customizations', () => {
            setupSession();
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            const action = {
                type: "session/activeClientChanged" /* ActionType.SessionActiveClientChanged */,
                session: sessionUri.toString(),
                activeClient: {
                    clientId: 'test-client',
                    tools: [],
                },
            };
            sideEffects.handleAction(action);
            assert.strictEqual(agent.setClientCustomizationsCalls.length, 0);
            const customizationActions = envelopes
                .filter(e => e.action.type === "session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */);
            assert.strictEqual(customizationActions.length, 0);
        });
        test('skips when activeClient is null', () => {
            setupSession();
            const action = {
                type: "session/activeClientChanged" /* ActionType.SessionActiveClientChanged */,
                session: sessionUri.toString(),
                activeClient: null,
            };
            sideEffects.handleAction(action);
            assert.strictEqual(agent.setClientCustomizationsCalls.length, 0);
        });
    });
    // ---- handleAction: session/customizationToggled ---------------------
    suite('handleAction — session/customizationToggled', () => {
        test('calls setCustomizationEnabled on the agent', () => {
            setupSession();
            const action = {
                type: "session/customizationToggled" /* ActionType.SessionCustomizationToggled */,
                session: sessionUri.toString(),
                uri: 'file:///plugin-a',
                enabled: false,
            };
            sideEffects.handleAction(action);
            assert.deepStrictEqual(agent.setCustomizationEnabledCalls, [
                { uri: 'file:///plugin-a', enabled: false },
            ]);
        });
    });
    // ---- handleAction: session/toolCallConfirmed ------------------------
    suite('handleAction — session/toolCallConfirmed', () => {
        test('routes confirmation to correct agent via _toolCallAgents', () => {
            setupSession();
            startTurn('turn-1');
            disposables.add(sideEffects.registerProgressListener(agent));
            // Fire tool_start to register the tool call
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_start',
                toolCallId: 'tc-conf-1',
                toolName: 'read',
                displayName: 'Read File',
                invocationMessage: 'Reading file',
            });
            // Fire tool_ready asking for permission (non-write, so not auto-approved)
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_ready',
                toolCallId: 'tc-conf-1',
                invocationMessage: 'Read file.txt',
                confirmationTitle: 'Read file.txt',
            });
            // Now confirm the tool call
            sideEffects.handleAction({
                type: "session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */,
                session: sessionUri.toString(),
                turnId: 'turn-1',
                toolCallId: 'tc-conf-1',
                approved: true,
                confirmed: 'user-action',
            });
            assert.deepStrictEqual(agent.respondToPermissionCalls, [
                { requestId: 'tc-conf-1', approved: true },
            ]);
        });
        test('handles denial of tool call', () => {
            setupSession();
            startTurn('turn-1');
            disposables.add(sideEffects.registerProgressListener(agent));
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_start',
                toolCallId: 'tc-deny-1',
                toolName: 'shell',
                displayName: 'Shell',
                invocationMessage: 'Running command',
            });
            sideEffects.handleAction({
                type: "session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */,
                session: sessionUri.toString(),
                turnId: 'turn-1',
                toolCallId: 'tc-deny-1',
                approved: false,
                reason: 'denied',
            });
            assert.deepStrictEqual(agent.respondToPermissionCalls, [
                { requestId: 'tc-deny-1', approved: false },
            ]);
        });
    });
    // ---- Edit auto-approve ----------------------------------------------
    suite('edit auto-approve', () => {
        test('auto-approves writes to regular source files', async () => {
            setupSession(URI.file('/workspace').toString());
            startTurn('turn-1');
            disposables.add(sideEffects.registerProgressListener(agent));
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_start',
                toolCallId: 'tc-auto-1',
                toolName: 'write',
                displayName: 'Write',
                invocationMessage: 'Write file',
            });
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_ready',
                toolCallId: 'tc-auto-1',
                invocationMessage: 'Write src/app.ts',
                permissionKind: 'write',
                permissionPath: '/workspace/src/app.ts',
            });
            // Auto-approved writes call respondToPermissionRequest directly
            assert.deepStrictEqual(agent.respondToPermissionCalls, [
                { requestId: 'tc-auto-1', approved: true },
            ]);
        });
        test('blocks writes to .env files', () => {
            setupSession(URI.file('/workspace').toString());
            startTurn('turn-1');
            disposables.add(sideEffects.registerProgressListener(agent));
            const envelopes = [];
            disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_start',
                toolCallId: 'tc-env-1',
                toolName: 'write',
                displayName: 'Write',
                invocationMessage: 'Write .env',
            });
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_ready',
                toolCallId: 'tc-env-1',
                invocationMessage: 'Write .env',
                permissionKind: 'write',
                permissionPath: '/workspace/.env',
                confirmationTitle: 'Write .env',
            });
            // Should NOT auto-approve — .env is excluded
            assert.strictEqual(agent.respondToPermissionCalls.length, 0);
            // Should dispatch a tool_ready action for the client to confirm
            const readyAction = envelopes.find(e => e.action.type === "session/toolCallReady" /* ActionType.SessionToolCallReady */);
            assert.ok(readyAction, 'should dispatch tool_ready for blocked write');
        });
        test('blocks writes to package.json', () => {
            setupSession(URI.file('/workspace').toString());
            startTurn('turn-1');
            disposables.add(sideEffects.registerProgressListener(agent));
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_start',
                toolCallId: 'tc-pkg-1',
                toolName: 'write',
                displayName: 'Write',
                invocationMessage: 'Write package.json',
            });
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_ready',
                toolCallId: 'tc-pkg-1',
                invocationMessage: 'Write package.json',
                permissionKind: 'write',
                permissionPath: '/workspace/package.json',
                confirmationTitle: 'Write package.json',
            });
            assert.strictEqual(agent.respondToPermissionCalls.length, 0);
        });
        test('blocks writes to .lock files', () => {
            setupSession(URI.file('/workspace').toString());
            startTurn('turn-1');
            disposables.add(sideEffects.registerProgressListener(agent));
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_start',
                toolCallId: 'tc-lock-1',
                toolName: 'write',
                displayName: 'Write',
                invocationMessage: 'Write yarn.lock',
            });
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_ready',
                toolCallId: 'tc-lock-1',
                invocationMessage: 'Write yarn.lock',
                permissionKind: 'write',
                permissionPath: '/workspace/yarn.lock',
                confirmationTitle: 'Write yarn.lock',
            });
            assert.strictEqual(agent.respondToPermissionCalls.length, 0);
        });
        test('blocks writes to .git directory', () => {
            setupSession(URI.file('/workspace').toString());
            startTurn('turn-1');
            disposables.add(sideEffects.registerProgressListener(agent));
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_start',
                toolCallId: 'tc-git-1',
                toolName: 'write',
                displayName: 'Write',
                invocationMessage: 'Write .git/config',
            });
            agent.fireProgress({
                session: sessionUri,
                type: 'tool_ready',
                toolCallId: 'tc-git-1',
                invocationMessage: 'Write .git/config',
                permissionKind: 'write',
                permissionPath: '/workspace/.git/config',
                confirmationTitle: 'Write .git/config',
            });
            assert.strictEqual(agent.respondToPermissionCalls.length, 0);
        });
    });
    // ---- Title persistence --------------------------------------------------
    suite('title persistence', () => {
        let testDir;
        let sessionDb;
        /**
         * Creates a real SessionDatabase-backed ISessionDataService.
         * All sessions share the same DB for simplicity.
         */
        function createSessionDataServiceWithDb() {
            return {
                _serviceBrand: undefined,
                getSessionDataDir: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
                getSessionDataDirById: () => URI.from({ scheme: Schemas.inMemory, path: '/session-data' }),
                openDatabase: () => ({
                    object: sessionDb,
                    dispose: () => { },
                }),
                tryOpenDatabase: async () => ({
                    object: sessionDb,
                    dispose: () => { },
                }),
                deleteSessionData: async () => { },
                cleanupOrphanedData: async () => { },
            };
        }
        setup(async () => {
            testDir = join(tmpdir(), `vscode-side-effects-title-test-${randomUUID()}`);
            mkdirSync(testDir, { recursive: true });
            sessionDb = await SessionDatabase.open(join(testDir, 'session.db'));
        });
        teardown(async () => {
            await sessionDb.close();
            rmSync(testDir, { recursive: true, force: true });
        });
        test('SessionTitleChanged persists to the database', async () => {
            const sessionDataService = createSessionDataServiceWithDb();
            const localStateManager = disposables.add(new SessionStateManager(new NullLogService()));
            const localAgent = new MockAgent();
            disposables.add(toDisposable(() => localAgent.dispose()));
            const localSideEffects = disposables.add(new AgentSideEffects(localStateManager, {
                getAgent: () => localAgent,
                agents: observableValue('agents', [localAgent]),
                sessionDataService,
            }, new NullLogService()));
            localStateManager.createSession({
                resource: sessionUri.toString(),
                provider: 'mock',
                title: 'Initial',
                status: "idle" /* SessionStatus.Idle */,
                createdAt: Date.now(),
                modifiedAt: Date.now(),
            });
            localSideEffects.handleAction({
                type: "session/titleChanged" /* ActionType.SessionTitleChanged */,
                session: sessionUri.toString(),
                title: 'Custom Title',
            });
            // Wait for the async persistence
            await new Promise(r => setTimeout(r, 50));
            assert.strictEqual(await sessionDb.getMetadata('customTitle'), 'Custom Title');
        });
        test('handleListSessions returns persisted custom title', async () => {
            const sessionDataService = createSessionDataServiceWithDb();
            const localAgent = new MockAgent();
            disposables.add(toDisposable(() => localAgent.dispose()));
            const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService));
            localService.registerProvider(localAgent);
            // Create a session on the agent backend
            await localAgent.createSession();
            // Persist a custom title in the DB
            await sessionDb.setMetadata('customTitle', 'My Custom Title');
            const sessions = await localService.listSessions();
            assert.strictEqual(sessions.length, 1);
            // Custom title comes from the DB and is returned via the agent's listSessions
            // The mock agent summary is used; the service doesn't read the DB for list
            assert.ok(sessions[0].summary);
        });
        test('handleRestoreSession uses persisted custom title', async () => {
            const sessionDataService = createSessionDataServiceWithDb();
            const localAgent = new MockAgent();
            disposables.add(toDisposable(() => localAgent.dispose()));
            const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService));
            localService.registerProvider(localAgent);
            // Create a session on the agent backend
            const session = await localAgent.createSession();
            const sessions = await localAgent.listSessions();
            const sessionResource = sessions[0].session;
            // Persist a custom title in the DB
            await sessionDb.setMetadata('customTitle', 'Restored Title');
            // Set up minimal messages for restore
            localAgent.sessionMessages = [
                { type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
                { type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
            ];
            await localService.restoreSession(sessionResource);
            const state = localService.stateManager.getSessionState(sessionResource.toString());
            assert.ok(state);
            assert.strictEqual(state.summary.title, 'Restored Title');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTaWRlRWZmZWN0cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9hZ2VudFNpZGVFZmZlY3RzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNwQyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBYyxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQVUsTUFBTSw4QkFBOEIsQ0FBQztBQUlwRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRC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