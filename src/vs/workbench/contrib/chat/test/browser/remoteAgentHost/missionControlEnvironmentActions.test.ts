/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { cloudSandboxAddress, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxConnectOptions, ICloudSandboxEnvironment, IMissionControlEnvironment } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../browser/remoteAgentHost/missionControlEnvironmentActions.js';

class TestEnvironmentQuickPick extends mock<IQuickPick<IQuickPickItem>>() {
	private readonly store = new DisposableStore();
	private readonly hideEmitter = this.store.add(new Emitter<IQuickInputHideEvent>());
	private readonly acceptEmitter = this.store.add(new Emitter<IQuickPickDidAcceptEvent>());
	private readonly itemsEmitter = this.store.add(new Emitter<void>());
	private currentItems: readonly IQuickPickItem[] = [];
	private visible = false;
	readonly shown = new DeferredPromise<void>();
	readonly onDidChangeItems = this.itemsEmitter.event;
	override readonly onDidHide = this.hideEmitter.event;
	override readonly onDidAccept = this.acceptEmitter.event;
	override selectedItems: readonly IQuickPickItem[] = [];
	override activeItems: readonly IQuickPickItem[] = [];
	override value = '';
	override busy = false;
	disposed = false;

	override get items(): readonly IQuickPickItem[] { return this.currentItems; }
	override set items(items: readonly IQuickPickItem[]) {
		this.currentItems = items;
		this.itemsEmitter.fire();
	}
	override show(): void {
		this.visible = true;
		void this.shown.complete();
	}
	override hide(): void {
		if (this.visible) {
			this.visible = false;
			this.hideEmitter.fire({ reason: QuickInputHideReason.Other });
		}
	}
	override accept(inBackground = false): void {
		this.acceptEmitter.fire({ inBackground });
	}
	override dispose(): void {
		this.hide();
		this.disposed = true;
		this.store.dispose();
	}
}

function environment(id: string, status = 'online', kind = 'user-local'): IMissionControlEnvironment {
	return { id, name: `Host ${id}`, status, kind };
}

suite('Mission Control environment picker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(cached?: readonly IMissionControlEnvironment[], status: ICloudSandboxEnvironment['status'] = 'online') {
		const quickPick = store.add(new TestEnvironmentQuickPick());
		const instantiationService = store.add(new TestInstantiationService());
		const inventory = new DeferredPromise<readonly IMissionControlEnvironment[]>();
		const errorShown = new DeferredPromise<void>();
		const calls = {
			refresh: [] as ({ readonly refresh?: boolean } | undefined)[],
			tokens: [] as CancellationToken[],
			lookups: [] as string[],
			connections: [] as ICloudSandboxConnectOptions[],
			errors: [] as string[],
			warnings: [] as string[],
		};
		instantiationService.stub(IEnvironmentService, new class extends mock<IEnvironmentService>() {
			override readonly isBuilt = false;
		}());
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = { hidden: false };
		}());
		instantiationService.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override async getExperimentalMissionControlEnvironmentId() { return 'own'; }
		}());
		instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
			override getCachedEnvironments() { return cached; }
			override listEnvironments(token: CancellationToken, options?: { readonly refresh?: boolean }) {
				calls.refresh.push(options);
				calls.tokens.push(token);
				return inventory.p;
			}
			override async getEnvironment(id: string) {
				calls.lookups.push(id);
				return { id, status };
			}
		}());
		instantiationService.stub(ICloudSandboxAgentHostService, new class extends mock<ICloudSandboxAgentHostService>() {
			override async connect(options: ICloudSandboxConnectOptions) {
				calls.connections.push(options);
				return cloudSandboxAddress(options.environmentId);
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(message: Parameters<INotificationService['error']>[0]): void {
				calls.errors.push(String(message));
				void errorShown.complete();
			}
			override warn(message: Parameters<INotificationService['warn']>[0]): void {
				calls.warnings.push(String(message));
			}
		}());
		instantiationService.stub(IQuickInputService, {}, 'createQuickPick', () => quickPick);
		const run = () => instantiationService.invokeFunction(accessor => {
			const command = CommandsRegistry.getCommand(ConnectMissionControlEnvironmentCommand);
			assert.ok(command);
			return command.handler(accessor);
		});
		return { quickPick, inventory, errorShown, calls, run };
	}

	test('shows cached hosts immediately, refreshes inventory, and preserves the search and active host', async () => {
		const { quickPick, inventory, calls, run } = fixture([
			environment('a', 'offline'), environment('own'), environment('managed', 'online', 'managed-sandbox'),
		]);
		const done = run();
		await quickPick.shown.p;
		const initial = { labels: quickPick.items.map(item => item.label), busy: quickPick.busy };
		quickPick.value = 'a';
		quickPick.activeItems = [quickPick.items[0]];
		const refreshed = Event.toPromise(quickPick.onDidChangeItems);
		await inventory.complete([
			{ ...environment('a'), name: 'Renamed A' }, environment('b'), environment('own'), environment('managed', 'online', 'managed-sandbox'),
		]);
		await refreshed;
		const updated = {
			labels: quickPick.items.map(item => item.label),
			query: quickPick.value, active: quickPick.activeItems.map(item => item.label), busy: quickPick.busy,
		};
		quickPick.selectedItems = [quickPick.items[0]];
		quickPick.accept();
		await done;
		assert.deepStrictEqual({
			initial, updated, refresh: calls.refresh, lookups: calls.lookups, connections: calls.connections,
			errors: calls.errors, disposed: quickPick.disposed, cancelled: calls.tokens[0].isCancellationRequested,
		}, {
			initial: { labels: ['Host a'], busy: false },
			updated: { labels: ['Host b', 'Renamed A'], query: 'a', active: ['Renamed A'], busy: false },
			refresh: [{ refresh: true }], lookups: ['b'],
			connections: [{ environmentId: 'b', name: 'Host b', environmentKind: 'user-local' }],
			errors: [], disposed: true, cancelled: true,
		});
	});

	test('a cold picker shows progress until one fresh inventory supplies hosts', async () => {
		const { quickPick, inventory, calls, run } = fixture();
		const done = run();
		await quickPick.shown.p;
		const initial = { items: quickPick.items.length, busy: quickPick.busy };
		const refreshed = Event.toPromise(quickPick.onDidChangeItems);
		await inventory.complete([environment('b'), environment('own')]);
		await refreshed;
		const updated = { labels: quickPick.items.map(item => item.label), busy: quickPick.busy };
		quickPick.hide();
		await done;
		assert.deepStrictEqual({
			initial, updated, refresh: calls.refresh, connections: calls.connections, errors: calls.errors,
		}, {
			initial: { items: 0, busy: true }, updated: { labels: ['Host b'], busy: false },
			refresh: [{ refresh: true }], connections: [], errors: [],
		});
	});

	test('a cached host can be accepted before the refresh finishes and is revalidated live', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('a', 'offline')]);
		const done = run();
		await quickPick.shown.p;
		quickPick.selectedItems = [quickPick.items[0]];
		quickPick.accept();
		await done;
		await inventory.complete([environment('b')]);
		assert.deepStrictEqual({
			labels: quickPick.items.map(item => item.label), lookups: calls.lookups, connections: calls.connections,
			cancelled: calls.tokens[0].isCancellationRequested, errors: calls.errors,
		}, {
			labels: ['Host a'], lookups: ['a'],
			connections: [{ environmentId: 'a', name: 'Host a', environmentKind: 'user-local' }],
			cancelled: true, errors: [],
		});
	});

	test('closing the picker cancels refresh and ignores a late inventory without connecting', async () => {
		const { quickPick, inventory, calls, run } = fixture();
		const done = run();
		await quickPick.shown.p;
		const initialBusy = quickPick.busy;
		quickPick.hide();
		await done;
		await inventory.complete([environment('b')]);
		assert.deepStrictEqual({
			initialBusy, labels: quickPick.items.map(item => item.label), connections: calls.connections,
			cancelled: calls.tokens[0].isCancellationRequested, disposed: quickPick.disposed, errors: calls.errors,
		}, { initialBusy: true, labels: [], connections: [], cancelled: true, disposed: true, errors: [] });
	});

	for (const cached of [undefined, [], [environment('a')]]) {
		const hasCachedHosts = !!cached?.length;
		test(`reports refresh errors ${hasCachedHosts ? 'without removing useful cached hosts' : `and closes an empty picker (cached: ${!!cached})`}`, async () => {
			const { quickPick, inventory, errorShown, calls, run } = fixture(cached);
			const done = run();
			await quickPick.shown.p;
			await inventory.error(new Error('Inventory failed'));
			await errorShown.p;
			const disposedOnError = quickPick.disposed;
			quickPick.hide();
			await done;
			assert.deepStrictEqual({
				labels: quickPick.items.map(item => item.label), errors: calls.errors, disposedOnError,
				connections: calls.connections, disposed: quickPick.disposed,
			}, {
				labels: hasCachedHosts ? ['Host a'] : [], errors: ['Error: Inventory failed'], disposedOnError: !hasCachedHosts,
				connections: [], disposed: true,
			});
		});
	}

	test('account-change cancellation closes the picker without surfacing an error', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('a')]);
		const done = run();
		await quickPick.shown.p;
		await inventory.error(new CancellationError());
		await done;
		assert.deepStrictEqual({
			errors: calls.errors, connections: calls.connections, disposed: quickPick.disposed,
		}, { errors: [], connections: [], disposed: true });
	});

	test('an environment that went offline is not connected or replaced', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('a')], 'offline');
		const done = run();
		await quickPick.shown.p;
		quickPick.selectedItems = [quickPick.items[0]];
		quickPick.accept();
		await done;
		await inventory.complete([]);
		assert.deepStrictEqual({
			lookups: calls.lookups, connections: calls.connections, errors: calls.errors, warnings: calls.warnings,
		}, {
			lookups: ['a'], connections: [], errors: [],
			warnings: ['Host a is not online. Start its owning application before connecting.'],
		});
	});
});
