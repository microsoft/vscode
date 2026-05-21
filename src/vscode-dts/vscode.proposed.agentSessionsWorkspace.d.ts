/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace workspace {

		/**
		 * Indicates whether the current workspace is an agent sessions workspace.
		 *
		 * Agent sessions workspace is a special workspace used for AI agent interactions
		 * where the window is dedicated to agent session management.
		 */
		export const isAgentSessionsWorkspace: boolean;
	}
}
