/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestConfigurationService as TestBackendConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { getRemoteTunnelAccessState, RemoteConnectionsActionViewItem, ToggleRemoteConnectionsActionViewItem } from '../../electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { executeToggleRemoteConnections, TUNNEL_HOST_SHARING_KEY, TunnelHostContribution } from '../../electron-browser/tunnelHost.contribution.js';
import { IRemoteTunnelStartOptions, promptToRenameRemoteTunnel } from '../../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';

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

class TestRemoteConnectionsConfigurationService extends TestBackendConfigurationService {
	override async updateValue(key: string, value: unknown): Promise<void> {
		await this.setUserConfiguration(key, value);
		this.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string) { return section === key; }
		});
	}
}

suite('RemoteConnectionsActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	function fixture(backend: AgentHostRemoteConnectionsBackend = 'devTunnel', options: { quality?: IProductService['quality']; isChatInput?: boolean; precedingAction?: boolean } = { quality: 'insider' }) {
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestRemoteConnectionsConfigurationService({ [AgentHostRemoteConnectionsSettingId]: backend });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const update = stub(configuration, 'updateValue').callThrough();
		const remoteTunnel = store.add(new TestRemoteTunnelService());
		const sharing = new TestMissionControlSharingService();
		const notifications = new TestNotificationService();
		let menuActions: readonly IActionWidgetDropdownAction[] = [];
		let menuItems: { label: string | undefined; detail: string | undefined; badge: string | undefined; role: string | undefined }[] = [];
		let hideMenu: (() => void) | undefined;
		const actionWidget = new class extends mock<IActionWidgetService>() {
			override show: IActionWidgetService['show'] = (_user, _supportsPreview, items, delegate, _anchor, _container, _actionBarActions, accessibilityProvider) => {
				menuActions = items.flatMap(item => {
					const action = item.item as IActionWidgetDropdownAction | undefined;
					return action ? [action] : [];
				});
				menuItems = items.map(item => ({ label: item.label, detail: item.detail, badge: item.badge, role: accessibilityProvider?.getRole?.(item) }));
				hideMenu = () => delegate.onHide(true);
			};
			override hide(): void {
				const onHide = hideMenu;
				hideMenu = undefined;
				onHide?.();
			}
		};
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IRemoteTunnelService, remoteTunnel);
		instantiation.stub(IMissionControlSharingService, sharing);
		instantiation.stub(IHoverService, NullHoverService);
		instantiation.stub(IProductService, new class extends mock<IProductService>() {
			override readonly quality = options.quality;
		}());
		instantiation.stub(IActionWidgetService, actionWidget);
		instantiation.stub(IKeybindingService, new MockKeybindingService());
		instantiation.stub(IContextKeyService, new MockContextKeyService());
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(INotificationService, notifications);

		const run = stub().resolves();
		const action = store.add(new Action('test.toggleRemoteConnections', 'Toggle Remote Connections', undefined, true, run));
		const viewItem = store.add(instantiation.createInstance(RemoteConnectionsActionViewItem, action, options.isChatInput ?? false));
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const actionBar = store.add(new ActionBar(container, { actionViewItemProvider: candidate => candidate === action ? viewItem : undefined }));
		if (options.precedingAction) {
			actionBar.push(store.add(new Action('test.preceding', 'Preceding Action')));
		}
		actionBar.push(action);
		const primary = container.querySelector<HTMLElement>('.tunnel-host-toggle');
		const dropdown = container.querySelector<HTMLElement>('.dropdown-action-container .action-label');
		assert.ok(primary);
		const openMenu = () => {
			assert.ok(dropdown);
			dropdown.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			return menuActions;
		};

		return { configuration, update, remoteTunnel, sharing, notifications, run, action, viewItem, container, primary, dropdown, openMenu, closeMenu: () => actionWidget.hide(), menuActions: () => menuActions, menuItems: () => menuItems };
	}

	test('shows explanatory second lines and marks GitHub Environments as preview', () => {
		const { openMenu, menuItems } = fixture();
		openMenu();
		assert.deepStrictEqual(menuItems(), [
			{ label: 'Dev Tunnels', detail: 'Connect from VS Code or a browser through a secure tunnel.', badge: undefined, role: 'menuitemcheckbox' },
			{ label: 'GitHub Environments', detail: 'Register this machine with GitHub for remote agent access.', badge: 'Preview', role: 'menuitemcheckbox' },
		]);
	});

	test('discloses GitHub data handling in the method picker before enabling sharing', () => {
		const { openMenu, sharing } = fixture();
		const githubEnvironment = openMenu().find(action => action.id === 'remoteConnections.githubEnvironment');
		assert.deepStrictEqual({
			disclosure: githubEnvironment?.hover?.content,
			state: sharing.state.get(),
			sharing: sharing.calls,
		}, {
			disclosure: 'Session actions are mirrored to GitHub for catalog and history storage. Conversation content is not end-to-end encrypted.',
			state: 'disabled',
			sharing: [],
		});
	});

	test('keeps titlebar controls in the toolbar roving tab order', () => {
		const { primary, dropdown, viewItem } = fixture('devTunnel', { quality: 'insider', precedingAction: true });
		assert.ok(dropdown);
		const tabStops = () => ({ primary: primary.tabIndex, dropdown: dropdown.tabIndex });
		const states = [tabStops()];
		viewItem.setFocusable(true);
		states.push(tabStops());
		viewItem.blur();
		states.push(tabStops());
		assert.deepStrictEqual(states, [
			{ primary: -1, dropdown: -1 },
			{ primary: 0, dropdown: -1 },
			{ primary: -1, dropdown: -1 },
		]);
	});

	for (const quality of ['insider', 'stable', 'exploration', undefined] as const) {
		test(`keeps chat controls tabbable after another toolbar action: ${quality ?? 'OSS'}`, () => {
			const { primary, dropdown, viewItem, action } = fixture('devTunnel', { quality, isChatInput: true, precedingAction: true });
			const tabStops = () => ({ primary: primary.tabIndex, dropdown: dropdown?.tabIndex });
			const states = [tabStops()];
			viewItem.focus();
			primary.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
			viewItem.blur();
			states.push(tabStops());
			viewItem.setFocusable(false);
			states.push(tabStops());
			action.enabled = false;
			states.push(tabStops());
			action.enabled = true;
			states.push(tabStops());
			assert.deepStrictEqual(states, [
				{ primary: 0, dropdown: quality === 'stable' ? undefined : 0 },
				{ primary: 0, dropdown: quality === 'stable' ? undefined : 0 },
				{ primary: 0, dropdown: quality === 'stable' ? undefined : 0 },
				{ primary: -1, dropdown: quality === 'stable' ? undefined : -1 },
				{ primary: 0, dropdown: quality === 'stable' ? undefined : 0 },
			]);
		});

		test(`shows the dropdown outside Stable: ${quality ?? 'OSS'}`, () => {
			const { container, primary, dropdown, viewItem, run, update } = fixture('devTunnel', { quality });
			viewItem.focus(true);
			const focusMatchesQuality = document.activeElement === (quality !== 'stable' ? dropdown : primary);
			primary.click();
			viewItem.blur();
			viewItem.setFocusable(false);
			const disabledTabIndex = primary.tabIndex;
			viewItem.setFocusable(true);
			assert.deepStrictEqual({
				dropdownVisible: dropdown !== null,
				splitButton: container.querySelector('.remote-connections-action') !== null,
				focusMatchesQuality,
				disabledTabIndex,
				enabledTabIndex: primary.tabIndex,
				toggles: run.callCount,
				updates: update.callCount,
			}, {
				dropdownVisible: quality !== 'stable',
				splitButton: quality !== 'stable',
				focusMatchesQuality: true,
				disabledTabIndex: -1,
				enabledTabIndex: 0,
				toggles: 1,
				updates: 0,
			});
		});
	}

	for (const backend of ['devTunnel', 'githubEnvironment', 'missionControl'] as const) {
		test(`shows the selected method for ${backend} without enabling sharing`, async () => {
			const { openMenu, update, run, sharing } = fixture(backend);
			const actions = openMenu();
			assert.deepStrictEqual({
				methods: actions.map(action => ({ label: action.label, checked: action.checked })),
				updates: update.callCount,
				toggles: run.callCount,
				sharing: sharing.calls,
			}, {
				methods: [
					{ label: 'Dev Tunnels', checked: backend === 'devTunnel' },
					{ label: 'GitHub Environments', checked: backend !== 'devTunnel' },
				],
				updates: 0,
				toggles: 0,
				sharing: [],
			});
		});

		test(`selecting the current ${backend} method leaves sharing unchanged`, async () => {
			const { openMenu, update, sharing } = fixture(backend);
			sharing.state.set('enabled', undefined);
			await openMenu().find(action => action.checked)!.run();
			assert.deepStrictEqual({ updates: update.callCount, state: sharing.state.get(), sharing: sharing.calls }, {
				updates: 0, state: 'enabled', sharing: [],
			});
		});
	}

	test('writes selection to the user setting, stops Dev Tunnel sharing, and refreshes checkmarks on reopen', async () => {
		const { configuration, update, remoteTunnel, sharing, run, openMenu, closeMenu } = fixture();
		store.add(new TunnelHostContribution(
			new MockContextKeyService(), remoteTunnel, new NullActionViewItemService(), configuration, sharing,
			store.add(new NullLogService()), new TestNotificationService(),
		));
		await timeout(0);
		remoteTunnel.fireStatus({ type: 'connected', info: { tunnelName: 'tunnel', isAttached: false }, serviceInstallFailed: false });
		await openMenu()[1].run();
		closeMenu();
		const methods = openMenu().map(action => ({ label: action.label, checked: action.checked }));
		assert.deepStrictEqual({
			updates: update.args,
			configuredMethod: configuration.getValue(AgentHostRemoteConnectionsSettingId),
			methods,
			stops: remoteTunnel.stops,
			state: remoteTunnel.status.type,
			sharing: sharing.calls,
			toggles: run.callCount,
		}, {
			updates: [[AgentHostRemoteConnectionsSettingId, 'githubEnvironment', ConfigurationTarget.USER]],
			configuredMethod: 'githubEnvironment',
			methods: [{ label: 'Dev Tunnels', checked: false }, { label: 'GitHub Environments', checked: true }],
			stops: 1,
			state: 'disconnected',
			sharing: [],
			toggles: 0,
		});
	});

	test('selects Dev Tunnels from GitHub Environments without enabling it', async () => {
		const { openMenu, update, run, sharing } = fixture('githubEnvironment');
		await openMenu()[0].run();
		assert.deepStrictEqual({ updates: update.args, toggles: run.callCount, sharing: sharing.calls }, {
			updates: [[AgentHostRemoteConnectionsSettingId, 'devTunnel', ConfigurationTarget.USER]], toggles: 0, sharing: [],
		});
	});

	test('reflects changes made directly to the setting in the toggle and method menu', async () => {
		const { configuration, primary, openMenu, closeMenu, sharing, run } = fixture();
		openMenu();
		closeMenu();
		await configuration.updateValue(AgentHostRemoteConnectionsSettingId, 'githubEnvironment');
		assert.deepStrictEqual({
			methods: openMenu().map(action => ({ label: action.label, checked: action.checked })),
			label: primary.getAttribute('aria-label'),
			pressed: primary.getAttribute('aria-pressed'),
			sharing: sharing.calls,
			toggles: run.callCount,
		}, {
			methods: [{ label: 'Dev Tunnels', checked: false }, { label: 'GitHub Environments', checked: true }],
			label: 'Allow Remote Connections via GitHub environment',
			pressed: 'false',
			sharing: [],
			toggles: 0,
		});
	});

	test('reports a failed preference update and retains the selected method', async () => {
		const { openMenu, closeMenu, update, notifications } = fixture();
		const error = new Error('Unable to save connection method');
		update.rejects(error);
		const notify = stub(notifications, 'error');
		await openMenu()[1].run();
		closeMenu();
		assert.deepStrictEqual({
			errors: notify.args,
			checked: openMenu().map(action => action.checked),
		}, { errors: [[error]], checked: [true, false] });
	});

	test('keeps the primary toggle independent from the dropdown', async () => {
		const { primary, openMenu, run, update } = fixture();
		primary.click();
		openMenu();
		assert.deepStrictEqual({ toggles: run.callCount, updates: update.callCount }, { toggles: 1, updates: 0 });
	});

	test('supports keyboard navigation between the toggle and menu without toggling sharing', () => {
		const { viewItem, primary, dropdown, run, menuActions, closeMenu } = fixture();
		assert.ok(dropdown);
		viewItem.focus();
		const focused = [document.activeElement === primary];
		primary.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
		focused.push(document.activeElement === dropdown);
		dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const expanded = dropdown.getAttribute('aria-expanded');
		closeMenu();
		dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true }));
		focused.push(document.activeElement === primary);
		viewItem.blur();
		viewItem.focus(true);
		focused.push(document.activeElement === dropdown);
		assert.deepStrictEqual({
			focused,
			expanded,
			collapsed: dropdown.getAttribute('aria-expanded'),
			label: dropdown.getAttribute('aria-label'),
			menuItems: menuActions().length,
			toggles: run.callCount,
		}, {
			focused: [true, true, true, true],
			expanded: 'true',
			collapsed: 'false',
			label: 'Select Remote Connection Method\nChanging the method turns remote connections off. - Select Remote Connection Method',
			menuItems: 2,
			toggles: 0,
		});
	});
});

suite('ToggleRemoteConnectionsActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	test('GitHub sharing hover explains machine-wide access, OS permissions, and data handling before opt-in', () => {
		const viewItem = Object.assign(Object.create(ToggleRemoteConnectionsActionViewItem.prototype), {
			_usesMissionControl: () => true,
			_getAriaLabel: () => 'Allow Remote Connections via GitHub environment',
		}) as { _getHoverContent(): string };
		const content = viewItem._getHoverContent();
		assert.deepStrictEqual({
			owner: content.includes('authenticated as your GitHub account'),
			access: content.includes('read and modify files across this machine'),
			sensitive: content.includes('including sensitive files'),
			osPermissions: content.includes('Operating system permissions still apply'),
			historyStorage: content.includes('Session actions are mirrored to GitHub for catalog and history storage'),
			encryption: content.includes('Conversation content is not end-to-end encrypted'),
		}, { owner: true, access: true, sensitive: true, osPermissions: true, historyStorage: true, encryption: true });
	});

	function backendConfiguration(backend: AgentHostRemoteConnectionsBackend = 'devTunnel') {
		const configuration = new TestRemoteConnectionsConfigurationService({ [AgentHostRemoteConnectionsSettingId]: backend });
		store.add(configuration.onDidChangeConfigurationEmitter);
		return configuration;
	}

	function toggle(remoteTunnelService: IRemoteTunnelService, commandService: ICommandService, startOptions?: IRemoteTunnelStartOptions, backend: AgentHostRemoteConnectionsBackend = 'devTunnel', sharing = new TestMissionControlSharingService(), notificationService = new TestNotificationService(), logService = store.add(new NullLogService())) {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IRemoteTunnelService, remoteTunnelService);
		instantiation.stub(ICommandService, commandService);
		instantiation.stub(IConfigurationService, backendConfiguration(backend));
		instantiation.stub(IMissionControlSharingService, sharing);
		instantiation.stub(INotificationService, notificationService);
		instantiation.stub(ILogService, logService);
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

	test('keeps the toggle icon-only while loading and reconnecting a tunnel', async () => {
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

		assert.deepStrictEqual({
			sharing: container.classList.contains('sharing'),
			inlineText: container.textContent,
		}, {
			sharing: true,
			inlineText: '',
		});

		remoteTunnelService.fireStatus({ type: 'disconnected' });
		remoteTunnelService.fireStatus(connectedStatus);

		assert.deepStrictEqual({
			sharing: container.classList.contains('sharing'),
			pressed: container.getAttribute('aria-pressed'),
			inlineText: container.textContent,
		}, { sharing: true, pressed: 'true', inlineText: '' });
	});

	test('keeps an initially connected tunnel icon-only', async () => {
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

		assert.deepStrictEqual({
			sharing: container.classList.contains('sharing'),
			inlineText: container.textContent,
		}, {
			sharing: true,
			inlineText: '',
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
		for (const operation of ['enable', 'disable', 'stop tunnel', 'cancel sign-in'] as const) {
			test(`reports ${backend} toggle failures but not sign-in cancellation (${operation})`, async () => {
				const remoteTunnel = store.add(new TestRemoteTunnelService());
				const commands = new TestCommandService();
				const sharing = new TestMissionControlSharingService();
				const error = operation === 'cancel sign-in' ? new CancellationError() : new Error('Sharing failed');
				if (operation === 'disable') {
					sharing.state.set('enabled', undefined);
				}
				if (operation === 'stop tunnel') {
					stub(remoteTunnel, 'stopTunnel').rejects(error);
				} else {
					stub(sharing, 'setEnabled').rejects(error);
				}
				const notificationService = new TestNotificationService();
				const notify = stub(notificationService, 'error').callThrough();
				const logService = store.add(new NullLogService());
				const log = stub(logService, 'error');
				await toggle(remoteTunnel, commands, undefined, backend, sharing, notificationService, logService);
				assert.deepStrictEqual({
					notifications: notify.args,
					logs: log.args,
					commands: commands.commands,
				}, {
					notifications: operation === 'cancel sign-in' ? [] : [[error]],
					logs: operation === 'cancel sign-in' ? [] : [['Failed to toggle GitHub environment sharing', error]],
					commands: [],
				});
			});
		}

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
					inlineText: container.textContent,
				};
			});
			assert.deepStrictEqual(snapshots, [
				{ label: 'Allow Remote Connections via GitHub environment', pressed: 'false', sharing: false, connecting: false, inlineText: '' },
				{ label: 'Registering GitHub environment...', pressed: 'false', sharing: false, connecting: true, inlineText: '' },
				{ label: 'Remote Connections via GitHub environment are enabled', pressed: 'true', sharing: true, connecting: false, inlineText: '' },
				{ label: 'Allow Remote Connections via GitHub environment', pressed: 'false', sharing: false, connecting: false, inlineText: '' },
			]);
		});

		test(`keeps restored ${backend} sharing icon-only`, async () => {
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
				inlineText: container.textContent,
			}, { pressed: 'true', inlineText: '' });
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
		await configuration.updateValue(AgentHostRemoteConnectionsSettingId, 'githubEnvironment');
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
		await configuration.updateValue(AgentHostRemoteConnectionsSettingId, 'githubEnvironment');
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
