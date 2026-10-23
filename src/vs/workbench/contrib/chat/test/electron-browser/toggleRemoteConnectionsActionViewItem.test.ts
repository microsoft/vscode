/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
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
import { IActionViewItemService, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestConfigurationService as TestBackendConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { getRemoteTunnelAccessState, RemoteConnectionsActionViewItem, ToggleRemoteConnectionsActionViewItem } from '../../electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { executeToggleRemoteConnections, TUNNEL_HOST_SHARING_KEY, TunnelHostContribution } from '../../electron-browser/tunnelHost.contribution.js';
import { IRemoteTunnelStartOptions, promptToRenameRemoteTunnel, RemoteTunnelCommandIds } from '../../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionListItemKind, ActionListWidget, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	stops = 0;
	name = 'test-tunnel';
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

	override async getTunnelName(): Promise<string> {
		return this.name;
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
	override readonly environmentName = observableValue<string | undefined>(this, undefined);
	readonly calls: boolean[] = [];

	override async setEnvironmentName(name: string): Promise<void> {
		this.environmentName.set(name.trim(), undefined);
	}

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
		const availability = observableValue('availability', true);
		instantiation.stub(IMissionControlAvailabilityService, { available: availability });
		const openSettings = stub().resolves(undefined);
		instantiation.stub(IPreferencesService, { openSettings });
		const configuration = new TestRemoteConnectionsConfigurationService({ [AgentHostRemoteConnectionsSettingId]: backend, [GitHubEnvironmentsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const update = stub(configuration, 'updateValue').callThrough();
		const remoteTunnel = store.add(new TestRemoteTunnelService());
		const sharing = new TestMissionControlSharingService();
		store.add(configuration.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostRemoteConnectionsSettingId)) {
				void sharing.setEnabled(false);
			}
		}));
		const notifications = new TestNotificationService();
		let menuActions: readonly IActionWidgetDropdownAction[] = [];
		let menuItems: { label: string | undefined; detail: string | undefined; badge: string | undefined; role: string | undefined }[] = [];
		let hideMenu: (() => void) | undefined;
		let listOptions: IActionListOptions | undefined;
		const actionWidget = new class extends mock<IActionWidgetService>() {
			override show: IActionWidgetService['show'] = (_user, _supportsPreview, items, delegate, _anchor, _container, _actionBarActions, accessibilityProvider, options) => {
				listOptions = options;
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
		const quickInput = new TestQuickInputService();
		instantiation.stub(IQuickInputService, quickInput);
		instantiation.stub(IAgentHostService, new class extends mock<IAgentHostService>() {
			override async getMissionControlEnvironmentName() { return 'Test Machine (VS Code Insiders)'; }
		}());
		instantiation.stub(IProductService, new class extends mock<IProductService>() {
			override readonly quality = options.quality;
		}());
		instantiation.stub(IActionWidgetService, actionWidget);
		instantiation.stub(IKeybindingService, new MockKeybindingService());
		instantiation.stub(IContextKeyService, new MockContextKeyService());
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(INotificationService, notifications);
		instantiation.stub(IActionViewItemService, new NullActionViewItemService());
		instantiation.stub(ILogService, store.add(new NullLogService()));
		const commands = new TestCommandService();
		const executeCommand = stub(commands, 'executeCommand').callsFake(async id => {
			if (id === RemoteTunnelCommandIds.turnOn) {
				remoteTunnel.fireStatus({ type: 'connected', info: { tunnelName: 'tunnel', isAttached: false }, serviceInstallFailed: false });
			} else if (id === RemoteTunnelCommandIds.turnOff) {
				await remoteTunnel.stopTunnel();
			}
			return undefined;
		});
		instantiation.stub(ICommandService, commands);
		store.add(instantiation.createInstance(TunnelHostContribution));

		const run = stub().callsFake(() => instantiation.invokeFunction(accessor => executeToggleRemoteConnections(accessor)));
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
		const dropdown = primary;
		assert.ok(primary);
		const openMenu = () => {
			assert.ok(dropdown);
			dropdown.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			return menuActions;
		};

		return { configuration, update, remoteTunnel, sharing, quickInput, notifications, executeCommand, run, action, viewItem, container, primary, dropdown, availability, openMenu, closeMenu: () => actionWidget.hide(), menuActions: () => menuActions, menuItems: () => menuItems, listOptions: () => listOptions, instantiation, openSettings };
	}

	test('shows explanatory second lines and marks GitHub Environments as preview', () => {
		const { openMenu, menuItems } = fixture();
		openMenu();
		assert.deepStrictEqual(menuItems(), [
			{ label: 'Off', detail: undefined, badge: undefined, role: 'menuitemcheckbox' },
			{ label: 'Dev Tunnels', detail: 'Access workspaces and agents on this machine from VS Code or vscode.dev/agents.', badge: undefined, role: 'menuitemcheckbox' },
			{ label: 'GitHub Environments', detail: 'Access agents on this machine from VS Code, vscode.dev/agents, GitHub apps, or github.com/copilot.', badge: 'Preview', role: 'menuitemcheckbox' },
		]);
	});

	test('connection methods do not add extra hovers', () => {
		const { openMenu } = fixture();
		assert.deepStrictEqual(openMenu().map(action => ({ id: action.id, hover: action.hover })), [
			{ id: 'remoteConnections.off', hover: undefined },
			{ id: 'remoteConnections.devTunnel', hover: undefined },
			{ id: 'remoteConnections.githubEnvironment', hover: undefined },
		]);
	});

	test('disabled availability hides GitHub Environments and rejects a stale menu action', async () => {
		const { configuration, openMenu, closeMenu, update, sharing, notifications } = fixture();
		const notificationError = stub(notifications, 'error');
		const staleAction = openMenu().find(action => action.id === 'remoteConnections.githubEnvironment')!;
		closeMenu();
		await configuration.updateValue(GitHubEnvironmentsEnabledSettingId, false);
		await staleAction.run();
		assert.deepStrictEqual({
			actions: openMenu().map(action => action.id),
			updates: update.getCalls().map(call => call.args),
			sharing: sharing.calls,
			message: notificationError.firstCall?.args[0],
		}, {
			actions: ['remoteConnections.off', 'remoteConnections.devTunnel'],
			updates: [[GitHubEnvironmentsEnabledSettingId, false]],
			sharing: [],
			message: new Error('GitHub Environments are disabled by your settings or organization policy.'),
		});
	});

	test('policy-disabled GitHub Environments remain discoverable with an explanation', async () => {
		const { configuration, openMenu } = fixture();
		await configuration.updateValue(GitHubEnvironmentsEnabledSettingId, false);
		stub(configuration, 'inspect').callThrough().withArgs(GitHubEnvironmentsEnabledSettingId).returns({ value: false, policyValue: false });
		const action = openMenu().find(action => action.id === 'remoteConnections.githubEnvironment')!;
		assert.deepStrictEqual({ enabled: action.enabled, detail: action.detail, icon: action.labelIcon }, {
			enabled: false,
			detail: 'Disabled by your organization. Contact your administrator to enable GitHub Environments.',
			icon: Codicon.briefcase,
		});
	});

	test('the policy explanation and setting are keyboard reachable without activating sharing', async () => {
		const { configuration, openMenu, listOptions, instantiation, openSettings, sharing } = fixture();
		await configuration.updateValue(GitHubEnvironmentsEnabledSettingId, false);
		stub(configuration, 'inspect').callThrough().withArgs(GitHubEnvironmentsEnabledSettingId).returns({ value: false, policyValue: false });
		const actions = openMenu();
		instantiation.set(IOpenerService, NullOpenerService);
		const widget = store.add(instantiation.createInstance(
			ActionListWidget<IActionWidgetDropdownAction>,
			'testRemoteConnections', false,
			actions.map(action => ({ kind: ActionListItemKind.Action, label: action.label, disabled: !action.enabled, item: action })),
			{ onHide: () => { }, onSelect: () => assert.fail('Policy help must not select a connection method') },
			undefined,
			listOptions(),
		));
		document.body.appendChild(widget.domNode);
		widget.domNode.appendChild(widget.footerContainer!);
		store.add(toDisposable(() => widget.domNode.remove()));
		widget.layout(320, 200);
		widget.focus();
		const list = widget.domNode.querySelector<HTMLElement>('.monaco-list')!;
		const link = widget.footerContainer!.querySelector<HTMLElement>('.monaco-link')!;
		const key = (target: HTMLElement, key: string, keyCode: number, shiftKey = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, shiftKey, bubbles: true, cancelable: true }));
		key(list, 'Tab', 9);
		const tabFocus = document.activeElement === link;
		key(link, 'Tab', 9, true);
		const shiftTabFocus = document.activeElement === list;
		key(list, 'Tab', 9);
		key(link, 'Enter', 13);
		assert.deepStrictEqual({
			tabFocus, shiftTabFocus,
			describedBy: list.getAttribute('aria-describedby') === widget.footerContainer!.id,
			explanation: widget.footerContainer?.textContent,
			opened: openSettings.args,
			sharing: sharing.calls,
		}, {
			tabFocus: true, shiftTabFocus: true, describedBy: true,
			explanation: 'GitHub Environments is disabled by your organization. Contact your administrator. View Setting',
			opened: [[{ query: `@id:${GitHubEnvironmentsEnabledSettingId}` }]],
			sharing: [],
		});
	});

	test('hard experiment disablement hides GitHub Environments despite user enablement', () => {
		const { availability, configuration, openMenu } = fixture();
		availability.set(false, undefined);
		assert.deepStrictEqual({
			enabledSetting: configuration.getValue(GitHubEnvironmentsEnabledSettingId),
			actions: openMenu().map(action => action.id),
		}, { enabledSetting: true, actions: ['remoteConnections.off', 'remoteConnections.devTunnel'] });
	});

	test('shows distinct method icons without adding an icon to Off', () => {
		const { openMenu } = fixture();
		assert.deepStrictEqual(openMenu().map(action => ({ id: action.id, icon: action.labelIcon?.id })), [
			{ id: 'remoteConnections.off', icon: undefined },
			{ id: 'remoteConnections.devTunnel', icon: 'radio-tower' },
			{ id: 'remoteConnections.githubEnvironment', icon: 'github' },
		]);
	});

	test('keeps the single titlebar button in the toolbar roving tab order', () => {
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
			{ primary: 0, dropdown: 0 },
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
				{ primary: 0, dropdown: 0 },
				{ primary: 0, dropdown: 0 },
				{ primary: 0, dropdown: 0 },
				{ primary: -1, dropdown: -1 },
				{ primary: 0, dropdown: 0 },
			]);
		});

		test(`shows the dropdown on every quality: ${quality ?? 'OSS'}`, () => {
			const { container, primary, dropdown, viewItem, run, update } = fixture('devTunnel', { quality });
			viewItem.focus(true);
			const focusMatchesQuality = document.activeElement === dropdown;
			primary.click();
			viewItem.blur();
			viewItem.setFocusable(false);
			const disabledTabIndex = primary.tabIndex;
			viewItem.setFocusable(true);
			assert.deepStrictEqual({
				dropdownVisible: dropdown !== null,
				buttons: container.querySelectorAll('[role="button"]').length,
				focusMatchesQuality,
				disabledTabIndex,
				enabledTabIndex: primary.tabIndex,
				toggles: run.callCount,
				updates: update.callCount,
			}, {
				dropdownVisible: true,
				buttons: 1,
				focusMatchesQuality: true,
				disabledTabIndex: -1,
				enabledTabIndex: 0,
				toggles: 0,
				updates: 0,
			});
		});
	}

	for (const backend of ['devTunnel', 'githubEnvironment', 'missionControl'] as const) {
		test(`shows Off for disabled ${backend} without enabling sharing`, async () => {
			const { openMenu, update, run, sharing } = fixture(backend);
			const actions = openMenu();
			assert.deepStrictEqual({
				methods: actions.map(action => ({ label: action.label, checked: action.checked })),
				updates: update.callCount,
				toggles: run.callCount,
				sharing: sharing.calls,
			}, {
				methods: [
					{ label: 'Off', checked: true },
					{ label: 'Dev Tunnels', checked: false },
					{ label: 'GitHub Environments', checked: false },
				],
				updates: 0,
				toggles: 0,
				sharing: [],
			});
		});

		test(`selecting the current ${backend} method leaves sharing unchanged`, async () => {
			const { openMenu, update, sharing, remoteTunnel, run } = fixture(backend);
			if (backend === 'devTunnel') {
				remoteTunnel.fireStatus({ type: 'connected', info: { tunnelName: 'tunnel', isAttached: false }, serviceInstallFailed: false });
			} else {
				sharing.state.set('enabled', undefined);
			}
			await openMenu().find(action => action.checked)!.run();
			assert.deepStrictEqual({ updates: update.callCount, toggles: run.callCount, sharing: sharing.calls }, {
				updates: 0, toggles: 0, sharing: [],
			});
		});

		test(`selecting the remembered ${backend} method enables sharing`, async () => {
			const { openMenu, closeMenu, update, run, sharing, remoteTunnel } = fixture(backend);
			await openMenu().find(action => action.id === (backend === 'devTunnel' ? 'remoteConnections.devTunnel' : 'remoteConnections.githubEnvironment'))!.run();
			closeMenu();
			assert.deepStrictEqual({
				checked: openMenu().map(action => action.checked),
				updates: update.callCount,
				toggles: run.callCount,
				sharing: sharing.state.get(),
				tunnel: remoteTunnel.status.type,
			}, {
				checked: [false, backend === 'devTunnel', backend !== 'devTunnel'],
				updates: 0, toggles: 1,
				sharing: backend === 'devTunnel' ? 'disabled' : 'enabled',
				tunnel: backend === 'devTunnel' ? 'connected' : 'disconnected',
			});
		});

		for (const state of ['connecting', 'enabled'] as const) {
			test(`Off stops ${state} ${backend} sharing and the toggle restores the remembered method`, async () => {
				const { openMenu, closeMenu, configuration, update, run, sharing, remoteTunnel } = fixture(backend);
				if (backend === 'devTunnel') {
					remoteTunnel.fireStatus(state === 'connecting' ? { type: 'connecting' } : { type: 'connected', info: { tunnelName: 'tunnel', isAttached: false }, serviceInstallFailed: false });
				} else {
					sharing.state.set(state, undefined);
				}
				const initialChecked = openMenu().map(action => action.checked);
				await openMenu().find(action => action.id === 'remoteConnections.off')!.run();
				closeMenu();
				const disabled = { checked: openMenu().map(action => action.checked), sharing: sharing.state.get(), tunnel: remoteTunnel.status.type };
				closeMenu();
				await run();
				assert.deepStrictEqual({
					initialChecked, disabled,
					restored: openMenu().map(action => action.checked),
					preference: configuration.getValue(AgentHostRemoteConnectionsSettingId),
					updates: update.callCount,
				}, {
					initialChecked: [false, backend === 'devTunnel', backend !== 'devTunnel'],
					disabled: { checked: [true, false, false], sharing: 'disabled', tunnel: 'disconnected' },
					restored: [false, backend === 'devTunnel', backend !== 'devTunnel'],
					preference: backend, updates: 0,
				});
			});
		}
	}

	test('writes selection to the user setting, switches sharing, and refreshes checkmarks on reopen', async () => {
		const { configuration, update, remoteTunnel, sharing, run, openMenu, closeMenu } = fixture();
		await timeout(0);
		remoteTunnel.fireStatus({ type: 'connected', info: { tunnelName: 'tunnel', isAttached: false }, serviceInstallFailed: false });
		await openMenu().find(action => action.id === 'remoteConnections.githubEnvironment')!.run();
		closeMenu();
		const methods = openMenu().map(action => ({ label: action.label, checked: action.checked }));
		assert.deepStrictEqual({
			updates: update.args,
			configuredMethod: configuration.getValue(AgentHostRemoteConnectionsSettingId),
			methods,
			state: remoteTunnel.status.type,
			sharing: sharing.calls,
			toggles: run.callCount,
		}, {
			updates: [[AgentHostRemoteConnectionsSettingId, 'githubEnvironment', ConfigurationTarget.USER]],
			configuredMethod: 'githubEnvironment',
			methods: [{ label: 'Off', checked: false }, { label: 'Dev Tunnels', checked: false }, { label: 'GitHub Environments', checked: true }],
			state: 'disconnected',
			sharing: [false, true],
			toggles: 1,
		});
	});

	test('selects and enables Dev Tunnels from GitHub Environments', async () => {
		const { openMenu, update, run, sharing, remoteTunnel } = fixture('githubEnvironment');
		sharing.state.set('enabled', undefined);
		await openMenu().find(action => action.id === 'remoteConnections.devTunnel')!.run();
		assert.deepStrictEqual({ updates: update.args, toggles: run.callCount, sharing: sharing.calls, tunnel: remoteTunnel.status.type }, {
			updates: [[AgentHostRemoteConnectionsSettingId, 'devTunnel', ConfigurationTarget.USER]], toggles: 1, sharing: [false], tunnel: 'connected',
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
			methods: [{ label: 'Off', checked: true }, { label: 'Dev Tunnels', checked: false }, { label: 'GitHub Environments', checked: false }],
			label: 'Remote Connections: Off',
			pressed: null,
			sharing: [false],
			toggles: 0,
		});
	});

	test('reports a failed preference update and retains the selected method', async () => {
		const { openMenu, closeMenu, update, notifications } = fixture();
		const error = new Error('Unable to save connection method');
		update.rejects(error);
		const notify = stub(notifications, 'error');
		await openMenu().find(action => action.id === 'remoteConnections.githubEnvironment')!.run();
		closeMenu();
		assert.deepStrictEqual({
			errors: notify.args,
			checked: openMenu().map(action => action.checked),
		}, { errors: [[error]], checked: [true, false, false] });
	});

	test('selecting Off while disabled does not enable sharing or change the preference', async () => {
		const { openMenu, update, run } = fixture('githubEnvironment');
		await openMenu().find(action => action.id === 'remoteConnections.off')!.run();
		assert.deepStrictEqual({ updates: update.callCount, toggles: run.callCount }, { updates: 0, toggles: 0 });
	});

	test('reports an enable failure and leaves Off selected', async () => {
		const { openMenu, closeMenu, sharing, notifications } = fixture('githubEnvironment');
		const error = new Error('Unable to enable sharing');
		stub(sharing, 'setEnabled').rejects(error);
		const notify = stub(notifications, 'error');
		await openMenu().find(action => action.id === 'remoteConnections.githubEnvironment')!.run();
		closeMenu();
		assert.deepStrictEqual({ errors: notify.args, checked: openMenu().map(action => action.checked) }, {
			errors: [[error]], checked: [true, false, false],
		});
	});

	test('canceling Dev Tunnel enablement leaves Off selected and remembers the method', async () => {
		const { openMenu, closeMenu, executeCommand, configuration } = fixture('githubEnvironment');
		executeCommand.resolves(undefined);
		await openMenu().find(action => action.id === 'remoteConnections.devTunnel')!.run();
		closeMenu();
		assert.deepStrictEqual({
			checked: openMenu().map(action => action.checked),
			preference: configuration.getValue(AgentHostRemoteConnectionsSettingId),
		}, { checked: [true, false, false], preference: 'devTunnel' });
	});

	test('clicking the single button opens the picker without changing sharing', async () => {
		const { primary, openMenu, run, update } = fixture();
		primary.click();
		openMenu();
		assert.deepStrictEqual({ toggles: run.callCount, updates: update.callCount }, { toggles: 0, updates: 0 });
	});

	test('opens the single button with Enter and restores its focus without toggling sharing', () => {
		const { viewItem, primary, dropdown, run, menuActions, closeMenu } = fixture();
		assert.ok(dropdown);
		viewItem.focus();
		const focused = [document.activeElement === primary];
		dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const expanded = dropdown.getAttribute('aria-expanded');
		closeMenu();
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
			focused: [true, true, true],
			expanded: 'true',
			collapsed: 'false',
			label: 'Remote Connections: Off',
			menuItems: 3,
			toggles: 0,
		});
	});

	test('uses a narrow wrapping picker and the host-owned environment name in its footer', async () => {
		const { sharing, openMenu, closeMenu, listOptions } = fixture('githubEnvironment');
		await timeout(0);
		openMenu();
		const disabled = listOptions();
		closeMenu();
		sharing.state.set('enabled', undefined);
		openMenu();
		assert.deepStrictEqual({
			minWidth: disabled?.minWidth,
			maxWidth: disabled?.maxWidth,
			wrap: disabled?.wrapDetails,
			disabled: disabled?.footerText,
			enabled: listOptions()?.footerText,
		}, {
			minWidth: 300, maxWidth: 320, wrap: true,
			disabled: 'Will be shared as: Test Machine (VS Code Insiders)',
			enabled: 'Registered as GitHub environment: Test Machine (VS Code Insiders)',
		});
	});

	test('the footer name opens a prefilled environment rename input and updates the displayed name', async () => {
		const { quickInput, sharing, openMenu, closeMenu, listOptions } = fixture('githubEnvironment');
		await timeout(0);
		quickInput.result = '  Renamed workstation  ';
		openMenu();
		const rename = listOptions()?.footerAction;
		await rename?.run();
		closeMenu();
		openMenu();
		assert.deepStrictEqual({
			title: quickInput.options?.title,
			value: quickInput.options?.value,
			empty: await quickInput.options?.validateInput?.('   '),
			control: await quickInput.options?.validateInput?.('bad\nname'),
			valid: await quickInput.options?.validateInput?.('Workstation'),
			name: sharing.environmentName.get(),
			footer: listOptions()?.footerText,
			state: sharing.state.get(),
		}, {
			title: 'Rename Remote Environment', value: 'Test Machine (VS Code Insiders)',
			empty: 'Enter an environment name without control characters.',
			control: 'Enter an environment name without control characters.',
			valid: undefined,
			name: 'Renamed workstation',
			footer: 'Will be shared as: Renamed workstation',
			state: 'disabled',
		});
	});

	test('canceling rename leaves the environment unchanged', async () => {
		const { sharing, openMenu, listOptions } = fixture('githubEnvironment');
		await timeout(0);
		const rename = stub(sharing, 'setEnvironmentName');
		openMenu();
		await listOptions()?.footerAction?.run();
		assert.strictEqual(rename.callCount, 0);
	});

	test('the Dev Tunnel name link uses the existing validated tunnel rename input', async () => {
		const { quickInput, configuration, openMenu, listOptions } = fixture();
		await timeout(0);
		quickInput.result = 'renamed-tunnel';
		openMenu();
		await listOptions()?.footerAction?.run();
		assert.deepStrictEqual({ title: quickInput.options?.title, name: configuration.getValue(CONFIGURATION_KEY_HOST_NAME) }, {
			title: 'Rename Tunnel', name: 'renamed-tunnel',
		});
	});

	test('reports a failed environment rename', async () => {
		const { quickInput, sharing, notifications, openMenu, listOptions } = fixture('githubEnvironment');
		await timeout(0);
		const error = new Error('Unable to rename environment');
		stub(sharing, 'setEnvironmentName').rejects(error);
		const notify = stub(notifications, 'error');
		quickInput.result = 'New name';
		openMenu();
		await listOptions()?.footerAction?.run();
		assert.deepStrictEqual(notify.args, [[error]]);
	});

	test('uses the connected tunnel name instead of a stale intended name in the footer', async () => {
		const { remoteTunnel, openMenu, listOptions } = fixture();
		await timeout(0);
		remoteTunnel.fireStatus({ type: 'connected', info: { tunnelName: 'assigned-tunnel', isAttached: true }, serviceInstallFailed: false });
		openMenu();
		assert.strictEqual(listOptions()?.footerText, 'Shared as Dev Tunnel: assigned-tunnel');
	});

	test('refreshes the intended tunnel name after a rename while sharing is off', async () => {
		const { remoteTunnel, configuration, openMenu, closeMenu, listOptions } = fixture();
		await timeout(0);
		openMenu();
		const before = listOptions()?.footerText;
		closeMenu();
		remoteTunnel.name = 'renamed-tunnel';
		await configuration.updateValue(CONFIGURATION_KEY_HOST_NAME, 'renamed-tunnel');
		await timeout(0);
		openMenu();
		assert.deepStrictEqual({ before, after: listOptions()?.footerText }, {
			before: 'Will be shared as: test-tunnel',
			after: 'Will be shared as: renamed-tunnel',
		});
	});

	test('reloads names once per change without accumulating subscriptions after tunnel renames', async () => {
		const { remoteTunnel, configuration, sharing, viewItem } = fixture('githubEnvironment');
		await timeout(0);
		const loadName = stub(remoteTunnel, 'getTunnelName').callThrough();
		sharing.environmentName.set('First environment name', undefined);
		await timeout(0);
		const initialEnvironmentChange = loadName.callCount;
		await configuration.updateValue(CONFIGURATION_KEY_HOST_NAME, 'first-tunnel');
		await configuration.updateValue(CONFIGURATION_KEY_HOST_NAME, 'second-tunnel');
		await timeout(0);
		const afterTunnelRenames = loadName.callCount;
		sharing.environmentName.set('Second environment name', undefined);
		await timeout(0);
		const afterEnvironmentChange = loadName.callCount;
		viewItem.dispose();
		sharing.environmentName.set('After disposal', undefined);
		await timeout(0);
		assert.deepStrictEqual({
			initialEnvironmentChange,
			afterTunnelRenames,
			afterEnvironmentChange,
			afterDisposal: loadName.callCount,
		}, {
			initialEnvironmentChange: 1,
			afterTunnelRenames: 3,
			afterEnvironmentChange: 4,
			afterDisposal: 4,
		});
	});

	test('a stale menu cannot enable sharing after the parent action is disabled', async () => {
		const { action, openMenu, run, update } = fixture();
		const actions = openMenu();
		action.enabled = false;
		await actions.find(action => action.id === 'remoteConnections.githubEnvironment')!.run();
		assert.deepStrictEqual({ updates: update.callCount, toggles: run.callCount }, { updates: 0, toggles: 0 });
	});
});

suite('ToggleRemoteConnectionsActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	test('GitHub sharing hover keeps the description concise', () => {
		const viewItem = Object.assign(Object.create(ToggleRemoteConnectionsActionViewItem.prototype), {
			_usesMissionControl: () => true,
			getAriaLabel: () => 'Allow Remote Connections via GitHub environment',
		}) as { _getHoverContent(): string };
		assert.strictEqual(viewItem._getHoverContent(), 'Allow Remote Connections via GitHub environment\n\nAccess agents on this machine from VS Code, vscode.dev/agents, GitHub apps, or github.com/copilot.');
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
