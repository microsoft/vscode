/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/3025

	export interface FileSystem {

		/**
		 * Subscribe to file change events in the file or folder denoted by `uri` provided that
		 * the file or folder is outside the currently opened workspace where file watching is
		 * enabled by default.
		 *
		 * File events will be delivered via {@linkcode workspace.createFileSystemWatcher createFileSystemWatcher}.
		 *
		 * For folders, the option `recursive` indicates whether subfolders, sub-subfolders, etc.
		 * should be watched for file changes as well.
		 *
		 * The `excludes` array is used to indicate paths that should be excluded from file
		 * watching. Each entry can be be:
		 * - the absolute path to exclude
		 * - a relative path to exclude (for example `build/output`)
		 * - a simple glob pattern (for example `**\build`, `output/**`)
		 *
		 * @param uri The uri of the file or folder to be watched.
		 * @param options Configures the watch.
		 * @returns A disposable that tells the provider to stop watching the `uri`.
		 */
		watch(uri: Uri, options?: { recursive: boolean; excludes: string[] }): Disposable;
	}
}
