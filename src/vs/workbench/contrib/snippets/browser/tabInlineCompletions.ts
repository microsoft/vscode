/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
// import { Range } from 'vs/editor/common/core/range';
import { InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ISnippetsService } from 'vs/workbench/contrib/snippets/browser/snippets.contribution';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class Foo extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILanguageFeaturesService languageFeatureService: ILanguageFeaturesService,
		@ISnippetsService snippetsService: ISnippetsService,
	) {
		super();

		this._register(
			languageFeatureService.inlineCompletionsProvider.register(
				'*',
				new SnippetInlineCompletionProvider(snippetsService)
			)
		);
	}
}

class SnippetInlineCompletionProvider implements InlineCompletionsProvider {
	constructor(private readonly _snippetsService: ISnippetsService) {
	}

	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<InlineCompletions<InlineCompletion>> {

		model.tokenizeIfCheap(position.lineNumber);
		const id = model.getLanguageIdAtPosition(position.lineNumber, position.column);
		const snippets = await this._snippetsService.getSnippets(id);

		const lineTextBeforeCursor = model.getLineContent(position.lineNumber).substring(0, position.column - 1);

		const result: InlineCompletion[] = [];


		// Does `lineTextBeforeCursor` end with a number?
		const match = /^([^\d]*)(\d+)$/g.exec(lineTextBeforeCursor);
		if (match) {
			const prefix = match[1];
			const number = parseInt(match[2]);
			// repeat the string "div" as many times as number indicates
			const insertText = Array(number + 1).join('div');

			result.push({
				filterText: match[2],
				insertText
			});
		}

		if (lineTextBeforeCursor.endsWith('11')) {
			result.push({
				filterText: '11',
				insertText: { snippet: 'option1' }
			});
		}
		if (lineTextBeforeCursor.endsWith('112')) {
			result.push({
				filterText: '112',
				insertText: { snippet: 'option2' }
			});
		}


		for (const snippet of snippets) {
			/*
			llliinnnnneeee|
					prefix


			cons        -> console.log
			abbreviation   insertText

			cons[ole.log]



			console     -> printf


			div*2 -> *2



			whlie -> while (true) {}

			while [(true) {}]


			*/
			if (lineTextBeforeCursor.endsWith(snippet.prefix)) {
				result.push({
					filterText: snippet.prefix,
					insertText: { snippet: snippet.codeSnippet },
					//range: Range.fromPositions(position.delta(0, -snippet.prefix.length), position),
				});
			}
		}

		return { items: result };
	}

	freeInlineCompletions(completions: InlineCompletions<InlineCompletion>): void {

	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(Foo, LifecyclePhase.Eventually);
