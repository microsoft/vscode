/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** How far above the input's height a group dragged up must be before its conversation shows (see below). */
export const STACKED_CHAT_DRAG_SHOW_CONVERSATION = 12;
/** How close to the input's height a group dragged down must be before only its input shows (see below). */
export const STACKED_CHAT_DRAG_SHOW_INPUT = 4;

/**
 * Decides whether the chat shows only its input while the split above it is still dragged: live, as the height
 * changes, so that the conversation shows and grows with the drag as soon as the group is dragged up past its input, and
 * hides as soon as the group is dragged back down to it. The two points differ (hysteresis), so that a height at either
 * does not flicker between the two.
 */
export function decideStackedChatInputOnlyWhileDragging(context: { readonly groupHeight: number; readonly collapsedHeight: number; readonly inputOnly: boolean }): boolean {
	const { groupHeight, collapsedHeight, inputOnly } = context;
	if (inputOnly) {
		return groupHeight <= collapsedHeight + STACKED_CHAT_DRAG_SHOW_CONVERSATION;
	}
	return groupHeight <= collapsedHeight + STACKED_CHAT_DRAG_SHOW_INPUT;
}
