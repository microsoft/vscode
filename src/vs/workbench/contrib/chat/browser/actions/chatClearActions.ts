/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize2 } from 'vs/nls';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { CHAT_CATEGORY, isChatViewTitleActionContext } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { clearChatEditor } from 'vs/workbench/contrib/chat/browser/actions/chatClear';
import { CHAT_VIEW_ID, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { CONTEXT_IN_CHAT_SESSION, CONTEXT_CHAT_ENABLED } from 'vs/workbench/contrib/chat/common/chatContextKeys';

export const ACTION_ID_NEW_CHAT = `workbench.action.chat.newChat`;

export function registerNewChatActions() {
	registerAction2(class NewChatEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.newChat',
				title: localize2('chat.newChat.label', "New Chat"),
				icon: Codicon.plus,
				f1: false,
				precondition: CONTEXT_CHAT_ENABLED,
				menu: [{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 0,
					when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				}]
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			announceChatCleared(accessor);
			await clearChatEditor(accessor);
		}
	});

	registerAction2(class GlobalClearChatAction extends Action2 {
		constructor() {
			super({
				id: ACTION_ID_NEW_CHAT,
				title: localize2('chat.newChat.label', "New Chat"),
				category: CHAT_CATEGORY,
				icon: Codicon.plus,
				precondition: CONTEXT_CHAT_ENABLED,
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL
					},
					when: CONTEXT_IN_CHAT_SESSION
				},
				menu: [{
					id: MenuId.ChatContext,
					group: 'z_clear'
				},
				{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
					group: 'navigation',
					order: -1
				}]
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (isChatViewTitleActionContext(context)) {
				// Is running in the Chat view title
				announceChatCleared(accessor);
				context.chatView.clear();
				context.chatView.widget.focusInput();
			} else {
				// Is running from f1 or keybinding
				const widgetService = accessor.get(IChatWidgetService);

				const widget = widgetService.lastFocusedWidget;
				if (!widget) {
					return;
				}
				announceChatCleared(accessor);
				widget.clear();
				widget.focusInput();
			}
		}
	});
}

function announceChatCleared(accessor: ServicesAccessor): void {
	accessor.get(IAccessibilitySignalService).playSignal(AccessibilitySignal.clear);
}
