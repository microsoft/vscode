/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { CONTEXT_THREAD_HAS_MULTIPLE_STACK_FRAMES } from '../../common/debug.js';
import { Expression, StackFrame, Thread } from '../../common/debugModel.js';
import { Source } from '../../common/debugSource.js';
import { ViewModel } from '../../common/debugViewModel.js';
import { mockUriIdentityService } from './mockDebugModel.js';
import { MockSession } from '../common/mockDebug.js';

suite('Debug - View Model', () => {
	let model: ViewModel;
	let contextKeyService: MockContextKeyService;

	setup(() => {
		contextKeyService = new MockContextKeyService();
		model = new ViewModel(contextKeyService);
	});

	teardown(() => {
		model.dispose();
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('focused stack frame', () => {
		assert.strictEqual(model.focusedStackFrame, undefined);
		assert.strictEqual(model.focusedThread, undefined);
		const session = new MockSession();
		const thread = new Thread(session, 'myThread', 1);
		const source = new Source({
			name: 'internalModule.js',
			sourceReference: 11,
			presentationHint: 'deemphasize'
		}, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
		const frame = new StackFrame(thread, 1, source, 'app.js', 'normal', { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, 0, true);
		model.setFocus(frame, thread, session, false);

		assert.strictEqual(model.focusedStackFrame!.getId(), frame.getId());
		assert.strictEqual(model.focusedThread!.threadId, 1);
		assert.strictEqual(model.focusedSession!.getId(), session.getId());
	});

	test('selected expression', () => {
		assert.strictEqual(model.getSelectedExpression(), undefined);
		const expression = new Expression('my expression');
		model.setSelectedExpression(expression, false);

		assert.strictEqual(model.getSelectedExpression()?.expression, expression);
	});

	test('focused thread stack depth refreshes without changing focus', () => {
		const session = new MockSession();
		const thread = new Thread(session, 'myThread', 1);
		thread.stoppedDetails = { totalFrames: 2 };
		model.setFocus(undefined, thread, session, false);

		let focusEventCount = 0;
		disposables.add(model.onDidFocusThread(() => focusEventCount++));
		disposables.add(model.onDidFocusStackFrame(() => focusEventCount++));
		disposables.add(model.onDidFocusSession(() => focusEventCount++));

		const stackDepth = () => contextKeyService.getContextKeyValue(CONTEXT_THREAD_HAS_MULTIPLE_STACK_FRAMES.key);
		const states = [stackDepth()];
		thread.stoppedDetails.totalFrames = 1;
		model.updateFocusedThreadHasMultipleStackFrames();
		states.push(stackDepth());
		thread.stoppedDetails.totalFrames = 2;
		model.updateFocusedThreadHasMultipleStackFrames();
		states.push(stackDepth());

		assert.deepStrictEqual({ states, focusEventCount, focusedThread: model.focusedThread }, {
			states: [true, false, true],
			focusEventCount: 0,
			focusedThread: thread
		});
	});

	test('focused thread stack depth refreshes when an unknown stack becomes complete', () => {
		const session = new MockSession();
		const thread = new Thread(session, 'myThread', 1);
		const source = new Source({ name: 'app.js', sourceReference: 1 }, session.getId(), mockUriIdentityService, new NullLogService());
		thread.getCallStack().push(new StackFrame(thread, 1, source, 'app.js', 'normal', { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, 0, true));
		model.setFocus(undefined, thread, session, false);

		const stackDepth = () => contextKeyService.getContextKeyValue(CONTEXT_THREAD_HAS_MULTIPLE_STACK_FRAMES.key);
		const states = [stackDepth()];
		thread.reachedEndOfCallStack = true;
		model.updateFocusedThreadHasMultipleStackFrames();
		states.push(stackDepth());

		assert.deepStrictEqual(states, [true, false]);
	});

	test('focused thread stack depth follows focus changes and resets when focus clears', () => {
		const session = new MockSession();
		const firstThread = new Thread(session, 'firstThread', 1);
		firstThread.stoppedDetails = { totalFrames: 1 };
		const secondThread = new Thread(session, 'secondThread', 2);
		secondThread.stoppedDetails = { totalFrames: 2 };

		const stackDepth = () => contextKeyService.getContextKeyValue(CONTEXT_THREAD_HAS_MULTIPLE_STACK_FRAMES.key);
		const states = [stackDepth()];
		model.setFocus(undefined, firstThread, session, false);
		states.push(stackDepth());
		model.setFocus(undefined, secondThread, session, false);
		states.push(stackDepth());
		firstThread.stoppedDetails.totalFrames = 2;
		secondThread.stoppedDetails.totalFrames = 1;
		model.updateFocusedThreadHasMultipleStackFrames();
		states.push(stackDepth());
		model.setFocus(undefined, undefined, undefined, false);
		states.push(stackDepth());
		secondThread.stoppedDetails.totalFrames = 2;
		model.updateFocusedThreadHasMultipleStackFrames();
		states.push(stackDepth());

		assert.deepStrictEqual(states, [false, false, true, false, false, false]);
	});

	test('multi session view and changed workbench state', () => {
		assert.strictEqual(model.isMultiSessionView(), false);
		model.setMultiSessionView(true);
		assert.strictEqual(model.isMultiSessionView(), true);
	});
});
