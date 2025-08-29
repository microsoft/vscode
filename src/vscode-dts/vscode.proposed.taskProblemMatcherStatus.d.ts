/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {


	export interface TaskProblemMatcherStartedEvent {
		/**
		 * The task item representing the task for which the problem matcher processing started.
		 */
		readonly execution: TaskExecution;
	}

	export interface TaskProblemMatcherEndedEvent {
		/**
		 * The task item representing the task for which the problem matcher processing ended.
		 */
		readonly execution: TaskExecution;

		/**
		 * Whether errors were found during the task execution
		 */
		readonly hasErrors: boolean;
	}

	export namespace tasks {

		/**
		 * An event that is emitted when the task's problem matchers start processing lines.
		 */
		export const onDidStartTaskProblemMatchers: Event<TaskProblemMatcherStartedEvent>;

		/**
		 * An event that is emitted when the task problem matchers have finished processing lines.
		 */
		export const onDidEndTaskProblemMatchers: Event<TaskProblemMatcherEndedEvent>;
	}

}
