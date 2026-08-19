/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ManagedSettingsData } from '../../../../base/common/policy.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY, COPILOT_SANDBOX_ENABLED_KEY } from '../../common/copilotManagedSettings.js';
import { NativeManagedSettingsChannelClient } from '../../common/nativeManagedSettingsIpc.js';
import { PolicyValue } from '../../common/policy.js';
import { NativeManagedSettingsService, NativePolicyWatcherFactory } from '../../node/nativeManagedSettingsService.js';

suite('NativeManagedSettingsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const policyName = 'ChatToolsAutoApprove';

	test('watches managed-settings keys from policy definitions and exposes raw managed settings', async () => {
		let onDidChange: ((update: Record<string, PolicyValue | undefined>) => void) | undefined;
		const watcherFactory: NativePolicyWatcherFactory = (_productName, policies, callback) => {
			assert.deepStrictEqual(policies, {
				[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				[COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: { type: 'boolean' },
				[COPILOT_SANDBOX_ENABLED_KEY]: { type: 'boolean' },
			});
			onDidChange = callback;
			callback({});
			return Disposable.None;
		};

		const service = disposables.add(new NativeManagedSettingsService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		assert.deepStrictEqual(service.managedSettings, { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'enable' });
		assert.deepStrictEqual(service.managedSettings, { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'enable' });
	});

	test('watches transport controls without a managed-settings policy definition', async () => {
		let watchedSettings: Record<string, { type: 'string' | 'number' | 'boolean' }> = {};
		const watcherFactory: NativePolicyWatcherFactory = (_productName, policies, callback) => {
			watchedSettings = policies;
			callback({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
			return Disposable.None;
		};

		const service = disposables.add(new NativeManagedSettingsService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({ OtherPolicy: { type: 'boolean' } });

		assert.deepStrictEqual({
			watchedSettings,
			managedSettings: service.managedSettings,
		}, {
			watchedSettings: {
				[COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: { type: 'boolean' },
				[COPILOT_SANDBOX_ENABLED_KEY]: { type: 'boolean' },
			},
			managedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
		});
	});

	test('clears stale watcher values when managed-settings definitions are removed', async () => {
		let onDidChange: ((update: Record<string, PolicyValue | undefined>) => void) | undefined;
		let disposeCount = 0;
		const watcherFactory: NativePolicyWatcherFactory = (_productName, _policies, callback) => {
			onDidChange = callback;
			callback({});
			return { dispose: () => disposeCount++ };
		};

		const service = disposables.add(new NativeManagedSettingsService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		await service.updatePolicyDefinitions({});

		assert.deepStrictEqual({ managedSettings: service.managedSettings, disposeCount }, { managedSettings: {}, disposeCount: 1 });
	});

	test('keeps raw managed settings while definitions are unchanged', async () => {
		let onDidChange: ((update: Record<string, PolicyValue | undefined>) => void) | undefined;
		let watcherCreateCount = 0;
		const watcherFactory: NativePolicyWatcherFactory = (_productName, _policies, callback) => {
			watcherCreateCount++;
			onDidChange = callback;
			callback({});
			return Disposable.None;
		};

		const service = disposables.add(new NativeManagedSettingsService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			},
			OtherPolicy: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		assert.deepStrictEqual({ managedSettings: service.managedSettings, watcherCreateCount }, { managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' }, watcherCreateCount: 1 });
	});

	test('retries watcher creation after initialization fails', async () => {
		let watcherCreateCount = 0;
		const watcherFactory: NativePolicyWatcherFactory = (_productName, _policies, callback) => {
			watcherCreateCount++;
			if (watcherCreateCount === 1) {
				throw new Error('initial watcher creation failed');
			}
			callback({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
			return Disposable.None;
		};

		const service = disposables.add(new NativeManagedSettingsService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await assert.rejects(service.initialize());

		assert.deepStrictEqual({
			managedSettings: await service.initialize(),
			watcherCreateCount,
		}, {
			managedSettings: { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true },
			watcherCreateCount: 2,
		});
	});

	test('removes raw managed settings whose definitions are no longer watched', async () => {
		let onDidChange: ((update: Record<string, PolicyValue | undefined>) => void) | undefined;
		const otherManagedSettingKey = 'permissions.otherManagedSetting';
		const watcherFactory: NativePolicyWatcherFactory = (_productName, _policies, callback) => {
			onDidChange = callback;
			callback({});
			return Disposable.None;
		};

		const service = disposables.add(new NativeManagedSettingsService(new NullLogService(), 'com.github.copilot', undefined, watcherFactory));
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
					[otherManagedSettingKey]: { type: 'boolean' },
				}
			}
		});

		onDidChange?.({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable', [otherManagedSettingKey]: true });
		await service.updatePolicyDefinitions({
			[policyName]: {
				type: 'boolean',
				managedSettings: {
					[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: 'string' },
				}
			}
		});

		assert.deepStrictEqual(service.managedSettings, { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
	});

	test('channel client keeps newer event state when initial snapshot resolves later', async () => {
		const channel = disposables.add(new DeferredManagedSettingsChannel());
		const client = disposables.add(new NativeManagedSettingsChannelClient(channel, new NullLogService()));

		channel.fire({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
		channel.resolveInitialSnapshot({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'enable' });
		await client.initialize();

		assert.deepStrictEqual(client.managedSettings, { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' });
	});

	test('channel client updatePolicyDefinitions updates cache without firing change event', async () => {
		const channel = disposables.add(new DeferredManagedSettingsChannel());
		const client = disposables.add(new NativeManagedSettingsChannelClient(channel, new NullLogService()));
		channel.resolveInitialSnapshot({});
		await channel.initialSnapshot;

		let eventCount = 0;
		disposables.add(client.onDidChangeManagedSettings(() => eventCount++));

		channel.updatePolicyDefinitionsResult = { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' };
		const result = await client.updatePolicyDefinitions({});

		assert.deepStrictEqual({ result, managedSettings: client.managedSettings, eventCount }, {
			result: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' },
			managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: 'disable' },
			eventCount: 0,
		});
	});

	test('channel client retries a failed initial snapshot', async () => {
		const channel = new RetryManagedSettingsChannel();
		const client = disposables.add(new NativeManagedSettingsChannelClient(channel, new NullLogService()));
		const initial = client.initialize();

		channel.rejectInitialSnapshot();
		await assert.rejects(initial);

		assert.deepStrictEqual(await client.initialize(), { [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true });
		assert.strictEqual(channel.getManagedSettingsCallCount, 2);
	});
});

class DeferredManagedSettingsChannel extends Disposable implements IChannel {
	private readonly _onDidChangeManagedSettings = this._register(new Emitter<ManagedSettingsData>());
	private resolveInitialSnapshotPromise!: (managedSettings: ManagedSettingsData) => void;
	readonly initialSnapshot = new Promise<ManagedSettingsData>(resolve => this.resolveInitialSnapshotPromise = resolve);
	updatePolicyDefinitionsResult: ManagedSettingsData = {};

	call<T>(command: string): Promise<T> {
		switch (command) {
			case 'getManagedSettings': return this.initialSnapshot as Promise<T>;
			case 'updatePolicyDefinitions': return Promise.resolve(this.updatePolicyDefinitionsResult as T);
		}

		throw new Error(`Call not found: ${command}`);
	}

	listen<T>(event: string): Event<T> {
		assert.strictEqual(event, 'onDidChangeManagedSettings');
		return this._onDidChangeManagedSettings.event as Event<T>;
	}

	fire(managedSettings: ManagedSettingsData): void {
		this._onDidChangeManagedSettings.fire(managedSettings);
	}

	resolveInitialSnapshot(managedSettings: ManagedSettingsData): void {
		this.resolveInitialSnapshotPromise(managedSettings);
	}
}

class RetryManagedSettingsChannel implements IChannel {
	private rejectInitialSnapshotPromise!: (error: Error) => void;
	private readonly initialSnapshot = new Promise<ManagedSettingsData>((_resolve, reject) => this.rejectInitialSnapshotPromise = reject);
	getManagedSettingsCallCount = 0;

	call<T>(command: string): Promise<T> {
		assert.strictEqual(command, 'getManagedSettings');
		this.getManagedSettingsCallCount++;
		if (this.getManagedSettingsCallCount === 1) {
			return this.initialSnapshot as Promise<T>;
		}
		return Promise.resolve({ [COPILOT_FORCE_REMOTE_SETTINGS_REFRESH_KEY]: true } as T);
	}

	listen<T>(): Event<T> {
		return Event.None;
	}

	rejectInitialSnapshot(): void {
		this.rejectInitialSnapshotPromise(new Error('initial native managed-settings read failed'));
	}
}
