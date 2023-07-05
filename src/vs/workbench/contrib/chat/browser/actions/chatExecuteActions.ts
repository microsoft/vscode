/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidget } from 'vs/workbench/contrib/chat/browser/chat';
import { CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

export interface IChatExecuteActionContext {
	widget: IChatWidget;
}

function isExecuteActionContext(thing: unknown): thing is IChatExecuteActionContext {
	return typeof thing === 'object' && thing !== null && 'widget' in thing;
}

export function registerChatExecuteActions() {
	registerAction2(class SubmitAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.submit',
				title: {
					value: localize('interactive.submit.label', "Submit"),
					original: 'Submit'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.send,
				precondition: CONTEXT_CHAT_INPUT_HAS_TEXT,
				menu: {
					id: MenuId.ChatExecute,
					when: CONTEXT_CHAT_REQUEST_IN_PROGRESS.negate(),
					group: 'navigation',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isExecuteActionContext(context)) {
				return;
			}

			context.widget.acceptInput();
		}
	});

	registerAction2(class SubmitAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.cancel',
				title: {
					value: localize('interactive.cancel.label', "Cancel"),
					original: 'Cancel'
				},
				f1: false,
				category: CHAT_CATEGORY,
				icon: Codicon.debugStop,
				menu: {
					id: MenuId.ChatExecute,
					when: CONTEXT_CHAT_REQUEST_IN_PROGRESS,
					group: 'navigation',
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const context = args[0];
			if (!isExecuteActionContext(context)) {
				return;
			}

			const chatService = accessor.get(IChatService);
			if (context.widget.viewModel) {
				chatService.cancelCurrentRequestForSession(context.widget.viewModel.sessionId);
			}
		}
	});
}
