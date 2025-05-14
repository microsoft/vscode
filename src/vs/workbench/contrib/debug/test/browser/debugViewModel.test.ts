/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Expression, StackFrame, Thread } from '../../common/debugModel.js';
import { Source } from '../../common/debugSource.js';
import { ViewModel } from '../../common/debugViewModel.js';
import { mockUriIdentityService } from './mockDebugModel.js';
import { MockSession } from '../common/mockDebug.js';

suite('Debug - View Model', () => {
	let model: ViewModel;

	setup(() => {
		model = new ViewModel(new MockContextKeyService());
	});

	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('multi session view and changed workbench state', () => {
		assert.strictEqual(model.isMultiSessionView(), false);
		model.setMultiSessionView(true);
		assert.strictEqual(model.isMultiSessionView(), true);
	});
});
