/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * Represents reasons why a notebook document is saved.
	 */
	export enum NotebookDocumentSaveReason {

		/**
		 * Manually triggered, e.g. by the user pressing save, by starting debugging,
		 * or by an API call.
		 */
		Manual = 1,

		/**
		 * Automatic after a delay.
		 */
		AfterDelay = 2,

		/**
		 * When the editor lost focus.
		 */
		FocusOut = 3
	}

	/**
	 * An event that is fired when a {@link NotebookDocument document} will be saved.
	 *
	 * To make modifications to the document before it is being saved, call the
	 * {@linkcode NotebookDocumentWillSaveEvent.waitUntil waitUntil}-function with a thenable
	 * that resolves to an array of {@link TextEdit text edits}.
	 */
	export interface NotebookDocumentWillSaveEvent {
		/**
		 * A cancellation token.
		 */
		readonly token: CancellationToken;

		/**
		 * The document that will be saved.
		 */
		readonly document: NotebookDocument;

		/**
		 * The reason why save was triggered.
		 */
		readonly reason: NotebookDocumentSaveReason;

		waitUntil(thenable: Thenable<readonly WorkspaceEdit[]>): void;

		waitUntil(thenable: Thenable<any>): void;
	}

	export namespace workspace {

		export const onWillSaveNotebookDocument: Event<NotebookDocumentWillSaveEvent>;
	}
}
