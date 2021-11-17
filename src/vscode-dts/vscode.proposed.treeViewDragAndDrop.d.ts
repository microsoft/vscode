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

	/**
	 * A class for encapsulating data transferred during a tree drag and drop event.
	 *
	 * If your `DragAndDropController` implements `onWillDrop`, you can extend `TreeDataTransferItem` and return
	 * an instance of your new class for easy access to the source tree items.
	 *
	 * ```ts
	 * 	class TestViewObjectTransferItem extends vscode.TreeDataTransferItem {
	 * 		constructor(private _nodes: Node[]) {
	 * 			super(_nodes);
	 * 		}
	 *
	 * 		asObject(): Node[] {
	 * 			return this._nodes;
	 * 		}
	 * 	}
	 * ```
	 */
	export class TreeDataTransferItem {
		asString(): Thenable<string>;

		constructor(value: any);
	}

	/**
	 * A map containing a mapping of the mime type of the corresponding transferred data.
	 * Trees that support drag and drop can implement `DragAndDropController.onWillDrop` to add additional mime types
	 * when the drop occurs on an item in the same tree.
	 */
	export class TreeDataTransfer<T extends TreeDataTransferItem = TreeDataTransferItem> {
		/**
		 * Retrieves the data transfer item for a given mime type.
		 * @param mimeType The mime type to get the data transfer item for.
		 */
		get(mimeType: string): T | undefined;

		/**
		 * Sets a mime type to data transfer item mapping.
		 * @param mimeType The mime type to set the data for.
		 * @param value The data transfer item for the given mime type.
		 */
		set(mimeType: string, value: T): void;

		/**
		 * Allows iteration through the data transfer items.
		 * @param callbackfn Callback for iteration through the data transfer items.
		 */
		forEach(callbackfn: (value: T, key: string) => void): void;
	}

	/**
	 * Provides support for drag and drop in `TreeView`.
	 */
	export interface DragAndDropController<T> extends Disposable {

		/**
		 * The mime types that this `DragAndDropController` supports. This could be well-defined, existing, mime types,
		 * and also mime types defined by the extension that are returned in the `TreeDataTransfer` from `onWillDrop`.
		 */
		readonly supportedMimeTypes: string[];

		/**
		 * When the user drops an item from this DragAndDropController on **another tree item** in **the same tree**,
		 * `onWillDrop` will be called with the dropped tree items. This is the DragAndDropController's opportunity to
		 * package the data from the dropped tree item into whatever format they want the target tree item to receive.
		 *
		 * The returned `TreeDataTransfer` will be merged with the original`TreeDataTransfer` for the operation.
		 *
		 * @param source The source items for the drag and drop operation.
		 */
		onWillDrop?(source: T[]): Thenable<TreeDataTransfer>;

		/**
		 * Called when a drag and drop action results in a drop on the tree that this `DragAndDropController` belongs too.
		 *
		 * Extensions should fire `TreeDataProvider.onDidChangeTreeData` for any elements that need to be refreshed.
		 *
		 * @param source The data transfer items of the source of the drag.
		 * @param target The target tree element that the drop is occuring on.
		 */
		onDrop(source: TreeDataTransfer, target: T): Thenable<void>;
	}
}
