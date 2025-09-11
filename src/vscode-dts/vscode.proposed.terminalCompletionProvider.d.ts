/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/226562

	/**
	 * A provider that supplies terminal completion items.
	 *
	 * Implementations of this interface should return an array of {@link TerminalCompletionItem} or a
	 * {@link TerminalCompletionList} describing completions for the current command line.
	 *
	 * @example <caption>Simple provider returning a single completion</caption>
	 * window.registerTerminalCompletionProvider('extension-provider-id', {
	 * 	provideTerminalCompletions(terminal, context) {
	 * 		return [{ label: '--help', replacementIndex: Math.max(0, context.cursorPosition - 2), replacementLength: 2 }];
	 * 	}
	 * });
	 */
	export interface TerminalCompletionProvider<T extends TerminalCompletionItem> {
		/**
		 * Provide completions for the given terminal and context.
		 * @param terminal The terminal for which completions are being provided.
		 * @param context Information about the terminal's current state.
		 * @param token A cancellation token.
		 * @return A list of completions.
		 */
		provideTerminalCompletions(terminal: Terminal, context: TerminalCompletionContext, token: CancellationToken): ProviderResult<T[] | TerminalCompletionList<T>>;
	}


	/**
	 * Represents a completion suggestion for a terminal command line.
	 *
	 * @example <caption>Completion item for `ls -|`</caption>
	 * const item = {
	 * 	label: '-A',
	 * 	replacementIndex: 3,
	 * 	replacementLength: 1,
	 * 	detail: 'List all entries except for . and .. (always set for the super-user)',
	 * 	kind: TerminalCompletionItemKind.Flag
	 * };
	 *
	 * The fields on a completion item describe what text should be shown to the user
	 * and which portion of the command line should be replaced when the item is accepted.
	 */
	export interface TerminalCompletionItem {
		/**
		 * The label of the completion.
		 */
		label: string | CompletionItemLabel;

		/**
		 * The index of the start of the range to replace.
		 */
		replacementIndex: number;

		/**
		 * The length of the range to replace.
		 */
		replacementLength: number;

		/**
		 * The completion's detail which appears on the right of the list.
		 */
		detail?: string;

		/**
		 * A human-readable string that represents a doc-comment.
		 */
		documentation?: string | MarkdownString;

		/**
		 * The completion's kind. Note that this will map to an icon.
		 */
		kind?: TerminalCompletionItemKind;
	}


	/**
	 * The kind of an individual terminal completion item.
	 *
	 * The kind is used to render an appropriate icon in the suggest list and to convey the semantic
	 * meaning of the suggestion (file, folder, flag, commit, branch, etc.).
	 *
	 */
	export enum TerminalCompletionItemKind {
		File = 0,
		Folder = 1,
		Method = 2,
		Alias = 3,
		Argument = 4,
		Option = 5,
		OptionValue = 6,
		Flag = 7,
		SymbolicLinkFile = 8,
		SymbolicLinkFolder = 9,
		Commit = 10,
		Branch = 11,
		Tag = 12,
		Stash = 13,
		Remote = 14,
		PullRequest = 15,
		PullRequestDone = 16,
	}


	/**
	 * Context information passed to {@link TerminalCompletionProvider.provideTerminalCompletions}.
	 *
	 * It contains the full command line, the current cursor position, and a flag indicating whether
	 * fallback completions are allowed when the exact completion type cannot be determined.
	 */
	export interface TerminalCompletionContext {
		/**
		 * The complete terminal command line.
		 */
		commandLine: string;
		/**
		 * The index of the cursor in the command line.
		 */
		cursorPosition: number;
		/**
		 * Whether completions should be provided when it is not clear to what type of completion is
		 * well known.
		 */
		allowFallbackCompletions: boolean;
	}

	export namespace window {
		/**
		 * Register a completion provider for terminals.
		 * @param id The unique identifier of the terminal provider, used as a settings key and shown in the information hover of the suggest widget.
		 * @param provider The completion provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 *
		 * @example <caption>Register a provider for an extension</caption>
		 * window.registerTerminalCompletionProvider('extension-provider-id', {
		 * 	provideTerminalCompletions(terminal, context) {
		 * 		return new TerminalCompletionList([
		 * 			{ label: '--version', replacementIndex: Math.max(0, context.cursorPosition - 2), replacementLength: 2 }
		 * 		]);
		 * 	}
		 * });
		 */
		export function registerTerminalCompletionProvider<T extends TerminalCompletionItem>(id: string, provider: TerminalCompletionProvider<T>, ...triggerCharacters: string[]): Disposable;
	}

	/**
	 * Represents a collection of {@link TerminalCompletionItem completion items} to be presented
	 * in the terminal.
	 *
	 * @example <caption>Create a completion list that requests files for the terminal cwd</caption>
	 * const list = new TerminalCompletionList([
	 * 	{ label: 'ls', replacementIndex: 0, replacementLength: 0, kind: TerminalCompletionItemKind.Method }
	 * ], { filesRequested: true, cwd: Uri.file('/home/user') });
	 */
	export class TerminalCompletionList<T extends TerminalCompletionItem = TerminalCompletionItem> {

		/**
		 * Resources that should be shown in the completions list for the cwd of the terminal.
		 */
		resourceRequestConfig?: TerminalResourceRequestConfig;

		/**
		 * The completion items.
		 */
		items: T[];

		/**
		 * Creates a new completion list.
		 *
		 * @param items The completion items.
		 * @param resourceRequestConfig Indicates which resources should be shown as completions for the cwd of the terminal.
		 */
		constructor(items?: T[], resourceRequestConfig?: TerminalResourceRequestConfig);
	}


	/**
	 * Configuration for requesting file and folder resources to be shown as completions.
	 *
	 * When a provider indicates that it wants file/folder resources, the terminal will surface completions for files and
	 * folders that match {@link globPattern} from the provided {@link cwd}.
	 */
	export interface TerminalResourceRequestConfig {
		/**
		 * Show files as completion items.
		 */
		filesRequested?: boolean;
		/**
		 * Show folders as completion items.
		 */
		foldersRequested?: boolean;
		/**
		 * A {@link GlobPattern glob pattern} that controls which files suggest should surface.
		 */
		globPattern?: GlobPattern;
		/**
		 * The cwd from which to request resources.
		 */
		cwd: Uri;
	}
}
