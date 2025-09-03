/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItem, IChatSessionsService } from '../../common/chatSessionsService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import Severity from '../../../../../base/common/severity.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatEditor } from '../chatEditor.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatSessionUri } from '../../common/chatUri.js';
import { ILocalChatSessionItem, VIEWLET_ID } from '../chatSessions.js';
import { GroupDirection, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { ChatViewPane } from '../chatViewPane.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';

export interface IChatSessionContext {
	sessionId: string;
	sessionType: 'editor' | 'widget';
	currentTitle: string;
	editorInput?: any;
	editorGroup?: any;
	widget?: any;
}

interface IMarshalledChatSessionContext {
	$mid: MarshalledId.ChatSessionContext;
	session: {
		id: string;
		label: string;
		editor?: ChatEditorInput;
		widget?: any;
		sessionType?: 'editor' | 'widget';
	};
}

function isLocalChatSessionItem(item: IChatSessionItem): item is ILocalChatSessionItem {
	return ('editor' in item && 'group' in item) || ('widget' in item && 'sessionType' in item);
}

/**
 * Helper method to find and close all existing instances of a chat session.
 * This ensures we implement "move" behavior instead of "duplicate" behavior.
 * Returns view state if available for preserving user's position.
 */
async function findAndCloseExistingSessionInstances(
	accessor: ServicesAccessor,
	sessionId: string
): Promise<any> {
	let preservedViewState: any = undefined;
	
	try {
		// First, try to get view state from widget before clearing it
		const widgetService = accessor.get(IChatWidgetService);
		const widget = widgetService.getWidgetBySessionId(sessionId);
		if (widget) {
			preservedViewState = widget.getViewState?.();
		}
		
		// Close widget instances
		await clearWidgetBySessionId(accessor, sessionId);
		
		// Close editor instances (may also preserve view state)
		const editorViewState = await closeEditorsBySessionId(accessor, sessionId);
		if (!preservedViewState && editorViewState) {
			preservedViewState = editorViewState;
		}
		
		return preservedViewState;
	} catch (error) {
		// Log error but don't fail the operation
		const logService = accessor.get(ILogService);
		logService.warn('Failed to close existing session instances', error);
		return preservedViewState;
	}
}

/**
 * Helper method to close all editor instances matching a session ID
 * Returns view state from the closed editor if available
 */
async function closeEditorsBySessionId(
	accessor: ServicesAccessor,
	sessionId: string
): Promise<any> {
	const editorService = accessor.get(IEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);
	
	let preservedViewState: any = undefined;
	const editorsToClose: Array<{ editor: ChatEditorInput; groupId: number }> = [];
	
	// Find all chat editors matching the session ID
	for (const group of editorGroupService.groups) {
		for (const editor of group.editors) {
			if (editor instanceof ChatEditorInput && editor.sessionId === sessionId) {
				// Try to get view state from active editor if this is the active one
				if (group.activeEditor === editor) {
					const activePane = editorService.activeEditorPane;
					if (activePane instanceof ChatEditor) {
						preservedViewState = activePane.getViewState?.();
					}
				}
				editorsToClose.push({ editor, groupId: group.id });
			}
		}
	}
	
	// Close all matching editors
	for (const { editor, groupId } of editorsToClose) {
		await editorService.closeEditor({ editor, groupId });
	}
	
	return preservedViewState;
}

/**
 * Helper method to clear all widget instances matching a session ID
 */
async function clearWidgetBySessionId(
	accessor: ServicesAccessor,
	sessionId: string
): Promise<void> {
	const widgetService = accessor.get(IChatWidgetService);
	
	// Find and clear the widget with the matching session ID
	const widget = widgetService.getWidgetBySessionId(sessionId);
	if (widget) {
		widget.clear();
		await widget.waitForReady();
	}
}

function isMarshalledChatSessionContext(obj: unknown): obj is IMarshalledChatSessionContext {
	return !!obj &&
		typeof obj === 'object' &&
		'$mid' in obj &&
		(obj as any).$mid === MarshalledId.ChatSessionContext &&
		'session' in obj;
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

	async run(accessor: ServicesAccessor, context?: IChatSessionContext | IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		// Handle marshalled context from menu actions
		let sessionContext: IChatSessionContext;
		if (isMarshalledChatSessionContext(context)) {
			const session = context.session;
			// Extract actual session ID based on session type
			let actualSessionId: string | undefined;
			const currentTitle = session.label;

			// For history sessions, we need to extract the actual session ID
			if (session.id.startsWith('history-')) {
				actualSessionId = session.id.replace('history-', '');
			} else if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
				actualSessionId = session.editor.sessionId;
			} else if (session.sessionType === 'widget' && session.widget) {
				actualSessionId = session.widget.viewModel?.model.sessionId;
			} else {
				// Fall back to using the session ID directly
				actualSessionId = session.id;
			}

			if (!actualSessionId) {
				return; // Can't proceed without a session ID
			}

			sessionContext = {
				sessionId: actualSessionId,
				sessionType: session.sessionType || 'editor',
				currentTitle: currentTitle,
				editorInput: session.editor,
				widget: session.widget
			};
		} else {
			sessionContext = context;
		}

		const chatSessionsService = accessor.get(IChatSessionsService);
		const logService = accessor.get(ILogService);
		const chatService = accessor.get(IChatService);

		try {
			// Find the chat sessions view and trigger inline rename mode
			// This is similar to how file renaming works in the explorer
			await chatSessionsService.setEditableSession(sessionContext.sessionId, {
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
				startingValue: sessionContext.currentTitle,
				onFinish: async (value: string, success: boolean) => {
					if (success && value && value.trim() !== sessionContext.currentTitle) {
						try {
							const newTitle = value.trim();
							chatService.setChatSessionTitle(sessionContext.sessionId, newTitle);
							// Notify the local sessions provider that items have changed
							chatSessionsService.notifySessionItemsChanged('local');
						} catch (error) {
							logService.error(
								localize('renameSession.error', "Failed to rename chat session: {0}",
									(error instanceof Error ? error.message : String(error)))
							);
						}
					}
					await chatSessionsService.setEditableSession(sessionContext.sessionId, null);
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

	async run(accessor: ServicesAccessor, context?: IChatSessionContext | IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		// Handle marshalled context from menu actions
		let sessionContext: IChatSessionContext;
		if (isMarshalledChatSessionContext(context)) {
			const session = context.session;
			// Extract actual session ID based on session type
			let actualSessionId: string | undefined;
			const currentTitle = session.label;

			// For history sessions, we need to extract the actual session ID
			if (session.id.startsWith('history-')) {
				actualSessionId = session.id.replace('history-', '');
			} else if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
				actualSessionId = session.editor.sessionId;
			} else if (session.sessionType === 'widget' && session.widget) {
				actualSessionId = session.widget.viewModel?.model.sessionId;
			} else {
				// Fall back to using the session ID directly
				actualSessionId = session.id;
			}

			if (!actualSessionId) {
				return; // Can't proceed without a session ID
			}

			sessionContext = {
				sessionId: actualSessionId,
				sessionType: session.sessionType || 'editor',
				currentTitle: currentTitle,
				editorInput: session.editor,
				widget: session.widget
			};
		} else {
			sessionContext = context;
		}

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
				await chatService.removeHistoryEntry(sessionContext.sessionId);
				// Notify the local sessions provider that items have changed
				chatSessionsService.notifySessionItemsChanged('local');
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
			title: localize('chat.openSessionInNewWindow.label', "Open Chat in New Window"),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatSessionContext | IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		const editorService = accessor.get(IEditorService);
		let sessionId: string;
		let sessionItem: IChatSessionItem | undefined;

		if (isMarshalledChatSessionContext(context)) {
			const session = context.session;
			sessionItem = session;

			// For local sessions, extract the actual session ID from editor or widget
			if (isLocalChatSessionItem(session)) {
				if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
					sessionId = session.editor.sessionId || session.id;
				} else if (session.sessionType === 'widget' && session.widget) {
					sessionId = session.widget.viewModel?.model.sessionId || session.id;
				} else {
					sessionId = session.id;
				}
			} else {
				// For external provider sessions, use the session ID directly
				sessionId = session.id;
			}
		} else {
			sessionId = context.sessionId;
		}

		// Close existing instances before opening in new window (implements move behavior)
		if (sessionItem && (isLocalChatSessionItem(sessionItem) || sessionId.startsWith('history-'))) {
			const sessionIdWithoutHistory = sessionId.replace('history-', '');
			const preservedViewState = await findAndCloseExistingSessionInstances(accessor, sessionIdWithoutHistory);
			
			const options: IChatEditorOptions = {
				target: { sessionId: sessionIdWithoutHistory },
				pinned: true,
				auxiliary: { compact: false },
				ignoreInView: true,
				viewState: preservedViewState
			};
			// For local sessions, create a new chat editor in the auxiliary window
			await editorService.openEditor({
				resource: ChatEditorInput.getNewEditorUri(),
				options,
			}, AUX_WINDOW_GROUP);
		} else {
			// For external provider sessions, close existing instances first
			await findAndCloseExistingSessionInstances(accessor, sessionId);
			
			// For external provider sessions, open the existing session in the auxiliary window
			const providerType = sessionItem && (sessionItem as any).provider?.chatSessionType || 'external';
			await editorService.openEditor({
				resource: ChatSessionUri.forSession(providerType, sessionId),
				options: {
					pinned: true,
					auxiliary: { compact: false }
				} satisfies IChatEditorOptions
			}, AUX_WINDOW_GROUP);
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
			title: localize('chat.openSessionInNewEditorGroup.label', "Open Chat to the Side"),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatSessionContext | IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		let sessionId: string;
		let sessionItem: IChatSessionItem | undefined;

		if (isMarshalledChatSessionContext(context)) {
			const session = context.session;
			sessionItem = session;

			if (isLocalChatSessionItem(session)) {
				if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
					sessionId = session.editor.sessionId || session.id;
				} else if (session.sessionType === 'widget' && session.widget) {
					sessionId = session.widget.viewModel?.model.sessionId || session.id;
				} else {
					sessionId = session.id;
				}
			} else {
				sessionId = session.id;
			}
		} else {
			sessionId = context.sessionId;
		}

		// Close existing instances before opening in new editor group (implements move behavior)
		// Create a new editor group to the right
		const newGroup = editorGroupService.addGroup(editorGroupService.activeGroup, GroupDirection.RIGHT);
		if (sessionItem && (isLocalChatSessionItem(sessionItem) || sessionId.startsWith('history-'))) {
			const sessionIdWithoutHistory = sessionId.replace('history-', '');
			const preservedViewState = await findAndCloseExistingSessionInstances(accessor, sessionIdWithoutHistory);
			
			const options: IChatEditorOptions = {
				target: { sessionId: sessionIdWithoutHistory },
				pinned: true,
				ignoreInView: true,
				viewState: preservedViewState
			};
			// For local sessions, create a new chat editor
			await editorService.openEditor({
				resource: ChatEditorInput.getNewEditorUri(),
				options,
			}, newGroup.id);
		} else {
			// For external provider sessions, close existing instances first
			await findAndCloseExistingSessionInstances(accessor, sessionId);
			
			// For external provider sessions, open the existing session
			const providerType = sessionItem && (sessionItem as any).provider?.chatSessionType || 'external';
			await editorService.openEditor({
				resource: ChatSessionUri.forSession(providerType, sessionId),
				options: { pinned: true } satisfies IChatEditorOptions
			}, newGroup.id);
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
			title: localize('chat.openSessionInSidebar.label', "Open Chat in Sidebar"),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatSessionContext | IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		const viewsService = accessor.get(IViewsService);
		let sessionId: string;
		let sessionItem: IChatSessionItem | undefined;

		if (isMarshalledChatSessionContext(context)) {
			const session = context.session;
			sessionItem = session;

			if (isLocalChatSessionItem(session)) {
				if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
					sessionId = session.editor.sessionId || session.id;
				} else if (session.sessionType === 'widget' && session.widget) {
					sessionId = session.widget.viewModel?.model.sessionId || session.id;
				} else {
					sessionId = session.id;
				}
			} else {
				sessionId = session.id;
			}
		} else {
			sessionId = context.sessionId;
		}

		// Close existing instances before opening in sidebar (implements move behavior)
		// Open the chat view in the sidebar
		const chatViewPane = await viewsService.openView(ChatViewId) as ChatViewPane;
		if (chatViewPane) {
			// Handle different session types
			if (sessionItem && (isLocalChatSessionItem(sessionItem) || sessionId.startsWith('history-'))) {
				// For local sessions and history sessions, remove the 'history-' prefix if present
				const sessionIdWithoutHistory = sessionId.replace('history-', '');
				const preservedViewState = await findAndCloseExistingSessionInstances(accessor, sessionIdWithoutHistory);
				// Load using the session ID directly with preserved view state
				await chatViewPane.loadSession(sessionIdWithoutHistory, preservedViewState);
			} else {
				// For external provider sessions, close existing instances first
				const preservedViewState = await findAndCloseExistingSessionInstances(accessor, sessionId);
				// For external provider sessions, create a URI and load using that
				const providerType = sessionItem && (sessionItem as any).provider?.chatSessionType || 'external';
				const sessionUri = ChatSessionUri.forSession(providerType, sessionId);
				await chatViewPane.loadSession(sessionUri, preservedViewState);
			}

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

// Register the menu item - show for all local chat sessions (including history items)
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: RenameChatSessionAction.id,
		title: localize('renameSession', "Rename"),
		icon: Codicon.pencil
	},
	group: 'inline',
	order: 1,
	when: ChatContextKeys.sessionType.isEqualTo('local')
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
		title: localize('openSessionInNewEditorGroup', "Open in New Editor Group")
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
	when: ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
});

