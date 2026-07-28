/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { PluginAutoUpdate } from '../../../browser/pluginAutoUpdate.js';
import { IPluginInstallService, IUpdateAllPluginsOptions, IUpdateAllPluginsResult } from '../../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginAutoUpdate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface MockState {
		marketplacesWithUpdates: ReturnType<typeof observableValue<ReadonlySet<string>>>;
		updateAllCalls: IUpdateAllPluginsOptions[];
		updateAllImpl: () => Promise<IUpdateAllPluginsResult>;
		clearUpdatesAvailableCalls: ReadonlySet<string>[];
	}

	function createContribution(stateOverrides?: Partial<MockState>): { contribution: PluginAutoUpdate; state: MockState } {
		const instantiationService = store.add(new TestInstantiationService());

		const state: MockState = {
			marketplacesWithUpdates: observableValue<ReadonlySet<string>>('test.marketplacesWithUpdates', new Set()),
			updateAllCalls: [],
			updateAllImpl: async () => ({ updatedNames: [], failedNames: [] }),
			clearUpdatesAvailableCalls: [],
			...stateOverrides,
		};

		instantiationService.stub(IPluginMarketplaceService, {
			marketplacesWithUpdates: state.marketplacesWithUpdates,
			clearUpdatesAvailable: marketplaceIds => {
				state.clearUpdatesAvailableCalls.push(marketplaceIds ?? new Set());
				const remaining = new Set([...state.marketplacesWithUpdates.get()].filter(id => !marketplaceIds?.has(id)));
				state.marketplacesWithUpdates.set(remaining, undefined);
			},
		} as Partial<IPluginMarketplaceService> as IPluginMarketplaceService);

		instantiationService.stub(IPluginInstallService, {
			updateAllPlugins: async (options: IUpdateAllPluginsOptions, _token: CancellationToken): Promise<IUpdateAllPluginsResult> => {
				state.updateAllCalls.push(options);
				return state.updateAllImpl();
			},
		} as Partial<IPluginInstallService> as IPluginInstallService);

		instantiationService.stub(ILogService, new NullLogService());

		const contribution = store.add(instantiationService.createInstance(PluginAutoUpdate));
		return { contribution, state };
	}

	/** Waits for an in-flight microtask-driven update to settle. */
	function flushMicrotasks(): Promise<void> {
		return new Promise(resolve => queueMicrotask(resolve));
	}

	test('does not trigger update on construction', async () => {
		const { state } = createContribution();
		await flushMicrotasks();
		assert.deepStrictEqual(state.updateAllCalls, []);
	});

	test('triggers a targeted silent update when a marketplace reports updates', async () => {
		const { state } = createContribution();

		state.marketplacesWithUpdates.set(new Set(['github:microsoft/plugins']), undefined);
		await flushMicrotasks();

		assert.deepStrictEqual(state.updateAllCalls.map(call => ({
			silent: call.silent,
			automatic: call.automatic,
			marketplaceIds: [...call.marketplaceIds ?? []],
		})), [{ silent: true, automatic: true, marketplaceIds: ['github:microsoft/plugins'] }]);
	});

	test('queues a marketplace reported while another update is in flight', async () => {
		let resolveUpdate!: () => void;
		const pendingUpdate = new Promise<IUpdateAllPluginsResult>(resolve => {
			resolveUpdate = () => resolve({ updatedNames: [], failedNames: [] });
		});
		let updateCount = 0;
		const { state } = createContribution({
			updateAllImpl: () => updateCount++ === 0 ? pendingUpdate : Promise.resolve({ updatedNames: [], failedNames: [] }),
		});

		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		await flushMicrotasks();
		state.marketplacesWithUpdates.set(new Set(['a', 'b']), undefined);
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 1, 'should not start a second concurrent update');

		resolveUpdate();
		await pendingUpdate;
		await flushMicrotasks();
		await flushMicrotasks();
		assert.deepStrictEqual(state.updateAllCalls.map(call => [...call.marketplaceIds ?? []]), [['a'], ['b']]);
	});

	test('continues running on subsequent cycles after the previous update finished', async () => {
		const { state } = createContribution();

		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		await flushMicrotasks();
		assert.strictEqual(state.updateAllCalls.length, 1);

		// Simulate `updateAllPlugins` clearing the flag, then the next
		// periodic check finding updates again.
		state.marketplacesWithUpdates.set(new Set(), undefined);
		await flushMicrotasks();
		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 2);
	});

	test('swallows errors from updateAllPlugins', async () => {
		const { state } = createContribution({
			updateAllImpl: async () => { throw new Error('boom'); },
		});

		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		// Wait long enough for the rejected promise to settle.
		await flushMicrotasks();
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 1);
		// A subsequent cycle should still work after the failure.
		state.marketplacesWithUpdates.set(new Set(), undefined);
		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		await flushMicrotasks();
		await flushMicrotasks();
		assert.strictEqual(state.updateAllCalls.length, 2);
	});

	test('clears the flag after an update so partial failures can re-arm', async () => {
		// Simulate the install service NOT clearing the flag (partial failure
		// path in `PluginInstallService.updateAllPlugins`). Without our own
		// clear in `finally`, the observable would stay stuck at `true` and
		// the next periodic check's `set(true)` would not notify subscribers.
		const { state } = createContribution({
			updateAllImpl: async () => ({ updatedNames: [], failedNames: ['plugin-a'] }),
		});

		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		await flushMicrotasks();
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 1);
		assert.strictEqual(state.clearUpdatesAvailableCalls.length, 1);
		assert.deepStrictEqual([...state.clearUpdatesAvailableCalls[0]], ['a']);
		assert.strictEqual(state.marketplacesWithUpdates.get().size, 0);

		// The next periodic check finds updates again; the cleared flag lets
		// the autorun re-fire via a clean `false → true` transition.
		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		await flushMicrotasks();
		await flushMicrotasks();
		assert.strictEqual(state.updateAllCalls.length, 2);
	});

	test('clears the flag even when updateAllPlugins throws', async () => {
		const { state } = createContribution({
			updateAllImpl: async () => { throw new Error('boom'); },
		});

		state.marketplacesWithUpdates.set(new Set(['a']), undefined);
		await flushMicrotasks();
		await flushMicrotasks();

		assert.strictEqual(state.clearUpdatesAvailableCalls.length, 1);
		assert.strictEqual(state.marketplacesWithUpdates.get().size, 0);
	});
});
