/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {
	export interface TaskTerminalStatus {
		terminalId: number;
		status: string;
	}
	export namespace tasks {

		/**
		 * An event that is emitted when the status of a terminal task changes.
		 */
		export const onDidChangeTaskStatus: Event<TaskTerminalStatus>;
	}

}
