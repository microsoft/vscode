/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Selection } from 'vs/editor/common/core/selection';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IQuickChatService, IQuickChatOpenOptions } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';

export const ASK_QUICK_QUESTION_ACTION_ID = 'workbench.action.quickchat.toggle';
export function registerQuickChatActions() {
	registerAction2(QuickChatGlobalAction);

	registerAction2(class OpenInChatViewAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.quickchat.openInChatView',
				title: localize2('chat.openInChatView.label', "Open in Chat View"),
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
				title: localize2('chat.closeQuickChat.label', "Close Quick Chat"),
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

	registerAction2(class LaunchInlineChatFromQuickChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.quickchat.launchInlineChat',
				title: localize2('chat.launchInlineChat.label', "Launch Inline Chat"),
				f1: false,
				category: CHAT_CATEGORY
			});
		}

		async run(accessor: ServicesAccessor) {
			const quickChatService = accessor.get(IQuickChatService);
			const codeEditorService = accessor.get(ICodeEditorService);
			if (quickChatService.focused) {
				quickChatService.close();
			}
			const codeEditor = codeEditorService.getActiveCodeEditor();
			if (!codeEditor) {
				return;
			}

			const controller = InlineChatController.get(codeEditor);
			if (!controller) {
				return;
			}

			await controller.run();
			controller.focus();
		}
	});
}

class QuickChatGlobalAction extends Action2 {
	constructor() {
		super({
			id: ASK_QUICK_QUESTION_ACTION_ID,
			title: localize2('quickChat', 'Quick Chat'),
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
			},
			metadata: {
				description: localize('toggle.desc', 'Toggle the quick chat'),
				args: [{
					name: 'args',
					schema: {
						anyOf: [
							{
								type: 'object',
								required: ['query'],
								properties: {
									query: {
										description: localize('toggle.query', "The query to open the quick chat with"),
										type: 'string'
									},
									isPartialQuery: {
										description: localize('toggle.isPartialQuery', "Whether the query is partial; it will wait for more user input"),
										type: 'boolean'
									}
								},
							},
							{
								type: 'string',
								description: localize('toggle.query', "The query to open the quick chat with")
							}
						]
					}
				}]
			},
		});
	}

	override run(accessor: ServicesAccessor, query?: string | Omit<IQuickChatOpenOptions, 'selection'>): void {
		const quickChatService = accessor.get(IQuickChatService);
		let options: IQuickChatOpenOptions | undefined;
		switch (typeof query) {
			case 'string': options = { query }; break;
			case 'object': options = query; break;
		}
		if (options?.query) {
			options.selection = new Selection(1, options.query.length + 1, 1, options.query.length + 1);
		}
		quickChatService.toggle(undefined, options);
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
				title: localize2('interactiveSession.open', "Open Quick Chat ({0})", label),
				f1: true
			});
		}

		override run(accessor: ServicesAccessor, query?: string): void {
			const quickChatService = accessor.get(IQuickChatService);
			quickChatService.toggle(id, query ? {
				query,
				selection: new Selection(1, query.length + 1, 1, query.length + 1)
			} : undefined);
		}
	};
}
