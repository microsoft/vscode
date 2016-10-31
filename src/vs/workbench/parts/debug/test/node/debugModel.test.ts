/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import uri from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import debugmodel = require('vs/workbench/parts/debug/common/debugModel');
import * as sinon from 'sinon';
import { MockSession } from 'vs/workbench/parts/debug/test/common/mockDebug';

suite('Debug - Model', () => {
	let model: debugmodel.Model;
	let rawSession: MockSession;

	setup(() => {
		model = new debugmodel.Model([], true, [], [], []);
		rawSession = new MockSession();
	});

	teardown(() => {
		model = null;
	});

	// Breakpoints

	test('breakpoints simple', () => {
		var modelUri = uri.file('/myfolder/myfile.js');
		model.addBreakpoints(modelUri, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		assert.equal(model.areBreakpointsActivated(), true);
		assert.equal(model.getBreakpoints().length, 2);

		model.removeBreakpoints(model.getBreakpoints());
		assert.equal(model.getBreakpoints().length, 0);
	});

	test('breakpoints toggling', () => {
		var modelUri = uri.file('/myfolder/myfile.js');
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
		var modelUri1 = uri.file('/myfolder/my file first.js');
		var modelUri2 = uri.file('/secondfolder/second/second file.js');
		model.addBreakpoints(modelUri1, [{ lineNumber: 5, enabled: true }, { lineNumber: 10, enabled: false }]);
		model.addBreakpoints(modelUri2, [{ lineNumber: 1, enabled: true }, { lineNumber: 2, enabled: true }, { lineNumber: 3, enabled: false }]);

		assert.equal(model.getBreakpoints().length, 5);
		var bp = model.getBreakpoints()[0];
		var originalLineLumber = bp.lineNumber;
		const update: any = {};
		update[bp.getId()] = { line: 100, verified: false };
		model.updateBreakpoints(update);
		assert.equal(bp.lineNumber, 100);
		assert.equal(bp.desiredLineNumber, originalLineLumber);

		model.enableOrDisableAllBreakpoints(false);
		model.getBreakpoints().forEach(bp => {
			assert.equal(bp.enabled, false);
		});
		model.setEnablement(bp, true);
		assert.equal(bp.enabled, true);

		model.removeBreakpoints(model.getBreakpoints().filter(bp => bp.uri.toString() === modelUri1.toString()));
		assert.equal(model.getBreakpoints().length, 3);
	});

	// Threads

	test('threads simple', () => {
		var threadId = 1;
		var threadName = 'firstThread';

		model.addProcess('mockProcess', rawSession);
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
	});

	test('threads multiple wtih allThreadsStopped', () => {
		const sessionStub = sinon.spy(rawSession, 'stackTrace');

		const threadId1 = 1;
		const threadName1 = 'firstThread';
		const threadId2 = 2;
		const threadName2 = 'secondThread';
		const stoppedReason = 'breakpoint';

		// Add the threads
		model.addProcess('mockProcess', rawSession);
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
		assert.equal(thread1.getCachedCallStack(), undefined);
		assert.equal(thread1.stoppedDetails.reason, stoppedReason);
		assert.equal(thread2.name, threadName2);
		assert.equal(thread2.stopped, true);
		assert.equal(thread2.getCachedCallStack(), undefined);
		assert.equal(thread2.stoppedDetails.reason, stoppedReason);

		// after calling getCallStack, the callstack becomes available
		// and results in a request for the callstack in the debug adapter
		thread1.getCallStack().then(() => {
			assert.notEqual(thread1.getCachedCallStack(), undefined);
			assert.equal(thread2.getCachedCallStack(), undefined);
			assert.equal(sessionStub.callCount, 1);
		});

		thread2.getCallStack().then(() => {
			assert.notEqual(thread1.getCachedCallStack(), undefined);
			assert.notEqual(thread2.getCachedCallStack(), undefined);
			assert.equal(sessionStub.callCount, 2);
		});

		// calling multiple times getCallStack doesn't result in multiple calls
		// to the debug adapter
		thread1.getCallStack().then(() => {
			return thread2.getCallStack();
		}).then(() => {
			assert.equal(sessionStub.callCount, 2);
		});

		// clearing the callstack results in the callstack not being available
		thread1.clearCallStack();
		assert.equal(thread1.stopped, true);
		assert.equal(thread1.getCachedCallStack(), undefined);

		thread2.clearCallStack();
		assert.equal(thread2.stopped, true);
		assert.equal(thread2.getCachedCallStack(), undefined);

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
		model.addProcess('mockProcess', rawSession);
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
		assert.equal(stoppedThread.getCachedCallStack(), undefined);
		assert.equal(stoppedThread.stoppedDetails.reason, stoppedReason);
		assert.equal(runningThread.name, runningThreadName);
		assert.equal(runningThread.stopped, false);
		assert.equal(runningThread.getCachedCallStack(), undefined);
		assert.equal(runningThread.stoppedDetails, undefined);

		// after calling getCallStack, the callstack becomes available
		// and results in a request for the callstack in the debug adapter
		stoppedThread.getCallStack().then(() => {
			assert.notEqual(stoppedThread.getCachedCallStack(), undefined);
			assert.equal(runningThread.getCachedCallStack(), undefined);
			assert.equal(sessionStub.callCount, 1);
		});

		// calling getCallStack on the running thread returns empty array
		// and does not return in a request for the callstack in the debug
		// adapter
		runningThread.getCallStack().then(callStack => {
			assert.deepEqual(callStack, []);
			assert.equal(sessionStub.callCount, 1);
		});

		// calling multiple times getCallStack doesn't result in multiple calls
		// to the debug adapter
		stoppedThread.getCallStack().then(() => {
			assert.equal(sessionStub.callCount, 1);
		});

		// clearing the callstack results in the callstack not being available
		stoppedThread.clearCallStack();
		assert.equal(stoppedThread.stopped, true);
		assert.equal(stoppedThread.getCachedCallStack(), undefined);

		model.clearThreads(process.getId(), true);
		assert.equal(process.getThread(stoppedThreadId), null);
		assert.equal(process.getThread(runningThreadId), null);
		assert.equal(process.getAllThreads().length, 0 );
	});

	// Expressions

	function assertWatchExpressions(watchExpressions: debugmodel.Expression[], expectedName: string) {
		assert.equal(watchExpressions.length, 2);
		watchExpressions.forEach(we => {
			assert.equal(we.available, false);
			assert.equal(we.reference, 0);
			assert.equal(we.name, expectedName);
		});
	}

	test('watch expressions', () => {
		assert.equal(model.getWatchExpressions().length, 0);
		const process = new debugmodel.Process('mockProcess', rawSession);
		const thread = new debugmodel.Thread(process, 'mockthread', 1);
		const stackFrame = new debugmodel.StackFrame(thread, 1, null, 'app.js', 1, 1);
		model.addWatchExpression(process, stackFrame, 'console').done();
		model.addWatchExpression(process, stackFrame, 'console').done();
		const watchExpressions = model.getWatchExpressions();
		assertWatchExpressions(watchExpressions, 'console');

		model.renameWatchExpression(process, stackFrame, watchExpressions[0].getId(), 'new_name').done();
		model.renameWatchExpression(process, stackFrame, watchExpressions[1].getId(), 'new_name').done();
		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		model.evaluateWatchExpressions(process, null);
		assertWatchExpressions(model.getWatchExpressions(), 'new_name');

		model.removeWatchExpressions();
		assert.equal(model.getWatchExpressions().length, 0);
	});

	test('repl expressions', () => {
		assert.equal(model.getReplElements().length, 0);
		const process = new debugmodel.Process('mockProcess', rawSession);
		const thread = new debugmodel.Thread(process, 'mockthread', 1);
		const stackFrame = new debugmodel.StackFrame(thread, 1, null, 'app.js', 1, 1);
		model.addReplExpression(process, stackFrame, 'myVariable').done();
		model.addReplExpression(process, stackFrame, 'myVariable').done();
		model.addReplExpression(process, stackFrame, 'myVariable').done();

		assert.equal(model.getReplElements().length, 3);
		model.getReplElements().forEach(re => {
			assert.equal((<debugmodel.Expression>re).available, false);
			assert.equal((<debugmodel.Expression>re).name, 'myVariable');
			assert.equal((<debugmodel.Expression>re).reference, 0);
		});

		model.removeReplExpressions();
		assert.equal(model.getReplElements().length, 0);
	});

	// Repl output

	test('repl output', () => {
		model.logToRepl('first line', severity.Error);
		model.logToRepl('second line', severity.Warning);
		model.logToRepl('second line', severity.Warning);
		model.logToRepl('second line', severity.Error);

		let elements = <debugmodel.ValueOutputElement[]>model.getReplElements();
		assert.equal(elements.length, 3);
		assert.equal(elements[0].value, 'first line');
		assert.equal(elements[0].counter, 1);
		assert.equal(elements[0].severity, severity.Error);
		assert.equal(elements[1].value, 'second line');
		assert.equal(elements[1].counter, 2);
		assert.equal(elements[1].severity, severity.Warning);

		model.appendReplOutput('1', severity.Error);
		model.appendReplOutput('2', severity.Error);
		model.appendReplOutput('3', severity.Error);
		elements = <debugmodel.ValueOutputElement[]>model.getReplElements();
		assert.equal(elements.length, 4);
		assert.equal(elements[3].value, '123');
		assert.equal(elements[3].severity, severity.Error);

		const keyValueObject = { 'key1': 2, 'key2': 'value' };
		model.logToRepl(keyValueObject);
		const element = <debugmodel.KeyValueOutputElement>model.getReplElements()[4];
		assert.equal(element.value, 'Object');
		assert.deepEqual(element.valueObj, keyValueObject);

		model.removeReplExpressions();
		assert.equal(model.getReplElements().length, 0);
	});
});
