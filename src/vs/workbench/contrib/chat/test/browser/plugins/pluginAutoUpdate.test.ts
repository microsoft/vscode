/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { AutoUpdateConfigurationKey } from '../../../../extensions/common/extensions.js';
import { PluginAutoUpdate } from '../../../browser/pluginAutoUpdate.js';
import { IPluginInstallService, IUpdateAllPluginsOptions, IUpdateAllPluginsResult } from '../../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginAutoUpdate', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface MockState {
		hasUpdatesAvailable: ReturnType<typeof observableValue<boolean>>;
		updateAllCalls: IUpdateAllPluginsOptions[];
		updateAllImpl: () => Promise<IUpdateAllPluginsResult>;
		clearUpdatesAvailableCalls: number;
	}

	function createContribution(autoUpdate: unknown, stateOverrides?: Partial<MockState>): { contribution: PluginAutoUpdate; state: MockState } {
		const instantiationService = store.add(new TestInstantiationService());

		const state: MockState = {
			hasUpdatesAvailable: observableValue<boolean>('test.hasUpdatesAvailable', false),
			updateAllCalls: [],
			updateAllImpl: async () => ({ updatedNames: [], failedNames: [] }),
			clearUpdatesAvailableCalls: 0,
			...stateOverrides,
		};

		instantiationService.stub(IPluginMarketplaceService, {
			hasUpdatesAvailable: state.hasUpdatesAvailable,
			clearUpdatesAvailable: () => {
				state.clearUpdatesAvailableCalls++;
				state.hasUpdatesAvailable.set(false, undefined);
			},
		} as Partial<IPluginMarketplaceService> as IPluginMarketplaceService);

		instantiationService.stub(IPluginInstallService, {
			updateAllPlugins: async (options: IUpdateAllPluginsOptions, _token: CancellationToken): Promise<IUpdateAllPluginsResult> => {
				state.updateAllCalls.push(options);
				return state.updateAllImpl();
			},
		} as Partial<IPluginInstallService> as IPluginInstallService);

		const configService = new TestConfigurationService();
		configService.setUserConfiguration(AutoUpdateConfigurationKey, autoUpdate);
		instantiationService.stub(IConfigurationService, configService);

		instantiationService.stub(ILogService, new NullLogService());

		const contribution = store.add(instantiationService.createInstance(PluginAutoUpdate));
		return { contribution, state };
	}

	/** Waits for an in-flight microtask-driven update to settle. */
	function flushMicrotasks(): Promise<void> {
		return new Promise(resolve => queueMicrotask(resolve));
	}

	test('does not trigger update on construction when flag is false', async () => {
		const { state } = createContribution(true);
		await flushMicrotasks();
		assert.deepStrictEqual(state.updateAllCalls, []);
	});

	test('triggers silent updateAllPlugins when hasUpdatesAvailable becomes true', async () => {
		const { state } = createContribution(true);

		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();

		assert.deepStrictEqual(state.updateAllCalls, [{ silent: true }]);
	});

	test('does not trigger update when extensions.autoUpdate is false', async () => {
		const { state } = createContribution(false);

		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();

		assert.deepStrictEqual(state.updateAllCalls, []);
	});

	test('does not trigger update for non-true auto-update values like onlyEnabledExtensions', async () => {
		// Plugins have no per-item opt-in equivalent to extensions, so only
		// `true` (update everything) opts plugins into auto-update.
		for (const value of ['onlyEnabledExtensions', 'onlySelectedExtensions']) {
			const { state } = createContribution(value);

			state.hasUpdatesAvailable.set(true, undefined);
			await flushMicrotasks();

			assert.deepStrictEqual(state.updateAllCalls, [], `expected no update for autoUpdate=${value}`);
		}
	});

	test('does not run a second update concurrently with one in flight', async () => {
		let resolveUpdate!: () => void;
		const pendingUpdate = new Promise<IUpdateAllPluginsResult>(resolve => {
			resolveUpdate = () => resolve({ updatedNames: [], failedNames: [] });
		});
		const { state } = createContribution(true, {
			updateAllImpl: () => pendingUpdate,
		});

		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();
		// While the first update is still pending, simulate a redundant signal
		// (e.g. another periodic check firing). Observable de-dupes equal
		// values, so toggle false→true to force the autorun to re-run.
		state.hasUpdatesAvailable.set(false, undefined);
		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 1, 'should not start a second concurrent update');

		resolveUpdate();
		await pendingUpdate;
	});

	test('continues running on subsequent cycles after the previous update finished', async () => {
		const { state } = createContribution(true);

		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();
		assert.strictEqual(state.updateAllCalls.length, 1);

		// Simulate `updateAllPlugins` clearing the flag, then the next
		// periodic check finding updates again.
		state.hasUpdatesAvailable.set(false, undefined);
		await flushMicrotasks();
		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 2);
	});

	test('swallows errors from updateAllPlugins', async () => {
		const { state } = createContribution(true, {
			updateAllImpl: async () => { throw new Error('boom'); },
		});

		state.hasUpdatesAvailable.set(true, undefined);
		// Wait long enough for the rejected promise to settle.
		await flushMicrotasks();
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 1);
		// A subsequent cycle should still work after the failure.
		state.hasUpdatesAvailable.set(false, undefined);
		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();
		await flushMicrotasks();
		assert.strictEqual(state.updateAllCalls.length, 2);
	});

	test('clears the flag after an update so partial failures can re-arm', async () => {
		// Simulate the install service NOT clearing the flag (partial failure
		// path in `PluginInstallService.updateAllPlugins`). Without our own
		// clear in `finally`, the observable would stay stuck at `true` and
		// the next periodic check's `set(true)` would not notify subscribers.
		const { state } = createContribution(true, {
			updateAllImpl: async () => ({ updatedNames: [], failedNames: ['plugin-a'] }),
		});

		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();
		await flushMicrotasks();

		assert.strictEqual(state.updateAllCalls.length, 1);
		assert.strictEqual(state.clearUpdatesAvailableCalls, 1);
		assert.strictEqual(state.hasUpdatesAvailable.get(), false);

		// The next periodic check finds updates again; the cleared flag lets
		// the autorun re-fire via a clean `false → true` transition.
		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();
		await flushMicrotasks();
		assert.strictEqual(state.updateAllCalls.length, 2);
	});

	test('clears the flag even when updateAllPlugins throws', async () => {
		const { state } = createContribution(true, {
			updateAllImpl: async () => { throw new Error('boom'); },
		});

		state.hasUpdatesAvailable.set(true, undefined);
		await flushMicrotasks();
		await flushMicrotasks();

		assert.strictEqual(state.clearUpdatesAvailableCalls, 1);
		assert.strictEqual(state.hasUpdatesAvailable.get(), false);
	});
});
