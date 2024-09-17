/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/226562

	export interface TerminalCompletionProvider<T extends TerminalCompletion> {
		id: string;
		/**
		 * Provide completions for the given position and document.
		 * @param terminal The terminal for which completions are being provided.
		 * @param context Information about the terminal's current state.
		 * @param token A cancellation token.
		 * @return A list of completions.
		 */
		provideTerminalCompletions(terminal: Terminal, context: TerminalCompletionContext, token: CancellationToken): ProviderResult<T[] | Thenable<T[]>>;
	}

	export class TerminalCompletion {

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
		kind?: TerminalCompletionItemKind;

		/**
		 * A human-readable string with additional information
		 * about this item.
		 */
		detail?: string;

		/**
		 * A human-readable string that represents a doc-comment.
		 */
		documentation?: string | MarkdownString;
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
		export function registerTerminalCompletionProvider<T extends TerminalCompletion>(provider: TerminalCompletionProvider<T>): Disposable;
	}
}
