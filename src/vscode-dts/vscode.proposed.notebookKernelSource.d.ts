/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface NotebookControllerDetectionTask {
		/**
		 * Dispose and remove the detection task.
		 */
		dispose(): void;
	}

	export class NotebookKernelSourceAction {
		readonly label: string;
		readonly description?: string;
		readonly detail?: string;
		readonly command: string | Command;
		readonly documentation?: Uri;

		constructor(label: string);
	}

	export interface NotebookKernelSourceActionProvider {
		/**
		 * An optional event to signal that the kernel source actions have changed.
		 */
		onDidChangeNotebookKernelSourceActions?: Event<void>;
		/**
		 * Provide kernel source actions
		 */
		provideNotebookKernelSourceActions(token: CancellationToken): ProviderResult<NotebookKernelSourceAction[]>;
	}

	export namespace notebooks {
		/**
		 * Create notebook controller detection task
		 */
		export function createNotebookControllerDetectionTask(notebookType: string): NotebookControllerDetectionTask;

		/**
		 * Register a notebook kernel source action provider
		 */
		export function registerKernelSourceActionProvider(notebookType: string, provider: NotebookKernelSourceActionProvider): Disposable;
	}
}
