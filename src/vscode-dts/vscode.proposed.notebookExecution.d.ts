/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A NotebookExecution is how {@link NotebookController notebook controller} can indicate whether the notebook controller is busy or not.
	 *
	 * When {@linkcode NotebookExecution.start start()} is called on the execution task, it causes the Notebook to enter a executing state .
	 * When {@linkcode NotebookExecution.end end()} is called, it enters the idle state.
	 */
	export interface NotebookExecution {
		/**
		 * Signal that the execution has begun.
		 */
		start(): void;

		/**
		 * Signal that execution has ended.
		 */
		end(): void;
	}

	export interface NotebookController {
		/**
		 * Create an execution task.
		 *
		 * _Note_ that there can only be one execution per Notebook, that also includes NotebookCellExecutions and t an error is thrown if
		 * a cell execution or another NotebookExecution is created while another is still active.
		 *
		 * This should be used to indicate the {@link NotebookController notebook controller} is busy even though user may not have executed any cell though the UI.
		 * @param notebook
		 * @returns A notebook execution.
		 */
		createNotebookExecution(notebook: NotebookDocument): NotebookExecution;
	}
}
