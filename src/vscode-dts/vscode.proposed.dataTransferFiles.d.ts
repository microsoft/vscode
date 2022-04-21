/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/TODO

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
		asFile(): Thenable<DataTransferFile | undefined>;
	}
}
