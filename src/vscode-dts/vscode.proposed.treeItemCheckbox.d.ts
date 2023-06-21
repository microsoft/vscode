/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export class TreeItem2 extends TreeItem {
		/**
		 * {@link TreeItemCheckboxState TreeItemCheckboxState} of the tree item.
		 * {@link TreeDataProvider.onDidChangeTreeData onDidChangeTreeData} should be fired when {@link TreeItem2.checkboxState checkboxState} changes.
		 */
		checkboxState?: TreeItemCheckboxState | { readonly state: TreeItemCheckboxState; readonly tooltip?: string; readonly accessibilityInformation?: AccessibilityInformation };
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
		onDidChangeCheckboxState: Event<TreeCheckboxChangeEvent<T>>;
	}

	export interface TreeCheckboxChangeEvent<T> {
		/**
		* The items that were checked or unchecked.
		*/
		readonly items: ReadonlyArray<[T, TreeItemCheckboxState]>;
	}

	/**
	 * Options for creating a {@link TreeView}
	 */
	export interface TreeViewOptions<T> {
		/**
		 * By default, when the children of a tree item have already been fetched, child checkboxes are automatically managed based on the checked state of the parent tree item.
		 * If the tree item is collapsed by default (meaning that the children haven't yet been fetched) then child checkboxes will not be updated.
		 * To override this behavior and manage child and parent checkbox state in the extension, set this to `true`.
		 *
		 * Examples where {@link TreeViewOptions.manageCheckboxStateManually} is false, the default behavior:
		 *
		 * 1. A tree item is checked, then its children are fetched. The children will be checked. TODO @alexr00 there's a bug here
		 *
		 * 2. A tree item's parent is checked. The tree item and all of it's siblings will be checked.
		 *   - [ ] Parent
		 *     - [ ] Child 1
		 *     - [ ] Child 2
		 *   When the user checks Parent, the tree will look like this:
		 *   - [x] Parent
		 *     - [x] Child 1
		 *     - [x] Child 2
		 *
		 * 3. A tree item and all of it's siblings are checked. The parent will be checked.
		 *   - [ ] Parent
		 *     - [ ] Child 1
		 *     - [ ] Child 2
		 *   When the user checks Child 1 and Child 2, the tree will look like this:
		 *   - [x] Parent
		 *     - [x] Child 1
		 *     - [x] Child 2
		 *
		 * 4. A tree item is unchecked. The parent will be unchecked. TODO @alexr00 there's a bug here
		 *   - [x] Parent
		 *     - [x] Child 1
		 *     - [x] Child 2
		 *   When the user unchecks Child 1, the tree will look like this:
		 *   - [ ] Parent
		 *     - [ ] Child 1
		 *     - [x] Child 2
		 */
		manageCheckboxStateManually?: boolean;
	}
}
