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
		provideTerminalCompletions(terminal: Terminal, context: TerminalCompletionContext, token: CancellationToken): ProviderResult<T[] | Thenable<T[] | undefined>>;
	}

	export class TerminalCompletionItem {

		/**
		 * The label of this completion item. By default
		 * this is also the text that is inserted when selecting
		 * this completion.
		 */
		label: string | CompletionItemLabel;

		/**
		 * The kind of this completion item. Based on the kind,
		 * an icon is chosen.
		 */
		kind: TerminalCompletionItemKind;

		/**
		 * A human-readable string with additional information
		 * about this item.
		 */
		detail?: string;

		/**
		 * A human-readable string that represents a doc-comment.
		 */
		documentation?: string | MarkdownString;

		constructor(label: string, kind: TerminalCompletionItemKind);
	}

	export enum TerminalCompletionItemKind {
		File = 0,
		Folder = 1,
		Flag = 2,
	}

	export interface TerminalCompletionContext {
		shellType: string;
		commandLine: string;
	}

	export namespace window {
		/**
		 * Register a completion provider for a certain type of terminal.
		 *
		 * @param provider The completion provider.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerTerminalCompletionProvider<T extends TerminalCompletionItem>(provider: TerminalCompletionProvider<T>): Disposable;
	}
}
