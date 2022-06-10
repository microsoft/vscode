/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/147481

	/**
	 * A file associated with a {@linkcode DataTransferItem}.
	 */
	interface DataTransferFile {
		/**
		 * The name of the file.
		 */
		readonly name: string;

		/**
		 * The full file path of the file.
		 *
		 * May be undefined on web.
		 */
		readonly uri?: Uri;

		/**
		 * The full file contents of the file.
		 */
		data(): Thenable<Uint8Array>;
	}

	/**
	 * Identifies the kind of a {@link DataTransferItem}. May either be {@linkcode DataTransferItemKind.String String} or {@linkcode DataTransferItemKind.File File}.
	 */
	enum DataTransferItemKind {

		/**
		 * The {@link DataTransferItem} is a string.
		 *
		 * Use {@link DataTransferItem.asString} to get a string representation of this item or
		 * {@link DataTransferItem.value} to access the original value if them item was created
		 * by an extension.
		 */
		String = 1,

		/**
		 * The {@link DataTransferItem} is for a file.
		 *
		 * Use {@link DataTransferItem.asFile} to get the underlying file data.
		 */
		File = 2,
	}

	export interface DataTransferItem {

		/**
		 * The kind of the {@link DataTransferItem}.
		 */
		readonly kind: DataTransferItemKind;

		/**
		 * Try getting the file associated with this data transfer item.
		 *
		 * Note that the file object is only valid for the scope of the drag and drop operation.
		 *
		 * @returns The file for the data transfer or `undefined` if the item is either not a file or the
		 * file data cannot be accessed.
		 */
		asFile(): DataTransferFile | undefined;
	}
}
