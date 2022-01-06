/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/3025

	export namespace workspace {

		/**
		 * Creates a file system watcher to be notified on file events (create, change, delete)
		 * depending on the configuration.
		 *
		 * By default, all opened {@link workspace.workspaceFolders workspace folders} will be watched
		 * for file changes recursively.
		 *
		 * Additional folders can be added for file watching by providing a {@link RelativePattern} with
		 * a `base` that is outside of any of the currently opened workspace folders. If the `pattern` is
		 * complex (e.g. contains `**` or path segments), the folder will be watched recursively and
		 * otherwise will be watched non-recursively (i.e. only changes to the top level hirarchy of the
		 * path will be reported).
		 *
		 * Providing a `string` as `globPattern` acts as convenience method for watching file events in
		 * all opened workspace folders. This method should be used if you only care about file events
		 * from the workspace and not from any other folder.
		 *
		 * Optionally, flags to ignore certain kinds of events can be provided.
		 *
		 * To stop listening to events the watcher must be disposed.
		 *
		 * *Note* that user configurable excludes (via `files.watcherExclude`) may be applied to all file
		 * events to reduce the number of events for known folders with lots of changes (such as `node_modules`).
		 *
		 * *Note* that symbolic links are not automatically followed for file watching unless the path to
		 * watch itself is a symbolic link.
		 *
		 * *Note* that file changes for the path to be watched may not be delivered when the path itself
		 * changes. For example, when watching a path `/Users/somename/Desktop` for changes and the path
		 * itself is being deleted, the watcher may not report an event and may not work anymore from that
		 * moment on. If you are interested in being notified when the watched path itself is being deleted,
		 * you have to watch it's parent folder.
		 *
		 * ### Examples
		 *
		 * The basic anatomy of a file watcher is as follows:
		 *
		 * ```ts
		 * const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(<folder>, <pattern>));
		 *
		 * watcher.onDidChange(uri => { ...handle change... });
		 * watcher.onDidCreate(uri => { ...handle create... });
		 * watcher.onDidDelete(uri => { ...handle delete... });
		 *
		 * watcher.dispose(); // dispose after usage
		 * ```
		 *
		 * #### Workspace file watching
		 *
		 * If you only care about file events in a specific workspace folder:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**​/*.js'));
		 * ```
		 *
		 * *Note:* the array of workspace folders can be empy if no workspace is opened (empty window).
		 *
		 * #### Out of workspace file watching
		 *
		 * To watch a folder for changes to *.js files outside the workspace (non recursively), pass in a `Uri` to such
		 * a folder:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(<path to folder outside workspace>), '*.js'));
		 * ```
		 *
		 * And use a complex glob pattern to watch recursively:
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(<path to folder outside workspace>), '**​/*.js'));
		 * ```
		 *
		 * #### Global file watching
		 *
		 * If you do not care about the origin of file events, pass in a glob pattern as `string` to be notified about any file event
		 * that we have watchers registered for. This includes:
		 * - all workspace folders
		 * - all visible editors that have files opened that are not part of the workspace
		 * - any file watcher that was installed via `createFileSystemWatcher` by any extension
		 *
		 * ```ts
		 * vscode.workspace.createFileSystemWatcher('**​/*.js'));
		 * ```
		 *
		 * @param globPattern A {@link GlobPattern glob pattern} that controls which file events the watcher should report.
		 * @param ignoreCreateEvents Ignore when files have been created.
		 * @param ignoreChangeEvents Ignore when files have been changed.
		 * @param ignoreDeleteEvents Ignore when files have been deleted.
		 * @return A new file system watcher instance. Must be disposed when no longer needed.
		 */
		export function createFileSystemWatcher(globPattern: GlobPattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher;
	}
}
