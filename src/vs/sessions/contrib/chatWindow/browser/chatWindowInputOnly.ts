/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IChatWindowInputOnlyContext {
	/** The height of the chat's group, as laid out. */
	readonly groupHeight: number;
	/** The height of the group when it shows only the chat input. */
	readonly collapsedHeight: number;
	/** The least height of the conversation above the input. */
	readonly conversationMinHeight: number;
	/** Whether the height is still being dragged: it is then not settled. */
	readonly dragging: boolean;
}

export interface IChatWindowInputOnlyDecision {
	readonly inputOnly: boolean;
	/** The height to settle the group at, once the drag lets go: unset while dragging, or when it already rests there. */
	readonly settleHeight: number | undefined;
}

/**
 * Decides whether the chat shows only its input, for a group dragged below the editor. The decision snaps: a height
 * below half of the conversation's least height above the input shows only the input, and a taller one the
 * conversation, so that the group does not rest between the two. The same point serves dragging down and up, so what
 * shows depends on the height alone, with no flicker when dragging back.
 */
export function decideChatWindowInputOnly(context: IChatWindowInputOnlyContext): IChatWindowInputOnlyDecision {
	const { groupHeight, collapsedHeight, conversationMinHeight, dragging } = context;
	const inputOnly = groupHeight < collapsedHeight + conversationMinHeight / 2;
	let settleHeight: number | undefined;
	if (!dragging) {
		const target = inputOnly ? collapsedHeight : Math.max(groupHeight, collapsedHeight + conversationMinHeight);
		settleHeight = target !== groupHeight ? target : undefined;
	}
	return { inputOnly, settleHeight };
}

export interface IChatWindowResizeContext {
	/** The height of the chat's group, as laid out. */
	readonly groupHeight: number;
	/** The height of the group when it shows only the chat input. */
	readonly collapsedHeight: number;
	/** The least height of the conversation above the input. */
	readonly conversationMinHeight: number;
	/** Whether the group shows only the input. */
	readonly inputOnly: boolean;
}

/**
 * Decides the height of a group below the editor, when the window is resized rather than the split dragged. What it
 * shows stays: the input alone stays at its height, and the conversation never shrinks below its least height, which
 * would leave it between the two. It returns undefined when the group needs no change. It is the group's neighbours
 * that give way to the height, the editor down to its own minimum first, and only then does the group fall short.
 */
export function clampChatWindowOnResize(context: IChatWindowResizeContext): number | undefined {
	const { groupHeight, collapsedHeight, conversationMinHeight, inputOnly } = context;
	if (inputOnly) {
		return groupHeight !== collapsedHeight ? collapsedHeight : undefined;
	}
	const minimum = collapsedHeight + conversationMinHeight;
	return groupHeight < minimum ? minimum : undefined;
}

/**
 * Whether what the chat shows is decided from its height, for a layout that is not a window resize. A layout that
 * follows a resize, at the same height, is not a drag: only a press on the sash can switch what shows, so that a
 * window too short for the editor and the conversation does not snap to the input.
 */
export function shouldDecideChatWindowInputOnly(context: { readonly afterWindowResize: boolean; readonly pointerDown: boolean }): boolean {
	return context.pointerDown || !context.afterWindowResize;
}
