/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import { StackFrame, Expression, Thread } from 'vs/workbench/parts/debug/common/debugModel';
import { MockRawSession } from 'vs/workbench/parts/debug/test/common/mockDebugService';

suite('Debug - View Model', () => {
	var model: ViewModel;

	setup(() => {
		model = new ViewModel();
	});

	teardown(() => {
		model = null;
	});

	test('focused stack frame', () => {
		assert.equal(model.getFocusedStackFrame(), null);
		assert.equal(model.getFocusedThread(), null);
		const rawSession = new MockRawSession;
		const frame = new StackFrame(rawSession, 1, 1, null, 'app.js', 1, 1);
		model.setFocusedStackFrame(frame, new Thread(rawSession, 'myThread', 1), null);

		assert.equal(model.getFocusedStackFrame(), frame);
		assert.equal(model.getFocusedThread().threadId, 1);
	});

	test('selected expression', () => {
		assert.equal(model.getSelectedExpression(), null);
		const expression = new Expression('my expression', false);
		model.setSelectedExpression(expression);

		assert.equal(model.getSelectedExpression(), expression);
	});
});
