/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../base/common/actions.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { ActionWidgetDropdownActionViewItem } from '../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IMenuService, MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { ISessionConversationGroup, ISessionConversationGroupRegistry, SessionConversationExtensions } from '../sessionConversationGroups.js';
import { Menus } from '../menus.js';

export function toSessionConversationDropdownActions(
	menuActions: readonly (readonly [string, readonly IAction[]])[],
	groups: readonly ISessionConversationGroup[],
): IActionWidgetDropdownAction[] {
	const groupsById = new Map(groups.map(group => [group.id, group]));
	const result: IActionWidgetDropdownAction[] = [];

	for (const [groupId, actions] of menuActions) {
		const group = groupsById.get(groupId);
		for (const action of actions) {
			result.push({
				id: action.id,
				label: action.label,
				tooltip: action.tooltip,
				class: action.class,
				enabled: action.enabled,
				checked: action.checked,
				category: {
					label: group?.label ?? '',
					order: group?.order ?? Number.MAX_SAFE_INTEGER,
					showHeader: !!group,
				},
				run: () => action.run(),
			});
		}
	}

	return result;
}

/** Renders the scoped Conversations menu with the Sessions workbench Action Widget dropdown. */
export class SessionConversationsActionViewItem extends ActionWidgetDropdownActionViewItem {

	constructor(
		action: SubmenuItemAction,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const menu = menuService.createMenu(Menus.SessionConversations, contextKeyService);
		const groups = Registry.as<ISessionConversationGroupRegistry>(SessionConversationExtensions.Groups);
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => toSessionConversationDropdownActions(
				menu.getActions().map(([group, actions]) => [group, actions.filter(action => action instanceof MenuItemAction)] as const),
				groups.getGroups(),
			),
		};

		super(action, {
			actionProvider,
			reporter: { id: 'SessionConversations' },
		}, actionWidgetService, keybindingService, contextKeyService, telemetryService);
		this._register(menu);
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		element.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussion));
		return super.renderLabel(element);
	}

	protected override setAriaLabelAttributes(element: HTMLElement): void {
		super.setAriaLabelAttributes(element);
		element.setAttribute('aria-label', this.action.label);
	}
}
