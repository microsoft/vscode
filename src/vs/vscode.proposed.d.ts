/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export interface WorkspaceFoldersChangeEvent {
		readonly addedFolders: Uri[];
		readonly removedFolders: Uri[];
	}

	export namespace workspace {

		/**
		* List of workspace folders or `undefined` when no folder is open. The *first*
		* element in the array is equal to the [`rootPath`](#workspace.rootPath)
		*/
		export let workspaceFolders: Uri[] | undefined;

		/**
		 * An event that is emitted when a workspace folder is added or removed.
		 */
		export const onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
	}

	export interface WorkspaceConfiguration2 extends WorkspaceConfiguration {

		inspect<T>(section: string): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T, folderValue?: T } | undefined;

	}

	export namespace workspace {

		export function getConfiguration2(section?: string, resource?: Uri): WorkspaceConfiguration2;
	}

	export namespace window {

		export function sampleFunction(): Thenable<any>;
	}

	/**
	 * The contiguous set of modified lines in a diff.
	 */
	export interface LineChange {
		readonly originalStartLineNumber: number;
		readonly originalEndLineNumber: number;
		readonly modifiedStartLineNumber: number;
		readonly modifiedEndLineNumber: number;
	}

	export namespace commands {

		/**
		 * Registers a diff information command that can be invoked via a keyboard shortcut,
		 * a menu item, an action, or directly.
		 *
		 * Diff information commands are different from ordinary [commands](#commands.registerCommand) as
		 * they only execute when there is an active diff editor when the command is called, and the diff
		 * information has been computed. Also, the command handler of an editor command has access to
		 * the diff information.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function with access to the [diff information](#LineChange).
		 * @param thisArg The `this` context used when invoking the handler function.
		 * @return Disposable which unregisters this command on disposal.
		 */
		export function registerDiffInformationCommand(command: string, callback: (diff: LineChange[], ...args: any[]) => any, thisArg?: any): Disposable;
	}

	export interface Terminal {

		/**
		 * The name of the terminal.
		 */
		readonly name: string;

		/**
		 * The process ID of the shell process.
		 */
		readonly processId: Thenable<number>;

		/**
		 * Send text to the terminal. The text is written to the stdin of the underlying pty process
		 * (shell) of the terminal.
		 *
		 * @param text The text to send.
		 * @param addNewLine Whether to add a new line to the text being sent, this is normally
		 * required to run a command in the terminal. The character(s) added are \n or \r\n
		 * depending on the platform. This defaults to `true`.
		 */
		sendText(text: string, addNewLine?: boolean): void;

		/**
		 * Show the terminal panel and reveal this terminal in the UI.
		 *
		 * @param preserveFocus When `true` the terminal will not take focus.
		 */
		show(preserveFocus?: boolean): void;

		/**
		 * Hide the terminal panel if this terminal is currently showing.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources.
		 */
		dispose(): void;

		/**
		 * Experimental API that allows listening to the raw data stream coming from the terminal's
		 * pty process (including ANSI escape sequences).
		 *
		 * @param callback The callback that is triggered when data is sent to the terminal.
		 */
		onData(callback: (data: string) => any): void;
	}

	/**
	 * Namespace for dealing with debug sessions.
	 */
	export namespace debug {

		/**
		 * An [event](#Event) which fires when a debug session has terminated.
		 */
		export const onDidTerminateDebugSession: Event<DebugSession>;

		/**
		 * Create a new debug session based on the given launchConfig.
		 * @param launchConfig
		 */
		export function createDebugSession(launchConfig: DebugConfiguration): Thenable<DebugSession>;
	}

	/**
	 * Configuration for a debug session.
	 */
	export interface DebugConfiguration {
		/**
		 * The type for the debug session.
		 */
		type: string;

		/**
		 * An optional name for the debug session.
		 */
		name?: string;

		/**
		 * The request type of the debug session.
		 */
		request: string;

		/**
		 * Additional debug type specific properties.
		 */
		[key: string]: any;
	}

	/**
	 * A debug session.
	 */
	export interface DebugSession {

		/**
		 * The debug session's type from the debug configuration.
		 */
		readonly type: string;

		/**
		 * The debug session's name from the debug configuration.
		 */
		readonly name: string;

		/**
		 * Send a custom request to the debug adapter.
		 */
		customRequest(command: string, args?: any): Thenable<any>;
	}
}
