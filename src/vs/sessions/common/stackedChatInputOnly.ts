/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IStackedChatInputOnlyContext {
	/** The height of the chat's group, as laid out. */
	readonly groupHeight: number;
	/** The height of the group when it shows only the chat input. */
	readonly collapsedHeight: number;
	/** The least height of the conversation above the input. */
	readonly conversationMinHeight: number;
	/** Whether the height is still being dragged: it is then not settled. */
	readonly dragging: boolean;
}

export interface IStackedChatInputOnlyDecision {
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
export function decideStackedChatInputOnly(context: IStackedChatInputOnlyContext): IStackedChatInputOnlyDecision {
	const { groupHeight, collapsedHeight, conversationMinHeight, dragging } = context;
	const inputOnly = groupHeight < collapsedHeight + conversationMinHeight / 2;
	let settleHeight: number | undefined;
	if (!dragging) {
		const target = inputOnly ? collapsedHeight : Math.max(groupHeight, collapsedHeight + conversationMinHeight);
		settleHeight = target !== groupHeight ? target : undefined;
	}
	return { inputOnly, settleHeight };
}

/** How far above the input's height a group dragged up must be before its conversation shows (see below). */
export const STACKED_CHAT_DRAG_SHOW_CONVERSATION = 12;
/** How close to the input's height a group dragged down must be before only its input shows (see below). */
export const STACKED_CHAT_DRAG_SHOW_INPUT = 4;

/**
 * Decides whether the chat shows only its input while the split above it is still dragged: live, as the height
 * changes, so that the conversation shows and grows with the drag as soon as the group is dragged up past its input, and
 * hides as soon as the group is dragged back down to it. The two points differ (hysteresis), so that a height at either
 * does not flicker between the two. Once the drag lets go, {@link decideStackedChatInputOnly} settles it.
 */
export function decideStackedChatInputOnlyWhileDragging(context: { readonly groupHeight: number; readonly collapsedHeight: number; readonly inputOnly: boolean }): boolean {
	const { groupHeight, collapsedHeight, inputOnly } = context;
	if (inputOnly) {
		return groupHeight <= collapsedHeight + STACKED_CHAT_DRAG_SHOW_CONVERSATION;
	}
	return groupHeight <= collapsedHeight + STACKED_CHAT_DRAG_SHOW_INPUT;
}

export interface IStackedChatResizeContext {
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
export function clampStackedChatOnResize(context: IStackedChatResizeContext): number | undefined {
	const { groupHeight, collapsedHeight, conversationMinHeight, inputOnly } = context;
	if (inputOnly) {
		return groupHeight !== collapsedHeight ? collapsedHeight : undefined;
	}
	const minimum = collapsedHeight + conversationMinHeight;
	return groupHeight < minimum ? minimum : undefined;
}

/**
 * Whether the chat shows only its input because the window became too short for the conversation, rather than because
 * the user chose so by dragging the split or by toggling the conversation. Any choice of the user clears it.
 */
export function stackedChatForcedByWindow(context: { readonly wasForced: boolean; readonly wasInputOnly: boolean; readonly inputOnly: boolean; readonly byUser: boolean }): boolean {
	if (context.byUser || !context.inputOnly) {
		return false;
	}
	return context.wasForced || !context.wasInputOnly;
}

/**
 * What of the chat showing only its input is remembered for the next time the chat shows below an editor: only what the user
 * chose. While the window forces it, the value the user last chose stays.
 */
export function stackedChatPersistedInputOnly(context: { readonly inputOnly: boolean; readonly forcedByWindow: boolean; readonly lastUserChoice: boolean }): boolean {
	return context.forcedByWindow ? context.lastUserChoice : context.inputOnly;
}

export interface IStackedChatRestoreContext {
	/** Whether the chat shows only its input because the window is too short, see {@link stackedChatForcedByWindow}. */
	readonly forcedByWindow: boolean;
	/** The height of the chat's group, as laid out. */
	readonly groupHeight: number;
	/** The height of the group when it shows only the chat input. */
	readonly collapsedHeight: number;
	/** The least height of the conversation above the input. */
	readonly conversationMinHeight: number;
	/** The height of the editor's group now. */
	readonly editorHeight: number;
	/** The least height of the editor's group. */
	readonly editorMinimumHeight: number;
}

/**
 * Whether the conversation fits above the chat's input once the editor gives way down to its minimum. The terminal row
 * keeps its height, so the chat and the editor share what the window has beside it.
 */
export function stackedChatConversationFits(context: Pick<IStackedChatRestoreContext, 'groupHeight' | 'collapsedHeight' | 'conversationMinHeight' | 'editorHeight' | 'editorMinimumHeight'>): boolean {
	const needed = context.collapsedHeight + context.conversationMinHeight - context.groupHeight;
	return context.editorHeight - context.editorMinimumHeight >= needed;
}

/**
 * Whether a chat that shows only its input because the window was too short returns to the conversation: once the
 * editor can give the height the conversation needs while it stays above its minimum. The chat that the user brought
 * down to its input stays so however the window grows.
 */
export function shouldRestoreStackedChatConversation(context: IStackedChatRestoreContext): boolean {
	return context.forcedByWindow && stackedChatConversationFits(context);
}
