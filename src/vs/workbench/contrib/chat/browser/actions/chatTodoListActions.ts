/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatTodoListService } from '../../common/chatTodoListService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';

const CHAT_TODO_LIST_CATEGORY = localize2('chat.todoList.category', 'Chat Todo List');

export function registerChatTodoListActions(): void {
	registerAction2(class EditTodoListTitleAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.todoList.editTitle',
				title: localize2('chat.todoList.editTitle', 'Edit Title'),
				category: CHAT_TODO_LIST_CATEGORY,
				f1: true,
				keybinding: {
					when: ContextKeyExpr.and(
						ChatContextKeys.location.isEqualTo('panel'),
						ContextKeyExpr.equals('focusedView', 'workbench.panel.chat.view.copilot')
					),
					weight: KeybindingWeight.WorkbenchContrib,
					primary: KeyCode.F2
				},
				menu: {
					id: MenuId.ChatTodoListTitleContext,
					group: 'navigation',
					order: 1
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
			const quickInputService = accessor.get(IQuickInputService);
			const chatTodoListService = accessor.get(IChatTodoListService);

			// Get sessionId from args if provided (from context menu)
			const sessionId = args[0] as string | undefined;
			if (!sessionId) {
				return;
			}

			const currentTitle = chatTodoListService.getCustomTitle(sessionId);
			const defaultTitle = localize('chat.todoList.title', 'Todos');

			const result = await quickInputService.input({
				prompt: localize('chat.todoList.editTitle.prompt', 'Enter a new title for the todo list'),
				value: currentTitle || defaultTitle,
				placeHolder: defaultTitle
			});

			if (result !== undefined) {
				const trimmedResult = result.trim();
				// If the user enters the default title or empty string, clear custom title
				if (trimmedResult === defaultTitle || trimmedResult === '') {
					chatTodoListService.setCustomTitle(sessionId, undefined);
				} else {
					chatTodoListService.setCustomTitle(sessionId, trimmedResult);
				}
			}
		}
	});

	registerAction2(class ResetTodoListTitleAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.todoList.resetTitle',
				title: localize2('chat.todoList.resetTitle', 'Reset to Default'),
				category: CHAT_TODO_LIST_CATEGORY,
				f1: true,
				menu: {
					id: MenuId.ChatTodoListTitleContext,
					group: 'navigation',
					order: 2,
					when: ContextKeyExpr.has('chatTodoListHasCustomTitle')
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
			const chatTodoListService = accessor.get(IChatTodoListService);

			// Get sessionId from args if provided (from context menu)
			const sessionId = args[0] as string | undefined;
			if (!sessionId) {
				return;
			}

			chatTodoListService.setCustomTitle(sessionId, undefined);
		}
	});
}
