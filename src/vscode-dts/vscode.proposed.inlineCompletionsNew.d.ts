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
		 * Multiple providers can be registered for a language. In that case providers are asked in
		 * parallel and the results are merged. A failing provider (rejected promise or exception) will
		 * not cause a failure of the whole operation.
		 *
		 * @param selector A selector that defines the documents this provider is applicable to.
		 * @param provider An inline completion provider.
		 * @return A {@link Disposable} that unregisters this provider when being disposed.
		 */
		export function registerInlineCompletionItemProviderNew(selector: DocumentSelector, provider: InlineCompletionItemProviderNew): Disposable;
	}

	/**
	 * The inline completion item provider interface defines the contract between extensions and
	 * the inline completion feature.
	 *
	 * Providers are asked for completions either explicitly by a user gesture or implicitly when typing.
	 */
	export interface InlineCompletionItemProviderNew {

		/**
		 * Provides inline completion items for the given position and document.
		 * If inline completions are enabled, this method will be called whenever the user stopped typing.
		 * It will also be called when the user explicitly triggers inline completions or explicitly asks for the next or previous inline completion.
		 * In that case, all available inline completions should be returned.
		 * `context.triggerKind` can be used to distinguish between these scenarios.
		 *
		 * @param document The document inline completions are requested for.
		 * @param position The position inline completions are requested for.
		 * @param context A context object with additional information.
		 * @param token A cancellation token.
		 * @return An array of completion items or a thenable that resolves to an array of completion items.
		 */
		provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContextNew, token: CancellationToken): ProviderResult<InlineCompletionListNew | InlineCompletionItemNew[]>;
	}

	/**
	 * Provides information about the context in which an inline completion was requested.
	 */
	export interface InlineCompletionContextNew {
		/**
		 * Describes how the inline completion was triggered.
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
		 */
		readonly selectedCompletionInfo: SelectedCompletionInfoNew | undefined;
	}

	/**
	 * Describes the currently selected completion item.
	 */
	export interface SelectedCompletionInfoNew {
		/**
		 * The range that will be replaced if this completion item is accepted.
		 */
		readonly range: Range;

		/**
		 * The text the range will be replaced with if this completion is accepted.
		 */
		readonly text: string;
	}

	/**
	 * Describes how an {@link InlineCompletionItemProvider inline completion provider} was triggered.
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
	 * Represents a collection of {@link InlineCompletionItemNew inline completion items} to be presented
	 * in the editor.
	 */
	export class InlineCompletionListNew {
		/**
		 * The inline completion items.
		 */
		items: InlineCompletionItemNew[];

		/**
		 * A list of commands associated with the inline completions of this list.
		 */
		commands?: Command[];

		/**
		 * Creates a new list of inline completion items with optionally given commands.
		*/
		constructor(items: InlineCompletionItemNew[], commands?: Command[]);
	}

	/**
	 * An inline completion item represents a text snippet that is proposed inline to complete text that is being typed.
	 *
	 * @see {@link InlineCompletionItemProviderNew.provideInlineCompletionItems}
	 */
	export class InlineCompletionItemNew {
		/**
		 * The text to replace the range with. Must be set.
		 * Is used both for the preview and the accept operation.
		 */
		insertText: string | SnippetString;

		/**
		 * A text that is used to decide if this inline completion should be shown. When `falsy`
		 * the {@link InlineCompletionItemNew.insertText} is used.
		 *
		 * An inline completion is shown if the text to replace is a prefix of the filter text.
		 */
		filterText?: string;

		/**
		 * The range to replace.
		 * Must begin and end on the same line.
		 *
		 * Prefer replacements over insertions to provide a better experience when the user deletes typed text.
		 */
		range?: Range;

		/**
		 * An optional {@link Command} that is executed *after* inserting this completion.
		 */
		command?: Command;

		/**
		 * Creates a new inline completion item.
		 *
		 * @param insertText The text to replace the range with.
		 * @param range The range to replace. If not set, the word at the requested position will be used.
		 * @param command An optional {@link Command} that is executed *after* inserting this completion.
		 */
		constructor(insertText: string | SnippetString, range?: Range, command?: Command);
	}
}
