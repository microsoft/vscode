/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export namespace window {
		export function sampleFunction(): Thenable<any>;
	}

	//#region Joh: file system provider (OLD)

	export enum FileChangeType {
		Updated = 0,
		Added = 1,
		Deleted = 2
	}

	export interface FileChange {
		type: FileChangeType;
		resource: Uri;
	}

	export enum FileType {
		File = 0,
		Dir = 1,
		Symlink = 2
	}

	export interface FileStat {
		id: number | string;
		mtime: number;
		// atime: number;
		size: number;
		type: FileType;
	}

	// todo@joh discover files etc
	// todo@joh CancellationToken everywhere
	// todo@joh add open/close calls?
	export interface FileSystemProvider {

		readonly onDidChange?: Event<FileChange[]>;

		// more...
		// @deprecated - will go away
		utimes(resource: Uri, mtime: number, atime: number): Thenable<FileStat>;

		stat(resource: Uri): Thenable<FileStat>;

		read(resource: Uri, offset: number, length: number, progress: Progress<Uint8Array>): Thenable<number>;

		// todo@joh - have an option to create iff not exist
		// todo@remote
		// offset - byte offset to start
		// count - number of bytes to write
		// Thenable<number> - number of bytes actually written
		write(resource: Uri, content: Uint8Array): Thenable<void>;

		// todo@remote
		// Thenable<FileStat>
		move(resource: Uri, target: Uri): Thenable<FileStat>;

		// todo@remote
		// helps with performance bigly
		// copy?(from: Uri, to: Uri): Thenable<void>;

		// todo@remote
		// Thenable<FileStat>
		mkdir(resource: Uri): Thenable<FileStat>;

		readdir(resource: Uri): Thenable<[Uri, FileStat][]>;

		// todo@remote
		// ? merge both
		// ? recursive del
		rmdir(resource: Uri): Thenable<void>;
		unlink(resource: Uri): Thenable<void>;

		// todo@remote
		// create(resource: Uri): Thenable<FileStat>;
	}

	export type DeprecatedFileChangeType = FileChangeType;
	export type DeprecatedFileType = FileType;
	export type DeprecatedFileChange = FileChange;
	export type DeprecatedFileStat = FileStat;
	export type DeprecatedFileSystemProvider = FileSystemProvider;

	export namespace workspace {
		export function registerDeprecatedFileSystemProvider(scheme: string, provider: DeprecatedFileSystemProvider): Disposable;
		export function registerFileSystemProvider(scheme: string, provider: FileSystemProvider, newProvider?: FileSystemProvider2): Disposable;
	}

	//#endregion

	//#region Joh: file system provider (new)

	/**
	 *
	 */
	export class FileSystemError extends Error {

		static EntryExists(message?: string): FileSystemError;
		static EntryNotFound(message?: string): FileSystemError;
		static EntryNotADirectory(message?: string): FileSystemError;
		static EntryIsADirectory(message?: string): FileSystemError;

		constructor(message?: string);
	}

	export enum FileChangeType2 {
		Changed = 1,
		Created = 2,
		Deleted = 3,
	}

	export interface FileChange2 {
		type: FileChangeType2;
		uri: Uri;
	}

	export interface FileStat2 {
		isFile: boolean;
		isDirectory: boolean;
		isSymbolicLink: boolean;
		mtime: number;
		size: number;
	}

	/**
	 *
	 */
	export interface FileOptions {

		/**
		 * Create a file when it doesn't exists
		 */
		create?: boolean;

		/**
		 * In combination with [`create`](FileOptions.create) but
		 * the operation should fail when a file already exists.
		 */
		exclusive?: boolean;

		/**
		 * Open a file for reading.
		 */
		read?: boolean;

		/**
		 * Open a file for writing.
		 */
		write?: boolean;
	}

	/**
	 *
	 */
	export interface FileSystemProvider2 {

		_version: 9;

		/**
		 * An event to signal that a resource has been created, changed, or deleted. This
		 * event should fire for resources that are being [watched](#FileSystemProvider2.watch)
		 * by clients of this provider.
		 */
		readonly onDidChangeFile: Event<FileChange2[]>;

		/**
		 * Subscribe to events in the file or folder denoted by `uri`.
		 * @param uri
		 * @param options
		 */
		watch(uri: Uri, options: { recursive?: boolean; excludes?: string[] }): Disposable;

		/**
		 * Retrieve metadata about a file. Throw an [`EntryNotFound`](#FileError.EntryNotFound)-error
		 * in case the file does not exist.
		 *
		 * @param uri The uri of the file to retrieve meta data about.
		 * @param token A cancellation token.
		 * @return The file metadata about the file.
		 */
		stat(uri: Uri, options: { /*future: followSymlinks*/ }, token: CancellationToken): FileStat2 | Thenable<FileStat2>;

		/**
		 * Retrieve the meta data of all entries of a [directory](#FileType2.Directory)
		 *
		 * @param uri The uri of the folder.
		 * @param token A cancellation token.
		 * @return A thenable that resolves to an array of tuples of file names and files stats.
		 */
		readDirectory(uri: Uri, options: { /*future: onlyType?*/ }, token: CancellationToken): [string, FileStat2][] | Thenable<[string, FileStat2][]>;

		/**
		 * Create a new directory. *Note* that new files are created via `write`-calls.
		 *
		 * @param uri The uri of the *new* folder.
		 * @param token A cancellation token.
		 */
		createDirectory(uri: Uri, options: { /*future: permissions?*/ }, token: CancellationToken): FileStat2 | Thenable<FileStat2>;

		/**
		 * Read the entire contents of a file.
		 *
		 * @param uri The uri of the file.
		 * @param token A cancellation token.
		 * @return A thenable that resolves to an array of bytes.
		 */
		readFile(uri: Uri, options: FileOptions, token: CancellationToken): Uint8Array | Thenable<Uint8Array>;

		/**
		 * Write data to a file, replacing its entire contents.
		 *
		 * @param uri The uri of the file.
		 * @param content The new content of the file.
		 * @param token A cancellation token.
		 */
		writeFile(uri: Uri, content: Uint8Array, options: FileOptions, token: CancellationToken): void | Thenable<void>;

		/**
		 * Delete a file or folder from the underlying storage.
		 *
		 * @param uri The resource that is to be deleted
		 * @param options Options bag for future use
		 * @param token A cancellation token.
		 */
		delete(uri: Uri, options: { /*future: useTrash?, followSymlinks?*/ }, token: CancellationToken): void | Thenable<void>;

		/**
		 * Rename a file or folder.
		 *
		 * @param oldUri The existing file or folder.
		 * @param newUri The target location.
		 * @param token A cancellation token.
		 */
		rename(oldUri: Uri, newUri: Uri, options: FileOptions, token: CancellationToken): FileStat2 | Thenable<FileStat2>;

		/**
		 * Copy files or folders. Implementing this function is optional but it will speedup
		 * the copy operation.
		 *
		 * @param uri The existing file or folder.
		 * @param target The target location.
		 * @param token A cancellation token.
		 */
		copy?(uri: Uri, target: Uri, options: FileOptions, token: CancellationToken): FileStat2 | Thenable<FileStat2>;
	}

	export namespace workspace {
		export function registerFileSystemProvider2(scheme: string, provider: FileSystemProvider2, options: { isCaseSensitive?: boolean }): Disposable;
	}

	//#endregion

	//#region Joh: remote, search provider

	export interface TextSearchQuery {
		pattern: string;
		isRegExp?: boolean;
		isCaseSensitive?: boolean;
		isWordMatch?: boolean;
	}

	export interface TextSearchOptions {
		includes: GlobPattern[];
		excludes: GlobPattern[];
	}

	export interface TextSearchResult {
		uri: Uri;
		range: Range;
		preview: { leading: string, matching: string, trailing: string };
	}

	export interface SearchProvider {
		provideFileSearchResults?(query: string, progress: Progress<Uri>, token: CancellationToken): Thenable<void>;
		provideTextSearchResults?(query: TextSearchQuery, options: TextSearchOptions, progress: Progress<TextSearchResult>, token: CancellationToken): Thenable<void>;
	}

	export namespace workspace {
		export function registerSearchProvider(scheme: string, provider: SearchProvider): Disposable;
	}

	//#endregion

	//#region Joao: diff command

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

	//#endregion

	//#region Joh: decorations

	//todo@joh -> make class
	export interface DecorationData {
		priority?: number;
		title?: string;
		bubble?: boolean;
		abbreviation?: string;
		color?: ThemeColor;
		source?: string;
	}

	export interface SourceControlResourceDecorations {
		source?: string;
		letter?: string;
		color?: ThemeColor;
	}

	export interface DecorationProvider {
		onDidChangeDecorations: Event<undefined | Uri | Uri[]>;
		provideDecoration(uri: Uri, token: CancellationToken): ProviderResult<DecorationData>;
	}

	export namespace window {
		export function registerDecorationProvider(provider: DecorationProvider): Disposable;
	}

	//#endregion

	//#region André: debug

	/**
	 * Represents a debug adapter executable and optional arguments passed to it.
	 */
	export class DebugAdapterExecutable {
		/**
		 * The command path of the debug adapter executable.
		 * A command must be either an absolute path or the name of an executable looked up via the PATH environment variable.
		 * The special value 'node' will be mapped to VS Code's built-in node runtime.
		 */
		readonly command: string;

		/**
		 * Optional arguments passed to the debug adapter executable.
		 */
		readonly args: string[];

		/**
		 * Create a new debug adapter specification.
		 */
		constructor(command: string, args?: string[]);
	}

	export interface DebugConfigurationProvider {
		/**
		 * This optional method is called just before a debug adapter is started to determine its excutable path and arguments.
		 * Registering more than one debugAdapterExecutable for a type results in an error.
		 * @param folder The workspace folder from which the configuration originates from or undefined for a folderless setup.
		 * @param token A cancellation token.
		 * @return a [debug adapter's executable and optional arguments](#DebugAdapterExecutable) or undefined.
		 */
		debugAdapterExecutable?(folder: WorkspaceFolder | undefined, token?: CancellationToken): ProviderResult<DebugAdapterExecutable>;
	}

	//#endregion

	//#region Rob, Matt: logging

	/**
	 * The severity level of a log message
	 */
	export enum LogLevel {
		Trace = 1,
		Debug = 2,
		Info = 3,
		Warning = 4,
		Error = 5,
		Critical = 6,
		Off = 7
	}

	/**
	 * A logger for writing to an extension's log file, and accessing its dedicated log directory.
	 */
	export interface Logger {
		trace(message: string, ...args: any[]): void;
		debug(message: string, ...args: any[]): void;
		info(message: string, ...args: any[]): void;
		warn(message: string, ...args: any[]): void;
		error(message: string | Error, ...args: any[]): void;
		critical(message: string | Error, ...args: any[]): void;
	}

	export interface ExtensionContext {
		/**
		 * This extension's logger
		 */
		logger: Logger;

		/**
		 * Path where an extension can write log files.
		 *
		 * Extensions must create this directory before writing to it. The parent directory will always exist.
		 */
		readonly logDirectory: string;
	}

	export namespace env {
		/**
		 * Current logging level.
		 *
		 * @readonly
		 */
		export const logLevel: LogLevel;
	}

	//#endregion

	//#region Joao: SCM validation

	/**
	 * Represents the validation type of the Source Control input.
	 */
	export enum SourceControlInputBoxValidationType {

		/**
		 * Something not allowed by the rules of a language or other means.
		 */
		Error = 0,

		/**
		 * Something suspicious but allowed.
		 */
		Warning = 1,

		/**
		 * Something to inform about but not a problem.
		 */
		Information = 2
	}

	export interface SourceControlInputBoxValidation {

		/**
		 * The validation message to display.
		 */
		readonly message: string;

		/**
		 * The validation type.
		 */
		readonly type: SourceControlInputBoxValidationType;
	}

	/**
	 * Represents the input box in the Source Control viewlet.
	 */
	export interface SourceControlInputBox {

		/**
		 * A validation function for the input box. It's possible to change
		 * the validation provider simply by setting this property to a different function.
		 */
		validateInput?(value: string, cursorPosition: number): ProviderResult<SourceControlInputBoxValidation | undefined | null>;
	}

	//#endregion

	//#region Matt: WebView Serializer

	/**
	 * Save and restore webview panels that have been persisted when vscode shuts down.
	 */
	interface WebviewPanelSerializer {
		/**
		 * Save a webview panel's `state`.
		 *
		 * Called before shutdown. Extensions have a 250ms timeframe to return a state. If serialization
		 * takes longer than 250ms, the panel will not be serialized.
		 *
		 * @param webviewPanel webview Panel to serialize. May or may not be visible.
		 *
		 * @returns JSON serializable state blob.
		 */
		serializeWebviewPanel(webviewPanel: WebviewPanel): Thenable<any>;

		/**
		 * Restore a webview panel from its seriailzed `state`.
		 *
		 * Called when a serialized webview first becomes visible.
		 *
		 * @param webviewPanel Webview panel to restore. The serializer should take ownership of this panel.
		 * @param state Persisted state.
		 *
		 * @return Thanble indicating that the webview has been fully restored.
		 */
		deserializeWebviewPanel(webviewPanel: WebviewPanel, state: any): Thenable<void>;
	}

	namespace window {
		/**
		 * Registers a webview panel serializer.
		 *
		 * Extensions that support reviving should have an `"onView:viewType"` activation method and
		 * make sure that [registerWebviewPanelSerializer](#registerWebviewPanelSerializer) is called during activation.
		 *
		 * Only a single serializer may be registered at a time for a given `viewType`.
		 *
		 * @param viewType Type of the webview panel that can be serialized.
		 * @param reviver Webview serializer.
		 */
		export function registerWebviewPanelSerializer(viewType: string, reviver: WebviewPanelSerializer): Disposable;
	}

	//#endregion

	//#region Tasks

	/**
	 * An object representing an executed Task. It can be used
	 * to terminate a task.
	 *
	 * This interface is not intended to be implemented.
	 */
	export interface TaskExecution {
		/**
		 * The task that got started.
		 */
		task: Task;

		/**
		 * Terminates the task execution.
		 */
		terminate(): void;
	}

	/**
	 * An event signaling the start of a task execution.
	 *
	 * This interface is not intended to be implemented.
	 */
	interface TaskStartEvent {
		/**
		 * The task item representing the task that got started.
		 */
		execution: TaskExecution;
	}

	/**
	 * An event signaling the end of an executed task.
	 *
	 * This interface is not intended to be implemented.
	 */
	interface TaskEndEvent {
		/**
		 * The task item representing the task that finished.
		 */
		execution: TaskExecution;
	}

	export interface TaskFilter {
		/**
		 * The task version as used in the tasks.json file.
		 * The string support the package.json semver notation.
		 */
		version?: string;

		/**
		 * The task type to return;
		 */
		type?: string;
	}

	export namespace workspace {

		/**
		 * Fetches all task available in the systems. Thisweweb includes tasks
		 * from `tasks.json` files as well as tasks from task providers
		 * contributed through extensions.
		 *
		 * @param filter a filter to filter the return tasks.
		 */
		export function fetchTasks(filter?: TaskFilter): Thenable<Task[]>;

		/**
		 * Executes a task that is managed by VS Code. The returned
		 * task execution can be used to terminate the task.
		 *
		 * @param task the task to execute
		 */
		export function executeTask(task: Task): Thenable<TaskExecution>;

		/**
		 * The currently active task executions or an empty array.
		 *
		 * @readonly
		 */
		export let taskExecutions: TaskExecution[];

		/**
		 * Fires when a task starts.
		 */
		export const onDidStartTask: Event<TaskStartEvent>;

		/**
		 * Fires when a task ends.
		 */
		export const onDidEndTask: Event<TaskEndEvent>;
	}

	//#endregion

	//#region Terminal

	export interface Terminal {
		onData: Event<string>;
	}

	export namespace window {
		/**
		 * The currently active terminals or an empty array.
		 *
		 * @readonly
		 */
		export let terminals: Terminal[];

		/**
		 * An [event](#Event) which fires when a terminal has been created, either through the
		 * [createTerminal](#window.createTerminal) API or commands.
		 */
		export const onDidOpenTerminal: Event<Terminal>;
	}

	//#endregion

	//#region URLs

	export interface ExternalUriHandler {
		handleExternalUri(uri: Uri): void;
	}

	export namespace window {

		/**
		 * Registers a protocol handler capable of handling system-wide URIs.
		 */
		export function registerExternalUriHandler(handler: ExternalUriHandler): Disposable;
	}

	//#endregion
}
