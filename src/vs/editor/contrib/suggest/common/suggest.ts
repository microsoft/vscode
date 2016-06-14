/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {sequence, asWinJsPromise} from 'vs/base/common/async';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {onUnexpectedError} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IReadOnlyModel} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ISuggestResult, ISuggestSupport, SuggestRegistry} from 'vs/editor/common/modes';
import {SnippetsRegistry} from 'vs/editor/common/modes/supports';
import {Position} from 'vs/editor/common/core/position';

export const Context = {
	Visible: 'suggestWidgetVisible',
	MultipleSuggestions: 'suggestWidgetMultipleSuggestions',
	AcceptOnKey: 'suggestionSupportsAcceptOnKey'
};

export interface ISuggestResult2 extends ISuggestResult {
	support?: ISuggestSupport;
}

export function provideCompletionItems(model: IReadOnlyModel, position: Position, groups?: ISuggestSupport[][]): TPromise<ISuggestResult2[]> {

	if (!groups) {
		groups = SuggestRegistry.orderedGroups(model);
	}

	const result: ISuggestResult2[] = [];

	const factory = groups.map((supports, index) => {
		return () => {

			// stop as soon as a group produced a result
			if (result.length > 0) {
				return;
			}

			// for each support in the group ask for suggestions
			return TPromise.join(supports.map(support => {
				return asWinJsPromise((token) => {
					return support.provideCompletionItems(model, position, token);
				}).then(values => {

					if (!values) {
						return;
					}

					for (let suggestResult of values) {

						if (!suggestResult || isFalsyOrEmpty(suggestResult.suggestions)) {
							continue;
						}

						result.push({
							support,
							currentWord: suggestResult.currentWord,
							incomplete: suggestResult.incomplete,
							suggestions: suggestResult.suggestions
						});
					}

				}, onUnexpectedError);
			}));
		};
	});

	return sequence(factory).then(() => {
		// add snippets to the first group
		const snippets = SnippetsRegistry.getSnippets(model, position);
		result.push(snippets);
		return result;
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeCompletionItemProvider', (model, position, args) => {
	return provideCompletionItems(model, position);
});
