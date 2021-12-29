/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/3025

	export interface FileSystem2 extends FileSystem {

		/**
		 * Subscribe to file change events in the file or folder denoted by `uri`. For folders,
		 * the option `recursive` indicates whether subfolders, sub-subfolders, etc. should
		 * be watched for file changes as well.
		 *
		 * The `excludes` array is used to indicate paths that should be excluded from file
		 * watching. Each entry can be be:
		 * - the absolute path to exclude
		 * - a relative path to exclude (for example `build/output`)
		 * - a simple glob pattern (for example `**\build`, `output/**`)
		 *
		 * File events will be delivered via {@linkcode workspace.createFileSystemWatcher createFileSystemWatcher}.
		 *
		 * @param uri The uri of the file or folder to be watched.
		 * @param options Configures the watch.
		 * @returns A disposable that tells the provider to stop watching the `uri`.
		 */
		watch(uri: Uri, options?: { recursive: boolean; excludes: string[] }): Disposable;
	}

	export namespace workspace {

		/**
		 * A {@link FileSystem file system} instance that allows to interact with local and remote
		 * files, e.g. `vscode.workspace.fs.readDirectory(someUri)` allows to retrieve all entries
		 * of a directory or `vscode.workspace.fs.stat(anotherUri)` returns the meta data for a
		 * file.
		 */
		export const fs2: FileSystem2;
	}
}
