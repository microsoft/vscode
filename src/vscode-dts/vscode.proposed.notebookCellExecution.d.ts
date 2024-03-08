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
		 * @param errorLocation A range within the cell that indicates where an error occurred if any.
		 */
		end(success: boolean | undefined, endTime?: number, errorLocation?: Range): void;
	}
}
