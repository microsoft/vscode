/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { COPILOT_SANDBOX_ALLOW_BYPASS_KEY, IManagedSettingsService, NullManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { AgentSandboxEnabledValue } from '../../../../../../platform/sandbox/common/settings.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { DEFAULT_PERMISSION_LEVELS, getPermissionLevelMeta, IPermissionPickerDelegate, PermissionPicker } from '../../browser/permissionPicker.js';

suite('Copilot PermissionPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			new NullManagedSettingsService(),
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
		let allowBypass: boolean | undefined;
		const managedSettingsService: IManagedSettingsService = {
			_serviceBrand: undefined,
			onDidChangeManagedSettings: Event.None,
			getManagedSettingValue: key => key === COPILOT_SANDBOX_ALLOW_BYPASS_KEY ? allowBypass : undefined,
		};
		const picker = store.add(new PermissionPicker(
			{
				getPermissionLevelMeta: (_level, meta) => meta,
				setPermissionLevel: () => { },
				sandboxTogglePresentation: 'standalone',
				isSandboxToggleApplicable: () => true,
				getSandboxToggleSettingId: () => sandboxSettingId,
				managedSandboxEnforced,
			},
			new class extends mock<IActionWidgetService>() { }(),
			configurationService,
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			store.add(new TestStorageService()),
			NullTelemetryService,
			new class extends mock<IHoverService>() { }(),
			managedSettingsService,
		));

		for (const managed of [false, true]) {
			managedSandboxEnforced.set(managed, undefined);
			for (const bypass of [undefined, false, true]) {
				allowBypass = bypass;
				for (const configured of [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On]) {
					await configurationService.setUserConfiguration(sandboxSettingId, configured);
					const toggle = picker['_getSandboxStandaloneToggle']()!;
					writes.length = 0;
					toggle.onChange(false);
					toggle.onChange(true);
					const disabled = managed && bypass !== true;
					assert.deepStrictEqual({ checked: toggle.checked, disabled: toggle.disabled, title: toggle.title, writes }, {
						checked: managed || configured === AgentSandboxEnabledValue.On,
						disabled,
						title: managed
							? disabled ? 'Sandboxing is required by your organization' : 'Sandboxing is enabled by your organization, but you may disable it'
							: 'Run terminal commands inside a sandbox that restricts file system and network access',
						writes: disabled ? [] : [
							{ key: sandboxSettingId, value: AgentSandboxEnabledValue.Off },
							{ key: sandboxSettingId, value: AgentSandboxEnabledValue.On },
						],
					});
				}
			}
		}

		const toggle = picker['_getSandboxStandaloneToggle']()!;
		allowBypass = false;
		writes.length = 0;
		toggle.onChange(false);
		assert.deepStrictEqual({ writes, disabled: picker['_getSandboxStandaloneToggle']()!.disabled }, { writes: [], disabled: true });
		allowBypass = true;
		assert.strictEqual(picker['_getSandboxStandaloneToggle']()!.disabled, false);
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

	test('uses a shield icon for the visible sandboxed state', () => {
		const sandboxSettingId = 'test.sandbox.enabled';
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled, true);
		configurationService.setUserConfiguration(sandboxSettingId, AgentSandboxEnabledValue.On);
		const delegate: IPermissionPickerDelegate = {
			getPermissionLevelMeta: (_level, meta) => ({ ...meta, label: 'Manual permissions', icon: Codicon.key }),
			setPermissionLevel: () => { },
			sandboxTogglePresentation: 'standalone',
			isSandboxToggleApplicable: () => true,
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
			new NullManagedSettingsService(),
		));
		const container = document.createElement('div');
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(trigger);

		assert.deepStrictEqual({
			visibleLabel: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			permissionIcon: trigger.querySelector('.codicon-key')?.className,
			sandboxIcon: trigger.querySelector('.sessions-chat-sandbox-icon')?.className,
			triggerAriaLabel: trigger.ariaLabel,
		}, {
			visibleLabel: 'Manual permissions',
			permissionIcon: 'codicon codicon-key',
			sandboxIcon: 'codicon codicon-shield sessions-chat-sandbox-icon',
			triggerAriaLabel: 'Pick Permission Level, Manual permissions (sandboxed)',
		});
	});
});
