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
		dragAndDropController?: TreeDragAndDropController<T>;
	}

	/**
	 * A class for encapsulating data transferred during a tree drag and drop event.
	 *
	 * If your `DragAndDropController` implements `handleDrag`, you can use the `value` of the `TreeDataTransferItem`
	 * to get back the object you put into it so long as the extension that created the `TreeDataTransferItem` runs in the same
	 * extension host.
	 */
	export class TreeDataTransferItem {
		asString(): Thenable<string>;
		readonly value: any;
		constructor(value: any);
	}

	/**
	 * A map containing a mapping of the mime type of the corresponding transferred data.
	 * Trees that support drag and drop can implement `DragAndDropController.handleDrag` to add additional mime types
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
	export interface TreeDragAndDropController<T> {

		/**
		 * The mime types that the `handleDrop` method of this `DragAndDropController` supports.
		 * This could be well-defined, existing, mime types, and also mime types defined by the extension.
		 *
		 * Each tree will automatically support drops from it's own `DragAndDropController`. To support drops from other trees,
		 * you will need to add the mime type of that tree. The mime type of a tree is of the format `application/vnd.code.tree.treeidlowercase`.
		 *
		 * To learn the mime type of a dragged item:
		 * 1. Set up your `DragAndDropController`
		 * 2. Use the Developer: Set Log Level... command to set the level to "Debug"
		 * 3. Open the developer tools and drag the item with unknown mime type over your tree. The mime types will be logged to the developer console
		 */
		readonly dropMimeTypes: string[];

		/**
		 * The mime types that the `handleDrag` method of this `TreeDragAndDropController` may add to the tree data transfer.
		 * This could be well-defined, existing, mime types, and also mime types defined by the extension.
		 */
		readonly dragMimeTypes: string[];

		/**
		 * When the user starts dragging items from this `DragAndDropController`, `handleDrag` will be called.
		 * Extensions can use `handleDrag` to add their `TreeDataTransferItem`s to the drag and drop.
		 *
		 * When the items are dropped on **another tree item** in **the same tree**, your `TreeDataTransferItem` objects
		 * will be preserved. See the documentation for `TreeDataTransferItem` for how best to take advantage of this.
		 *
		 * To add a data transfer item that can be dragged into the editor, use the application specific mime type "text/uri-list".
		 * The data for "text/uri-list" should be a string with `toString()`ed Uris separated by newlines. To specify a cursor position in the file,
		 * set the Uri's fragment to `L3,5`, where 3 is the line number and 5 is the column number.
		 *
		 * @param source The source items for the drag and drop operation.
		 * @param treeDataTransfer The data transfer associated with this drag.
		 * @param token A cancellation token indicating that drag has been cancelled.
		 */
		handleDrag?(source: T[], treeDataTransfer: TreeDataTransfer, token: CancellationToken): Thenable<void> | void;

		/**
		 * Called when a drag and drop action results in a drop on the tree that this `DragAndDropController` belongs too.
		 *
		 * Extensions should fire `TreeDataProvider.onDidChangeTreeData` for any elements that need to be refreshed.
		 *
		 * @param source The data transfer items of the source of the drag.
		 * @param target The target tree element that the drop is occurring on.
		 * @param token A cancellation token indicating that the drop has been cancelled.
		 */
		handleDrop?(target: T, source: TreeDataTransfer, token: CancellationToken): Thenable<void> | void;
	}
}
