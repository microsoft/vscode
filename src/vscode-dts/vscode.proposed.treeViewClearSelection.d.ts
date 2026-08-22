/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/48754

	export interface TreeView<T> extends Disposable {
		/**
		 * Clears the selection of this tree view.
		 *
		 * This is the counterpart to selecting an element with {@link TreeView.reveal reveal}: it
		 * allows a tree view that mirrors some external state to stop indicating a selection once
		 * that state no longer corresponds to any element in the tree.
		 *
		 * The focused element, if any, stays focused. Nothing happens if no element is selected.
		 */
		clearSelection(): void;
	}
}
