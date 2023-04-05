/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * An event that is fired when a {@link NotebookDocument notebook document} will be saved.
	 *
	 * To make modifications to the document before it is being saved, call the
	 * {@linkcode NotebookDocumentWillSaveEvent.waitUntil waitUntil}-function with a thenable
	 * that resolves to a {@link WorkspaceEdit workspace edit}.
	 */
	export interface NotebookDocumentWillSaveEvent {
		/**
		 * A cancellation token.
		 */
		readonly token: CancellationToken;

		/**
		 * The {@link NotebookDocument notebook document} that will be saved.
		 */
		readonly notebook: NotebookDocument;

		/**
		 * The reason why save was triggered.
		 */
		readonly reason: TextDocumentSaveReason;

		/**
		 * Allows to pause the event loop and to apply {@link WorkspaceEdit workspace edit}.
		 * Edits of subsequent calls to this function will be applied in order. The
		 * edits will be *ignored* if concurrent modifications of the notebook document happened.
		 *
		 * *Note:* This function can only be called during event dispatch and not
		 * in an asynchronous manner:
		 *
		 * ```ts
		 * workspace.onWillSaveNotebookDocument(event => {
		 * 	// async, will *throw* an error
		 * 	setTimeout(() => event.waitUntil(promise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntil(promise);
		 * })
		 * ```
		 *
		 * @param thenable A thenable that resolves to {@link WorkspaceEdit workspace edit}.
		 */
		waitUntil(thenable: Thenable<WorkspaceEdit>): void;

		/**
		 * Allows to pause the event loop until the provided thenable resolved.
		 *
		 * *Note:* This function can only be called during event dispatch.
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<any>): void;
	}

	export namespace workspace {

		/**
		 * An event that is emitted when a {@link NotebookDocument notebook document} will be saved to disk.
		 *
		 * *Note 1:* Subscribers can delay saving by registering asynchronous work. For the sake of data integrity the editor
		 * might save without firing this event. For instance when shutting down with dirty files.
		 *
		 * *Note 2:* Subscribers are called sequentially and they can {@link NotebookDocumentWillSaveEvent.waitUntil delay} saving
		 * by registering asynchronous work. Protection against misbehaving listeners is implemented as such:
		 *  * there is an overall time budget that all listeners share and if that is exhausted no further listener is called
		 *  * listeners that take a long time or produce errors frequently will not be called anymore
		 *
		 * The current thresholds are 1.5 seconds as overall time budget and a listener can misbehave 3 times before being ignored.
		 */
		export const onWillSaveNotebookDocument: Event<NotebookDocumentWillSaveEvent>;
	}
}
