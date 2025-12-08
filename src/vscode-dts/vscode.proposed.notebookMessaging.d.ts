/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/123601

	/**
	 * Represents a script that is loaded into the notebook renderer before rendering output. This allows
	 * to provide and share functionality for notebook markup and notebook output renderers.
	 */
	export class NotebookRendererScript {

		/**
		 * APIs that the preload provides to the renderer. These are matched
		 * against the `dependencies` and `optionalDependencies` arrays in the
		 * notebook renderer contribution point.
		 */
		provides: readonly string[];

		/**
		 * URI of the JavaScript module to preload.
		 *
		 * This module must export an `activate` function that takes a context object that contains the notebook API.
		 */
		uri: Uri;

		/**
		 * @param uri URI of the JavaScript module to preload
		 * @param provides Value for the `provides` property
		 */
		constructor(uri: Uri, provides?: string | readonly string[]);
	}

	export interface NotebookController {

		// todo@API allow add, not remove
		readonly rendererScripts: NotebookRendererScript[];

		/**
		 * An event that fires when a {@link NotebookController.rendererScripts renderer script} has send a message to
		 * the controller.
		 */
		readonly onDidReceiveMessage: Event<{ readonly editor: NotebookEditor; readonly message: any }>;

		/**
		 * Send a message to the renderer of notebook editors.
		 *
		 * Note that only editors showing documents that are bound to this controller
		 * are receiving the message.
		 *
		 * @param message The message to send.
		 * @param editor A specific editor to send the message to. When `undefined` all applicable editors are receiving the message.
		 * @returns A promise that resolves to a boolean indicating if the message has been send or not.
		 */
		postMessage(message: any, editor?: NotebookEditor): Thenable<boolean>;

		//todo@API validate this works
		asWebviewUri(localResource: Uri): Uri;
	}

	export namespace notebooks {

		export function createNotebookController(id: string, viewType: string, label: string, handler?: (cells: NotebookCell[], notebook: NotebookDocument, controller: NotebookController) => void | Thenable<void>, rendererScripts?: NotebookRendererScript[]): NotebookController;
	}
}
