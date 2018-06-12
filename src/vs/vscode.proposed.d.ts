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
		 * including ANSI sequences.
		 */
		onData: Event<string>;
	}

	export namespace window {
		/**
		 * The currently opened terminals or an empty array.
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

	export class DocumentSymbol {

		/**
		 * The name of this symbol.
		 */
		name: string;

		/**
		 * The kind of this symbol.
		 */
		kind: SymbolKind;

		/**
		 * The full range of this symbol not including leading/trailing whitespace but everything else.
		 */
		fullRange: Range;

		/**
		 * The range that should be revealed when this symbol is being selected, e.g the name of a function.
		 * Must be contained by the [`fullRange`](#DocumentSymbol.fullRange).
		 */
		gotoRange: Range;

		/**
		 * Children of this symbol, e.g. properties of a class.
		 */
		children: DocumentSymbol[];

		/**
		 * Creates a new document symbol.
		 *
		 * @param name The name of the symbol.
		 * @param kind The kind of the symbol.
		 * @param fullRange The full range of the symbol.
		 * @param gotoRange The range that should be reveal.
		 */
		constructor(name: string, kind: SymbolKind, fullRange: Range, gotoRange: Range);
	}

	export interface DocumentSymbolProvider {
		provideDocumentSymbols(document: TextDocument, token: CancellationToken): ProviderResult<SymbolInformation[] | DocumentSymbol[]>;
	}

	//#endregion

	//#region Joh -> exclusive document filters

	export interface DocumentFilter {
		exclusive?: boolean;
	}

	//#endregion

	//#region QuickInput API

	export namespace window {

		/**
		 * Implementation incomplete. See #49340.
		 */
		export function createQuickPick(): QuickPick;

		/**
		 * Implementation incomplete. See #49340.
		 */
		export function createInputBox(): InputBox;
	}

	export interface QuickInput {

		enabled: boolean;

		busy: boolean;

		ignoreFocusOut: boolean;

		show(): void;

		hide(): void;

		onDidHide: Event<void>;

		dispose(): void;
	}

	export interface QuickPick extends QuickInput {

		value: string;

		placeholder: string;

		readonly onDidChangeValue: Event<string>;

		readonly onDidAccept: Event<void>;

		buttons: ReadonlyArray<QuickInputButton>;

		readonly onDidTriggerButton: Event<QuickInputButton>;

		items: ReadonlyArray<QuickPickItem>;

		canSelectMany: boolean;

		matchOnDescription: boolean;

		matchOnDetail: boolean;

		readonly activeItems: ReadonlyArray<QuickPickItem>;

		readonly onDidChangeActive: Event<QuickPickItem[]>;

		readonly selectedItems: ReadonlyArray<QuickPickItem>;

		readonly onDidChangeSelection: Event<QuickPickItem[]>;
	}

	export interface InputBox extends QuickInput {

		value: string;

		placeholder: string;

		password: boolean;

		readonly onDidChangeValue: Event<string>;

		readonly onDidAccept: Event<string>;

		buttons: ReadonlyArray<QuickInputButton>;

		readonly onDidTriggerButton: Event<QuickInputButton>;

		prompt: string;

		validationMessage: string;
	}

	export interface QuickInputButton {
		iconPath: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;
		tooltip?: string | undefined;
	}

	//#endregion

	//#region mjbvz: Unused diagnostics
	/**
	 * Additional metadata about the type of diagnostic.
	 */
	export enum DiagnosticTag {
		/**
		 * Unused or unnecessary code.
		 */
		Unnecessary = 1,
	}

	export interface Diagnostic {
		/**
		 * Additional metadata about the type of the diagnostic.
		 */
		customTags?: DiagnosticTag[];
	}

	//#endregion

	//#region mjbvz: File rename events
	export interface ResourceRenamedEvent {
		readonly oldResource: Uri;
		readonly newResource: Uri;
	}

	export namespace workspace {
		export const onDidRenameResource: Event<ResourceRenamedEvent>;
	}
	//#endregion

	//#region mjbvz: Code action trigger

	/**
	 * How a [code action provider](#CodeActionProvider) was triggered
	 */
	export enum CodeActionTrigger {
		/**
		 * Provider was triggered automatically by VS Code.
		 */
		Automatic = 1,

		/**
		 * User requested code actions.
		 */
		Manual = 2,
	}

	interface CodeActionContext {
		/**
		 * How the code action provider was triggered.
		 */
		triggerKind?: CodeActionTrigger;
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
}
