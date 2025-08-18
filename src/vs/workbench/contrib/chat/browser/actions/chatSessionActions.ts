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
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import Severity from '../../../../../base/common/severity.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { IEditorService, ACTIVE_GROUP, AUX_WINDOW_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatWidgetService, ChatViewId } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatViewPane } from '../chatViewPane.js';

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
			category: 'Chat',
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

			// For local sessions, we need to extract the actual session ID from editor or widget
			if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
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

export class MoveChatSessionToNewEditorAction extends Action2 {
	static readonly id = 'workbench.action.chat.moveSessionToNewEditor';

	constructor() {
		super({
			id: MoveChatSessionToNewEditorAction.id,
			title: localize('moveSessionToNewEditor', "Move to New Editor to the Side"),
			f1: false,
			category: 'Chat'
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
			let actualSessionId: string | undefined;
			const currentTitle = session.label;

			if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
				actualSessionId = session.editor.sessionId;
			} else if (session.sessionType === 'widget' && session.widget) {
				actualSessionId = session.widget.viewModel?.model.sessionId;
			} else {
				actualSessionId = session.id;
			}

			if (!actualSessionId) {
				return; 
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

		const editorService = accessor.get(IEditorService);
		const widgetService = accessor.get(IChatWidgetService);

		// Get the widget first to extract view state
		const widget = widgetService.getWidgetBySessionId(sessionContext.sessionId);
		if (widget) {
			const viewState = widget.getViewState();
			
			// Clear the widget
			widget.clear();
			await widget.waitForReady();

			// Open in new editor
			const options: IChatEditorOptions = { 
				target: { sessionId: sessionContext.sessionId }, 
				pinned: true,
				viewState
			};
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, ACTIVE_GROUP);
		}
	}
}

export class MoveChatSessionToNewWindowAction extends Action2 {
	static readonly id = 'workbench.action.chat.moveSessionToNewWindow';

	constructor() {
		super({
			id: MoveChatSessionToNewWindowAction.id,
			title: localize('moveSessionToNewWindow', "Move to New Window"),
			f1: false,
			category: 'Chat'
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
			let actualSessionId: string | undefined;
			const currentTitle = session.label;

			if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
				actualSessionId = session.editor.sessionId;
			} else if (session.sessionType === 'widget' && session.widget) {
				actualSessionId = session.widget.viewModel?.model.sessionId;
			} else {
				actualSessionId = session.id;
			}

			if (!actualSessionId) {
				return; 
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

		const editorService = accessor.get(IEditorService);
		const widgetService = accessor.get(IChatWidgetService);

		// Get the widget first to extract view state
		const widget = widgetService.getWidgetBySessionId(sessionContext.sessionId);
		if (widget) {
			const viewState = widget.getViewState();
			
			// Clear the widget
			widget.clear();
			await widget.waitForReady();

			// Open in new auxiliary window
			const options: IChatEditorOptions = { 
				target: { sessionId: sessionContext.sessionId }, 
				pinned: true,
				viewState,
				auxiliary: { compact: true, bounds: { width: 640, height: 640 } }
			};
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, AUX_WINDOW_GROUP);
		}
	}
}

export class MoveChatSessionToSideBarAction extends Action2 {
	static readonly id = 'workbench.action.chat.moveSessionToSideBar';

	constructor() {
		super({
			id: MoveChatSessionToSideBarAction.id,
			title: localize('moveSessionToSideBar', "Move to Side Bar"),
			f1: false,
			category: 'Chat'
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
			let actualSessionId: string | undefined;
			const currentTitle = session.label;

			if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
				actualSessionId = session.editor.sessionId;
			} else if (session.sessionType === 'widget' && session.widget) {
				actualSessionId = session.widget.viewModel?.model.sessionId;
			} else {
				actualSessionId = session.id;
			}

			if (!actualSessionId) {
				return; 
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

		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const viewsService = accessor.get(IViewsService);

		// If it's an editor session, close the editor and move to sidebar
		if (sessionContext.sessionType === 'editor' && sessionContext.editorInput instanceof ChatEditorInput) {
			const chatEditor = editorService.activeEditorPane;
			const viewState = chatEditor?.getViewState?.();
			
			await editorService.closeEditor({ 
				editor: sessionContext.editorInput, 
				groupId: editorGroupService.activeGroup.id 
			});
			
			const view = await viewsService.openView(ChatViewId) as ChatViewPane;
			await view.loadSession(sessionContext.sessionId, viewState);
			view.focus();
		} else {
			// Widget is already in the side bar, so just focus it
			const view = await viewsService.openView(ChatViewId) as ChatViewPane;
			view.focus();
		}
	}
}

// Register the menu item - only show for local chat sessions
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: RenameChatSessionAction.id,
		title: localize('renameSession', "Rename")
	},
	group: 'context',
	order: 1,
	when: ChatContextKeys.sessionType.isEqualTo('local')
});

// Register migration action menu items - only show for local chat sessions
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: MoveChatSessionToNewEditorAction.id,
		title: localize('moveSessionToNewEditor', "Move to New Editor to the Side")
	},
	group: 'migration',
	order: 1,
	when: ChatContextKeys.sessionType.isEqualTo('local')
});

MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: MoveChatSessionToNewWindowAction.id,
		title: localize('moveSessionToNewWindow', "Move to New Window")
	},
	group: 'migration',
	order: 2,
	when: ChatContextKeys.sessionType.isEqualTo('local')
});

MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: MoveChatSessionToSideBarAction.id,
		title: localize('moveSessionToSideBar', "Move to Side Bar")
	},
	group: 'migration',
	order: 3,
	when: ChatContextKeys.sessionType.isEqualTo('local')
});
