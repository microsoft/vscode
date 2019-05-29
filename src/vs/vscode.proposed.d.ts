/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is the place for API experiments and proposals.
 * These API are NOT stable and subject to change. They are only available in the Insiders
 * distribution and CANNOT be used in published extensions.
 *
 * To test these API in local environment:
 * - Use Insiders release of VS Code.
 * - Add `"enableProposedApi": true` to your package.json.
 * - Copy this file to your project.
 */

declare module 'vscode' {

	//#region Joh - ExecutionContext

	export enum ExtensionExecutionContext {
		Local = 1,
		Remote = 2
	}

	export interface ExtensionContext {
		/**
		 * Describes the context in which this extension is executed, e.g.
		 * a Node.js-context on the same machine or on a remote machine
		 */
		executionContext: ExtensionExecutionContext;
	}

	//#endregion


	//#region Joh - call hierarchy

	export enum CallHierarchyDirection {
		CallsFrom = 1,
		CallsTo = 2,
	}

	export class CallHierarchyItem {
		kind: SymbolKind;
		name: string;
		detail?: string;
		uri: Uri;
		range: Range;
		selectionRange: Range;

		constructor(kind: SymbolKind, name: string, detail: string, uri: Uri, range: Range, selectionRange: Range);
	}

	export interface CallHierarchyItemProvider {

		/**
		 * Given a document and position compute a call hierarchy item. This is justed as
		 * anchor for call hierarchy and then `resolveCallHierarchyItem` is being called.
		 */
		provideCallHierarchyItem(
			document: TextDocument,
			postion: Position,
			token: CancellationToken
		): ProviderResult<CallHierarchyItem>;

		/**
		 * Resolve a call hierarchy item, e.g. compute all calls from or to a function.
		 * The result is an array of item/location-tuples. The location in the returned tuples
		 * is always relative to the "caller" with the caller either being the provided item or
		 * the returned item.
		 *
		 * @param item A call hierarchy item previously returned from `provideCallHierarchyItem` or `resolveCallHierarchyItem`
		 * @param direction Resolve calls from a function or calls to a function
		 * @param token A cancellation token
		 */
		resolveCallHierarchyItem(
			item: CallHierarchyItem,
			direction: CallHierarchyDirection,
			token: CancellationToken
		): ProviderResult<[CallHierarchyItem, Location[]][]>;
	}

	export namespace languages {
		export function registerCallHierarchyProvider(selector: DocumentSelector, provider: CallHierarchyItemProvider): Disposable;
	}

	//#endregion


	//#region Alex - resolvers

	export interface RemoteAuthorityResolverContext {
		resolveAttempt: number;
	}

	export class ResolvedAuthority {
		readonly host: string;
		readonly port: number;

		constructor(host: string, port: number);
	}

	export class RemoteAuthorityResolverError extends Error {
		static NotAvailable(message?: string, handled?: boolean): RemoteAuthorityResolverError;
		static TemporarilyNotAvailable(message?: string): RemoteAuthorityResolverError;

		constructor(message?: string);
	}

	export interface RemoteAuthorityResolver {
		resolve(authority: string, context: RemoteAuthorityResolverContext): ResolvedAuthority | Thenable<ResolvedAuthority>;
	}

	export interface ResourceLabelFormatter {
		scheme: string;
		authority?: string;
		formatting: ResourceLabelFormatting;
	}

	export interface ResourceLabelFormatting {
		label: string; // myLabel:/${path}
		separator: '/' | '\\' | '';
		tildify?: boolean;
		normalizeDriveLetter?: boolean;
		workspaceSuffix?: string;
		authorityPrefix?: string;
	}

	export namespace workspace {
		export function registerRemoteAuthorityResolver(authorityPrefix: string, resolver: RemoteAuthorityResolver): Disposable;
		export function registerResourceLabelFormatter(formatter: ResourceLabelFormatter): Disposable;
	}

	//#endregion


	// #region Joh - code insets

	/**
	 */
	export class CodeInset {
		range: Range;
		height?: number;
		constructor(range: Range, height?: number);
	}

	export interface CodeInsetProvider {
		onDidChangeCodeInsets?: Event<void>;
		provideCodeInsets(document: TextDocument, token: CancellationToken): ProviderResult<CodeInset[]>;
		resolveCodeInset(codeInset: CodeInset, webview: Webview, token: CancellationToken): ProviderResult<CodeInset>;
	}

	export namespace languages {

		/**
		 * Register a code inset provider.
		 *
		 */
		export function registerCodeInsetProvider(selector: DocumentSelector, provider: CodeInsetProvider): Disposable;
	}

	//#endregion


	//#region Joh - read/write in chunks

	export interface FileSystemProvider {
		open?(resource: Uri, options: { create: boolean }): number | Thenable<number>;
		close?(fd: number): void | Thenable<void>;
		read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number>;
		write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number>;
	}

	//#endregion

	//#region Rob: search provider

	/**
	 * The parameters of a query for text search.
	 */
	export interface TextSearchQuery {
		/**
		 * The text pattern to search for.
		 */
		pattern: string;

		/**
		 * Whether or not `pattern` should match multiple lines of text.
		 */
		isMultiline?: boolean;

		/**
		 * Whether or not `pattern` should be interpreted as a regular expression.
		 */
		isRegExp?: boolean;

		/**
		 * Whether or not the search should be case-sensitive.
		 */
		isCaseSensitive?: boolean;

		/**
		 * Whether or not to search for whole word matches only.
		 */
		isWordMatch?: boolean;
	}

	/**
	 * A file glob pattern to match file paths against.
	 * TODO@roblou - merge this with the GlobPattern docs/definition in vscode.d.ts.
	 * @see [GlobPattern](#GlobPattern)
	 */
	export type GlobString = string;

	/**
	 * Options common to file and text search
	 */
	export interface SearchOptions {
		/**
		 * The root folder to search within.
		 */
		folder: Uri;

		/**
		 * Files that match an `includes` glob pattern should be included in the search.
		 */
		includes: GlobString[];

		/**
		 * Files that match an `excludes` glob pattern should be excluded from the search.
		 */
		excludes: GlobString[];

		/**
		 * Whether external files that exclude files, like .gitignore, should be respected.
		 * See the vscode setting `"search.useIgnoreFiles"`.
		 */
		useIgnoreFiles: boolean;

		/**
		 * Whether symlinks should be followed while searching.
		 * See the vscode setting `"search.followSymlinks"`.
		 */
		followSymlinks: boolean;

		/**
		 * Whether global files that exclude files, like .gitignore, should be respected.
		 * See the vscode setting `"search.useGlobalIgnoreFiles"`.
		 */
		useGlobalIgnoreFiles: boolean;
	}

	/**
	 * Options to specify the size of the result text preview.
	 * These options don't affect the size of the match itself, just the amount of preview text.
	 */
	export interface TextSearchPreviewOptions {
		/**
		 * The maximum number of lines in the preview.
		 * Only search providers that support multiline search will ever return more than one line in the match.
		 */
		matchLines: number;

		/**
		 * The maximum number of characters included per line.
		 */
		charsPerLine: number;
	}

	/**
	 * Options that apply to text search.
	 */
	export interface TextSearchOptions extends SearchOptions {
		/**
		 * The maximum number of results to be returned.
		 */
		maxResults: number;

		/**
		 * Options to specify the size of the result text preview.
		 */
		previewOptions?: TextSearchPreviewOptions;

		/**
		 * Exclude files larger than `maxFileSize` in bytes.
		 */
		maxFileSize?: number;

		/**
		 * Interpret files using this encoding.
		 * See the vscode setting `"files.encoding"`
		 */
		encoding?: string;

		/**
		 * Number of lines of context to include before each match.
		 */
		beforeContext?: number;

		/**
		 * Number of lines of context to include after each match.
		 */
		afterContext?: number;
	}

	/**
	 * Information collected when text search is complete.
	 */
	export interface TextSearchComplete {
		/**
		 * Whether the search hit the limit on the maximum number of search results.
		 * `maxResults` on [`TextSearchOptions`](#TextSearchOptions) specifies the max number of results.
		 * - If exactly that number of matches exist, this should be false.
		 * - If `maxResults` matches are returned and more exist, this should be true.
		 * - If search hits an internal limit which is less than `maxResults`, this should be true.
		 */
		limitHit?: boolean;
	}

	/**
	 * The parameters of a query for file search.
	 */
	export interface FileSearchQuery {
		/**
		 * The search pattern to match against file paths.
		 */
		pattern: string;
	}

	/**
	 * Options that apply to file search.
	 */
	export interface FileSearchOptions extends SearchOptions {
		/**
		 * The maximum number of results to be returned.
		 */
		maxResults?: number;

		/**
		 * A CancellationToken that represents the session for this search query. If the provider chooses to, this object can be used as the key for a cache,
		 * and searches with the same session object can search the same cache. When the token is cancelled, the session is complete and the cache can be cleared.
		 */
		session?: CancellationToken;
	}

	/**
	 * A preview of the text result.
	 */
	export interface TextSearchMatchPreview {
		/**
		 * The matching lines of text, or a portion of the matching line that contains the match.
		 */
		text: string;

		/**
		 * The Range within `text` corresponding to the text of the match.
		 * The number of matches must match the TextSearchMatch's range property.
		 */
		matches: Range | Range[];
	}

	/**
	 * A match from a text search
	 */
	export interface TextSearchMatch {
		/**
		 * The uri for the matching document.
		 */
		uri: Uri;

		/**
		 * The range of the match within the document, or multiple ranges for multiple matches.
		 */
		ranges: Range | Range[];

		/**
		 * A preview of the text match.
		 */
		preview: TextSearchMatchPreview;
	}

	/**
	 * A line of context surrounding a TextSearchMatch.
	 */
	export interface TextSearchContext {
		/**
		 * The uri for the matching document.
		 */
		uri: Uri;

		/**
		 * One line of text.
		 * previewOptions.charsPerLine applies to this
		 */
		text: string;

		/**
		 * The line number of this line of context.
		 */
		lineNumber: number;
	}

	export type TextSearchResult = TextSearchMatch | TextSearchContext;

	/**
	 * A FileSearchProvider provides search results for files in the given folder that match a query string. It can be invoked by quickopen or other extensions.
	 *
	 * A FileSearchProvider is the more powerful of two ways to implement file search in VS Code. Use a FileSearchProvider if you wish to search within a folder for
	 * all files that match the user's query.
	 *
	 * The FileSearchProvider will be invoked on every keypress in quickopen. When `workspace.findFiles` is called, it will be invoked with an empty query string,
	 * and in that case, every file in the folder should be returned.
	 */
	export interface FileSearchProvider {
		/**
		 * Provide the set of files that match a certain file path pattern.
		 * @param query The parameters for this query.
		 * @param options A set of options to consider while searching files.
		 * @param token A cancellation token.
		 */
		provideFileSearchResults(query: FileSearchQuery, options: FileSearchOptions, token: CancellationToken): ProviderResult<Uri[]>;
	}

	/**
	 * A TextSearchProvider provides search results for text results inside files in the workspace.
	 */
	export interface TextSearchProvider {
		/**
		 * Provide results that match the given text pattern.
		 * @param query The parameters for this query.
		 * @param options A set of options to consider while searching.
		 * @param progress A progress callback that must be invoked for all results.
		 * @param token A cancellation token.
		 */
		provideTextSearchResults(query: TextSearchQuery, options: TextSearchOptions, progress: Progress<TextSearchResult>, token: CancellationToken): ProviderResult<TextSearchComplete>;
	}

	/**
	 * Options that can be set on a findTextInFiles search.
	 */
	export interface FindTextInFilesOptions {
		/**
		 * A [glob pattern](#GlobPattern) that defines the files to search for. The glob pattern
		 * will be matched against the file paths of files relative to their workspace. Use a [relative pattern](#RelativePattern)
		 * to restrict the search results to a [workspace folder](#WorkspaceFolder).
		 */
		include?: GlobPattern;

		/**
		 * A [glob pattern](#GlobPattern) that defines files and folders to exclude. The glob pattern
		 * will be matched against the file paths of resulting matches relative to their workspace. When `undefined` only default excludes will
		 * apply, when `null` no excludes will apply.
		 */
		exclude?: GlobPattern | null;

		/**
		 * The maximum number of results to search for
		 */
		maxResults?: number;

		/**
		 * Whether external files that exclude files, like .gitignore, should be respected.
		 * See the vscode setting `"search.useIgnoreFiles"`.
		 */
		useIgnoreFiles?: boolean;

		/**
		 * Whether global files that exclude files, like .gitignore, should be respected.
		 * See the vscode setting `"search.useGlobalIgnoreFiles"`.
		 */
		useGlobalIgnoreFiles?: boolean;

		/**
		 * Whether symlinks should be followed while searching.
		 * See the vscode setting `"search.followSymlinks"`.
		 */
		followSymlinks?: boolean;

		/**
		 * Interpret files using this encoding.
		 * See the vscode setting `"files.encoding"`
		 */
		encoding?: string;

		/**
		 * Options to specify the size of the result text preview.
		 */
		previewOptions?: TextSearchPreviewOptions;

		/**
		 * Number of lines of context to include before each match.
		 */
		beforeContext?: number;

		/**
		 * Number of lines of context to include after each match.
		 */
		afterContext?: number;
	}

	export namespace workspace {
		/**
		 * Register a search provider.
		 *
		 * Only one provider can be registered per scheme.
		 *
		 * @param scheme The provider will be invoked for workspace folders that have this file scheme.
		 * @param provider The provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerFileSearchProvider(scheme: string, provider: FileSearchProvider): Disposable;

		/**
		 * Register a text search provider.
		 *
		 * Only one provider can be registered per scheme.
		 *
		 * @param scheme The provider will be invoked for workspace folders that have this file scheme.
		 * @param provider The provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerTextSearchProvider(scheme: string, provider: TextSearchProvider): Disposable;

		/**
		 * Search text in files across all [workspace folders](#workspace.workspaceFolders) in the workspace.
		 * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
		 * @param callback A callback, called for each result
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @return A thenable that resolves when the search is complete.
		 */
		export function findTextInFiles(query: TextSearchQuery, callback: (result: TextSearchResult) => void, token?: CancellationToken): Thenable<TextSearchComplete>;

		/**
		 * Search text in files across all [workspace folders](#workspace.workspaceFolders) in the workspace.
		 * @param query The query parameters for the search - the search string, whether it's case-sensitive, or a regex, or matches whole words.
		 * @param options An optional set of query options. Include and exclude patterns, maxResults, etc.
		 * @param callback A callback, called for each result
		 * @param token A token that can be used to signal cancellation to the underlying search engine.
		 * @return A thenable that resolves when the search is complete.
		 */
		export function findTextInFiles(query: TextSearchQuery, options: FindTextInFilesOptions, callback: (result: TextSearchResult) => void, token?: CancellationToken): Thenable<TextSearchComplete>;
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
		letter?: string;
		title?: string;
		color?: ThemeColor;
		priority?: number;
		bubble?: boolean;
		source?: string; // hacky... we should remove it and use equality under the hood
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

	// deprecated

	export interface DebugConfigurationProvider {
		/**
		 * Deprecated, use DebugAdapterDescriptorFactory.provideDebugAdapter instead.
		 * @deprecated Use DebugAdapterDescriptorFactory.createDebugAdapterDescriptor instead
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

	export namespace env {
		/**
		 * Current logging level.
		 */
		export const logLevel: LogLevel;

		/**
		 * An [event](#Event) that fires when the log level has changed.
		 */
		export const onDidChangeLogLevel: Event<LogLevel>;
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

	//#region Joao: SCM selected provider

	export interface SourceControl {

		/**
		 * Whether the source control is selected.
		 */
		readonly selected: boolean;

		/**
		 * An event signaling when the selection state changes.
		 */
		readonly onDidChangeSelection: Event<boolean>;
	}

	//#endregion

	//#region Joao: SCM Input Box

	/**
	 * Represents the input box in the Source Control viewlet.
	 */
	export interface SourceControlInputBox {

		/**
			* Controls whether the input box is visible (default is `true`).
			*/
		visible: boolean;
	}

	//#endregion

	//#region Comments
	/**
	 * Comments provider related APIs are still in early stages, they may be changed significantly during our API experiments.
	 */

	interface CommentInfo {
		/**
		 * All of the comment threads associated with the document.
		 */
		threads: CommentThread[];

		/**
		 * The ranges of the document which support commenting.
		 */
		commentingRanges?: Range[];

		/**
		 * If it's in draft mode or not
		 */
		inDraftMode?: boolean;
	}

	/**
	 * A comment is displayed within the editor or the Comments Panel, depending on how it is provided.
	 */
	export interface Comment {
		/**
		 * The display name of the user who created the comment
		 */
		readonly userName: string;

		/**
		 * The icon path for the user who created the comment
		 */
		readonly userIconPath?: Uri;

		/**
		 * The id of the comment
		 *
		 * @deprecated Use Id instead
		 */
		readonly commentId: string;

		/**
		 * @deprecated Use userIconPath instead. The avatar src of the user who created the comment
		 */
		gravatar?: string;

		/**
		 * Whether the current user has permission to edit the comment.
		 *
		 * This will be treated as false if the comment is provided by a `WorkspaceCommentProvider`, or
		 * if it is provided by a `DocumentCommentProvider` and  no `editComment` method is given.
		 *
		 * DEPRECATED, use editCommand
		 */
		canEdit?: boolean;

		/**
		 * Whether the current user has permission to delete the comment.
		 *
		 * This will be treated as false if the comment is provided by a `WorkspaceCommentProvider`, or
		 * if it is provided by a `DocumentCommentProvider` and  no `deleteComment` method is given.
		 *
		 * DEPRECATED, use deleteCommand
		 */
		canDelete?: boolean;

		/**
		 * @deprecated
		 * The command to be executed if the comment is selected in the Comments Panel
		 */
		command?: Command;

		/**
		 * Deprecated
		 */
		isDraft?: boolean;

		/**
		 * The command to be executed when users try to delete the comment
		 */
		deleteCommand?: Command;

		/**
		 * Proposed Comment Reaction
		 */
		commentReactions?: CommentReaction[];
	}

	/**
	 * Deprecated
	 */
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

		/**
		 * Changed draft mode
		 */
		readonly inDraftMode: boolean;
	}

	/**
	 * Comment Reactions
	 * Stay in proposed.
	 */
	interface CommentReaction {
		readonly label?: string;
		readonly iconPath?: string | Uri;
		count?: number;
		readonly hasReacted?: boolean;
	}

	/**
	 * DEPRECATED
	 */
	interface DocumentCommentProvider {
		/**
		 * Provide the commenting ranges and comment threads for the given document. The comments are displayed within the editor.
		 */
		provideDocumentComments(document: TextDocument, token: CancellationToken): Promise<CommentInfo>;

		/**
		 * Called when a user adds a new comment thread in the document at the specified range, with body text.
		 */
		createNewCommentThread(document: TextDocument, range: Range, text: string, token: CancellationToken): Promise<CommentThread>;

		/**
		 * Called when a user replies to a new comment thread in the document at the specified range, with body text.
		 */
		replyToCommentThread(document: TextDocument, range: Range, commentThread: CommentThread, text: string, token: CancellationToken): Promise<CommentThread>;

		/**
		 * Called when a user edits the comment body to the be new text.
		 */
		editComment?(document: TextDocument, comment: Comment, text: string, token: CancellationToken): Promise<void>;

		/**
		 * Called when a user deletes the comment.
		 */
		deleteComment?(document: TextDocument, comment: Comment, token: CancellationToken): Promise<void>;

		startDraft?(document: TextDocument, token: CancellationToken): Promise<void>;
		deleteDraft?(document: TextDocument, token: CancellationToken): Promise<void>;
		finishDraft?(document: TextDocument, token: CancellationToken): Promise<void>;

		startDraftLabel?: string;
		deleteDraftLabel?: string;
		finishDraftLabel?: string;

		addReaction?(document: TextDocument, comment: Comment, reaction: CommentReaction): Promise<void>;
		deleteReaction?(document: TextDocument, comment: Comment, reaction: CommentReaction): Promise<void>;
		reactionGroup?: CommentReaction[];

		/**
		 * Notify of updates to comment threads.
		 */
		onDidChangeCommentThreads: Event<CommentThreadChangedEvent>;
	}

	/**
	 * DEPRECATED
	 */
	interface WorkspaceCommentProvider {
		/**
		 * Provide all comments for the workspace. Comments are shown within the comments panel. Selecting a comment
		 * from the panel runs the comment's command.
		 */
		provideWorkspaceComments(token: CancellationToken): Promise<CommentThread[]>;

		/**
		 * Notify of updates to comment threads.
		 */
		onDidChangeCommentThreads: Event<CommentThreadChangedEvent>;
	}

	/**
	 * Stay in proposed
	 */
	export interface CommentReactionProvider {
		availableReactions: CommentReaction[];
		toggleReaction?(document: TextDocument, comment: Comment, reaction: CommentReaction): Promise<void>;
	}

	export interface CommentThread {
		/**
		 * The uri of the document the thread has been created on.
		 */
		readonly resource: Uri;

		/**
		 * Optional additonal commands.
		 *
		 * `additionalCommands` are the secondary actions rendered on Comment Widget.
		 */
		additionalCommands?: Command[];

		/**
		 * The command to be executed when users try to delete the comment thread. Currently, this is only called
		 * when the user collapses a comment thread that has no comments in it.
		 */
		deleteCommand?: Command;
	}


	export interface CommentController {
		/**
		 * Optional reaction provider
		 * Stay in proposed.
		 */
		reactionProvider?: CommentReactionProvider;
	}

	namespace workspace {
		/**
		 * DEPRECATED
		 * Use vscode.comment.createCommentController instead.
		 */
		export function registerDocumentCommentProvider(provider: DocumentCommentProvider): Disposable;
		/**
		 * DEPRECATED
		 * Use vscode.comment.createCommentController instead and we don't differentiate document comments and workspace comments anymore.
		 */
		export function registerWorkspaceCommentProvider(provider: WorkspaceCommentProvider): Disposable;
	}

	/**
	 * A collection of [comments](#Comment) representing a conversation at a particular range in a document.
	 */
	export interface CommentThread {
		/**
		 * A unique identifier of the comment thread.
		 */
		readonly id: string;

		/**
		 * The uri of the document the thread has been created on.
		 */
		readonly uri: Uri;

		/**
		 * Optional accept input command
		 *
		 * `acceptInputCommand` is the default action rendered on Comment Widget, which is always placed rightmost.
		 * This command will be invoked when users the user accepts the value in the comment editor.
		 * This command will disabled when the comment editor is empty.
		 */
		acceptInputCommand?: Command;
	}

	/**
	 * A comment is displayed within the editor or the Comments Panel, depending on how it is provided.
	 */
	export interface Comment {
		/**
		 * The id of the comment
		 */
		id: string;

		/**
		 * The command to be executed if the comment is selected in the Comments Panel
		 */
		selectCommand?: Command;

		/**
		 * The command to be executed when users try to save the edits to the comment
		 */
		editCommand?: Command;
	}

	/**
	 * The comment input box in Comment Widget.
	 */
	export interface CommentInputBox {
		/**
		 * Setter and getter for the contents of the comment input box
		 */
		value: string;
	}

	/**
	 * Commenting range provider for a [comment controller](#CommentController).
	 */
	export interface CommentingRangeProvider {
		/**
		 * Provide a list of ranges which allow new comment threads creation or null for a given document
		 */
		provideCommentingRanges(document: TextDocument, token: CancellationToken): ProviderResult<Range[]>;
	}

	export interface EmptyCommentThreadFactory {
		/**
		 * The method `createEmptyCommentThread` is called when users attempt to create new comment thread from the gutter or command palette.
		 * Extensions still need to call `createCommentThread` inside this call when appropriate.
		 */
		createEmptyCommentThread(document: TextDocument, range: Range): ProviderResult<void>;
	}

	/**
	 * A comment controller is able to provide [comments](#CommentThread) support to the editor and
	 * provide users various ways to interact with comments.
	 */
	export interface CommentController {

		/**
		 * The active [comment input box](#CommentInputBox) or `undefined`. The active `inputBox` is the input box of
		 * the comment thread widget that currently has focus. It's `undefined` when the focus is not in any CommentInputBox.
		 */
		readonly inputBox?: CommentInputBox;

		/**
		 * Create a [comment thread](#CommentThread). The comment thread will be displayed in visible text editors (if the resource matches)
		 * and Comments Panel once created.
		 *
		 * @param id An `id` for the comment thread.
		 * @param resource The uri of the document the thread has been created on.
		 * @param range The range the comment thread is located within the document.
		 * @param comments The ordered comments of the thread.
		 */
		createCommentThread(id: string, resource: Uri, range: Range, comments: Comment[]): CommentThread;

		/**
		 * Optional new comment thread factory.
		 */
		emptyCommentThreadFactory?: EmptyCommentThreadFactory;

		/**
		 * Optional reaction provider
		 */
		reactionProvider?: CommentReactionProvider;

		/**
		 * Dispose this comment controller.
		 *
		 * Once disposed, all [comment threads](#CommentThread) created by this comment controller will also be removed from the editor
		 * and Comments Panel.
		 */
		dispose(): void;
	}

	namespace comment {
		/**
		 * Creates a new [comment controller](#CommentController) instance.
		 *
		 * @param id An `id` for the comment controller.
		 * @param label A human-readable string for the comment controller.
		 * @return An instance of [comment controller](#CommentController).
		 */
		export function createCommentController(id: string, label: string): CommentController;
	}

	//#endregion

	//#region Terminal

	export interface TerminalOptions {
		/**
		 * When enabled the terminal will run the process as normal but not be surfaced to the user
		 * until `Terminal.show` is called. The typical usage for this is when you need to run
		 * something that may need interactivity but only want to tell the user about it when
		 * interaction is needed. Note that the terminals will still be exposed to all extensions
		 * as normal.
		 */
		runInBackground?: boolean;
	}

	/**
	 * An [event](#Event) which fires when a [Terminal](#Terminal)'s dimensions change.
	 */
	export interface TerminalDimensionsChangeEvent {
		/**
		 * The [terminal](#Terminal) for which the dimensions have changed.
		 */
		readonly terminal: Terminal;
		/**
		 * The new value for the [terminal's dimensions](#Terminal.dimensions).
		 */
		readonly dimensions: TerminalDimensions;
	}

	namespace window {
		/**
		 * An event which fires when the [dimensions](#Terminal.dimensions) of the terminal change.
		 */
		export const onDidChangeTerminalDimensions: Event<TerminalDimensionsChangeEvent>;
	}

	export interface Terminal {
		/**
		 * The current dimensions of the terminal. This will be `undefined` immediately after the
		 * terminal is created as the dimensions are not known until shortly after the terminal is
		 * created.
		 */
		readonly dimensions: TerminalDimensions | undefined;

		/**
		 * Fires when the terminal's pty slave pseudo-device is written to. In other words, this
		 * provides access to the raw data stream from the process running within the terminal,
		 * including VT sequences.
		 */
		readonly onDidWriteData: Event<string>;
	}

	/**
	 * Represents the dimensions of a terminal.
	 */
	export interface TerminalDimensions {
		/**
		 * The number of columns in the terminal.
		 */
		readonly columns: number;

		/**
		 * The number of rows in the terminal.
		 */
		readonly rows: number;
	}

	/**
	 * Represents a terminal without a process where all interaction and output in the terminal is
	 * controlled by an extension. This is similar to an output window but has the same VT sequence
	 * compatibility as the regular terminal.
	 *
	 * Note that an instance of [Terminal](#Terminal) will be created when a TerminalRenderer is
	 * created with all its APIs available for use by extensions. When using the Terminal object
	 * of a TerminalRenderer it acts just like normal only the extension that created the
	 * TerminalRenderer essentially acts as a process. For example when an
	 * [Terminal.onDidWriteData](#Terminal.onDidWriteData) listener is registered, that will fire
	 * when [TerminalRenderer.write](#TerminalRenderer.write) is called. Similarly when
	 * [Terminal.sendText](#Terminal.sendText) is triggered that will fire the
	 * [TerminalRenderer.onDidAcceptInput](#TerminalRenderer.onDidAcceptInput) event.
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
		dimensions: TerminalDimensions | undefined;

		/**
		 * The maximum dimensions of the terminal, this will be undefined immediately after a
		 * terminal renderer is created and also until the terminal becomes visible in the UI.
		 * Listen to [onDidChangeMaximumDimensions](TerminalRenderer.onDidChangeMaximumDimensions)
		 * to get notified when this value changes.
		 */
		readonly maximumDimensions: TerminalDimensions | undefined;

		/**
		 * The corresponding [Terminal](#Terminal) for this TerminalRenderer.
		 */
		readonly terminal: Terminal;

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
		 * terminalRenderer.onDidAcceptInput(data => {
		 *   console.log(data); // 'Hello world'
		 * });
		 * terminalRenderer.terminal.sendText('Hello world');
		 * ```
		 */
		readonly onDidAcceptInput: Event<string>;

		/**
		 * An event which fires when the [maximum dimensions](#TerminalRenderer.maximumDimensions) of
		 * the terminal renderer change.
		 */
		readonly onDidChangeMaximumDimensions: Event<TerminalDimensions>;
	}

	export namespace window {
		/**
		 * Create a [TerminalRenderer](#TerminalRenderer).
		 *
		 * @param name The name of the terminal renderer, this shows up in the terminal selector.
		 */
		export function createTerminalRenderer(name: string): TerminalRenderer;
	}

	//#endregion

	//#region Joh -> exclusive document filters

	export interface DocumentFilter {
		exclusive?: boolean;
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

	//#region Alex - OnEnter enhancement
	export interface OnEnterRule {
		/**
		 * This rule will only execute if the text above the this line matches this regular expression.
		 */
		oneLineAboveText?: RegExp;
	}
	//#endregion

	//#region Tree View

	export interface TreeView<T> {

		/**
		 * An optional human-readable message that will be rendered in the view.
		 */
		message?: string | MarkdownString;

	}

	/**
	 * Label describing the [Tree item](#TreeItem)
	 */
	export interface TreeItemLabel {

		/**
		 * A human-readable string describing the [Tree item](#TreeItem).
		 */
		label: string;

		/**
		 * Ranges in the label to highlight. A range is defined as a tuple of two number where the
		 * first is the inclusive start index and the second the exclusive end index
		 */
		highlights?: [number, number][];

	}

	export class TreeItem2 extends TreeItem {
		/**
		 * Label describing this item. When `falsy`, it is derived from [resourceUri](#TreeItem.resourceUri).
		 */
		label?: string | TreeItemLabel | /* for compilation */ any;

		/**
		 * @param label Label describing this item
		 * @param collapsibleState [TreeItemCollapsibleState](#TreeItemCollapsibleState) of the tree item. Default is [TreeItemCollapsibleState.None](#TreeItemCollapsibleState.None)
		 */
		constructor(label: TreeItemLabel, collapsibleState?: TreeItemCollapsibleState);
	}
	//#endregion

	/**
	 * Class used to execute an extension callback as a task.
	 */
	export class CustomExecution {
		/**
		 * @param callback The callback that will be called when the extension callback task is executed.
		 */
		constructor(callback: (terminalRenderer: TerminalRenderer, cancellationToken: CancellationToken, thisArg?: any) => Thenable<number>);

		/**
		 * The callback used to execute the task.
		 * @param terminalRenderer Used by the task to render output and receive input.
		 * @param cancellationToken Cancellation used to signal a cancel request to the executing task.
		 * @returns The callback should return '0' for success and a non-zero value for failure.
		 */
		callback: (terminalRenderer: TerminalRenderer, cancellationToken: CancellationToken, thisArg?: any) => Thenable<number>;
	}

	/**
	 * A task to execute
	 */
	export class Task2 extends Task {
		/**
		 * Creates a new task.
		 *
		 * @param definition The task definition as defined in the taskDefinitions extension point.
		 * @param scope Specifies the task's scope. It is either a global or a workspace task or a task for a specific workspace folder.
		 * @param name The task's name. Is presented in the user interface.
		 * @param source The task's source (e.g. 'gulp', 'npm', ...). Is presented in the user interface.
		 * @param execution The process or shell execution.
		 * @param problemMatchers the names of problem matchers to use, like '$tsc'
		 *  or '$eslint'. Problem matchers can be contributed by an extension using
		 *  the `problemMatchers` extension point.
		 */
		constructor(taskDefinition: TaskDefinition, scope: WorkspaceFolder | TaskScope.Global | TaskScope.Workspace, name: string, source: string, execution?: ProcessExecution | ShellExecution | CustomExecution, problemMatchers?: string | string[]);

		/**
		 * The task's execution engine
		 */
		execution2?: ProcessExecution | ShellExecution | CustomExecution;
	}

	//#region Tasks
	export interface TaskPresentationOptions {
		/**
		 * Controls whether the task is executed in a specific terminal group using split panes.
		 */
		group?: string;
	}
	//#endregion

	//#region Workspace URI Ben

	export namespace workspace {

		/**
		 * The location of the workspace file, for example:
		 *
		 * `file:///Users/name/Development/myProject.code-workspace`
		 *
		 * or
		 *
		 * `untitled:1555503116870`
		 *
		 * for a workspace that is untitled and not yet saved.
		 *
		 * Depending on the workspace that is opened, the value will be:
		 *  * `undefined` when no workspace or  a single folder is opened
		 *  * the path of the workspace file as `Uri` otherwise. if the workspace
		 * is untitled, the returned URI will use the `untitled:` scheme
		 *
		 * The location can e.g. be used with the `vscode.openFolder` command to
		 * open the workspace again after it has been closed.
		 *
		 * **Example:**
		 * ```typescript
		 * vscode.commands.executeCommand('vscode.openFolder', uriOfWorkspace);
		 * ```
		 *
		 * **Note:** it is not advised to use `workspace.workspaceFile` to write
		 * configuration data into the file. You can use `workspace.getConfiguration().update()`
		 * for that purpose which will work both when a single folder is opened as
		 * well as an untitled or saved workspace.
		 */
		export const workspaceFile: Uri | undefined;
	}

	//#endregion

	//#region DocumentLink tooltip mjbvz

	interface DocumentLink {
		/**
		 * The tooltip text when you hover over this link.
		 */
		tooltip?: string;
	}

	// #endregion
}
