/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CompletionItemInsertTextRule } from 'vs/editor/common/standalone/standaloneEnums';
import { CompletionItemModel, provideSuggestionItems } from 'vs/editor/contrib/suggest/browser/suggest';


class InlineCompletionResults implements InlineCompletions {

	readonly items: InlineCompletion[] = [];

	constructor(readonly completions: CompletionItemModel, model: ITextModel) {

		let prefix: string | undefined;
		let lastRange: Range | undefined;

		for (let item of completions.items) {

			const range = Range.fromPositions(item.editStart, item.editInsertEnd);

			const text = !item.completion.insertTextRules || !(item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet)
				? { snippet: item.completion.insertText }
				: item.completion.insertText;

			// cache/re-use last substring
			if (!lastRange || !lastRange.equalsRange(range)) {
				prefix = model.getValueInRange(range);
				lastRange = range;
			}

			// TODO@jrieken do some kind of filtering...
			this.items.push({
				// prefix,
				range,
				text
			});
		}
	}
}

class SuggestInlineCompletions implements InlineCompletionsProvider<InlineCompletionResults> {

	constructor(@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService) { }

	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<InlineCompletionResults | undefined> {

		if (context.selectedSuggestionInfo) {
			return undefined;
		}

		const completions = await provideSuggestionItems(
			this._languageFeatureService.completionProvider,
			model, position,
			undefined,
			undefined,
			token
		);

		return new InlineCompletionResults(completions, model);
	}

	freeInlineCompletions(result: InlineCompletionResults): void {
		result.completions.disposable.dispose();
	}

}



class EditorContribution implements IEditorContribution {

	private static _counter = 0;
	private static _disposable: IDisposable | undefined;

	// TODO@jrieken honour setting!
	constructor(_editor: ICodeEditor, @ILanguageFeaturesService languageFeatureService: ILanguageFeaturesService) {
		// HACKY way to contribute something only once
		if (++EditorContribution._counter === 1) {
			EditorContribution._disposable = languageFeatureService.inlineCompletionsProvider.register('*', new SuggestInlineCompletions(languageFeatureService));
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
