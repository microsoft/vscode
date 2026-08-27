/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { TerminalContribSettingId } from '../../../../../../../workbench/contrib/terminal/terminalContribExports.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { IChatInputPickerOptions } from '../../../../browser/widget/input/chatInputPickerActionItem.js';
import { IExtensionPermissionState, IPermissionPickerDelegate, PermissionPickerActionItem } from '../../../../browser/widget/input/permissionPickerActionItem.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../common/constants.js';

class RecordingPermissionActionWidgetService extends mock<IActionWidgetService>() {
	override isVisible = false;
	shownItems: readonly IActionListItem<IActionWidgetDropdownAction>[] = [];
	hideCalls = 0;

	override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], _delegate: IActionListDelegate<T>): void {
		this.shownItems = items as readonly IActionListItem<IActionWidgetDropdownAction>[];
		this.isVisible = true;
	}

	override updateItems<T>(_items: readonly IActionListItem<T>[], _focusItemId?: string): void { }
	override focusItemById(_itemId: string): void { }
	override hide(): void {
		this.hideCalls++;
		this.isVisible = false;
	}
}

class RecordingPreferencesService extends mock<IPreferencesService>() {
	openSettingsOptions: Parameters<IPreferencesService['openSettings']>[0] = undefined;

	override openSettings(options?: Parameters<IPreferencesService['openSettings']>[0]): ReturnType<IPreferencesService['openSettings']> {
		this.openSettingsOptions = options;
		return Promise.resolve(undefined);
	}
}

interface IPermissionPickerOptions {
	readonly extensionPermissions?: IExtensionPermissionState;
	readonly showSandboxToggle?: boolean;
}

function getMarkdownValue(value: string | IMarkdownString | HTMLElement | undefined): string | undefined {
	return typeof value === 'string' ? value : value instanceof HTMLElement ? value.textContent ?? undefined : value?.value;
}

suite('PermissionPickerActionItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function getActionItems(items: readonly IActionListItem<IActionWidgetDropdownAction>[]): readonly IActionListItem<IActionWidgetDropdownAction>[] {
		return items.filter(item => item.kind === ActionListItemKind.Action);
	}

	function createPicker(options: IPermissionPickerOptions = {}) {
		const actionWidgetService = new RecordingPermissionActionWidgetService();
		const preferencesService = new RecordingPreferencesService();
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.PermissionsSandboxToggleEnabled]: options.showSandboxToggle === true,
		});
		const contextKeyService = new class extends mock<IContextKeyService>() { }();
		const keybindingService = new class extends mock<IKeybindingService>() {
			override appendKeybinding(label: string): string {
				return label;
			}
		}();
		const hoverService = new class extends mock<IHoverService>() {
			override setupDelayedHover(): IDisposable {
				return Disposable.None;
			}
		}();
		const delegate: IPermissionPickerDelegate = {
			currentPermissionLevel: observableValue('permissionLevel', ChatPermissionLevel.Default),
			setPermissionLevel: () => { },
			getExtensionPermissions: options.extensionPermissions ? () => options.extensionPermissions : undefined,
			isSandboxToggleApplicable: options.showSandboxToggle ? () => true : undefined,
			getSandboxToggleSettingId: options.showSandboxToggle ? () => 'test.sandbox' : undefined,
		};
		const action = upcastPartial<MenuItemAction>({
			id: 'chat.permissions',
			label: 'Permissions',
			tooltip: 'Permissions',
			enabled: true,
			run: async () => { },
		});
		const pickerOptions: IChatInputPickerOptions = {
			compact: observableValue('compact', false),
		};
		const picker = disposables.add(new PermissionPickerActionItem(
			action,
			delegate,
			pickerOptions,
			actionWidgetService,
			keybindingService,
			contextKeyService,
			NullTelemetryService,
			configurationService,
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<IStorageService>() { }(),
			hoverService,
			preferencesService,
		));
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		picker.render(container);
		picker.show();
		return { actionWidgetService, preferencesService };
	}

	test('adds Configure tools only to the Default permission', () => {
		const { actionWidgetService } = createPicker();
		const permissionItems = getActionItems(actionWidgetService.shownItems);

		assert.deepStrictEqual(permissionItems.map(item => ({
			id: item.item?.id,
			toolbarActions: item.item?.toolbarActions?.map(toolbarAction => ({
				id: toolbarAction.id,
				label: toolbarAction.label,
				tooltip: toolbarAction.tooltip,
				class: toolbarAction.class,
			})) ?? [],
		})), [
			{
				id: 'chat.permissions.default',
				toolbarActions: [{
					id: 'chat.permissions.configureTools',
					label: 'Configure tools',
					tooltip: 'Configure tools',
					class: ThemeIcon.asClassName(Codicon.gear),
				}],
			},
			{ id: 'chat.permissions.autoApprove', toolbarActions: [] },
			{ id: 'chat.permissions.autopilot', toolbarActions: [] },
			{ id: 'chat.permissions.learnMore', toolbarActions: [] },
		]);
	});

	test('opens the terminal auto-approve setting and closes the picker', async () => {
		const { actionWidgetService, preferencesService } = createPicker();
		const defaultItem = getActionItems(actionWidgetService.shownItems).find(item => item.item?.id === 'chat.permissions.default');
		assert.ok(defaultItem?.item?.toolbarActions?.[0]);

		await defaultItem.item.toolbarActions[0].run();

		assert.deepStrictEqual({
			hideCalls: actionWidgetService.hideCalls,
			openSettingsOptions: preferencesService.openSettingsOptions,
		}, {
			hideCalls: 1,
			openSettingsOptions: {
				jsonEditor: false,
				query: `@id:${TerminalContribSettingId.AutoApprove}`,
			},
		});
	});

	test('does not add Configure tools to extension-contributed permissions', () => {
		const extensionPermissions: IExtensionPermissionState = {
			sessionType: 'test',
			groupId: 'permissions',
			items: [{ id: 'custom', name: 'Custom permissions' }],
			selectedId: 'custom',
		};
		const { actionWidgetService } = createPicker({ extensionPermissions });

		assert.deepStrictEqual(getActionItems(actionWidgetService.shownItems).map(item => ({
			id: item.item?.id,
			toolbarActions: item.item?.toolbarActions?.map(toolbarAction => toolbarAction.id) ?? [],
		})), [
			{
				id: 'chat.permissions.ext.test.permissions.custom',
				toolbarActions: [],
			},
			{ id: 'chat.permissions.learnMore', toolbarActions: [] },
		]);
	});

	test('preserves the Default sandbox toggle and learn-more action', () => {
		const { actionWidgetService } = createPicker({ showSandboxToggle: true });
		const actionItems = getActionItems(actionWidgetService.shownItems);
		const defaultItem = actionItems.find(item => item.item?.id === 'chat.permissions.default');
		const learnMoreItem = actionItems.find(item => item.item?.id === 'chat.permissions.learnMore');

		assert.deepStrictEqual({
			sandboxLabel: defaultItem?.item?.inlineToggle?.label,
			learnMoreLabel: learnMoreItem?.label,
		}, {
			sandboxLabel: 'Sandboxing for terminal',
			learnMoreLabel: 'Learn more about permissions',
		});
	});
});
