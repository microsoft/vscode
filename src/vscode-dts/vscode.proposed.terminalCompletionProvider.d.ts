/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/226562

	export interface TerminalCompletionProvider<T extends TerminalCompletionItem> {
		id: string;
		/**
		 * Provide completions for the given position and document.
		 * @param terminal The terminal for which completions are being provided.
		 * @param context Information about the terminal's current state.
		 * @param token A cancellation token.
		 * @return A list of completions.
		 */
		provideTerminalCompletions(terminal: Terminal, context: TerminalCompletionContext, token: CancellationToken): ProviderResult<T[] | TerminalCompletionList<T>>;
	}


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
	 * Terminal item kinds.
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
		 * Register a completion provider for a certain type of terminal.
		 *
		 * @param provider The completion provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTerminalCompletionProvider<T extends TerminalCompletionItem>(provider: TerminalCompletionProvider<T>, ...triggerCharacters: string[]): Disposable;
	}

	/**
	 * Represents a collection of {@link TerminalCompletionItem completion items} to be presented
	 * in the terminal.
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
		 * File extensions to filter by.
		 */
		fileExtensions?: string[];
		/**
		 * If no cwd is provided, no resources will be shown as completions.
		 */
		cwd?: Uri;
		/**
		 * Environment variables to use when constructing paths.
		 */
		env?: { [key: string]: string | null | undefined };
	}
}
