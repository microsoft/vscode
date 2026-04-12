/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mockObject, upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { DebugModel, ExceptionBreakpoint, FunctionBreakpoint } from '../../common/debugModel.js';
import { MockDebugStorage } from './mockDebug.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
suite('DebugModel', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('FunctionBreakpoint', () => {
        test('Id is saved', () => {
            const fbp = new FunctionBreakpoint({ name: 'function', enabled: true, hitCondition: 'hit condition', condition: 'condition', logMessage: 'log message' });
            const strigified = JSON.stringify(fbp);
            const parsed = JSON.parse(strigified);
            assert.equal(parsed.id, fbp.getId());
        });
    });
    suite('ExceptionBreakpoint', () => {
        test('Restored matches new', () => {
            const ebp = new ExceptionBreakpoint({
                conditionDescription: 'condition description',
                description: 'description',
                filter: 'condition',
                label: 'label',
                supportsCondition: true,
                enabled: true,
            }, 'id');
            const strigified = JSON.stringify(ebp);
            const parsed = JSON.parse(strigified);
            const newEbp = new ExceptionBreakpoint(parsed);
            assert.ok(ebp.matches(newEbp));
        });
    });
    suite('DebugModel', () => {
        test('refreshTopOfCallstack resolves all returned promises when called multiple times', async () => {
            return runWithFakedTimers({}, async () => {
                const topFrameDeferred = new DeferredPromise();
                const wholeStackDeferred = new DeferredPromise();
                const fakeThread = mockObject()({
                    session: upcastDeepPartial({ capabilities: { supportsDelayedStackTraceLoading: true } }),
                    getCallStack: () => [],
                    getStaleCallStack: () => [],
                });
                fakeThread.fetchCallStack.callsFake((levels) => {
                    return levels === 1 ? topFrameDeferred.p : wholeStackDeferred.p;
                });
                fakeThread.getId.returns(1);
                const disposable = new DisposableStore();
                const storage = disposable.add(new TestStorageService());
                const model = new DebugModel(disposable.add(new MockDebugStorage(storage)), upcastPartial({ isDirty: (e) => false }), undefined, new NullLogService());
                disposable.add(model);
                let top1Resolved = false;
                let whole1Resolved = false;
                let top2Resolved = false;
                let whole2Resolved = false;
                // eslint-disable-next-line local/code-no-any-casts
                const result1 = model.refreshTopOfCallstack(fakeThread);
                result1.topCallStack.then(() => top1Resolved = true);
                result1.wholeCallStack.then(() => whole1Resolved = true);
                // eslint-disable-next-line local/code-no-any-casts
                const result2 = model.refreshTopOfCallstack(fakeThread);
                result2.topCallStack.then(() => top2Resolved = true);
                result2.wholeCallStack.then(() => whole2Resolved = true);
                assert.ok(!top1Resolved);
                assert.ok(!whole1Resolved);
                assert.ok(!top2Resolved);
                assert.ok(!whole2Resolved);
                await topFrameDeferred.complete();
                await result1.topCallStack;
                await result2.topCallStack;
                assert.ok(!whole1Resolved);
                assert.ok(!whole2Resolved);
                await wholeStackDeferred.complete();
                await result1.wholeCallStack;
                await result2.wholeCallStack;
                disposable.dispose();
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvdGVzdC9jb21tb24vZGVidWdNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkcsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXRGLE9BQU8sRUFBRSxVQUFVLEVBQUUsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQVUsTUFBTSw0QkFBNEIsQ0FBQztBQUN6RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNsRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUU1RixLQUFLLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtJQUN4Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7UUFDaEMsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7WUFDeEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxZQUFZLEVB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