/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { FuzzyScore } from 'vs/base/common/filters';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption, FindComputedEditorOptionValueById } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CompletionItemInsertTextRule } from 'vs/editor/common/standalone/standaloneEnums';
import { CompletionModel, LineContext } from 'vs/editor/contrib/suggest/browser/completionModel';
import { CompletionItemModel, provideSuggestionItems, QuickSuggestionsOptions } from 'vs/editor/contrib/suggest/browser/suggest';
import { WordDistance } from 'vs/editor/contrib/suggest/browser/wordDistance';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

class InlineCompletionResults implements InlineCompletions {

	readonly items: InlineCompletion[] = [];

	constructor(
		readonly completionModel: CompletionModel,
		readonly completions: CompletionItemModel,
	) {

		for (const item of completionModel.items) {

			if (item.score === FuzzyScore.Default) {
				// skip items that have no overlap
				continue;
			}

			const range = Range.fromPositions(item.editStart, item.editInsertEnd);

			const insertText = item.completion.insertTextRules && (item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet)
				? { snippet: item.completion.insertText }
				: item.completion.insertText;

			this.items.push({
				range,
				filterText: item.filterTextLow ?? item.labelLow,
				insertText
			});
		}
	}
}

class SuggestInlineCompletions implements InlineCompletionsProvider<InlineCompletionResults> {

	constructor(
		private readonly _getEditorOption: <T extends EditorOption>(id: T, model: ITextModel) => FindComputedEditorOptionValueById<T>,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
	) { }

	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<InlineCompletionResults | undefined> {

		if (context.selectedSuggestionInfo) {
			return;
		}

		const firstNonWhitespace = model.getLineFirstNonWhitespaceColumn(position.lineNumber);
		if (position.column === 1 || firstNonWhitespace === 0 || firstNonWhitespace >= position.column) {
			// not without none-empty prefix
			return;
		}

		const config = this._getEditorOption(EditorOption.quickSuggestions, model);
		if (QuickSuggestionsOptions.isAllOff(config)) {
			// quick suggest is off (for this model/language)
			return;
		}

		model.tokenizeIfCheap(position.lineNumber);
		const lineTokens = model.getLineTokens(position.lineNumber);
		const tokenType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(Math.max(position.column - 1 - 1, 0)));
		if (QuickSuggestionsOptions.valueFor(config, tokenType) !== 'inline') {
			// quick suggest is off (for this token)
			return undefined;
		}

		const completions = await provideSuggestionItems(
			this._languageFeatureService.completionProvider,
			model, position,
			undefined,
			undefined,
			token
		);

		let clipboardText: string | undefined;
		if (completions.needsClipboard) {
			clipboardText = await this._clipboardService.readText();
		}

		const completionModel = new CompletionModel(
			completions.items, position.column,
			new LineContext(model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column)), 0),
			WordDistance.None,
			this._getEditorOption(EditorOption.suggest, model),
			this._getEditorOption(EditorOption.snippetSuggestions, model),
			clipboardText
		);

		return new InlineCompletionResults(completionModel, completions);
	}

	freeInlineCompletions(result: InlineCompletionResults): void {
		result.completions.disposable.dispose();
	}
}

class EditorContribution implements IEditorContribution {

	private static _counter = 0;
	private static _disposable: IDisposable | undefined;

	constructor(
		_editor: ICodeEditor,
		@ILanguageFeaturesService languageFeatureService: ILanguageFeaturesService,
		@ICodeEditorService editorService: ICodeEditorService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		// HACK - way to contribute something only once
		if (++EditorContribution._counter === 1) {
			const provider = instaService.createInstance(
				SuggestInlineCompletions,
				(id, model) => {
					// HACK - reuse the editor options world outside from a "normal" contribution
					const editor = editorService.listCodeEditors().find(editor => editor.getModel() === model) ?? _editor;
					return editor.getOption(id);
				},
			);
			EditorContribution._disposable = languageFeatureService.inlineCompletionsProvider.register('*', provider);
		}
	}

	dispose(): void {
		if (--EditorContribution._counter === 0) {
			EditorContribution._disposable?.dispose();
			EditorContribution._disposable = undefined;
		}
	}
}

registerEditorContribution('suggest.inlineCompletionsProvider', EditorContribution);
