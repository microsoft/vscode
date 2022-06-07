/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/147481

	enum DataTransferItemKind {
		String = 1,
		File = 2,
	}

	interface DataTransferItem {
		readonly kind: DataTransferItemKind;
	}

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

	export interface DataTransferItem {
		/**
		 * Try getting the file associated with this data transfer item.
		 *
		 * Note that the file object is only valid for the scope of the drag and drop operation.
		 *
		 * @returns The file for the data transfer or `undefined` if the item is not a file.
		 */
		asFile(): DataTransferFile | undefined;
	}
}
