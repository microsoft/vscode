/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A focus-only action must not re-import macOS's global Find clipboard.
 * The third SearchWidget.focus argument suppresses that import on focus.
 */
export function focusSearchInputPreservingQuery(widget: {
	focus(select?: boolean, focusReplace?: boolean, suppressGlobalSearchBuffer?: boolean): void;
}): void {
	widget.focus(true, false, true);
}
