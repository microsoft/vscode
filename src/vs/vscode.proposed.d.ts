/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export class FoldingRangeList {

		/**
		 * The folding ranges.
		 */
		ranges: FoldingRange[];

		/**
		 * Creates mew folding range list.
		 *
		 * @param ranges The folding ranges
		 */
		constructor(ranges: FoldingRange[]);
	}


	export class FoldingRange {

		/**
		 * The start line number (0-based)
		 */
		startLine: number;

		/**
		 * The end line number (0-based)
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

	export interface TextSearchQuery {
		pattern: string;
		isRegex?: boolean;
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

	// todo@joh discover files etc
	// todo@joh CancellationToken everywhere
	// todo@joh add open/close calls?
	export interface FileSystemProvider {

		readonly onDidChange?: Event<FileChange[]>;

		// todo@joh - remove this
		readonly root?: Uri;

		// more...
		//
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

		// find files by names
		// todo@joh, move into its own provider
		findFiles?(query: string, progress: Progress<Uri>, token: CancellationToken): Thenable<void>;
		provideTextSearchResults?(query: TextSearchQuery, options: TextSearchOptions, progress: Progress<TextSearchResult>, token: CancellationToken): Thenable<void>;
	}

	export namespace workspace {
		export function registerFileSystemProvider(scheme: string, provider: FileSystemProvider): Disposable;

		/**
		 * This method replaces `deleteCount` [workspace folders](#workspace.workspaceFolders) starting at index `start`
		 * by an optional set of `workspaceFoldersToAdd` on the `vscode.workspace.workspaceFolders` array. This "splice"
		 * behavior can be used to add, remove and change workspace folders in a single operation.
		 *
		 * If the first workspace folder is added, removed or changed, the currently executing extensions (including the
		 * one that called this method) will be terminated and restarted so that the (deprecated) `rootPath` property is
		 * updated to point to the first workspace folder.
		 *
		 * Use the [`onDidChangeWorkspaceFolders()`](#onDidChangeWorkspaceFolders) event to get notified when the
		 * workspace folders have been updated.
		 *
		 * **Example:** adding a new workspace folder at the end of workspace folders
		 * ```typescript
		 * workspace.updateWorkspaceFolders(workspace.workspaceFolders ? workspace.workspaceFolders.length : 0, null, { uri: ...});
		 * ```
		 *
		 * **Example:** removing the first workspace folder
		 * ```typescript
		 * workspace.updateWorkspaceFolders(0, 1);
		 * ```
		 *
		 * **Example:** replacing an existing workspace folder with a new one
		 * ```typescript
		 * workspace.updateWorkspaceFolders(0, 1, { uri: ...});
		 * ```
		 *
		 * It is valid to remove an existing workspace folder and add it again with a different name
		 * to rename that folder.
		 *
		 * **Note:** it is not valid to call [updateWorkspaceFolders()](#updateWorkspaceFolders) multiple times
		 * without waiting for the [`onDidChangeWorkspaceFolders()`](#onDidChangeWorkspaceFolders) to fire.
		 *
		 * @param start the zero-based location in the list of currently opened [workspace folders](#WorkspaceFolder)
		 * from which to start deleting workspace folders.
		 * @param deleteCount the optional number of workspace folders to remove.
		 * @param workspaceFoldersToAdd the optional variable set of workspace folders to add in place of the deleted ones.
		 * Each workspace is identified with a mandatory URI and an optional name.
		 * @return true if the operation was successfully started and false otherwise if arguments were used that would result
		 * in invalid workspace folder state (e.g. 2 folders with the same URI).
		 */
		export function updateWorkspaceFolders(start: number, deleteCount: number, ...workspaceFoldersToAdd: { uri: Uri, name?: string }[]): boolean;
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

	//#region decorations

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
		readonly onDidChangeLogLevel: Event<LogLevel>;
		readonly currentLevel: LogLevel;
		readonly logDirectory: Thenable<string>;

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
	}

	export interface RenameInitialValue {
		range: Range;
		text?: string;
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

		export interface RenameProvider2 extends RenameProvider {
			resolveInitialRenameValue?(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<RenameInitialValue>;
		}
	}
	export interface FoldingProvider {
		provideFoldingRanges(document: TextDocument, token: CancellationToken): ProviderResult<FoldingRangeList>;
	}

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
		 * Should the webview content be kept arount even when the webview is no longer visible?
		 *
		 * Normally a webview content is created when the webview becomes visible
		 * and destroyed when the webview is hidden. Apps that have complex state
		 * or UI can set the `keepAlive` property to make VS Code keep the webview
		 * content around, even when the webview itself is no longer visible. When
		 * the webview becomes visible again, the content is automatically restored
		 * in the exact same state it was in originally
		 *
		 * `keepAlive` has a high memory overhead and should only be used if your
		 * webview content cannot be quickly saved and restored.
		 */
		readonly keepAlive?: boolean;

		/**
		 * Root paths from which the webview can load local (filesystem) resources using the `vscode-workspace-resource:` scheme.
		 *
		 * Default to the root folders of the current workspace.
		 *
		 * Pass in an empty array to disallow access to any local resources.
		 */
		readonly localResourceRoots?: Uri[];
	}

	/**
	 * A webview is an editor with html content, like an iframe.
	 */
	export interface Webview {
		/**
		 * Type identifying the editor as a webview editor.
		 */
		readonly editorType: 'webview';

		/**
		 * Unique identifer of the webview.
		 */
		readonly uri: Uri;

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
		readonly onMessage: Event<any>;

		/**
		 * Fired when the webview is disposed.
		 */
		readonly onDispose: Event<void>;

		/**
		 * Fired when the webview's view column changes.
		 */
		readonly onDidChangeViewColumn: Event<ViewColumn>;

		/**
		 * Post a message to the webview content.
		 *
		 * Messages are only develivered if the webview is visible.
		 *
		 * @param message Body of the message.
		 */
		postMessage(message: any): Thenable<boolean>;

		/**
		 * Dispose of the the webview.
		 *
		 * This closes the webview if it showing and disposes of the resources owned by the webview.
		 * Webview are also disposed when the user closes the webview editor. Both cases fire `onDispose`
		 * event. Trying to use the webview after it has been disposed throws an exception.
		 */
		dispose(): any;
	}

	export interface TextEditor {
		/**
		 * Type identifying the editor as a text editor.
		 */
		readonly editorType: 'texteditor';
	}

	namespace window {
		/**
		 * Create and show a new webview.
		 *
		 * @param uri Unique identifier for the webview.
		 * @param column Editor column to show the new webview in.
		 * @param options Content settings for the webview.
		 */
		export function createWebview(uri: Uri, column: ViewColumn, options: WebviewOptions): Webview;

		/**
		 * Event fired when the active editor changes.
		 */
		export const onDidChangeActiveEditor: Event<TextEditor | Webview | undefined>;
	}

	export namespace window {

		/**
		 * Register a [TreeDataProvider](#TreeDataProvider) for the view contributed using the extension point `views`.
		 * @param viewId Id of the view contributed using the extension point `views`.
		 * @param treeDataProvider A [TreeDataProvider](#TreeDataProvider) that provides tree data for the view
		 * @return handle to the [treeview](#TreeView) that can be disposable.
		 */
		export function registerTreeDataProvider<T>(viewId: string, treeDataProvider: TreeDataProvider<T>): TreeView<T>;

	}

	/**
	 * Represents a Tree view
	 */
	export interface TreeView<T> extends Disposable {

		/**
		 * Reveal an element. By default revealed element is selected.
		 *
		 * In order to not to select, set the option `donotSelect` to `true`.
		 *
		 * **NOTE:** [TreeDataProvider](#TreeDataProvider) is required to implement [getParent](#TreeDataProvider.getParent) method to access this API.
		 */
		reveal(element: T, options?: { donotSelect?: boolean }): Thenable<void>;
	}

	/**
	 * A data provider that provides tree data
	 */
	export interface TreeDataProvider<T> {
		/**
		 * An optional event to signal that an element or root has changed.
		 * This will trigger the view to update the changed element/root and its children recursively (if shown).
		 * To signal that root has changed, do not pass any argument or pass `undefined` or `null`.
		 */
		onDidChangeTreeData?: Event<T | undefined | null>;

		/**
		 * Get [TreeItem](#TreeItem) representation of the `element`
		 *
		 * @param element The element for which [TreeItem](#TreeItem) representation is asked for.
		 * @return [TreeItem](#TreeItem) representation of the element
		 */
		getTreeItem(element: T): TreeItem | Thenable<TreeItem>;

		/**
		 * Get the children of `element` or root if no element is passed.
		 *
		 * @param element The element from which the provider gets children. Can be `undefined`.
		 * @return Children of `element` or root if no element is passed.
		 */
		getChildren(element?: T): ProviderResult<T[]>;

		/**
		 * Optional method to return the parent of `element`.
		 * Return `null` or `undefined` if `element` is a child of root.
		 *
		 * **NOTE:** This method should be implemented in order to access [reveal](#TreeView.reveal) API.
		 *
		 * @param element The element for which the parent has to be returned.
		 * @return Parent of `element`.
		 */
		getParent?(element: T): ProviderResult<T>;
	}

	//#region TextEditor.visibleRange and related event

	export interface TextEditor {
		/**
		 * The current visible ranges in the editor (vertically).
		 * This accounts only for vertical scrolling, and not for horizontal scrolling.
		 */
		readonly visibleRanges: Range[];
	}

	/**
	 * Represents an event describing the change in a [text editor's visible ranges](#TextEditor.visibleRanges).
	 */
	export interface TextEditorVisibleRangesChangeEvent {
		/**
		 * The [text editor](#TextEditor) for which the visible ranges have changed.
		 */
		textEditor: TextEditor;
		/**
		 * The new value for the [text editor's visible ranges](#TextEditor.visibleRanges).
		 */
		visibleRanges: Range[];
	}

	export namespace window {
		/**
		 * An [event](#Event) which fires when the selection in an editor has changed.
		 */
		export const onDidChangeTextEditorVisibleRanges: Event<TextEditorVisibleRangesChangeEvent>;
	}

	//#endregion
}
