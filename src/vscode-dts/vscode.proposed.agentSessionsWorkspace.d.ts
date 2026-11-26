/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace workspace {

		/**
		 * Whether the editor manages the workspace for agent sessions, rather than the user
		 * opening it. A workspace that the user opened is not agent-managed, even when agents
		 * work in it.
		 *
		 * The {@linkcode workspace.workspaceFolders workspace folders} of an agent-managed
		 * workspace follow the active agent session and can change when the user switches
		 * sessions. Sessions can span projects, so resources outside the current folders can
		 * still be part of the user's work.
		 */
		export const isAgentManaged: boolean;
	}
}
