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
