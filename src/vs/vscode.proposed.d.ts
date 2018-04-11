/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export namespace window {
		export function sampleFunction(): Thenable<any>;
	}

	//#region Aeschli: folding

	export class FoldingRangeList {

		/**
		 * The folding ranges.
		 */
		ranges: FoldingRange[];

		/**
		 * Creates new folding range list.
		 *
		 * @param ranges The folding ranges
		 */
		constructor(ranges: FoldingRange[]);
	}


	export class FoldingRange {

		/**
		 * The start line number (zero-based) of the range to fold. The hidden area starts after the last character of that line.
		 */
		startLine: number;

		/**
		 * The end line number (0-based) of the range to fold. The hidden area ends at the last character of that line.
		 */
		endLine: number;

		/**
		 * The actual color value for this color range.
		 */
		type?: FoldingRangeType | string;

		/**
		 * Creates a new folding range.
		 *
		 * @param startLineNumber The first line of the fold
		 * @param type The last line of the fold
		 */
		constructor(startLineNumber: number, endLineNumber: number, type?: FoldingRangeType | string);
	}

	export enum FoldingRangeType {
		/**
		 * Folding range for a comment
		 */
		Comment = 'comment',
		/**
		 * Folding range for a imports or includes
		 */
		Imports = 'imports',
		/**
		 * Folding range for a region (e.g. `#region`)
		 */
		Region = 'region'
	}

	export namespace languages {

		/**
		 * Register a folding provider.
		 *
		 * Multiple folding can be registered for a language. In that case providers are sorted
		 * by their [score](#languages.match) and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A folding provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerFoldingProvider(selector: DocumentSelector, provider: FoldingProvider): Disposable;
	}

	export interface FoldingContext {
		maxRanges?: number;
	}

	export interface FoldingProvider {
		/**
		 * Returns a list of folding ranges or null if the provider does not want to participate or was cancelled.
		 */
		provideFoldingRanges(document: TextDocument, context: FoldingContext, token: CancellationToken): ProviderResult<FoldingRangeList>;
	}

	//#endregion

	//#region Joh: file system provider

	// export enum FileErrorCodes {
	// 	/**
	// 	 * Not owner.
	// 	 */
	// 	EPERM = 1,
	// 	/**
	// 	 * No such file or directory.
	// 	 */
	// 	ENOENT = 2,
	// 	/**
	// 	 * I/O error.
	// 	 */
	// 	EIO = 5,
	// 	/**
	// 	 * Permission denied.
	// 	 */
	// 	EACCES = 13,
	// 	/**
	// 	 * File exists.
	// 	 */
	// 	EEXIST = 17,
	// 	/**
	// 	 * Not a directory.
	// 	 */
	// 	ENOTDIR = 20,
	// 	/**
	// 	 * Is a directory.
	// 	 */
	// 	EISDIR = 21,
	// 	/**
	// 	 *  File too large.
	// 	 */
	// 	EFBIG = 27,
	// 	/**
	// 	 * No space left on device.
	// 	 */
	// 	ENOSPC = 28,
	// 	/**
	// 	 * Directory is not empty.
	// 	 */
	// 	ENOTEMPTY = 66,
	// 	/**
	// 	 * Invalid file handle.
	// 	 */
	// 	ESTALE = 70,
	// 	/**
	// 	 * Illegal NFS file handle.
	// 	 */
	// 	EBADHANDLE = 10001,
	// }

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

	export enum FileChangeType2 {
		Changed = 1,
		Created = 2,
		Deleted = 3,
	}

	export interface FileChange2 {
		type: FileChangeType2;
		resource: Uri;
	}

	export enum FileType2 {
		File = 0b001,
		Directory = 0b010,
		SymbolicLink = 0b100,
	}

	export interface FileStat2 {
		type: FileType2;
		mtime: number;
		size: number;
	}


	// todo@joh discover files etc
	// todo@joh add open/close calls?
	export interface FileSystemProvider2 {

		_version: 4;

		/**
		 * An event to signal that a resource has been created, changed, or deleted.
		 */
		readonly onDidChange: Event<FileChange2[]>;

		/**
		 * Retrieve meta data about a file.
		 *
		 * @param uri The uri of the file to retrieve meta data about.
		 * @param token A cancellation token.
		 */
		// todo@remote
		// ! throw error (ENOENT) when the file doesn't exist
		stat(uri: Uri, token: CancellationToken): Thenable<FileStat2>;

		/**
		 * Retrieve the meta data of all entries of a [directory](#FileType2.Directory)
		 *
		 * @param uri The uri of the folder.
		 * @param token A cancellation token.
		 * @return A thenable that resolves to an array of tuples of file names and files stats.
		 */
		readDirectory(uri: Uri, token: CancellationToken): Thenable<[string, FileStat2][]>;

		/**
		 * Read the entire contents of a file.
		 *
		 * @param uri The uri of the file.
		 * @param token A cancellation token.
		 * @return A thenable that resolves to an array of bytes.
		 */
		readFile(uri: Uri, token: CancellationToken): Thenable<Uint8Array>;

		/**
		 * Write data to a file, replacing its entire contents.
		 *
		 * @param uri The uri of the file.
		 * @param content The new content of the file.
		 * @param token A cancellation token.
		 */
		writeFile(uri: Uri, content: Uint8Array, token: CancellationToken): Thenable<void>;

		/**
		 * Rename a file or folder.
		 *
		 * @param oldUri The exiting file or folder
		 * @param newUri The target location
		 * @param token A cancellation token.
		 */
		rename(oldUri: Uri, newUri: Uri, token: CancellationToken): Thenable<FileStat2>;

		// todo@remote
		// helps with performance bigly
		// copy?(from: Uri, to: Uri): Thenable<FileStat2>;

		// todo@remote
		// ? useTrash, expose trash
		delete(uri: Uri, token: CancellationToken): Thenable<void>;

		// todo@remote
		create(uri: Uri, options: { type: FileType2 }, token: CancellationToken): Thenable<FileStat2>;
	}

	export namespace workspace {
		export function registerFileSystemProvider(scheme: string, provider: FileSystemProvider, newProvider?: FileSystemProvider2): Disposable;
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

	//#region Joh: rename context

	export interface RenameProvider2 extends RenameProvider {

		/**
		 * Optional function for resolving and validating a position at which rename is
		 * being carried out.
		 *
		 * @param document The document in which rename will be invoked.
		 * @param position The position at which rename will be invoked.
		 * @param token A cancellation token.
		 * @return The range of the identifier that is to be renamed. The lack of a result can signaled by returning `undefined` or `null`.
		 */
		resolveRenameLocation?(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Range>;

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

	//#region Matt: WebView

	/**
	 * Content settings for a webview.
	 */
	export interface WebviewOptions {
		/**
		 * Should scripts be enabled in the webview content?
		 *
		 * Defaults to false (scripts-disabled).
		 */
		readonly enableScripts?: boolean;

		/**
		 * Should command uris be enabled in webview content?
		 *
		 * Defaults to false.
		 */
		readonly enableCommandUris?: boolean;

		/**
		 * Should the find widget be enabled in the webview?
		 *
		 * Defaults to false.
		 */
		readonly enableFindWidget?: boolean;

		/**
		 * Should the webview's context be kept around even when the webview is no longer visible?
		 *
		 * Normally a webview's context is created when the webview becomes visible
		 * and destroyed when the webview is hidden. Apps that have complex state
		 * or UI can set the `retainContextWhenHidden` to make VS Code keep the webview
		 * context around, even when the webview moves to a background tab. When
		 * the webview becomes visible again, the context is automatically restored
		 * in the exact same state it was in originally.
		 *
		 * `retainContextWhenHidden` has a high memory overhead and should only be used if
		 * your webview's context cannot be quickly saved and restored.
		 */
		readonly retainContextWhenHidden?: boolean;

		/**
		 * Root paths from which the webview can load local (filesystem) resources using the `vscode-resource:` scheme.
		 *
		 * Default to the root folders of the current workspace plus the extension's install directory.
		 *
		 * Pass in an empty array to disallow access to any local resources.
		 */
		readonly localResourceRoots?: Uri[];
	}

	export interface WebviewOnDidChangeViewStateEvent {
		readonly viewColumn: ViewColumn;
		readonly active: boolean;
	}

	/**
	 * A webview displays html content, like an iframe.
	 */
	export interface Webview {
		/**
		 * The type of the webview, such as `'markdown.preview'`
		 */
		readonly viewType: string;

		/**
		 * Content settings for the webview.
		 */
		readonly options: WebviewOptions;

		/**
		 * Title of the webview shown in UI.
		 */
		title: string;

		/**
		 * Contents of the webview.
		 *
		 * Should be a complete html document.
		 */
		html: string;

		/**
		 * The column in which the webview is showing.
		 */
		readonly viewColumn?: ViewColumn;

		/**
		 * Fired when the webview content posts a message.
		 */
		readonly onDidReceiveMessage: Event<any>;

		/**
		 * Fired when the webview is disposed.
		 */
		readonly onDidDispose: Event<void>;

		/**
		 * Fired when the webview's view state changes.
		 */
		readonly onDidChangeViewState: Event<WebviewOnDidChangeViewStateEvent>;

		/**
		 * Post a message to the webview content.
		 *
		 * Messages are only develivered if the webview is visible.
		 *
		 * @param message Body of the message.
		 */
		postMessage(message: any): Thenable<boolean>;

		/**
		 * Shows the webview in a given column.
		 *
		 * A webview may only be in a single column at a time. If it is already showing, this
		 * command moves it to a new column.
		 */
		reveal(viewColumn: ViewColumn): void;

		/**
		 * Dispose of the the webview.
		 *
		 * This closes the webview if it showing and disposes of the resources owned by the webview.
		 * Webview are also disposed when the user closes the webview editor. Both cases fire `onDispose`
		 * event. Trying to use the webview after it has been disposed throws an exception.
		 */
		dispose(): any;
	}

	/**
	 * Save and restore webviews that have been persisted when vscode shuts down.
	 */
	interface WebviewSerializer {
		/**
		 * Save a webview's `state`.
		 *
		 * Called before shutdown. Webview may or may not be visible.
		 *
		 * @param webview Webview to serialize.
		 *
		 * @returns JSON serializable state blob.
		 */
		serializeWebview(webview: Webview): Thenable<any>;

		/**
		 * Restore a webview from its `state`.
		 *
		 * Called when a serialized webview first becomes active.
		 *
		 * @param webview Webview to restore. The serializer should take ownership of this webview.
		 * @param state Persisted state.
		 */
		deserializeWebview(webview: Webview, state: any): Thenable<void>;
	}

	namespace window {
		/**
		 * Create and show a new webview.
		 *
		 * @param viewType Identifies the type of the webview.
		 * @param title Title of the webview.
		 * @param column Editor column to show the new webview in.
		 * @param options Content settings for the webview.
		 */
		export function createWebview(viewType: string, title: string, column: ViewColumn, options: WebviewOptions): Webview;

		/**
		 * Registers a webview serializer.
		 *
		 * Extensions that support reviving should have an `"onView:viewType"` activation method and
		 * make sure that `registerWebviewSerializer` is called during activation.
		 *
		 * Only a single serializer may be registered at a time for a given `viewType`.
		 *
		 * @param viewType Type of the webview that can be serialized.
		 * @param reviver Webview serializer.
		 */
		export function registerWebviewSerializer(viewType: string, reviver: WebviewSerializer): Disposable;
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

	export namespace workspace {

		/**
		 * Fetches all task available in the systems. This includes tasks
		 * from `tasks.json` files as well as tasks from task providers
		 * contributed through extensions.
		 */
		export function fetchTasks(): Thenable<Task[]>;

		/**
		 * Executes a task that is managed by VS Code. The returned
		 * task execution can be used to terminate the task.
		 *
		 * @param task the task to execute
		 */
		export function executeTask(task: Task): Thenable<TaskExecution>;

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
}
