/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { WillShutdownJoinerOrder } from '../../common/lifecycle.js';
import { NativeLifecycleService } from '../../electron-browser/lifecycleService.js';
import { workbenchInstantiationService } from '../../../../test/electron-browser/workbenchTestServices.js';
suite('Lifecycleservice', function () {
    let lifecycleService;
    const disposables = new DisposableStore();
    class TestLifecycleService extends NativeLifecycleService {
        testHandleBeforeShutdown(reason) {
            return super.handleBeforeShutdown(reason);
        }
        testHandleWillShutdown(reason) {
            return super.handleWillShutdown(reason);
        }
    }
    setup(async () => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        lifecycleService = disposables.add(instantiationService.createInstance(TestLifecycleService));
    });
    teardown(async () => {
        disposables.clear();
    });
    test('onBeforeShutdown - final veto called after other vetos', async function () {
        let vetoCalled = false;
        let finalVetoCalled = false;
        const order = [];
        disposables.add(lifecycleService.onBeforeShutdown(e => {
            e.veto(new Promise(resolve => {
                vetoCalled = true;
                order.push(1);
                resolve(false);
            }), 'test');
        }));
        disposables.add(lifecycleService.onBeforeShutdown(e => {
            e.finalVeto(() => {
                return new Promise(resolve => {
                    finalVetoCalled = true;
                    order.push(2);
                    resolve(true);
                });
            }, 'test');
        }));
        const veto = await lifecycleService.testHandleBeforeShutdown(2 /* ShutdownReason.QUIT */);
        assert.strictEqual(veto, true);
        assert.strictEqual(vetoCalled, true);
        assert.strictEqual(finalVetoCalled, true);
        assert.strictEqual(order[0], 1);
        assert.strictEqual(order[1], 2);
    });
    test('onBeforeShutdown - final veto not called when veto happened before', async function () {
        let vetoCalled = false;
        let finalVetoCalled = false;
        disposables.add(lifecycleService.onBeforeShutdown(e => {
            e.veto(new Promise(resolve => {
                vetoCalled = true;
                resolve(true);
            }), 'test');
        }));
        disposables.add(lifecycleService.onBeforeShutdown(e => {
            e.finalVeto(() => {
                return new Promise(resolve => {
                    finalVetoCalled = true;
                    resolve(true);
                });
            }, 'test');
        }));
        const veto = await lifecycleService.testHandleBeforeShutdown(2 /* ShutdownReason.QUIT */);
        assert.strictEqual(veto, true);
        assert.strictEqual(vetoCalled, true);
        assert.strictEqual(finalVetoCalled, false);
    });
    test('onBeforeShutdown - veto with error is treated as veto', async function () {
        disposables.add(lifecycleService.onBeforeShutdown(e => {
            e.veto(new Promise((resolve, reject) => {
                reject(new Error('Fail'));
            }), 'test');
        }));
        const veto = await lifecycleService.testHandleBeforeShutdown(2 /* ShutdownReason.QUIT */);
        assert.strictEqual(veto, true);
    });
    test('onBeforeShutdown - final veto with error is treated as veto', async function () {
        disposables.add(lifecycleService.onBeforeShutdown(e => {
            e.finalVeto(() => new Promise((resolve, reject) => {
                reject(new Error('Fail'));
            }), 'test');
        }));
        const veto = await lifecycleService.testHandleBeforeShutdown(2 /* ShutdownReason.QUIT */);
        assert.strictEqual(veto, true);
    });
    test('onWillShutdown - join', async function () {
        let joinCalled = false;
        disposables.add(lifecycleService.onWillShutdown(e => {
            e.join(new Promise(resolve => {
                joinCalled = true;
                resolve();
            }), { id: 'test', label: 'test' });
        }));
        await lifecycleService.testHandleWillShutdown(2 /* ShutdownReason.QUIT */);
        assert.strictEqual(joinCalled, true);
    });
    test('onWillShutdown - join with error is handled', async function () {
        let joinCalled = false;
        disposables.add(lifecycleService.onWillShutdown(e => {
            e.join(new Promise((resolve, reject) => {
                joinCalled = true;
                reject(new Error('Fail'));
            }), { id: 'test', label: 'test' });
        }));
        await lifecycleService.testHandleWillShutdown(2 /* ShutdownReason.QUIT */);
        assert.strictEqual(joinCalled, true);
    });
    test('onWillShutdown - join order', async function () {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const order = [];
            disposables.add(lifecycleService.onWillShutdown(e => {
                e.join(async () => {
                    order.push('disconnect start');
                    await timeout(1);
                    order.push('disconnect end');
                }, { id: 'test', label: 'test', order: WillShutdownJoinerOrder.Last });
                e.join((async () => {
                    order.push('default start');
                    await timeout(1);
                    order.push('default end');
                })(), { id: 'test', label: 'test', order: WillShutdownJoinerOrder.Default });
            }));
            await lifecycleService.testHandleWillShutdown(2 /* ShutdownReason.QUIT */);
            assert.deepStrictEqual(order, [
                'default start',
                'default end',
                'disconnect start',
                'disconnect end'
            ]);
        });
    });
    test('willShutdown is set when shutting down', async function () {
        let willShutdownSet = false;
        disposables.add(lifecycleService.onWillShutdown(e => {
            e.join(new Promise(resolve => {
                if (lifecycleService.willShutdown) {
                    willShutdownSet = true;
                    resolve();
                }
            }), { id: 'test', label: 'test' });
        }));
        await lifecycleService.testHandleWillShutdown(2 /* ShutdownReason.QUIT */);
        assert.strictEqual(willShutdownSet, true);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlmZWN5Y2xlU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2xpZmVjeWNsZS90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvbGlmZWN5Y2xlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBa0IsdUJBQXVCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNwRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUUzRyxLQUFLLENBQUMsa0JBQWtCLEVBQUU7SUFFekIsSUFBSSxnQkFBc0MsQ0FBQztJQUMzQyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBRTFDLE1BQU0sb0JBQXFCLFNBQVEsc0JBQXNCO1FBRXhELHdCQUF3QixDQUFDLE1BQXNCO1lBQzlDLE9BQU8sS0FBSyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzNDLENBQUM7UUFFRCxzQkFBc0IsQ0FBQyxNQUFzQjtZQUM1QyxPQUFPLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6QyxDQUFDO0tBQ0Q7SUFFRCxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFD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