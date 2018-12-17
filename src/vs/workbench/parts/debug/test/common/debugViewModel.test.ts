/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import { StackFrame, Expression, Thread } from 'vs/workbench/parts/debug/common/debugModel';
import { MockSession } from 'vs/workbench/parts/debug/test/common/mockDebug';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';

suite('Debug - View Model', () => {
	let model: ViewModel;

	setup(() => {
		model = new ViewModel(new MockContextKeyService());
	});

	teardown(() => {
		model = null;
	});

	test('focused stack frame', () => {
		assert.equal(model.focusedStackFrame, null);
		assert.equal(model.focusedThread, null);
		const session = new MockSession();
		const thread = new Thread(session, 'myThread', 1);
		const frame = new StackFrame(thread, 1, null, 'app.js', 'normal', { startColumn: 1, startLineNumber: 1, endColumn: undefined, endLineNumber: undefined }, 0);
		model.setFocus(frame, thread, session, false);

		assert.equal(model.focusedStackFrame.getId(), frame.getId());
		assert.equal(model.focusedThread.threadId, 1);
		assert.equal(model.focusedSession.getId(), session.getId());
	});

	test('selected expression', () => {
		assert.equal(model.getSelectedExpression(), null);
		const expression = new Expression('my expression');
		model.setSelectedExpression(expression);

		assert.equal(model.getSelectedExpression(), expression);
	});

	test('multi session view and changed workbench state', () => {
		assert.equal(model.isMultiSessionView(), false);
		model.setMultiSessionView(true);
		assert.equal(model.isMultiSessionView(), true);
	});
});
