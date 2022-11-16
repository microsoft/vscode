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

	export namespace notebooks {
		/**
		 * Create notebook controller detection task
		 */
		export function createNotebookControllerDetectionTask(notebookType: string): NotebookControllerDetectionTask;
	}
}
