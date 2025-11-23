/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ElicitationState } from '../../common/chatService.js';
import { isResponseVM } from '../../common/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY } from './chatActions.js';

export const AcceptElicitationRequestActionId = 'workbench.action.chat.acceptElicitation';

class AcceptElicitationRequestAction extends Action2 {
	constructor() {
		super({
			id: AcceptElicitationRequestActionId,
			title: localize2('chat.acceptElicitation', "Accept Request"),
			f1: false,
			category: CHAT_CATEGORY,
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasElicitationRequest),
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
				weight: KeybindingWeight.WorkbenchContrib + 1,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const widget = chatWidgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const items = widget.viewModel?.getItems();
		if (!items?.length) {
			return;
		}

		for (let i = items.length - 1; i >= 0; i--) {
			const item = items[i];
			if (!isResponseVM(item)) {
				continue;
			}

			for (const content of item.response.value) {
				if (content.kind === 'elicitation2' && content.state.get() === ElicitationState.Pending) {
					await content.accept(true);
					widget.focusInput();
					return;
				}
			}
		}
	}
}

export function registerChatElicitationActions(): void {
	registerAction2(AcceptElicitationRequestAction);
}
