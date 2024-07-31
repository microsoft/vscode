/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { CHAT_CATEGORY, stringifyItem } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_RESPONSE_FILTERED } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

export function registerChatCopyActions() {
	registerAction2(class CopyAllAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.copyAll',
				title: localize2('interactive.copyAll.label', "Copy All"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatContext,
					when: CONTEXT_RESPONSE_FILTERED.toNegated(),
					group: 'copy',
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
					.filter((item): item is (IChatRequestViewModel | IChatResponseViewModel) => isRequestVM(item) || (isResponseVM(item) && !item.errorDetails?.responseIsFiltered))
					.map(item => stringifyItem(item))
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
				title: localize2('interactive.copyItem.label', "Copy"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatContext,
					when: CONTEXT_RESPONSE_FILTERED.toNegated(),
					group: 'copy',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isRequestVM(item) && !isResponseVM(item)) {
				return;
			}

			const clipboardService = accessor.get(IClipboardService);
			const text = stringifyItem(item, false);
			clipboardService.writeText(text);
		}
	});
}
