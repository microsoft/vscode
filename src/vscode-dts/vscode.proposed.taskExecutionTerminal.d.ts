/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// #234440
declare module 'vscode' {

	export interface TaskExecution {
		/**
		 * The terminal associated with this task execution, if any.
		 */
		terminal?: Terminal;
	}
}
