/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {

	export enum TaskEventKind {
		/** Indicates that a task's properties or configuration have changed */
		Changed = 'changed',

		/** Indicates that a task has begun executing */
		ProcessStarted = 'processStarted',

		/** Indicates that a task process has completed */
		ProcessEnded = 'processEnded',

		/** Indicates that a task was terminated, either by user action or by the system */
		Terminated = 'terminated',

		/** Indicates a task has started running */
		Start = 'start',

		/** Indicates task has acquired all needed input/variables to execute */
		AcquiredInput = 'acquiredInput',

		/** Indicates a dependent task has started */
		DependsOnStarted = 'dependsOnStarted',

		/** Indicates the task is actively running/processing */
		Active = 'active',

		/** Indicates the task is paused/waiting but not complete */
		Inactive = 'inactive',

		/** Indicates the task has completed fully */
		End = 'end',

		/** Indicates that a problem matcher has started */
		ProblemMatcherStarted = 'problemMatcherStarted',

		/** Indicates that a problem matcher has ended */
		ProblemMatcherEnded = 'problemMatcherEnded',

		/** Indicates that a problem matcher has found errors */
		ProblemMatcherFoundErrors = 'problemMatcherFoundErrors'
	}

	export interface TaskStatusEvent {
		/**
		 * The task item representing the task for which the event occurred
		 */
		readonly execution: TaskExecution;

		/**
		 * The task event kind
		 */
		readonly taskEventKind: TaskEventKind;
	}

	export namespace tasks {

		/**
		 * An event that is emitted when the status of a task changes.
		 */
		export const onDidChangeTaskStatus: Event<TaskStatusEvent>;
	}

}
