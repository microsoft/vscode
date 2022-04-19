/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/62783 @matthewjamesadam

	/**
	 * A badge presenting a value for a view
	 */
	export interface ViewBadge {

		/**
		 * A label to present in tooltips for the badge
		 */
		readonly tooltip: string;

		/**
		 * The value to present in the badge
		 */
		readonly value: number;
	}

	export interface TreeView<T> {
		/**
		 * The badge to display for this TreeView.
		 * To remove the badge, set to undefined.
		 */
		badge?: ViewBadge | undefined;
	}

	export interface WebviewView {
		/**
		 * The badge to display for this webview view.
		 * To remove the badge, set to undefined.
		 */
		badge?: ViewBadge | undefined;
	}
}
