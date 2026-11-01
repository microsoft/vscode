/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const CHAT_DOCKED_VIEW_MIN_HEIGHT = 40;
/** The height of a view whose webview has not reported its content height yet. */
const DEFAULT_CONTENT_HEIGHT = 120;
const DEFAULT_MAX_AUTOMATIC_HEIGHT = 320;
const MAX_HEIGHT = 1000;
/** Dropping the resize edge within this distance of the content height (or the automatic height) follows the content. */
const SNAP_DISTANCE = 10;

/**
 * How the user sized a docked view.
 *
 * A view follows its content height up to {@link maxAutomaticHeight}, unless the user dragged it to a
 * {@link fixedHeight}. Dragging it back to its content height follows the content again and makes that
 * height the new maximum, so content the user chose to see in full stays fully visible as it changes.
 */
export interface IChatDockedViewSize {
	/** The height the user dragged the view to, or `undefined` to follow its content. */
	readonly fixedHeight: number | undefined;
	readonly maxAutomaticHeight: number;
}

export const defaultChatDockedViewSize: IChatDockedViewSize = {
	fixedHeight: undefined,
	maxAutomaticHeight: DEFAULT_MAX_AUTOMATIC_HEIGHT,
};

/** The height a view follows its content at. */
export function getChatDockedViewAutomaticHeight(size: IChatDockedViewSize, contentHeight: number | undefined): number {
	return Math.min(contentHeight ?? DEFAULT_CONTENT_HEIGHT, size.maxAutomaticHeight);
}

/** The height a view is shown at. The space the chat has limits how much of the view shows, but does not change its size. */
export function getChatDockedViewHeight(size: IChatDockedViewSize, contentHeight: number | undefined, availableHeight: number): number {
	const height = size.fixedHeight ?? getChatDockedViewAutomaticHeight(size, contentHeight);
	return Math.max(CHAT_DOCKED_VIEW_MIN_HEIGHT, Math.min(height, availableHeight));
}

/**
 * The size after dragging the resize edge so that the view would be `requestedHeight` tall.
 * @param start The size when the drag started. Each move derives the size from it, so moving back undoes a snap.
 * @param startAutomaticHeight The automatic height when the drag started.
 */
export function resizeChatDockedView(start: IChatDockedViewSize, startAutomaticHeight: number, requestedHeight: number, contentHeight: number | undefined): IChatDockedViewSize {
	const height = Math.min(MAX_HEIGHT, Math.max(CHAT_DOCKED_VIEW_MIN_HEIGHT, requestedHeight));
	if (contentHeight !== undefined && Math.abs(height - contentHeight) <= SNAP_DISTANCE) {
		return { fixedHeight: undefined, maxAutomaticHeight: Math.max(DEFAULT_MAX_AUTOMATIC_HEIGHT, Math.min(MAX_HEIGHT, contentHeight)) };
	}
	if (Math.abs(height - startAutomaticHeight) <= SNAP_DISTANCE) {
		return { fixedHeight: undefined, maxAutomaticHeight: start.maxAutomaticHeight };
	}
	return { fixedHeight: height, maxAutomaticHeight: start.maxAutomaticHeight };
}
