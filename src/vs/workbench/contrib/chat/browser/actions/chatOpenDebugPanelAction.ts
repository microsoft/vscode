/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from './chatActions.js';
import { ChatDebugEditorInput } from '../chatDebug/chatDebugEditorInput.js';
import { IChatDebugEditorOptions } from '../chatDebug/chatDebugTypes.js';

/**
 * Registers the Open Debug Panel and View Logs actions.
 */
export function registerChatOpenDebugPanelAction() {
	registerAction2(class OpenDebugViewAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.openDebugView',
				title: localize2('chat.openDebugView.label', "Open Debug Panel"),
				f1: true,
				category: CHAT_CATEGORY,
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

	registerAction2(class TroubleshootAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.troubleshoot',
				title: localize2('chat.troubleshoot.label', "View Logs"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: [{
					id: MenuId.ChatContext,
					group: 'z_clear',
					order: -1,
					when: ChatContextKeys.chatSessionHasDebugData
				}, {
					id: CHAT_CONFIG_MENU_ID,
					when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId), ChatContextKeys.chatSessionHasDebugData),
					order: 14,
					group: '3_configure'
				}, {
					id: MenuId.ChatWelcomeContext,
					group: '2_settings',
					order: 0,
					when: ContextKeyExpr.and(ChatContextKeys.inChatEditor.negate(), ChatContextKeys.chatSessionHasDebugData)
				}]
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const chatDebugService = accessor.get(IChatDebugService);

			// Get the active chat session resource from the last focused widget
			const widget = chatWidgetService.lastFocusedWidget;
			const sessionResource = widget?.viewModel?.sessionResource;
			chatDebugService.activeSessionResource = sessionResource;

			const options: IChatDebugEditorOptions = { pinned: true, sessionResource, viewHint: 'logs' };
			await editorService.openEditor(ChatDebugEditorInput.instance, options);
		}
	});
}
