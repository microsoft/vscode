/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IQuickChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';

export const ASK_QUICK_QUESTION_ACTION_ID = 'workbench.action.quickchat.toggle';
export function registerQuickChatActions() {
	registerAction2(QuickChatGlobalAction);

	registerAction2(class OpenInChatViewAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.quickchat.openInChatView',
				title: {
					value: localize('chat.openInChatView.label', "Open in Chat View"),
					original: 'Open in Chat View'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.commentDiscussion,
				menu: {
					id: MenuId.ChatInputSide,
					group: 'navigation',
					order: 10
				}
			});
		}

		run(accessor: ServicesAccessor) {
			const quickChatService = accessor.get(IQuickChatService);
			quickChatService.openInChatView();
		}
	});

	registerAction2(class CloseQuickChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.quickchat.close',
				title: {
					value: localize('chat.closeQuickChat.label', "Close Quick Chat"),
					original: 'Close Quick Chat'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.close,
				menu: {
					id: MenuId.ChatInputSide,
					group: 'navigation',
					order: 20
				}
			});
		}

		run(accessor: ServicesAccessor) {
			const quickChatService = accessor.get(IQuickChatService);
			quickChatService.close();
		}
	});
}

class QuickChatGlobalAction extends Action2 {
	constructor() {
		super({
			id: ASK_QUICK_QUESTION_ACTION_ID,
			title: { value: localize('quickChat', "Quick Chat"), original: 'Quick Chat' },
			precondition: CONTEXT_PROVIDER_EXISTS,
			icon: Codicon.commentDiscussion,
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
				linux: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyI
				}
			}
		});
	}

	override run(accessor: ServicesAccessor, query?: string): void {
		const quickChatService = accessor.get(IQuickChatService);
		quickChatService.toggle(undefined, query);
	}
}

/**
 * Returns a provider specific action that will open the quick chat for that provider.
 * This is used to include the provider label in the action title so it shows up in
 * the command palette.
 * @param id The id of the provider
 * @param label The label of the provider
 * @returns An action that will open the quick chat for this provider
 */
export function getQuickChatActionForProvider(id: string, label: string) {
	return class AskQuickChatAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.openQuickChat.${id}`,
				category: CHAT_CATEGORY,
				title: { value: localize('interactiveSession.open', "Open Quick Chat ({0})", label), original: `Open Quick Chat (${label})` },
				f1: true
			});
		}

		override run(accessor: ServicesAccessor, query?: string): void {
			const quickChatService = accessor.get(IQuickChatService);
			quickChatService.toggle(id, query);
		}
	};
}
