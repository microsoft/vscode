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
		/**
		 * Get a configuration object.
		 *
		 * When a section-identifier is provided only that part of the configuration
		 * is returned. Dots in the section-identifier are interpreted as child-access,
		 * like `{ myExt: { setting: { doIt: true }}}` and `getConfiguration('myExt.setting').get('doIt') === true`.
		 *
		 * When a resource is provided, only configuration scoped to that resource
		 * is returned.
		 *
		 * If editor is opened with `no folders` then returns the global configuration.
		 *
		 * If editor is opened with `folders` then returns the configuration from the folder in which the resource belongs to.
		 *
		 * If resource does not belongs to any opened folders, then returns the workspace configuration.
		 *
		 * @param section A dot-separated identifier.
		 * @param resource A resource for which configuration is asked
		 * @return The full workspace configuration or a subset.
		 */
		export function getConfiguration2(section?: string, resource?: Uri): WorkspaceConfiguration2;
	}

	/**
	 * Represents the workspace configuration.
	 *
	 * The workspace configuration is a merged view of
	 *
	 * - Default configuration
	 * - Global configuration
	 * - Workspace configuration (if available)
	 * - Folder configuration of the [resource](#workspace.getConfiguration2) (if requested and available)
	 *
	 * **Global configuration** comes from User Settings and shadows Defaults.
	 *
	 * **Workspace configuration** comes from the `.vscode` folder under first [workspace folders](#workspace.workspaceFolders)
	 * and shadows Globals configuration.
	 *
	 * **Folder configurations** comes from `.vscode` folder under [workspace folders](#workspace.workspaceFolders). Each [workspace folder](#workspace.workspaceFolders)
	 * has a configuration and the requested resource determines which folder configuration to pick. Folder configuration shodows Workspace configuration.
	 *
	 * *Note:* Workspace and Folder configurations contains settings from `launch.json` and `tasks.json` files. Their basename will be
	 * part of the section identifier. The following snippets shows how to retrieve all configurations
	 * from `launch.json`:
	 *
	 * ```ts
	 * // launch.json configuration
	 * const config = workspace.getConfiguration('launch', workspace.workspaceFolders[1]);
	 *
	 * // retrieve values
	 * const values = config.get('configurations');
	 * ```
	 */
	export interface WorkspaceConfiguration2 extends WorkspaceConfiguration {

		/**
		 * Retrieve all information about a configuration setting. A configuration value
		 * often consists of a *default* value, a global or installation-wide value,
		 * a workspace-specific value and a folder-specific value.
		 *
		 * The *effective* value (returned by [`get`](#WorkspaceConfiguration.get))
		 * is computed like this: `defaultValue` overwritten by `globalValue`,
		 * `globalValue` overwritten by `workspaceValue`. `workspaceValue` overwritten by `folderValue`.
		 *
		 * *Note:* The configuration name must denote a leaf in the configuration tree
		 * (`editor.fontSize` vs `editor`) otherwise no result is returned.
		 *
		 * @param section Configuration name, supports _dotted_ names.
		 * @return Information about a configuration setting or `undefined`.
		 */
		inspect<T>(section: string): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T, folderValue?: T } | undefined;

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
}
