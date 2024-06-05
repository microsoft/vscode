/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { NativeLifecycleService } from 'vs/workbench/services/lifecycle/electron-sandbox/lifecycleService';
import { workbenchInstantiationService } from 'vs/workbench/test/electron-sandbox/workbenchTestServices';

suite('Lifecycleservice', function () {

	let lifecycleService: TestLifecycleService;
	const disposables = new DisposableStore();

	class TestLifecycleService extends NativeLifecycleService {

		testHandleBeforeShutdown(reason: ShutdownReason): Promise<boolean> {
			return super.handleBeforeShutdown(reason);
		}

		testHandleWillShutdown(reason: ShutdownReason): Promise<void> {
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

		const order: number[] = [];

		disposables.add(lifecycleService.onBeforeShutdown(e => {
			e.veto(new Promise<boolean>(resolve => {
				vetoCalled = true;
				order.push(1);

				resolve(false);
			}), 'test');
		}));

		disposables.add(lifecycleService.onBeforeShutdown(e => {
			e.finalVeto(() => {
				return new Promise<boolean>(resolve => {
					finalVetoCalled = true;
					order.push(2);

					resolve(true);
				});
			}, 'test');
		}));

		const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);

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
			e.veto(new Promise<boolean>(resolve => {
				vetoCalled = true;

				resolve(true);
			}), 'test');
		}));

		disposables.add(lifecycleService.onBeforeShutdown(e => {
			e.finalVeto(() => {
				return new Promise<boolean>(resolve => {
					finalVetoCalled = true;

					resolve(true);
				});
			}, 'test');
		}));

		const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);

		assert.strictEqual(veto, true);
		assert.strictEqual(vetoCalled, true);
		assert.strictEqual(finalVetoCalled, false);
	});

	test('onBeforeShutdown - veto with error is treated as veto', async function () {
		disposables.add(lifecycleService.onBeforeShutdown(e => {
			e.veto(new Promise<boolean>((resolve, reject) => {
				reject(new Error('Fail'));
			}), 'test');
		}));

		const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);

		assert.strictEqual(veto, true);
	});

	test('onBeforeShutdown - final veto with error is treated as veto', async function () {
		disposables.add(lifecycleService.onBeforeShutdown(e => {
			e.finalVeto(() => new Promise<boolean>((resolve, reject) => {
				reject(new Error('Fail'));
			}), 'test');
		}));

		const veto = await lifecycleService.testHandleBeforeShutdown(ShutdownReason.QUIT);

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

		await lifecycleService.testHandleWillShutdown(ShutdownReason.QUIT);

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

		await lifecycleService.testHandleWillShutdown(ShutdownReason.QUIT);

		assert.strictEqual(joinCalled, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
