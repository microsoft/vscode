/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_IN_CHAT_LIST } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

export function registerChatCopyActions() {
	registerAction2(class CopyAllAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.copyAll',
				title: {
					value: localize('interactive.copyAll.label', "Copy All"),
					original: 'Copy All'
				},
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatContext
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const clipboardService = accessor.get(IClipboardService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const widget = chatWidgetService.lastFocusedWidget;
			if (widget) {
				const viewModel = widget.viewModel;
				const sessionAsText = viewModel?.getItems()
					.filter((item): item is (IChatRequestViewModel | IChatResponseViewModel) => isRequestVM(item) || isResponseVM(item))
					.map(stringifyItem)
					.join('\n\n');
				if (sessionAsText) {
					clipboardService.writeText(sessionAsText);
				}
			}
		}
	});

	registerAction2(class CopyItemAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.copyItem',
				title: {
					value: localize('interactive.copyItem.label', "Copy"),
					original: 'Copy'
				},
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatContext
				},
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyMod.CtrlCmd | KeyCode.KeyC,
					when: CONTEXT_IN_CHAT_LIST
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			let item = args[0];
			if (!isRequestVM(item) && !isResponseVM(item)) {
				const widgetService = accessor.get(IChatWidgetService);
				item = widgetService.lastFocusedWidget?.getFocus();
				if (!isRequestVM(item) && !isResponseVM(item)) {
					return;
				}
			}

			const clipboardService = accessor.get(IClipboardService);
			const text = stringifyItem(item);
			clipboardService.writeText(text);
		}
	});
}

function stringifyItem(item: IChatRequestViewModel | IChatResponseViewModel): string {
	return isRequestVM(item) ?
		`${item.username}: ${item.messageText}` : `${item.username}: ${item.response.asString()}`;
}
