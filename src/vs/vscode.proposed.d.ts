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

	//#region auth provider: https://github.com/microsoft/vscode/issues/88309

	/**
	 * An [event](#Event) which fires when an [AuthenticationProvider](#AuthenticationProvider) is added or removed.
	 */
	export interface AuthenticationProvidersChangeEvent {
		/**
		 * The ids of the [authenticationProvider](#AuthenticationProvider)s that have been added.
		 */
		readonly added: ReadonlyArray<AuthenticationProviderInformation>;

		/**
		 * The ids of the [authenticationProvider](#AuthenticationProvider)s that have been removed.
		 */
		readonly removed: ReadonlyArray<AuthenticationProviderInformation>;
	}

	/**
	* An [event](#Event) which fires when an [AuthenticationSession](#AuthenticationSession) is added, removed, or changed.
	*/
	export interface AuthenticationProviderAuthenticationSessionsChangeEvent {
		/**
		 * The [AuthenticationSession](#AuthenticationSession)s of the [AuthenticationProvider](#AuthentiationProvider) that have been added.
		*/
		readonly added: ReadonlyArray<AuthenticationSession>;

		/**
		 * The [AuthenticationSession](#AuthenticationSession)s of the [AuthenticationProvider](#AuthentiationProvider) that have been removed.
		 */
		readonly removed: ReadonlyArray<AuthenticationSession>;

		/**
		 * The [AuthenticationSession](#AuthenticationSession)s of the [AuthenticationProvider](#AuthentiationProvider) that have been changed.
		 */
		readonly changed: ReadonlyArray<AuthenticationSession>;
	}

	/**
	 * A provider for performing authentication to a service.
	 */
	export interface AuthenticationProvider {
		/**
		 * An [event](#Event) which fires when the array of sessions has changed, or data
		 * within a session has changed.
		 */
		readonly onDidChangeSessions: Event<AuthenticationProviderAuthenticationSessionsChangeEvent>;

		/**
		 * Get a list of sessions.
		 * @param scopes An optional list of scopes. If provided, the sessions returned should match
		 * these permissions, otherwise all sessions should be returned.
		 * @returns A promise that resolves to an array of authentication sessions.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		getSessions(scopes?: string[]): Thenable<ReadonlyArray<AuthenticationSession>>;

		/**
		 * Prompts a user to login.
		 * @param scopes A list of scopes, permissions, that the new session should be created with.
		 * @returns A promise that resolves to an authentication session.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		createSession(scopes: string[]): Thenable<AuthenticationSession>;

		/**
		 * Removes the session corresponding to session id.
		 * @param sessionId The id of the session to remove.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		removeSession(sessionId: string): Thenable<void>;
	}

	/**
	 * Options for creating an [AuthenticationProvider](#AuthentcationProvider).
	 */
	export interface AuthenticationProviderOptions {
		/**
		 * Whether it is possible to be signed into multiple accounts at once with this provider.
		 * If not specified, will default to false.
		*/
		readonly supportsMultipleAccounts?: boolean;
	}

	export namespace authentication {
		/**
		 * Register an authentication provider.
		 *
		 * There can only be one provider per id and an error is being thrown when an id
		 * has already been used by another provider. Ids are case-sensitive.
		 *
		 * @param id The unique identifier of the provider.
		 * @param label The human-readable name of the provider.
		 * @param provider The authentication provider provider.
		 * @params options Additional options for the provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerAuthenticationProvider(id: string, label: string, provider: AuthenticationProvider, options?: AuthenticationProviderOptions): Disposable;

		/**
		 * @deprecated - getSession should now trigger extension activation.
		 * Fires with the provider id that was registered or unregistered.
		 */
		export const onDidChangeAuthenticationProviders: Event<AuthenticationProvidersChangeEvent>;

		/**
		 * An array of the information of authentication providers that are currently registered.
		 */
		export const providers: ReadonlyArray<AuthenticationProviderInformation>;

		/**
		* Logout of a specific session.
		* @param providerId The id of the provider to use
		* @param sessionId The session id to remove
		* provider
		*/
		export function logout(providerId: string, sessionId: string): Thenable<void>;
	}

	//#endregion

	// eslint-disable-next-line vscode-dts-region-comments
	//#region @alexdima - resolvers

	export interface MessageOptions {
		/**
		 * Do not render a native message box.
		 */
		useCustom?: boolean;
	}

	export interface RemoteAuthorityResolverContext {
		resolveAttempt: number;
	}

	export class ResolvedAuthority {
		readonly host: string;
		readonly port: number;
		readonly connectionToken: string | undefined;

		constructor(host: string, port: number, connectionToken?: string);
	}

	export interface ResolvedOptions {
		extensionHostEnv?: { [key: string]: string | null; };
	}

	export interface TunnelOptions {
		remoteAddress: { port: number, host: string; };
		// The desired local port. If this port can't be used, then another will be chosen.
		localAddressPort?: number;
		label?: string;
		public?: boolean;
	}

	export interface TunnelDescription {
		remoteAddress: { port: number, host: string; };
		//The complete local address(ex. localhost:1234)
		localAddress: { port: number, host: string; } | string;
		public?: boolean;
	}

	export interface Tunnel extends TunnelDescription {
		// Implementers of Tunnel should fire onDidDispose when dispose is called.
		onDidDispose: Event<void>;
		dispose(): void | Thenable<void>;
	}

	/**
	 * Used as part of the ResolverResult if the extension has any candidate,
	 * published, or forwarded ports.
	 */
	export interface TunnelInformation {
		/**
		 * Tunnels that are detected by the extension. The remotePort is used for display purposes.
		 * The localAddress should be the complete local address (ex. localhost:1234) for connecting to the port. Tunnels provided through
		 * detected are read-only from the forwarded ports UI.
		 */
		environmentTunnels?: TunnelDescription[];

	}

	export interface TunnelCreationOptions {
		/**
		 * True when the local operating system will require elevation to use the requested local port.
		 */
		elevationRequired?: boolean;
	}

	export type ResolverResult = ResolvedAuthority & ResolvedOptions & TunnelInformation;

	export class RemoteAuthorityResolverError extends Error {
		static NotAvailable(message?: string, handled?: boolean): RemoteAuthorityResolverError;
		static TemporarilyNotAvailable(message?: string): RemoteAuthorityResolverError;

		constructor(message?: string);
	}

	export interface RemoteAuthorityResolver {
		resolve(authority: string, context: RemoteAuthorityResolverContext): ResolverResult | Thenable<ResolverResult>;
		/**
		 * Can be optionally implemented if the extension can forward ports better than the core.
		 * When not implemented, the core will use its default forwarding logic.
		 * When implemented, the core will use this to forward ports.
		 *
		 * To enable the "Change Local Port" action on forwarded ports, make sure to set the `localAddress` of
		 * the returned `Tunnel` to a `{ port: number, host: string; }` and not a string.
		 */
		tunnelFactory?: (tunnelOptions: TunnelOptions, tunnelCreationOptions: TunnelCreationOptions) => Thenable<Tunnel> | undefined;

		/**p
		 * Provides filtering for candidate ports.
		 */
		showCandidatePort?: (host: string, port: number, detail: string) => Thenable<boolean>;

		/**
		 * Lets the resolver declare which tunnel factory features it supports.
		 * UNDER DISCUSSION! MAY CHANGE SOON.
		 */
		tunnelFeatures?: {
			elevation: boolean;
			public: boolean;
		};
	}

	export namespace workspace {
		/**
		 * Forwards a port. If the current resolver implements RemoteAuthorityResolver:forwardPort then that will be used to make the tunnel.
		 * By default, openTunnel only support localhost; however, RemoteAuthorityResolver:tunnelFactory can be used to support other ips.
		 *
		 * @throws When run in an environment without a remote.
		 *
		 * @param tunnelOptions The `localPort` is a suggestion only. If that port is not available another will be chosen.
		 */
		export function openTunnel(tunnelOptions: TunnelOptions): Thenable<Tunnel>;

		/**
		 * Gets an array of the currently available tunnels. This does not include environment tunnels, only tunnels that have been created by the user.
		 * Note that these are of type TunnelDescription and cannot be disposed.
		 */
		export let tunnels: Thenable<TunnelDescription[]>;

		/**
		 * Fired when the list of tunnels has changed.
		 */
		export const onDidChangeTunnels: Event<void>;
	}

	export interface ResourceLabelFormatter {
		scheme: string;
		authority?: string;
		formatting: ResourceLabelFormatting;
	}

	export interface ResourceLabelFormatting {
		label: string; // myLabel:/${path}
		// For historic reasons we use an or string here. Once we finalize this API we should start using enums instead and adopt it in extensions.
		// eslint-disable-next-line vscode-dts-literal-or-types
		separator: '/' | '\\' | '';
		tildify?: boolean;
		normalizeDriveLetter?: boolean;
		workspaceSuffix?: string;
		authorityPrefix?: string;
		stripPathStartingSeparator?: boolean;
	}

	export namespace workspace {
		export function registerRemoteAuthorityResolver(authorityPrefix: string, resolver: RemoteAuthorityResolver): Disposable;
		export function registerResourceLabelFormatter(formatter: ResourceLabelFormatter): Disposable;
	}

	//#endregion

	//#region editor insets: https://github.com/microsoft/vscode/issues/85682

	export interface WebviewEditorInset {
		readonly editor: TextEditor;
		readonly line: number;
		readonly height: number;
		readonly webview: Webview;
		readonly onDidDispose: Event<void>;
		dispose(): void;
	}

	export namespace window {
		export function createWebviewTextEditorInset(editor: TextEditor, line: number, height: number, options?: WebviewOptions): WebviewEditorInset;
	}

	//#endregion

	//#region read/write in chunks: https://github.com/microsoft/vscode/issues/84515

	export interface FileSystemProvider {
		open?(resource: Uri, options: { create: boolean; }): number | Thenable<number>;
		close?(fd: number): void | Thenable<void>;
		read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number>;
		write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | Thenable<number>;
	}

	//#endregion

	//#region TextSearchProvider: https://github.com/microsoft/vscode/issues/59921

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
	 * TODO@roblourens merge this with the GlobPattern docs/definition in vscode.d.ts.
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

	//#endregion

	//#region FileSearchProvider: https://github.com/microsoft/vscode/issues/73524

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
	}

	//#endregion

	//#region findTextInFiles: https://github.com/microsoft/vscode/issues/59924

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
		 * will be matched against the file paths of resulting matches relative to their workspace. When `undefined`, default excludes will
		 * apply.
		 */
		exclude?: GlobPattern;

		/**
		 * Whether to use the default and user-configured excludes. Defaults to true.
		 */
		useDefaultExcludes?: boolean;

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

	//#region diff command: https://github.com/microsoft/vscode/issues/84899

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

	//#region inline value provider: https://github.com/microsoft/vscode/issues/105690

	/**
	 * The inline values provider interface defines the contract between extensions and the VS Code debugger inline values feature.
	 * In this contract the provider returns inline value information for a given document range
	 * and VS Code shows this information in the editor at the end of lines.
	 */
	export interface InlineValuesProvider {

		/**
		 * An optional event to signal that inline values have changed.
		 * @see [EventEmitter](#EventEmitter)
		 */
		onDidChangeInlineValues?: Event<void> | undefined;

		/**
		 * Provide "inline value" information for a given document and range.
		 * VS Code calls this method whenever debugging stops in the given document.
		 * The returned inline values information is rendered in the editor at the end of lines.
		 *
		 * @param document The document for which the inline values information is needed.
		 * @param viewPort The visible document range for which inline values should be computed.
		 * @param context A bag containing contextual information like the current location.
		 * @param token A cancellation token.
		 * @return An array of InlineValueDescriptors or a thenable that resolves to such. The lack of a result can be
		 * signaled by returning `undefined` or `null`.
		 */
		provideInlineValues(document: TextDocument, viewPort: Range, context: InlineValueContext, token: CancellationToken): ProviderResult<InlineValue[]>;
	}

	/**
	 * An open ended information bag passed to the inline value provider.
	 * A minimal context containes just the document location where the debugger has stopped.
	 * Additional optional information might be scope information or variables and their values.
	 */
	export interface InlineValueContext {
		/**
		 * The document range where execution has stopped.
		 * Typically the end position of the range denotes the line where the inline values are shown.
		 */
		stoppedLocation: Range;

		// ... more to come, e.g. Scope information or variable/value candidate information
	}

	/**
	 * Inline value information can be provided by different means:
	 * - directly as a text value (class InlineValueText).
	 * - as a name to use for a variable lookup (class InlineValueVariableLookup)
	 * - as an evaluatable expression (class InlineValueEvaluatableExpression)
	 * The InlineValue types combines all inline value types into one type.
	 */
	export type InlineValue = InlineValueText | InlineValueVariableLookup | InlineValueEvaluatableExpression;

	/**
	 * Provide inline value as text.
	 */
	export class InlineValueText {
		/**
		 * The text of the inline value.
		 */
		readonly text: string;
		/**
		 * The range of the inline value.
		 */
		readonly range: Range;
		/**
		 * Creates a new InlineValueText object.
		 *
		 * @param text The value to be shown for the line.
		 * @param range The document line where to show the inline value.
		 */
		constructor(text: string, range: Range);
	}

	/**
	 * Provide inline value through a variable lookup.
	 */
	export class InlineValueVariableLookup {
		/**
		 * The name of the variable to look up.
		 */
		readonly variableName: string;
		/**
		 * How to perform the lookup.
		 */
		readonly caseSensitiveLookup: boolean;
		/**
		 * The range of the inline value.
		 */
		readonly range: Range;
		/**
		 * Creates a new InlineValueVariableLookup object.
		 *
		 * @param variableName The name of the variable to look up.
		 * @param range The document line where to show the inline value.
		 * @param caseSensitiveLookup How to perform the lookup. If missing lookup is case sensitive.
		 */
		constructor(variableName: string, range: Range, caseSensitiveLookup?: boolean);
	}

	/**
	 * Provide inline value through an expression evaluation.
	 */
	export class InlineValueEvaluatableExpression {
		/**
		 * The expression to evaluate.
		 */
		readonly expression: string;
		/**
		 * The range of the inline value.
		 */
		readonly range: Range;
		/**
		 * Creates a new InlineValueEvaluatableExpression object.
		 *
		 * @param expression The expression to evaluate.
		 * @param range The document line where to show the inline value.
		 */
		constructor(expression: string, range: Range);
	}

	export namespace languages {

		/**
		 * Register a provider that returns inline values for text documents.
		 * If debugging has stopped VS Code shows inline values in the editor at the end of lines.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inline values provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerInlineValuesProvider(selector: DocumentSelector, provider: InlineValuesProvider): Disposable;
	}

	//#endregion

	// eslint-disable-next-line vscode-dts-region-comments
	//#region @weinand: variables view action contributions

	/**
	 * A DebugProtocolVariableContainer is an opaque stand-in type for the intersection of the Scope and Variable types defined in the Debug Adapter Protocol.
	 * See https://microsoft.github.io/debug-adapter-protocol/specification#Types_Scope and https://microsoft.github.io/debug-adapter-protocol/specification#Types_Variable.
	 */
	export interface DebugProtocolVariableContainer {
		// Properties: the intersection of DAP's Scope and Variable types.
	}

	/**
	 * A DebugProtocolVariable is an opaque stand-in type for the Variable type defined in the Debug Adapter Protocol.
	 * See https://microsoft.github.io/debug-adapter-protocol/specification#Types_Variable.
	 */
	export interface DebugProtocolVariable {
		// Properties: see details [here](https://microsoft.github.io/debug-adapter-protocol/specification#Base_Protocol_Variable).
	}

	//#endregion

	// eslint-disable-next-line vscode-dts-region-comments
	//#region @joaomoreno: SCM validation

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

	// eslint-disable-next-line vscode-dts-region-comments
	//#region @joaomoreno: SCM selected provider

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

	//#region Terminal data write event https://github.com/microsoft/vscode/issues/78502

	export interface TerminalDataWriteEvent {
		/**
		 * The [terminal](#Terminal) for which the data was written.
		 */
		readonly terminal: Terminal;
		/**
		 * The data being written.
		 */
		readonly data: string;
	}

	namespace window {
		/**
		 * An event which fires when the terminal's child pseudo-device is written to (the shell).
		 * In other words, this provides access to the raw data stream from the process running
		 * within the terminal, including VT sequences.
		 */
		export const onDidWriteTerminalData: Event<TerminalDataWriteEvent>;
	}

	//#endregion

	//#region Terminal dimensions property and change event https://github.com/microsoft/vscode/issues/55718

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

	export namespace window {
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
	}

	//#endregion

	// eslint-disable-next-line vscode-dts-region-comments
	//#region @jrieken -> exclusive document filters

	export interface DocumentFilter {
		readonly exclusive?: boolean;
	}

	//#endregion

	//#region Tree View: https://github.com/microsoft/vscode/issues/61313 @alexr00
	export interface TreeView<T> extends Disposable {
		reveal(element: T | undefined, options?: { select?: boolean, focus?: boolean, expand?: boolean | number; }): Thenable<void>;
	}
	//#endregion

	//#region Task presentation group: https://github.com/microsoft/vscode/issues/47265
	export interface TaskPresentationOptions {
		/**
		 * Controls whether the task is executed in a specific terminal group using split panes.
		 */
		group?: string;
	}
	//#endregion

	//#region Status bar item with ID and Name: https://github.com/microsoft/vscode/issues/74972

	export namespace window {

		/**
		 * Options to configure the status bar item.
		 */
		export interface StatusBarItemOptions {

			/**
			 * A unique identifier of the status bar item. The identifier
			 * is for example used to allow a user to show or hide the
			 * status bar item in the UI.
			 */
			id: string;

			/**
			 * A human readable name of the status bar item. The name is
			 * for example used as a label in the UI to show or hide the
			 * status bar item.
			 */
			name: string;

			/**
			 * Accessibility information used when screen reader interacts with this status bar item.
			 */
			accessibilityInformation?: AccessibilityInformation;

			/**
			 * The alignment of the status bar item.
			 */
			alignment?: StatusBarAlignment;

			/**
			 * The priority of the status bar item. Higher value means the item should
			 * be shown more to the left.
			 */
			priority?: number;
		}

		/**
		 * Creates a status bar [item](#StatusBarItem).
		 *
		 * @param options The options of the item. If not provided, some default values
		 * will be assumed. For example, the `StatusBarItemOptions.id` will be the id
		 * of the extension and the `StatusBarItemOptions.name` will be the extension name.
		 * @return A new status bar item.
		 */
		export function createStatusBarItem(options?: StatusBarItemOptions): StatusBarItem;
	}

	//#endregion

	//#region Custom editor move https://github.com/microsoft/vscode/issues/86146

	// TODO: Also for custom editor

	export interface CustomTextEditorProvider {

		/**
		 * Handle when the underlying resource for a custom editor is renamed.
		 *
		 * This allows the webview for the editor be preserved throughout the rename. If this method is not implemented,
		 * VS Code will destory the previous custom editor and create a replacement one.
		 *
		 * @param newDocument New text document to use for the custom editor.
		 * @param existingWebviewPanel Webview panel for the custom editor.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @return Thenable indicating that the webview editor has been moved.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		moveCustomTextEditor?(newDocument: TextDocument, existingWebviewPanel: WebviewPanel, token: CancellationToken): Thenable<void>;
	}

	//#endregion

	//#region allow QuickPicks to skip sorting: https://github.com/microsoft/vscode/issues/73904

	export interface QuickPick<T extends QuickPickItem> extends QuickInput {
		/**
		 * An optional flag to sort the final results by index of first query match in label. Defaults to true.
		 */
		sortByLabel: boolean;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, Notebooks (misc)

	export enum NotebookCellKind {
		Markdown = 1,
		Code = 2
	}

	export enum NotebookCellRunState {
		Running = 1,
		Idle = 2,
		Success = 3,
		Error = 4
	}

	export enum NotebookRunState {
		Running = 1,
		Idle = 2
	}

	// TODO@API
	// make this a class, allow modified using with-pattern
	export interface NotebookCellMetadata {
		/**
		 * Controls whether a cell's editor is editable/readonly.
		 */
		editable?: boolean;

		/**
		 * Controls if the cell has a margin to support the breakpoint UI.
		 * This metadata is ignored for markdown cell.
		 */
		breakpointMargin?: boolean;

		/**
		 * Whether a code cell's editor is collapsed
		 */
		inputCollapsed?: boolean;

		/**
		 * Whether a code cell's outputs are collapsed
		 */
		outputCollapsed?: boolean;

		/**
		 * Additional attributes of a cell metadata.
		 */
		custom?: { [key: string]: any; };
	}

	// todo@API support ids https://github.com/jupyter/enhancement-proposals/blob/master/62-cell-id/cell-id.md
	export interface NotebookCell {
		readonly index: number;
		readonly notebook: NotebookDocument;
		readonly uri: Uri;
		readonly cellKind: NotebookCellKind;
		readonly document: TextDocument;
		readonly language: string;
		readonly outputs: readonly NotebookCellOutput[];
		readonly metadata: NotebookCellMetadata;
		/** @deprecated use WorkspaceEdit.replaceCellOutput */
		// outputs: CellOutput[];
		// readonly outputs2: NotebookCellOutput[];
		/** @deprecated use WorkspaceEdit.replaceCellMetadata */
		// metadata: NotebookCellMetadata;
	}


	export interface NotebookDocumentMetadata {
		/**
		 * Controls if users can add or delete cells
		 * Defaults to true
		 */
		editable?: boolean;

		/**
		 * Default value for [cell editable metadata](#NotebookCellMetadata.editable).
		 * Defaults to true.
		 */
		cellEditable?: boolean;
		displayOrder?: GlobPattern[];

		/**
		 * Additional attributes of the document metadata.
		 */
		custom?: { [key: string]: any; };

		/**
		 * Whether the document is trusted, default to true
		 * When false, insecure outputs like HTML, JavaScript, SVG will not be rendered.
		 */
		trusted?: boolean;
	}

	export interface NotebookDocumentContentOptions {
		/**
		 * Controls if outputs change will trigger notebook document content change and if it will be used in the diff editor
		 * Default to false. If the content provider doesn't persisit the outputs in the file document, this should be set to true.
		 */
		transientOutputs: boolean;

		/**
		 * Controls if a meetadata property change will trigger notebook document content change and if it will be used in the diff editor
		 * Default to false. If the content provider doesn't persisit a metadata property in the file document, it should be set to true.
		 */
		transientMetadata: { [K in keyof NotebookCellMetadata]?: boolean };
	}

	export interface NotebookDocument {
		readonly uri: Uri;
		readonly version: number;
		// todo@API don't have this...
		readonly fileName: string;
		// todo@API should we really expose this?
		readonly viewType: string;
		readonly isDirty: boolean;
		readonly isUntitled: boolean;
		readonly cells: ReadonlyArray<NotebookCell>;
		readonly contentOptions: NotebookDocumentContentOptions;
		readonly metadata: NotebookDocumentMetadata;
	}

	// todo@API maybe have a NotebookCellPosition sibling
	export class NotebookCellRange {
		readonly start: number;
		/**
		 * exclusive
		 */
		readonly end: number;

		constructor(start: number, end: number);
	}

	export enum NotebookEditorRevealType {
		/**
		 * The range will be revealed with as little scrolling as possible.
		 */
		Default = 0,
		/**
		 * The range will always be revealed in the center of the viewport.
		 */
		InCenter = 1,

		/**
		 * If the range is outside the viewport, it will be revealed in the center of the viewport.
		 * Otherwise, it will be revealed with as little scrolling as possible.
		 */
		InCenterIfOutsideViewport = 2,

		/**
		 * The range will always be revealed at the top of the viewport.
		 */
		AtTop = 3
	}

	export interface NotebookEditor {
		/**
		 * The document associated with this notebook editor.
		 */
		readonly document: NotebookDocument;

		/**
		 * The primary selected cell on this notebook editor.
		 */
		// todo@API should not be undefined, rather a default
		readonly selection?: NotebookCell;

		// @rebornix
		// todo@API should replace selection
		// never empty!
		// primary/secondary selections
		// readonly selections: NotebookCellRange[];

		/**
		 * The current visible ranges in the editor (vertically).
		 */
		readonly visibleRanges: NotebookCellRange[];

		revealRange(range: NotebookCellRange, revealType?: NotebookEditorRevealType): void;

		/**
		 * The column in which this editor shows.
		 */
		// @jrieken
		// todo@API maybe never undefined because notebooks always show in the editor area (unlike text editors)
		// maybe for notebook diff editor
		readonly viewColumn?: ViewColumn;

		/**
		 * Fired when the panel is disposed.
		 */
		// @rebornix REMOVE/REplace NotebookCommunication
		// todo@API fishy? notebooks are public objects, there should be a "global" events for this
		readonly onDidDispose: Event<void>;
	}

	export interface NotebookDocumentMetadataChangeEvent {
		readonly document: NotebookDocument;
	}

	export interface NotebookCellsChangeData {
		readonly start: number;
		readonly deletedCount: number;
		readonly deletedItems: NotebookCell[];
		readonly items: NotebookCell[];
	}

	export interface NotebookCellsChangeEvent {

		/**
		 * The affected document.
		 */
		readonly document: NotebookDocument;
		readonly changes: ReadonlyArray<NotebookCellsChangeData>;
	}

	export interface NotebookCellOutputsChangeEvent {

		/**
		 * The affected document.
		 */
		readonly document: NotebookDocument;
		readonly cells: NotebookCell[];
	}

	export interface NotebookCellLanguageChangeEvent {

		/**
		 * The affected document.
		 */
		readonly document: NotebookDocument;
		readonly cell: NotebookCell;
		readonly language: string;
	}

	export interface NotebookCellMetadataChangeEvent {
		readonly document: NotebookDocument;
		readonly cell: NotebookCell;
	}

	export interface NotebookEditorSelectionChangeEvent {
		readonly notebookEditor: NotebookEditor;
		// @rebornix
		// todo@API show NotebookCellRange[] instead
		readonly selection?: NotebookCell;
	}

	export interface NotebookEditorVisibleRangesChangeEvent {
		readonly notebookEditor: NotebookEditor;
		readonly visibleRanges: ReadonlyArray<NotebookCellRange>;
	}

	// todo@API support ids https://github.com/jupyter/enhancement-proposals/blob/master/62-cell-id/cell-id.md
	export interface NotebookCellData {
		readonly cellKind: NotebookCellKind;
		readonly source: string;
		readonly language: string;
		// todo@API maybe use a separate data type?
		readonly outputs: NotebookCellOutput[];
		readonly metadata: NotebookCellMetadata | undefined;
	}

	export interface NotebookData {
		readonly cells: NotebookCellData[];
		readonly metadata: NotebookDocumentMetadata;
	}


	/**
	 * Communication object passed to the {@link NotebookContentProvider} and
	 * {@link NotebookOutputRenderer} to communicate with the webview.
	 */
	export interface NotebookCommunication {
		/**
		 * ID of the editor this object communicates with. A single notebook
		 * document can have multiple attached webviews and editors, when the
		 * notebook is split for instance. The editor ID lets you differentiate
		 * between them.
		 */
		readonly editorId: string;

		/**
		 * Fired when the output hosting webview posts a message.
		 */
		readonly onDidReceiveMessage: Event<any>;
		/**
		 * Post a message to the output hosting webview.
		 *
		 * Messages are only delivered if the editor is live.
		 *
		 * @param message Body of the message. This must be a string or other json serializable object.
		 */
		postMessage(message: any): Thenable<boolean>;

		/**
		 * Convert a uri for the local file system to one that can be used inside outputs webview.
		 */
		asWebviewUri(localResource: Uri): Uri;

		// @rebornix
		// readonly onDidDispose: Event<void>;
	}

	// export function registerNotebookKernel(selector: string, kernel: NotebookKernel): Disposable;


	export interface NotebookDocumentShowOptions {
		viewColumn?: ViewColumn;
		preserveFocus?: boolean;
		preview?: boolean;
		selection?: NotebookCellRange;
	}

	export namespace notebook {

		// todo@API should we really support to pass the viewType? We do NOT support
		// to open the same file with different viewTypes at the same time
		export function openNotebookDocument(uri: Uri, viewType?: string): Thenable<NotebookDocument>;
		export const onDidOpenNotebookDocument: Event<NotebookDocument>;
		export const onDidCloseNotebookDocument: Event<NotebookDocument>;

		// todo@API really needed?
		export const onDidSaveNotebookDocument: Event<NotebookDocument>;

		/**
		 * All currently known notebook documents.
		 */
		export const notebookDocuments: ReadonlyArray<NotebookDocument>;
		export const onDidChangeNotebookDocumentMetadata: Event<NotebookDocumentMetadataChangeEvent>;
		export const onDidChangeNotebookCells: Event<NotebookCellsChangeEvent>;
		export const onDidChangeCellOutputs: Event<NotebookCellOutputsChangeEvent>;

		// todo@API we send document close and open events when the language of a document changes and
		// I believe we should stick that for cells as well
		export const onDidChangeCellLanguage: Event<NotebookCellLanguageChangeEvent>;
		export const onDidChangeCellMetadata: Event<NotebookCellMetadataChangeEvent>;
	}

	export namespace window {
		export const visibleNotebookEditors: NotebookEditor[];
		export const onDidChangeVisibleNotebookEditors: Event<NotebookEditor[]>;
		export const activeNotebookEditor: NotebookEditor | undefined;
		export const onDidChangeActiveNotebookEditor: Event<NotebookEditor | undefined>;
		export const onDidChangeNotebookEditorSelection: Event<NotebookEditorSelectionChangeEvent>;
		export const onDidChangeNotebookEditorVisibleRanges: Event<NotebookEditorVisibleRangesChangeEvent>;
		// TODO@API add overload for just a URI
		export function showNotebookDocument(document: NotebookDocument, options?: NotebookDocumentShowOptions): Thenable<NotebookEditor>;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, NotebookCellOutput

	// code specific mime types
	// application/x.notebook.error-traceback
	// application/x.notebook.stream
	export class NotebookCellOutputItem {

		// todo@API
		// add factory functions for common mime types
		// static textplain(value:string): NotebookCellOutputItem;
		// static errortrace(value:any): NotebookCellOutputItem;

		readonly mime: string;
		readonly value: unknown;
		readonly metadata?: Record<string, string | number | boolean | unknown>;

		constructor(mime: string, value: unknown, metadata?: Record<string, string | number | boolean | unknown>);
	}

	// @jrieken
	//TODO@API add execution count to cell output?
	export class NotebookCellOutput {
		readonly id: string;
		readonly outputs: NotebookCellOutputItem[];
		constructor(outputs: NotebookCellOutputItem[], id?: string);
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, NotebookEditorEdit

	export interface WorkspaceEdit {
		replaceNotebookMetadata(uri: Uri, value: NotebookDocumentMetadata): void;

		// todo@API use NotebookCellRange
		replaceNotebookCells(uri: Uri, start: number, end: number, cells: NotebookCellData[], metadata?: WorkspaceEditEntryMetadata): void;
		replaceNotebookCellMetadata(uri: Uri, index: number, cellMetadata: NotebookCellMetadata, metadata?: WorkspaceEditEntryMetadata): void;

		replaceNotebookCellOutput(uri: Uri, index: number, outputs: NotebookCellOutput[], metadata?: WorkspaceEditEntryMetadata): void;
		appendNotebookCellOutput(uri: Uri, index: number, outputs: NotebookCellOutput[], metadata?: WorkspaceEditEntryMetadata): void;

		// TODO@api
		// https://jupyter-protocol.readthedocs.io/en/latest/messaging.html#update-display-data
		replaceNotebookCellOutputItems(uri: Uri, index: number, outputId: string, items: NotebookCellOutputItem[], metadata?: WorkspaceEditEntryMetadata): void;
		appendNotebookCellOutputItems(uri: Uri, index: number, outputId: string, items: NotebookCellOutputItem[], metadata?: WorkspaceEditEntryMetadata): void;
	}

	export interface NotebookEditorEdit {
		replaceMetadata(value: NotebookDocumentMetadata): void;
		replaceCells(start: number, end: number, cells: NotebookCellData[]): void;
		replaceCellOutput(index: number, outputs: NotebookCellOutput[]): void;
		replaceCellMetadata(index: number, metadata: NotebookCellMetadata): void;
	}

	export interface NotebookEditor {
		/**
		 * Perform an edit on the notebook associated with this notebook editor.
		 *
		 * The given callback-function is invoked with an [edit-builder](#NotebookEditorEdit) which must
		 * be used to make edits. Note that the edit-builder is only valid while the
		 * callback executes.
		 *
		 * @param callback A function which can create edits using an [edit-builder](#NotebookEditorEdit).
		 * @return A promise that resolves with a value indicating if the edits could be applied.
		 */
		// @jrieken REMOVE maybe
		edit(callback: (editBuilder: NotebookEditorEdit) => void): Thenable<boolean>;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, NotebookContentProvider

	interface NotebookDocumentBackup {
		/**
		 * Unique identifier for the backup.
		 *
		 * This id is passed back to your extension in `openNotebook` when opening a notebook editor from a backup.
		 */
		readonly id: string;

		/**
		 * Delete the current backup.
		 *
		 * This is called by VS Code when it is clear the current backup is no longer needed, such as when a new backup
		 * is made or when the file is saved.
		 */
		delete(): void;
	}

	interface NotebookDocumentBackupContext {
		readonly destination: Uri;
	}

	interface NotebookDocumentOpenContext {
		readonly backupId?: string;
	}

	export interface NotebookContentProvider {
		readonly options?: NotebookDocumentContentOptions;
		readonly onDidChangeNotebookContentOptions?: Event<NotebookDocumentContentOptions>;
		/**
		 * Content providers should always use [file system providers](#FileSystemProvider) to
		 * resolve the raw content for `uri` as the resouce is not necessarily a file on disk.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		openNotebook(uri: Uri, openContext: NotebookDocumentOpenContext): NotebookData | Thenable<NotebookData>;
		// eslint-disable-next-line vscode-dts-provider-naming
		// eslint-disable-next-line vscode-dts-cancellation
		resolveNotebook(document: NotebookDocument, webview: NotebookCommunication): Thenable<void>;
		// eslint-disable-next-line vscode-dts-provider-naming
		saveNotebook(document: NotebookDocument, cancellation: CancellationToken): Thenable<void>;
		// eslint-disable-next-line vscode-dts-provider-naming
		saveNotebookAs(targetResource: Uri, document: NotebookDocument, cancellation: CancellationToken): Thenable<void>;
		// eslint-disable-next-line vscode-dts-provider-naming
		backupNotebook(document: NotebookDocument, context: NotebookDocumentBackupContext, cancellation: CancellationToken): Thenable<NotebookDocumentBackup>;

		// ???
		// provideKernels(document: NotebookDocument, token: CancellationToken): ProviderResult<T[]>;
	}

	export namespace notebook {

		// TODO@api use NotebookDocumentFilter instead of just notebookType:string?
		// TODO@API options duplicates the more powerful variant on NotebookContentProvider
		export function registerNotebookContentProvider(notebookType: string, provider: NotebookContentProvider,
			options?: NotebookDocumentContentOptions & {
				/**
				 * Not ready for production or development use yet.
				 */
				viewOptions?: {
					displayName: string;
					filenamePattern: NotebookFilenamePattern[];
					exclusive?: boolean;
				};
			}
		): Disposable;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, NotebookKernel

	export interface NotebookDocumentMetadata {

		/**
		 * Controls whether the full notebook can be run at once.
		 * Defaults to true
		 */
		// todo@API infer from kernel
		// todo@API remove
		runnable?: boolean;

		/**
		 * Default value for [cell runnable metadata](#NotebookCellMetadata.runnable).
		 * Defaults to true.
		 */
		cellRunnable?: boolean;

		/**
		 * Default value for [cell hasExecutionOrder metadata](#NotebookCellMetadata.hasExecutionOrder).
		 * Defaults to true.
		 */
		cellHasExecutionOrder?: boolean;

		/**
		 * The document's current run state
		 */
		runState?: NotebookRunState;
	}

	// todo@API use the NotebookCellExecution-object as a container to model and enforce
	// the flow of a cell execution

	// kernel -> execute_info
	// ext -> createNotebookCellExecution(cell)
	// kernel -> done
	// exec.dispose();

	// export interface NotebookCellExecution {
	// 	dispose(): void;
	// 	clearOutput(): void;
	// 	appendOutput(out: NotebookCellOutput): void;
	// 	replaceOutput(out: NotebookCellOutput): void;
	//  appendOutputItems(output:string, items: NotebookCellOutputItem[]):void;
	//  replaceOutputItems(output:string, items: NotebookCellOutputItem[]):void;
	// }

	// export function createNotebookCellExecution(cell: NotebookCell, startTime?: number): NotebookCellExecution;
	// export const onDidStartNotebookCellExecution: Event<any>;
	// export const onDidStopNotebookCellExecution: Event<any>;

	export interface NotebookCellMetadata {

		/**
		 * Controls if the cell is executable.
		 * This metadata is ignored for markdown cell.
		 */
		// todo@API infer from kernel
		runnable?: boolean;

		/**
		 * Whether the [execution order](#NotebookCellMetadata.executionOrder) indicator will be displayed.
		 * Defaults to true.
		 */
		hasExecutionOrder?: boolean;

		/**
		 * The order in which this cell was executed.
		 */
		executionOrder?: number;

		/**
		 * A status message to be shown in the cell's status bar
		 */
		// todo@API duplicates status bar API
		statusMessage?: string;

		/**
		 * The cell's current run state
		 */
		runState?: NotebookCellRunState;

		/**
		 * If the cell is running, the time at which the cell started running
		 */
		runStartTime?: number;

		/**
		 * The total duration of the cell's last run
		 */
		// todo@API depends on having output
		lastRunDuration?: number;
	}

	export interface NotebookKernel {
		readonly id?: string;
		label: string;
		description?: string;
		detail?: string;
		isPreferred?: boolean;
		preloads?: Uri[];

		// TODO@API control runnable state of cell
		/**
		 * languages supported by kernel
		 * - first is preferred
		 * - `undefined` means all languages available in the editor
		 */
		supportedLanguages?: string[];

		// @roblourens
		// todo@API change to `executeCells(document: NotebookDocument, cells: NotebookCellRange[], context:{isWholeNotebooke: boolean}, token: CancelationToken): void;`
		// todo@API interrupt vs cancellation, https://github.com/microsoft/vscode/issues/106741
		// interrupt?():void;
		executeCell(document: NotebookDocument, cell: NotebookCell): void;
		cancelCellExecution(document: NotebookDocument, cell: NotebookCell): void;
		executeAllCells(document: NotebookDocument): void;
		cancelAllCellsExecution(document: NotebookDocument): void;
	}

	export type NotebookFilenamePattern = GlobPattern | { include: GlobPattern; exclude: GlobPattern; };

	// todo@API why not for NotebookContentProvider?
	export interface NotebookDocumentFilter {
		viewType?: string | string[];
		filenamePattern?: NotebookFilenamePattern;
	}

	// todo@API very unclear, provider MUST not return alive object but only data object
	// todo@API unclear how the flow goes
	export interface NotebookKernelProvider<T extends NotebookKernel = NotebookKernel> {
		onDidChangeKernels?: Event<NotebookDocument | undefined>;
		provideKernels(document: NotebookDocument, token: CancellationToken): ProviderResult<T[]>;
		resolveKernel?(kernel: T, document: NotebookDocument, webview: NotebookCommunication, token: CancellationToken): ProviderResult<void>;
	}

	export interface NotebookEditor {
		/**
		 * Active kernel used in the editor
		 */
		// todo@API unsure about that
		// kernel, kernel selection, kernel provider
		readonly kernel?: NotebookKernel;
	}

	export namespace notebook {
		export const onDidChangeActiveNotebookKernel: Event<{ document: NotebookDocument, kernel: NotebookKernel | undefined; }>;

		export function registerNotebookKernelProvider(selector: NotebookDocumentFilter, provider: NotebookKernelProvider): Disposable;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, NotebookEditorDecorationType

	export interface NotebookEditor {
		setDecorations(decorationType: NotebookEditorDecorationType, range: NotebookCellRange): void;
	}

	export interface NotebookDecorationRenderOptions {
		backgroundColor?: string | ThemeColor;
		borderColor?: string | ThemeColor;
		top: ThemableDecorationAttachmentRenderOptions;
	}

	export interface NotebookEditorDecorationType {
		readonly key: string;
		dispose(): void;
	}

	export namespace notebook {
		export function createNotebookEditorDecorationType(options: NotebookDecorationRenderOptions): NotebookEditorDecorationType;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, NotebookCellStatusBarItem

	/**
	 * Represents the alignment of status bar items.
	 */
	export enum NotebookCellStatusBarAlignment {

		/**
		 * Aligned to the left side.
		 */
		Left = 1,

		/**
		 * Aligned to the right side.
		 */
		Right = 2
	}

	export interface NotebookCellStatusBarItem {
		readonly cell: NotebookCell;
		readonly alignment: NotebookCellStatusBarAlignment;
		readonly priority?: number;
		text: string;
		tooltip: string | undefined;
		command: string | Command | undefined;
		accessibilityInformation?: AccessibilityInformation;
		show(): void;
		hide(): void;
		dispose(): void;
	}

	export namespace notebook {
		/**
		 * Creates a notebook cell status bar [item](#NotebookCellStatusBarItem).
		 * It will be disposed automatically when the notebook document is closed or the cell is deleted.
		 *
		 * @param cell The cell on which this item should be shown.
		 * @param alignment The alignment of the item.
		 * @param priority The priority of the item. Higher values mean the item should be shown more to the left.
		 * @return A new status bar item.
		 */
		// @roblourens
		// todo@API this should be a provider, https://github.com/microsoft/vscode/issues/105809
		export function createCellStatusBarItem(cell: NotebookCell, alignment?: NotebookCellStatusBarAlignment, priority?: number): NotebookCellStatusBarItem;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106744, NotebookConcatTextDocument

	export namespace notebook {
		/**
		 * Create a document that is the concatenation of all  notebook cells. By default all code-cells are included
		 * but a selector can be provided to narrow to down the set of cells.
		 *
		 * @param notebook
		 * @param selector
		 */
		// @jrieken REMOVE. p_never
		// todo@API really needed? we didn't find a user here
		export function createConcatTextDocument(notebook: NotebookDocument, selector?: DocumentSelector): NotebookConcatTextDocument;
	}

	export interface NotebookConcatTextDocument {
		uri: Uri;
		isClosed: boolean;
		dispose(): void;
		onDidChange: Event<void>;
		version: number;
		getText(): string;
		getText(range: Range): string;

		offsetAt(position: Position): number;
		positionAt(offset: number): Position;
		validateRange(range: Range): Range;
		validatePosition(position: Position): Position;

		locationAt(positionOrRange: Position | Range): Location;
		positionAt(location: Location): Position;
		contains(uri: Uri): boolean;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/39441

	export interface CompletionItem {
		/**
		 * Will be merged into CompletionItem#label
		 */
		label2?: CompletionItemLabel;
	}

	export interface CompletionItemLabel {
		/**
		 * The function or variable. Rendered leftmost.
		 */
		name: string;

		/**
		 * The parameters without the return type. Render after `name`.
		 */
		parameters?: string;

		/**
		 * The fully qualified name, like package name or file path. Rendered after `signature`.
		 */
		qualifier?: string;

		/**
		 * The return-type of a function or type of a property/variable. Rendered rightmost.
		 */
		type?: string;
	}

	//#endregion

	//#region @eamodio - timeline: https://github.com/microsoft/vscode/issues/84297

	export class TimelineItem {
		/**
		 * A timestamp (in milliseconds since 1 January 1970 00:00:00) for when the timeline item occurred.
		 */
		timestamp: number;

		/**
		 * A human-readable string describing the timeline item.
		 */
		label: string;

		/**
		 * Optional id for the timeline item. It must be unique across all the timeline items provided by this source.
		 *
		 * If not provided, an id is generated using the timeline item's timestamp.
		 */
		id?: string;

		/**
		 * The icon path or [ThemeIcon](#ThemeIcon) for the timeline item.
		 */
		iconPath?: Uri | { light: Uri; dark: Uri; } | ThemeIcon;

		/**
		 * A human readable string describing less prominent details of the timeline item.
		 */
		description?: string;

		/**
		 * The tooltip text when you hover over the timeline item.
		 */
		detail?: string;

		/**
		 * The [command](#Command) that should be executed when the timeline item is selected.
		 */
		command?: Command;

		/**
		 * Context value of the timeline item. This can be used to contribute specific actions to the item.
		 * For example, a timeline item is given a context value as `commit`. When contributing actions to `timeline/item/context`
		 * using `menus` extension point, you can specify context value for key `timelineItem` in `when` expression like `timelineItem == commit`.
		 * ```
		 *	"contributes": {
		 *		"menus": {
		 *			"timeline/item/context": [
		 *				{
		 *					"command": "extension.copyCommitId",
		 *					"when": "timelineItem == commit"
		 *				}
		 *			]
		 *		}
		 *	}
		 * ```
		 * This will show the `extension.copyCommitId` action only for items where `contextValue` is `commit`.
		 */
		contextValue?: string;

		/**
		 * Accessibility information used when screen reader interacts with this timeline item.
		 */
		accessibilityInformation?: AccessibilityInformation;

		/**
		 * @param label A human-readable string describing the timeline item
		 * @param timestamp A timestamp (in milliseconds since 1 January 1970 00:00:00) for when the timeline item occurred
		 */
		constructor(label: string, timestamp: number);
	}

	export interface TimelineChangeEvent {
		/**
		 * The [uri](#Uri) of the resource for which the timeline changed.
		 */
		uri: Uri;

		/**
		 * A flag which indicates whether the entire timeline should be reset.
		 */
		reset?: boolean;
	}

	export interface Timeline {
		readonly paging?: {
			/**
			 * A provider-defined cursor specifying the starting point of timeline items which are after the ones returned.
			 * Use `undefined` to signal that there are no more items to be returned.
			 */
			readonly cursor: string | undefined;
		};

		/**
		 * An array of [timeline items](#TimelineItem).
		 */
		readonly items: readonly TimelineItem[];
	}

	export interface TimelineOptions {
		/**
		 * A provider-defined cursor specifying the starting point of the timeline items that should be returned.
		 */
		cursor?: string;

		/**
		 * An optional maximum number timeline items or the all timeline items newer (inclusive) than the timestamp or id that should be returned.
		 * If `undefined` all timeline items should be returned.
		 */
		limit?: number | { timestamp: number; id?: string; };
	}

	export interface TimelineProvider {
		/**
		 * An optional event to signal that the timeline for a source has changed.
		 * To signal that the timeline for all resources (uris) has changed, do not pass any argument or pass `undefined`.
		 */
		onDidChange?: Event<TimelineChangeEvent | undefined>;

		/**
		 * An identifier of the source of the timeline items. This can be used to filter sources.
		 */
		readonly id: string;

		/**
		 * A human-readable string describing the source of the timeline items. This can be used as the display label when filtering sources.
		 */
		readonly label: string;

		/**
		 * Provide [timeline items](#TimelineItem) for a [Uri](#Uri).
		 *
		 * @param uri The [uri](#Uri) of the file to provide the timeline for.
		 * @param options A set of options to determine how results should be returned.
		 * @param token A cancellation token.
		 * @return The [timeline result](#TimelineResult) or a thenable that resolves to such. The lack of a result
		 * can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideTimeline(uri: Uri, options: TimelineOptions, token: CancellationToken): ProviderResult<Timeline>;
	}

	export namespace workspace {
		/**
		 * Register a timeline provider.
		 *
		 * Multiple providers can be registered. In that case, providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param scheme A scheme or schemes that defines which documents this provider is applicable to. Can be `*` to target all documents.
		 * @param provider A timeline provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		*/
		export function registerTimelineProvider(scheme: string | string[], provider: TimelineProvider): Disposable;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/91555

	export enum StandardTokenType {
		Other = 0,
		Comment = 1,
		String = 2,
		RegEx = 4
	}

	export interface TokenInformation {
		type: StandardTokenType;
		range: Range;
	}

	export namespace languages {
		export function getTokenInformationAtPosition(document: TextDocument, position: Position): Thenable<TokenInformation>;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/16221

	// todo@API rename to InlayHint
	// todo@API add "mini-markdown" for links and styles
	// todo@API remove description
	// (done:)  add InlayHintKind with type, argument, etc

	export namespace languages {
		/**
		 * Register a inline hints provider.
		 *
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inline hints provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerInlineHintsProvider(selector: DocumentSelector, provider: InlineHintsProvider): Disposable;
	}

	export enum InlineHintKind {
		Other = 0,
		Type = 1,
		Parameter = 2,
	}

	/**
	 * Inline hint information.
	 */
	export class InlineHint {
		/**
		 * The text of the hint.
		 */
		text: string;
		/**
		 * The range of the hint.
		 */
		range: Range;

		kind?: InlineHintKind;

		// todo@API remove this
		description?: string | MarkdownString;
		/**
		 * Whitespace before the hint.
		 */
		whitespaceBefore?: boolean;
		/**
		 * Whitespace after the hint.
		 */
		whitespaceAfter?: boolean;

		constructor(text: string, range: Range, kind?: InlineHintKind);
	}

	/**
	 * The inline hints provider interface defines the contract between extensions and
	 * the inline hints feature.
	 */
	export interface InlineHintsProvider {

		/**
		 * An optional event to signal that inline hints have changed.
		 * @see [EventEmitter](#EventEmitter)
		 */
		onDidChangeInlineHints?: Event<void>;

		/**
		 * @param model The document in which the command was invoked.
		 * @param range The range for which line hints should be computed.
		 * @param token A cancellation token.
		 *
		 * @return A list of arguments labels or a thenable that resolves to such.
		 */
		provideInlineHints(model: TextDocument, range: Range, token: CancellationToken): ProviderResult<InlineHint[]>;
	}
	//#endregion

	//#region https://github.com/microsoft/vscode/issues/104436

	export enum ExtensionRuntime {
		/**
		 * The extension is running in a NodeJS extension host. Runtime access to NodeJS APIs is available.
		 */
		Node = 1,
		/**
		 * The extension is running in a Webworker extension host. Runtime access is limited to Webworker APIs.
		 */
		Webworker = 2
	}

	export interface ExtensionContext {
		readonly extensionRuntime: ExtensionRuntime;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/102091

	export interface TextDocument {

		/**
		 * The [notebook](#NotebookDocument) that contains this document as a notebook cell or `undefined` when
		 * the document is not contained by a notebook (this should be the more frequent case).
		 */
		notebook: NotebookDocument | undefined;
	}
	//#endregion

	//#region https://github.com/microsoft/vscode/issues/107467
	/*
		General activation events:
			- `onLanguage:*` most test extensions will want to activate when their
				language is opened to provide code lenses.
			- `onTests:*` new activation event very simiular to `workspaceContains`,
				but only fired when the user wants to run tests or opens the test explorer.
	*/
	export namespace test {
		/**
		 * Registers a provider that discovers tests for the given document
		 * selectors. It is activated when either tests need to be enumerated, or
		 * a document matching the selector is opened.
		 */
		export function registerTestProvider<T extends TestItem>(testProvider: TestProvider<T>): Disposable;

		/**
		 * Runs tests. The "run" contains the list of tests to run as well as a
		 * method that can be used to update their state. At the point in time
		 * that "run" is called, all tests given in the run have their state
		 * automatically set to {@link TestRunState.Queued}.
		 */
		export function runTests<T extends TestItem>(run: TestRunOptions<T>, cancellationToken?: CancellationToken): Thenable<void>;

		/**
		 * Returns an observer that retrieves tests in the given workspace folder.
		 */
		export function createWorkspaceTestObserver(workspaceFolder: WorkspaceFolder): TestObserver;

		/**
		 * Returns an observer that retrieves tests in the given text document.
		 */
		export function createDocumentTestObserver(document: TextDocument): TestObserver;

		/**
		 * The last or selected test run. Cleared when a new test run starts.
		 */
		export const testResults: TestResults | undefined;

		/**
		 * Event that fires when the testResults are updated.
		 */
		export const onDidChangeTestResults: Event<void>;
	}

	export interface TestResults {
		/**
		 * The results from the latest test run. The array contains a snapshot of
		 * all tests involved in the run at the moment when it completed.
		 */
		readonly tests: ReadonlyArray<RequiredTestItem> | undefined;
	}

	export interface TestObserver {
		/**
		 * List of tests returned by test provider for files in the workspace.
		 */
		readonly tests: ReadonlyArray<RequiredTestItem>;

		/**
		 * An event that fires when an existing test in the collection changes, or
		 * null if a top-level test was added or removed. When fired, the consumer
		 * should check the test item and all its children for changes.
		 */
		readonly onDidChangeTest: Event<TestChangeEvent>;

		/**
		 * An event the fires when all test providers have signalled that the tests
		 * the observer references have been discovered. Providers may continue to
		 * watch for changes and cause {@link onDidChangeTest} to fire as files
		 * change, until the observer is disposed.
		 *
		 * @todo as below
		 */
		readonly onDidDiscoverInitialTests: Event<void>;

		/**
		 * Dispose of the observer, allowing VS Code to eventually tell test
		 * providers that they no longer need to update tests.
		 */
		dispose(): void;
	}

	export interface TestChangeEvent {
		/**
		 * List of all tests that are newly added.
		 */
		readonly added: ReadonlyArray<RequiredTestItem>;

		/**
		 * List of existing tests that have updated.
		 */
		readonly updated: ReadonlyArray<RequiredTestItem>;

		/**
		 * List of existing tests that have been removed.
		 */
		readonly removed: ReadonlyArray<RequiredTestItem>;

		/**
		 * Highest node in the test tree under which changes were made. This can
		 * be easily plugged into events like the TreeDataProvider update event.
		 */
		readonly commonChangeAncestor: RequiredTestItem | null;
	}

	/**
	 * Tree of tests returned from the provide methods in the {@link TestProvider}.
	 */
	export interface TestHierarchy<T extends TestItem> {
		/**
		 * Root node for tests. The `testRoot` instance must not be replaced over
		 * the lifespan of the TestHierarchy, since you will need to reference it
		 * in `onDidChangeTest` when a test is added or removed.
		 */
		readonly root: T;

		/**
		 * An event that fires when an existing test under the `root` changes.
		 * This can be a result of a state change in a test run, a property update,
		 * or an update to its children. Changes made to tests will not be visible
		 * to {@link TestObserver} instances until this event is fired.
		 *
		 * This will signal a change recursively to all children of the given node.
		 * For example, firing the event with the {@link testRoot} will refresh
		 * all tests.
		 */
		readonly onDidChangeTest: Event<T>;

		/**
		 * Promise that should be resolved when all tests that are initially
		 * defined have been discovered. The provider should continue to watch for
		 * changes and fire `onDidChangeTest` until the hierarchy is disposed.
		 */
		readonly discoveredInitialTests?: Thenable<unknown>;

		/**
		 * An event that fires when a test becomes outdated, as a result of
		 * file changes, for example. In "watch" mode, tests that are outdated
		 * will be automatically re-run after a short delay. Firing a test
		 * with children will mark the entire subtree as outdated.
		 */
		readonly onDidInvalidateTest?: Event<T>;

		/**
		 * Dispose will be called when there are no longer observers interested
		 * in the hierarchy.
		 */
		dispose(): void;
	}

	/**
	 * Discovers and provides tests. It's expected that the TestProvider will
	 * ambiently listen to {@link vscode.window.onDidChangeVisibleTextEditors} to
	 * provide test information about the open files for use in code lenses and
	 * other file-specific UI.
	 *
	 * Additionally, the UI may request it to discover tests for the workspace
	 * via `addWorkspaceTests`.
	 *
	 * @todo rename from provider
	 */
	export interface TestProvider<T extends TestItem = TestItem> {
		/**
		 * Requests that tests be provided for the given workspace. This will
		 * generally be called when tests need to be enumerated for the
		 * workspace.
		 *
		 * It's guaranteed that this method will not be called again while
		 * there is a previous undisposed watcher for the given workspace folder.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		createWorkspaceTestHierarchy?(workspace: WorkspaceFolder): TestHierarchy<T> | undefined;

		/**
		 * Requests that tests be provided for the given document. This will
		 * be called when tests need to be enumerated for a single open file,
		 * for instance by code lens UI.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		createDocumentTestHierarchy?(document: TextDocument): TestHierarchy<T> | undefined;

		/**
		 * Starts a test run. This should cause {@link onDidChangeTest} to
		 * fire with update test states during the run.
		 * @todo this will eventually need to be able to return a summary report, coverage for example.
		 */
		// eslint-disable-next-line vscode-dts-provider-naming
		runTests?(options: TestRun<T>, cancellationToken: CancellationToken): ProviderResult<void>;
	}

	/**
	 * Options given to {@link test.runTests}
	 */
	export interface TestRunOptions<T extends TestItem = TestItem> {
		/**
		 * Array of specific tests to run. The {@link TestProvider.testRoot} may
		 * be provided as an indication to run all tests.
		 */
		tests: T[];

		/**
		 * Whether or not tests in this run should be debugged.
		 */
		debug: boolean;
	}

	/**
	 * Options given to `TestProvider.runTests`
	 */
	export interface TestRun<T extends TestItem = TestItem> extends TestRunOptions<T> {
		/**
		 * Updates the state of the test in the run. By default, all tests involved
		 * in the run will have a "queued" state until they are updated by this method.
		 */
		setState(test: T, state: TestState): void;
	}

	/**
	 * A test item is an item shown in the "test explorer" view. It encompasses
	 * both a suite and a test, since they have almost or identical capabilities.
	 */
	export interface TestItem {
		/**
		 * Display name describing the test case.
		 */
		label: string;

		/**
		 * Optional unique identifier for the TestItem. This is used to correlate
		 * test results and tests in the document with those in the workspace
		 * (test explorer). This must not change for the lifetime of a test item.
		 *
		 * If the ID is not provided, it defaults to the concatenation of the
		 * item's label and its parent's ID, if any.
		 */
		readonly id?: string;

		/**
		 * Optional description that appears next to the label.
		 */
		description?: string;

		/**
		 * Whether this test item can be run individually, defaults to `true`
		 * if not provided.
		 *
		 * In some cases, like Go's tests, test can have children but these
		 * children cannot be run independently.
		 */
		runnable?: boolean;

		/**
		 * Whether this test item can be debugged. Defaults to `false` if not provided.
		 */
		debuggable?: boolean;

		/**
		 * VS Code location.
		 */
		location?: Location;

		/**
		 * Optional list of nested tests for this item.
		 */
		children?: TestItem[];
	}

	/**
	 * A {@link TestItem} with its defaults filled in.
	 */
	export type RequiredTestItem = {
		[K in keyof Required<TestItem>]: K extends 'children'
		? RequiredTestItem[]
		: (K extends 'description' | 'location' ? TestItem[K] : Required<TestItem>[K])
	};

	export enum TestRunState {
		// Initial state
		Unset = 0,
		// Test will be run, but is not currently running.
		Queued = 1,
		// Test is currently running
		Running = 2,
		// Test run has passed
		Passed = 3,
		// Test run has failed (on an assertion)
		Failed = 4,
		// Test run has been skipped
		Skipped = 5,
		// Test run failed for some other reason (compilation error, timeout, etc)
		Errored = 6
	}

	/**
	 * TestState includes a test and its run state. This is included in the
	 * {@link TestItem} and is immutable; it should be replaced in th TestItem
	 * in order to update it. This allows consumers to quickly and easily check
	 * for changes via object identity.
	 */
	export interface TestState {
		/**
		 * Current state of the test.
		 */
		readonly state: TestRunState;

		/**
		 * Optional duration of the test run, in milliseconds.
		 */
		readonly duration?: number;

		/**
		 * Associated test run message. Can, for example, contain assertion
		 * failure information if the test fails.
		 */
		readonly messages?: ReadonlyArray<Readonly<TestMessage>>;
	}

	/**
	 * Represents the severity of test messages.
	 */
	export enum TestMessageSeverity {
		Error = 0,
		Warning = 1,
		Information = 2,
		Hint = 3
	}

	/**
	 * Message associated with the test state. Can be linked to a specific
	 * source range -- useful for assertion failures, for example.
	 */
	export interface TestMessage {
		/**
		 * Human-readable message text to display.
		 */
		message: string | MarkdownString;

		/**
		 * Message severity. Defaults to "Error", if not provided.
		 */
		severity?: TestMessageSeverity;

		/**
		 * Expected test output. If given with `actual`, a diff view will be shown.
		 */
		expectedOutput?: string;

		/**
		 * Actual test output. If given with `actual`, a diff view will be shown.
		 */
		actualOutput?: string;

		/**
		 * Associated file location.
		 */
		location?: Location;
	}

	//#endregion

	//#region Opener service (https://github.com/microsoft/vscode/issues/109277)

	/**
	 * Details if an `ExternalUriOpener` can open a uri.
	 *
	 * The priority is also used to rank multiple openers against each other and determine
	 * if an opener should be selected automatically or if the user should be prompted to
	 * select an opener.
	 *
	 * VS Code will try to use the best available opener, as sorted by `ExternalUriOpenerPriority`.
	 * If there are multiple potential "best" openers for a URI, then the user will be prompted
	 * to select an opener.
	 */
	export enum ExternalUriOpenerPriority {
		/**
		 * The opener is disabled and will never be shown to users.
		 *
		 * Note that the opener can still be used if the user specifically
		 * configures it in their settings.
		 */
		None = 0,

		/**
		 * The opener can open the uri but will not cause a prompt on its own
		 * since VS Code always contributes a built-in `Default` opener.
		 */
		Option = 1,

		/**
		 * The opener can open the uri.
		 *
		 * VS Code's built-in opener has `Default` priority. This means that any additional `Default`
		 * openers will cause the user to be prompted to select from a list of all potential openers.
		 */
		Default = 2,

		/**
		 * The opener can open the uri and should be automatically selected over any
		 * default openers, include the built-in one from VS Code.
		 *
		 * A preferred opener will be automatically selected if no other preferred openers
		 * are available. If multiple preferred openers are available, then the user
		 * is shown a prompt with all potential openers (not just preferred openers).
		 */
		Preferred = 3,
	}

	/**
	 * Handles opening uris to external resources, such as http(s) links.
	 *
	 * Extensions can implement an `ExternalUriOpener` to open `http` links to a webserver
	 * inside of VS Code instead of having the link be opened by the web browser.
	 *
	 * Currently openers may only be registered for `http` and `https` uris.
	 */
	export interface ExternalUriOpener {

		/**
		 * Check if the opener can open a uri.
		 *
		 * @param uri The uri being opened. This is the uri that the user clicked on. It has
		 * not yet gone through port forwarding.
		 * @param token Cancellation token indicating that the result is no longer needed.
		 *
		 * @return Priority indicating if the opener can open the external uri.
		 */
		canOpenExternalUri(uri: Uri, token: CancellationToken): ExternalUriOpenerPriority | Thenable<ExternalUriOpenerPriority>;

		/**
		 * Open a uri.
		 *
		 * This is invoked when:
		 *
		 * - The user clicks a link which does not have an assigned opener. In this case, first `canOpenExternalUri`
		 *   is called and if the user selects this opener, then `openExternalUri` is called.
		 * - The user sets the default opener for a link in their settings and then visits a link.
		 *
		 * @param resolvedUri The uri to open. This uri may have been transformed by port forwarding, so it
		 * may not match the original uri passed to `canOpenExternalUri`. Use `ctx.originalUri` to check the
		 * original uri.
		 * @param ctx Additional information about the uri being opened.
		 * @param token Cancellation token indicating that opening has been canceled.
		 *
		 * @return Thenable indicating that the opening has completed.
		 */
		openExternalUri(resolvedUri: Uri, ctx: OpenExternalUriContext, token: CancellationToken): Thenable<void> | void;
	}

	/**
	 * Additional information about the uri being opened.
	 */
	interface OpenExternalUriContext {
		/**
		 * The uri that triggered the open.
		 *
		 * This is the original uri that the user clicked on or that was passed to `openExternal.`
		 * Due to port forwarding, this may not match the `resolvedUri` passed to `openExternalUri`.
		 */
		readonly sourceUri: Uri;
	}

	/**
	 * Additional metadata about a registered `ExternalUriOpener`.
	 */
	interface ExternalUriOpenerMetadata {

		/**
		 * List of uri schemes the opener is triggered for.
		 *
		 * Currently only `http` and `https` are supported.
		 */
		readonly schemes: readonly string[]

		/**
		 * Text displayed to the user that explains what the opener does.
		 *
		 * For example, 'Open in browser preview'
		 */
		readonly label: string;
	}

	namespace window {
		/**
		 * Register a new `ExternalUriOpener`.
		 *
		 * When a uri is about to be opened, an `onOpenExternalUri:SCHEME` activation event is fired.
		 *
		 * @param id Unique id of the opener, such as `myExtension.browserPreview`. This is used in settings
		 *   and commands to identify the opener.
		 * @param opener Opener to register.
		 * @param metadata Additional information about the opener.
		 *
		* @returns Disposable that unregisters the opener.
		*/
		export function registerExternalUriOpener(id: string, opener: ExternalUriOpener, metadata: ExternalUriOpenerMetadata): Disposable;
	}

	interface OpenExternalOptions {
		/**
		 * Allows using openers contributed by extensions through  `registerExternalUriOpener`
		 * when opening the resource.
		 *
		 * If `true`, VS Code will check if any contributed openers can handle the
		 * uri, and fallback to the default opener behavior.
		 *
		 * If it is string, this specifies the id of the `ExternalUriOpener`
		 * that should be used if it is available. Use `'default'` to force VS Code's
		 * standard external opener to be used.
		 */
		readonly allowContributedOpeners?: boolean | string;
	}

	namespace env {
		export function openExternal(target: Uri, options?: OpenExternalOptions): Thenable<boolean>;
	}

	//#endregion

	//#region https://github.com/Microsoft/vscode/issues/15178

	// TODO@API must be a class
	export interface OpenEditorInfo {
		name: string;
		resource: Uri;
	}

	export namespace window {
		export const openEditors: ReadonlyArray<OpenEditorInfo>;

		// todo@API proper event type
		export const onDidChangeOpenEditors: Event<void>;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/106488

	export enum WorkspaceTrustState {
		/**
		 * The workspace is untrusted, and it will have limited functionality.
		 */
		Untrusted = 0,

		/**
		 * The workspace is trusted, and all functionality will be available.
		 */
		Trusted = 1,

		/**
		 * The initial state of the workspace.
		 *
		 * If trust will be required, users will be prompted to make a choice.
		 */
		Unknown = 2
	}

	/**
	 * The event data that is fired when the trust state of the workspace changes
	 */
	export interface WorkspaceTrustStateChangeEvent {
		/**
		 * Previous trust state of the workspace
		 */
		previousTrustState: WorkspaceTrustState;

		/**
		 * Current trust state of the workspace
		 */
		currentTrustState: WorkspaceTrustState;
	}

	export namespace workspace {
		/**
		 * The trust state of the current workspace
		 */
		export const trustState: WorkspaceTrustState;

		/**
		 * Prompt the user to chose whether to trust the current workspace
		 * @param message Optional message which would be displayed in the prompt
		 */
		export function requireWorkspaceTrust(message?: string): Thenable<WorkspaceTrustState>;

		/**
		 * Event that fires when the trust state of the current workspace changes
		 */
		export const onDidChangeWorkspaceTrustState: Event<WorkspaceTrustStateChangeEvent>;
	}

	//#endregion
}
