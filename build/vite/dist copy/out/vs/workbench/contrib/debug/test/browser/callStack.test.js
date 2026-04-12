/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { createDecorationsForStackFrame } from '../../browser/callStackEditorContribution.js';
import { getContext, getContextForContributedActions, getSpecificSourceName } from '../../browser/callStackView.js';
import { debugStackframe, debugStackframeFocused } from '../../browser/debugIcons.js';
import { getStackFrameThreadAndSessionToFocus } from '../../browser/debugService.js';
import { DebugSession } from '../../browser/debugSession.js';
import { StackFrame, Thread } from '../../common/debugModel.js';
import { Source } from '../../common/debugSource.js';
import { MockRawSession } from '../common/mockDebug.js';
import { createMockDebugModel, mockUriIdentityService } from './mockDebugModel.js';
const mockWorkspaceContextService = upcastDeepPartial({
    getWorkspace: () => {
        return {
            folders: []
        };
    }
});
export function createTestSession(model, name = 'mockSession', options) {
    return new DebugSession(generateUuid(), { resolved: { name, type: 'node', request: 'launch' }, unresolved: undefined }, undefined, model, options, {
        getViewModel() {
            return {
                updateViews() {
                    // noop
                }
            };
        }
    }, undefined, undefined, new TestConfigurationService({ debug: { console: { collapseIdenticalLines: true } } }), undefined, mockWorkspaceContextService, undefined, undefined, undefined, mockUriIdentityService, new TestInstantiationService(), undefined, undefined, new NullLogService(), undefined, undefined, new TestAccessibilityService());
}
function createTwoStackFrames(session) {
    const thread = new class extends Thread {
        getCallStack() {
            return [firstStackFrame, secondStackFrame];
        }
    }(session, 'mockthread', 1);
    const firstSource = new Source({
        name: 'internalModule.js',
        path: 'a/b/c/d/internalModule.js',
        sourceReference: 10,
    }, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
    const secondSource = new Source({
        name: 'internalModule.js',
        path: 'z/x/c/d/internalModule.js',
        sourceReference: 11,
    }, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
    const firstStackFrame = new StackFrame(thread, 0, firstSource, 'app.js', 'normal', { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 10 }, 0, true);
    const secondStackFrame = new StackFrame(thread, 1, secondSource, 'app2.js', 'normal', { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 10 }, 1, true);
    return { firstStackFrame, secondStackFrame };
}
suite('Debug - CallStack', () => {
    let model;
    let mockRawSession;
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        model = createMockDebugModel(disposables);
        mockRawSession = new MockRawSession();
    });
    teardown(() => {
        sinon.restore();
    });
    // Threads
    test('threads simple', () => {
        const threadId = 1;
        const threadName = 'firstThread';
        const session = createTestSession(model);
        disposables.add(session);
        model.addSession(session);
        assert.strictEqual(model.getSessions(true).length, 1);
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: threadId,
                    name: threadName
                }]
        });
        assert.strictEqual(session.getThread(threadId).name, threadName);
        model.clearThreads(session.getId(), true);
        assert.strictEqual(session.getThread(threadId), undefined);
        assert.strictEqual(model.getSessions(true).length, 1);
    });
    test('threads multiple with allThreadsStopped', async () => {
        const threadId1 = 1;
        const threadName1 = 'firstThread';
        const threadId2 = 2;
        const threadName2 = 'secondThread';
        const stoppedReason = 'breakpoint';
        // Add the threads
        const session = createTestSession(model);
        disposables.add(session);
        model.addSession(session);
        session.raw = upcastPartial(mockRawSession);
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: threadId1,
                    name: threadName1
                }]
        });
        // Stopped event with all threads stopped
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: threadId1,
                    name: threadName1
                }, {
                    id: threadId2,
                    name: threadName2
                }],
            stoppedDetails: {
                reason: stoppedReason,
                threadId: 1,
                allThreadsStopped: true
            },
        });
        const thread1 = session.getThread(threadId1);
        const thread2 = session.getThread(threadId2);
        // at the beginning, callstacks are obtainable but not available
        assert.strictEqual(session.getAllThreads().length, 2);
        assert.strictEqual(thread1.name, threadName1);
        assert.strictEqual(thread1.stopped, true);
        assert.strictEqual(thread1.getCallStack().length, 0);
        assert.strictEqual(thread1.stoppedDetails.reason, stoppedReason);
        assert.strictEqual(thread2.name, threadName2);
        assert.strictEqual(thread2.stopped, true);
        assert.strictEqual(thread2.getCallStack().length, 0);
        assert.strictEqual(thread2.stoppedDetails.reason, undefined);
        // after calling getCallStack, the callstack becomes available
        // and results in a request for the callstack in the debug adapter
        await thread1.fetchCallStack();
        assert.notStrictEqual(thread1.getCallStack().length, 0);
        await thread2.fetchCallStack();
        assert.notStrictEqual(thread2.getCallStack().length, 0);
        // calling multiple times getCallStack doesn't result in multiple calls
        // to the debug adapter
        await thread1.fetchCallStack();
        await thread2.fetchCallStack();
        // clearing the callstack results in the callstack not being available
        thread1.clearCallStack();
        assert.strictEqual(thread1.stopped, true);
        assert.strictEqual(thread1.getCallStack().length, 0);
        thread2.clearCallStack();
        assert.strictEqual(thread2.stopped, true);
        assert.strictEqual(thread2.getCallStack().length, 0);
        model.clearThreads(session.getId(), true);
        assert.strictEqual(session.getThread(threadId1), undefined);
        assert.strictEqual(session.getThread(threadId2), undefined);
        assert.strictEqual(session.getAllThreads().length, 0);
    });
    test('allThreadsStopped in multiple events', async () => {
        const threadId1 = 1;
        const threadName1 = 'firstThread';
        const threadId2 = 2;
        const threadName2 = 'secondThread';
        const stoppedReason = 'breakpoint';
        // Add the threads
        const session = createTestSession(model);
        disposables.add(session);
        model.addSession(session);
        session.raw = upcastPartial(mockRawSession);
        // Stopped event with all threads stopped
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: threadId1,
                    name: threadName1
                }, {
                    id: threadId2,
                    name: threadName2
                }],
            stoppedDetails: {
                reason: stoppedReason,
                threadId: threadId1,
                allThreadsStopped: true
            },
        });
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: threadId1,
                    name: threadName1
                }, {
                    id: threadId2,
                    name: threadName2
                }],
            stoppedDetails: {
                reason: stoppedReason,
                threadId: threadId2,
                allThreadsStopped: true
            },
        });
        const thread1 = session.getThread(threadId1);
        const thread2 = session.getThread(threadId2);
        assert.strictEqual(thread1.stoppedDetails?.reason, stoppedReason);
        assert.strictEqual(thread2.stoppedDetails?.reason, stoppedReason);
    });
    test('threads multiple without allThreadsStopped', async () => {
        const sessionStub = sinon.spy(mockRawSession, 'stackTrace');
        const stoppedThreadId = 1;
        const stoppedThreadName = 'stoppedThread';
        const runningThreadId = 2;
        const runningThreadName = 'runningThread';
        const stoppedReason = 'breakpoint';
        const session = createTestSession(model);
        disposables.add(session);
        model.addSession(session);
        session.raw = upcastPartial(mockRawSession);
        // Add the threads
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: stoppedThreadId,
                    name: stoppedThreadName
                }]
        });
        // Stopped event with only one thread stopped
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: 1,
                    name: stoppedThreadName
                }, {
                    id: runningThreadId,
                    name: runningThreadName
                }],
            stoppedDetails: {
                reason: stoppedReason,
                threadId: 1,
                allThreadsStopped: false
            }
        });
        const stoppedThread = session.getThread(stoppedThreadId);
        const runningThread = session.getThread(runningThreadId);
        // the callstack for the stopped thread is obtainable but not available
        // the callstack for the running thread is not obtainable nor available
        assert.strictEqual(stoppedThread.name, stoppedThreadName);
        assert.strictEqual(stoppedThread.stopped, true);
        assert.strictEqual(session.getAllThreads().length, 2);
        assert.strictEqual(stoppedThread.getCallStack().length, 0);
        assert.strictEqual(stoppedThread.stoppedDetails.reason, stoppedReason);
        assert.strictEqual(runningThread.name, runningThreadName);
        assert.strictEqual(runningThread.stopped, false);
        assert.strictEqual(runningThread.getCallStack().length, 0);
        assert.strictEqual(runningThread.stoppedDetails, undefined);
        // after calling getCallStack, the callstack becomes available
        // and results in a request for the callstack in the debug adapter
        await stoppedThread.fetchCallStack();
        assert.notStrictEqual(stoppedThread.getCallStack().length, 0);
        assert.strictEqual(runningThread.getCallStack().length, 0);
        assert.strictEqual(sessionStub.callCount, 1);
        // calling getCallStack on the running thread returns empty array
        // and does not return in a request for the callstack in the debug
        // adapter
        await runningThread.fetchCallStack();
        assert.strictEqual(runningThread.getCallStack().length, 0);
        assert.strictEqual(sessionStub.callCount, 1);
        // clearing the callstack results in the callstack not being available
        stoppedThread.clearCallStack();
        assert.strictEqual(stoppedThread.stopped, true);
        assert.strictEqual(stoppedThread.getCallStack().length, 0);
        model.clearThreads(session.getId(), true);
        assert.strictEqual(session.getThread(stoppedThreadId), undefined);
        assert.strictEqual(session.getThread(runningThreadId), undefined);
        assert.strictEqual(session.getAllThreads().length, 0);
    });
    test('stack frame get specific source name', () => {
        const session = createTestSession(model);
        disposables.add(session);
        model.addSession(session);
        const { firstStackFrame, secondStackFrame } = createTwoStackFrames(session);
        assert.strictEqual(getSpecificSourceName(firstStackFrame), '.../b/c/d/internalModule.js');
        assert.strictEqual(getSpecificSourceName(secondStackFrame), '.../x/c/d/internalModule.js');
    });
    test('stack frame toString()', () => {
        const session = createTestSession(model);
        disposables.add(session);
        const thread = new Thread(session, 'mockthread', 1);
        const firstSource = new Source({
            name: 'internalModule.js',
            path: 'a/b/c/d/internalModule.js',
            sourceReference: 10,
        }, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
        const stackFrame = new StackFrame(thread, 1, firstSource, 'app', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1, true);
        assert.strictEqual(stackFrame.toString(), 'app (internalModule.js:1)');
        const secondSource = new Source(undefined, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
        const stackFrame2 = new StackFrame(thread, 2, secondSource, 'module', 'normal', { startLineNumber: undefined, startColumn: undefined, endLineNumber: undefined, endColumn: undefined }, 2, true);
        assert.strictEqual(stackFrame2.toString(), 'module');
    });
    test('debug child sessions are added in correct order', () => {
        const session = disposables.add(createTestSession(model));
        model.addSession(session);
        const secondSession = disposables.add(createTestSession(model, 'mockSession2'));
        model.addSession(secondSession);
        const firstChild = disposables.add(createTestSession(model, 'firstChild', { parentSession: session }));
        model.addSession(firstChild);
        const secondChild = disposables.add(createTestSession(model, 'secondChild', { parentSession: session }));
        model.addSession(secondChild);
        const thirdSession = disposables.add(createTestSession(model, 'mockSession3'));
        model.addSession(thirdSession);
        const anotherChild = disposables.add(createTestSession(model, 'secondChild', { parentSession: secondSession }));
        model.addSession(anotherChild);
        const sessions = model.getSessions();
        assert.strictEqual(sessions[0].getId(), session.getId());
        assert.strictEqual(sessions[1].getId(), firstChild.getId());
        assert.strictEqual(sessions[2].getId(), secondChild.getId());
        assert.strictEqual(sessions[3].getId(), secondSession.getId());
        assert.strictEqual(sessions[4].getId(), anotherChild.getId());
        assert.strictEqual(sessions[5].getId(), thirdSession.getId());
    });
    test('decorations', () => {
        const session = createTestSession(model);
        disposables.add(session);
        model.addSession(session);
        const { firstStackFrame, secondStackFrame } = createTwoStackFrames(session);
        let decorations = createDecorationsForStackFrame(firstStackFrame, true, false);
        assert.strictEqual(decorations.length, 3);
        assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
        assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframe));
        assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */));
        assert.strictEqual(decorations[1].options.className, 'debug-top-stack-frame-line');
        assert.strictEqual(decorations[1].options.isWholeLine, true);
        decorations = createDecorationsForStackFrame(secondStackFrame, true, false);
        assert.strictEqual(decorations.length, 2);
        assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
        assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframeFocused));
        assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */));
        assert.strictEqual(decorations[1].options.className, 'debug-focused-stack-frame-line');
        assert.strictEqual(decorations[1].options.isWholeLine, true);
        decorations = createDecorationsForStackFrame(firstStackFrame, true, false);
        assert.strictEqual(decorations.length, 3);
        assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
        assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframe));
        assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */));
        assert.strictEqual(decorations[1].options.className, 'debug-top-stack-frame-line');
        assert.strictEqual(decorations[1].options.isWholeLine, true);
        // Inline decoration gets rendered in this case
        assert.strictEqual(decorations[2].options.before?.inlineClassName, 'debug-top-stack-frame-column');
        assert.deepStrictEqual(decorations[2].range, new Range(1, 2, 1, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */));
    });
    test('contexts', () => {
        const session = createTestSession(model);
        disposables.add(session);
        model.addSession(session);
        const { firstStackFrame, secondStackFrame } = createTwoStackFrames(session);
        let context = getContext(firstStackFrame);
        assert.strictEqual(context?.sessionId, firstStackFrame.thread.session.getId());
        assert.strictEqual(context?.threadId, firstStackFrame.thread.getId());
        assert.strictEqual(context?.frameId, firstStackFrame.getId());
        context = getContext(secondStackFrame.thread);
        assert.strictEqual(context?.sessionId, secondStackFrame.thread.session.getId());
        assert.strictEqual(context?.threadId, secondStackFrame.thread.getId());
        assert.strictEqual(context?.frameId, undefined);
        context = getContext(session);
        assert.strictEqual(context?.sessionId, session.getId());
        assert.strictEqual(context?.threadId, undefined);
        assert.strictEqual(context?.frameId, undefined);
        let contributedContext = getContextForContributedActions(firstStackFrame);
        assert.strictEqual(contributedContext, firstStackFrame.source.raw.path);
        contributedContext = getContextForContributedActions(firstStackFrame.thread);
        assert.strictEqual(contributedContext, firstStackFrame.thread.threadId);
        contributedContext = getContextForContributedActions(session);
        assert.strictEqual(contributedContext, session.getId());
    });
    test('focusStackFrameThreadAndSession', () => {
        const threadId1 = 1;
        const threadName1 = 'firstThread';
        const threadId2 = 2;
        const threadName2 = 'secondThread';
        const stoppedReason = 'breakpoint';
        // Add the threads
        const session = new class extends DebugSession {
            get state() {
                return 2 /* State.Stopped */;
            }
        }(generateUuid(), { resolved: { name: 'stoppedSession', type: 'node', request: 'launch' }, unresolved: undefined }, undefined, model, undefined, undefined, undefined, undefined, undefined, undefined, mockWorkspaceContextService, undefined, undefined, undefined, mockUriIdentityService, new TestInstantiationService(), undefined, undefined, new NullLogService(), undefined, undefined, new TestAccessibilityService());
        disposables.add(session);
        const runningSession = createTestSession(model);
        disposables.add(runningSession);
        model.addSession(runningSession);
        model.addSession(session);
        session.raw = upcastPartial(mockRawSession);
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: threadId1,
                    name: threadName1
                }]
        });
        // Stopped event with all threads stopped
        model.rawUpdate({
            sessionId: session.getId(),
            threads: [{
                    id: threadId1,
                    name: threadName1
                }, {
                    id: threadId2,
                    name: threadName2
                }],
            stoppedDetails: {
                reason: stoppedReason,
                threadId: 1,
                allThreadsStopped: true
            },
        });
        const thread = session.getThread(threadId1);
        const runningThread = session.getThread(threadId2);
        let toFocus = getStackFrameThreadAndSessionToFocus(model, undefined);
        // Verify stopped session and stopped thread get focused
        assert.deepStrictEqual(toFocus, { stackFrame: undefined, thread: thread, session: session });
        toFocus = getStackFrameThreadAndSessionToFocus(model, undefined, undefined, runningSession);
        assert.deepStrictEqual(toFocus, { stackFrame: undefined, thread: undefined, session: runningSession });
        toFocus = getStackFrameThreadAndSessionToFocus(model, undefined, thread);
        assert.deepStrictEqual(toFocus, { stackFrame: undefined, thread: thread, session: session });
        toFocus = getStackFrameThreadAndSessionToFocus(model, undefined, runningThread);
        assert.deepStrictEqual(toFocus, { stackFrame: undefined, thread: runningThread, session: session });
        const stackFrame = new StackFrame(thread, 5, undefined, 'stackframename2', undefined, undefined, 1, true);
        toFocus = getStackFrameThreadAndSessionToFocus(model, stackFrame);
        assert.deepStrictEqual(toFocus, { stackFrame: stackFrame, thread: thread, session: session });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbFN0YWNrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy90ZXN0L2Jyb3dzZXIvY2FsbFN0YWNrLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUYsT0FBTyxFQUFFLFVBQVUsRUFBRSwrQkFBK0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BILE9BQU8sRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN0RixPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNyRixPQUFP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