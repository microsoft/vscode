/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestConfigurationService as TestBackendConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { getRemoteTunnelAccessState, ToggleRemoteConnectionsActionViewItem } from '../../electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { executeToggleRemoteConnections, TUNNEL_HOST_SHARING_KEY, TunnelHostContribution } from '../../electron-browser/tunnelHost.contribution.js';
import { IRemoteTunnelStartOptions, promptToRenameRemoteTunnel } from '../../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	stops = 0;
	mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	status: TunnelStatus = { type: 'disconnected' };
	private readonly _onDidChangeMode = new Emitter<TunnelMode>();
	override readonly onDidChangeMode = this._onDidChangeMode.event;
	private readonly _onDidChangeTunnelStatus = new Emitter<TunnelStatus>();
	override readonly onDidChangeTunnelStatus = this._onDidChangeTunnelStatus.event;
	private readonly _initialMode = new DeferredPromise<TunnelMode>();
	private readonly _initialStatus = new DeferredPromise<TunnelStatus>();
	private _deferInitialState = false;

	override getMode(): Promise<TunnelMode> {
		return this._deferInitialState ? this._initialMode.p : Promise.resolve(this.mode);
	}

	override getTunnelStatus(): Promise<TunnelStatus> {
		return this._deferInitialState ? this._initialStatus.p : Promise.resolve(this.status);
	}

	override async stopTunnel(): Promise<void> {
		this.stops++;
		this.fireMode(INACTIVE_TUNNEL_MODE);
		this.fireStatus({ type: 'disconnected' });
	}

	deferInitialState(): void {
		this._deferInitialState = true;
	}

	completeInitialState(mode: TunnelMode, status: TunnelStatus): void {
		this._initialMode.complete(mode);
		this._initialStatus.complete(status);
	}

	fireMode(mode: TunnelMode): void {
		this.mode = mode;
		this._onDidChangeMode.fire(mode);
	}

	fireStatus(status: TunnelStatus): void {
		this.status = status;
		this._onDidChangeTunnelStatus.fire(status);
	}

	dispose(): void {
		this._onDidChangeMode.dispose();
		this._onDidChangeTunnelStatus.dispose();
	}
}

class TestMissionControlSharingService extends mock<IMissionControlSharingService>() {
	override readonly state = observableValue<'disabled' | 'connecting' | 'enabled'>(this, 'disabled');
	readonly calls: boolean[] = [];

	override async setEnabled(enabled: boolean): Promise<void> {
		this.calls.push(enabled);
		this.state.set(enabled ? 'enabled' : 'disabled', undefined);
	}
}

class TestCommandService extends mock<ICommandService>() {
	readonly commands: Array<{ id: string; args: unknown[] }> = [];

	override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
		this.commands.push({ id, args });
		return Promise.resolve<R | undefined>(undefined);
	}
}

class TestQuickInputService extends mock<IQuickInputService>() {
	result: string | undefined;
	options: IInputOptions | undefined;

	override async input(options?: IInputOptions): Promise<string | undefined> {
		this.options = options;
		return this.result;
	}
}

class TestConfigurationService extends mock<IConfigurationService>() {
	readonly updates: Array<{ key: string; value: unknown; target: ConfigurationTarget | undefined }> = [];

	override updateValue(key: string, value: unknown): Promise<void>;
	override updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	override updateValue(key: string, value: unknown, targetOrOverrides?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
		this.updates.push({ key, value, target: typeof targetOrOverrides === 'number' ? targetOrOverrides : undefined });
		return Promise.resolve();
	}
}

suite('ToggleRemoteConnectionsActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function backendConfiguration(backend: AgentHostRemoteConnectionsBackend = 'devTunnel') {
		const configuration = new TestBackendConfigurationService({ [AgentHostRemoteConnectionsSettingId]: backend });
		store.add(configuration.onDidChangeConfigurationEmitter);
		return configuration;
	}

	function toggle(remoteTunnelService: IRemoteTunnelService, commandService: ICommandService, startOptions?: IRemoteTunnelStartOptions, backend: AgentHostRemoteConnectionsBackend = 'devTunnel', sharing = new TestMissionControlSharingService()) {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IRemoteTunnelService, remoteTunnelService);
		instantiation.stub(ICommandService, commandService);
		instantiation.stub(IConfigurationService, backendConfiguration(backend));
		instantiation.stub(IMissionControlSharingService, sharing);
		return instantiation.invokeFunction(accessor => executeToggleRemoteConnections(accessor, startOptions));
	}

	test('derives unified access state from the authoritative remote tunnel state', () => {
		const activeMode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};

		assert.deepStrictEqual({
			disabled: getRemoteTunnelAccessState(INACTIVE_TUNNEL_MODE, { type: 'disconnected' }),
			connecting: getRemoteTunnelAccessState(activeMode, { type: 'connecting' }),
			connected: getRemoteTunnelAccessState(activeMode, {
				type: 'connected',
				info: { tunnelName: 'my-tunnel', isAttached: false },
				serviceInstallFailed: false,
			}),
			externallyHosted: getRemoteTunnelAccessState(INACTIVE_TUNNEL_MODE, {
				type: 'connected',
				info: { tunnelName: 'external-tunnel', isAttached: true },
				serviceInstallFailed: false,
			}),
		}, {
			disabled: { isSharing: false, isConnecting: false, tunnelName: undefined },
			connecting: { isSharing: false, isConnecting: true, tunnelName: undefined },
			connected: { isSharing: true, isConnecting: false, tunnelName: 'my-tunnel' },
			externallyHosted: { isSharing: true, isConnecting: false, tunnelName: 'external-tunnel' },
		});
	});

	test('does not announce an existing tunnel while initial state loads', async () => {
		const testDisposables = store.add(new DisposableStore());
		const remoteTunnelService = testDisposables.add(new TestRemoteTunnelService());
		const activeMode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};
		const connectedStatus: TunnelStatus = {
			type: 'connected',
			info: { tunnelName: 'my-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};
		remoteTunnelService.deferInitialState();

		const action = testDisposables.add(new Action('test.toggleRemoteConnections', 'Toggle Remote Connections'));
		const viewItem = testDisposables.add(new ToggleRemoteConnectionsActionViewItem(
			action,
			remoteTunnelService,
			NullHoverService,
			new class extends mock<IProductService>() { }(),
			backendConfiguration(),
			new TestMissionControlSharingService(),
		));
		const container = document.createElement('div');
		viewItem.render(container);

		remoteTunnelService.fireMode(activeMode);
		remoteTunnelService.fireStatus(connectedStatus);
		remoteTunnelService.completeInitialState(INACTIVE_TUNNEL_MODE, { type: 'disconnected' });
		await timeout(0);

		const toast = container.querySelector<HTMLElement>('.tunnel-host-toast');
		assert.deepStrictEqual({
			sharing: container.classList.contains('sharing'),
			toastVisible: toast?.classList.contains('visible') ?? false,
		}, {
			sharing: true,
			toastVisible: false,
		});

		remoteTunnelService.fireStatus({ type: 'disconnected' });
		remoteTunnelService.fireStatus(connectedStatus);

		assert.strictEqual(toast?.classList.contains('visible'), true);
	});

	test('does not announce an initially connected tunnel', async () => {
		const testDisposables = store.add(new DisposableStore());
		const remoteTunnelService = testDisposables.add(new TestRemoteTunnelService());
		remoteTunnelService.mode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};
		remoteTunnelService.status = {
			type: 'connected',
			info: { tunnelName: 'my-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};

		const action = testDisposables.add(new Action('test.toggleRemoteConnections', 'Toggle Remote Connections'));
		const viewItem = testDisposables.add(new ToggleRemoteConnectionsActionViewItem(
			action,
			remoteTunnelService,
			NullHoverService,
			new class extends mock<IProductService>() { }(),
			backendConfiguration(),
			new TestMissionControlSharingService(),
		));
		const container = document.createElement('div');
		viewItem.render(container);
		await timeout(0);

		const toast = container.querySelector<HTMLElement>('.tunnel-host-toast');
		assert.deepStrictEqual({
			sharing: container.classList.contains('sharing'),
			toastVisible: toast?.classList.contains('visible') ?? false,
		}, {
			sharing: true,
			toastVisible: false,
		});
	});

	test('executes the Remote Tunnel turn-on and turn-off commands', async () => {
		const activeMode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};
		const remoteTunnelService = new TestRemoteTunnelService();
		const commandService = new TestCommandService();

		await toggle(remoteTunnelService, commandService);
		remoteTunnelService.mode = activeMode;
		remoteTunnelService.status = {
			type: 'connected',
			info: { tunnelName: 'my-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};
		await toggle(remoteTunnelService, commandService);

		assert.deepStrictEqual(commandService.commands, [
			{ id: 'workbench.remoteTunnel.actions.turnOn', args: [] },
			{ id: 'workbench.remoteTunnel.actions.turnOff', args: [] },
		]);
	});

	test('passes the Agents tunnel start constraints only when requested', async () => {
		const remoteTunnelService = new TestRemoteTunnelService();
		const commandService = new TestCommandService();

		await toggle(remoteTunnelService, commandService, {
			authenticationProviderId: 'github',
			showServiceOption: false,
		});

		assert.deepStrictEqual(commandService.commands, [{
			id: 'workbench.remoteTunnel.actions.turnOn',
			args: [{ authenticationProviderId: 'github', showServiceOption: false }],
		}]);
	});

	for (const backend of ['githubEnvironment', 'missionControl'] as const) {
		test(`routes ${backend} enable, disable and cancellation without Dev Tunnel commands`, async () => {
			const remoteTunnel = store.add(new TestRemoteTunnelService());
			const commands = new TestCommandService();
			const sharing = new TestMissionControlSharingService();
			await toggle(remoteTunnel, commands, undefined, backend, sharing);
			await toggle(remoteTunnel, commands, undefined, backend, sharing);
			sharing.state.set('connecting', undefined);
			await toggle(remoteTunnel, commands, undefined, backend, sharing);
			assert.deepStrictEqual({ sharing: sharing.calls, tunnelStops: remoteTunnel.stops, commands: commands.commands }, {
				sharing: [true, false, false], tunnelStops: 1, commands: [],
			});
		});

		test(`renders ${backend} progress and sharing with matching accessible toggle state`, async () => {
			const remoteTunnel = store.add(new TestRemoteTunnelService());
			const sharing = new TestMissionControlSharingService();
			const configuration = backendConfiguration(backend);
			const action = store.add(new Action('test.toggleRemoteConnections', 'Toggle Remote Connections'));
			const viewItem = store.add(new ToggleRemoteConnectionsActionViewItem(
				action, remoteTunnel, NullHoverService, new class extends mock<IProductService>() { }(), configuration, sharing,
			));
			const container = document.createElement('div');
			viewItem.render(container);
			await timeout(0);
			const snapshots = (['disabled', 'connecting', 'enabled', 'disabled'] as const).map(state => {
				sharing.state.set(state, undefined);
				return {
					label: container.getAttribute('aria-label'),
					pressed: container.getAttribute('aria-pressed'),
					sharing: container.classList.contains('sharing'),
					connecting: container.classList.contains('connecting'),
				};
			});
			assert.deepStrictEqual(snapshots, [
				{ label: 'Allow Remote Connections via GitHub environment', pressed: 'false', sharing: false, connecting: false },
				{ label: 'Registering GitHub environment...', pressed: 'false', sharing: false, connecting: true },
				{ label: 'Remote Connections via GitHub environment are enabled', pressed: 'true', sharing: true, connecting: false },
				{ label: 'Allow Remote Connections via GitHub environment', pressed: 'false', sharing: false, connecting: false },
			]);
		});

		test(`does not announce restored ${backend} sharing as newly enabled`, async () => {
			const remoteTunnel = store.add(new TestRemoteTunnelService());
			const sharing = new TestMissionControlSharingService();
			sharing.state.set('enabled', undefined);
			const viewItem = store.add(new ToggleRemoteConnectionsActionViewItem(
				store.add(new Action('test.toggle', 'Toggle Remote Connections')), remoteTunnel, NullHoverService,
				new class extends mock<IProductService>() { }(), backendConfiguration(backend), sharing,
			));
			await timeout(0);
			const container = document.createElement('div');
			viewItem.render(container);
			assert.deepStrictEqual({
				pressed: container.getAttribute('aria-pressed'),
				toast: container.querySelector('.tunnel-host-toast')?.classList.contains('visible'),
			}, { pressed: 'true', toast: false });
		});
	}

	test('derives the shared toggle context from the selected backend and stops sharing on a backend change', async () => {
		const remoteTunnel = store.add(new TestRemoteTunnelService());
		const configuration = backendConfiguration();
		const sharing = new TestMissionControlSharingService();
		const context = new MockContextKeyService();
		store.add(new TunnelHostContribution(
			context, remoteTunnel, new NullActionViewItemService(), configuration, sharing, store.add(new NullLogService()), new TestNotificationService(),
		));
		await timeout(0);
		remoteTunnel.fireStatus({ type: 'connected', info: { tunnelName: 'tunnel', isAttached: false }, serviceInstallFailed: false });
		const snapshots = [context.getContextKeyValue(TUNNEL_HOST_SHARING_KEY)];
		await configuration.setUserConfiguration(AgentHostRemoteConnectionsSettingId, 'githubEnvironment');
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === AgentHostRemoteConnectionsSettingId; }
		});
		snapshots.push(context.getContextKeyValue(TUNNEL_HOST_SHARING_KEY));
		sharing.state.set('connecting', undefined);
		snapshots.push(context.getContextKeyValue(TUNNEL_HOST_SHARING_KEY));
		sharing.state.set('enabled', undefined);
		snapshots.push(context.getContextKeyValue(TUNNEL_HOST_SHARING_KEY));
		assert.deepStrictEqual({ snapshots, stops: remoteTunnel.stops }, { snapshots: [true, false, false, true], stops: 1 });
	});

	test('stops a pending Dev Tunnel activation that completes after switching to GitHub environment', async () => {
		const remoteTunnel = store.add(new TestRemoteTunnelService());
		const configuration = backendConfiguration();
		const context = new MockContextKeyService();
		store.add(new TunnelHostContribution(
			context, remoteTunnel, new NullActionViewItemService(), configuration, new TestMissionControlSharingService(),
			store.add(new NullLogService()), new TestNotificationService(),
		));
		await timeout(0);
		await configuration.setUserConfiguration(AgentHostRemoteConnectionsSettingId, 'githubEnvironment');
		configuration.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === AgentHostRemoteConnectionsSettingId; }
		}());
		await timeout(0);
		remoteTunnel.fireMode({
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		});
		await timeout(0);
		assert.deepStrictEqual({
			mode: remoteTunnel.mode, stops: remoteTunnel.stops, sharing: context.getContextKeyValue(TUNNEL_HOST_SHARING_KEY),
		}, { mode: INACTIVE_TUNNEL_MODE, stops: 2, sharing: false });
	});

	for (const backend of ['devTunnel', 'githubEnvironment', 'missionControl'] as const) {
		for (const deferred of [false, true]) {
			test(`enforces ${backend} for ${deferred ? 'delayed' : 'immediate'} startup tunnel restoration`, async () => {
				const remoteTunnel = store.add(new TestRemoteTunnelService());
				const activeMode: ActiveTunnelMode = {
					active: true,
					asService: false,
					session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
				};
				const status: TunnelStatus = { type: 'connecting' };
				remoteTunnel.mode = activeMode;
				remoteTunnel.status = status;
				if (deferred) {
					remoteTunnel.deferInitialState();
				}
				store.add(new TunnelHostContribution(
					new MockContextKeyService(), remoteTunnel, new NullActionViewItemService(), backendConfiguration(backend),
					new TestMissionControlSharingService(), store.add(new NullLogService()), new TestNotificationService(),
				));
				if (deferred) {
					remoteTunnel.completeInitialState(activeMode, status);
				}
				await timeout(0);
				assert.deepStrictEqual({ mode: remoteTunnel.mode, stops: remoteTunnel.stops }, {
					mode: backend === 'devTunnel' ? activeMode : INACTIVE_TUNNEL_MODE,
					stops: backend === 'devTunnel' ? 0 : 1,
				});
			});
		}
	}

	test('does not stop Dev Tunnel sharing when an active mode is observed with Dev Tunnel selected', async () => {
		const remoteTunnel = store.add(new TestRemoteTunnelService());
		store.add(new TunnelHostContribution(
			new MockContextKeyService(), remoteTunnel, new NullActionViewItemService(), backendConfiguration(),
			new TestMissionControlSharingService(), store.add(new NullLogService()), new TestNotificationService(),
		));
		await timeout(0);
		const activeMode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};
		remoteTunnel.fireMode(activeMode);
		await timeout(0);
		assert.deepStrictEqual({ mode: remoteTunnel.mode, stops: remoteTunnel.stops }, { mode: activeMode, stops: 0 });
	});

	for (const disposed of [false, true]) {
		test(`ignores stale active initial tunnel state after ${disposed ? 'disposal' : 'a newer inactive mode'}`, async () => {
			const remoteTunnel = store.add(new TestRemoteTunnelService());
			remoteTunnel.deferInitialState();
			const contribution = store.add(new TunnelHostContribution(
				new MockContextKeyService(), remoteTunnel, new NullActionViewItemService(), backendConfiguration('missionControl'),
				new TestMissionControlSharingService(), store.add(new NullLogService()), new TestNotificationService(),
			));
			if (disposed) {
				contribution.dispose();
			} else {
				remoteTunnel.fireMode(INACTIVE_TUNNEL_MODE);
			}
			remoteTunnel.completeInitialState({
				active: true,
				asService: false,
				session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
			}, { type: 'connecting' });
			await timeout(0);
			assert.deepStrictEqual({ mode: remoteTunnel.mode, stops: remoteTunnel.stops }, { mode: INACTIVE_TUNNEL_MODE, stops: 0 });
		});
	}

	test('renames a tunnel through quick input and persists the hostname override', async () => {
		const quickInputService = new TestQuickInputService();
		const configurationService = new TestConfigurationService();
		quickInputService.result = 'renamed-tunnel';

		await promptToRenameRemoteTunnel(quickInputService, configurationService, 'old-tunnel');

		assert.deepStrictEqual({
			input: {
				title: quickInputService.options?.title,
				value: quickInputService.options?.value,
				placeHolder: quickInputService.options?.placeHolder,
			},
			updates: configurationService.updates,
		}, {
			input: {
				title: 'Rename Tunnel',
				value: 'old-tunnel',
				placeHolder: 'Leave blank to use this machine\'s host name.',
			},
			updates: [{ key: CONFIGURATION_KEY_HOST_NAME, value: 'renamed-tunnel', target: ConfigurationTarget.USER }],
		});
	});
});
