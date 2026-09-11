/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IValueWithChangeEvent } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { CheckBoxAccessibleState } from '../../../../base/browser/ui/list/listView.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IAnchor } from '../../../../base/browser/ui/contextview/contextview.js';
import { IActionListCloseAnimation, IActionListDelegate, IActionListItem, IActionListOptions } from '../../browser/actionList.js';
import { IActionWidgetService } from '../../browser/actionWidget.js';
import { ACTION_WIDGET_DROPDOWN_MOTION_CLASS, ActionWidgetDropdown, actionWidgetDropdownCloseAnimation, IActionWidgetDropdownAction, withActionWidgetDropdownMotion } from '../../browser/actionWidgetDropdown.js';
import { ActionWidgetDropdownActionViewItem } from '../../../actions/browser/actionWidgetDropdownActionViewItem.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';

interface ICapturedAction {
	readonly id: string;
	readonly checked: boolean | undefined;
	readonly checkedState: CheckBoxAccessibleState | IValueWithChangeEvent<CheckBoxAccessibleState> | undefined;
	readonly hideIcon: boolean | undefined;
	readonly iconId: string | undefined;
	readonly role: string | undefined;
}

class TestActionWidgetService extends mock<IActionWidgetService>() {
	override readonly isVisible = false;
	capturedActions: ICapturedAction[] = [];
	capturedListOptions: IActionListOptions | undefined;
	initialFocusItemId: string | undefined;

	override hide(): void { }

	override show<T>(
		_user: string,
		_supportsPreview: boolean,
		items: readonly IActionListItem<T>[],
		_delegate: IActionListDelegate<T>,
		_anchor: HTMLElement | StandardMouseEvent | IAnchor,
		_container: HTMLElement | undefined,
		_actionBarActions?: readonly IAction[],
		accessibilityProvider?: Partial<IListAccessibilityProvider<IActionListItem<T>>>,
		listOptions?: IActionListOptions,
	): void {
		this.capturedListOptions = listOptions;
		this.initialFocusItemId = listOptions?.initialFocusItemId;
		this.capturedActions = items.flatMap(item => {
			const action = item.item as (IActionWidgetDropdownAction | undefined);
			return action ? [{
				id: action.id,
				checked: action.checked,
				checkedState: accessibilityProvider?.isChecked?.(item),
				hideIcon: item.hideIcon,
				iconId: item.group?.icon?.id,
				role: accessibilityProvider?.getRole?.(item),
			}] : [];
		});
	}
}

class TestActionWidgetDropdownActionViewItem extends ActionWidgetDropdownActionViewItem {
	refreshTooltip(): void {
		this.updateTooltip();
	}
}

suite('ActionWidgetDropdown', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies motion defaults idempotently and preserves overrides', () => {
		const customCloseAnimation: IActionListCloseAnimation = {
			className: 'custom-closing',
			duration: 42
		};

		assert.deepStrictEqual({
			defaults: withActionWidgetDropdownMotion(undefined),
			overrides: withActionWidgetDropdownMotion({
				className: `custom ${ACTION_WIDGET_DROPDOWN_MOTION_CLASS}`,
				widgetClassName: 'custom-widget',
				closeAnimation: customCloseAnimation,
				showFilter: true
			})
		}, {
			defaults: {
				className: ACTION_WIDGET_DROPDOWN_MOTION_CLASS,
				widgetClassName: ACTION_WIDGET_DROPDOWN_MOTION_CLASS,
				closeAnimation: actionWidgetDropdownCloseAnimation
			},
			overrides: {
				className: `custom ${ACTION_WIDGET_DROPDOWN_MOTION_CLASS}`,
				widgetClassName: `custom-widget ${ACTION_WIDGET_DROPDOWN_MOTION_CLASS}`,
				closeAnimation: customCloseAnimation,
				showFilter: true
			}
		});
	});

	test('uses navigation semantics without checked and focuses the requested action', () => {
		const actionWidgetService = new TestActionWidgetService();
		const navigationAction = { ...toAction({ id: 'navigation', label: 'Navigation', run: () => { } }), icon: Codicon.commentDiscussion };
		const uncheckedAction = { ...toAction({ id: 'unchecked', label: 'Unchecked', run: () => { } }), checked: false };
		const checkedAction = { ...toAction({ id: 'checked', label: 'Checked', run: () => { } }), checked: true };
		const dropdown = disposables.add(new ActionWidgetDropdown(
			mainWindow.document.createElement('div'),
			{
				label: 'Test',
				actions: [navigationAction, uncheckedAction, checkedAction],
				getInitialFocusActionId: () => navigationAction.id,
			},
			actionWidgetService,
			new MockKeybindingService(),
			NullTelemetryService,
		));

		dropdown.show();

		assert.deepStrictEqual({
			actions: actionWidgetService.capturedActions,
			initialFocusItemId: actionWidgetService.initialFocusItemId,
		}, {
			actions: [
				{ id: 'navigation', checked: undefined, checkedState: undefined, hideIcon: false, iconId: navigationAction.icon.id, role: 'menuitem' },
				{ id: 'unchecked', checked: false, checkedState: false, hideIcon: false, iconId: Codicon.blank.id, role: 'menuitemcheckbox' },
				{ id: 'checked', checked: true, checkedState: true, hideIcon: false, iconId: Codicon.check.id, role: 'menuitemcheckbox' },
			],
			initialFocusItemId: 'navigation',
		});
	});

	test('re-evaluates the list options provider on each open', () => {
		const actionWidgetService = new TestActionWidgetService();
		const action1 = toAction({ id: 'a', label: 'A', run: () => { } });
		let headerText = 'Initial';
		const dropdown = disposables.add(new ActionWidgetDropdown(
			mainWindow.document.createElement('div'),
			{
				label: 'Test',
				actions: [action1],
				listOptionsProvider: { getListOptions: () => ({ headerText }) },
			},
			actionWidgetService,
			new MockKeybindingService(),
			NullTelemetryService,
		));

		dropdown.show();
		const firstHeaderText = actionWidgetService.capturedListOptions?.headerText;

		headerText = 'Updated';
		dropdown.show();
		const secondHeaderText = actionWidgetService.capturedListOptions?.headerText;

		assert.deepStrictEqual(
			{ first: firstHeaderText, second: secondHeaderText },
			{ first: 'Initial', second: 'Updated' }
		);
	});

	test('preserves expanded state when refreshing the action view item tooltip', () => {
		const action = toAction({ id: 'picker', label: 'Picker', tooltip: 'Initial tooltip', run: () => { } });
		const actionViewItem = disposables.add(new TestActionWidgetDropdownActionViewItem(
			action,
			{ actions: [] },
			new TestActionWidgetService(),
			new MockKeybindingService(),
			new MockContextKeyService(),
			NullTelemetryService,
		));
		const container = mainWindow.document.createElement('div');
		actionViewItem.render(container);
		actionViewItem.show();
		const label = container.querySelector<HTMLElement>('.action-label');
		assert.ok(label);
		const beforeRefresh = label.getAttribute('aria-expanded');
		const ariaLabelBeforeRefresh = label.ariaLabel;

		action.tooltip = 'Updated tooltip';
		actionViewItem.refreshTooltip();

		assert.deepStrictEqual({
			beforeRefresh,
			afterRefresh: label.getAttribute('aria-expanded'),
			ariaLabelBeforeRefresh,
			ariaLabelAfterRefresh: label.ariaLabel,
		}, {
			beforeRefresh: 'true',
			afterRefresh: 'true',
			ariaLabelBeforeRefresh: 'Initial tooltip - Picker',
			ariaLabelAfterRefresh: 'Updated tooltip - Picker',
		});
	});
});
