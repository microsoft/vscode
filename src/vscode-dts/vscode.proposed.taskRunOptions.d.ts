/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Controls when a task should be run.
	 */
	export enum TaskRunOn {
		/**
		 * The task is not run automatically.
		 */
		Default = 1,

		/**
		 * The task runs when a folder is opened.
		 */
		FolderOpen = 2,

		/**
		 * The task runs when an Agent Session worktree is created.
		 */
		WorktreeCreated = 3,
	}

	export interface RunOptions {
		/**
		 * Controls when a task is run automatically.
		 */
		runOn?: TaskRunOn;
	}
}