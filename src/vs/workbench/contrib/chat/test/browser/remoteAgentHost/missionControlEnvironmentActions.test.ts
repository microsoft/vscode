/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { cloudSandboxAddress } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IQuickInputButton, IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickSeparator, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../browser/remoteAgentHost/missionControlEnvironmentActions.js';

class TestEnvironmentQuickPick extends mock<IQuickPick<IQuickPickItem, { useSeparators: true }>>() {
	private readonly store = new DisposableStore();
	private readonly hideEmitter = this.store.add(new Emitter<IQuickInputHideEvent>());
	private readonly acceptEmitter = this.store.add(new Emitter<IQuickPickDidAcceptEvent>());
	private readonly buttonEmitter = this.store.add(new Emitter<IQuickInputButton>());
	private visible = false;
	private isBusy = false;
	readonly shown = new DeferredPromise<void>();
	readonly refreshed = new DeferredPromise<void>();
	override readonly onDidHide = this.hideEmitter.event;
	override readonly onDidAccept = this.acceptEmitter.event;
	override readonly onDidTriggerButton = this.buttonEmitter.event;
	override selectedItems: readonly IQuickPickItem[] = [];
	override activeItems: readonly IQuickPickItem[] = [];
	override items: readonly (IQuickPickItem | IQuickPickSeparator)[] = [];
	override buttons: readonly IQuickInputButton[] = [];
	override title: string | undefined;
	override placeholder: string | undefined;
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
		const calls = { tokens: [] as CancellationToken[], connections: [] as string[], errors: [] as string[] };
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
		}();
		instantiation.stub(IMissionControlEnvironmentService, service);
		const connectionChanges = store.add(new Emitter<void>());
		const connections: IRemoteAgentHostConnectionInfo[] = [];
		instantiation.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = connectionChanges.event;
			override readonly connections = connections;
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
		return { quickPick, inventory, calls, hosts, run, signOut, instantiation, connections, connectionChanges };
	}

	test('shows only availability and active connection status on a single line', async () => {
		const { quickPick, inventory, run, connections, connectionChanges } = fixture([
			environment('online'), { ...environment('offline'), status: 'offline' },
		]);
		const done = run();
		await quickPick.shown.p;
		const rows = () => quickPick.hostItems().map(item => ({ label: item.label, description: item.description, detail: item.detail }));
		const states = [rows()];
		for (const status of [RemoteAgentHostConnectionStatus.connecting, RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.reconnecting, RemoteAgentHostConnectionStatus.disconnected]) {
			connections.splice(0, connections.length, { address: cloudSandboxAddress('online'), name: 'Host online', status });
			connectionChanges.fire();
			states.push(rows());
		}
		quickPick.hide();
		await done;
		await inventory.complete([]);
		const offline = { label: 'Host offline', description: 'Offline', detail: undefined };
		assert.deepStrictEqual(states, [
			[{ label: 'Host online', description: 'Online', detail: undefined }, offline],
			[{ label: 'Host online', description: 'Online · Connecting', detail: undefined }, offline],
			[{ label: 'Host online', description: 'Online · Connected', detail: undefined }, offline],
			[{ label: 'Host online', description: 'Online · Reconnecting', detail: undefined }, offline],
			[{ label: 'Host online', description: 'Online', detail: undefined }, offline],
		]);
	});

	test('uses Environments for the picker title, refresh action and empty state', async () => {
		const { quickPick, inventory, run } = fixture();
		const done = run();
		await quickPick.shown.p;
		await inventory.complete([]);
		await quickPick.refreshed.p;
		const copy = {
			title: quickPick.title, placeholder: quickPick.placeholder,
			refresh: quickPick.buttons[0].tooltip, empty: quickPick.validationMessage,
		};
		quickPick.hide();
		await done;
		assert.deepStrictEqual(copy, {
			title: 'Environments', placeholder: 'Select an environment to connect',
			refresh: 'Refresh Environments', empty: 'No environments found.',
		});
	});

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

	test('refreshes cached rows on open and removes hosts absent from the endpoint', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('deleted'), environment('remaining')]);
		const done = run();
		await quickPick.shown.p;
		const cached = quickPick.hostItems().map(item => item.label);
		await inventory.complete([environment('remaining')]);
		await quickPick.refreshed.p;
		const refreshed = quickPick.hostItems().map(item => item.label);
		quickPick.hide();
		await done;
		assert.deepStrictEqual({ cached, refreshed, requests: calls.tokens.length }, {
			cached: ['Host deleted', 'Host remaining'], refreshed: ['Host remaining'], requests: 1,
		});
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

	test('hosts have no hide or restore actions and accepting a host connects directly', async () => {
		const { quickPick, inventory, calls, run } = fixture([environment('a')]);
		const done = run();
		await quickPick.shown.p;
		const rows = quickPick.items.map(item => ({ type: item.type, label: item.label, buttons: item.type === 'separator' ? undefined : item.buttons }));
		quickPick.selectedItems = [quickPick.hostItems()[0]];
		quickPick.accept();
		await done;
		await inventory.complete([]);
		assert.deepStrictEqual({ rows, connections: calls.connections }, {
			rows: [{ type: undefined, label: 'Host a', buttons: undefined }], connections: ['a'],
		});
	});

	test('duplicate names show only friendly labels and availability without host IDs', async () => {
		const { quickPick, inventory, run } = fixture([environment('env_11111111', 'Machine'), environment('env_22222222', 'Machine')]);
		const done = run();
		await quickPick.shown.p;
		const rows = quickPick.hostItems().map(item => ({ label: item.label, description: item.description, detail: item.detail }));
		quickPick.hide();
		await done;
		await inventory.complete([]);
		assert.deepStrictEqual(rows, [
			{ label: 'Machine', description: 'Online', detail: undefined },
			{ label: 'Machine', description: 'Online', detail: undefined },
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
