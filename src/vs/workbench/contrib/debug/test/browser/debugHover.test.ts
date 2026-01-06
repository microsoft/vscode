/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { findExpressionInStackFrame } from '../../browser/debugHover.js';
import type { IExpression, IScope } from '../../common/debug.js';
import { Scope, StackFrame, Thread, Variable } from '../../common/debugModel.js';
import { Source } from '../../common/debugSource.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel, mockUriIdentityService } from './mockDebugModel.js';

suite('Debug - Hover', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('find expression in stack frame', async () => {
		const model = createMockDebugModel(disposables);
		const session = disposables.add(createTestSession(model));

		const thread = new class extends Thread {
			public override getCallStack(): StackFrame[] {
				return [stackFrame];
			}
		}(session, 'mockthread', 1);

		const firstSource = new Source({
			name: 'internalModule.js',
			path: 'a/b/c/d/internalModule.js',
			sourceReference: 10,
		}, 'aDebugSessionId', mockUriIdentityService, new NullLogService());

		const stackFrame = new class extends StackFrame {
			override getScopes(): Promise<IScope[]> {
				return Promise.resolve([scope]);
			}
		}(thread, 1, firstSource, 'app.js', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1, true);


		const scope = new class extends Scope {
			override getChildren(): Promise<IExpression[]> {
				return Promise.resolve([variableA]);
			}
		}(stackFrame, 1, 'local', 1, false, 10, 10);

		const variableA = new class extends Variable {
			override getChildren(): Promise<IExpression[]> {
				return Promise.resolve([variableB]);
			}
		}(session, 1, scope, 2, 'A', 'A', undefined, 0, 0, undefined, {}, 'string');
		const variableB = new Variable(session, 1, scope, 2, 'B', 'A.B', undefined, 0, 0, undefined, {}, 'string');

		assert.strictEqual(await findExpressionInStackFrame(stackFrame, []), undefined);
		assert.strictEqual(await findExpressionInStackFrame(stackFrame, ['A']), variableA);
		assert.strictEqual(await findExpressionInStackFrame(stackFrame, ['doesNotExist', 'no']), undefined);
		assert.strictEqual(await findExpressionInStackFrame(stackFrame, ['a']), undefined);
		assert.strictEqual(await findExpressionInStackFrame(stackFrame, ['B']), undefined);
		assert.strictEqual(await findExpressionInStackFrame(stackFrame, ['A', 'B']), variableB);
		assert.strictEqual(await findExpressionInStackFrame(stackFrame, ['A', 'C']), undefined);

		// We do not search in expensive scopes
		scope.expensive = true;
		assert.strictEqual(await findExpressionInStackFrame(stackFrame, ['A']), undefined);
	});
});
