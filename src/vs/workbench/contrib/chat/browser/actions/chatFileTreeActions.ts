/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_IN_CHAT_SESSION, CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { isResponseVM, IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';

export function registerChatFileTreeActions() {
	registerAction2(class NextFileTreeAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.nextFileTree',
				title: {
					value: localize('interactive.nextFileTree.label', "Next File Tree"),
					original: 'Next File Tree'
				},
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyCode.F9,
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_CHAT_SESSION,
				},
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateTrees(accessor, false);
		}
	});

	registerAction2(class PreviousFileTreeAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.previousFileTree',
				title: {
					value: localize('interactive.previousFileTree.label', "Previous File Tree"),
					original: 'Previous File Tree'
				},
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F9,
					weight: KeybindingWeight.WorkbenchContrib,
					when: CONTEXT_IN_CHAT_SESSION,
				},
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			navigateTrees(accessor, true);
		}
	});
}

function navigateTrees(accessor: ServicesAccessor, reverse: boolean) {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const widget = chatWidgetService.lastFocusedWidget;
	if (!widget) {
		return;
	}

	const focused = !widget.inputEditor.hasWidgetFocus() && widget.getFocus();
	const focusedResponse = isResponseVM(focused) ? focused : undefined;

	const currentResponse = focusedResponse ?? widget.viewModel?.getItems().reverse().find((item): item is IChatResponseViewModel => isResponseVM(item));
	if (!currentResponse) {
		return;
	}

	widget.reveal(currentResponse);
	const responseFileTrees = widget.getFileTreeInfosForResponse(currentResponse);
	const lastFocusedFileTree = widget.getLastFocusedFileTreeForResponse(currentResponse);
	const focusIdx = lastFocusedFileTree ?
		(lastFocusedFileTree.treeIndex + (reverse ? -1 : 1) + responseFileTrees.length) % responseFileTrees.length :
		reverse ? responseFileTrees.length - 1 : 0;

	responseFileTrees[focusIdx]?.focus();
}
