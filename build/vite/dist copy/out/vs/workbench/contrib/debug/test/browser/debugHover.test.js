/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { findExpressionInStackFrame } from '../../browser/debugHover.js';
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
            getCallStack() {
                return [stackFrame];
            }
        }(session, 'mockthread', 1);
        const firstSource = new Source({
            name: 'internalModule.js',
            path: 'a/b/c/d/internalModule.js',
            sourceReference: 10,
        }, 'aDebugSessionId', mockUriIdentityService, new NullLogService());
        const stackFrame = new class extends StackFrame {
            getScopes() {
                return Promise.resolve([scope]);
            }
        }(thread, 1, firstSource, 'app.js', 'normal', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 }, 1, true);
        const scope = new class extends Scope {
            getChildren() {
                return Promise.resolve([variableA]);
            }
        }(stackFrame, 1, 'local', 1, false, 10, 10);
        const variableA = new class extends Variable {
            getChildren() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdIb3Zlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvdGVzdC9icm93c2VyL2RlYnVnSG92ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXpFLE9BQU8sRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNqRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDeEQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLHNCQUFzQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFbkYsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7SUFDM0IsTUFBTSxXQUFXLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUU5RCxJQUFJLENBQUMsZ0NBQWdDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDakQsTUFBTSxLQUFLLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDaEQsTUFBTSxPQUFPLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRTFELE1BQU0sTUFBTSxHQUFHLElBQUksS0FBTSxTQUFRLE1BQU07WUFDdEIsWUFBWTtnQkFDM0IsT0FBTyxDQUFDLFVBQVUs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