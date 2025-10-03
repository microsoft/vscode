/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Constants } from '../../../../../base/common/uint.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
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
import { IDebugService, IDebugSessionOptions, State } from '../../common/debug.js';
import { DebugModel, StackFrame, Thread } from '../../common/debugModel.js';
import { Source } from '../../common/debugSource.js';
import { createMockDebugModel, mockUriIdentityService } from './mockDebugModel.js';
import { MockRawSession } from '../common/mockDebug.js';

// eslint-disable-next-line local/code-no-any-casts
const mockWorkspaceContextService = {
	getWorkspace: () => {
		return {
			folders: []
		};
	}
} as any;

export function createTestSession(model: DebugModel, name = 'mockSession', options?: IDebugSessionOptions): DebugSession {
	return new DebugSession(generateUuid(), { resolved: { name, type: 'node', request: 'launch' }, unresolved: undefined }, undefined, model, options, {
		getViewModel(): any {
			return {
				updateViews(): void {
					// noop
				}
			};
		}
	} as IDebugService, undefined!, undefined!, new TestConfigurationService({ debug: { console: { collapseIdenticalLines: true } } }), undefined!, mockWorkspaceContextService, undefined!, undefined!, undefined!, mockUriIdentityService, new TestInstantiationService(), undefined!, undefined!, new NullLogService(), undefined!, undefined!, new TestAccessibilityService());
}

function createTwoStackFrames(session: DebugSession): { firstStackFrame: StackFrame; secondStackFrame: StackFrame } {
	const thread = new class extends Thread {
		public override getCallStack(): StackFrame[] {
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
	let model: DebugModel;
	let mockRawSession: MockRawSession;
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

		assert.strictEqual(session.getThread(threadId)!.name, threadName);

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

		// eslint-disable-next-line local/code-no-any-casts
		session['raw'] = <any>mockRawSession;

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

		const thread1 = session.getThread(threadId1)!;
		const thread2 = session.getThread(threadId2)!;

		// at the beginning, callstacks are obtainable but not available
		assert.strictEqual(session.getAllThreads().length, 2);
		assert.strictEqual(thread1.name, threadName1);
		assert.strictEqual(thread1.stopped, true);
		assert.strictEqual(thread1.getCallStack().length, 0);
		assert.strictEqual(thread1.stoppedDetails!.reason, stoppedReason);
		assert.strictEqual(thread2.name, threadName2);
		assert.strictEqual(thread2.stopped, true);
		assert.strictEqual(thread2.getCallStack().length, 0);
		assert.strictEqual(thread2.stoppedDetails!.reason, undefined);

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

		// eslint-disable-next-line local/code-no-any-casts
		session['raw'] = <any>mockRawSession;

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

		const thread1 = session.getThread(threadId1)!;
		const thread2 = session.getThread(threadId2)!;

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

		// eslint-disable-next-line local/code-no-any-casts
		session['raw'] = <any>mockRawSession;

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

		const stoppedThread = session.getThread(stoppedThreadId)!;
		const runningThread = session.getThread(runningThreadId)!;

		// the callstack for the stopped thread is obtainable but not available
		// the callstack for the running thread is not obtainable nor available
		assert.strictEqual(stoppedThread.name, stoppedThreadName);
		assert.strictEqual(stoppedThread.stopped, true);
		assert.strictEqual(session.getAllThreads().length, 2);
		assert.strictEqual(stoppedThread.getCallStack().length, 0);
		assert.strictEqual(stoppedThread.stoppedDetails!.reason, stoppedReason);
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
		const stackFrame2 = new StackFrame(thread, 2, secondSource, 'module', 'normal', { startLineNumber: undefined!, startColumn: undefined!, endLineNumber: undefined!, endColumn: undefined! }, 2, true);
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
		assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
		assert.strictEqual(decorations[1].options.className, 'debug-top-stack-frame-line');
		assert.strictEqual(decorations[1].options.isWholeLine, true);

		decorations = createDecorationsForStackFrame(secondStackFrame, true, false);
		assert.strictEqual(decorations.length, 2);
		assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
		assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframeFocused));
		assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
		assert.strictEqual(decorations[1].options.className, 'debug-focused-stack-frame-line');
		assert.strictEqual(decorations[1].options.isWholeLine, true);

		decorations = createDecorationsForStackFrame(firstStackFrame, true, false);
		assert.strictEqual(decorations.length, 3);
		assert.deepStrictEqual(decorations[0].range, new Range(1, 2, 1, 3));
		assert.strictEqual(decorations[0].options.glyphMarginClassName, ThemeIcon.asClassName(debugStackframe));
		assert.deepStrictEqual(decorations[1].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
		assert.strictEqual(decorations[1].options.className, 'debug-top-stack-frame-line');
		assert.strictEqual(decorations[1].options.isWholeLine, true);
		// Inline decoration gets rendered in this case
		assert.strictEqual(decorations[2].options.before?.inlineClassName, 'debug-top-stack-frame-column');
		assert.deepStrictEqual(decorations[2].range, new Range(1, 2, 1, Constants.MAX_SAFE_SMALL_INTEGER));
	});

	test('contexts', () => {
		const session = createTestSession(model);
		disposables.add(session);
		model.addSession(session);
		const { firstStackFrame, secondStackFrame } = createTwoStackFrames(session);
		let context = getContext(firstStackFrame);
		assert.strictEqual(context.sessionId, firstStackFrame.thread.session.getId());
		assert.strictEqual(context.threadId, firstStackFrame.thread.getId());
		assert.strictEqual(context.frameId, firstStackFrame.getId());

		context = getContext(secondStackFrame.thread);
		assert.strictEqual(context.sessionId, secondStackFrame.thread.session.getId());
		assert.strictEqual(context.threadId, secondStackFrame.thread.getId());
		assert.strictEqual(context.frameId, undefined);

		context = getContext(session);
		assert.strictEqual(context.sessionId, session.getId());
		assert.strictEqual(context.threadId, undefined);
		assert.strictEqual(context.frameId, undefined);

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
			override get state(): State {
				return State.Stopped;
			}
		}(generateUuid(), { resolved: { name: 'stoppedSession', type: 'node', request: 'launch' }, unresolved: undefined }, undefined, model, undefined, undefined!, undefined!, undefined!, undefined!, undefined!, mockWorkspaceContextService, undefined!, undefined!, undefined!, mockUriIdentityService, new TestInstantiationService(), undefined!, undefined!, new NullLogService(), undefined!, undefined!, new TestAccessibilityService());
		disposables.add(session);

		const runningSession = createTestSession(model);
		disposables.add(runningSession);
		model.addSession(runningSession);
		model.addSession(session);

		// eslint-disable-next-line local/code-no-any-casts
		session['raw'] = <any>mockRawSession;

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

		const thread = session.getThread(threadId1)!;
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

		const stackFrame = new StackFrame(thread, 5, undefined!, 'stackframename2', undefined, undefined!, 1, true);
		toFocus = getStackFrameThreadAndSessionToFocus(model, stackFrame);
		assert.deepStrictEqual(toFocus, { stackFrame: stackFrame, thread: thread, session: session });
	});
});
