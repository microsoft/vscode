/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import severity from 'vs/base/common/severity';
import { DebugModel, Expression, StackFrame, Thread } from 'vs/workbench/contrib/debug/common/debugModel';
import * as sinon from 'sinon';
import { MockRawSession, MockDebugAdapter } from 'vs/workbench/contrib/debug/test/common/mockDebug';
import { Source } from 'vs/workbench/contrib/debug/common/debugSource';
import { DebugSession } from 'vs/workbench/contrib/debug/browser/debugSession';
import { SimpleReplElement, RawObjectReplElement, ReplEvaluationInput, ReplModel, ReplEvaluationResult } from 'vs/workbench/contrib/debug/common/replModel';
import { IDebugSessionOptions } from 'vs/workbench/contrib/debug/common/debug';
import { NullOpenerService } from 'vs/platform/opener/common/opener';
import { RawDebugSession } from 'vs/workbench/contrib/debug/browser/rawDebugSession';
import { timeout } from 'vs/base/common/async';

function createMockSession(model: DebugModel, name = 'mockSession', options?: IDebugSessionOptions): DebugSession {
	return new DebugSession({ resolved: { name, type: 'node', request: 'launch' }, unresolved: undefined }, undefined!, model, options, undefined!, undefined!, undefined!, undefined!, undefined!, undefined!, undefined!, undefined!, NullOpenerService, undefined!);
}

suite('Debug - Model', () => {
	let model: DebugModel;
	let rawSession: MockRawSession;

	setup(() => {
		model = new DebugModel([], [], [], [], [], <any>{ isDirty: (e: any) => false });
		rawSession = new MockRawSession();
	});

	// Threads

	test('threads simple', () => {
		const threadId = 1;
		const threadName = 'firstThread';
		const session = createMockSession(model);
		model.addSession(session);

		assert.equal(model.getSessions(true).length, 1);
		model.rawUpdate({
			sessionId: session.getId(),
			threads: [{
				id: threadId,
				name: threadName
			}]
		});

		assert.equal(session.getThread(threadId)!.name, threadName);

		model.clearThreads(session.getId(), true);
		assert.equal(session.getThread(threadId), undefined);
		assert.equal(model.getSessions(true).length, 1);
	});

	test('threads multiple wtih allThreadsStopped', () => {
		const threadId1 = 1;
		const threadName1 = 'firstThread';
		const threadId2 = 2;
		const threadName2 = 'secondThread';
		const stoppedReason = 'breakpoint';

		// Add the threads
		const session = createMockSession(model);
		model.addSession(session);

		session['raw'] = <any>rawSession;

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
		assert.equal(session.getAllThreads().length, 2);
		assert.equal(thread1.name, threadName1);
		assert.equal(thread1.stopped, true);
		assert.equal(thread1.getCallStack().length, 0);
		assert.equal(thread1.stoppedDetails!.reason, stoppedReason);
		assert.equal(thread2.name, threadName2);
		assert.equal(thread2.stopped, true);
		assert.equal(thread2.getCallStack().length, 0);
		assert.equal(thread2.stoppedDetails!.reason, undefined);

		// after calling getCallStack, the callstack becomes available
		// and results in a request for the callstack in the debug adapter
		thread1.fetchCallStack().then(() => {
			assert.notEqual(thread1.getCallStack().length, 0);
		});

		thread2.fetchCallStack().then(() => {
			assert.notEqual(thread2.getCallStack().length, 0);
		});

		// calling multiple times getCallStack doesn't result in multiple calls
		// to the debug adapter
		thread1.fetchCallStack().then(() => {
			return thread2.fetchCallStack();
		});

		// clearing the callstack results in the callstack not being available
		thread1.clearCallStack();
		assert.equal(thread1.stopped, true);
		assert.equal(thread1.getCallStack().length, 0);

		thread2.clearCallStack();
		assert.equal(thread2.stopped, true);
		assert.equal(thread2.getCallStack().length, 0);

		model.clearThreads(session.getId(), true);
		assert.equal(session.getThread(threadId1), undefined);
		assert.equal(session.getThread(threadId2), undefined);
		assert.equal(session.getAllThreads().length, 0);
	});

	test('threads mutltiple without allThreadsStopped', () => {
		const sessionStub = sinon.spy(rawSession, 'stackTrace');

		const stoppedThreadId = 1;
		const stoppedThreadName = 'stoppedThread';
		const runningThreadId = 2;
		const runningThreadName = 'runningThread';
		const stoppedReason = 'breakpoint';
		const session = createMockSession(model);
		model.addSession(session);

		session['raw'] = <any>rawSession;

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
		assert.equal(stoppedThread.name, stoppedThreadName);
		assert.equal(stoppedThread.stopped, true);
		assert.equal(session.getAllThreads().length, 2);
		assert.equal(stoppedThread.getCallStack().length, 0);
		assert.equal(stoppedThread.stoppedDetails!.reason, stoppedReason);
		assert.equal(runningThread.name, runningThreadName);
		assert.equal(runningThread.stopped, false);
		assert.equal(runningThread.getCallStack().length, 0);
		assert.equal(runningThread.stoppedDetails, undefined);

		// after calling getCallStack, the callstack becomes available
		// and results in a request for the callstack in the debug adapter
		stoppedThread.fetchCallStack().then(() => {
			assert.notEqual(stoppedThread.getCallStack().length, 0);
			assert.equal(runningThread.getCallStack().length, 0);
			assert.equal(sessionStub.callCount, 1);
		});

		// calling getCallStack on the running thread returns empty array
		// and does not return in a request for the callstack in the debug
		// adapter
		runningThread.fetchCallStack().then(() => {
			assert.equal(runningThread.getCallStack().length, 0);
			assert.equal(sessionStub.callCount, 1);
		});

		// clearing the callstack results in the callstack not being available
		stoppedThread.clearCallStack();
		assert.equal(stoppedThread.stopped, true);
		assert.equal(stoppedThread.getCallStack().length, 0);

		model.clearThreads(session.getId(), true);
		assert.equal(session.getThread(stoppedThreadId), undefined);
		assert.equal(session.getThread(runningThreadId), undefined);
		assert.equal(session.getAllThreads().length, 0);
	});

	// Expressions

	function assertWatchExpressions(watchExpressions: Expression[], expectedName: string) {
		assert.equal(watchExpressions.length, 2);
		watchExpressions.forEach(we => {
			assert.equal(we.available, false);
			assert.equal(we.reference, 0);
			assert.equal(we.name, expectedName);
		});
	}

	test('watch expressions', () => {
		assert.equal(model.getWatchExpressions().length, 0);
		model.addWatchExpression('console');
		model.addWatchExpression('console');
		let watchExpressions = model.getWatchExpressions();
		assertWatchExpressions(watchExpressions, 'console');

		model.renameWatchExpression(watchExpressions[0].getId(), 'new_name');
		model.renameWatchExpression(watchExpressions[1].getId(), 'new_name');
		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		model.addWatchExpression('mockExpression');
		model.moveWatchExpression(model.getWatchExpressions()[2].getId(), 1);
		watchExpressions = model.getWatchExpressions();
		assert.equal(watchExpressions[0].name, 'new_name');
		assert.equal(watchExpressions[1].name, 'mockExpression');
		assert.equal(watchExpressions[2].name, 'new_name');

		model.removeWatchExpressions();
		assert.equal(model.getWatchExpressions().length, 0);
	});

	test('repl expressions', () => {
		const session = createMockSession(model);
		assert.equal(session.getReplElements().length, 0);
		model.addSession(session);

		session['raw'] = <any>rawSession;
		const thread = new Thread(session, 'mockthread', 1);
		const stackFrame = new StackFrame(thread, 1, <any>undefined, 'app.js', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1);
		const replModel = new ReplModel();
		replModel.addReplExpression(session, stackFrame, 'myVariable').then();
		replModel.addReplExpression(session, stackFrame, 'myVariable').then();
		replModel.addReplExpression(session, stackFrame, 'myVariable').then();

		assert.equal(replModel.getReplElements().length, 3);
		replModel.getReplElements().forEach(re => {
			assert.equal((<ReplEvaluationInput>re).value, 'myVariable');
		});

		replModel.removeReplExpressions();
		assert.equal(replModel.getReplElements().length, 0);
	});

	test('stack frame get specific source name', () => {
		const session = createMockSession(model);
		model.addSession(session);

		let firstStackFrame: StackFrame;
		let secondStackFrame: StackFrame;
		const thread = new class extends Thread {
			public getCallStack(): StackFrame[] {
				return [firstStackFrame, secondStackFrame];
			}
		}(session, 'mockthread', 1);

		const firstSource = new Source({
			name: 'internalModule.js',
			path: 'a/b/c/d/internalModule.js',
			sourceReference: 10,
		}, 'aDebugSessionId');
		const secondSource = new Source({
			name: 'internalModule.js',
			path: 'z/x/c/d/internalModule.js',
			sourceReference: 11,
		}, 'aDebugSessionId');
		firstStackFrame = new StackFrame(thread, 1, firstSource, 'app.js', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1);
		secondStackFrame = new StackFrame(thread, 1, secondSource, 'app.js', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1);

		assert.equal(firstStackFrame.getSpecificSourceName(), '.../b/c/d/internalModule.js');
		assert.equal(secondStackFrame.getSpecificSourceName(), '.../x/c/d/internalModule.js');
	});

	test('stack frame toString()', () => {
		const session = createMockSession(model);
		const thread = new Thread(session, 'mockthread', 1);
		const firstSource = new Source({
			name: 'internalModule.js',
			path: 'a/b/c/d/internalModule.js',
			sourceReference: 10,
		}, 'aDebugSessionId');
		const stackFrame = new StackFrame(thread, 1, firstSource, 'app', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1);
		assert.equal(stackFrame.toString(), 'app (internalModule.js:1)');

		const secondSource = new Source(undefined, 'aDebugSessionId');
		const stackFrame2 = new StackFrame(thread, 2, secondSource, 'module', 'normal', { startLineNumber: undefined!, startColumn: undefined!, endLineNumber: undefined!, endColumn: undefined! }, 2);
		assert.equal(stackFrame2.toString(), 'module');
	});

	test('debug child sessions are added in correct order', () => {
		const session = createMockSession(model);
		model.addSession(session);
		const secondSession = createMockSession(model, 'mockSession2');
		model.addSession(secondSession);
		const firstChild = createMockSession(model, 'firstChild', { parentSession: session });
		model.addSession(firstChild);
		const secondChild = createMockSession(model, 'secondChild', { parentSession: session });
		model.addSession(secondChild);
		const thirdSession = createMockSession(model, 'mockSession3');
		model.addSession(thirdSession);
		const anotherChild = createMockSession(model, 'secondChild', { parentSession: secondSession });
		model.addSession(anotherChild);

		const sessions = model.getSessions();
		assert.equal(sessions[0].getId(), session.getId());
		assert.equal(sessions[1].getId(), firstChild.getId());
		assert.equal(sessions[2].getId(), secondChild.getId());
		assert.equal(sessions[3].getId(), secondSession.getId());
		assert.equal(sessions[4].getId(), anotherChild.getId());
		assert.equal(sessions[5].getId(), thirdSession.getId());
	});

	// Repl output

	test('repl output', () => {
		const session = createMockSession(model);
		const repl = new ReplModel();
		repl.appendToRepl(session, 'first line\n', severity.Error);
		repl.appendToRepl(session, 'second line ', severity.Error);
		repl.appendToRepl(session, 'third line ', severity.Error);
		repl.appendToRepl(session, 'fourth line', severity.Error);

		let elements = <SimpleReplElement[]>repl.getReplElements();
		assert.equal(elements.length, 2);
		assert.equal(elements[0].value, 'first line\n');
		assert.equal(elements[0].severity, severity.Error);
		assert.equal(elements[1].value, 'second line third line fourth line');
		assert.equal(elements[1].severity, severity.Error);

		repl.appendToRepl(session, '1', severity.Warning);
		elements = <SimpleReplElement[]>repl.getReplElements();
		assert.equal(elements.length, 3);
		assert.equal(elements[2].value, '1');
		assert.equal(elements[2].severity, severity.Warning);

		const keyValueObject = { 'key1': 2, 'key2': 'value' };
		repl.appendToRepl(session, new RawObjectReplElement('fakeid', 'fake', keyValueObject), severity.Info);
		const element = <RawObjectReplElement>repl.getReplElements()[3];
		assert.equal(element.value, 'Object');
		assert.deepEqual(element.valueObj, keyValueObject);

		repl.removeReplExpressions();
		assert.equal(repl.getReplElements().length, 0);

		repl.appendToRepl(session, '1\n', severity.Info);
		repl.appendToRepl(session, '2', severity.Info);
		repl.appendToRepl(session, '3\n4', severity.Info);
		repl.appendToRepl(session, '5\n', severity.Info);
		repl.appendToRepl(session, '6', severity.Info);
		elements = <SimpleReplElement[]>repl.getReplElements();
		assert.equal(elements.length, 3);
		assert.equal(elements[0], '1\n');
		assert.equal(elements[1], '23\n45\n');
		assert.equal(elements[2], '6');
	});

	test('repl merging', () => {
		// 'mergeWithParent' should be ignored when there is no parent.
		const parent = createMockSession(model, 'parent', { repl: 'mergeWithParent' });
		const child1 = createMockSession(model, 'child1', { parentSession: parent, repl: 'separate' });
		const child2 = createMockSession(model, 'child2', { parentSession: parent, repl: 'mergeWithParent' });
		const grandChild = createMockSession(model, 'grandChild', { parentSession: child2, repl: 'mergeWithParent' });
		const child3 = createMockSession(model, 'child3', { parentSession: parent });

		let parentChanges = 0;
		parent.onDidChangeReplElements(() => ++parentChanges);

		parent.appendToRepl('1\n', severity.Info);
		assert.equal(parentChanges, 1);
		assert.equal(parent.getReplElements().length, 1);
		assert.equal(child1.getReplElements().length, 0);
		assert.equal(child2.getReplElements().length, 1);
		assert.equal(grandChild.getReplElements().length, 1);
		assert.equal(child3.getReplElements().length, 0);

		grandChild.appendToRepl('1\n', severity.Info);
		assert.equal(parentChanges, 2);
		assert.equal(parent.getReplElements().length, 2);
		assert.equal(child1.getReplElements().length, 0);
		assert.equal(child2.getReplElements().length, 2);
		assert.equal(grandChild.getReplElements().length, 2);
		assert.equal(child3.getReplElements().length, 0);

		child3.appendToRepl('1\n', severity.Info);
		assert.equal(parentChanges, 2);
		assert.equal(parent.getReplElements().length, 2);
		assert.equal(child1.getReplElements().length, 0);
		assert.equal(child2.getReplElements().length, 2);
		assert.equal(grandChild.getReplElements().length, 2);
		assert.equal(child3.getReplElements().length, 1);

		child1.appendToRepl('1\n', severity.Info);
		assert.equal(parentChanges, 2);
		assert.equal(parent.getReplElements().length, 2);
		assert.equal(child1.getReplElements().length, 1);
		assert.equal(child2.getReplElements().length, 2);
		assert.equal(grandChild.getReplElements().length, 2);
		assert.equal(child3.getReplElements().length, 1);
	});

	test('repl ordering', async () => {
		const session = createMockSession(model);
		model.addSession(session);

		const adapter = new MockDebugAdapter();
		const raw = new RawDebugSession(adapter, undefined!, undefined!, undefined!, undefined!, undefined!);
		session.initializeForTest(raw);

		await session.addReplExpression(undefined, 'before.1');
		assert.equal(session.getReplElements().length, 3);
		assert.equal((<ReplEvaluationInput>session.getReplElements()[0]).value, 'before.1');
		assert.equal((<SimpleReplElement>session.getReplElements()[1]).value, 'before.1');
		assert.equal((<ReplEvaluationResult>session.getReplElements()[2]).value, '=before.1');

		await session.addReplExpression(undefined, 'after.2');
		await timeout(0);
		assert.equal(session.getReplElements().length, 6);
		assert.equal((<ReplEvaluationInput>session.getReplElements()[3]).value, 'after.2');
		assert.equal((<ReplEvaluationResult>session.getReplElements()[4]).value, '=after.2');
		assert.equal((<SimpleReplElement>session.getReplElements()[5]).value, 'after.2');
	});
});
