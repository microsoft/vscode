/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/124024 @hediet @alexdima
	// Temporary API to allow for safe migration.

	export namespace languages {
		/**
		 * Registers an inline completion provider.
		 *
		 *  @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		// TODO@API what are the rules when multiple providers apply
		export function registerInlineCompletionItemProviderNew(selector: DocumentSelector, provider: InlineCompletionItemProviderNew): Disposable;
	}

	export interface InlineCompletionItemProviderNew {
		/**
		 * Provides inline completion items for the given position and document.
		 * If inline completions are enabled, this method will be called whenever the user stopped typing.
		 * It will also be called when the user explicitly triggers inline completions or asks for the next or previous inline completion.
		 * Use `context.triggerKind` to distinguish between these scenarios.
		*/
		provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContextNew, token: CancellationToken): ProviderResult<InlineCompletionListNew | InlineCompletionItemNew[]>;
	}

	export interface InlineCompletionContextNew {
		/**
		 * How the completion was triggered.
		 */
		readonly triggerKind: InlineCompletionTriggerKindNew;

		/**
		 * Provides information about the currently selected item in the autocomplete widget if it is visible.
		 *
		 * If set, provided inline completions must extend the text of the selected item
		 * and use the same range, otherwise they are not shown as preview.
		 * As an example, if the document text is `console.` and the selected item is `.log` replacing the `.` in the document,
		 * the inline completion must also replace `.` and start with `.log`, for example `.log()`.
		 *
		 * Inline completion providers are requested again whenever the selected item changes.
		 *
		 * The user must configure `"editor.suggest.preview": true` for this feature.
		*/
		readonly selectedCompletionInfo: SelectedCompletionInfoNew | undefined;
	}

	// TODO@API find a better name, xyzFilter, xyzConstraint
	export interface SelectedCompletionInfoNew {
		range: Range;
		text: string;
	}

	/**
	 * How an {@link InlineCompletionItemProvider inline completion provider} was triggered.
	 */
	export enum InlineCompletionTriggerKindNew {
		/**
		 * Completion was triggered explicitly by a user gesture.
		 * Return multiple completion items to enable cycling through them.
		 */
		Invoke = 0,

		/**
		 * Completion was triggered automatically while editing.
		 * It is sufficient to return a single completion item in this case.
		 */
		Automatic = 1,
	}

	/**
	 * @deprecated Return an array of Inline Completion items directly. Will be removed eventually.
	*/
	// TODO@API We could keep this and allow for `vscode.Command` instances that explain
	// the result. That would replace the existing proposed menu-identifier and be more LSP friendly
	// TODO@API maybe use MarkdownString
	export class InlineCompletionListNew {
		items: InlineCompletionItemNew[];

		// command: Command; "Show More..."

		// description: MarkdownString

		/**
		 * @deprecated Return an array of Inline Completion items directly. Will be removed eventually.
		*/
		constructor(items: InlineCompletionItemNew[]);
	}

	export class InlineCompletionItemNew {
		/**
		 * The text to replace the range with. Must be set.
		 * Is used both for the preview and the accept operation.
		 *
		 * The text the range refers to must be a subword of this value (`AB` and `BEF` are subwords of `ABCDEF`, but `Ab` is not).
		 * Additionally, if possible, it should be a prefix of this value for a better user-experience.
		 *
		 * However, any indentation of the text to replace does not matter for the subword constraint.
		 * Thus, `  B` can be replaced with ` ABC`, effectively removing a whitespace and inserting `A` and `C`.
		*/
		insertText: string | SnippetString;

		/**
		 * A text that is used to decide if this inline completion should be shown.
		 * An inline completion is shown if the text to replace is a subword of the filter text.
		 */
		filterText?: string;

		/**
		 * The range to replace.
		 * Must begin and end on the same line.
		 *
		 * Prefer replacements over insertions to avoid cache invalidation:
		 * Instead of reporting a completion that inserts an extension at the end of a word,
		 * the whole word (or even the whole line) should be replaced with the extended word (or extended line) to improve the UX.
		 * That way, when the user presses backspace, the cache can be reused and there is no flickering.
		*/
		range?: Range;

		/**
		 * An optional {@link Command} that is executed *after* inserting this completion.
		 */
		command?: Command;

		// TODO@API insertText -> string | SnippetString
		constructor(insertText: string, range?: Range, command?: Command);
	}
}
