/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * The mode of the workbench: the experience the window presents.
	 */
	export enum WorkbenchMode {
		/**
		 * The window presents the editor experience.
		 */
		Editor = 1,
		/**
		 * The window presents the agents experience.
		 */
		Agents = 2
	}

	export namespace workspace {

		/**
		 * The current mode of the workbench.
		 */
		export const mode: WorkbenchMode;

		/**
		 * An {@link Event} that fires when the {@link workspace.mode mode} of the workbench changes.
		 */
		export const onDidChangeMode: Event<WorkbenchMode>;
	}
}
