/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Focusing Search must preserve the current query, including when macOS's
 * global Find clipboard has changed. The widget consumes its suppression
 * flag on a new focus event.
 *
 * If the input is already focused, no new focus event fires. In that case,
 * passing suppression would leave the flag set and accidentally suppress a
 * later, ordinary focus that should read the global Find clipboard.
 */
export function focusSearchInputPreservingQuery(widget: {
	focus(select?: boolean, focusReplace?: boolean, suppressGlobalSearchBuffer?: boolean): void;
}, alreadyFocused = false): void {
	widget.focus(true, false, !alreadyFocused);
}
