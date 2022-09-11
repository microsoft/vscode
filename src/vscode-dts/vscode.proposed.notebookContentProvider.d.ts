/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/147248

	/** @deprecated */
	interface NotebookDocumentBackup {
		/**
		 * Unique identifier for the backup.
		 *
		 * This id is passed back to your extension in `openNotebook` when opening a notebook editor from a backup.
		 */
		readonly id: string;

		/**
		 * Delete the current backup.
		 *
		 * This is called by the editor when it is clear the current backup is no longer needed, such as when a new backup
		 * is made or when the file is saved.
		 */
		delete(): void;
	}

	/** @deprecated */
	interface NotebookDocumentBackupContext {
		readonly destination: Uri;
	}

	/** @deprecated */
	interface NotebookDocumentOpenContext {
		readonly backupId?: string;
		readonly untitledDocumentData?: Uint8Array;
	}

	// todo@API use openNotebookDOCUMENT to align with openCustomDocument etc?
	// todo@API rename to NotebookDocumentContentProvider
	/** @deprecated */

	export interface NotebookContentProvider {

		readonly options?: NotebookDocumentContentOptions;
		readonly onDidChangeNotebookContentOptions?: Event<NotebookDocumentContentOptions>;

		/**
		 * Content providers should always use {@link FileSystemProvider file system providers} to
		 * resolve the raw content for `uri` as the resource is not necessarily a file on disk.
		 */
		openNotebook(uri: Uri, openContext: NotebookDocumentOpenContext, token: CancellationToken): NotebookData | Thenable<NotebookData>;

		// todo@API use NotebookData instead
		saveNotebook(document: NotebookDocument, token: CancellationToken): Thenable<void>;

		// todo@API use NotebookData instead
		saveNotebookAs(targetResource: Uri, document: NotebookDocument, token: CancellationToken): Thenable<void>;

		// todo@API use NotebookData instead
		backupNotebook(document: NotebookDocument, context: NotebookDocumentBackupContext, token: CancellationToken): Thenable<NotebookDocumentBackup>;
	}

	export namespace workspace {

		// TODO@api use NotebookDocumentFilter instead of just notebookType:string?
		// TODO@API options duplicates the more powerful variant on NotebookContentProvider
		/** @deprecated */
		export function registerNotebookContentProvider(notebookType: string, provider: NotebookContentProvider, options?: NotebookDocumentContentOptions): Disposable;
	}
}
