/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatRequestViewModel, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';

export function registerChatPromptNavigationActions() {
	registerAction2(class NextUserPromptAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.nextUserPrompt',
				title: localize2('interactive.nextUserPrompt.label', "Next User Prompt"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: ChatContextKeys.inChatSession,
				},
				precondition: ChatContextKeys.enabled,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: unknown[]) {
			navigateUserPrompts(accessor, false);
		}
	});

	registerAction2(class PreviousUserPromptAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.previousUserPrompt',
				title: localize2('interactive.previousUserPrompt.label', "Previous User Prompt"),
				keybinding: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
					weight: KeybindingWeight.WorkbenchContrib,
					when: ChatContextKeys.inChatSession,
				},
				precondition: ChatContextKeys.enabled,
				f1: true,
				category: CHAT_CATEGORY,
			});
		}

		run(accessor: ServicesAccessor, ...args: unknown[]) {
			navigateUserPrompts(accessor, true);
		}
	});
}

function navigateUserPrompts(accessor: ServicesAccessor, reverse: boolean) {
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
	const userPrompts = items.filter((item): item is IChatRequestViewModel => isRequestVM(item));
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
		} else if (isResponseVM(focused)) {
			// If a response is focused, find the associated request's index
			// Response view models have a requestId property
			currentIndex = userPrompts.findIndex(prompt => prompt.id === focused.requestId);
		}
	}

	// Calculate next index
	let nextIndex: number;
	if (currentIndex === -1) {
		// No current focus, go to first or last prompt based on direction
		nextIndex = reverse ? userPrompts.length - 1 : 0;
	} else {
		// Navigate to next/previous prompt
		nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;

		// Clamp instead of wrap and stay at boundaries when trying to navigate past ends
		if (nextIndex < 0) {
			nextIndex = 0; // already at first, do not move further
		} else if (nextIndex >= userPrompts.length) {
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
