/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/169724 @bpasero

declare module 'vscode' {

	export interface FileSystemWatcherOptions {

		/**
		 * Ignore when files have been created.
		 */
		readonly ignoreCreateEvents?: boolean;

		/**
		 * Ignore when files have been changed.
		 */
		readonly ignoreChangeEvents?: boolean;

		/**
		 * Ignore when files have been deleted.
		 */
		readonly ignoreDeleteEvents?: boolean;

		/**
		 * An optional set of glob patterns to exclude from watching.
		 * Glob patterns are always matched relative to the watched folder.
		 */
		readonly excludes?: string[];
	}

	export namespace workspace {

		export function createFileSystemWatcher(pattern: RelativePattern, options?: FileSystemWatcherOptions): FileSystemWatcher;
	}
}
