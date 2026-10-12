/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem, IActionListItemInlineToggle } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { createAgentHostSandboxToggle } from '../../../../../../../platform/agentHost/browser/agentHostSandboxToggle.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatPermissionLevel } from '../../../../common/constants.js';
import { PermissionPickerActionItem } from '../../../../browser/widget/input/permissionPickerActionItem.js';

suite('PermissionPickerActionItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(enabled: boolean, supported: boolean | undefined, managed = false) {
		const sandboxEnabled = observableValue<boolean | undefined>('sandboxEnabled', enabled);
		const sandboxDevContainerSupported = observableValue<boolean | undefined>('sandboxDevContainerSupported', supported);
		const managedSandboxEnforced = observableValue('managedSandboxEnforced', managed);
		const isResolving = observableValue('isResolving', false);
		const writes: boolean[] = [];
		let onWrite = (value: boolean) => sandboxEnabled.set(value, undefined);
		let visibleToggle: IActionListItemInlineToggle | undefined;
		let onHide: (() => void) | undefined;
		let hides = 0;
		const widgetService = new class extends mock<IActionWidgetService>() {
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				visibleToggle = items.find(item => item.standaloneToggle)?.standaloneToggle;
				onHide = delegate.onHide;
			}
			override hide(): void {
				hides++;
				visibleToggle = undefined;
				const callback = onHide;
				onHide = undefined;
				callback?.();
			}
		}();
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const action = new MenuItemAction({ id: 'test.permissions', title: 'Permissions' }, undefined, undefined, undefined, undefined,
			new MockContextKeyService(), new class extends mock<ICommandService>() { }());
		const picker = store.add(new PermissionPickerActionItem(
			action,
			{
				currentPermissionLevel: constObservable(ChatPermissionLevel.Default),
				setPermissionLevel: () => { },
				isResolving,
				isSandboxToggleApplicable: () => true,
				getSandboxToggleSettingId: () => 'test.sandbox.enabled',
				sandboxEnabled,
				sandboxDevContainerSupported,
				managedSandboxEnforced,
				getSandboxToggle: () => createAgentHostSandboxToggle(() => ({
					provider: 'copilotcli',
					sessionEnabled: sandboxEnabled.get(),
					globalEnabled: false,
					managedEnabled: managedSandboxEnforced.get(),
					allowsBypass: false,
					devContainer: true,
					devContainerSandboxSupported: sandboxDevContainerSupported.get(),
				}), value => {
					writes.push(value);
					onWrite(value);
				}),
			},
			{ compact: constObservable(false) },
			widgetService,
			new MockKeybindingService(),
			new MockContextKeyService(),
			NullTelemetryService,
			configuration,
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			store.add(new InMemoryStorageService()),
			new class extends mock<IHoverService>() {
				override setupDelayedHover() { return { dispose: () => { } }; }
			}(),
		));
		const container = document.createElement('div');
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('a.action-label')!;
		return {
			picker, sandboxEnabled, sandboxDevContainerSupported, managedSandboxEnforced, isResolving, writes, widgetService,
			setWrite: (callback: (value: boolean) => void) => { onWrite = callback; },
			toggle: () => visibleToggle,
			hides: () => hides,
			isOpen: () => trigger.ariaExpanded === 'true',
		};
	}

	test('closes the owning dropdown after accepting Off in an unsupported running container', () => {
		const { picker, toggle, hides, isOpen, writes, sandboxEnabled } = setup(true, false);
		picker.show();
		assert.deepStrictEqual({ open: isOpen(), checked: toggle()?.checked, disabled: toggle()?.disabled }, { open: true, checked: true, disabled: false });
		toggle()!.onChange(false);
		assert.deepStrictEqual({ open: isOpen(), visibleToggle: toggle(), hides: hides(), requested: sandboxEnabled.get(), writes }, {
			open: false, visibleToggle: undefined, hides: 1, requested: false, writes: [false],
		});
		picker.show();
		assert.deepStrictEqual({ checked: toggle()?.checked, disabled: toggle()?.disabled, explainsDocker: toggle()?.title?.includes('Docker options') }, {
			checked: false, disabled: true, explainsDocker: true,
		});
		toggle()!.onChange(true);
		assert.deepStrictEqual({ checked: toggle()?.checked, requested: sandboxEnabled.get(), writes }, { checked: false, requested: false, writes: [false] });
	});

	test('closes its open dropdown on live support changes but leaves an unrelated widget alone', () => {
		const { picker, toggle, hides, isOpen, sandboxDevContainerSupported, widgetService } = setup(false, false);
		picker.show();
		assert.strictEqual(toggle()?.disabled, true);
		sandboxDevContainerSupported.set(true, undefined);
		assert.deepStrictEqual({ open: isOpen(), hides: hides() }, { open: false, hides: 1 });
		picker.show();
		assert.deepStrictEqual({ disabled: toggle()?.disabled, explainsIsolation: toggle()?.title?.includes('outer container') }, { disabled: false, explainsIsolation: true });
		sandboxDevContainerSupported.set(false, undefined);
		assert.strictEqual(isOpen(), false);
		picker.show();
		assert.strictEqual(toggle()?.disabled, true);
		picker.hide();
		widgetService.show('unrelated', false, [], { onSelect: () => { }, onHide: () => { } });
		const before = hides();
		sandboxDevContainerSupported.set(true, undefined);
		assert.strictEqual(hides(), before, 'Only this picker owns the dropdown it may close');
	});

	test('preserves optimistic toggles until an asynchronous write is acknowledged', async () => {
		const fixture = setup(false, true);
		const pending = new DeferredPromise<void>();
		let acknowledgement: Promise<void> | undefined;
		fixture.setWrite(value => {
			fixture.isResolving.set(true, undefined);
			acknowledgement = pending.p.then(() => {
				fixture.sandboxEnabled.set(value, undefined);
				fixture.isResolving.set(false, undefined);
			});
		});
		fixture.picker.show();
		const toggle = fixture.toggle()!;
		toggle.onChange(true);
		assert.deepStrictEqual({ checked: toggle.checked, open: fixture.isOpen(), requested: fixture.sandboxEnabled.get(), hides: fixture.hides() }, {
			checked: true, open: true, requested: false, hides: 0,
		});
		await pending.complete();
		await acknowledgement;
		assert.deepStrictEqual({ open: fixture.isOpen(), writes: fixture.writes, hides: fixture.hides() }, { open: false, writes: [true], hides: 1 });
		fixture.picker.show();
		assert.strictEqual(fixture.toggle()?.checked, true);
	});

	test('closes on managed policy changes and keeps required sandboxing checked and disabled', () => {
		const { picker, toggle, isOpen, writes, managedSandboxEnforced } = setup(false, true);
		picker.show();
		managedSandboxEnforced.set(true, undefined);
		assert.strictEqual(isOpen(), false);
		picker.show();
		toggle()!.onChange(false);
		assert.deepStrictEqual({ checked: toggle()?.checked, disabled: toggle()?.disabled, writes }, { checked: true, disabled: true, writes: [] });
	});
});
