/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/178713

declare module 'vscode' {

	export namespace workspace {

		/**
		 * Saves the editor identified by the given resource and returns the resulting resource or `undefined`
		 * if save was not successful or no editor with the given resource was found.
		 *
		 * **Note** that an editor with the provided resource must be opened in order to be saved.
		 *
		 * @param uri the associated uri for the opened editor to save.
		 * @return A thenable that resolves when the save operation has finished.
		 */
		export function save(uri: Uri): Thenable<Uri | undefined>;

		/**
		 * Saves the editor identified by the given resource to a new file name as provided by the user and
		 * returns the resulting resource or `undefined` if save was not successful or cancelled or no editor
		 * with the given resource was found.
		 *
		 * **Note** that an editor with the provided resource must be opened in order to be saved as.
		 *
		 * @param uri the associated uri for the opened editor to save as.
		 * @return A thenable that resolves when the save-as operation has finished.
		 */
		export function saveAs(uri: Uri): Thenable<Uri | undefined>;
	}
}
