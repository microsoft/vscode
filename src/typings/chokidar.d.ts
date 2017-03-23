/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'chokidar' {

	/**
	 *  takes paths to be watched recursively and options
	 */
	export function watch(paths: string, options: IOptions): FSWatcher;

	export interface IOptions {

		/**
		 * (regexp or function) files to be ignored. This function or regexp is tested against the whole path, not just filename.
		 * If it is a function with two arguments, it gets called twice per path - once with a single argument (the path), second time with two arguments (the path and the fs.Stats object of that path).
		 */
		ignored?: any;

		/**
		 * (default: false). Indicates whether the process should continue to run as long as files are being watched.
		 */
		persistent?: boolean;

		/**
		 * (default: false). Indicates whether to watch files that don't have read permissions.
		 */
		ignorePermissionErrors?: boolean;

		/**
		 * (default: false). Indicates whether chokidar should ignore the initial add events or not.
		 */
		ignoreInitial?: boolean;

		/**
		 * (default: 100). Interval of file system polling.
		 */
		interval?: number;

		/**
		 * (default: 300). Interval of file system polling for binary files (see extensions in src/is-binary).
		 */
		binaryInterval?: number;

		/**
		 * (default: false on Windows, true on Linux and OS X). Whether to use fs.watchFile (backed by polling), or fs.watch. If polling leads to high CPU utilization, consider setting this to false.
		 */
		usePolling?: boolean;

		/**
		 * (default: true on OS X). Whether to use the fsevents watching interface if available. When set to true explicitly and fsevents is available this supercedes the usePolling setting. When set to false on OS X, usePolling: true becomes the default.
		 */
		useFsEvents?: boolean;

		/**
		 * (default: true). When false, only the symlinks themselves will be watched for changes instead of following the link references and bubbling events through the link's path.
		 */
		followSymlinks?: boolean;
	}

	export interface FSWatcher {

		add(fileDirOrGlob: string): void;
		add(filesDirsOrGlobs: Array<string>): void;

		unwatch(fileDirOrGlob: string): void;
		unwatch(filesDirsOrGlobs: Array<string>): void;

		/**
		 * Listen for an FS event. Available events: add, addDir, change, unlink, unlinkDir, error. Additionally all is available which gets emitted for every non-error event.
		 */
		on(event: string, clb: (type: string, path: string) => void): void;
		on(event: string, clb: (error: Error) => void): void;

		/**
		 * Removes all listeners from watched files.
		 */
		close(): void;

		options: IOptions;
	}
}