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

	export enum DeprecatedFileChangeType {
		Updated = 0,
		Added = 1,
		Deleted = 2
	}
	export interface DeprecatedFileChange {
		type: DeprecatedFileChangeType;
		resource: Uri;
	}
	export enum DeprecatedFileType {
		File = 0,
		Dir = 1,
		Symlink = 2
	}
	export interface DeprecatedFileStat {
		id: number | string;
		mtime: number;
		size: number;
		type: DeprecatedFileType;
	}
	export interface DeprecatedFileSystemProvider {
		readonly onDidChange?: Event<DeprecatedFileChange[]>;
		utimes(resource: Uri, mtime: number, atime: number): Thenable<DeprecatedFileStat>;
		stat(resource: Uri): Thenable<DeprecatedFileStat>;
		read(resource: Uri, offset: number, length: number, progress: Progress<Uint8Array>): Thenable<number>;
		write(resource: Uri, content: Uint8Array): Thenable<void>;
		move(resource: Uri, target: Uri): Thenable<DeprecatedFileStat>;
		mkdir(resource: Uri): Thenable<DeprecatedFileStat>;
		readdir(resource: Uri): Thenable<[Uri, DeprecatedFileStat][]>;
		rmdir(resource: Uri): Thenable<void>;
		unlink(resource: Uri): Thenable<void>;
	}
	export namespace workspace {
		export function registerDeprecatedFileSystemProvider(scheme: string, provider: DeprecatedFileSystemProvider): Disposable;
	}

	//#endregion

	//#region Joh: remote, search provider

	export interface TextSearchQuery {
		pattern: string;
		isRegExp?: boolean;
		isCaseSensitive?: boolean;
		isWordMatch?: boolean;
	}

	export interface SearchOptions {
		folder: Uri;
		includes: string[]; // paths relative to folder
		excludes: string[];
		useIgnoreFiles?: boolean;
		followSymlinks?: boolean;
		previewOptions?: any; // total length? # of context lines? leading and trailing # of chars?
	}

	export interface TextSearchOptions extends SearchOptions {
		maxFileSize?: number;
		encoding?: string;
	}

	export interface FileSearchOptions extends SearchOptions { }

	export interface TextSearchResult {
		uri: Uri;
		range: Range;

		// For now, preview must be a single line of text
		preview: { text: string, match: Range };
	}

	export interface SearchProvider {
		provideFileSearchResults?(options: FileSearchOptions, progress: Progress<Uri>, token: CancellationToken): Thenable<void>;
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
	 * Restore webview panels that have been persisted when vscode shuts down.
	 */
	interface WebviewPanelSerializer {
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
	 * An event signaling the start of a process execution
	 * triggered through a task
	 */
	export interface TaskProcessStartEvent {

		/**
		 * The task execution for which the process got started.
		 */
		execution: TaskExecution;

		/**
		 * The underlying process id.
		 */
		processId: number;
	}

	/**
	 * An event signaling the end of a process execution
	 * triggered through a task
	 */
	export interface TaskProcessEndEvent {

		/**
		 * The task execution for which the process got started.
		 */
		execution: TaskExecution;

		/**
		 * The process's exit code.
		 */
		exitCode: number;
	}

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
		 * Fires when the underlying process has been started.
		 * This event might not fire for tasks that don't
		 * execute an underlying process.
		 */
		onDidStartProcess: Event<TaskProcessStartEvent>;

		/**
		 * Fires when the underlying process has ended.
		 * This event might not fire for tasks that don't
		 * execute an underlying process.
		 */
		onDidEndProcess: Event<TaskProcessEndEvent>;

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
		 * Fetches all tasks available in the systems. This includes tasks
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
		export let taskExecutions: ReadonlyArray<TaskExecution>;

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
		/**
		 * Fires when the terminal's pty slave pseudo-device is written to. In other words, this
		 * provides access to the raw data stream from the process running within the terminal,
		 * including ANSI sequences.
		 */
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

	export interface ProtocolHandler {
		handleUri(uri: Uri): void;
	}

	export namespace window {

		/**
		 * Registers a protocol handler capable of handling system-wide URIs.
		 */
		export function registerProtocolHandler(handler: ProtocolHandler): Disposable;
	}

	//#endregion

	//#region Joh: hierarchical document symbols, https://github.com/Microsoft/vscode/issues/34968

	export class HierarchicalSymbolInformation {
		name: string;
		kind: SymbolKind;
		detail: string;
		location: Location;
		range: Range;
		children: HierarchicalSymbolInformation[];

		constructor(name: string, detail: string, kind: SymbolKind, location: Location, range: Range);
	}

	export interface DocumentSymbolProvider {
		provideDocumentSymbols(document: TextDocument, token: CancellationToken): ProviderResult<HierarchicalSymbolInformation[] | SymbolInformation[]>;
	}

	//#endregion

	//#region Joh -> exclusive document filters

	export interface DocumentFilter {
		exclusive?: boolean;
	}

	//#endregion

	//#region Multi-step input

	export namespace window {

		/**
		 * Collect multiple inputs from the user. The provided handler will be called with a
		 * [`QuickInput`](#QuickInput) that should be used to control the UI.
		 *
		 * @param handler The callback that will collect the inputs.
		 */
		export function multiStepInput<T>(handler: (input: QuickInput, token: CancellationToken) => Thenable<T>, token?: CancellationToken): Thenable<T>;
	}

	/**
	 * Controls the UI within a multi-step input session. The handler passed to [`window.multiStepInput`](#window.multiStepInput)
	 * should use the instance of this interface passed to it to collect all inputs.
	 */
	export interface QuickInput {
		showQuickPick: typeof window.showQuickPick;
		showInputBox: typeof window.showInputBox;
	}

	//#endregion
}
