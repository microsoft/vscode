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

	// #region auth provider: https://github.com/microsoft/vscode/issues/88309

	export interface AuthenticationSession {
		id: string;
		getAccessToken(): Thenable<string>;
		accountName: string;
		scopes: string[]
	}

	/**
	 * An [event](#Event) which fires when an [AuthenticationProvider](#AuthenticationProvider) is added or removed.
	 */
	export interface AuthenticationProvidersChangeEvent {
		/**
		 * The ids of the [authenticationProvider](#AuthenticationProvider)s that have been added.
		 */
		readonly added: string[];

		/**
		 * The ids of the [authenticationProvider](#AuthenticationProvider)s that have been removed.
		 */
		readonly removed: string[];
	}

	/**
	* An [event](#Event) which fires when an [AuthenticationSession](#AuthenticationSession) is added, removed, or changed.
	*/
	export interface AuthenticationSessionsChangeEvent {
		/**
		 * The ids of the [AuthenticationSession](#AuthenticationSession)s that have been added.
		*/
		readonly added: string[];

		/**
		 * The ids of the [AuthenticationSession](#AuthenticationSession)s that have been removed.
		 */
		readonly removed: string[];

		/**
		 * The ids of the [AuthenticationSession](#AuthenticationSession)s that have been changed.
		 */
		readonly changed: string[];
	}

	/**
	 * **WARNING** When writing an AuthenticationProvider, `id` should be treated as part of your extension's
	 * API, changing it is a breaking change for all extensions relying on the provider. The id is
	 * treated case-sensitively.
	 */
	export interface AuthenticationProvider {
		/**
		 * Used as an identifier for extensions trying to work with a particular
		 * provider: 'microsoft', 'github', etc. id must be unique, registering
		 * another provider with the same id will fail.
		 */
		readonly id: string;
		readonly displayName: string;

		/**
		 * An [event](#Event) which fires when the array of sessions has changed, or data
		 * within a session has changed.
		 */
		readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>;

		/**
		 * Returns an array of current sessions.
		 */
		getSessions(): Thenable<ReadonlyArray<AuthenticationSession>>;

		/**
		 * Prompts a user to login.
		 */
		login(scopes: string[]): Thenable<AuthenticationSession>;
		logout(sessionId: string): Thenable<void>;
	}

	export namespace authentication {
		export function registerAuthenticationProvider(provider: AuthenticationProvider): Disposable;

		/**
		 * Fires with the provider id that was registered or unregistered.
		 */
		export const onDidChangeAuthenticationProviders: Event<AuthenticationProvidersChangeEvent>;

		/**
		 * An array of the ids of authentication providers that are currently registered.
		 */
		export const providerIds: string[];

		/**
		 * Get existing authentication sessions. Rejects if a provider with providerId is not
		 * registered, or if the user does not consent to sharing authentication information with
		 * the extension.
		 */
		export function getSessions(providerId: string, scopes: string[]): Thenable<readonly AuthenticationSession[]>;

		/**
		* Prompt a user to login to create a new authenticaiton session. Rejects if a provider with
		* providerId is not registered, or if the user does not consent to sharing authentication
		* information with the extension.
		*/
		export function login(providerId: string, scopes: string[]): Thenable<AuthenticationSession>;

		/**
		* An [event](#Event) which fires when the array of sessions has changed, or data
		* within a session has changed for a provider. Fires with the ids of the providers
		* that have had session data change.
		*/
		export const onDidChangeSessions: Event<{ [providerId: string]: AuthenticationSessionsChangeEvent }>;
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

	export interface ResolvedOptions {
		extensionHostEnv?: { [key: string]: string | null };
	}

	export interface TunnelOptions {
		remoteAddress: { port: number, host: string };
		// The desired local port. If this port can't be used, then another will be chosen.
		localAddressPort?: number;
		label?: string;
	}

	export interface TunnelDescription {
		remoteAddress: { port: number, host: string };
		//The complete local address(ex. localhost:1234)
		localAddress: { port: number, host: string } | string;
	}

	export interface Tunnel extends TunnelDescription {
		// Implementers of Tunnel should fire onDidDispose when dispose is called.
		onDidDispose: Event<void>;
		dispose(): void;
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
		 */
		tunnelFactory?: (tunnelOptions: TunnelOptions) => Thenable<Tunnel> | undefined;

		/**
		 * Provides filtering for candidate ports.
		 */
		showCandidatePort?: (host: string, port: number, detail: string) => Thenable<boolean>;
	}

	export namespace workspace {
		/**
		 * Forwards a port. If the current resolver implements RemoteAuthorityResolver:forwardPort then that will be used to make the tunnel.
		 * By default, openTunnel only support localhost; however, RemoteAuthorityResolver:tunnelFactory can be used to support other ips.
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
		// TODO@isi
		// eslint-disable-next-line vscode-dts-literal-or-types
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

	//#region Semantic tokens: https://github.com/microsoft/vscode/issues/86415

	export class SemanticTokensLegend {
		public readonly tokenTypes: string[];
		public readonly tokenModifiers: string[];

		constructor(tokenTypes: string[], tokenModifiers: string[]);
	}

	export class SemanticTokensBuilder {
		constructor();
		push(line: number, char: number, length: number, tokenType: number, tokenModifiers: number): void;
		build(): Uint32Array;
	}

	export class SemanticTokens {
		/**
		 * The result id of the tokens.
		 *
		 * This is the id that will be passed to `DocumentSemanticTokensProvider.provideDocumentSemanticTokensEdits` (if implemented).
		 */
		readonly resultId?: string;
		readonly data: Uint32Array;

		constructor(data: Uint32Array, resultId?: string);
	}

	export class SemanticTokensEdits {
		/**
		 * The result id of the tokens.
		 *
		 * This is the id that will be passed to `DocumentSemanticTokensProvider.provideDocumentSemanticTokensEdits` (if implemented).
		 */
		readonly resultId?: string;
		readonly edits: SemanticTokensEdit[];

		constructor(edits: SemanticTokensEdit[], resultId?: string);
	}

	export class SemanticTokensEdit {
		readonly start: number;
		readonly deleteCount: number;
		readonly data?: Uint32Array;

		constructor(start: number, deleteCount: number, data?: Uint32Array);
	}

	/**
	 * The document semantic tokens provider interface defines the contract between extensions and
	 * semantic tokens.
	 */
	export interface DocumentSemanticTokensProvider {
		/**
		 * An optional event to signal that the semantic tokens from this provider have changed.
		 */
		onDidChangeSemanticTokens?: Event<void>;

		/**
		 * A file can contain many tokens, perhaps even hundreds of thousands of tokens. Therefore, to improve
		 * the memory consumption around describing semantic tokens, we have decided to avoid allocating an object
		 * for each token and we represent tokens from a file as an array of integers. Furthermore, the position
		 * of each token is expressed relative to the token before it because most tokens remain stable relative to
		 * each other when edits are made in a file.
		 *
		 * ---
		 * In short, each token takes 5 integers to represent, so a specific token `i` in the file consists of the following array indices:
		 *  - at index `5*i`   - `deltaLine`: token line number, relative to the previous token
		 *  - at index `5*i+1` - `deltaStart`: token start character, relative to the previous token (relative to 0 or the previous token's start if they are on the same line)
		 *  - at index `5*i+2` - `length`: the length of the token. A token cannot be multiline.
		 *  - at index `5*i+3` - `tokenType`: will be looked up in `SemanticTokensLegend.tokenTypes`. We currently ask that `tokenType` < 65536.
		 *  - at index `5*i+4` - `tokenModifiers`: each set bit will be looked up in `SemanticTokensLegend.tokenModifiers`
		 *
		 * ---
		 * ### How to encode tokens
		 *
		 * Here is an example for encoding a file with 3 tokens in a uint32 array:
		 * ```
		 *    { line: 2, startChar:  5, length: 3, tokenType: "property",  tokenModifiers: ["private", "static"] },
		 *    { line: 2, startChar: 10, length: 4, tokenType: "type",      tokenModifiers: [] },
		 *    { line: 5, startChar:  2, length: 7, tokenType: "class",     tokenModifiers: [] }
		 * ```
		 *
		 * 1. First of all, a legend must be devised. This legend must be provided up-front and capture all possible token types.
		 * For this example, we will choose the following legend which must be passed in when registering the provider:
		 * ```
		 *    tokenTypes: ['property', 'type', 'class'],
		 *    tokenModifiers: ['private', 'static']
		 * ```
		 *
		 * 2. The first transformation step is to encode `tokenType` and `tokenModifiers` as integers using the legend. Token types are looked
		 * up by index, so a `tokenType` value of `1` means `tokenTypes[1]`. Multiple token modifiers can be set by using bit flags,
		 * so a `tokenModifier` value of `3` is first viewed as binary `0b00000011`, which means `[tokenModifiers[0], tokenModifiers[1]]` because
		 * bits 0 and 1 are set. Using this legend, the tokens now are:
		 * ```
		 *    { line: 2, startChar:  5, length: 3, tokenType: 0, tokenModifiers: 3 },
		 *    { line: 2, startChar: 10, length: 4, tokenType: 1, tokenModifiers: 0 },
		 *    { line: 5, startChar:  2, length: 7, tokenType: 2, tokenModifiers: 0 }
		 * ```
		 *
		 * 3. The next step is to represent each token relative to the previous token in the file. In this case, the second token
		 * is on the same line as the first token, so the `startChar` of the second token is made relative to the `startChar`
		 * of the first token, so it will be `10 - 5`. The third token is on a different line than the second token, so the
		 * `startChar` of the third token will not be altered:
		 * ```
		 *    { deltaLine: 2, deltaStartChar: 5, length: 3, tokenType: 0, tokenModifiers: 3 },
		 *    { deltaLine: 0, deltaStartChar: 5, length: 4, tokenType: 1, tokenModifiers: 0 },
		 *    { deltaLine: 3, deltaStartChar: 2, length: 7, tokenType: 2, tokenModifiers: 0 }
		 * ```
		 *
		 * 4. Finally, the last step is to inline each of the 5 fields for a token in a single array, which is a memory friendly representation:
		 * ```
		 *    // 1st token,  2nd token,  3rd token
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 *
		 * *NOTE*: When doing edits, it is possible that multiple edits occur until VS Code decides to invoke the semantic tokens provider.
		 * *NOTE*: If the provider cannot temporarily compute semantic tokens, it can indicate this by throwing an error with the message 'Busy'.
		 */
		provideDocumentSemanticTokens(document: TextDocument, token: CancellationToken): ProviderResult<SemanticTokens>;

		/**
		 * Instead of always returning all the tokens in a file, it is possible for a `DocumentSemanticTokensProvider` to implement
		 * this method (`updateSemanticTokens`) and then return incremental updates to the previously provided semantic tokens.
		 *
		 * ---
		 * ### How tokens change when the document changes
		 *
		 * Let's look at how tokens might change.
		 *
		 * Continuing with the above example, suppose a new line was inserted at the top of the file.
		 * That would make all the tokens move down by one line (notice how the line has changed for each one):
		 * ```
		 *    { line: 3, startChar:  5, length: 3, tokenType: "property", tokenModifiers: ["private", "static"] },
		 *    { line: 3, startChar: 10, length: 4, tokenType: "type",     tokenModifiers: [] },
		 *    { line: 6, startChar:  2, length: 7, tokenType: "class",    tokenModifiers: [] }
		 * ```
		 * The integer encoding of the tokens does not change substantially because of the delta-encoding of positions:
		 * ```
		 *    // 1st token,  2nd token,  3rd token
		 *    [  3,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]
		 * ```
		 * It is possible to express these new tokens in terms of an edit applied to the previous tokens:
		 * ```
		 *    [  2,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ] // old tokens
		 *    [  3,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ] // new tokens
		 *
		 *    edit: { start:  0, deleteCount: 1, data: [3] } // replace integer at offset 0 with 3
		 * ```
		 *
		 * Furthermore, let's assume that a new token has appeared on line 4:
		 * ```
		 *    { line: 3, startChar:  5, length: 3, tokenType: "property", tokenModifiers: ["private", "static"] },
		 *    { line: 3, startChar: 10, length: 4, tokenType: "type",      tokenModifiers: [] },
		 *    { line: 4, startChar:  3, length: 5, tokenType: "property", tokenModifiers: ["static"] },
		 *    { line: 6, startChar:  2, length: 7, tokenType: "class",    tokenModifiers: [] }
		 * ```
		 * The integer encoding of the tokens is:
		 * ```
		 *    // 1st token,  2nd token,  3rd token,  4th token
		 *    [  3,5,3,0,3,  0,5,4,1,0,  1,3,5,0,2,  2,2,7,2,0, ]
		 * ```
		 * Again, it is possible to express these new tokens in terms of an edit applied to the previous tokens:
		 * ```
		 *    [  3,5,3,0,3,  0,5,4,1,0,  3,2,7,2,0 ]               // old tokens
		 *    [  3,5,3,0,3,  0,5,4,1,0,  1,3,5,0,2,  2,2,7,2,0, ]  // new tokens
		 *
		 *    edit: { start: 10, deleteCount: 1, data: [1,3,5,0,2,2] } // replace integer at offset 10 with [1,3,5,0,2,2]
		 * ```
		 *
		 * *NOTE*: If the provider cannot compute `SemanticTokensEdits`, it can "give up" and return all the tokens in the document again.
		 * *NOTE*: All edits in `SemanticTokensEdits` contain indices in the old integers array, so they all refer to the previous result state.
		 */
		provideDocumentSemanticTokensEdits?(document: TextDocument, previousResultId: string, token: CancellationToken): ProviderResult<SemanticTokens | SemanticTokensEdits>;
	}

	/**
	 * The document range semantic tokens provider interface defines the contract between extensions and
	 * semantic tokens.
	 */
	export interface DocumentRangeSemanticTokensProvider {
		/**
		 * See [provideDocumentSemanticTokens](#DocumentSemanticTokensProvider.provideDocumentSemanticTokens).
		 */
		provideDocumentRangeSemanticTokens(document: TextDocument, range: Range, token: CancellationToken): ProviderResult<SemanticTokens>;
	}

	export namespace languages {
		/**
		 * Register a semantic tokens provider for a whole document.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their [score](#languages.match) and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document semantic tokens provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDocumentSemanticTokensProvider(selector: DocumentSelector, provider: DocumentSemanticTokensProvider, legend: SemanticTokensLegend): Disposable;

		/**
		 * Register a semantic tokens provider for a document range.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their [score](#languages.match) and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider A document range semantic tokens provider.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDocumentRangeSemanticTokensProvider(selector: DocumentSelector, provider: DocumentRangeSemanticTokensProvider, legend: SemanticTokensLegend): Disposable;
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
		open?(resource: Uri, options: { create: boolean }): number | Thenable<number>;
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

	//#region file-decorations: https://github.com/microsoft/vscode/issues/54938

	export class Decoration {
		letter?: string;
		title?: string;
		color?: ThemeColor;
		priority?: number;
		bubble?: boolean;
	}

	export interface DecorationProvider {
		onDidChangeDecorations: Event<undefined | Uri | Uri[]>;
		provideDecoration(uri: Uri, token: CancellationToken): ProviderResult<Decoration>;
	}

	export namespace window {
		export function registerDecorationProvider(provider: DecorationProvider): Disposable;
	}

	//#endregion

	//#region deprecated debug API

	export interface DebugConfigurationProvider {
		/**
		 * Deprecated, use DebugAdapterDescriptorFactory.provideDebugAdapter instead.
		 * @deprecated Use DebugAdapterDescriptorFactory.createDebugAdapterDescriptor instead
		 */
		debugAdapterExecutable?(folder: WorkspaceFolder | undefined, token?: CancellationToken): ProviderResult<DebugAdapterExecutable>;
	}

	//#endregion

	//#region LogLevel: https://github.com/microsoft/vscode/issues/85992

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
		 * An event which fires when the terminal's pty slave pseudo-device is written to. In other
		 * words, this provides access to the raw data stream from the process running within the
		 * terminal, including VT sequences.
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
	}

	//#endregion

	//#region Terminal link handlers https://github.com/microsoft/vscode/issues/91606

	export namespace window {
		export function registerTerminalLinkHandler(handler: TerminalLinkHandler): Disposable;
	}

	export interface TerminalLinkHandler {
		/**
		 * @return true when the link was handled (and should not be considered by
		 * other providers including the default), false when the link was not handled.
		 */
		handleLink(terminal: Terminal, link: string): ProviderResult<boolean>;
	}

	//#endregion

	//#region Joh -> exclusive document filters

	export interface DocumentFilter {
		exclusive?: boolean;
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

	//#region Tree View: https://github.com/microsoft/vscode/issues/61313
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

	//#region CustomExecution: https://github.com/microsoft/vscode/issues/81007
	/**
	 * A task to execute
	 */
	export class Task2 extends Task {
		detail?: string;
	}

	export class CustomExecution2 extends CustomExecution {
		/**
		 * Constructs a CustomExecution task object. The callback will be executed the task is run, at which point the
		 * extension should return the Pseudoterminal it will "run in". The task should wait to do further execution until
		 * [Pseudoterminal.open](#Pseudoterminal.open) is called. Task cancellation should be handled using
		 * [Pseudoterminal.close](#Pseudoterminal.close). When the task is complete fire
		 * [Pseudoterminal.onDidClose](#Pseudoterminal.onDidClose).
		 * @param callback The callback that will be called when the task is started by a user.
		 */
		constructor(callback: (resolvedDefinition?: TaskDefinition) => Thenable<Pseudoterminal>);
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

	//#region OnTypeRename: https://github.com/microsoft/vscode/issues/88424

	/**
	 * The rename provider interface defines the contract between extensions and
	 * the live-rename feature.
	 */
	export interface OnTypeRenameProvider {
		/**
		 * Provide a list of ranges that can be live renamed together.
		 *
		 * @param document The document in which the command was invoked.
		 * @param position The position at which the command was invoked.
		 * @param token A cancellation token.
		 * @return A list of ranges that can be live-renamed togehter. The ranges must have
		 * identical length and contain identical text content. The ranges cannot overlap.
		 */
		provideOnTypeRenameRanges(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Range[]>;
	}

	namespace languages {
		/**
		 * Register a rename provider that works on type.
		 *
		 * Multiple providers can be registered for a language. In that case providers are sorted
		 * by their [score](#languages.match) and the best-matching provider is used. Failure
		 * of the selected provider will cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An on type rename provider.
		 * @param stopPattern Stop on type renaming when input text matches the regular expression. Defaults to `^\s`.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerOnTypeRenameProvider(selector: DocumentSelector, provider: OnTypeRenameProvider, stopPattern?: RegExp): Disposable;
	}

	//#endregion

	//#region Custom editors: https://github.com/microsoft/vscode/issues/77131

	/**
	 * Defines the editing capability of a custom webview editor. This allows the webview editor to hook into standard
	 * editor events such as `undo` or `save`.
	 *
	 * @param EditType Type of edits used for the documents this delegate handles.
	 */
	interface CustomEditorEditingDelegate<EditType = unknown> {
		/**
		 * Save the resource.
		 *
		 * @param document Document to save.
		 * @param cancellation Token that signals the save is no longer required (for example, if another save was triggered).
		 *
		 * @return Thenable signaling that the save has completed.
		 */
		save(document: CustomDocument<EditType>, cancellation: CancellationToken): Thenable<void>;

		/**
		 * Save the existing resource at a new path.
		 *
		 * @param document Document to save.
		 * @param targetResource Location to save to.
		 *
		 * @return Thenable signaling that the save has completed.
		 */
		saveAs(document: CustomDocument<EditType>, targetResource: Uri): Thenable<void>;

		/**
		 * Event triggered by extensions to signal to VS Code that an edit has occurred.
		 */
		readonly onDidEdit: Event<CustomDocumentEditEvent<EditType>>;

		/**
		 * Apply a set of edits.
		 *
		 * Note that is not invoked when `onDidEdit` is called because `onDidEdit` implies also updating the view to reflect the edit.
		 *
		 * @param document Document to apply edits to.
		 * @param edit Array of edits. Sorted from oldest to most recent.
		 *
		 * @return Thenable signaling that the change has completed.
		 */
		applyEdits(document: CustomDocument<EditType>, edits: readonly EditType[]): Thenable<void>;

		/**
		 * Undo a set of edits.
		 *
		 * This is triggered when a user undoes an edit.
		 *
		 * @param document Document to undo edits from.
		 * @param edit Array of edits. Sorted from most recent to oldest.
		 *
		 * @return Thenable signaling that the change has completed.
		 */
		undoEdits(document: CustomDocument<EditType>, edits: readonly EditType[]): Thenable<void>;

		/**
		 * Revert the file to its last saved state.
		 *
		 * @param document Document to revert.
		 * @param edits Added or applied edits.
		 *
		 * @return Thenable signaling that the change has completed.
		 */
		revert(document: CustomDocument<EditType>, edits: CustomDocumentRevert<EditType>): Thenable<void>;

		/**
		 * Back up the resource in its current state.
		 *
		 * Backups are used for hot exit and to prevent data loss. Your `backup` method should persist the resource in
		 * its current state, i.e. with the edits applied. Most commonly this means saving the resource to disk in
		 * the `ExtensionContext.storagePath`. When VS Code reloads and your custom editor is opened for a resource,
		 * your extension should first check to see if any backups exist for the resource. If there is a backup, your
		 * extension should load the file contents from there instead of from the resource in the workspace.
		 *
		 * `backup` is triggered whenever an edit it made. Calls to `backup` are debounced so that if multiple edits are
		 * made in quick succession, `backup` is only triggered after the last one. `backup` is not invoked when
		 * `auto save` is enabled (since auto save already persists resource ).
		 *
		 * @param document Document to revert.
		 * @param cancellation Token that signals the current backup since a new backup is coming in. It is up to your
		 * extension to decided how to respond to cancellation. If for example your extension is backing up a large file
		 * in an operation that takes time to complete, your extension may decide to finish the ongoing backup rather
		 * than cancelling it to ensure that VS Code has some valid backup.
		 */
		backup(document: CustomDocument<EditType>, cancellation: CancellationToken): Thenable<void>;
	}

	/**
	 * Event triggered by extensions to signal to VS Code that an edit has occurred on a `CustomDocument`.
	 *
	 * @param EditType Type of edits used for the document.
	 */
	interface CustomDocumentEditEvent<EditType = unknown> {
		/**
		 * Document the edit is for.
		 */
		readonly document: CustomDocument<EditType>;

		/**
		 * Object that describes the edit.
		 *
		 * Edit objects are passed back to your extension in `CustomEditorEditingDelegate.undoEdits`,
		 * `CustomEditorEditingDelegate.applyEdits`, and `CustomEditorEditingDelegate.revert`.
		 */
		readonly edit: EditType;

		/**
		 * Display name describing the edit.
		 */
		readonly label?: string;
	}

	/**
	 * Data about a revert for a `CustomDocument`.
	 */
	interface CustomDocumentRevert<EditType = unknown> {
		/**
		 * List of edits that were undone to get the document back to its on disk state.
		 */
		readonly undoneEdits: readonly EditType[];

		/**
		 * List of edits that were reapplied to get the document back to its on disk state.
		 */
		readonly appliedEdits: readonly EditType[];
	}

	/**
	 * Represents a custom document used by a `CustomEditorProvider`.
	 *
	 * All custom documents must subclass `CustomDocument`. Custom documents are only used within a given
	 * `CustomEditorProvider`. The lifecycle of a `CustomDocument` is managed by VS Code. When no more references
	 * remain to a `CustomDocument`, it is disposed of.
	 *
	 * @param EditType Type of edits used in this document.
	 */
	class CustomDocument<EditType = unknown> {
		/**
		 * @param viewType The associated uri for this document.
		 * @param uri The associated viewType for this document.
		 */
		constructor(viewType: string, uri: Uri);

		/**
		 * The associated viewType for this document.
		 */
		readonly viewType: string;

		/**
		 * The associated uri for this document.
		 */
		readonly uri: Uri;

		/**
		 * Is this document representing an untitled file which has never been saved yet.
		 */
		readonly isUntitled: boolean;

		/**
		 * The version number of this document (it will strictly increase after each
		 * change, including undo/redo).
		 */
		readonly version: number;

		/**
		 * `true` if there are unpersisted changes.
		 */
		readonly isDirty: boolean;

		/**
		 * List of edits from document open to the document's current state.
		 */
		readonly appliedEdits: ReadonlyArray<EditType>;

		/**
		 * List of edits from document open to the document's last saved point.
		 *
		 * The save point will be behind `appliedEdits` if the user saves and then continues editing,
		 * or in front of the last entry in `appliedEdits` if the user saves and then hits undo.
		 */
		readonly savedEdits: ReadonlyArray<EditType>;

		/**
		 * `true` if the document has been closed. A closed document isn't synchronized anymore
		 * and won't be re-used when the same resource is opened again.
		 */
		readonly isClosed: boolean;

		/**
		 * Event fired when there are no more references to the `CustomDocument`.
		 */
		readonly onDidDispose: Event<void>;
	}

	/**
	 * Provider for webview editors that use a custom data model.
	 *
	 * Custom webview editors use [`CustomDocument`](#CustomDocument) as their data model.
	 * This gives extensions full control over actions such as edit, save, and backup.
	 *
	 * You should use custom text based editors when dealing with binary files or more complex scenarios. For simple text
	 * based documents, use [`WebviewTextEditorProvider`](#WebviewTextEditorProvider) instead.
	 */
	export interface CustomEditorProvider<EditType = unknown> {

		/**
		 * Resolve the model for a given resource.
		 *
		 * `resolveCustomDocument` is called when the first editor for a given resource is opened, and the resolve document
		 * is passed to `resolveCustomEditor`. The resolved `CustomDocument` is re-used for subsequent editor opens.
		 * If all editors for a given resource are closed, the `CustomDocument` is disposed of. Opening an editor at
		 * this point will trigger another call to `resolveCustomDocument`.
		 *
		 * @param uri Uri of the document to open.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @return The custom document.
		 */
		openCustomDocument(uri: Uri, token: CancellationToken): Thenable<CustomDocument<EditType>>;

		/**
		 * Resolve a webview editor for a given resource.
		 *
		 * This is called when a user first opens a resource for a `CustomEditorProvider`, or if they reopen an
		 * existing editor using this `CustomEditorProvider`.
		 *
		 * To resolve a webview editor, the provider must fill in its initial html content and hook up all
		 * the event listeners it is interested it. The provider can also hold onto the `WebviewPanel` to use later,
		 * for example in a command. See [`WebviewPanel`](#WebviewPanel) for additional details
		 *
		 * @param document Document for the resource being resolved.
		 * @param webviewPanel Webview to resolve.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @return Thenable indicating that the webview editor has been resolved.
		 */
		resolveCustomEditor(document: CustomDocument<EditType>, webviewPanel: WebviewPanel, token: CancellationToken): Thenable<void>;

		/**
		 * Defines the editing capability of a custom webview document.
		 *
		 * When not provided, the document is considered readonly.
		 */
		readonly editingDelegate?: CustomEditorEditingDelegate<EditType>;
	}

	/**
	 * Provider for text based webview editors.
	 *
	 * Text based webview editors use a [`TextDocument`](#TextDocument) as their data model. This considerably simplifies
	 * implementing a webview editor as it allows VS Code to handle many common operations such as
	 * undo and backup. The provider is responsible for synchronizing text changes between the webview and the `TextDocument`.
	 *
	 * You should use text based webview editors when dealing with text based file formats, such as `xml` or `json`.
	 * For binary files or more specialized use cases, see [CustomEditorProvider](#CustomEditorProvider).
	 */
	export interface CustomTextEditorProvider {

		/**
		 * Resolve a webview editor for a given text resource.
		 *
		 * This is called when a user first opens a resource for a `CustomTextEditorProvider`, or if they reopen an
		 * existing editor using this `CustomTextEditorProvider`.
		 *
		 * To resolve a webview editor, the provider must fill in its initial html content and hook up all
		 * the event listeners it is interested it. The provider can also hold onto the `WebviewPanel` to use later,
		 * for example in a command. See [`WebviewPanel`](#WebviewPanel) for additional details.
		 *
		 * @param document Document for the resource to resolve.
		 * @param webviewPanel Webview to resolve.
		 * @param token A cancellation token that indicates the result is no longer needed.
		 *
		 * @return Thenable indicating that the webview editor has been resolved.
		 */
		resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel, token: CancellationToken): Thenable<void>;

		/**
		 * TODO: discuss this at api sync.
		 *
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
		moveCustomTextEditor?(newDocument: TextDocument, existingWebviewPanel: WebviewPanel, token: CancellationToken): Thenable<void>;
	}

	namespace window {
		/**
		 * Register a new provider for a custom editor.
		 *
		 * @param viewType Type of the webview editor provider. This should match the `viewType` from the
		 *   `package.json` contributions.
		 * @param provider Provider that resolves editors.
		 * @param options Options for the provider
		 *
		 * @return Disposable that unregisters the provider.
		 */
		export function registerCustomEditorProvider(
			viewType: string,
			provider: CustomEditorProvider | CustomTextEditorProvider,
			options?: {
				readonly webviewOptions?: WebviewPanelOptions;
			}
		): Disposable;
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

	//#region Allow theme icons in hovers: https://github.com/microsoft/vscode/issues/84695

	export interface MarkdownString {

		/**
		 * Indicates that this markdown string can contain [ThemeIcons](#ThemeIcon), e.g. `$(zap)`.
		 */
		readonly supportThemeIcons?: boolean;
	}

	//#endregion

	//#region Peng: Notebook

	export enum CellKind {
		Markdown = 1,
		Code = 2
	}

	export enum CellOutputKind {
		Text = 1,
		Error = 2,
		Rich = 3
	}

	export interface CellStreamOutput {
		outputKind: CellOutputKind.Text;
		text: string;
	}

	export interface CellErrorOutput {
		outputKind: CellOutputKind.Error;
		/**
		 * Exception Name
		 */
		ename: string;
		/**
		 * Exception Value
		 */
		evalue: string;
		/**
		 * Exception call stack
		 */
		traceback: string[];
	}

	export interface CellDisplayOutput {
		outputKind: CellOutputKind.Rich;
		/**
		 * { mime_type: value }
		 *
		 * Example:
		 * ```json
		 * {
		 *   "outputKind": vscode.CellOutputKind.Rich,
		 *   "data": {
		 *      "text/html": [
		 *          "<h1>Hello</h1>"
		 *       ],
		 *      "text/plain": [
		 *        "<IPython.lib.display.IFrame at 0x11dee3e80>"
		 *      ]
		 *   }
		 * }
		 */
		data: { [key: string]: any };
	}

	export type CellOutput = CellStreamOutput | CellErrorOutput | CellDisplayOutput;

	export interface NotebookCellMetadata {
		/**
		 * Controls if the content of a cell is editable or not.
		 */
		editable?: boolean;

		/**
		 * Controls if the cell is executable.
		 * This metadata is ignored for markdown cell.
		 */
		runnable?: boolean;

		/**
		 * Execution order information of the cell
		 */
		executionOrder?: number;
	}

	export interface NotebookCell {
		readonly uri: Uri;
		readonly cellKind: CellKind;
		readonly source: string;
		language: string;
		outputs: CellOutput[];
		metadata: NotebookCellMetadata;
	}

	export interface NotebookDocumentMetadata {
		/**
		 * Controls if users can add or delete cells
		 * Default to true
		 */
		editable: boolean;

		/**
		 * Default value for [cell editable metadata](#NotebookCellMetadata.editable).
		 * Default to true.
		 */
		cellEditable: boolean;

		/**
		 * Default value for [cell runnable metadata](#NotebookCellMetadata.runnable).
		 * Default to true.
		 */
		cellRunnable: boolean;

	}

	export interface NotebookDocument {
		readonly uri: Uri;
		readonly fileName: string;
		readonly isDirty: boolean;
		readonly cells: NotebookCell[];
		languages: string[];
		displayOrder?: GlobPattern[];
		metadata?: NotebookDocumentMetadata;
	}

	export interface NotebookEditorCellEdit {
		insert(index: number, content: string, language: string, type: CellKind, outputs: CellOutput[], metadata: NotebookCellMetadata | undefined): void;
		delete(index: number): void;
	}

	export interface NotebookEditor {
		readonly document: NotebookDocument;
		viewColumn?: ViewColumn;
		/**
		 * Fired when the output hosting webview posts a message.
		 */
		readonly onDidReceiveMessage: Event<any>;
		/**
		 * Post a message to the output hosting webview.
		 *
		 * Messages are only delivered if the editor is live.
		 *
		 * @param message Body of the message. This must be a string or other json serilizable object.
		 */
		postMessage(message: any): Thenable<boolean>;

		edit(callback: (editBuilder: NotebookEditorCellEdit) => void): Thenable<boolean>;
	}

	export interface NotebookProvider {
		resolveNotebook(editor: NotebookEditor): Promise<void>;
		executeCell(document: NotebookDocument, cell: NotebookCell | undefined): Promise<void>;
		save(document: NotebookDocument): Promise<boolean>;
	}

	export interface NotebookOutputSelector {
		type: string;
		subTypes?: string[];
	}

	export interface NotebookOutputRenderer {
		/**
		 *
		 * @returns HTML fragment. We can probably return `CellOutput` instead of string ?
		 *
		 */
		render(document: NotebookDocument, output: CellOutput, mimeType: string): string;
		preloads?: Uri[];
	}

	export interface NotebookDocumentChangeEvent {

		/**
		 * The affected document.
		 */
		readonly document: NotebookDocument;

		/**
		 * An array of content changes.
		 */
		// readonly contentChanges: ReadonlyArray<TextDocumentContentChangeEvent>;
	}

	export namespace notebook {
		export function registerNotebookProvider(
			notebookType: string,
			provider: NotebookProvider
		): Disposable;

		export function registerNotebookOutputRenderer(type: string, outputSelector: NotebookOutputSelector, renderer: NotebookOutputRenderer): Disposable;

		export let activeNotebookDocument: NotebookDocument | undefined;

		// export const onDidChangeNotebookDocument: Event<NotebookDocumentChangeEvent>;
	}

	//#endregion

	//#region color theme access

	/**
	 * Represents a color theme kind.
	 */
	export enum ColorThemeKind {
		Light = 1,
		Dark = 2,
		HighContrast = 3
	}

	/**
	 * Represents a color theme.
	 */
	export interface ColorTheme {

		/**
		 * The kind of this color theme: light, dark or high contrast.
		 */
		readonly kind: ColorThemeKind;
	}

	export namespace window {
		/**
		 * The currently active color theme as configured in the settings. The active
		 * theme can be changed via the `workbench.colorTheme` setting.
		 */
		export let activeColorTheme: ColorTheme;

		/**
		 * An [event](#Event) which fires when the active theme changes or one of it's colors chnage.
		 */
		export const onDidChangeActiveColorTheme: Event<ColorTheme>;
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


	//#region eamodio - timeline: https://github.com/microsoft/vscode/issues/84297

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
		iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;

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
		 * @param label A human-readable string describing the timeline item
		 * @param timestamp A timestamp (in milliseconds since 1 January 1970 00:00:00) for when the timeline item occurred
		 */
		constructor(label: string, timestamp: number);
	}

	export interface TimelineChangeEvent {
		/**
		 * The [uri](#Uri) of the resource for which the timeline changed.
		 * If the [uri](#Uri) is `undefined` that signals that the timeline source for all resources changed.
		 */
		uri?: Uri;

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
		}

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
		limit?: number | { timestamp: number; id?: string };
	}

	export interface TimelineProvider {
		/**
		 * An optional event to signal that the timeline for a source has changed.
		 * To signal that the timeline for all resources (uris) has changed, do not pass any argument or pass `undefined`.
		 */
		onDidChange?: Event<TimelineChangeEvent>;

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


	//#region https://github.com/microsoft/vscode/issues/90208

	export interface ExtensionContext {
		/**
		 * Get the uri of a resource contained in the extension.
		 *
		 * @param relativePath A relative path to a resource contained in the extension.
		 * @return The uri of the resource.
		 */
		asExtensionUri(relativePath: string): Uri;

		/**
		 *
		 */
		readonly extensionUri: Uri;
	}

	export interface Extension<T> {
		/**
		 * Get the uri of a resource contained in the extension.
		 *
		 * @param relativePath A relative path to a resource contained in the extension.
		 * @return The uri of the resource.
		 */
		asExtensionUri(relativePath: string): Uri;

		/**
		 *
		 */
		readonly extensionUri: Uri;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/86788

	export interface CodeActionProviderMetadata {
		/**
		 * Static documentation for a class of code actions.
		 *
		 * The documentation is shown in the code actions menu if either:
		 *
		 * - Code actions of `kind` are requested by VS Code. In this case, VS Code will show the documentation that
		 *   most closely matches the requested code action kind. For example, if a provider has documentation for
		 *   both `Refactor` and `RefactorExtract`, when the user requests code actions for `RefactorExtract`,
		 *   VS Code will use the documentation for `RefactorExtract` intead of the documentation for `Refactor`.
		 *
		 * - Any code actions of `kind` are returned by the provider.
		 */
		readonly documentation?: ReadonlyArray<{ readonly kind: CodeActionKind, readonly command: Command }>;
	}

	//#endregion

	//#region Dialog title: https://github.com/microsoft/vscode/issues/82871

	/**
	 * Options to configure the behaviour of a file open dialog.
	 *
	 * * Note 1: A dialog can select files, folders, or both. This is not true for Windows
	 * which enforces to open either files or folder, but *not both*.
	 * * Note 2: Explicitly setting `canSelectFiles` and `canSelectFolders` to `false` is futile
	 * and the editor then silently adjusts the options to select files.
	 */
	export interface OpenDialogOptions {
		/**
		 * Dialog title.
		 *
		 * Depending on the underlying operating system this parameter might be ignored, since some
		 * systems do not present title on open dialogs.
		 */
		title?: string;
	}

	/**
	 * Options to configure the behaviour of a file save dialog.
	 */
	export interface SaveDialogOptions {
		/**
		 * Dialog title.
		 *
		 * Depending on the underlying operating system this parameter might be ignored, since some
		 * systems do not present title on save dialogs.
		 */
		title?: string;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/90208

	export namespace Uri {

		/**
		 *
		 * @param base
		 * @param pathFragments
		 * @returns A new uri
		 */
		export function joinPath(base: Uri, ...pathFragments: string[]): Uri;
	}

	//#endregion

	//#region https://github.com/microsoft/vscode/issues/91541

	export enum CompletionItemKind {
		User = 25,
		Issue = 26,
	}

	//#endregion

}
