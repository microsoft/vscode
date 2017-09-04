/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import { StackFrame, Expression, Thread, Process } from 'vs/workbench/parts/debug/common/debugModel';
import { MockSession } from 'vs/workbench/parts/debug/test/common/mockDebug';

suite('Debug - View Model', () => {
	let model: ViewModel;

	setup(() => {
		model = new ViewModel();
	});

	teardown(() => {
		model = null;
	});

	test('focused stack frame', () => {
		assert.equal(model.focusedStackFrame, null);
		assert.equal(model.focusedThread, null);
		const mockSession = new MockSession();
		const process = new Process({ name: 'mockProcess', type: 'node', request: 'launch' }, mockSession);
		const thread = new Thread(process, 'myThread', 1);
		const frame = new StackFrame(thread, 1, null, 'app.js', 'normal', { startColumn: 1, startLineNumber: 1, endColumn: undefined, endLineNumber: undefined }, 0);
		model.setFocusedStackFrame(frame, process, false);

		assert.equal(model.focusedStackFrame.getId(), frame.getId());
		assert.equal(model.focusedThread.threadId, 1);
		assert.equal(model.focusedProcess.getId(), process.getId());
	});

	test('selected expression', () => {
		assert.equal(model.getSelectedExpression(), null);
		const expression = new Expression('my expression');
		model.setSelectedExpression(expression);

		assert.equal(model.getSelectedExpression(), expression);
	});

	test('multi process view and changed workbench state', () => {
		assert.equal(model.changedWorkbenchViewState, false);
		assert.equal(model.isMultiProcessView(), false);
		model.setMultiProcessView(true);
		assert.equal(model.isMultiProcessView(), true);
	});
});
