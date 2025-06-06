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
		 * The error name.
		 */
		readonly name: string;

		/**
		 * The error message.
		 */
		readonly message: string;

		/**
		 * The string from an Error object or parsed details on each stack frame to help with diagnostics.
		 */
		readonly stack: string | CellErrorStackFrame[] | undefined;

		/**
		 * The cell resource which had the error.
		 */
		uri: Uri;

		/**
		 * The location within the resource where the error occurred.
		 */
		readonly location: Range | undefined;
	}

	export class CellErrorStackFrame {
		/**
		 * The location of this stack frame. This should be provided as a URI if the
		 * location of the call frame can be accessed by the editor.
		 */
		readonly uri?: Uri;

		/**
		 * Position of the stack frame within the file.
		 */
		position?: Position;

		/**
		 * The name of the stack frame, typically a method or function name.
		 */
		readonly label: string;

		/**
		 * @param label The name of the stack frame
		 * @param file The file URI of the stack frame
		 * @param position The position of the stack frame within the file
		 */
		constructor(label: string, uri?: Uri, position?: Position);
	}
}
