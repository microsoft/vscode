/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { isResponseVM } from '../../common/chatViewModel.js';

export const ACTION_ID_FOCUS_CHAT_CONFIRMATION = 'workbench.action.chat.focusConfirmation';

class AnnounceChatConfirmationAction extends Action2 {
	constructor() {
		super({
			id: ACTION_ID_FOCUS_CHAT_CONFIRMATION,
			title: { value: localize('focusChatConfirmation', 'Focus Chat Confirmation'), original: 'Focus Chat Confirmation' },
			category: { value: localize('chat.category', 'Chat'), original: 'Chat' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Alt | KeyCode.KeyA,
				when: ContextKeyExpr.and(
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
					ChatContextKeys.inChatSession
				)
			},
			menu: [
				{
					id: MenuId.ChatConfirmationMenu,
					when: ChatContextKeys.inChatSession,
					group: '0_main'
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const lastFocusedWidget = chatWidgetService.lastFocusedWidget;

		if (!lastFocusedWidget) {
			alert(localize('noChatSession', 'No active chat session found.'));
			return;
		}

		const viewModel = lastFocusedWidget.viewModel;
		if (!viewModel) {
			alert(localize('chatNotReady', 'Chat interface not ready.'));
			return;
		}

		// Check for active confirmations in the chat responses
		let firstConfirmationElement: HTMLElement | undefined;

		let confirmation;
		const lastResponse = viewModel.getItems()[viewModel.getItems().length - 1];
		if (isResponseVM(lastResponse)) {
			confirmation = lastResponse.response.value.filter(p => p.kind === 'toolInvocation')?.[0];
			const confirmationWidgets = lastFocusedWidget.domNode.querySelectorAll('.chat-confirmation-widget-container');
			if (confirmationWidgets.length > 0) {
				firstConfirmationElement = confirmationWidgets[0] as HTMLElement;
			}
		}

		if (firstConfirmationElement) {
			firstConfirmationElement.focus();
		} else {
			alert(localize('noConfirmationRequired', 'No chat confirmation required'));
		}
	}
}

export function registerChatAccessibilityActions(): void {
	registerAction2(AnnounceChatConfirmationAction);
}
