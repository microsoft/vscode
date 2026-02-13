/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';

export const ACTION_ID_FOCUS_CHAT_CONFIRMATION = 'workbench.action.chat.focusConfirmation';

class AnnounceChatConfirmationAction extends Action2 {
	constructor() {
		super({
			id: ACTION_ID_FOCUS_CHAT_CONFIRMATION,
			title: { value: localize('focusChatConfirmation', 'Focus Chat Confirmation'), original: 'Focus Chat Confirmation' },
			category: { value: localize('chat.category', 'Chat'), original: 'Chat' },
			precondition: ChatContextKeys.enabled,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyA | KeyMod.Shift,
				when: CONTEXT_ACCESSIBILITY_MODE_ENABLED
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const pendingWidget = chatWidgetService.getAllWidgets().find(widget => widget.viewModel?.model.requestNeedsInput.get());

		if (!pendingWidget) {
			alert(localize('noChatSession', 'No active chat session found.'));
			return;
		}

		const viewModel = pendingWidget.viewModel;
		if (!viewModel) {
			alert(localize('chatNotReady', 'Chat interface not ready.'));
			return;
		}

		// Check for active confirmations in the chat responses
		let firstConfirmationElement: HTMLElement | undefined;

		const lastResponse = viewModel.getItems()[viewModel.getItems().length - 1];
		if (isResponseVM(lastResponse)) {
			// eslint-disable-next-line no-restricted-syntax
			const confirmationWidgets = pendingWidget.domNode.querySelectorAll('.chat-confirmation-widget-container');
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
