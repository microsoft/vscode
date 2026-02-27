/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isChatViewTitleActionContext } from '../../common/actions/chatActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { ChatDebugEditorInput } from '../chatDebug/chatDebugEditorInput.js';
import { IChatDebugEditorOptions } from '../chatDebug/chatDebugTypes.js';

/**
 * Registers the Open Agent Debug Panel and Show Agent Logs actions.
 */
export function registerChatOpenAgentDebugPanelAction() {
	registerAction2(class OpenAgentDebugPanelAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openAgentDebugPanel',
				title: localize2('chat.openAgentDebugPanel.label', "Open Agent Debug Panel"),
				f1: true,
				category: Categories.Developer,
				precondition: ChatContextKeys.enabled,
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const chatDebugService = accessor.get(IChatDebugService);

			// Clear active session so the editor shows the home view
			chatDebugService.activeSessionResource = undefined;

			const options: IChatDebugEditorOptions = { pinned: true, viewHint: 'home' };
			await editorService.openEditor(ChatDebugEditorInput.instance, options);
		}
	});

	registerAction2(class OpenAgentDebugPanelForSessionAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openAgentDebugPanelForSession',
				title: localize2('chat.openAgentDebugPanelForSession.label', "Show Agent Logs"),
				f1: false,
				category: CHAT_CATEGORY,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionHasDebugData),
				menu: [{
					id: CHAT_CONFIG_MENU_ID,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
					order: 0,
					group: '4_logs'
				}, {
					id: MenuId.ChatWelcomeContext,
					group: '2_settings',
					order: 0,
					when: ChatContextKeys.inChatEditor.negate()
				}]
			});
		}

		async run(accessor: ServicesAccessor, context?: URI | unknown): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const chatDebugService = accessor.get(IChatDebugService);

			// Extract session resource from context — may be a URI directly
			// or an IChatViewTitleActionContext from the chat config menu
			let sessionResource: URI | undefined;
			if (URI.isUri(context)) {
				sessionResource = context;
			} else if (isChatViewTitleActionContext(context)) {
				sessionResource = context.sessionResource;
			}

			// Fall back to the last focused widget
			if (!sessionResource) {
				const widget = chatWidgetService.lastFocusedWidget;
				sessionResource = widget?.viewModel?.sessionResource;
			}
			chatDebugService.activeSessionResource = sessionResource;

			const options: IChatDebugEditorOptions = { pinned: true, sessionResource, viewHint: 'logs' };
			await editorService.openEditor(ChatDebugEditorInput.instance, options);
		}
	});
}
