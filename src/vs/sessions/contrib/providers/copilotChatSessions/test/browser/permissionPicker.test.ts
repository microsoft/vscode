/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
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
});
