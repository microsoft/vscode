/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { clearChatEditor, clearChatSession } from 'vs/workbench/contrib/chat/browser/actions/chatClear';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_IN_CHAT_SESSION, CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';

export function registerClearActions() {

	registerAction2(class ClearEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.clear',
				title: {
					value: localize('interactiveSession.clear.label', "Clear"),
					original: 'Clear'
				},
				icon: Codicon.clearAll,
				f1: false,
				menu: [{
					id: MenuId.EditorTitle,
					group: 'navigation',
					order: 0,
					when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				}]
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			await clearChatEditor(accessor);
		}
	});


	registerAction2(class GlobalClearChatAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.clear`,
				title: {
					value: localize('interactiveSession.clear.label', "Clear"),
					original: 'Clear'
				},
				category: CHAT_CATEGORY,
				icon: Codicon.clearAll,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true,
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyL,
					mac: {
						primary: KeyMod.WinCtrl | KeyCode.KeyL
					},
					when: CONTEXT_IN_CHAT_SESSION
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}

			await clearChatSession(accessor, widget);
		}
	});
}

const getClearChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	viewId,
	id: `workbench.action.chat.${providerId}.clear`,
	title: {
		value: localize('interactiveSession.clear.label', "Clear"),
		original: 'Clear'
	},
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.equals('view', viewId),
		group: 'navigation',
		order: 0
	},
	category: CHAT_CATEGORY,
	icon: Codicon.clearAll,
	f1: false
});

export function getClearAction(viewId: string, providerId: string) {
	return class ClearAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getClearChatActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			await view.clear();
		}
	};
}
