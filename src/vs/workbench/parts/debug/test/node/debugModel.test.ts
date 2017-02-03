/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import uri from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import { OutputElement, Model, Process, Expression, OutputNameValueElement, StackFrame, Thread } from 'vs/workbench/parts/debug/common/debugModel';
import * as sinon from 'sinon';
import { MockSession } from 'vs/workbench/parts/debug/test/common/mockDebug';

suite('Debug - Model', () => {
	let model: Model;
	let rawSession: MockSession;

	setup(() => {
		model = new Model([], true, [], [], []);
		rawSession = new MockSession();
	});

	teardown(() => {
		model = null;
	});

	// Breakpoints

	test('breakpoints simple', () => {
		const modelUri = uri.file('/myfolder/myfile.js');
		model.addBreakpoints(modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		assert.equal(model.areBreakpointsActivated(), true);
		assert.equal(model.getBreakpoints().length, 2);

		model.removeBreakpoints(model.getBreakpoints());
		assert.equal(model.getBreakpoints().length, 0);
	});

	test('breakpoints toggling', () => {
		const modelUri = uri.file('/myfolder/myfile.js');
		model.addBreakpoints(modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		model.addBreakpoints(modelUri, [{ lineNumber: 12, enabled: true, condition: 'fake condition' }]);
		assert.equal(model.getBreakpoints().length, 3);
		model.removeBreakpoints([model.getBreakpoints().pop()]);
		assert.equal(model.getBreakpoints().length, 2);

		model.setBreakpointsActivated(false);
		assert.equal(model.areBreakpointsActivated(), false);
		model.setBreakpointsActivated(true);
		assert.equal(model.areBreakpointsActivated(), true);
	});

	test('breakpoints two files', () => {
		const modelUri1 = uri.file('/myfolder/my file first.js');
		const modelUri2 = uri.file('/secondfolder/second/second file.js');
		model.addBreakpoints(modelUri1, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		model.addBreakpoints(modelUri2, [{ lineNumber: 1, enabled: true }, { lineNumber: 2, enabled: true }, { lineNumber: 3, enabled: false }]);

		assert.equal(model.getBreakpoints().length, 5);
		const bp = model.getBreakpoints()[0];
		const update: any = {};
		update[bp.getId()] = { line: 100, verified: false };
		model.updateBreakpoints(update);
		assert.equal(bp.lineNumber, 100);

		model.enableOrDisableAllBreakpoints(false);
		model.getBreakpoints().forEach(bp => {
			assert.equal(bp.enabled, false);
		});
		model.setEnablement(bp, true);
		assert.equal(bp.enabled, true);

		model.removeBreakpoints(model.getBreakpoints().filter(bp => bp.uri.toString() === modelUri1.toString()));
		assert.equal(model.getBreakpoints().length, 3);
	});

	test('breakpoints conditions', () => {
		const modelUri1 = uri.file('/myfolder/my file first.js');
		model.addBreakpoints(modelUri1, [{ lineNumber: 5, condition: 'i < 5', hitCondition: '17' }, { lineNumber: 10, condition: 'j < 3' }]);
		const breakpoints = model.getBreakpoints();

		assert.equal(breakpoints[0].condition, 'i < 5');
		assert.equal(breakpoints[0].hitCondition, '17');
		assert.equal(breakpoints[1].condition, 'j < 3');
		assert.equal(!!breakpoints[1].hitCondition, false);

		assert.equal(model.getBreakpoints().length, 2);
		model.removeBreakpoints(model.getBreakpoints());
		assert.equal(model.getBreakpoints().length, 0);
	});

	// Threads

	test('threads simple', () => {
		const threadId = 1;
		const threadName = 'firstThread';

		model.addProcess({ name: 'mockProcess', type: 'node', request: 'launch' }, rawSession);
		assert.equal(model.getProcesses().length, 1);
		model.rawUpdate({
			sessionId: rawSession.getId(),
			threadId: threadId,
			thread: {
				id: threadId,
				name: threadName
			}
		});
		const process = model.getProcesses().filter(p => p.getId() === rawSession.getId()).pop();

		assert.equal(process.getThread(threadId).name, threadName);

		model.clearThreads(process.getId(), true);
		assert.equal(process.getThread(threadId), null);
		assert.equal(model.getProcesses().length, 1);
		model.removeProcess(process.getId());
		assert.equal(model.getProcesses().length, 0);
	});

	test('threads multiple wtih allThreadsStopped', () => {
		const sessionStub = sinon.spy(rawSession, 'stackTrace');

		const threadId1 = 1;
		const threadName1 = 'firstThread';
		const threadId2 = 2;
		const threadName2 = 'secondThread';
		const stoppedReason = 'breakpoint';

		// Add the threads
		model.addProcess({ name: 'mockProcess', type: 'node', request: 'launch' }, rawSession);
		model.rawUpdate({
			sessionId: rawSession.getId(),
			threadId: threadId1,
			thread: {
				id: threadId1,
				name: threadName1
			}
		});

		model.rawUpdate({
			sessionId: rawSession.getId(),
			threadId: threadId2,
			thread: {
				id: threadId2,
				name: threadName2
			}
		});

		// Stopped event with all threads stopped
		model.rawUpdate({
			sessionId: rawSession.getId(),
			threadId: threadId1,
			stoppedDetails: {
				reason: stoppedReason,
				threadId: 1
			},
			allThreadsStopped: true
		});
		const process = model.getProcesses().filter(p => p.getId() === rawSession.getId()).pop();

		const thread1 = process.getThread(threadId1);
		const thread2 = process.getThread(threadId2);

		// at the beginning, callstacks are obtainable but not available
		assert.equal(process.getAllThreads().length, 2);
		assert.equal(thread1.name, threadName1);
		assert.equal(thread1.stopped, true);
		assert.equal(thread1.getCallStack(), undefined);
		assert.equal(thread1.stoppedDetails.reason, stoppedReason);
		assert.equal(thread2.name, threadName2);
		assert.equal(thread2.stopped, true);
		assert.equal(thread2.getCallStack(), undefined);
		assert.equal(thread2.stoppedDetails.reason, stoppedReason);

		// after calling getCallStack, the callstack becomes available
		// and results in a request for the callstack in the debug adapter
		thread1.fetchCallStack().then(() => {
			assert.notEqual(thread1.getCallStack(), undefined);
			assert.equal(thread2.getCallStack(), undefined);
			assert.equal(sessionStub.callCount, 1);
		});

		thread2.fetchCallStack().then(() => {
			assert.notEqual(thread1.getCallStack(), undefined);
			assert.notEqual(thread2.getCallStack(), undefined);
			assert.equal(sessionStub.callCount, 2);
		});

		// calling multiple times getCallStack doesn't result in multiple calls
		// to the debug adapter
		thread1.fetchCallStack().then(() => {
			return thread2.fetchCallStack();
		}).then(() => {
			assert.equal(sessionStub.callCount, 2);
		});

		// clearing the callstack results in the callstack not being available
		thread1.clearCallStack();
		assert.equal(thread1.stopped, true);
		assert.equal(thread1.getCallStack(), undefined);

		thread2.clearCallStack();
		assert.equal(thread2.stopped, true);
		assert.equal(thread2.getCallStack(), undefined);

		model.clearThreads(process.getId(), true);
		assert.equal(process.getThread(threadId1), null);
		assert.equal(process.getThread(threadId2), null);
		assert.equal(process.getAllThreads().length, 0);
	});

	test('threads mutltiple without allThreadsStopped', () => {
		const sessionStub = sinon.spy(rawSession, 'stackTrace');

		const stoppedThreadId = 1;
		const stoppedThreadName = 'stoppedThread';
		const runningThreadId = 2;
		const runningThreadName = 'runningThread';
		const stoppedReason = 'breakpoint';
		model.addProcess({ name: 'mockProcess', type: 'node', request: 'launch' }, rawSession);
		// Add the threads
		model.rawUpdate({
			sessionId: rawSession.getId(),
			threadId: stoppedThreadId,
			thread: {
				id: stoppedThreadId,
				name: stoppedThreadName
			}
		});

		model.rawUpdate({
			sessionId: rawSession.getId(),
			threadId: runningThreadId,
			thread: {
				id: runningThreadId,
				name: runningThreadName
			}
		});

		// Stopped event with only one thread stopped
		model.rawUpdate({
			sessionId: rawSession.getId(),
			threadId: stoppedThreadId,
			stoppedDetails: {
				reason: stoppedReason,
				threadId: 1
			},
			allThreadsStopped: false
		});
		const process = model.getProcesses().filter(p => p.getId() === rawSession.getId()).pop();

		const stoppedThread = process.getThread(stoppedThreadId);
		const runningThread = process.getThread(runningThreadId);

		// the callstack for the stopped thread is obtainable but not available
		// the callstack for the running thread is not obtainable nor available
		assert.equal(stoppedThread.name, stoppedThreadName);
		assert.equal(stoppedThread.stopped, true);
		assert.equal(process.getAllThreads().length, 2);
		assert.equal(stoppedThread.getCallStack(), undefined);
		assert.equal(stoppedThread.stoppedDetails.reason, stoppedReason);
		assert.equal(runningThread.name, runningThreadName);
		assert.equal(runningThread.stopped, false);
		assert.equal(runningThread.getCallStack(), undefined);
		assert.equal(runningThread.stoppedDetails, undefined);

		// after calling getCallStack, the callstack becomes available
		// and results in a request for the callstack in the debug adapter
		stoppedThread.fetchCallStack().then(() => {
			assert.notEqual(stoppedThread.getCallStack(), undefined);
			assert.equal(runningThread.getCallStack(), undefined);
			assert.equal(sessionStub.callCount, 1);
		});

		// calling getCallStack on the running thread returns empty array
		// and does not return in a request for the callstack in the debug
		// adapter
		runningThread.fetchCallStack().then(callStack => {
			assert.deepEqual(callStack, []);
			assert.equal(sessionStub.callCount, 1);
		});

		// calling multiple times getCallStack doesn't result in multiple calls
		// to the debug adapter
		stoppedThread.fetchCallStack().then(() => {
			assert.equal(sessionStub.callCount, 1);
		});

		// clearing the callstack results in the callstack not being available
		stoppedThread.clearCallStack();
		assert.equal(stoppedThread.stopped, true);
		assert.equal(stoppedThread.getCallStack(), undefined);

		model.clearThreads(process.getId(), true);
		assert.equal(process.getThread(stoppedThreadId), null);
		assert.equal(process.getThread(runningThreadId), null);
		assert.equal(process.getAllThreads().length, 0);
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
		const process = new Process({ name: 'mockProcess', type: 'node', request: 'launch' }, rawSession);
		const thread = new Thread(process, 'mockthread', 1);
		const stackFrame = new StackFrame(thread, 1, null, 'app.js', 1, 1);
		model.addWatchExpression(process, stackFrame, 'console').done();
		model.addWatchExpression(process, stackFrame, 'console').done();
		let watchExpressions = model.getWatchExpressions();
		assertWatchExpressions(watchExpressions, 'console');

		model.renameWatchExpression(process, stackFrame, watchExpressions[0].getId(), 'new_name').done();
		model.renameWatchExpression(process, stackFrame, watchExpressions[1].getId(), 'new_name').done();
		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		model.evaluateWatchExpressions(process, null);
		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		model.addWatchExpression(process, stackFrame, 'mockExpression');
		model.moveWatchExpression(model.getWatchExpressions()[2].getId(), 1);
		watchExpressions = model.getWatchExpressions();
		assert.equal(watchExpressions[0].name, 'new_name');
		assert.equal(watchExpressions[1].name, 'mockExpression');
		assert.equal(watchExpressions[2].name, 'new_name');

		model.removeWatchExpressions();
		assert.equal(model.getWatchExpressions().length, 0);
	});

	test('repl expressions', () => {
		assert.equal(model.getReplElements().length, 0);
		const process = new Process({ name: 'mockProcess', type: 'node', request: 'launch' }, rawSession);
		const thread = new Thread(process, 'mockthread', 1);
		const stackFrame = new StackFrame(thread, 1, null, 'app.js', 1, 1);
		model.addReplExpression(process, stackFrame, 'myVariable').done();
		model.addReplExpression(process, stackFrame, 'myVariable').done();
		model.addReplExpression(process, stackFrame, 'myVariable').done();

		assert.equal(model.getReplElements().length, 3);
		model.getReplElements().forEach(re => {
			assert.equal((<Expression>re).available, false);
			assert.equal((<Expression>re).name, 'myVariable');
			assert.equal((<Expression>re).reference, 0);
		});

		model.removeReplExpressions();
		assert.equal(model.getReplElements().length, 0);
	});

	// Repl output

	test('repl output', () => {
		model.appendToRepl('first line\n', severity.Error);
		model.appendToRepl('second line', severity.Warning);
		model.appendToRepl('second line', severity.Warning);
		model.appendToRepl('second line', severity.Error);

		let elements = <OutputElement[]>model.getReplElements();
		assert.equal(elements.length, 3);
		assert.equal(elements[0].value, 'first line');
		assert.equal(elements[0].counter, 1);
		assert.equal(elements[0].severity, severity.Error);
		assert.equal(elements[1].value, 'second line');
		assert.equal(elements[1].counter, 2);
		assert.equal(elements[1].severity, severity.Warning);

		model.appendToRepl('1', severity.Warning);
		elements = <OutputElement[]>model.getReplElements();
		assert.equal(elements.length, 4);
		assert.equal(elements[3].value, '1');
		assert.equal(elements[3].severity, severity.Warning);

		const keyValueObject = { 'key1': 2, 'key2': 'value' };
		model.appendToRepl(new OutputNameValueElement('fake', keyValueObject), null);
		const element = <OutputNameValueElement>model.getReplElements()[4];
		assert.equal(element.value, 'Object');
		assert.deepEqual(element.valueObj, keyValueObject);

		model.removeReplExpressions();
		assert.equal(model.getReplElements().length, 0);
	});
});
