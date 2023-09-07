/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, InlineCompletionTriggerKind, ProviderResult } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { SuggestInlineCompletions } from 'vs/editor/contrib/suggest/browser/suggestInlineCompletions';
import { ISuggestMemoryService } from 'vs/editor/contrib/suggest/browser/suggestMemory';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';


suite('Suggest Inline Completions', function () {

	const disposables = new DisposableStore();
	const services = new ServiceCollection([ISuggestMemoryService, new class extends mock<ISuggestMemoryService>() {
		override select(): number {
			return 0;
		}
	}]);

	let insta: TestInstantiationService;
	let model: TextModel;
	let editor: ITestCodeEditor;

	setup(function () {

		insta = createCodeEditorServices(disposables, services);
		model = createTextModel('he', undefined, undefined, URI.from({ scheme: 'foo', path: 'foo.bar' }));
		editor = instantiateTestCodeEditor(insta, model);
		editor.updateOptions({ quickSuggestions: { comments: 'inline', strings: 'inline', other: 'inline' } });

		insta.invokeFunction(accessor => {
			accessor.get(ILanguageFeaturesService).completionProvider.register({ pattern: '*.bar', scheme: 'foo' }, new class implements CompletionItemProvider {
				_debugDisplayName = 'test';

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
		model.dispose();
		editor.dispose();
	});


	ensureNoDisposablesAreLeakedInTestSuite();

	test('Aggressive inline completions when typing within line #146948', async function () {

		const completions: SuggestInlineCompletions = insta.createInstance(SuggestInlineCompletions, (id) => editor.getOption(id));

		{
			// (1,3), end of word -> suggestions
			const result = await completions.provideInlineCompletions(model, new Position(1, 3), { triggerKind: InlineCompletionTriggerKind.Explicit, selectedSuggestionInfo: undefined }, CancellationToken.None);
			assert.strictEqual(result?.items.length, 3);
			completions.freeInlineCompletions(result);
		}
		{
			// (1,2), middle of word -> NO suggestions
			const result = await completions.provideInlineCompletions(model, new Position(1, 2), { triggerKind: InlineCompletionTriggerKind.Explicit, selectedSuggestionInfo: undefined }, CancellationToken.None);
			assert.ok(result === undefined);
		}
	});
});
