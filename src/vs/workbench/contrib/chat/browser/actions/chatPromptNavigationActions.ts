/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import {
	Action2,
	registerAction2,
} from '../../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatScrollbarPromptMarkerClickBehavior } from '../../common/constants.js';
import {
	IChatPendingDividerViewModel,
	IChatRequestViewModel,
	IChatResponseViewModel,
	isRequestVM,
	isResponseVM,
} from '../../common/model/chatViewModel.js';

type ChatPromptNavigationItem =
	| IChatRequestViewModel
	| IChatResponseViewModel
	| IChatPendingDividerViewModel;

/**
 * The semantic category of a scrollbar marker.
 */
export const enum ChatScrollbarPromptMarkerType {
	/** A user-authored prompt (request). */
	Prompt = 'prompt',
}

/**
 * The host widget that marker clicks are dispatched to.
 */
export interface IChatScrollbarPromptMarkerTarget {
	reveal(item: IChatRequestViewModel | IChatResponseViewModel): void;
	focusItem(item: IChatRequestViewModel | IChatResponseViewModel): void;
}

/**
 * Describes a single marker to be rendered on the chat scrollbar overview ruler.
 *
 * A descriptor is produced for each surviving user prompt request row.
 */
export interface IChatScrollbarPromptMarkerDescriptor {
	/** Unique identifier for this marker. */
	readonly id: string;
	/** The ID of the request that this marker belongs to. */
	readonly requestId: string;
	/** The request view model that originated this marker's turn. */
	readonly request: IChatRequestViewModel;
	/** The request row that this marker positions itself against and navigates to when clicked. */
	readonly target: IChatRequestViewModel;
	/** The semantic type, determining color and priority. */
	readonly markerType: ChatScrollbarPromptMarkerType;
	/** Z-index ordering value; higher-priority markers render above lower ones when overlapping. */
	readonly priority: number;
}

/**
 * Returns all request view models from the given chat items.
 * No filtering or deduplication is applied here — that happens in
 * {@link getScrollbarPromptMarkerDescriptors}.
 */
export function getRequestViewModels(
	items: readonly ChatPromptNavigationItem[],
): IChatRequestViewModel[] {
	return items.filter((item): item is IChatRequestViewModel =>
		isRequestVM(item),
	);
}

/**
 * Computes all scrollbar marker descriptors for a given set of chat items.
 *
 * The algorithm keeps only the latest request per message text and excludes
 * system-initiated requests from the marker set.
 */
export function getScrollbarPromptMarkerDescriptors(
	items: readonly ChatPromptNavigationItem[],
	maxMarkerCount = Number.POSITIVE_INFINITY,
): IChatScrollbarPromptMarkerDescriptor[] {
	const latestByDedupKey = new Map<string, IChatRequestViewModel>();

	// Deduplicate requests, keeping the latest attempt per message text.
	for (const item of items) {
		if (!isRequestVM(item)) {
			continue;
		}

		if (item.isSystemInitiated) {
			continue;
		}

		const dedupKey = item.messageText;
		const previous = latestByDedupKey.get(dedupKey);
		if (
			!previous ||
			item.attempt > previous.attempt ||
			(item.attempt === previous.attempt &&
				item.timestamp >= previous.timestamp)
		) {
			latestByDedupKey.set(dedupKey, item);
		}
	}

	// Build the set of request IDs that survived deduplication
	const selectedRequestIds = new Set<string>();
	for (const item of items) {
		if (!isRequestVM(item)) {
			continue;
		}

		if (item.isSystemInitiated) {
			continue;
		}

		const dedupKey = item.messageText;
		if (latestByDedupKey.get(dedupKey) === item) {
			selectedRequestIds.add(item.id);
		}
	}

	// Emit one prompt marker per surviving request.
	const descriptors: IChatScrollbarPromptMarkerDescriptor[] = [];
	for (const item of items) {
		if (!isRequestVM(item) || !selectedRequestIds.has(item.id)) {
			continue;
		}

		descriptors.push({
			id: item.id,
			requestId: item.id,
			request: item,
			target: item,
			markerType: ChatScrollbarPromptMarkerType.Prompt,
			priority: getMarkerPriority(),
		});
	}

	return downsampleMarkerDescriptors(descriptors, maxMarkerCount);
}

function downsampleMarkerDescriptors(
	descriptors: readonly IChatScrollbarPromptMarkerDescriptor[],
	maxMarkerCount: number,
): IChatScrollbarPromptMarkerDescriptor[] {
	if (descriptors.length <= maxMarkerCount || maxMarkerCount < 2) {
		return [...descriptors];
	}

	const lastIndex = descriptors.length - 1;
	const selectedIndices = new Set<number>();
	for (let slot = 0; slot < maxMarkerCount; slot++) {
		const index = slot === maxMarkerCount - 1
			? lastIndex
			: Math.round((slot * lastIndex) / (maxMarkerCount - 1));
		selectedIndices.add(index);
	}

	return descriptors.filter((_, index) => selectedIndices.has(index));
}

/**
 * Maps a marker type to its z-index priority for overlap resolution.
 * Higher values render above lower ones when markers collide vertically.
 */
function getMarkerPriority(): number {
	return 60;
}

export function getFocusedScrollbarPromptMarkerRequestId(
	item: IChatRequestViewModel | IChatResponseViewModel | undefined,
): string | undefined {
	if (!item) {
		return undefined;
	}

	if (isRequestVM(item)) {
		return item.id;
	}

	if (isResponseVM(item)) {
		return item.requestId;
	}

	return undefined;
}

export function getFocusedScrollbarPromptMarkerId(
	item: IChatRequestViewModel | IChatResponseViewModel | undefined,
): string | undefined {
	if (!item) {
		return undefined;
	}

	if (isRequestVM(item)) {
		return item.id;
	}

	if (isResponseVM(item)) {
		return item.requestId;
	}

	return undefined;
}

export function applyScrollbarPromptMarkerClickBehavior(
	target: IChatScrollbarPromptMarkerTarget,
	item: IChatRequestViewModel | IChatResponseViewModel,
	behavior: ChatScrollbarPromptMarkerClickBehavior,
): void {
	if (behavior === ChatScrollbarPromptMarkerClickBehavior.Reveal) {
		target.reveal(item);
		return;
	}

	target.reveal(item);
	target.focusItem(item);
}

export function registerChatPromptNavigationActions() {
	registerAction2(
		class NextUserPromptAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.nextUserPrompt',
					title: localize2(
						"interactive.nextUserPrompt.label",
						"Next User Prompt",
					),
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
		},
	);

	registerAction2(
		class PreviousUserPromptAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.previousUserPrompt',
					title: localize2(
						"interactive.previousUserPrompt.label",
						"Previous User Prompt",
					),
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
		},
	);
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
	const userPrompts = getRequestViewModels(items);
	if (userPrompts.length === 0) {
		return;
	}

	// Find the currently focused item
	const focused = widget.getFocus();
	let currentIndex = -1;

	if (focused) {
		if (isRequestVM(focused)) {
			// If a request is focused, find its index in the user prompts array
			currentIndex = userPrompts.findIndex(
				(prompt) => prompt.id === focused.id,
			);
		} else if (isResponseVM(focused)) {
			// If a response is focused, find the associated request's index
			// Response view models have a requestId property
			currentIndex = userPrompts.findIndex(
				(prompt) => prompt.id === focused.requestId,
			);
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
