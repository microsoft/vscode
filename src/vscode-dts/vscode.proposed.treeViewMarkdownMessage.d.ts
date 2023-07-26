/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface TreeView2<T> extends Disposable {
		readonly onDidExpandElement: Event<TreeViewExpansionEvent<T>>;
		readonly onDidCollapseElement: Event<TreeViewExpansionEvent<T>>;
		readonly selection: readonly T[];
		readonly onDidChangeSelection: Event<TreeViewSelectionChangeEvent<T>>;
		readonly visible: boolean;
		readonly onDidChangeVisibility: Event<TreeViewVisibilityChangeEvent>;
		readonly onDidChangeCheckboxState: Event<TreeCheckboxChangeEvent<T>>;
		title?: string;
		description?: string;
		badge?: ViewBadge | undefined;
		reveal(element: T, options?: { select?: boolean; focus?: boolean; expand?: boolean | number }): Thenable<void>;

		/**
		 * An optional human-readable message that will be rendered in the view.
		 * Only a subset of markdown is supported.
		 * Setting the message to null, undefined, or empty string will remove the message from the view.
		 */
		message?: string | MarkdownString;
	}
}
