/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, InlineCompletionTriggerKind, ProviderResult } from 'vs/editor/common/languages';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { SuggestInlineCompletions } from 'vs/editor/contrib/suggest/browser/suggestInlineCompletions';
import { createCodeEditorServices, instantiateTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModel } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ISuggestMemoryService } from 'vs/editor/contrib/suggest/browser/suggestMemory';
import { mock } from 'vs/base/test/common/mock';


suite('Suggest Inline Completions', function () {

	const disposables = new DisposableStore();

	const services = new ServiceCollection([ISuggestMemoryService, new class extends mock<ISuggestMemoryService>() {
		override select(): number {
			return 0;
		}
	}]);

	const insta = createCodeEditorServices(disposables, services);
	const model = createTextModel('he', undefined, undefined, URI.from({ scheme: 'foo', path: 'foo.bar' }));
	const editor = instantiateTestCodeEditor(insta, model);

	setup(function () {

		editor.updateOptions({ quickSuggestions: { comments: 'inline', strings: 'inline', other: 'inline' } });

		insta.invokeFunction(accessor => {
			accessor.get(ILanguageFeaturesService).completionProvider.register({ pattern: '*.bar', scheme: 'foo' }, new class implements CompletionItemProvider {

				triggerCharacters?: string[] | undefined;

				provideCompletionItems(model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken): ProviderResult<CompletionList> {

					const word = model.getWordUntilPosition(position);
					const range = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

					const suggestions: CompletionItem[] = [];
					suggestions.push({ insertText: 'hello', label: 'hello', range, kind: CompletionItemKind.Class });
					suggestions.push({ insertText: 'hell', label: 'hell', range, kind: CompletionItemKind.Class });
					suggestions.push({ insertText: 'hey', label: 'hey', range, kind: CompletionItemKind.Class });
					return { suggestions };
				}

			});
		});
	});

	teardown(function () {
		disposables.clear();
	});


	test('Aggressive inline completions when typing within line #146948', async function () {

		const completions: SuggestInlineCompletions = insta.createInstance(SuggestInlineCompletions, (id: EditorOption) => editor.getOption(id));
		{
			// (1,3), end of word -> suggestions
			const result = await completions.provideInlineCompletions(model, new Position(1, 3), { triggerKind: InlineCompletionTriggerKind.Explicit, selectedSuggestionInfo: undefined }, CancellationToken.None);
			assert.strictEqual(result?.items.length, 3);
		}
		{
			// (1,2), middle of word -> NO suggestions
			const result = await completions.provideInlineCompletions(model, new Position(1, 2), { triggerKind: InlineCompletionTriggerKind.Explicit, selectedSuggestionInfo: undefined }, CancellationToken.None);
			assert.ok(result === undefined);
		}
	});
});
