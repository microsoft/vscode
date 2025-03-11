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

		/** Indicates that a task has started running */
		Start = 'start',

		/** Indicates that a task has acquired all needed input/variables to execute */
		AcquiredInput = 'acquiredInput',

		/** Indicates that a dependent task has started */
		DependsOnStarted = 'dependsOnStarted',

		/** Indicates that a task is actively running/processing */
		Active = 'active',

		/** Indicates that a task is paused/waiting but not complete */
		Inactive = 'inactive',

		/** Indicates that a task has completed fully */
		End = 'end',

		/** Indicates that a task's problem matcher has started */
		ProblemMatcherStarted = 'problemMatcherStarted',

		/** Indicates that a task's problem matcher has ended */
		ProblemMatcherEnded = 'problemMatcherEnded',

		/** Indicates that a task's problem matcher has found errors */
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
		readonly eventKind: TaskEventKind;
	}

	export namespace tasks {

		/**
		 * An event that is emitted when the status of a task changes.
		 */
		export const onDidChangeTaskStatus: Event<TaskStatusEvent>;
	}

}
