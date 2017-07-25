/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	// todo@joh discover files etc
	export interface FileSystemProvider {
		// todo@joh -> added, deleted, renamed, changed
		onDidChange: Event<Uri>;

		resolveContents(resource: Uri): string | Thenable<string>;
		writeContents(resource: Uri, contents: string): void | Thenable<void>;
	}

	export namespace workspace {

		export function registerFileSystemProvider(authority: string, provider: FileSystemProvider): Disposable;
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

	export namespace debug {

		/**
		 * Start debugging by using either a named launch or named compound configuration,
		 * or by directly passing a DebugConfiguration.
		 * The named configurations are looked up in '.vscode/launch.json' found in the given folder.
		 * Before debugging starts, all unsaved files are saved and the launch configurations are brought up-to-date.
		 * Folder specific variables used in the configuration (e.g. 'workspaceRoot') are resolved against the given folder.
		 * @param folder The workspace folder for looking up named configurations and resolving variables or undefined.
		 * @param nameOrConfiguration Either the name of a debug or compound configuration or a DebugConfiguration object.
		 * @return A thenable that resolves when debugging could be successfully started.
		 */
		export function startDebugging(folder: WorkspaceFolder | undefined, nameOrConfiguration: string | DebugConfiguration): Thenable<boolean>;
	}

	/**
	 * Namespace for handling credentials.
	 */
	export namespace credentials {

		/**
		 * Read a previously stored secret from the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @return A promise for the secret of the credential.
		 */
		export function readSecret(service: string, account: string): Thenable<string | undefined>;

		/**
		 * Write a secret to the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @param secret The secret of the credential to write to the credential store.
		 * @return A promise indicating completion of the operation.
		 */
		export function writeSecret(service: string, account: string, secret: string): Thenable<void>;

		/**
		 * Delete a previously stored secret from the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @return A promise resolving to true if there was a secret for that service and account.
		 */
		export function deleteSecret(service: string, account: string): Thenable<boolean>;
	}
}
