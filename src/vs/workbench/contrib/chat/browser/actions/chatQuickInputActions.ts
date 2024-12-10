/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IQuickChatOpenOptions, IQuickChatService } from '../chat.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { InlineChatController } from '../../../inlineChat/browser/inlineChatController.js';

export const ASK_QUICK_QUESTION_ACTION_ID = 'workbench.action.quickchat.toggle';
export function registerQuickChatActions() {
	registerAction2(QuickChatGlobalAction);
	registerAction2(AskQuickChatAction);

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
			precondition: ChatContextKeys.enabled,
			icon: Codicon.commentDiscussion,
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyL,
			},
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'e_quickChat',
				order: 5
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
		quickChatService.toggle(options);
	}
}

class AskQuickChatAction extends Action2 {
	constructor() {
		super({
			id: `workbench.action.openQuickChat`,
			category: CHAT_CATEGORY,
			title: localize2('interactiveSession.open', "Open Quick Chat"),
			f1: true
		});
	}

	override run(accessor: ServicesAccessor, query?: string): void {
		const quickChatService = accessor.get(IQuickChatService);
		quickChatService.toggle(query ? {
			query,
			selection: new Selection(1, query.length + 1, 1, query.length + 1)
		} : undefined);
	}
}
