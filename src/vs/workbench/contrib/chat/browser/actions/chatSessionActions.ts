/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { IChatSessionRecommendation } from '../../../../../base/common/product.js';
import Severity from '../../../../../base/common/severity.js';
import * as nls from '../../../../../nls.js';
import { localize } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { AUX_WINDOW_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { AGENT_SESSIONS_VIEWLET_ID, ChatConfiguration } from '../../common/constants.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatSessionItemWithProvider, findExistingChatEditorByUri } from '../chatSessions/common.js';
import { ChatViewPane } from '../chatViewPane.js';
import { ACTION_ID_OPEN_CHAT, CHAT_CATEGORY } from './chatActions.js';

interface IMarshalledChatSessionContext {
	$mid: MarshalledId.ChatSessionContext;
	session: ChatSessionItemWithProvider;
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
 * Action to open a chat session in a new window
 */
export class OpenChatSessionInNewWindowAction extends Action2 {
	static readonly id = 'workbench.action.chat.openSessionInNewWindow';

	constructor() {
		super({
			id: OpenChatSessionInNewWindowAction.id,
			title: localize('chat.openSessionInNewWindow.label', "Move Chat into New Window"),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, context?: IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		const editorService = accessor.get(IEditorService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		if (context.session.provider?.chatSessionType) {
			const uri = context.session.resource;

			// Check if this session is already open in another editor
			const existingEditor = findExistingChatEditorByUri(uri, editorGroupsService);
			if (existingEditor) {
				await editorService.openEditor(existingEditor.editor, existingEditor.group);
				return;
			} else if (chatWidgetService.getWidgetBySessionResource(uri)) {
				return;
			} else {
				const options: IChatEditorOptions = {
					ignoreInView: true,
				};
				await editorService.openEditor({
					resource: uri,
					options,
				}, AUX_WINDOW_GROUP);
			}
		}
	}
}

/**
 * Action to open a chat session in a new editor group to the side
 */
export class OpenChatSessionInNewEditorGroupAction extends Action2 {
	static readonly id = 'workbench.action.chat.openSessionInNewEditorGroup';

	constructor() {
		super({
			id: OpenChatSessionInNewEditorGroupAction.id,
			title: localize('chat.openSessionInNewEditorGroup.label', "Move Chat to the Side"),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, context?: IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		const editorService = accessor.get(IEditorService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		if (context.session.provider?.chatSessionType) {
			const uri = context.session.resource;
			// Check if this session is already open in another editor
			const existingEditor = findExistingChatEditorByUri(uri, editorGroupsService);
			if (existingEditor) {
				await editorService.openEditor(existingEditor.editor, existingEditor.group);
				return;
			} else if (chatWidgetService.getWidgetBySessionResource(uri)) {
				// Already opened in chat widget
				return;
			} else {
				const options: IChatEditorOptions = {
					ignoreInView: true,
				};
				await editorService.openEditor({
					resource: uri,
					options,
				}, SIDE_GROUP);
			}
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
		const editorService = accessor.get(IEditorService);
		const viewsService = accessor.get(IViewsService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const editorGroupsService = accessor.get(IEditorGroupsService);

		if (!context) {
			return;
		}

		if (context.session.provider.chatSessionType !== localChatSessionType) {
			// We only allow local sessions to be opened in the side bar
			return;
		}

		// Check if this session is already open in another editor
		// TODO: this feels strange. Should we prefer moving the editor to the sidebar instead?
		const existingEditor = findExistingChatEditorByUri(context.session.resource, editorGroupsService);
		if (existingEditor) {
			await editorService.openEditor(existingEditor.editor, existingEditor.group);
			return;
		} else if (chatWidgetService.getWidgetBySessionResource(context.session.resource)) {
			return;
		}

		// Open the chat view in the sidebar
		const chatViewPane = await viewsService.openView(ChatViewId) as ChatViewPane;
		if (chatViewPane) {
			// Handle different session types
			await chatViewPane.loadSession(context.session.resource);

			// Focus the chat input
			chatViewPane.focusInput();
		}
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

	static readonly id = 'workbench.action.chatSessions.toggleNewSingleView';

	constructor() {
		super({
			id: ToggleAgentSessionsViewLocationAction.id,
			title: localize('chatSessions.toggleViewLocation.label', "Enable New Single View"),
			category: CHAT_CATEGORY,
			f1: false,
			toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.AgentSessionsViewLocation}`, 'single-view'),
			menu: [
				{
					id: MenuId.ViewContainerTitle,
					when: ContextKeyExpr.equals('viewContainer', AGENT_SESSIONS_VIEWLET_ID),
					group: '2_togglenew',
					order: 1
				},
				{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', 'workbench.view.agentSessions'),
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

		const viewId = newValue === 'single-view' ? 'workbench.view.agentSessions' : `${AGENT_SESSIONS_VIEWLET_ID}.local`;
		await viewsService.openView(viewId, true);
	}
}

export class ChatSessionsGettingStartedAction extends Action2 {
	static readonly ID = 'chat.sessions.gettingStarted';

	constructor() {
		super({
			id: ChatSessionsGettingStartedAction.ID,
			title: nls.localize2('chat.sessions.gettingStarted.action', "Getting Started with Chat Sessions"),
			icon: Codicon.sendToRemoteAgent,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const productService = accessor.get(IProductService);
		const quickInputService = accessor.get(IQuickInputService);
		const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
		const extensionGalleryService = accessor.get(IExtensionGalleryService);

		const recommendations = productService.chatSessionRecommendations;
		if (!recommendations || recommendations.length === 0) {
			return;
		}

		const installedExtensions = await extensionManagementService.getInstalled();
		const isExtensionAlreadyInstalled = (extensionId: string) => {
			return installedExtensions.find(installed => installed.identifier.id === extensionId);
		};

		const quickPickItems = recommendations.map((recommendation: IChatSessionRecommendation) => {
			const extensionInstalled = !!isExtensionAlreadyInstalled(recommendation.extensionId);
			return {
				label: recommendation.displayName,
				description: recommendation.description,
				detail: extensionInstalled
					? nls.localize('chatSessions.extensionAlreadyInstalled', "'{0}' is already installed", recommendation.extensionName)
					: nls.localize('chatSessions.installExtension', "Installs '{0}'", recommendation.extensionName),
				extensionId: recommendation.extensionId,
				disabled: extensionInstalled,
			};
		});

		const selected = await quickInputService.pick(quickPickItems, {
			title: nls.localize('chatSessions.selectExtension', "Install Chat Extensions"),
			placeHolder: nls.localize('chatSessions.pickPlaceholder', "Choose extensions to enhance your chat experience"),
			canPickMany: true,
		});

		if (!selected) {
			return;
		}

		const galleryExtensions = await extensionGalleryService.getExtensions(selected.map(item => ({ id: item.extensionId })), CancellationToken.None);
		if (!galleryExtensions) {
			return;
		}
		await extensionManagementService.installGalleryExtensions(galleryExtensions.map(extension => ({ extension, options: { preRelease: productService.quality !== 'stable' } })));
	}
}

// Register the menu item - show for all local chat sessions (including history items)
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: RenameChatSessionAction.id,
		title: localize('renameSession', "Rename"),
		icon: Codicon.pencil
	},
	group: 'inline',
	order: 1,
	when: ChatContextKeys.sessionType.isEqualTo(localChatSessionType)
});

// Register delete menu item - only show for non-active sessions (history items)
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: DeleteChatSessionAction.id,
		title: localize('deleteSession', "Delete"),
		icon: Codicon.x
	},
	group: 'inline',
	order: 2,
	when: ContextKeyExpr.and(
		ChatContextKeys.isHistoryItem.isEqualTo(true),
		ChatContextKeys.isActiveSession.isEqualTo(false)
	)
});

MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: OpenChatSessionInNewWindowAction.id,
		title: localize('openSessionInNewWindow', "Open in New Window")
	},
	group: 'navigation',
	order: 1,
});

MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: OpenChatSessionInNewEditorGroupAction.id,
		title: localize('openToSide', "Open to the Side")
	},
	group: 'navigation',
	order: 2,
});

MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: OpenChatSessionInSidebarAction.id,
		title: localize('openSessionInSidebar', "Open in Sidebar")
	},
	group: 'navigation',
	order: 3,
	when: ChatContextKeys.sessionType.isEqualTo(localChatSessionType),
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
	when: ContextKeyExpr.equals('viewContainer', AGENT_SESSIONS_VIEWLET_ID),
});

MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
	command: {
		id: ACTION_ID_OPEN_CHAT,
		title: nls.localize2('interactiveSession.open', "New Chat Editor"),
		icon: Codicon.plus
	},
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.equals('view', `${AGENT_SESSIONS_VIEWLET_ID}.local`),
});
