/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { COPILOT_SANDBOX_ALLOW_BYPASS_KEY, IManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { constObservable, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { AgentSandboxEnabledValue } from '../../../../../../platform/sandbox/common/settings.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { resetShownWarnings } from '../../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { DEFAULT_PERMISSION_LEVELS, getPermissionLevelMeta, IPermissionPickerDelegate, PermissionPicker } from '../../browser/permissionPicker.js';
import { MobilePermissionPicker } from '../../browser/mobilePermissionPicker.js';

suite('Copilot PermissionPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => resetShownWarnings());
	const unmanagedEnablementService: IAgentHostEnablementService = {
		_serviceBrand: undefined,
		enabled: constObservable(true),
		managedSandboxEnforced: constObservable(false),
		managedSandboxAllowsBypass: constObservable(false),
	};

	for (const policyRestricted of [false, true]) {
		test(`labels Assisted permissions as experimental on phones${policyRestricted ? ' while honoring enterprise policy' : ''}`, async () => {
			const container = dom.append(document.body, dom.$('.phone-layout'));
			store.add(toDisposable(() => container.remove()));
			const configurationService = new class extends TestConfigurationService {
				override inspect<T>(key: string): IConfigurationValue<T> {
					const result = super.inspect<T>(key);
					return { ...result, policyValue: policyRestricted && key === ChatConfiguration.GlobalAutoApprove ? result.value : undefined };
				}
			}({ [ChatConfiguration.GlobalAutoApprove]: false });
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const picker = store.add(new MobilePermissionPicker(
				{
					availableLevels: [ChatPermissionLevel.Default, ChatPermissionLevel.Assisted, ChatPermissionLevel.AutoApprove],
					currentPermissionLevel: constObservable(ChatPermissionLevel.Default),
					getPermissionLevelMeta: (_level, meta) => meta,
					setPermissionLevel: () => { throw new Error('Opening or dismissing the picker must not change permissions'); },
				},
				new class extends mock<IActionWidgetService>() {
					override readonly isVisible = false;
				}(),
				configurationService,
				new TestDialogService(),
				new class extends mock<IOpenerService>() { }(),
				store.add(new TestStorageService()),
				NullTelemetryService,
				new class extends mock<IHoverService>() { }(),
				new class extends mock<IWorkbenchLayoutService>() {
					override readonly mainContainer = container;
				}(),
				unmanagedEnablementService,
			));
			picker.render(container);
			picker.showPicker();
			store.add(toDisposable(() => container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')?.click()));
			const levels = Array.from(container.querySelectorAll<HTMLButtonElement>('.mobile-picker-sheet-item')).slice(0, 3).map(row => ({
				label: row.querySelector('.mobile-picker-sheet-label')?.textContent,
				badge: row.querySelector('.mobile-picker-sheet-badge')?.textContent,
				ariaLabel: row.ariaLabel,
				disabled: row.disabled,
			}));
			container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
			await timeout(200);

			assert.deepStrictEqual(levels, [
				{ label: 'Default permissions', badge: undefined, ariaLabel: null, disabled: false },
				{ label: 'Assisted permissions', badge: 'Experimental', ariaLabel: 'Assisted permissions, Experimental, Evaluates risk before running tools', disabled: policyRestricted },
				{ label: 'Allow all', badge: undefined, ariaLabel: null, disabled: policyRestricted },
			]);
		});

		test(`offers experimental Assisted permissions by default${policyRestricted ? ' but disables it under enterprise policy' : ''}`, async () => {
			const configurationService = new class extends TestConfigurationService {
				override inspect<T>(key: string): IConfigurationValue<T> {
					const result = super.inspect<T>(key);
					return { ...result, policyValue: policyRestricted && key === ChatConfiguration.GlobalAutoApprove ? result.value : undefined };
				}
			}({
				[ChatConfiguration.GlobalAutoApprove]: false,
				'chat.assistedPermissions.enabled': false,
			});
			store.add(configurationService.onDidChangeConfigurationEmitter);
			const writes: ChatPermissionLevel[] = [];
			const picker = store.add(new PermissionPicker(
				{
					availableLevels: [ChatPermissionLevel.Default, ChatPermissionLevel.Assisted, ChatPermissionLevel.AutoApprove],
					getPermissionLevelMeta: (_level, meta) => meta,
					setPermissionLevel: level => { writes.push(level); },
				},
				new class extends mock<IActionWidgetService>() {
					override hide(): void { }
				}(),
				configurationService,
				new TestDialogService(undefined, { result: true }),
				new class extends mock<IOpenerService>() { }(),
				store.add(new TestStorageService()),
				NullTelemetryService,
				new class extends mock<IHoverService>() { }(),
				unmanagedEnablementService,
			));
			const items = picker.getActionListItems(() => true);
			const assisted = items.find(item => item.item?.id === 'permissionPicker.assisted')!;
			await assisted.item!.run();

			assert.deepStrictEqual({
				levels: items.filter(item => item.detail).map(item => ({ label: item.label, badge: item.badge, disabled: item.disabled })),
				hover: assisted.hover?.content,
				writes,
			}, {
				levels: [
					{ label: 'Default permissions', badge: undefined, disabled: false },
					{ label: 'Assisted permissions', badge: 'Experimental', disabled: policyRestricted },
					{ label: 'Allow all', badge: undefined, disabled: policyRestricted },
				],
				hover: policyRestricted ? 'Disabled by enterprise policy' : 'An LLM judge evaluates each tool call. Tools it doesn\'t approve require your approval.',
				writes: policyRestricted ? [] : [ChatPermissionLevel.Assisted],
			});
		});
	}

	test('restores trigger focus after pointer and keyboard activation', () => {
		let onHide: (() => void) | undefined;
		const actionWidgetService = new class extends mock<IActionWidgetService>() {
			override readonly isVisible = false;
			override show<T>(_user: string, _supportsPreview: boolean, _items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				onHide = delegate.onHide;
			}
			override hide(): void { }
		}();
		const delegate: IPermissionPickerDelegate = {
			getPermissionLevelMeta: (_level, meta) => meta,
			setPermissionLevel: () => { },
		};
		const picker = store.add(new PermissionPicker(
			delegate,
			actionWidgetService,
			new TestConfigurationService(),
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			store.add(new TestStorageService()),
			NullTelemetryService,
			new class extends mock<IHoverService>() {
				override setupDelayedHover() { return { dispose: () => { } }; }
			}(),
			unmanagedEnablementService,
		));
		const container = document.createElement('div');
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(trigger);
		let focusCalls = 0;
		trigger.focus = () => focusCalls++;

		trigger.click();
		assert.ok(onHide);
		onHide();
		const pointerFocusCalls = focusCalls;

		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		assert.ok(onHide);
		onHide();

		assert.deepStrictEqual({
			pointerFocusCalls,
			keyboardFocusCalls: focusCalls,
		}, {
			pointerFocusCalls: 1,
			keyboardFocusCalls: 2,
		});
	});

	test('sandbox toggle editability follows managed bypass policy', async () => {
		const sandboxSettingId = 'test.sandbox.enabled';
		const writes: unknown[] = [];
		const configurationService = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				writes.push({ key, value });
			}
		}();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		await configurationService.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, true);
		const managedSandboxEnforced = observableValue('managedSandboxEnforced', false);
		const sandboxEnabled = observableValue<boolean | undefined>('sandboxEnabled', undefined);
		let allowBypass: boolean | undefined;
		const managedSettingsChanged = store.add(new Emitter<void>());
		const managedSettingsService: IManagedSettingsService = {
			_serviceBrand: undefined,
			onDidChangeManagedSettings: managedSettingsChanged.event,
			getManagedSettingValue: key => key === COPILOT_SANDBOX_ALLOW_BYPASS_KEY ? allowBypass : undefined,
		};
		const enablementService: IAgentHostEnablementService = {
			_serviceBrand: undefined,
			enabled: constObservable(true),
			managedSandboxEnforced,
			managedSandboxAllowsBypass: observableFromEvent(managedSettingsService, managedSettingsChanged.event, () => allowBypass === true),
		};
		const visibleStates: { disabled: boolean | undefined; rowDisabled: boolean | undefined; title: string | undefined; hasHover: boolean }[] = [];
		let onHide: (() => void) | undefined;
		const recordVisibleState = <T>(items: readonly IActionListItem<T>[]) => {
			const item = items.find(item => item.standaloneToggle);
			assert.ok(item?.standaloneToggle);
			visibleStates.push({ disabled: item.standaloneToggle.disabled, rowDisabled: item.disabled, title: item.standaloneToggle.title, hasHover: !!item.hover });
		};
		const actionWidgetService = new class extends mock<IActionWidgetService>() {
			override readonly isVisible = false;
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				onHide = delegate.onHide;
				recordVisibleState(items);
			}
			override updateItems<T>(items: readonly IActionListItem<T>[]): void {
				recordVisibleState(items);
			}
		}();
		const picker = store.add(new PermissionPicker(
			{
				getPermissionLevelMeta: (_level, meta) => meta,
				setPermissionLevel: () => { },
				isSandboxToggleApplicable: () => true,
				getSandboxToggleProvider: () => 'copilotcli',
				getSandboxToggleSettingId: () => sandboxSettingId,
				sandboxEnabled,
				setSandboxEnabled: enabled => writes.push({ session: 'test-session', enabled }),
				managedSandboxEnforced,
			},
			actionWidgetService,
			configurationService,
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			store.add(new TestStorageService()),
			NullTelemetryService,
			new class extends mock<IHoverService>() { }(),
			enablementService,
		));

		for (const managed of [false, true]) {
			managedSandboxEnforced.set(managed, undefined);
			for (const bypass of [undefined, false, true]) {
				allowBypass = bypass;
				for (const configured of [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On]) {
					await configurationService.setUserConfiguration(sandboxSettingId, configured);
					const toggle = picker['_getSandboxStandaloneToggle']()!;
					const initiallyChecked = toggle.checked;
					writes.length = 0;
					toggle.onChange(false);
					toggle.onChange(true);
					const disabled = managed && bypass !== true;
					assert.deepStrictEqual({ checked: toggle.checked, disabled: toggle.disabled, title: toggle.title, writes }, {
						checked: true,
						disabled,
						title: managed
							? disabled ? 'Sandboxing is required by your organization' : 'Sandboxing is enabled by your organization, but you may disable it'
							: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. This choice is saved for this session only.',
						writes: disabled ? [] : (initiallyChecked ? [false, true] : [true]).map(enabled => ({ session: 'test-session', enabled })),
					});
				}
			}
		}

		sandboxEnabled.set(false, undefined);
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.checked, false);
		sandboxEnabled.set(true, undefined);
		await configurationService.setUserConfiguration(sandboxSettingId, AgentSandboxEnabledValue.Off);
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.checked, true);
		sandboxEnabled.set(undefined, undefined);

		const toggle = picker['_getSandboxStandaloneToggle']()!;
		allowBypass = false;
		writes.length = 0;
		toggle.onChange(false);
		assert.deepStrictEqual({ writes, disabled: picker['_getSandboxStandaloneToggle']()!.disabled }, { writes: [], disabled: true });
		allowBypass = true;
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.disabled, false);

		picker['_triggerElement'] = document.createElement('div');
		allowBypass = false;
		picker.showPicker();
		picker['_sandboxDefaultChanged'].trigger(undefined);
		picker['_sandboxDefaultChanged'].trigger(undefined);
		allowBypass = true;
		managedSettingsChanged.fire();
		managedSettingsChanged.fire();
		managedSandboxEnforced.set(false, undefined);
		managedSandboxEnforced.set(true, undefined);
		allowBypass = false;
		managedSettingsChanged.fire();
		assert.ok(onHide);
		onHide();
		allowBypass = true;
		managedSettingsChanged.fire();
		assert.deepStrictEqual(visibleStates, [
			{ disabled: true, rowDisabled: true, title: 'Sandboxing is required by your organization', hasHover: true },
			{ disabled: false, rowDisabled: false, title: 'Sandboxing is enabled by your organization, but you may disable it', hasHover: false },
			{ disabled: false, rowDisabled: false, title: 'Run this session\'s terminal commands inside a sandbox that restricts file system and network access. This choice is saved for this session only.', hasHover: false },
			{ disabled: false, rowDisabled: false, title: 'Sandboxing is enabled by your organization, but you may disable it', hasHover: false },
			{ disabled: true, rowDisabled: true, title: 'Sandboxing is required by your organization', hasHover: true },
		]);
	});

	test('uses descriptions aligned with the agent host permission picker', () => {
		assert.deepStrictEqual(DEFAULT_PERMISSION_LEVELS.map(level => ({
			level,
			label: getPermissionLevelMeta(level).label,
			detail: getPermissionLevelMeta(level).detail,
		})), [
			{
				level: ChatPermissionLevel.Default,
				label: 'Default permissions',
				detail: 'Asks when approval settings don\'t apply',
			},
			{
				level: ChatPermissionLevel.AutoApprove,
				label: 'Allow all',
				detail: 'Runs tool calls without asking',
			},
			{
				level: ChatPermissionLevel.Autopilot,
				label: 'Autopilot (Preview)',
				detail: 'Works autonomously within permissions',
			},
		]);
	});

	test('updates the shield icon when sandbox configuration finishes resolving', () => {
		const sandboxSettingId = 'test.sandbox.enabled';
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, true);
		configurationService.setUserConfiguration(sandboxSettingId, AgentSandboxEnabledValue.On);
		const isResolving = observableValue('isResolving', true);
		const sandboxEnabled = observableValue<boolean | undefined>('sandboxEnabled', undefined);
		let sandboxApplicable = false;
		const delegate: IPermissionPickerDelegate = {
			getPermissionLevelMeta: (_level, meta) => ({ ...meta, label: 'Manual permissions', icon: Codicon.key }),
			setPermissionLevel: () => { },
			setSandboxEnabled: () => { },
			isResolving,
			sandboxEnabled,
			isSandboxToggleApplicable: () => sandboxApplicable,
			getSandboxToggleProvider: () => 'copilotcli',
			getSandboxToggleSettingId: () => sandboxSettingId,
		};
		const picker = store.add(new PermissionPicker(
			delegate,
			new class extends mock<IActionWidgetService>() {
				override readonly isVisible = false;
			}(),
			configurationService,
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			store.add(new TestStorageService()),
			NullTelemetryService,
			new class extends mock<IHoverService>() { }(),
			unmanagedEnablementService,
		));
		const container = document.createElement('div');
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(trigger);

		const initiallySandboxed = !!trigger.querySelector('.sessions-chat-sandbox-icon');
		sandboxApplicable = true;
		isResolving.set(false, undefined);

		assert.deepStrictEqual({
			initiallySandboxed,
			visibleLabel: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			permissionIcon: trigger.querySelector('.codicon-key')?.className,
			sandboxIcon: trigger.querySelector('.sessions-chat-sandbox-icon')?.className,
			triggerAriaLabel: trigger.ariaLabel,
		}, {
			initiallySandboxed: false,
			visibleLabel: 'Manual permissions',
			permissionIcon: 'codicon codicon-key',
			sandboxIcon: 'codicon codicon-shield sessions-chat-sandbox-icon',
			triggerAriaLabel: 'Pick Permission Level, Manual permissions (sandboxed)',
		});
		sandboxEnabled.set(false, undefined);
		assert.deepStrictEqual({
			sandboxIcon: trigger.querySelector('.sessions-chat-sandbox-icon'),
			visibleLabel: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			triggerAriaLabel: trigger.ariaLabel,
		}, {
			sandboxIcon: null,
			visibleLabel: 'Manual permissions',
			triggerAriaLabel: 'Pick Permission Level, Manual permissions',
		});
	});
});
