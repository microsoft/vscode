/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
export function registerChatPromptNavigationActions() {
    registerAction2(class NextUserPromptAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.nextUserPrompt',
                title: localize2('interactive.nextUserPrompt.label', "Next User Prompt"),
                keybinding: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    when: ChatContextKeys.inChatSession,
                },
                precondition: ChatContextKeys.enabled,
                f1: true,
                category: CHAT_CATEGORY,
            });
        }
        run(accessor, ...args) {
            navigateUserPrompts(accessor, false);
        }
    });
    registerAction2(class PreviousUserPromptAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.previousUserPrompt',
                title: localize2('interactive.previousUserPrompt.label', "Previous User Prompt"),
                keybinding: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    when: ChatContextKeys.inChatSession,
                },
                precondition: ChatContextKeys.enabled,
                f1: true,
                category: CHAT_CATEGORY,
            });
        }
        run(accessor, ...args) {
            navigateUserPrompts(accessor, true);
        }
    });
}
function navigateUserPrompts(accessor, reverse) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = chatWidgetService.lastFocusedWidget;
    if (!widget) {
        return;
    }
    const items = widget.viewModel?.getItems();
    if (!items || items.length === 0) {
        return;
    }
    // Get all user prompts (requests) in the conversation
    const userPrompts = items.filter((item) => isRequestVM(item));
    if (userPrompts.length === 0) {
        return;
    }
    // Find the currently focused item
    const focused = widget.getFocus();
    let currentIndex = -1;
    if (focused) {
        if (isRequestVM(focused)) {
            // If a request is focused, find its index in the user prompts array
            currentIndex = userPrompts.findIndex(prompt => prompt.id === focused.id);
        }
        else if (isResponseVM(focused)) {
            // If a response is focused, find the associated request's index
            // Response view models have a requestId property
            currentIndex = userPrompts.findIndex(prompt => prompt.id === focused.requestId);
        }
    }
    // Calculate next index
    let nextIndex;
    if (currentIndex === -1) {
        // No current focus, go to first or last prompt based on direction
        nextIndex = reverse ? userPrompts.length - 1 : 0;
    }
    else {
        // Navigate to next/previous prompt
        nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;
        // Clamp instead of wrap and stay at boundaries when trying to navigate past ends
        if (nextIndex < 0) {
            nextIndex = 0; // already at first, do not move further
        }
        else if (nextIndex >= userPrompts.length) {
            nextIndex = userPrompts.length - 1; // already at last, do not move further
        }
        // avoid re-focusing if we didn't actually move
        if (nextIndex === currentIndex) {
            return; // no change in focus
        }
    }
    // Focus and reveal the selected user prompt
    const targetPrompt = userPrompts[nextIndex];
    if (targetPrompt) {
        widget.focus(targetPrompt);
        widget.reveal(targetPrompt);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFByb21wdE5hdmlnYXRpb25BY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdFByb21wdE5hdmlnYXRpb25BY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRTdGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUNqRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDaEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBeUIsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXZHLE1BQU0sVUFBVSxtQ0FBbUM7SUFDbEQsZUFBZSxDQUFDLE1BQU0sb0JBQXFCLFNBQVEsT0FBTztRQUN6RDtZQUNDLEtBQUssQ0FBQztnQkFDTCxFQUFFLEVBQUUsc0NBQXNDO2dCQUMxQyxLQUFLLEVBQUUsU0FBUyxDQUFDLGtDQUFrQyxFQUFFLGtCQUFrQixDQUFDO2dCQUN4RSxVQUFVLEVBQUU7b0JBQ1gsT0FBTyxFQUFFLGdEQUEyQiw2QkFBb0I7b0JBQ3hELE1BQU0sNkNBQW1DO29CQUN6QyxJQUFJLEVBQUUsZUFBZSxDQUFDLGFBQWE7aUJBQ25DO2dCQUNELFlBQVksRUFBRSxlQUFlLENBQUMsT0FBTztnQkFDckMsRUFBRSxFQUFFLElBQUk7Z0JBQ1IsUUFBUSxFQUFFLGFBQWE7YUFDdkIsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUVELEdBQUcsQ0FBQyxRQUEwQixFQUFFLEdB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