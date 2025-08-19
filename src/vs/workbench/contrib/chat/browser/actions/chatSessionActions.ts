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
import { IEditorService, SIDE_GROUP, AUX_WINDOW_GROUP } from '../../../../services/editor/common/editorService.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatSessionUri } from '../../common/chatUri.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatViewId } from '../chat.js';
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
		provider?: {
			chatSessionType: string;
		};
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

export class OpenChatSessionInNewEditorAction extends Action2 {
	static readonly id = 'workbench.action.chat.moveSessionToNewEditor';

	constructor() {
		super({
			id: OpenChatSessionInNewEditorAction.id,
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
		let chatSessionType: string | undefined;
		
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

			// Get the chat session type from the provider
			chatSessionType = session.provider?.chatSessionType;

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
		const logService = accessor.get(ILogService);

		try {
			// For extension-contributed sessions, use ChatSessionUri to create proper URI
			if (chatSessionType && chatSessionType !== 'local') {
				const sessionUri = ChatSessionUri.forSession(chatSessionType, sessionContext.sessionId);
				const options: IChatEditorOptions = {
					pinned: true
				};
				await editorService.openEditor({ resource: sessionUri, options }, SIDE_GROUP);
				logService.info(`OpenChatSessionInNewEditorAction: Successfully opened extension session ${sessionContext.sessionId} (type: ${chatSessionType}) in new editor group`);
			} else {
				// Fall back to original approach for local sessions (though this action shouldn't show for local sessions)
				const options: IChatEditorOptions = {
					target: { sessionId: sessionContext.sessionId },
					pinned: true
				};
				await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, SIDE_GROUP);
				logService.info(`OpenChatSessionInNewEditorAction: Successfully opened local session ${sessionContext.sessionId} in new editor group`);
			}
		} catch (error) {
			logService.error('OpenChatSessionInNewEditorAction: Failed to open chat session in new editor', error);
		}
	}
}

export class OpenChatSessionInNewWindowAction extends Action2 {
	static readonly id = 'workbench.action.chat.moveSessionToNewWindow';

	constructor() {
		super({
			id: OpenChatSessionInNewWindowAction.id,
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
		let chatSessionType: string | undefined;
		
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

			// Get the chat session type from the provider
			chatSessionType = session.provider?.chatSessionType;

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
		const logService = accessor.get(ILogService);

		try {
			// For extension-contributed sessions, use ChatSessionUri to create proper URI
			if (chatSessionType && chatSessionType !== 'local') {
				const sessionUri = ChatSessionUri.forSession(chatSessionType, sessionContext.sessionId);
				const options: IChatEditorOptions = {
					pinned: true,
					auxiliary: { compact: true, bounds: { width: 640, height: 640 } }
				};
				await editorService.openEditor({ resource: sessionUri, options }, AUX_WINDOW_GROUP);
				logService.info(`OpenChatSessionInNewWindowAction: Successfully opened extension session ${sessionContext.sessionId} (type: ${chatSessionType}) in new auxiliary window`);
			} else {
				// Fall back to original approach for local sessions (though this action shouldn't show for local sessions)
				const options: IChatEditorOptions = {
					target: { sessionId: sessionContext.sessionId },
					pinned: true,
					auxiliary: { compact: true, bounds: { width: 640, height: 640 } }
				};
				await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, AUX_WINDOW_GROUP);
				logService.info(`OpenChatSessionInNewWindowAction: Successfully opened local session ${sessionContext.sessionId} in new auxiliary window`);
			}
		} catch (error) {
			logService.error('OpenChatSessionInNewWindowAction: Failed to open chat session in new window', error);
		}
	}
}

export class OpenChatSessionInSideBarAction extends Action2 {
	static readonly id = 'workbench.action.chat.moveSessionToSideBar';

	constructor() {
		super({
			id: OpenChatSessionInSideBarAction.id,
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
		let chatSessionType: string | undefined;
		
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

			// Get the chat session type from the provider
			chatSessionType = session.provider?.chatSessionType;

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
		const viewsService = accessor.get(IViewsService);
		const logService = accessor.get(ILogService);

		try {
			// For extension-contributed sessions, load in sidebar using the same pattern as $showChatSession
			if (chatSessionType && chatSessionType !== 'local') {
				const sessionUri = ChatSessionUri.forSession(chatSessionType, sessionContext.sessionId);
				
				// Close any existing editors for this session first
				const editors = editorService.editors;
				for (const editor of editors) {
					if (editor instanceof ChatEditorInput && editor.sessionId === sessionContext.sessionId) {
						await editorService.closeEditor(editor);
					}
				}
				
				// Open in sidebar using the same approach as mainThreadChatSessions.$showChatSession
				const chatPanel = await viewsService.openView<ChatViewPane>(ChatViewId);
				await chatPanel?.loadSession(sessionUri);
				logService.info(`OpenChatSessionInSideBarAction: Successfully moved extension session ${sessionContext.sessionId} (type: ${chatSessionType}) to side bar`);
			} else {
				// This action shouldn't show for local sessions, but handle gracefully
				logService.warn(`OpenChatSessionInSideBarAction: Action called for local session ${sessionContext.sessionId}, which should not happen`);
			}
		} catch (error) {
			logService.error('OpenChatSessionInSideBarAction: Failed to move chat session to side bar', error);
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

// Register migration action menu items - only show for non-local chat sessions
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: OpenChatSessionInNewEditorAction.id,
		title: localize('moveSessionToNewEditor', "Move to New Editor to the Side")
	},
	group: 'migration',
	order: 9,
	when: ChatContextKeys.sessionType.notEqualsTo('local')
});

MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: OpenChatSessionInNewWindowAction.id,
		title: localize('moveSessionToNewWindow', "Move to New Window")
	},
	group: 'migration',
	order: 10,
	when: ChatContextKeys.sessionType.notEqualsTo('local')
});

MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: OpenChatSessionInSideBarAction.id,
		title: localize('moveSessionToSideBar', "Move to Side Bar")
	},
	group: 'migration',
	order: 11,
	when: ChatContextKeys.sessionType.notEqualsTo('local')
});
