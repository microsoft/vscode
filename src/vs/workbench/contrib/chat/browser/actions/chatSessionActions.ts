/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import Severity from '../../../../../base/common/severity.js';
import * as nls from '../../../../../nls.js';
import { localize } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItem, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatConfiguration, LEGACY_AGENT_SESSIONS_VIEW_ID } from '../../common/constants.js';
import { AGENT_SESSIONS_VIEW_CONTAINER_ID, AGENT_SESSIONS_VIEW_ID } from '../agentSessions/agentSessions.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { ACTION_ID_OPEN_CHAT, CHAT_CATEGORY } from './chatActions.js';

export interface IMarshalledChatSessionContext {
	readonly $mid: MarshalledId.ChatSessionContext;
	readonly session: IChatSessionItem;
}

export class RenameChatSessionAction extends Action2 {
	static readonly id = 'workbench.action.chat.renameSession';

	constructor() {
		super({
			id: RenameChatSessionAction.id,
			title: localize('renameSession', "Rename"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.pencil,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F2,
				when: ContextKeyExpr.equals('focusedView', 'workbench.view.chat.sessions.local')
			}
		});
	}

	async run(accessor: ServicesAccessor, context?: IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		// Handle marshalled context from menu actions
		const label = context.session.label;
		const chatSessionsService = accessor.get(IChatSessionsService);
		const logService = accessor.get(ILogService);
		const chatService = accessor.get(IChatService);

		try {
			// Find the chat sessions view and trigger inline rename mode
			// This is similar to how file renaming works in the explorer
			await chatSessionsService.setEditableSession(context.session.resource, {
				validationMessage: (value: string) => {
					if (!value || value.trim().length === 0) {
						return { content: localize('renameSession.emptyName', "Name cannot be empty"), severity: Severity.Error };
					}
					if (value.length > 100) {
						return { content: localize('renameSession.nameTooLong', "Name is too long (maximum 100 characters)"), severity: Severity.Error };
					}
					return null;
				},
				placeholder: localize('renameSession.placeholder', "Enter new name for chat session"),
				startingValue: label,
				onFinish: async (value: string, success: boolean) => {
					if (success && value && value.trim() !== label) {
						try {
							const newTitle = value.trim();
							chatService.setChatSessionTitle(context.session.resource, newTitle);
							// Notify the local sessions provider that items have changed
							chatSessionsService.notifySessionItemsChanged(localChatSessionType);
						} catch (error) {
							logService.error(
								localize('renameSession.error', "Failed to rename chat session: {0}",
									(error instanceof Error ? error.message : String(error)))
							);
						}
					}
					await chatSessionsService.setEditableSession(context.session.resource, null);
				}
			});
		} catch (error) {
			logService.error('Failed to rename chat session', error instanceof Error ? error.message : String(error));
		}
	}
}

/**
 * Action to delete a chat session from history
 */
export class DeleteChatSessionAction extends Action2 {
	static readonly id = 'workbench.action.chat.deleteSession';

	constructor() {
		super({
			id: DeleteChatSessionAction.id,
			title: localize('deleteSession', "Delete"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.x,
		});
	}

	async run(accessor: ServicesAccessor, context?: IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		// Handle marshalled context from menu actions
		const chatService = accessor.get(IChatService);
		const dialogService = accessor.get(IDialogService);
		const logService = accessor.get(ILogService);
		const chatSessionsService = accessor.get(IChatSessionsService);

		try {
			// Show confirmation dialog
			const result = await dialogService.confirm({
				message: localize('deleteSession.confirm', "Are you sure you want to delete this chat session?"),
				detail: localize('deleteSession.detail', "This action cannot be undone."),
				primaryButton: localize('deleteSession.delete', "Delete"),
				type: 'warning'
			});

			if (result.confirmed) {
				await chatService.removeHistoryEntry(context.session.resource);
				// Notify the local sessions provider that items have changed
				chatSessionsService.notifySessionItemsChanged(localChatSessionType);
			}
		} catch (error) {
			logService.error('Failed to delete chat session', error instanceof Error ? error.message : String(error));
		}
	}
}


/**
 * Action to open a chat session in the sidebar (chat widget)
 */
export class OpenChatSessionInSidebarAction extends Action2 {
	static readonly id = 'workbench.action.chat.openSessionInSidebar';

	constructor() {
		super({
			id: OpenChatSessionInSidebarAction.id,
			title: localize('chat.openSessionInSidebar.label', "Move Chat into Side Bar"),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, context?: IMarshalledChatSessionContext): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);

		if (!context) {
			return;
		}

		// TODO: this feels strange. Should we prefer moving the editor to the sidebar instead? @osortega
		await chatWidgetService.openSession(context.session.resource, ChatViewPaneTarget);
	}
}

/**
 * Action to toggle the description display mode for Chat Sessions
 */
export class ToggleChatSessionsDescriptionDisplayAction extends Action2 {
	static readonly id = 'workbench.action.chatSessions.toggleDescriptionDisplay';

	constructor() {
		super({
			id: ToggleChatSessionsDescriptionDisplayAction.id,
			title: localize('chatSessions.toggleDescriptionDisplay.label', "Show Rich Descriptions"),
			category: CHAT_CATEGORY,
			f1: false,
			toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ShowAgentSessionsViewDescription}`, true)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const currentValue = configurationService.getValue(ChatConfiguration.ShowAgentSessionsViewDescription);

		await configurationService.updateValue(
			ChatConfiguration.ShowAgentSessionsViewDescription,
			!currentValue
		);
	}
}

/**
 * Action to toggle between 'view' and 'single-view' modes for Agent Sessions
 */
export class ToggleAgentSessionsViewLocationAction extends Action2 {

	static readonly id = 'workbench.action.chatSessions.toggleNewCombinedView';

	constructor() {
		super({
			id: ToggleAgentSessionsViewLocationAction.id,
			title: localize('chatSessions.toggleViewLocation.label', "Combined Sessions View"),
			category: CHAT_CATEGORY,
			f1: false,
			toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.AgentSessionsViewLocation}`, 'single-view'),
			menu: [
				{
					id: MenuId.ViewContainerTitle,
					when: ContextKeyExpr.equals('viewContainer', LEGACY_AGENT_SESSIONS_VIEW_ID),
					group: '2_togglenew',
					order: 1
				},
				{
					id: MenuId.ViewContainerTitle,
					when: ContextKeyExpr.equals('viewContainer', AGENT_SESSIONS_VIEW_CONTAINER_ID),
					group: '2_togglenew',
					order: 1
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const viewsService = accessor.get(IViewsService);

		const currentValue = configurationService.getValue<string>(ChatConfiguration.AgentSessionsViewLocation);

		const newValue = currentValue === 'single-view' ? 'view' : 'single-view';

		await configurationService.updateValue(ChatConfiguration.AgentSessionsViewLocation, newValue);

		const viewId = newValue === 'single-view' ? AGENT_SESSIONS_VIEW_ID : `${LEGACY_AGENT_SESSIONS_VIEW_ID}.local`;
		await viewsService.openView(viewId, true);
	}
}

// Register the menu item - show for all local chat sessions (including history items)
MenuRegistry.appendMenuItem(MenuId.AgentSessionsContext, {
	command: {
		id: RenameChatSessionAction.id,
		title: localize('renameSession', "Rename"),
		icon: Codicon.pencil
	},
	group: 'inline',
	order: 1,
	when: ContextKeyExpr.and(
		ChatContextKeys.agentSessionType.isEqualTo(localChatSessionType),
		ChatContextKeys.isCombinedAgentSessionsViewer.negate()
	)
});

// Register delete menu item - only show for non-active sessions (history items)
MenuRegistry.appendMenuItem(MenuId.AgentSessionsContext, {
	command: {
		id: DeleteChatSessionAction.id,
		title: localize('deleteSession', "Delete"),
		icon: Codicon.x
	},
	group: 'inline',
	order: 2,
	when: ContextKeyExpr.and(
		ChatContextKeys.isArchivedAgentSession.isEqualTo(true),
		ChatContextKeys.isActiveAgentSession.isEqualTo(false)
	)
});

MenuRegistry.appendMenuItem(MenuId.AgentSessionsContext, {
	command: {
		id: OpenChatSessionInSidebarAction.id,
		title: localize('openSessionInSidebar', "Open in Sidebar")
	},
	group: 'navigation',
	order: 3,
	when: ChatContextKeys.isCombinedAgentSessionsViewer.negate()
});

// Register the toggle command for the ViewTitle menu
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
	command: {
		id: ToggleChatSessionsDescriptionDisplayAction.id,
		title: localize('chatSessions.toggleDescriptionDisplay.label', "Show Rich Descriptions"),
		toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ShowAgentSessionsViewDescription}`, true)
	},
	group: '1_config',
	order: 1,
	when: ContextKeyExpr.equals('viewContainer', LEGACY_AGENT_SESSIONS_VIEW_ID),
});

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	command: {
		id: ACTION_ID_OPEN_CHAT,
		title: nls.localize2('interactiveSession.open', "New Chat Editor"),
		icon: Codicon.plus
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.equals('view', `${LEGACY_AGENT_SESSIONS_VIEW_ID}.local`),
});
