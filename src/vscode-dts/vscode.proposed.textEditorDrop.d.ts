/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/142990

	export interface TextEditorDropEvent {
		/**
		 * The {@link TextEditor} the resource was dropped onto.
		 */
		readonly editor: TextEditor;

		/**
		 * The position in the file where the drop occurred
		 */
		readonly position: Position;

		/**
		 *  The {@link DataTransfer data transfer} associated with this drop.
		 */
		readonly dataTransfer: DataTransfer;

		/**
		 * Allows to pause the event to delay apply the drop.
		 *
		 * *Note:* This function can only be called during event dispatch and not
		 * in an asynchronous manner:
		 *
		 * ```ts
		 * workspace.onWillDropOnTextEditor(event => {
		 * 	// async, will *throw* an error
		 * 	setTimeout(() => event.waitUntil(promise));
		 *
		 * 	// sync, OK
		 * 	event.waitUntil(promise);
		 * })
		 * ```
		 *
		 * @param thenable A thenable that delays saving.
		 */
		waitUntil(thenable: Thenable<any>): void;

		token: CancellationToken;
	}

	export namespace workspace {
		/**
		 * Event fired when the user drops a resource into a text editor.
		 */
		export const onWillDropOnTextEditor: Event<TextEditorDropEvent>;
	}
}
