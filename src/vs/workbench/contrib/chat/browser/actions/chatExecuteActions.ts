/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_CHAT_INPUT_HAS_TEXT, CONTEXT_CHAT_REQUEST_IN_PROGRESS, CONTEXT_IN_CHAT_INPUT } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { chatAgentLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

export interface IChatExecuteActionContext {
	widget?: IChatWidget;
	inputValue?: string;
}

export class SubmitAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submit';

	constructor() {
		super({
			id: SubmitAction.ID,
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
			},
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		widget?.acceptInput(context?.inputValue);
	}
}

export class SubmitSecondaryAgentAction extends Action2 {
	static readonly ID = 'workbench.action.chat.submitSecondaryAgent';

	constructor() {
		super({
			id: SubmitSecondaryAgentAction.ID,
			title: localize2('chat.label.submitSecondaryAgent', "Submit to Secondary Agent"),
			f1: false,
			category: CHAT_CATEGORY,
			precondition: CONTEXT_CHAT_INPUT_HAS_TEXT,
			keybinding: {
				when: CONTEXT_IN_CHAT_INPUT,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: any[]) {
		const context: IChatExecuteActionContext | undefined = args[0];

		const agentService = accessor.get(IChatAgentService);
		const secondaryAgent = agentService.getSecondaryAgent();
		if (!secondaryAgent) {
			return;
		}

		const widgetService = accessor.get(IChatWidgetService);
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		widget?.acceptInputWithPrefix(`${chatAgentLeader}${secondaryAgent.id}`);
	}
}

export function registerChatExecuteActions() {
	registerAction2(SubmitAction);
	registerAction2(SubmitSecondaryAgentAction);

	registerAction2(class CancelAction extends Action2 {
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
			const context: IChatExecuteActionContext = args[0];
			if (!context.widget) {
				return;
			}

			const chatService = accessor.get(IChatService);
			if (context.widget.viewModel) {
				chatService.cancelCurrentRequestForSession(context.widget.viewModel.sessionId);
			}
		}
	});
}
