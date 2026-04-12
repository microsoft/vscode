/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isResponseVM } from '../../common/model/chatViewModel.js';
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
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */ | 1024 /* KeyMod.Shift */,
                when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, ChatContextKeys.Editing.hasQuestionCarousel.negate())
            }
        });
    }
    async run(accessor) {
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
        let firstConfirmationElement;
        const lastResponse = viewModel.getItems()[viewModel.getItems().length - 1];
        if (isResponseVM(lastResponse)) {
            // eslint-disable-next-line no-restricted-syntax
            const confirmationWidgets = pendingWidget.domNode.querySelectorAll('.chat-confirmation-widget-container');
            if (confirmationWidgets.length > 0) {
                firstConfirmationElement = confirmationWidgets[0];
            }
        }
        if (firstConfirmationElement) {
            // Toggle: if the confirmation is already focused, move focus back to input
            if (firstConfirmationElement.contains(pendingWidget.domNode.ownerDocument.activeElement)) {
                pendingWidget.focusInput();
            }
            else {
                firstConfirmationElement.focus();
            }
        }
        else {
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
                primary: 512 /* KeyMod.Alt */ | 50 /* KeyCode.KeyT */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "panelChat" /* AccessibleViewProviderId.PanelChat */))
            }
        });
    }
    async run(accessor) {
        const storageService = accessor.get(IStorageService);
        const includeThinking = isThinkingContentIncludedInAccessibleView(storageService);
        const updatedValue = !includeThinking;
        storageService.store(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, updatedValue, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        alert(updatedValue
            ? localize('thinkingContentShown', 'Thinking content will be included in the accessible view.')
            : localize('thinkingContentHidden', 'Thinking content will be hidden from the accessible view.'));
    }
}
export function registerChatAccessibilityActions() {
    registerAction2(AnnounceChatConfirmationAction);
    registerAction2(ToggleThinkingContentAccessibleViewAction);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFjY2Vzc2liaWxpdHlBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjY2Vzc2liaWxpdHlBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUk3RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDaEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNuSCxPQUFPLEVBQUUsK0JBQStCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNqSixPQUFPLEVBQUUsaURBQWlELEVBQUUseUNBQXlDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUU5SixNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyx5Q0FBeUMsQ0FBQztBQUMzRixNQUFNLENBQUMsTUFBTSxpREFBaUQsR0FBRywyREFBMkQsQ0FBQztBQUU3SCxNQUFNLDhCQUErQixTQUFRLE9BQU87SUFDbkQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsaUNBQWlD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