/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/32592

	/**
	 * A data provider that provides tree data
	 */
	export interface TreeDataProvider<T> {
		/**
		 * An optional event to signal that an element or root has changed.
		 * This will trigger the view to update the changed element/root and its children recursively (if shown).
		 * To signal that root has changed, do not pass any argument or pass `undefined` or `null`.
		 */
		onDidChangeTreeData2?: Event<T | T[] | undefined | null | void>;
	}

	export interface TreeViewOptions<T> {
		/**
		* An optional interface to implement drag and drop in the tree view.
		*/
		dragAndDropController?: DragAndDropController<T>;
	}

	export interface TreeDataTransferItem {
		asString(): Thenable<string>;
	}

	export interface TreeDataTransfer {
		/**
		 * A map containing a mapping of the mime type of the corresponding data.
		 * Trees that support drag and drop can implement `DragAndDropController.onWillDrop` to add additional mime types
		 * when the drop occurs on an item in the same tree.
		 */
		items: {
			get: (mimeType: string) => TreeDataTransferItem | undefined
			forEach: (callbackfn: (value: TreeDataTransferItem, key: string) => void) => void;
		};
	}

	export interface DragAndDropController<T> extends Disposable {
		readonly supportedTypes: string[];

		/**
		 * When the user drops an item from this DragAndDropController on **another tree item** in **the same tree**,
		 * `onWillDrop` will be called with the dropped tree item. This is the DragAndDropController's opportunity to
		 * package the data from the dropped tree item into whatever format they want the target tree item to receive.
		 *
		 * The returned `TreeDataTransfer` will be merged with the original`TreeDataTransfer` for the operation.
		 *
		 * @param source
		 */
		onWillDrop(source: T[]): Thenable<TreeDataTransfer>;

		/**
		 * Extensions should fire `TreeDataProvider.onDidChangeTreeData` for any elements that need to be refreshed.
		 *
		 * @param source
		 * @param target
		 */
		onDrop(source: TreeDataTransfer, target: T): Thenable<void>;
	}
}
