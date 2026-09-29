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
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
import { AccessibleViewProviderId } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { accessibleViewCurrentProviderId, accessibleViewIsShown } from '../../../../contrib/accessibility/browser/accessibilityConfiguration.js';
import { CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, isThinkingContentIncludedInAccessibleView } from '../accessibility/chatResponseAccessibleView.js';

export const ACTION_ID_FOCUS_CHAT_CONFIRMATION = 'workbench.action.chat.focusConfirmation';
export const ACTION_ID_TOGGLE_THINKING_CONTENT_ACCESSIBLE_VIEW = 'workbench.action.chat.toggleThinkingContentAccessibleView';

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
				when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ChatContextKeys.Editing.hasQuestionCarousel.negate())
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

		// Check for active confirmations in the chat responses. The
		// `.chat-confirmation-widget-container` class is reused by several
		// non-focusable parts (e.g. the tool input/output collapsible and the
		// plan review part), so filter to the focusable instances by looking
		// for an explicit tabindex which is only set on real confirmation
		// dialogs (via `configureAccessibilityContainer`).
		let firstConfirmationElement: HTMLElement | undefined;

		const lastResponse = viewModel.getItems()[viewModel.getItems().length - 1];
		if (isResponseVM(lastResponse)) {
			// Reveal the response so its confirmation widget is rendered (the
			// chat list is virtualized — querying before reveal can miss it).
			pendingWidget.reveal(lastResponse);
			// eslint-disable-next-line no-restricted-syntax
			const confirmationWidgets = pendingWidget.domNode.querySelectorAll<HTMLElement>('.chat-confirmation-widget-container[tabindex]');
			if (confirmationWidgets.length > 0) {
				firstConfirmationElement = confirmationWidgets[confirmationWidgets.length - 1];
			}
		}

		if (firstConfirmationElement) {
			// Toggle: if the confirmation is already focused, move focus back to input
			if (firstConfirmationElement.contains(pendingWidget.domNode.ownerDocument.activeElement)) {
				pendingWidget.focusInput();
			} else {
				firstConfirmationElement.scrollIntoView({ block: 'nearest' });
				firstConfirmationElement.focus();
			}
		} else {
			alert(localize('noConfirmationRequired', 'No chat confirmation required'));
		}
	}
}

class ToggleThinkingContentAccessibleViewAction extends Action2 {
	constructor() {
		super({
			id: ACTION_ID_TOGGLE_THINKING_CONTENT_ACCESSIBLE_VIEW,
			title: { value: localize('toggleThinkingContentAccessibleView', 'Toggle Thinking Content in Accessible View'), original: 'Toggle Thinking Content in Accessible View' },
			category: { value: localize('chat.category', 'Chat'), original: 'Chat' },
			precondition: ChatContextKeys.enabled,
			f1: true,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.KeyT,
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.PanelChat))
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const includeThinking = isThinkingContentIncludedInAccessibleView(storageService);
		const updatedValue = !includeThinking;
		storageService.store(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, updatedValue, StorageScope.PROFILE, StorageTarget.USER);
		alert(updatedValue
			? localize('thinkingContentShown', 'Thinking content will be included in the accessible view.')
			: localize('thinkingContentHidden', 'Thinking content will be hidden from the accessible view.')
		);
	}
}

export function registerChatAccessibilityActions(): void {
	registerAction2(AnnounceChatConfirmationAction);
	registerAction2(ToggleThinkingContentAccessibleViewAction);
}
