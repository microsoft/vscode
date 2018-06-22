/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

import { QuickPickItem } from 'vscode';

declare module 'vscode' {

	export namespace window {
		export function sampleFunction(): Thenable<any>;
	}

	//#region Joh: remote, search provider

	export interface TextSearchQuery {
		pattern: string;
		isRegExp: boolean;
		isCaseSensitive: boolean;
		isWordMatch: boolean;
	}

	export interface SearchOptions {
		folder: Uri;
		includes: string[]; // paths relative to folder
		excludes: string[];
		useIgnoreFiles?: boolean;
		followSymlinks?: boolean;
	}

	export interface TextSearchOptions extends SearchOptions {
		previewOptions?: any; // total length? # of context lines? leading and trailing # of chars?
		maxFileSize?: number;
		encoding?: string;
	}

	export interface FileSearchOptions extends SearchOptions { }

	export interface TextSearchResult {
		path: string;
		range: Range;

		// For now, preview must be a single line of text
		preview: { text: string, match: Range };
	}

	export interface SearchProvider {
		provideFileSearchResults?(options: FileSearchOptions, progress: Progress<string>, token: CancellationToken): Thenable<void>;
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
		 * This optional method is called just before a debug adapter is started to determine its executable path and arguments.
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

	//#region Comments
	/**
	 * Comments provider related APIs are still in early stages, they may be changed significantly during our API experiments.
	 */

	interface CommentInfo {
		threads: CommentThread[];
		commentingRanges?: Range[];
	}

	export enum CommentThreadCollapsibleState {
		/**
		 * Determines an item is collapsed
		 */
		Collapsed = 0,
		/**
		 * Determines an item is expanded
		 */
		Expanded = 1
	}

	interface CommentThread {
		threadId: string;
		resource: Uri;
		range: Range;
		comments: Comment[];
		collapsibleState?: CommentThreadCollapsibleState;
	}

	interface Comment {
		commentId: string;
		body: MarkdownString;
		userName: string;
		gravatar: string;
		command?: Command;
	}

	export interface CommentThreadChangedEvent {
		/**
		 * Added comment threads.
		 */
		readonly added: CommentThread[];

		/**
		 * Removed comment threads.
		 */
		readonly removed: CommentThread[];

		/**
		 * Changed comment threads.
		 */
		readonly changed: CommentThread[];
	}

	interface DocumentCommentProvider {
		provideDocumentComments(document: TextDocument, token: CancellationToken): Promise<CommentInfo>;
		createNewCommentThread?(document: TextDocument, range: Range, text: string, token: CancellationToken): Promise<CommentThread>;
		replyToCommentThread?(document: TextDocument, range: Range, commentThread: CommentThread, text: string, token: CancellationToken): Promise<CommentThread>;
		onDidChangeCommentThreads?: Event<CommentThreadChangedEvent>;
	}

	interface WorkspaceCommentProvider {
		provideWorkspaceComments(token: CancellationToken): Promise<CommentThread[]>;
		createNewCommentThread?(document: TextDocument, range: Range, text: string, token: CancellationToken): Promise<CommentThread>;
		replyToCommentThread?(document: TextDocument, range: Range, commentThread: CommentThread, text: string, token: CancellationToken): Promise<CommentThread>;

		onDidChangeCommentThreads?: Event<CommentThreadChangedEvent>;
	}

	namespace workspace {
		export function registerDocumentCommentProvider(provider: DocumentCommentProvider): Disposable;
		export function registerWorkspaceCommentProvider(provider: WorkspaceCommentProvider): Disposable;
	}
	//#endregion

	//#region Terminal

	export interface Terminal {
		/**
		 * Fires when the terminal's pty slave pseudo-device is written to. In other words, this
		 * provides access to the raw data stream from the process running within the terminal,
		 * including VT sequences.
		 */
		onData: Event<string>;
	}

	/**
	 * Represents the dimensions of a terminal.
	 */
	export interface TerminalDimensions {
		/**
		 * The number of columns in the terminal.
		 */
		cols: number;

		/**
		 * The number of rows in the terminal.
		 */
		rows: number;
	}

	/**
	 * Represents a terminal without a process where all interaction and output in the terminal is
	 * controlled by an extension. This is similar to an output window but has the same VT sequence
	 * compatility as the regular terminal.
	 *
	 * Note that an instance of [Terminal](#Terminal) will be created when a TerminalRenderer is
	 * created with all its APIs available for use by extensions. When using the Terminal object
	 * of a TerminalRenderer it acts just like normal only the extension that created the
	 * TerminalRenderer essentially acts as a process. For example when an
	 * [Terminal.onData](#Terminal.onData) listener is registered, that will fire when
	 * [TerminalRenderer.write](#TerminalRenderer.write) is called. Similarly when
	 * [Terminal.sendText](#Terminal.sendText) is triggered that will fire the
	 * [TerminalRenderer.onInput](#TerminalRenderer.onInput) event.
	 *
	 * **Example:** Create a terminal renderer, show it and write hello world in red
	 * ```typescript
	 * const renderer = window.createTerminalRenderer('foo');
	 * renderer.terminal.then(t => t.show());
	 * renderer.write('\x1b[31mHello world\x1b[0m');
	 * ```
	 */
	export interface TerminalRenderer {
		/**
		 * The name of the terminal, this will appear in the terminal selector.
		 */
		name: string;

		/**
		 * The dimensions of the terminal, the rows and columns of the terminal can only be set to
		 * a value smaller than the maximum value, if this is undefined the terminal will auto fit
		 * to the maximum value [maximumDimensions](TerminalRenderer.maximumDimensions).
		 *
		 * **Example:** Override the dimensions of a TerminalRenderer to 20 columns and 10 rows
		 * ```typescript
		 * terminalRenderer.dimensions = {
		 *   cols: 20,
		 *   rows: 10
		 * };
		 * ```
		 */
		dimensions: TerminalDimensions;

		/**
		 * The maximum dimensions of the terminal, this will be undefined immediately after a
		 * terminal renderer is created and also until the terminal becomes visible in the UI.
		 * Listen to [onDidChangeMaximumDimensions](TerminalRenderer.onDidChangeMaximumDimensions)
		 * to get notified when this value changes.
		 */
		readonly maximumDimensions: TerminalDimensions;

		/**
		 * The corressponding [Terminal](#Terminal) for this TerminalRenderer.
		 */
		readonly terminal: Thenable<Terminal>;

		/**
		 * Write text to the terminal. Unlike [Terminal.sendText](#Terminal.sendText) which sends
		 * text to the underlying _process_, this will write the text to the terminal itself.
		 *
		 * **Example:** Write red text to the terminal
		 * ```typescript
		 * terminalRenderer.write('\x1b[31mHello world\x1b[0m');
		 * ```
		 *
		 * **Example:** Move the cursor to the 10th row and 20th column and write an asterisk
		 * ```typescript
		 * terminalRenderer.write('\x1b[10;20H*');
		 * ```
		 *
		 * @param text The text to write.
		 */
		write(text: string): void;

		/**
		 * An event which fires on keystrokes in the terminal or when an extension calls
		 * [Terminal.sendText](#Terminal.sendText). Keystrokes are converted into their
		 * corresponding VT sequence representation.
		 *
		 * **Example:** Simulate interaction with the terminal from an outside extension or a
		 * workbench command such as `workbench.action.terminal.runSelectedText`
		 * ```typescript
		 * const terminalRenderer = window.createTerminalRenderer('test');
		 * terminalRenderer.onInput(data => {
		 *   cosole.log(data); // 'Hello world'
		 * });
		 * terminalRenderer.terminal.then(t => t.sendText('Hello world'));
		 * ```
		 */
		onInput: Event<string>;

		/**
		 * An event which fires when the [maximum dimensions](#TerminalRenderer.maimumDimensions) of
		 * the terminal renderer change.
		 */
		onDidChangeMaximumDimensions: Event<TerminalDimensions>;
	}

	export namespace window {
		/**
		 * The currently opened terminals or an empty array.
		 *
		 * @readonly
		 */
		export let terminals: Terminal[];

		/**
		 * The currently active terminal or `undefined`. The active terminal is the one that
		 * currently has focus or most recently had focus.
		 *
		 * @readonly
		 */
		export let activeTerminal: Terminal | undefined;

		/**
		 * An [event](#Event) which fires when the [active terminal](#window.activeTerminal)
		 * has changed. *Note* that the event also fires when the active editor changes
		 * to `undefined`.
		 */
		export const onDidChangeActiveTerminal: Event<Terminal | undefined>;

		/**
		 * An [event](#Event) which fires when a terminal has been created, either through the
		 * [createTerminal](#window.createTerminal) API or commands.
		 */
		export const onDidOpenTerminal: Event<Terminal>;

		/**
		 * Create a [TerminalRenderer](#TerminalRenderer).
		 *
		 * @param name The name of the terminal renderer, this shows up in the terminal selector.
		 */
		export function createTerminalRenderer(name: string): TerminalRenderer;
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

	//#region Joh -> exclusive document filters

	export interface DocumentFilter {
		exclusive?: boolean;
	}

	//#endregion

	//#region QuickInput API

	export namespace window {

		export const quickInputBackButton: QuickInputButton;

		export function createQuickPick<T extends QuickPickItem>(): QuickPick<T>;

		export function createInputBox(): InputBox;
	}

	export interface QuickInput {

		title: string | undefined;

		step: number | undefined;

		totalSteps: number | undefined;

		enabled: boolean;

		busy: boolean;

		ignoreFocusOut: boolean;

		show(): void;

		hide(): void;

		onDidHide: Event<void>;

		dispose(): void;
	}

	export interface QuickPick<T extends QuickPickItem> extends QuickInput {

		value: string;

		placeholder: string | undefined;

		readonly onDidChangeValue: Event<string>;

		readonly onDidAccept: Event<void>;

		buttons: ReadonlyArray<QuickInputButton>;

		readonly onDidTriggerButton: Event<QuickInputButton>;

		items: ReadonlyArray<T>;

		canSelectMany: boolean;

		matchOnDescription: boolean;

		matchOnDetail: boolean;

		activeItems: ReadonlyArray<T>;

		readonly onDidChangeActive: Event<T[]>;

		selectedItems: ReadonlyArray<T>;

		readonly onDidChangeSelection: Event<T[]>;
	}

	export interface InputBox extends QuickInput {

		value: string;

		placeholder: string | undefined;

		password: boolean;

		readonly onDidChangeValue: Event<string>;

		readonly onDidAccept: Event<void>;

		buttons: ReadonlyArray<QuickInputButton>;

		readonly onDidTriggerButton: Event<QuickInputButton>;

		prompt: string | undefined;

		validationMessage: string | undefined;
	}

	export interface QuickInputButton {
		readonly iconPath: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;
		readonly tooltip?: string | undefined;
	}

	//#endregion

	//#region joh: https://github.com/Microsoft/vscode/issues/10659

	/**
	 * A workspace edit is a collection of textual and files changes for
	 * multiple resources and documents. Use the [applyEdit](#workspace.applyEdit)-function
	 * to apply a workspace edit. Note that all changes are applied in the same order in which
	 * they have been added and that invalid sequences like 'delete file a' -> 'insert text in
	 * file a' causes failure of the operation.
	 */
	export interface WorkspaceEdit {

		/**
		 * Create a regular file.
		 *
		 * @param uri Uri of the new file..
		 * @param options Defines if an existing file should be overwritten or be ignored.
		 */
		createFile(uri: Uri, options?: { overwrite?: boolean, ignoreIfExists?: boolean }): void;

		/**
		 * Delete a file or folder.
		 *
		 * @param uri The uri of the file that is to be deleted.
		 */
		deleteFile(uri: Uri): void;

		/**
		 * Rename a file or folder.
		 *
		 * @param oldUri The existing file.
		 * @param newUri The new location.
		 * @param options Defines if existing files should be overwritten.
		 */
		renameFile(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean }): void;

		// replaceText(uri: Uri, range: Range, newText: string): void;
		// insertText(uri: Uri, position: Position, newText: string): void;
		// deleteText(uri: Uri, range: Range): void;
	}

	//#endregion

	//#region mjbvz,joh: https://github.com/Microsoft/vscode/issues/43768
	export interface FileRenameEvent {
		readonly oldUri: Uri;
		readonly newUri: Uri;
	}

	export interface FileWillRenameEvent {
		readonly oldUri: Uri;
		readonly newUri: Uri;
		waitUntil(thenable: Thenable<WorkspaceEdit>): void;
	}

	export namespace workspace {
		export const onWillRenameFile: Event<FileWillRenameEvent>;
		export const onDidRenameFile: Event<FileRenameEvent>;
	}
	//#endregion

	//#region Matt: WebView Serializer

	/**
	 * Restore webview panels that have been persisted when vscode shuts down.
	 *
	 * There are two types of webview persistence:
	 *
	 * - Persistence within a session.
	 * - Persistence across sessions (across restarts of VS Code).
	 *
	 * A `WebviewPanelSerializer` is only required for the second case: persisting a webview across sessions.
	 *
	 * Persistence within a session allows a webview to save its state when it becomes hidden
	 * and restore its content from this state when it becomes visible again. It is powered entirely
	 * by the webview content itself. To save off a persisted state, call `acquireVsCodeApi().setState()` with
	 * any json serializable object. To restore the state again, call `getState()`
	 *
	 * ```js
	 * // Within the webview
	 * const vscode = acquireVsCodeApi();
	 *
	 * // Get existing state
	 * const oldState = vscode.getState() || { value: 0 };
	 *
	 * // Update state
	 * setState({ value: oldState.value + 1 })
	 * ```
	 *
	 * A `WebviewPanelSerializer` extends this persistence across restarts of VS Code. When the editor is shutdown, VS Code will save off the state from `setState` of all webviews that have a serializer. When the
	 * webview first becomes visible after the restart, this state is passed to `deserializeWebviewPanel`.
	 * The extension can then restore the old `WebviewPanel` from this state.
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
		 * Extensions that support reviving should have an `"onWebviewPanel:viewType"` activation method and
		 * make sure that [registerWebviewPanelSerializer](#registerWebviewPanelSerializer) is called during activation.
		 *
		 * Only a single serializer may be registered at a time for a given `viewType`.
		 *
		 * @param viewType Type of the webview panel that can be serialized.
		 * @param serializer Webview serializer.
		 */
		export function registerWebviewPanelSerializer(viewType: string, serializer: WebviewPanelSerializer): Disposable;
	}

	//#endregion

	//#region Matt: Deinition range

	/**
	 * Information about where a symbol is defined.
	 *
	 * Provides additional metadata over normal [location](#Location) definitions, including the range of
	 * the defining symbol
	 */
	export interface DefinitionLink {
		/**
		 * Span of the symbol being defined in the source file.
		 *
		 * Used as the underlined span for mouse definition hover. Defaults to the word range at
		 * the definition position.
		 */
		origin?: Range;

		/**
		 * The resource identifier of the definition.
		 */
		uri: Uri;

		/**
		 * The full range of the definition.
		 *
		 * For a class definition for example, this would be the entire body of the class definition.
		 */
		range: Range;

		/**
		 * The span of the symbol definition.
		 *
		 * For a class definition, this would be the class name itself in the class definition.
		 */
		selectionRange?: Range;
	}

	export interface DefinitionProvider {
		provideDefinition2?(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Definition | DefinitionLink[]>;
	}

	//#endregion
}
