/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import { StackFrame, Expression, Thread, Process } from 'vs/workbench/parts/debug/common/debugModel';
import { MockSession } from 'vs/workbench/parts/debug/test/common/mockDebug';

suite('Debug - View Model', () => {
	var model: ViewModel;

	setup(() => {
		model = new ViewModel('mockconfiguration');
	});

	teardown(() => {
		model = null;
	});

	test('focused stack frame', () => {
		assert.equal(model.focusedStackFrame, null);
		assert.equal(model.focusedThread, null);
		const mockSession = new MockSession();
		const process = new Process('mockProcess', mockSession);
		const thread = new Thread(process, 'myThread', 1);
		const frame = new StackFrame(thread, 1, null, 'app.js', 1, 1);
		model.setFocusedStackFrame(frame, process);

		assert.equal(model.focusedStackFrame, frame);
		assert.equal(model.focusedThread.threadId, 1);
	});

	test('selected expression', () => {
		assert.equal(model.getSelectedExpression(), null);
		const expression = new Expression('my expression');
		model.setSelectedExpression(expression);

		assert.equal(model.getSelectedExpression(), expression);
	});
});
