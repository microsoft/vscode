/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {


	export interface NotebookProxyController {
		/**
		 * The identifier of this notebook controller.
		 *
		 * _Note_ that controllers are remembered by their identifier and that extensions should use
		 * stable identifiers across sessions.
		 */
		readonly id: string;

		/**
		 * The notebook type this controller is for.
		 */
		readonly notebookType: string;

		/**
		 * The human-readable label of this notebook controller.
		 */
		label: string;

		/**
		 * The human-readable description which is rendered less prominent.
		 */
		description?: string;

		/**
		 * The human-readable detail which is rendered less prominent.
		 */
		detail?: string;

		/**
		 * The human-readable label used to categorise controllers.
		 */
		kind?: string;

		resolveHandler: () => NotebookController | string | Thenable<NotebookController | string>;

		readonly onDidChangeSelectedNotebooks: Event<{ readonly notebook: NotebookDocument; readonly selected: boolean }>;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;
	}

	export namespace notebooks {
		export function createNotebookProxyController(id: string, notebookType: string, label: string, resolveHandler: () => NotebookController | string | Thenable<NotebookController | string>): NotebookProxyController;
	}
}
