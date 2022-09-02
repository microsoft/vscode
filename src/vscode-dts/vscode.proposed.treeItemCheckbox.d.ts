/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export class TreeItem2 extends TreeItem {
		/**
		 * [TreeItemCheckboxState](#TreeItemCheckboxState) of the tree item.
		 */
		checkboxState?: TreeItemCheckboxState;
	}

	/**
	* Checkbox state of the tree item
	*/
	export enum TreeItemCheckboxState {
		/**
		 * Determines an item is unchecked
		 */
		Unchecked = 0,
		/**
		 * Determines an item is checked
		 */
		Checked = 1
	}

	/**
	* A data provider that provides tree data
	*/
	export interface TreeView<T> {
		/**
		* An event to signal that an element or root has either been checked or unchecked.
		*/
		onDidChangeTreeCheckbox: Event<TreeCheckboxChangeEvent<T>>;
	}

	export interface TreeCheckboxChangeEvent<T> {
		/**
		* The item that was checked or unchecked.
		*/
		readonly items: [T, TreeItemCheckboxState][];
	}
}
