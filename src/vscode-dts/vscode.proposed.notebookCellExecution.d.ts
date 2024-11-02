/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface NotebookCellExecution {
		/**
		 * Signal that execution has ended.
		 *
		 * @param success If true, a green check is shown on the cell status bar.
		 * If false, a red X is shown.
		 * If undefined, no check or X icon is shown.
		 * @param endTime The time that execution finished, in milliseconds in the Unix epoch.
		 * @param error Details about an error that occurred during execution if any.
		 */
		end(success: boolean | undefined, endTime?: number, error?: CellExecutionError): void;
	}

	export interface CellExecutionError {
		/**
		 * The error message.
		 */
		readonly message: string;

		/**
		 * The error stack trace.
		 */
		readonly stack: string | undefined;

		/**
		 * The cell resource which had the error.
		 */
		uri: Uri;

		/**
		 * The location within the resource where the error occurred.
		 */
		readonly location: Range | undefined;


	}
}
