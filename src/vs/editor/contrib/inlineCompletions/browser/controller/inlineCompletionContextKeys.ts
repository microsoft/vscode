/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, autorun } from 'vs/base/common/observable';
import { firstNonWhitespaceIndex } from 'vs/base/common/strings';
import { CursorColumns } from 'vs/editor/common/core/cursorColumns';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsModel';
import { RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';

export class InlineCompletionContextKeys extends Disposable {
	public static readonly inlineSuggestionVisible = new RawContextKey<boolean>('inlineSuggestionVisible', false, localize('inlineSuggestionVisible', "Whether an inline suggestion is visible"));
	public static readonly inlineSuggestionHasIndentation = new RawContextKey<boolean>('inlineSuggestionHasIndentation', false, localize('inlineSuggestionHasIndentation', "Whether the inline suggestion starts with whitespace"));
	public static readonly inlineSuggestionHasIndentationLessThanTabSize = new RawContextKey<boolean>('inlineSuggestionHasIndentationLessThanTabSize', true, localize('inlineSuggestionHasIndentationLessThanTabSize', "Whether the inline suggestion starts with whitespace that is less than what would be inserted by tab"));
	public static readonly suppressSuggestions = new RawContextKey<boolean | undefined>('inlineSuggestionSuppressSuggestions', undefined, localize('suppressSuggestions', "Whether suggestions should be suppressed for the current suggestion"));

	public readonly inlineCompletionVisible = InlineCompletionContextKeys.inlineSuggestionVisible.bindTo(this.contextKeyService);
	public readonly inlineCompletionSuggestsIndentation = InlineCompletionContextKeys.inlineSuggestionHasIndentation.bindTo(this.contextKeyService);
	public readonly inlineCompletionSuggestsIndentationLessThanTabSize = InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize.bindTo(this.contextKeyService);
	public readonly suppressSuggestions = InlineCompletionContextKeys.suppressSuggestions.bindTo(this.contextKeyService);

	constructor(
		private readonly contextKeyService: IContextKeyService,
		private readonly model: IObservable<InlineCompletionsModel | undefined>,
	) {
		super();

		this._register(autorun(reader => {
			/** @description update context key: inlineCompletionVisible, suppressSuggestions */
			const model = this.model.read(reader);
			const state = model?.state.read(reader);

			const isInlineCompletionVisible = !!state?.inlineCompletion && state?.primaryGhostText !== undefined && !state?.primaryGhostText.isEmpty();
			this.inlineCompletionVisible.set(isInlineCompletionVisible);

			if (state?.primaryGhostText && state?.inlineCompletion) {
				this.suppressSuggestions.set(state.inlineCompletion.inlineCompletion.source.inlineCompletions.suppressSuggestions);
			}
		}));

		this._register(autorun(reader => {
			/** @description update context key: inlineCompletionSuggestsIndentation, inlineCompletionSuggestsIndentationLessThanTabSize */
			const model = this.model.read(reader);

			let startsWithIndentation = false;
			let startsWithIndentationLessThanTabSize = true;

			const ghostText = model?.primaryGhostText.read(reader);
			if (!!model?.selectedSuggestItem && ghostText && ghostText.parts.length > 0) {
				const { column, lines } = ghostText.parts[0];

				const firstLine = lines[0];

				const indentationEndColumn = model.textModel.getLineIndentColumn(ghostText.lineNumber);
				const inIndentation = column <= indentationEndColumn;

				if (inIndentation) {
					let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
					if (firstNonWsIdx === -1) {
						firstNonWsIdx = firstLine.length - 1;
					}
					startsWithIndentation = firstNonWsIdx > 0;

					const tabSize = model.textModel.getOptions().tabSize;
					const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
					startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
				}
			}

			this.inlineCompletionSuggestsIndentation.set(startsWithIndentation);
			this.inlineCompletionSuggestsIndentationLessThanTabSize.set(startsWithIndentationLessThanTabSize);
		}));
	}
}
