/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/147248

	/** @deprecated */
	interface NotebookDocumentOpenContext {
		readonly backupId?: string;
		readonly untitledDocumentData?: Uint8Array;
	}

	// todo@API use openNotebookDOCUMENT to align with openCustomDocument etc?
	// todo@API rename to NotebookDocumentContentProvider
	/** @deprecated */
	export interface NotebookContentProvider {

		/**
		 * Content providers should always use {@link FileSystemProvider file system providers} to
		 * resolve the raw content for `uri` as the resource is not necessarily a file on disk.
		 */
		openNotebook(uri: Uri, openContext: NotebookDocumentOpenContext, token: CancellationToken): NotebookData | Thenable<NotebookData>;
	}

	export namespace workspace {

		// TODO@api use NotebookDocumentFilter instead of just notebookType:string?
		// TODO@API options duplicates the more powerful variant on NotebookContentProvider
		/** @deprecated */
		export function registerNotebookContentProvider(notebookType: string, provider: NotebookContentProvider, options?: NotebookDocumentContentOptions): Disposable;
	}
}
