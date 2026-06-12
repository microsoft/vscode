/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
declare module 'vscode' {

	export namespace workspace {

		/**
		 * Whether the current window is an **agent session workspace**.
		 *
		 * An agent session workspace is a special window type used by AI extensions
		 * (e.g. GitHub Copilot, Claude, etc.) to manage conversations and tool calls
		 * inside a dedicated editor environment.
		 *
		 * Use this flag to adapt extension behavior or UI when running in an agent context.
		 */
		export const isAgentSessionsWorkspace: boolean;
	}
}
