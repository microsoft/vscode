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

export const ACTION_ID_ANNOUNCE_CHAT_CONFIRMATION = 'workbench.action.chat.announceConfirmation';

class AnnounceChatConfirmationAction extends Action2 {
	constructor() {
		super({
			id: ACTION_ID_ANNOUNCE_CHAT_CONFIRMATION,
			title: localize('announceChatConfirmation', 'Announce Chat Confirmation Status'),
			category: localize('chat.category', 'Chat'),
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
		let activeConfirmations = 0;
		let firstConfirmationElement: HTMLElement | undefined;

		// Look through the chat responses for confirmations
		for (const item of viewModel.getItems()) {
			if (isResponseVM(item)) {
				// Check if this response has any confirmations
				if (item.response.value) {
					for (const content of item.response.value) {
						if (content.kind === 'confirmation' && !content.isUsed) {
							activeConfirmations++;
							
							// Try to find the DOM element for this confirmation to focus it
							if (!firstConfirmationElement && lastFocusedWidget.domNode) {
								const confirmationWidgets = lastFocusedWidget.domNode.querySelectorAll('.chat-confirmation-widget:not(.hideButtons), .chat-confirmation-widget2:not(.hideButtons)');
								if (confirmationWidgets.length > 0) {
									firstConfirmationElement = confirmationWidgets[0] as HTMLElement;
								}
							}
						}
					}
				}
			}
		}

		if (activeConfirmations > 0) {
			const message = activeConfirmations === 1 
				? localize('confirmationRequired', 'Chat confirmation required. {0} action needed.', activeConfirmations)
				: localize('confirmationsRequired', 'Chat confirmations required. {0} actions needed.', activeConfirmations);
			
			alert(message);
			
			// Focus the first active confirmation dialog
			if (firstConfirmationElement) {
				const firstButton = firstConfirmationElement.querySelector('button');
				if (firstButton) {
					firstButton.focus();
				} else {
					// Fallback: focus the confirmation element itself
					firstConfirmationElement.focus();
				}
			}
		} else {
			alert(localize('noConfirmationRequired', 'No chat confirmation required.'));
		}
	}
}

export function registerChatAccessibilityActions(): void {
	registerAction2(AnnounceChatConfirmationAction);
}