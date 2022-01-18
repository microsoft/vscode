/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/124024 @hediet @alexdima

	export namespace languages {
		/**
		 * Registers an inline completion provider.
		 */
		export function registerInlineCompletionItemProvider(selector: DocumentSelector, provider: InlineCompletionItemProvider): Disposable;
	}

	export interface InlineCompletionItemProvider<T extends InlineCompletionItem = InlineCompletionItem> {
		/**
		 * Provides inline completion items for the given position and document.
		 * If inline completions are enabled, this method will be called whenever the user stopped typing.
		 * It will also be called when the user explicitly triggers inline completions or asks for the next or previous inline completion.
		 * Use `context.triggerKind` to distinguish between these scenarios.
		*/
		provideInlineCompletionItems(document: TextDocument, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletionList<T> | T[]>;
	}

	export interface InlineCompletionContext {
		/**
		 * How the completion was triggered.
		 */
		readonly triggerKind: InlineCompletionTriggerKind;

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
		readonly selectedCompletionInfo: SelectedCompletionInfo | undefined;
	}

	export interface SelectedCompletionInfo {
		range: Range;
		text: string;
		completionKind: CompletionItemKind;
		isSnippetText: boolean;
	}

	/**
	 * How an {@link InlineCompletionItemProvider inline completion provider} was triggered.
	 */
	export enum InlineCompletionTriggerKind {
		/**
		 * Completion was triggered automatically while editing.
		 * It is sufficient to return a single completion item in this case.
		 */
		Automatic = 0,

		/**
		 * Completion was triggered explicitly by a user gesture.
		 * Return multiple completion items to enable cycling through them.
		 */
		Explicit = 1,
	}

	export class InlineCompletionList<T extends InlineCompletionItem = InlineCompletionItem> {
		items: T[];

		constructor(items: T[]);
	}

	export class InlineCompletionItem {
		/**
		 * The text to replace the range with.
		 *
		 * The text the range refers to must be a subword of this value (`AB` and `BEF` are subwords of `ABCDEF`, but `Ab` is not).
		 * Additionally, if possible, it should be a prefix of this value for a better user-experience.
		 *
		 * However, any indentation of the text to replace does not matter for the subword constraint.
		 * Thus, `  B` can be replaced with ` ABC`, effectively removing a whitespace and inserting `A` and `C`.
		*/
		text: string;

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

		constructor(text: string, range?: Range, command?: Command);
	}


	/**
	 * Be aware that this API will not ever be finalized.
	 */
	export namespace window {
		export function getInlineCompletionItemController<T extends InlineCompletionItem>(provider: InlineCompletionItemProvider<T>): InlineCompletionController<T>;
	}

	/**
	 * Be aware that this API will not ever be finalized.
	 */
	export interface InlineCompletionController<T extends InlineCompletionItem> {
		/**
		 * Is fired when an inline completion item is shown to the user.
		 */
		// eslint-disable-next-line vscode-dts-event-naming
		readonly onDidShowCompletionItem: Event<InlineCompletionItemDidShowEvent<T>>;
	}

	/**
	 * Be aware that this API will not ever be finalized.
	 */
	export interface InlineCompletionItemDidShowEvent<T extends InlineCompletionItem> {
		completionItem: T;
	}
}
