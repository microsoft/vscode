/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	export enum TaskEventKind {
		DependsOnStarted = 'dependsOnStarted',
		AcquiredInput = 'acquiredInput',
		Start = 'start',
		ProcessStarted = 'processStarted',
		Active = 'active',
		Inactive = 'inactive',
		Changed = 'changed',
		Terminated = 'terminated',
		ProcessEnded = 'processEnded',
		End = 'end'
	}

	export interface TaskStatusEvent {
		/**
		 * The task item representing the task for which the event occurred.
		 */
		readonly execution: TaskExecution;

		/**
		 * The task event kind
		 */
		readonly taskEventKind: TaskEventKind;
	}

	export namespace tasks {

		/**
		 * An event that is emitted when the status of a terminal task changes.
		 */
		export const onDidChangeTaskStatus: Event<TaskStatusEvent>;
	}

}
