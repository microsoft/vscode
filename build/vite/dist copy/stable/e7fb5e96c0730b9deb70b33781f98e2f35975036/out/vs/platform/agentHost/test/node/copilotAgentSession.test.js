/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService, ILogService } from '../../../log/common/log.js';
import { IFileService } from '../../../files/common/files.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { CopilotAgentSession } from '../../node/copilot/copilotAgentSession.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
// ---- Mock CopilotSession (SDK level) ----------------------------------------
/**
 * Minimal mock of the SDK's {@link CopilotSession}. Implements `on()` to
 * store typed handlers, and exposes `fire()` so tests can push events
 * through the real {@link CopilotSessionWrapper} event pipeline.
 */
class MockCopilotSession {
    constructor() {
        this.sessionId = 'test-session-1';
        this._handlers = new Map();
    }
    on(eventType, handler) {
        let set = this._handlers.get(eventType);
        if (!set) {
            set = new Set();
            this._handlers.set(eventType, set);
        }
        set.add(handler);
        return () => { set.delete(handler); };
    }
    /** Push an event through to all registered handlers of the given type. */
    fire(type, data) {
        const event = { type, data, id: 'evt-1', timestamp: new Date().toISOString(), parentId: null };
        const set = this._handlers.get(type);
        if (set) {
            for (const handler of set) {
                handler(event);
            }
        }
    }
    // Stubs for methods the wrapper / session class calls
    async send() { return ''; }
    async abort() { }
    async setModel() { }
    async getMessages() { return []; }
    async destroy() { }
}
// ---- Helpers ----------------------------------------------------------------
function createMockSessionDataService() {
    const mockDb = {
        createTurn: async () => { },
        deleteTurn: async () => { },
        storeFileEdit: async () => { },
        getFileEdits: async () => [],
        readFileEditContent: async () => undefined,
        getMetadata: async () => undefined,
        setMetadata: async () => { },
        close: async () => { },
        dispose: () => { },
    };
    return {
        _serviceBrand: undefined,
        getSessionDataDir: () => URI.from({ scheme: 'test', path: '/data' }),
        getSessionDataDirById: () => URI.from({ scheme: 'test', path: '/data' }),
        openDatabase: () => ({ object: mockDb, dispose: () => { } }),
        tryOpenDatabase: async () => ({ object: mockDb, dispose: () => { } }),
        deleteSessionData: async () => { },
        cleanupOrphanedData: async () => { },
    };
}
async function createAgentSession(disposables, options) {
    const progressEmitter = disposables.add(new Emitter());
    const progressEvents = [];
    disposables.add(progressEmitter.event(e => progressEvents.push(e)));
    const sessionUri = AgentSession.uri('copilot', 'test-session-1');
    const mockSession = new MockCopilotSession();
    const factory = async () => new CopilotSessionWrapper(mockSession);
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, { _serviceBrand: undefined });
    services.set(ISessionDataService, createMockSessionDataService());
    const instantiationService = disposables.add(new InstantiationService(services));
    const session = disposables.add(instantiationService.createInstance(CopilotAgentSession, sessionUri, 'test-session-1', options?.workingDirectory, progressEmitter, factory));
    await session.initializeSession();
    return { session, mockSession, progressEvents };
}
// ---- Tests ------------------------------------------------------------------
suite('CopilotAgentSession', () => {
    const disposables = new DisposableStore();
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    // ---- permission handling ----
    suite('permission handling', () => {
        test('auto-approves read inside working directory', async () => {
            const { session } = await createAgentSession(disposables, { workingDirectory: URI.file('/workspace') });
            const result = await session.handlePermissionRequest({
                kind: 'read',
                path: '/workspace/src/file.ts',
                toolCallId: 'tc-1',
            });
            assert.strictEqual(result.kind, 'approved');
        });
        test('does not auto-approve read outside working directory', async () => {
            const { session, progressEvents } = await createAgentSession(disposables, { workingDirectory: URI.file('/workspace') });
            // Kick off permission request but don't await — it will block
            const resultPromise = session.handlePermissionRequest({
                kind: 'read',
                path: '/other/file.ts',
                toolCallId: 'tc-2',
            });
            // Should have fired a tool_ready event
            assert.strictEqual(progressEvents.length, 1);
            assert.strictEqual(progressEvents[0].type, 'tool_ready');
            // Respond to it
            assert.ok(session.respondToPermissionRequest('tc-2', true));
            const result = await resultPromise;
            assert.strictEqual(result.kind, 'approved');
        });
        test('denies permission when no toolCallId', async () => {
            const { session } = await createAgentSession(disposables);
            const result = await session.handlePermissionRequest({ kind: 'write' });
            assert.strictEqual(result.kind, 'denied-interactively-by-user');
        });
        test('denied-interactively when user denies', async () => {
            const { session, progressEvents } = await createAgentSession(disposables);
            const resultPromise = session.handlePermissionRequest({
                kind: 'shell',
                toolCallId: 'tc-3',
            });
            assert.strictEqual(progressEvents.length, 1);
            session.respondToPermissionRequest('tc-3', false);
            const result = await resultPromise;
            assert.strictEqual(result.kind, 'denied-interactively-by-user');
        });
        test('pending permissions are denied on dispose', async () => {
            const { session } = await createAgentSession(disposables);
            const resultPromise = session.handlePermissionRequest({
                kind: 'write',
                toolCallId: 'tc-4',
            });
            session.dispose();
            const result = await resultPromise;
            assert.strictEqual(result.kind, 'denied-interactively-by-user');
        });
        test('pending permissions are denied on abort', async () => {
            const { session } = await createAgentSession(disposables);
            const resultPromise = session.handlePermissionRequest({
                kind: 'write',
                toolCallId: 'tc-5',
            });
            await session.abort();
            const result = await resultPromise;
            assert.strictEqual(result.kind, 'denied-interactively-by-user');
        });
        test('respondToPermissionRequest returns false for unknown id', async () => {
            const { session } = await createAgentSession(disposables);
            assert.strictEqual(session.respondToPermissionRequest('unknown-id', true), false);
        });
    });
    // ---- sendSteering ----
    suite('sendSteering', () => {
        test('fires steering_consumed after send resolves', async () => {
            const { session, progressEvents } = await createAgentSession(disposables);
            await session.sendSteering({ id: 'steer-1', userMessage: { text: 'focus on tests' } });
            const consumed = progressEvents.find(e => e.type === 'steering_consumed');
            assert.ok(consumed, 'should fire steering_consumed event');
            assert.strictEqual(consumed.id, 'steer-1');
        });
        test('does not fire steering_consumed when send fails', async () => {
            const { session, mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.send = async () => { throw new Error('send failed'); };
            await session.sendSteering({ id: 'steer-fail', userMessage: { text: 'will fail' } });
            const consumed = progressEvents.find(e => e.type === 'steering_consumed');
            assert.strictEqual(consumed, undefined, 'should not fire steering_consumed on failure');
        });
    });
    // ---- event mapping ----
    suite('event mapping', () => {
        test('tool_start event is mapped for non-hidden tools', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.fire('tool.execution_start', {
                toolCallId: 'tc-10',
                toolName: 'bash',
                arguments: { command: 'echo hello' },
            });
            assert.strictEqual(progressEvents.length, 1);
            assert.strictEqual(progressEvents[0].type, 'tool_start');
            if (progressEvents[0].type === 'tool_start') {
                assert.strictEqual(progressEvents[0].toolCallId, 'tc-10');
                assert.strictEqual(progressEvents[0].toolName, 'bash');
            }
        });
        test('hidden tools are not emitted as tool_start', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.fire('tool.execution_start', {
                toolCallId: 'tc-11',
                toolName: 'report_intent',
            });
            assert.strictEqual(progressEvents.length, 0);
        });
        test('tool_complete event produces past-tense message', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            // First fire tool_start so it's tracked
            mockSession.fire('tool.execution_start', {
                toolCallId: 'tc-12',
                toolName: 'bash',
                arguments: { command: 'ls' },
            });
            // Then fire complete
            mockSession.fire('tool.execution_complete', {
                toolCallId: 'tc-12',
                success: true,
                result: { content: 'file1.ts\nfile2.ts' },
            });
            assert.strictEqual(progressEvents.length, 2);
            assert.strictEqual(progressEvents[1].type, 'tool_complete');
            if (progressEvents[1].type === 'tool_complete') {
                assert.strictEqual(progressEvents[1].toolCallId, 'tc-12');
                assert.ok(progressEvents[1].result.success);
                assert.ok(progressEvents[1].result.pastTenseMessage);
            }
        });
        test('tool_complete for untracked tool is ignored', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.fire('tool.execution_complete', {
                toolCallId: 'tc-untracked',
                success: true,
            });
            assert.strictEqual(progressEvents.length, 0);
        });
        test('idle event is forwarded', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.fire('session.idle', {});
            assert.strictEqual(progressEvents.length, 1);
            assert.strictEqual(progressEvents[0].type, 'idle');
        });
        test('error event is forwarded', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.fire('session.error', {
                errorType: 'TestError',
                message: 'something went wrong',
                stack: 'Error: something went wrong',
            });
            assert.strictEqual(progressEvents.length, 1);
            assert.strictEqual(progressEvents[0].type, 'error');
            if (progressEvents[0].type === 'error') {
                assert.strictEqual(progressEvents[0].errorType, 'TestError');
                assert.strictEqual(progressEvents[0].message, 'something went wrong');
            }
        });
        test('message delta is forwarded', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.fire('assistant.message_delta', {
                messageId: 'msg-1',
                deltaContent: 'Hello ',
            });
            assert.strictEqual(progressEvents.length, 1);
            assert.strictEqual(progressEvents[0].type, 'delta');
            if (progressEvents[0].type === 'delta') {
                assert.strictEqual(progressEvents[0].content, 'Hello ');
            }
        });
        test('complete message with tool requests is forwarded', async () => {
            const { mockSession, progressEvents } = await createAgentSession(disposables);
            mockSession.fire('assistant.message', {
                messageId: 'msg-2',
                content: 'Let me help you.',
                toolRequests: [{
                        toolCallId: 'tc-20',
                        name: 'bash',
                        arguments: { command: 'ls' },
                        type: 'function',
                    }],
            });
            assert.strictEqual(progressEvents.length, 1);
            assert.strictEqual(progressEvents[0].type, 'message');
            if (progressEvents[0].type === 'message') {
                assert.strictEqual(progressEvents[0].content, 'Let me help you.');
                assert.strictEqual(progressEvents[0].toolRequests?.length, 1);
                assert.strictEqual(progressEvents[0].toolRequests?.[0].toolCallId, 'tc-20');
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdEFnZW50U2Vzc2lvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9jb3BpbG90QWdlbnRTZXNzaW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDekUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQXVCLE1BQU0sOEJBQThCLENBQUM7QUFDakYsT0FBTyxFQUFvQixtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUN2RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUV2RixnRkFBZ0Y7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sa0JBQWtCO0lBQXhCO1FBQ1UsY0FBUyxHQUFHLGdCQUFnQixDQUFDO1FBRXJCLGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBOEMsQ0FBQztJQTZCcEYsQ0FBQztJQTNCQSxFQUFFLENBQTZCLFNBQVksRUFBRSxPQUFvQztRQUNoRixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDVixHQUFHLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDcEMsQ0FBQztRQUNELEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBd0MsQ0FBQyxDQUFDO1FBQ2xELE9BQU8sR0FBRyxFQUFFLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUF3QyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELDBFQUEwRTtJQUMxRSxJQUFJLENBQTZCLElBQU8sRUFBRSxJQUFvQztRQUM3RSxNQUFNLEtBQUssR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUE0QixDQUFDO1FBQ3pILE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLElBQUksR0FBRyxFQUFFLENBQUM7WUFDVCxLQUFLLE1BQU0sT0FBTyxJQUFJLEdBQUcsRUFBRSxDQUFDO2dCQUMzQixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsc0RBQXNEO0lBQ3RELEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzNCLEtBQUssQ0FBQyxLQUFLLEtBQUssQ0FBQztJQUNqQixLQUFLLENBQUMsUUFBUSxLQUFLLENBQUM7SUFDcEIsS0FBSyxDQUFDLFdBQVcsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbEMsS0FBSyxDQUFDLE9BQU8sS0FBSyxDQUFDO0NBQ25CO0FBRUQsZ0ZBQWdGO0FBRWhGLFNBQVMsNEJBQTRCO0lBQ3BDLE1BQU0sTUFBTSxHQUFxQjtRQUNoQyxVQUFVLEVBQUUsS0FBSyxJQUFJLEVBQUUsR0FBRyxDQUFDO1FBQzNCLFVBQVUsRUFBRSxLQUFLLElBQUksRUFBRSxHQUFHLENBQUM7UUFDM0IsYUFBYSxFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUM5QixZQUFZLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxFQUFFO1FBQzVCLG1CQUFtQixFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsU0FBUztRQUMxQyxXQUFXLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxTQUFTO1FBQ2xDLFdBQVcsRUFBRSxLQUFLLElBQUksRUFBRSxHQUFHLENBQUM7UUFDNUIsS0FBSyxFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUN0QixPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztLQUNsQixDQUFDO0lBQ0YsT0FBTztRQUNOLGFBQWEsRUFBRSxTQUFTO1FBQ3hCLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNwRSxxQkFBcUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDeEUsWUFBWSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUM1RCxlQUFlLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDckUsaUJBQWlCLEVBQUUsS0FBSyxJQUFJLEVBQUUsR0FBRyxDQUFDO1FBQ2xDLG1CQUFtQixFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQztLQUNwQyxDQUFDO0FBQ0gsQ0FBQztBQUVELEtBQUssVUFBVSxrQkFBa0IsQ0FBQyxXQUE0QixFQUFFLE9BQW9DO0lBS25HLE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQXVCLENBQUMsQ0FBQztJQUM1RSxNQUFNLGNBQWMsR0FBMEIsRUFBRSxDQUFDO0lBQ2pELFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXBFLE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDakUsTUFBTSxXQUFXLEdBQUcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO0lBRTdDLE1BQU0sT0FBTyxHQUEwQixLQUFLLElBQUksRUFBRSxDQUFDLElBQUkscUJBQXFCLENBQUMsV0FBd0MsQ0FBQyxDQUFDO0lBRXZILE1BQU0sUUFBUSxHQUFHLElBQUksaUJBQWlCLEVBQUUsQ0FBQztJQUN6QyxRQUFRLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDaEQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsRUFBRSxhQUFhLEVBQUUsU0FBUyxFQUFrQixDQUFDLENBQUM7SUFDekUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSw0QkFBNEIsRUFBRSxDQUFDLENBQUM7SUFDbEUsTUFBTSxvQkFBb0IsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUVqRixNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FDbEUsbUJBQW1CLEVBQ25CLFVBQVUsRUFDVixnQkFBZ0IsRUFDaEIsT0FBTyxFQUFFLGdCQUFnQixFQUN6QixlQUFlLEVBQ2YsT0FBTyxDQUNQLENBQUMsQ0FBQztJQUVILE1BQU0sT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFFbEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLENBQUM7QUFDakQsQ0FBQztBQUVELGdGQUFnRjtBQUVoRixLQUFLLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBRWpDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFFMUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ3BDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsZ0NBQWdDO0lBRWhDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7UUFFakMsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzlELE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxFQUFFLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hHLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxDQUFDLHVCQUF1QixDQUFDO2dCQUNwRCxJQUFJLEVBQUUsTUFBTTtnQkFDWixJQUFJLEVBQUUsd0JBQXdCO2dCQUM5QixVQUFVLEVBQUUsTUFBTTthQUNsQixDQUFDLENBQUM7WUFDSCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsc0RBQXNELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdkUsTUFBTSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsR0FBRyxNQUFNLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxFQUFFLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXhILDhEQUE4RDtZQUM5RCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUM7Z0JBQ3JELElBQUksRUFBRSxNQUFNO2dCQUNaLElBQUksRUFBRSxnQkFBZ0I7Z0JBQ3RCLFVBQVUsRUFBRSxNQUFNO2FBQ2xCLENBQUMsQ0FBQztZQUVILHVDQUF1QztZQUN2QyxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBRXpELGdCQUFnQjtZQUNoQixNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM1RCxNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQztZQUNuQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdkQsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDMUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsdUJBQXVCLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUN4RSxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsOEJBQThCLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN4RCxNQUFNLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDMUUsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLHVCQUF1QixDQUFDO2dCQUNyRCxJQUFJLEVBQUUsT0FBTztnQkFDYixVQUFVLEVBQUUsTUFBTTthQUNsQixDQUFDLENBQUM7WUFFSCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0MsT0FBTyxDQUFDLDBCQUEwQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNsRCxNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQztZQUNuQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsOEJBQThCLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM1RCxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMxRCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUM7Z0JBQ3JELElBQUksRUFBRSxPQUFPO2dCQUNiLFVBQVUsRUFBRSxNQUFNO2FBQ2xCLENBQUMsQ0FBQztZQUVILE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixNQUFNLE1BQU0sR0FBRyxNQUFNLGFBQWEsQ0FBQztZQUNuQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsOEJBQThCLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxRCxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMxRCxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsdUJBQXVCLENBQUM7Z0JBQ3JELElBQUksRUFBRSxPQUFPO2dCQUNiLFVBQVUsRUFBRSxNQUFNO2FBQ2xCLENBQUMsQ0FBQztZQUVILE1BQU0sT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3RCLE1BQU0sTUFBTSxHQUFHLE1BQU0sYUFBYSxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlEQUF5RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxNQUFNLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLDBCQUEwQixDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgseUJBQXlCO0lBRXpCLEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1FBRTFCLElBQUksQ0FBQyw2Q0FBNkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM5RCxNQUFNLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFFMUUsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFdkYsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssbUJBQW1CLENBQUMsQ0FBQztZQUMxRSxNQUFNLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUUsUUFBMkIsQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsaURBQWlELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDbEUsTUFBTSxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUV2RixXQUFXLENBQUMsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFLEdBQUcsTUFBTSxJQUFJLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFckYsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssbUJBQW1CLENBQUMsQ0FBQztZQUMxRSxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsOENBQThDLENBQUMsQ0FBQztRQUN6RixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsMEJBQTBCO0lBRTFCLEtBQUssQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBRTNCLElBQUksQ0FBQyxpREFBaUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRSxNQUFNLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDOUUsV0FBVyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRTtnQkFDeEMsVUFBVSxFQUFFLE9BQU87Z0JBQ25CLFFBQVEsRUFBRSxNQUFNO2dCQUNoQixTQUFTLEVBQUUsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFO2FBQ21CLENBQUMsQ0FBQztZQUUxRCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQ3pELElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDeEQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdELE1BQU0sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM5RSxXQUFXLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFO2dCQUN4QyxVQUFVLEVBQUUsT0FBTztnQkFDbkIsUUFBUSxFQUFFLGVBQWU7YUFDOEIsQ0FBQyxDQUFDO1lBRTFELE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRSxNQUFNLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFFOUUsd0NBQXdDO1lBQ3hDLFdBQVcsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEVBQUU7Z0JBQ3hDLFVBQVUsRUFBRSxPQUFPO2dCQUNuQixRQUFRLEVBQUUsTUFBTTtnQkFDaEIsU0FBUyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTthQUMyQixDQUFDLENBQUM7WUFFMUQscUJBQXFCO1lBQ3JCLFdBQVcsQ0FBQyxJQUFJLENBQUMseUJBQXlCLEVBQUU7Z0JBQzNDLFVBQVUsRUFBRSxPQUFPO2dCQUNuQixPQUFPLEVBQUUsSUFBSTtnQkFDYixNQUFNLEVBQUUsRUFBRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUU7YUFDaUIsQ0FBQyxDQUFDO1lBRTdELE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDNUQsSUFBSSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRSxDQUFDO2dCQUNoRCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDdEQsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzlELE1BQU0sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM5RSxXQUFXLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFO2dCQUMzQyxVQUFVLEVBQUUsY0FBYztnQkFDMUIsT0FBTyxFQUFFLElBQUk7YUFDNkMsQ0FBQyxDQUFDO1lBRTdELE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxQyxNQUFNLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDOUUsV0FBVyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsRUFBaUQsQ0FBQyxDQUFDO1lBRXBGLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDcEQsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDM0MsTUFBTSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsR0FBRyxNQUFNLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzlFLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFO2dCQUNqQyxTQUFTLEVBQUUsV0FBVztnQkFDdEIsT0FBTyxFQUFFLHNCQUFzQjtnQkFDL0IsS0FBSyxFQUFFLDZCQUE2QjthQUNZLENBQUMsQ0FBQztZQUVuRCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BELElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztnQkFDeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUM3RCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztZQUN2RSxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDN0MsTUFBTSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsR0FBRyxNQUFNLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzlFLFdBQVcsQ0FBQyxJQUFJLENBQUMseUJBQXlCLEVBQUU7Z0JBQzNDLFNBQVMsRUFBRSxPQUFPO2dCQUNsQixZQUFZLEVBQUUsUUFBUTthQUNvQyxDQUFDLENBQUM7WUFFN0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNwRCxJQUFJLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztZQUN6RCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0RBQWtELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDbkUsTUFBTSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsR0FBRyxNQUFNLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzlFLFdBQVcsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUU7Z0JBQ3JDLFNBQVMsRUFBRSxPQUFPO2dCQUNsQixPQUFPLEVBQUUsa0JBQWtCO2dCQUMzQixZQUFZLEVBQUUsQ0FBQzt3QkFDZCxVQUFVLEVBQUUsT0FBTzt3QkFDbkIsSUFBSSxFQUFFLE1BQU07d0JBQ1osU0FBUyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRTt3QkFDNUIsSUFBSSxFQUFFLFVBQVU7cUJBQ2hCLENBQUM7YUFDa0QsQ0FBQyxDQUFDO1lBRXZELE1BQU0sQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDdEQsSUFBSSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztnQkFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzdFLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==