/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IQuickInputButton, IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../browser/remoteAgentHost/missionControlEnvironmentActions.js';

class TestEnvironmentQuickPick extends mock<IQuickPick<IQuickPickItem, { useSeparators: true }>>() {
	private readonly store = new DisposableStore();
	private readonly hideEmitter = this.store.add(new Emitter<IQuickInputHideEvent>());
	private readonly acceptEmitter = this.store.add(new Emitter<IQuickPickDidAcceptEvent>());
	private readonly buttonEmitter = this.store.add(new Emitter<IQuickInputButton>());
	private readonly itemButtonEmitter = this.store.add(new Emitter<IQuickPickItemButtonEvent<IQuickPickItem>>());
	private visible = false;
	private isBusy = false;
	readonly shown = new DeferredPromise<void>();
	readonly refreshed = new DeferredPromise<void>();
	override readonly onDidHide = this.hideEmitter.event;
	override readonly onDidAccept = this.acceptEmitter.event;
	override readonly onDidTriggerButton = this.buttonEmitter.event;
	override readonly onDidTriggerItemButton = this.itemButtonEmitter.event;
	override selectedItems: readonly IQuickPickItem[] = [];
	override activeItems: readonly IQuickPickItem[] = [];
	override items: readonly (IQuickPickItem | IQuickPickSeparator)[] = [];
	override buttons: readonly IQuickInputButton[] = [];
	override value = '';
	override severity = Severity.Info;
	override validationMessage: string | undefined;
	disposed = false;

	override get busy(): boolean { return this.isBusy; }
	override set busy(value: boolean) {
		this.isBusy = value;
		if (!value) {
			void this.refreshed.complete();
		}
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
	override accept(inBackground = false): void { this.acceptEmitter.fire({ inBackground }); }
	triggerItemButton(item: IQuickPickItem): void { this.itemButtonEmitter.fire({ item, button: item.buttons![0] }); }
	override dispose(): void {
		this.hide();
		this.disposed = true;
		this.store.dispose();
	}
	hostItems(): IQuickPickItem[] { return this.items.filter((item): item is IQuickPickItem => item.type !== 'separator'); }
}

function environment(id: string, name = `Host ${id}`): IMissionControlHost {
	return { id, name, status: 'online', kind: 'user-local' };
}

suite('Mission Control environment picker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(cached: readonly IMissionControlHost[] = [], enabled = true) {
		const quickPick = store.add(new TestEnvironmentQuickPick());
		const instantiation = store.add(new TestInstantiationService());
		const inventory = new DeferredPromise<readonly IMissionControlHost[]>();
		const hosts = observableValue<readonly IMissionControlHost[]>('hosts', cached);
		const calls = { tokens: [] as CancellationToken[], connections: [] as string[], hidden: [] as string[], restored: [] as string[], errors: [] as string[] };
		let accountKey: string | undefined = 'account';
		const service = new class extends mock<IMissionControlEnvironmentService>() {
			override readonly enabled = enabled;
			override readonly hosts = hosts;
			override get accountKey() { return accountKey; }
			override async initialize() { }
			override async refresh(token: CancellationToken) {
				calls.tokens.push(token);
				const next = await inventory.p;
				if (!token.isCancellationRequested) {
					hosts.set(next, undefined);
				}
			}
			override async connect(id: string) { calls.connections.push(id); }
			override async hide(id: string) {
				calls.hidden.push(id);
				hosts.set(hosts.get().map(host => host.id === id ? { ...host, hidden: true } : host), undefined);
			}
			override restore(id: string) {
				calls.restored.push(id);
				hosts.set(hosts.get().map(host => host.id === id ? { ...host, hidden: false } : host), undefined);
			}
		}();
		instantiation.stub(IMissionControlEnvironmentService, service);
		instantiation.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = Event.None;
			override readonly connections = [];
		}());
		instantiation.stub(INotificationService, new class extends TestNotificationService {
			override error(message: Parameters<TestNotificationService['error']>[0]) {
				calls.errors.push(String(message));
				return super.error(message);
			}
		}());
		instantiation.stub(IQuickInputService, { backButton: { tooltip: 'Back' }, focus: () => { } }, 'createQuickPick', () => quickPick);
		const run = () => instantiation.invokeFunction(accessor => CommandsRegistry.getCommand(ConnectMissionControlEnvironmentCommand)!.handler(accessor));
		const signOut = () => { accountKey = undefined; hosts.set([], undefined); };
		return { quickPick, inventory, calls, hosts, run, signOut, instantiation };
	}

	test('shows retained hosts immediately while refreshing and preserves query, selection and focus', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('a')]);
		const done = run();
		await quickPick.shown.p;
		const initial = quickPick.hostItems().map(item => item.label);
		quickPick.value = 'a';
		quickPick.activeItems = quickPick.selectedItems = [quickPick.hostItems()[0]];
		await inventory.complete([environment('b'), environment('a', 'Renamed A')]);
		await quickPick.refreshed.p;
		const updated = {
			labels: quickPick.hostItems().map(item => item.label), query: quickPick.value,
			active: quickPick.activeItems.map(item => item.label), selected: quickPick.selectedItems.map(item => item.label),
			busy: quickPick.busy,
		};
		quickPick.accept();
		await done;
		assert.deepStrictEqual({ initial, updated, connections: calls.connections, errors: calls.errors }, {
			initial: ['Host a'], updated: { labels: ['Host b', 'Renamed A'], query: 'a', active: ['Renamed A'], selected: ['Renamed A'], busy: false },
			connections: ['a'], errors: [],
		});
	});

	test('does not expose discovery when AI features are disabled', async () => {
		const { calls, quickPick, run } = fixture([], false);
		await assert.rejects(async () => run(), /require remote agent hosts and AI features to be enabled/);
		assert.deepStrictEqual({ requests: calls.tokens.length, shown: quickPick.shown.isSettled }, { requests: 0, shown: false });
	});

	test('cached hosts can be accepted before refresh, and closing cancels late results', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('a')]);
		const done = run();
		await quickPick.shown.p;
		quickPick.selectedItems = [quickPick.hostItems()[0]];
		quickPick.accept();
		await done;
		await inventory.complete([environment('b')]);
		assert.deepStrictEqual({
			labels: quickPick.hostItems().map(item => item.label), connections: calls.connections,
			cancelled: calls.tokens[0].isCancellationRequested, disposed: quickPick.disposed,
		}, { labels: ['Host a'], connections: ['a'], cancelled: true, disposed: true });
	});

	for (const cached of [[], [environment('a')]]) {
		test(`failed refresh retains the ${cached.length ? 'cached' : 'empty'} picker and offers retry`, async () => {
			const { quickPick, inventory, calls, run } = fixture(cached);
			const done = run();
			await quickPick.shown.p;
			await inventory.error(new Error('Inventory failed'));
			await quickPick.refreshed.p;
			const failed = { labels: quickPick.hostItems().map(item => item.label), visible: !quickPick.disposed, severity: quickPick.severity, error: quickPick.validationMessage?.includes('Inventory failed') };
			quickPick.hide();
			await done;
			assert.deepStrictEqual({ failed, connections: calls.connections }, {
				failed: { labels: cached.map(host => host.name), visible: true, severity: Severity.Warning, error: true }, connections: [],
			});
		});
	}

	test('hide and restore are keyboard-accessible local actions without connecting', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('a')]);
		const done = run();
		await quickPick.shown.p;
		quickPick.triggerItemButton(quickPick.hostItems()[0]);
		const hidden = quickPick.hostItems()[0].description;
		quickPick.selectedItems = [quickPick.hostItems()[0]];
		quickPick.accept();
		const restored = quickPick.hostItems()[0].description;
		quickPick.hide();
		await done;
		await inventory.complete([]);
		assert.deepStrictEqual({ hidden, restored, calls: { hidden: calls.hidden, restored: calls.restored, connections: calls.connections } }, {
			hidden: 'Hidden', restored: 'Relay disconnected', calls: { hidden: ['a'], restored: ['a'], connections: [] },
		});
	});

	test('duplicate names retain friendly primary labels with secondary disambiguation', async () => {
		const { quickPick, inventory, run } = fixture([environment('env_11111111', 'Machine'), environment('env_22222222', 'Machine')]);
		const done = run();
		await quickPick.shown.p;
		const rows = quickPick.hostItems().map(item => ({ label: item.label, detail: item.detail }));
		quickPick.hide();
		await done;
		await inventory.complete([]);
		assert.deepStrictEqual(rows, [
			{ label: 'Machine', detail: 'Mission Control · Last reported online · Host 11111111' },
			{ label: 'Machine', detail: 'Mission Control · Last reported online · Host 22222222' },
		]);
	});

	test('sign-out closes a picker and ignores late inventory', async () => {
		const { quickPick, inventory, calls, run, signOut } = fixture([environment('a')]);
		const done = run();
		await quickPick.shown.p;
		signOut();
		await done;
		await inventory.complete([environment('b')]);
		assert.deepStrictEqual({ connections: calls.connections, errors: calls.errors, disposed: quickPick.disposed }, { connections: [], errors: [], disposed: true });
	});
});
