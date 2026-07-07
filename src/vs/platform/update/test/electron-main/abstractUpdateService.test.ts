/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationValue } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentMainService } from '../../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import { IMeteredConnectionService } from '../../../meteredConnection/common/meteredConnection.js';
import { IProductService } from '../../../product/common/productService.js';
import { IRequestService } from '../../../request/common/request.js';
import { IApplicationStorageMainService } from '../../../storage/electron-main/storageMainService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { DisablementReason, State, StateType } from '../../common/update.js';
import { AbstractUpdateService, IUpdateURLOptions } from '../../electron-main/abstractUpdateService.js';

class TestUpdateService extends AbstractUpdateService {

	private readonly _initialized = new DeferredPromise<void>();
	get whenInitialized(): Promise<void> { return this._initialized.p; }

	private _checkCount = 0;
	get checkCount(): number { return this._checkCount; }

	private _cancelCount = 0;
	get cancelCount(): number { return this._cancelCount; }

	/** When set, `cancelUpdate` blocks on this promise so tests can observe the transient Cancelling state. */
	private _cancelGate: Promise<void> | undefined;
	blockCancelUpdate(gate: Promise<void>): void { this._cancelGate = gate; }

	/** Forces the service into a given state so tests can exercise cancellation from a cancellable state. */
	forceState(state: State): void { this.setState(state); }

	feedUrl: string | undefined = 'https://update.example/feed';

	protected override async initialize(): Promise<void> {
		try {
			await super.initialize();
		} finally {
			this._initialized.complete();
		}
	}

	protected buildUpdateFeedUrl(_quality: string, _commit: string, _options?: IUpdateURLOptions): string | undefined {
		return this.feedUrl;
	}

	protected doCheckForUpdates(): void {
		this._checkCount++;
	}

	protected override async cancelUpdate(): Promise<void> {
		this._cancelCount++;
		if (this._cancelGate) {
			await this._cancelGate;
		}
		await super.cancelUpdate();
	}
}

suite('AbstractUpdateService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class PolicyTestConfigurationService extends TestConfigurationService {
		policyValue: string | undefined;

		override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
			// Mirror the real configuration service: a policy value overrides the user setting.
			if (arg1 === 'update.mode' && this.policyValue !== undefined) {
				return this.policyValue as T;
			}
			return super.getValue<T>(arg1, arg2);
		}

		override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
			const result = super.inspect<T>(key, overrides);
			if (key === 'update.mode') {
				return { ...result, policyValue: this.policyValue as T };
			}
			return result;
		}
	}

	let configurationService: PolicyTestConfigurationService;

	function createService(mode: string, options?: { isBuilt?: boolean; disableUpdates?: boolean; updateUrl?: string }): TestUpdateService {
		configurationService = new PolicyTestConfigurationService();
		configurationService.setUserConfiguration('update.mode', mode);

		const lifecycleMainService = {
			when: () => Promise.resolve(),
			setRelaunchHandler: () => { },
			quit: () => Promise.resolve(false),
			onWillShutdown: Event.None
		} as unknown as ILifecycleMainService;

		const environmentMainService = {
			isBuilt: options?.isBuilt ?? true,
			disableUpdates: options?.disableUpdates ?? false
		} as unknown as IEnvironmentMainService;

		const requestService = {
			request: () => Promise.reject(new Error('not expected'))
		} as unknown as IRequestService;

		const productService = {
			updateUrl: options?.updateUrl ?? 'https://update.example',
			commit: 'abc123',
			quality: 'stable',
			version: '1.0.0',
			target: 'user'
		} as unknown as IProductService;

		const applicationStorageMainService = {
			whenReady: Promise.resolve(),
			get: () => undefined,
			store: () => { }
		} as unknown as IApplicationStorageMainService;

		const meteredConnectionService = { isConnectionMetered: false } as unknown as IMeteredConnectionService;

		const service = new TestUpdateService(
			lifecycleMainService,
			configurationService,
			environmentMainService,
			requestService,
			store.add(new NullLogService()),
			productService,
			NullTelemetryService,
			applicationStorageMainService,
			meteredConnectionService,
			false
		);

		return store.add(service);
	}

	function changeMode(service: TestUpdateService, mode: string): Promise<unknown> {
		configurationService.setUserConfiguration('update.mode', mode);
		const next = Event.toPromise(service.onStateChange);
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		return next;
	}

	function setPolicy(service: TestUpdateService, policyValue: string | undefined): Promise<unknown> {
		configurationService.policyValue = policyValue;
		const next = Event.toPromise(service.onStateChange);
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		return next;
	}

	teardown(() => {
		sinon.restore();
	});

	test('mode none disables updates at startup', async () => {
		const service = createService('none');
		await service.whenInitialized;

		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.ManuallyDisabled });
	});

	test('mode default enables updates at startup', async () => {
		const service = createService('default');
		await service.whenInitialized;

		assert.strictEqual(service.state.type, StateType.Idle);
	});

	test('policy forces updates off even when the user setting keeps them enabled', async () => {
		const service = createService('default');
		await service.whenInitialized;
		assert.strictEqual(service.state.type, StateType.Idle);

		// User setting stays 'default' (enabled); policy alone forces 'none'.
		await setPolicy(service, 'none');

		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.Policy });
	});

	test('switching to none at runtime cancels and disables', async () => {
		const service = createService('default');
		await service.whenInitialized;

		await changeMode(service, 'none');

		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.ManuallyDisabled });
		assert.strictEqual(service.cancelCount, 1);
	});

	test('switching from none to default at runtime re-enables', async () => {
		const service = createService('none');
		await service.whenInitialized;
		assert.strictEqual(service.state.type, StateType.Disabled);

		await changeMode(service, 'default');

		assert.strictEqual(service.state.type, StateType.Idle);
	});

	test('default schedules a background check, none does not', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const service = createService('default');
			await service.whenInitialized;
			await clock.tickAsync(30 * 1000);
			assert.strictEqual(service.checkCount, 1, 'default should schedule a check');

			await changeMode(service, 'none');
			await clock.tickAsync(60 * 60 * 1000);
			assert.strictEqual(service.checkCount, 1, 'none should not schedule further checks');
		} finally {
			clock.restore();
		}
	});

	test('permanent disablement ignores runtime mode changes', async () => {
		const service = createService('default', { isBuilt: false });
		await service.whenInitialized;
		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.NotBuilt });

		configurationService.setUserConfiguration('update.mode', 'none');
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);

		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.NotBuilt });
	});

	test('redundant update.mode write does not re-disable', async () => {
		const service = createService('none');
		await service.whenInitialized;
		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.ManuallyDisabled });

		const cancelsAfterInit = service.cancelCount;
		let stateChanges = 0;
		store.add(service.onStateChange(() => stateChanges++));

		// Re-write the same 'none' value: this affects `update.mode` but does not change the outcome.
		configurationService.setUserConfiguration('update.mode', 'none');
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		await timeout(0);

		assert.strictEqual(service.cancelCount, cancelsAfterInit, 'should not cancel again while already disabled');
		assert.strictEqual(stateChanges, 0, 'should not re-fire the Disabled state');
	});

	test('surfaces Cancelling while tearing down in-flight work, then Disabled', async () => {
		const service = createService('default');
		await service.whenInitialized;

		// Put the service into a cancellable state and make cancellation block until we release it.
		service.forceState(State.CheckingForUpdates(false));
		const gate = new DeferredPromise<void>();
		service.blockCancelUpdate(gate.p);

		const states: StateType[] = [];
		store.add(service.onStateChange(s => states.push(s.type)));

		configurationService.setUserConfiguration('update.mode', 'none');
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		await timeout(0);

		assert.strictEqual(service.state.type, StateType.Cancelling, 'should show Cancelling while cancellation is in progress');

		gate.complete();
		await timeout(0);

		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.ManuallyDisabled });
		assert.deepStrictEqual(states, [StateType.Cancelling, StateType.Disabled]);
	});

	test('does not enter Cancelling when nothing is in flight', async () => {
		const service = createService('default');
		await service.whenInitialized;
		assert.strictEqual(service.state.type, StateType.Idle);

		const states: StateType[] = [];
		store.add(service.onStateChange(s => states.push(s.type)));

		await changeMode(service, 'none');

		assert.deepStrictEqual(service.state, { type: StateType.Disabled, reason: DisablementReason.ManuallyDisabled });
		assert.deepStrictEqual(states, [StateType.Disabled], 'should go straight to Disabled without a Cancelling flash');
	});
});
