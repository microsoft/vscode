/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { timeout } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { AnchorPosition } from '../../../../../../base/common/layout.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { getAgentHostCopilotSandboxSettingId, IAgentConnection, IAgentHostNetworkDiagnosticsInfo } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
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
import { AGENT_HOST_PERMISSIONS_SETTINGS_QUERY, MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostModePicker } from '../../browser/agentHostModePicker.js';
import { AgentHostPermissionPickerDelegate } from '../../browser/agentHostPermissionPickerDelegate.js';
import { PickerActionViewItem } from '../../browser/agentHostSessionConfigPicker.js';
import '../../../../chat/browser/media/chatWidget.css';
import '../../../../chat/browser/media/chatInput.css';

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
					[SessionConfigKey.SandboxEnabled]: { type: 'string', title: 'Sandbox', enum: ['default', 'on', 'off'], sessionMutable: true },
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
			override trackSessionConfigOperation(): void { }
		}();
		const providers = new Map<string, ISessionsProvider>([[provider.id, provider]]);
		const session = observableValue<IActiveSession | undefined>('session', new class extends mock<IActiveSession>() {
			override readonly providerId = provider.id;
			override readonly sessionId = 'test-session';
			override readonly sessionType = 'copilotcli';
			override readonly resource = URI.parse('agent-host-copilotcli:/test-session');
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
			updateCount = 0;
			items: readonly IActionListItem<unknown>[] = [];
			anchor: Parameters<IActionWidgetService['show']>[4] | undefined;
			options: IActionListOptions | undefined;
			selectedLabels: (string | undefined)[] = [];
			select: (label: string) => Promise<void> = async () => { };
			onHide: (() => void) | undefined;
			override show<T>(_id: string, _preview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>, anchor: Parameters<IActionWidgetService['show']>[4], _container: Parameters<IActionWidgetService['show']>[5], _actions?: Parameters<IActionWidgetService['show']>[6], _accessibility?: Parameters<IActionWidgetService['show']>[7], options?: IActionListOptions): void {
				this.items = items;
				this.anchor = anchor;
				this.options = options;
				this.selectedLabels = items.filter(item => _accessibility?.isChecked?.(item) === true).map(item => item.label);
				this.isVisible = true;
				this.onHide = delegate.onHide;
				this.select = async label => {
					const item = items.find(item => item.label === label)?.item;
					if (item) {
						await delegate.onSelect(item);
					}
				};
			}
			override updateItems<T>(items: readonly IActionListItem<T>[]): void {
				this.items = items;
				this.updateCount++;
			}
			override hide(): void {
				this.isVisible = false;
				const onHide = this.onHide;
				this.onHide = undefined;
				onHide?.();
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		const connection = new class extends mock<IAgentConnection>() {
			override async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
				return { version: '1', os: 'linux', arch: 'x64', proxySettings: {}, proxyEnv: {}, endpoints: [] };
			}
		}();
		instantiationService.stub(IAgentHostConnectionsService, {
			onDidChangeSessionResolution: Event.None,
			resolveSessionResource: resource => ({ connection, connectionAuthority: 'local', backendSession: resource }),
		});
		instantiationService.set(ILogService, store.add(new NullLogService()));
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

	test('reconciles external sandbox changes without refreshing matching session echoes', async () => {
		const { picker, trigger, config, configChanged, actionWidget, writes } = setup();
		await timeout(0);
		picker.showPicker(trigger);
		const toggle = actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle;
		assert.ok(toggle);
		toggle.onChange(true);
		const matchingUpdateCount = actionWidget.updateCount;
		const shieldAfterClick = !!trigger.querySelector('.agent-host-mode-sandbox-icon');
		config.values[SessionConfigKey.SandboxEnabled] = 'off';
		configChanged.fire('test-session');
		const checked = actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle?.checked;
		const shieldAfterExternalChange = !!trigger.querySelector('.agent-host-mode-sandbox-icon');
		const externalUpdateCount = actionWidget.updateCount;
		const menuOpen = actionWidget.isVisible;
		actionWidget.hide();
		config.values[SessionConfigKey.SandboxEnabled] = 'on';
		configChanged.fire('test-session');
		assert.deepStrictEqual({ writes, matchingUpdateCount, externalUpdateCount, checked, shieldAfterClick, shieldAfterExternalChange, menuOpen, afterCloseUpdateCount: actionWidget.updateCount }, {
			writes: [{ session: 'test-session', property: SessionConfigKey.SandboxEnabled, value: 'on' }],
			matchingUpdateCount: 0,
			externalUpdateCount: 1,
			checked: false,
			shieldAfterClick: true,
			shieldAfterExternalChange: false,
			menuOpen: true,
			afterCloseUpdateCount: 1,
		});
	});

	test('new-chat controls keep the same padding and compact dimensions as in-session controls', () => {
		const states = [];
		for (const newChat of [false, true]) {
			const { picker, config, configChanged } = setup();
			config.values[SessionConfigKey.SandboxEnabled] = 'on';
			configChanged.fire('test-session');
			const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
			store.add({ dispose: () => workbench.remove() });
			workbench.style.setProperty('--vscode-spacing-size20', '2px');
			workbench.style.setProperty('--vscode-spacing-size40', '4px');
			workbench.style.setProperty('--vscode-spacing-size60', '6px');
			workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			const host = dom.append(workbench, dom.$(newChat ? '.new-chat-widget-container.revealed' : '.interactive-session'));
			const toolbar = dom.append(host, dom.$(newChat ? '.new-chat-bottom-container' : '.chat-secondary-toolbar'));
			const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
			const actions = dom.append(actionBar, dom.$('ul.actions-container'));
			const item = dom.append(actions, dom.$('li.action-item'));
			const trigger = picker.render(item);
			const mode = trigger.querySelector<HTMLElement>('.agent-host-mode-button')!;
			const permissions = trigger.querySelector<HTMLElement>('.agent-host-permissions-button')!;
			const leftInset = mode.firstElementChild!.getBoundingClientRect().left - trigger.getBoundingClientRect().left;
			const gap = permissions.firstElementChild!.getBoundingClientRect().left - mode.lastElementChild!.getBoundingClientRect().right;
			const rightInset = trigger.getBoundingClientRect().right - permissions.lastElementChild!.getBoundingClientRect().right;
			const expanded = {
				padding: dom.getWindow(trigger).getComputedStyle(trigger).padding,
				height: trigger.getBoundingClientRect().height,
				gap,
				leftInset,
				rightInset,
				totalChrome: leftInset + gap + rightInset,
				iconSizes: Array.from(trigger.querySelectorAll<HTMLElement>('.codicon'), icon => {
					const bounds = icon.getBoundingClientRect();
					return { width: bounds.width, height: bounds.height, fontSize: dom.getWindow(icon).getComputedStyle(icon).fontSize };
				}),
			};
			item.classList.add('compact-picker');
			const compact = {
				width: trigger.getBoundingClientRect().width,
				height: trigger.getBoundingClientRect().height,
				permissions: dom.getWindow(permissions).getComputedStyle(permissions).display,
			};
			states.push({ newChat, expanded, compact });
		}
		assert.deepStrictEqual(states, [false, true].map(newChat => ({
			newChat,
			expanded: {
				padding: '0px',
				height: 22,
				gap: 10,
				leftInset: 4,
				rightInset: 4,
				totalChrome: 18,
				iconSizes: [
					{ width: 12, height: 12, fontSize: '12px' },
					{ width: 12, height: 12, fontSize: '12px' },
				],
			},
			compact: { width: 22, height: 22, permissions: 'none' },
		})));
	});

	test('combines labels with one icon and places expandable permissions below the modes', async () => {
		const { trigger, actionWidget, permissionDelegate } = setup();
		await timeout(0);
		trigger.click();
		assert.deepStrictEqual({
			mode: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			permissions: trigger.querySelector('.agent-host-mode-permission-summary')?.textContent,
			icons: trigger.querySelectorAll('.codicon').length,
			separatePermissionsVisible: permissionDelegate.isApplicable.get(),
			rows: actionWidget.items.map(item => item.kind === ActionListItemKind.Separator ? item.kind : item.label),
			permissionLevels: actionWidget.items.filter(item => item.detail).map(item => item.label),
			aria: trigger.ariaLabel,
		}, {
			mode: 'Interactive',
			permissions: 'Manual permissions',
			icons: 1,
			separatePermissionsVisible: false,
			rows: ['Agent mode', 'Interactive', 'Plan', 'Autopilot', ActionListItemKind.Separator, 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', ActionListItemKind.Separator, 'Sandboxing for terminal', ActionListItemKind.Separator, 'Learn more about permissions'],
			permissionLevels: ['Manual permissions', 'Assisted permissions', 'Allow all'],
			aria: 'Pick Mode and Permissions, Interactive, Manual permissions',
		});
	});

	test('the combined picker gate enables inline permissions and retains their actions', async () => {
		const { trigger, configuration, actionWidget, writes, phone } = setup(false);
		trigger.click();
		const disabled = actionWidget.items.map(item => item.label);
		actionWidget.hide();
		await configuration.setUserConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker, true);
		configuration.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === ChatConfiguration.ExperimentalModePermissionsPicker,
			affectedKeys: new Set([ChatConfiguration.ExperimentalModePermissionsPicker]),
			source: ConfigurationTarget.USER,
			change: { keys: [ChatConfiguration.ExperimentalModePermissionsPicker], overrides: [] },
		});
		trigger.querySelector<HTMLElement>('.agent-host-permissions-button')!.click();
		const header = actionWidget.items.find(item => item.className?.includes('agent-host-mode-permissions'));
		const modeHeader = actionWidget.items.find(item => item.className === 'agent-host-mode-section');
		const enabled = {
			header: header?.label,
			modeHeader: { label: modeHeader?.label, summary: modeHeader?.description, aria: modeHeader?.ariaDescription },
			selected: actionWidget.selectedLabels,
			focusItem: actionWidget.options?.initialFocusItemId,
			collapsed: actionWidget.options?.collapsedByDefault,
			levels: actionWidget.items.filter(item => item.detail).map(item => item.label),
		};
		await actionWidget.select('Allow all');
		phone.set(true, undefined);
		trigger.click();
		assert.deepStrictEqual({
			disabled,
			enabled,
			writes,
			phoneSections: actionWidget.items.some(item => item.isSectionToggle),
		}, {
			disabled: ['Interactive', 'Plan', 'Autopilot'],
			enabled: {
				header: 'Permissions',
				modeHeader: { label: 'Agent mode', summary: 'Interactive', aria: 'Current mode: Interactive' },
				selected: ['Interactive', 'Manual permissions'],
				focusItem: 'permissionPicker.default',
				collapsed: new Set(['agentHostModePicker.mode']),
				levels: ['Manual permissions', 'Assisted permissions', 'Allow all'],
			},
			writes: [{ session: 'test-session', property: 'autoApprove', value: 'autoApprove' }],
			phoneSections: false,
		});
	});

	test('refreshes both stacked selection indicators when reopening after a change', async () => {
		const { trigger, actionWidget } = setup();
		trigger.click();
		await actionWidget.select('Plan');
		trigger.click();
		await actionWidget.select('Allow all');
		trigger.click();
		assert.deepStrictEqual({
			selected: actionWidget.selectedLabels,
			modeSummary: actionWidget.items.find(item => item.className === 'agent-host-mode-section')?.description,
		}, {
			selected: ['Plan', 'Allow all'],
			modeSummary: 'Plan',
		});
	});

	test('switches the combined picker gate live without changing session configuration', async () => {
		const { trigger, configuration, actionWidget, writes } = setup();
		const states = [];
		for (const combined of [false, true]) {
			trigger.click();
			await configuration.setUserConfiguration(ChatConfiguration.ExperimentalModePermissionsPicker, combined);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === ChatConfiguration.ExperimentalModePermissionsPicker,
				affectedKeys: new Set([ChatConfiguration.ExperimentalModePermissionsPicker]),
				source: ConfigurationTarget.USER,
				change: { keys: [ChatConfiguration.ExperimentalModePermissionsPicker], overrides: [] },
			});
			const closedAfterChange = !actionWidget.isVisible;
			trigger.click();
			states.push({ closedAfterChange, inlinePermissions: actionWidget.items.some(item => item.isSectionToggle) });
			actionWidget.hide();
		}
		assert.deepStrictEqual({ states, writes }, {
			states: [{ closedAfterChange: true, inlinePermissions: false }, { closedAfterChange: true, inlinePermissions: true }],
			writes: [],
		});
	});

	test('preserves independent mode and permission selections', async () => {
		const { trigger, actionWidget, writes } = setup();
		trigger.click();
		await actionWidget.select('Allow all');
		trigger.click();
		await actionWidget.select('Plan');
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
				initialFocusItem: actionWidget.options?.initialFocusItemId,
				collapsed: [...actionWidget.options?.collapsedByDefault ?? []],
				expanded: button.ariaExpanded,
				rowOpen: trigger.getAttribute(MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE),
			};
			actionWidget.hide();
			states.push({
				...state,
				rowClosed: !trigger.hasAttribute(MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE),
				focusRestored: document.activeElement === button,
			});
		}
		assert.deepStrictEqual(states, [
			{ anchorMatches: true, above: true, initialFocusItem: 'interactive', collapsed: ['agentHostModePicker.permissions'], expanded: 'true', rowOpen: 'true', rowClosed: true, focusRestored: true },
			{ anchorMatches: true, above: true, initialFocusItem: 'permissionPicker.default', collapsed: ['agentHostModePicker.mode'], expanded: 'true', rowOpen: 'true', rowClosed: true, focusRestored: true },
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
		const gear = actionWidget.items.find(item => item.toolbarActions?.length)?.toolbarActions?.[0];
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
		await actionWidget.select('Allow all');
		assert.deepStrictEqual(writes, []);
	});

	test('does not apply a permission selection to a different active session', async () => {
		const { trigger, actionWidget, session, writes } = setup();
		trigger.click();
		const selection = actionWidget.select('Allow all');
		session.set(new class extends mock<IActiveSession>() {
			override readonly providerId = 'local-agent-host';
			override readonly sessionId = 'another-session';
			override readonly sessionType = 'copilotcli';
		}(), undefined);
		await selection;
		assert.deepStrictEqual(writes, []);
	});

	test('preserves enterprise policy restrictions in the permission choices', async () => {
		const { trigger, actionWidget, managedSandboxEnforced } = setup(true, true, true);
		await timeout(0);
		managedSandboxEnforced.set(true, undefined);
		trigger.click();
		const items = actionWidget.items;
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
		await timeout(0);
		const states = [];
		for (const enabled of [false, true]) {
			await configuration.setUserConfiguration(getAgentHostCopilotSandboxSettingId(false), enabled ? 'on' : 'off');
			trigger.click();
			const sandboxRow = actionWidget.items.find(item => item.standaloneToggle);
			states.push({ checked: sandboxRow?.standaloneToggle?.checked, icon: sandboxRow?.group?.icon?.id });
			actionWidget.hide();
		}
		assert.deepStrictEqual(states, [{ checked: false, icon: 'shield' }, { checked: true, icon: 'shield' }]);
	});

	test('refreshes inherited sandbox defaults without overriding an explicit session choice', async () => {
		const { trigger, actionWidget, configuration, config, configChanged, writes } = setup();
		await timeout(0);
		const settingId = getAgentHostCopilotSandboxSettingId(false);
		const states = [];
		trigger.click();
		for (const enabled of [true, false, true]) {
			await configuration.setUserConfiguration(settingId, enabled ? 'on' : 'off');
			configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: key => key === settingId, affectedKeys: new Set([settingId]), source: ConfigurationTarget.USER, change: { keys: [settingId], overrides: [] } });
			states.push({ checked: actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle?.checked, updates: actionWidget.updateCount });
			config.values[SessionConfigKey.SandboxEnabled] = 'on';
			configChanged.fire('test-session');
		}
		assert.deepStrictEqual({ states, writes, menuOpen: actionWidget.isVisible }, {
			states: [{ checked: true, updates: 1 }, { checked: true, updates: 1 }, { checked: true, updates: 1 }],
			writes: [],
			menuOpen: true,
		});
	});

	test('closes on managed policy changes and rejects stale sandbox callbacks', async () => {
		const { trigger, actionWidget, managedSandboxEnforced, writes } = setup();
		await timeout(0);
		trigger.click();
		const toggle = actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle;
		assert.ok(toggle);
		managedSandboxEnforced.set(true, undefined);
		const closedOnPolicyChange = !actionWidget.isVisible;
		toggle.onChange(true);
		trigger.click();
		const reopenedToggle = actionWidget.items.find(item => item.standaloneToggle)?.standaloneToggle;
		assert.deepStrictEqual({ closedOnPolicyChange, writes, updates: actionWidget.updateCount, checked: reopenedToggle?.checked, disabled: reopenedToggle?.disabled }, {
			closedOnPolicyChange: true, writes: [], updates: 0, checked: true, disabled: true,
		});
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
		await timeout(0);
		await configuration.setUserConfiguration(getAgentHostCopilotSandboxSettingId(false), 'on');
		managedSandboxEnforced.set(true, undefined);
		resolving.set(true, undefined);
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		assert.deepStrictEqual({
			icons: trigger.querySelectorAll('.codicon').length,
			shields: trigger.querySelectorAll('.agent-host-mode-sandbox-icon').length,
			shieldClass: trigger.querySelector('.agent-host-mode-sandbox-icon')?.className,
			aria: trigger.ariaLabel,
			disabled: trigger.ariaDisabled,
			menuOpen: actionWidget.isVisible,
		}, {
			icons: 2,
			shields: 1,
			shieldClass: 'codicon codicon-shield-compact agent-host-mode-sandbox-icon',
			aria: 'Pick Mode and Permissions, Interactive, Manual permissions, terminal sandboxed',
			disabled: 'true',
			menuOpen: false,
		});
	});
});
