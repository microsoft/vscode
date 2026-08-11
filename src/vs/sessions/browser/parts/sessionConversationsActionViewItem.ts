/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../base/common/actions.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IMenuService, MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { getSelectedSessionConversationActionId, getSessionConversationActionId, getSessionConversationStatusAriaLabel, getSessionConversationStatusDescription, SESSION_CONVERSATION_CHATS_GROUP, SESSION_CONVERSATION_SUBAGENTS_GROUP } from '../sessionConversationGroups.js';
import { Menus } from '../menus.js';
import { ISessionContext } from '../../services/sessions/browser/sessionContext.js';
import { ISessionsListModelService } from '../../services/sessions/browser/sessionsListModelService.js';

export interface ISessionConversationActionMetadata {
	readonly description?: string;
	readonly ariaDescription: string;
	readonly icon: ThemeIcon;
}

const sessionConversationGroups = [
	{ id: SESSION_CONVERSATION_CHATS_GROUP, label: localize('sessionConversationGroup.chats', "Chats"), showHeader: false, order: 1 },
	{ id: SESSION_CONVERSATION_SUBAGENTS_GROUP, label: localize('sessionConversationGroup.subagents', "Subagents"), showHeader: true, order: 2 },
] as const;

export function toSessionConversationDropdownActions(
	menuActions: readonly (readonly [string, readonly IAction[]])[],
	actionMetadata: ReadonlyMap<string, ISessionConversationActionMetadata> = new Map(),
): IActionWidgetDropdownAction[] {
	const groupsById = new Map<string, (typeof sessionConversationGroups)[number]>(sessionConversationGroups.map(group => [group.id, group]));
	const actionsByGroup = new Map<string, IActionWidgetDropdownAction[]>();

	for (const [groupId, actions] of menuActions) {
		const group = groupsById.get(groupId);
		const dropdownActions = actions.map(action => {
			const metadata = actionMetadata.get(action.id);
			return {
				id: action.id,
				label: action.label,
				tooltip: action.tooltip,
				description: metadata?.description,
				ariaDescription: metadata?.ariaDescription,
				icon: metadata?.icon,
				class: action.class,
				enabled: action.enabled,
				category: {
					label: group?.label ?? '',
					order: group?.order ?? Number.MAX_SAFE_INTEGER,
					showHeader: group?.showHeader ?? false,
				},
				run: () => action.run(),
			} satisfies IActionWidgetDropdownAction;
		});
		actionsByGroup.set(groupId, dropdownActions);
	}

	const chatActions = actionsByGroup.get(SESSION_CONVERSATION_CHATS_GROUP) ?? [];
	const subagentActions = actionsByGroup.get(SESSION_CONVERSATION_SUBAGENTS_GROUP) ?? [];
	if (chatActions.length === 1) {
		return subagentActions;
	}

	return sessionConversationGroups.flatMap(group => actionsByGroup.get(group.id) ?? []);
}

/** Renders the scoped Conversations menu with the Sessions workbench Action Widget dropdown. */
export class SessionConversationsActionViewItem extends ActionWidgetDropdownActionViewItem {

	constructor(
		action: SubmenuItemAction,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@ISessionContext sessionContext: ISessionContext,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const menu = menuService.createMenu(Menus.SessionConversations, contextKeyService);
		const getSelectedChatActionId = () => {
			const session = sessionContext.session.get();
			const activeChat = session?.activeChat.get();
			if (!session || !activeChat) {
				return undefined;
			}
			return getSelectedSessionConversationActionId(session.sessionId, activeChat);
		};
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const session = sessionContext.session.get();
				const actionMetadata = new Map<string, ISessionConversationActionMetadata>();
				if (session) {
					for (const chat of session.chats.get()) {
						const actionId = getSessionConversationActionId(session.sessionId, chat.resource);
						const status = chat.status.get();
						actionMetadata.set(actionId, {
							description: getSessionConversationStatusDescription(status),
							ariaDescription: getSessionConversationStatusAriaLabel(status),
							icon: sessionsListModelService.getStatusIcon(status, chat.isRead.get(), chat.isArchived.get()),
						});
					}
				}
				return toSessionConversationDropdownActions(
					menu.getActions().map(([group, actions]) => [group, actions.filter(action => action instanceof MenuItemAction)] as const),
					actionMetadata,
				);
			},
		};

		super(action, {
			actionProvider,
			getInitialFocusActionId: getSelectedChatActionId,
			listOptions: {
				hideDefaultKeybindingTooltip: true,
			},
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
