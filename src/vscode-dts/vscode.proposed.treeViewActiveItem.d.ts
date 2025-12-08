/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/170248

	export interface TreeView<T> extends Disposable {
		/**
		 * Currently active item.
		 */
		readonly activeItem: T | undefined;
		/**
		 * Event that is fired when the {@link TreeView.activeItem active item} has changed
		 */
		readonly onDidChangeActiveItem: Event<TreeViewActiveItemChangeEvent<T>>;
	}

	/**
	 * The event that is fired when there is a change in {@link TreeView.activeItem tree view's active item}
	 */
	export interface TreeViewActiveItemChangeEvent<T> {
		/**
		 * Active item.
		 */
		readonly activeItem: T | undefined;
	}
}
