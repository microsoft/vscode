/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { getAgentHostCopilotSandboxSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IConfigurationService, IConfigurationValue, ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../platform/opener/test/common/nullOpenerService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatPetService } from '../../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { IChatPhoneInputPresenter } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { resetShownWarnings } from '../../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js';
import { ChatConfiguration } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { IOpenSettingsOptions, IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { AGENT_HOST_PERMISSIONS_SETTINGS_QUERY } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostModePicker } from '../../browser/agentHostModePicker.js';
import { AgentHostPermissionPickerDelegate } from '../../browser/agentHostPermissionPickerDelegate.js';
import { PickerActionViewItem } from '../../browser/agentHostSessionConfigPicker.js';

suite('AgentHostModePicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => resetShownWarnings());

	function setup(enabled = true, confirmPermissions = true, policyRestricted = false) {
		const config: ResolveSessionConfigResult = {
			schema: {
				type: 'object',
				properties: {
					mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], enumLabels: ['Interactive', 'Plan', 'Autopilot'] },
					autoApprove: { type: 'string', title: 'Permissions', enum: ['default', 'assisted', 'autoApprove'] },
				},
			},
			values: { mode: 'interactive', autoApprove: 'default' },
		};
		const configChanged = store.add(new Emitter<string>());
		const resolving = observableValue('resolving', false);
		const writes: { session: string; property: string; value: unknown }[] = [];
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = 'local-agent-host';
			override readonly onDidChangeSessionConfig = configChanged.event;
			override getSessionConfig() { return config; }
			override isSessionConfigResolving() { return resolving; }
			override async setSessionConfigValue(session: string, property: string, value: unknown): Promise<void> {
				writes.push({ session, property, value });
				config.values[property] = value;
				configChanged.fire(session);
			}
		}();
		const providers = new Map<string, ISessionsProvider>([[provider.id, provider]]);
		const session = observableValue<IActiveSession | undefined>('session', new class extends mock<IActiveSession>() {
			override readonly providerId = provider.id;
			override readonly sessionId = 'test-session';
			override readonly sessionType = 'copilotcli';
		}());
		const phone = observableValue('phone', false);
		const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
		const configuration = new class extends TestConfigurationService {
			override inspect<T>(key: string): IConfigurationValue<T> {
				const result = super.inspect<T>(key);
				return { ...result, policyValue: policyRestricted && key === ChatConfiguration.GlobalAutoApprove ? result.value : undefined };
			}
		}({
			[ChatConfiguration.ExperimentalModePermissionsPicker]: enabled,
			[ChatConfiguration.AssistedPermissionsEnabled]: true,
			[ChatConfiguration.PermissionsSandboxToggleEnabled]: true,
			[ChatConfiguration.GlobalAutoApprove]: false,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const actionWidget = new class extends mock<IActionWidgetService>() {
			override isVisible = false;
			items: readonly IActionListItem<unknown>[] = [];
			anchor: Parameters<IActionWidgetService['show']>[4] | undefined;
			options: IActionListOptions | undefined;
			select: (label: string) => void = () => { };
			onHide: (() => void) | undefined;
			override show<T>(_id: string, _preview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>, anchor: Parameters<IActionWidgetService['show']>[4], _container: Parameters<IActionWidgetService['show']>[5], _actions?: Parameters<IActionWidgetService['show']>[6], _accessibility?: Parameters<IActionWidgetService['show']>[7], options?: IActionListOptions): void {
				this.items = items;
				this.anchor = anchor;
				this.options = options;
				this.isVisible = true;
				this.onHide = delegate.onHide;
				this.select = label => {
					const item = items.find(item => item.label === label)?.item;
					if (item) {
						delegate.onSelect(item);
					}
				};
			}
			override hide(): void {
				this.isVisible = false;
				const onHide = this.onHide;
				this.onHide = undefined;
				onHide?.();
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		const settingsRequests: IOpenSettingsOptions[] = [];
		const hoverTargets: HTMLElement[] = [];
		instantiationService.set(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProviders() { return [...providers.values()]; }
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined { return providers.get(id) as T | undefined; }
		}());
		instantiationService.set(IActionWidgetService, actionWidget);
		instantiationService.set(IConfigurationService, configuration);
		instantiationService.set(IDialogService, new TestDialogService(undefined, { result: confirmPermissions }));
		instantiationService.stub(IHoverService, {
			setupDelayedHover: target => {
				hoverTargets.push(target);
				return { dispose: () => { } };
			},
		});
		instantiationService.set(IOpenerService, NullOpenerService);
		instantiationService.set(IStorageService, store.add(new TestStorageService()));
		instantiationService.set(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IPreferencesService, {
			openSettings: async options => {
				assert.ok(options);
				settingsRequests.push(options);
				return undefined;
			},
		});
		instantiationService.stub(IChatPetService, { unlockAchievement: () => false });
		instantiationService.stub(IChatPhoneInputPresenter, { enabled: phone });
		instantiationService.stub(IAgentHostEnablementService, { enabled: constObservable(true), managedSandboxEnforced, managedSandboxAllowsBypass: constObservable(false) });

		const picker = store.add(instantiationService.createInstance(AgentHostModePicker, session));
		const permissionDelegate = store.add(instantiationService.createInstance(AgentHostPermissionPickerDelegate, session));
		const container = dom.append(document.body, dom.$('div'));
		store.add({ dispose: () => container.remove() });
		const trigger = picker.render(container);
		return { picker, trigger, config, configChanged, configuration, actionWidget, writes, session, phone, resolving, permissionDelegate, managedSandboxEnforced, settingsRequests, hoverTargets };
	}

	test('uses one shared tooltip for the combined label', () => {
		const { trigger, hoverTargets } = setup();
		assert.deepStrictEqual(hoverTargets.map(target => target === trigger), [true]);
	});

	test('combines labels with one icon and places the permissions flyout below the modes', () => {
		const { trigger, actionWidget, permissionDelegate } = setup();
		trigger.click();
		assert.deepStrictEqual({
			mode: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			permissions: trigger.querySelector('.agent-host-mode-permission-summary')?.textContent,
			icons: trigger.querySelectorAll('.codicon').length,
			separatePermissionsVisible: permissionDelegate.isApplicable.get(),
			rows: actionWidget.items.map(item => item.label ?? item.kind),
			permissionLevels: actionWidget.items.at(-1)?.submenu?.items.filter(item => item.detail).map(item => item.label),
			aria: trigger.ariaLabel,
		}, {
			mode: 'Interactive',
			permissions: 'Manual permissions',
			icons: 1,
			separatePermissionsVisible: false,
			rows: ['Interactive', 'Plan', 'Autopilot', ActionListItemKind.Separator, 'Permissions'],
			permissionLevels: ['Manual permissions', 'Assisted permissions', 'Allow all'],
			aria: 'Pick Mode and Permissions, Interactive, Manual permissions',
		});
	});

	test('preserves independent mode and permission selections', async () => {
		const { trigger, actionWidget, writes } = setup();
		trigger.click();
		const allowAll = actionWidget.items.at(-1)?.submenu?.items.find(item => item.label === 'Allow all')?.item;
		assert.ok(allowAll);
		await allowAll.run();
		trigger.click();
		actionWidget.select('Plan');
		assert.deepStrictEqual({
			writes,
			mode: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			permissionColor: trigger.querySelector('.agent-host-mode-permission-summary')?.classList.contains('info'),
			modeColor: trigger.classList.contains('info'),
		}, {
			writes: [{ session: 'test-session', property: 'autoApprove', value: 'autoApprove' }, { session: 'test-session', property: 'mode', value: 'plan' }],
			mode: 'Plan',
			permissionColor: true,
			modeColor: false,
		});
	});

	test('opens above the activated mode or permissions button and restores its focus', () => {
		const { trigger, actionWidget } = setup();
		const modeButton = trigger.querySelector<HTMLElement>('.agent-host-mode-button')!;
		const permissionsButton = trigger.querySelector<HTMLElement>('.agent-host-permissions-button')!;
		const states = [];
		for (const button of [modeButton, permissionsButton]) {
			button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			const state = {
				anchorMatches: actionWidget.anchor === button,
				above: actionWidget.options?.anchorPosition === AnchorPosition.ABOVE,
				submenu: actionWidget.options?.initialSubmenuId,
				expanded: button.ariaExpanded,
			};
			actionWidget.hide();
			states.push({ ...state, focusRestored: document.activeElement === button });
		}
		assert.deepStrictEqual(states, [
			{ anchorMatches: true, above: true, submenu: undefined, expanded: 'true', focusRestored: true },
			{ anchorMatches: true, above: true, submenu: 'agentHostModePicker.permissions', expanded: 'true', focusRestored: true },
		]);
	});

	test('toolbar focus follows the current mode button when the setting changes live', async () => {
		const { picker, configuration } = setup();
		const item = store.add(new PickerActionViewItem(picker));
		const container = dom.append(document.body, dom.$('div'));
		store.add({ dispose: () => container.remove() });
		item.render(container);
		item.setFocusable(true);
		const states = [];
		for (const enabled of [true, false, true]) {
			await configuration.setUserConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker, enabled);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === ChatConfiguration.ExperimentalModePermissionsPicker,
				affectedKeys: new Set([ChatConfiguration.ExperimentalModePermissionsPicker]),
				source: ConfigurationTarget.USER,
				change: { keys: [ChatConfiguration.ExperimentalModePermissionsPicker], overrides: [] },
			});
			item.focus();
			const target = container.querySelector<HTMLElement>(enabled ? '.agent-host-mode-button' : '.action-label')!;
			states.push({ enabled, focusedButton: document.activeElement === target && target.role === 'button', itemFocused: item.isFocused() });
		}
		assert.deepStrictEqual(states, [true, false, true].map(enabled => ({ enabled, focusedButton: true, itemFocused: true })));
	});

	test('preserves the split trigger elements when configuration changes', () => {
		const { trigger, config, configChanged } = setup();
		const modeButton = trigger.querySelector<HTMLElement>('.agent-host-mode-button')!;
		const permissionsButton = trigger.querySelector('.agent-host-permissions-button');
		modeButton.focus();
		config.values.mode = 'plan';
		config.values.autoApprove = 'assisted';
		configChanged.fire('test-session');
		assert.deepStrictEqual({
			sameModeButton: trigger.querySelector('.agent-host-mode-button') === modeButton,
			samePermissionsButton: trigger.querySelector('.agent-host-permissions-button') === permissionsButton,
			mode: modeButton?.textContent,
			permissions: permissionsButton?.textContent,
			focusPreserved: document.activeElement === modeButton,
		}, { sameModeButton: true, samePermissionsButton: true, mode: 'Plan', permissions: 'Assisted permissions', focusPreserved: true });
	});

	test('opens permission settings from the gear without changing session configuration', async () => {
		const { trigger, actionWidget, settingsRequests, writes } = setup();
		trigger.click();
		const gear = actionWidget.items.at(-1)?.toolbarActions?.[0];
		assert.ok(gear);
		await gear.run();
		assert.deepStrictEqual({
			label: gear.label,
			icon: gear.class,
			menuOpen: actionWidget.isVisible,
			settingsRequests,
			writes,
			triggerIcons: trigger.querySelectorAll('.codicon').length,
		}, {
			label: 'Configure Permissions',
			icon: 'codicon codicon-gear',
			menuOpen: false,
			settingsRequests: [{ jsonEditor: false, query: AGENT_HOST_PERMISSIONS_SETTINGS_QUERY }],
			writes: [],
			triggerIcons: 1,
		});
	});

	test('does not change permissions when the elevated warning is cancelled', async () => {
		resetShownWarnings();
		const { trigger, actionWidget, writes } = setup(true, false);
		trigger.click();
		await actionWidget.items.at(-1)?.submenu?.items.find(item => item.label === 'Allow all')?.item?.run();
		assert.deepStrictEqual(writes, []);
	});

	test('does not apply a permission selection to a different active session', async () => {
		const { trigger, actionWidget, session, writes } = setup();
		trigger.click();
		const selection = actionWidget.items.at(-1)?.submenu?.items.find(item => item.label === 'Allow all')?.item?.run();
		session.set(new class extends mock<IActiveSession>() {
			override readonly providerId = 'local-agent-host';
			override readonly sessionId = 'another-session';
			override readonly sessionType = 'copilotcli';
		}(), undefined);
		await selection;
		assert.deepStrictEqual(writes, []);
	});

	test('preserves enterprise policy restrictions in the permissions flyout', () => {
		const { trigger, actionWidget, managedSandboxEnforced } = setup(true, true, true);
		managedSandboxEnforced.set(true, undefined);
		trigger.click();
		const items = actionWidget.items.at(-1)?.submenu?.items ?? [];
		assert.deepStrictEqual({
			levels: items.filter(item => item.detail).map(item => ({ label: item.label, disabled: item.disabled })),
			sandboxDisabled: items.find(item => item.standaloneToggle)?.standaloneToggle?.disabled,
		}, {
			levels: [
				{ label: 'Manual permissions', disabled: false },
				{ label: 'Assisted permissions', disabled: true },
				{ label: 'Allow all', disabled: true },
			],
			sandboxDisabled: true,
		});
	});

	test('always shows the shield on the sandbox toggle row', async () => {
		const { trigger, actionWidget, configuration } = setup();
		const states = [];
		for (const enabled of [false, true]) {
			await configuration.setUserConfiguration(getAgentHostCopilotSandboxSettingId(false), enabled ? 'on' : 'off');
			trigger.click();
			const sandboxRow = actionWidget.items.at(-1)?.submenu?.items.find(item => item.standaloneToggle);
			states.push({ checked: sandboxRow?.standaloneToggle?.checked, icon: sandboxRow?.group?.icon?.id });
			actionWidget.hide();
		}
		assert.deepStrictEqual(states, [{ checked: false, icon: 'shield' }, { checked: true, icon: 'shield' }]);
	});

	test('updates the gate live and leaves other harnesses and phone layout unchanged', async () => {
		const { trigger, configuration, session, phone, permissionDelegate } = setup(false);
		const states: boolean[][] = [];
		const record = () => states.push([!!trigger.querySelector('.agent-host-mode-permission-summary'), permissionDelegate.isApplicable.get()]);
		record();
		await configuration.setUserConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker, true);
		configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: key => key === ChatConfiguration.ExperimentalModePermissionsPicker, affectedKeys: new Set([ChatConfiguration.ExperimentalModePermissionsPicker]), source: ConfigurationTarget.USER, change: { keys: [ChatConfiguration.ExperimentalModePermissionsPicker], overrides: [] } });
		record();
		phone.set(true, undefined);
		record();
		phone.set(false, undefined);
		session.set(new class extends mock<IActiveSession>() {
			override readonly providerId = 'local-agent-host';
			override readonly sessionId = 'claude-session';
			override readonly sessionType = 'claude';
		}(), undefined);
		record();
		assert.deepStrictEqual(states, [[false, true], [true, false], [false, true], [false, true]]);
	});

	test('announces sandboxing and disables activation while configuration resolves', async () => {
		const { trigger, configuration, managedSandboxEnforced, resolving, actionWidget } = setup();
		await configuration.setUserConfiguration(getAgentHostCopilotSandboxSettingId(false), 'on');
		managedSandboxEnforced.set(true, undefined);
		resolving.set(true, undefined);
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		assert.deepStrictEqual({
			icons: trigger.querySelectorAll('.codicon').length,
			shields: trigger.querySelectorAll('.agent-host-mode-sandbox-icon').length,
			aria: trigger.ariaLabel,
			disabled: trigger.ariaDisabled,
			menuOpen: actionWidget.isVisible,
		}, {
			icons: 2,
			shields: 1,
			aria: 'Pick Mode and Permissions, Interactive, Manual permissions, terminal sandboxed',
			disabled: 'true',
			menuOpen: false,
		});
	});
});
