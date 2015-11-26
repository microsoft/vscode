/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import { StackFrame, Expression } from 'vs/workbench/parts/debug/common/debugModel';

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
		assert.equal(model.getFocusedThreadId(), 0);
		const frame = new StackFrame(1, 1, null, 'app.js', 1, 1);
		model.setFocusedStackFrame(frame);

		assert.equal(model.getFocusedStackFrame(), frame);
		assert.equal(model.getFocusedThreadId(), 1);
	});

	test('selected expression', () => {
		assert.equal(model.getSelectedExpression(), null);
		const expression = new Expression('my expression', false);
		model.setSelectedExpression(expression);

		assert.equal(model.getSelectedExpression(), expression);
	});
});
