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
import {ISuggestResult, ISuggestSupport, ISuggestion, SuggestRegistry} from 'vs/editor/common/modes';
import {ISnippetsRegistry, Extensions} from 'vs/editor/common/modes/snippetsRegistry';
import {Position} from 'vs/editor/common/core/position';
import {Registry} from 'vs/platform/platform';

export const Context = {
	Visible: 'suggestWidgetVisible',
	MultipleSuggestions: 'suggestWidgetMultipleSuggestions',
	AcceptOnKey: 'suggestionSupportsAcceptOnKey'
};

export interface ISuggestionItem {
	suggestion: ISuggestion;
	container: ISuggestResult;
	support: ISuggestSupport;
}

export type SnippetConfig = 'top' | 'bottom' | 'inline' | 'none' | 'only';

export interface ISuggestOptions {
	groups?: ISuggestSupport[][];
	snippetConfig?: SnippetConfig;
}

let snippetsRegistry = <ISnippetsRegistry>Registry.as(Extensions.Snippets);

export function provideSuggestionItems(model: IReadOnlyModel, position: Position, options: ISuggestOptions = {}): TPromise<ISuggestionItem[]> {

	const result: ISuggestionItem[] = [];
	const suggestFilter = createSuggesionFilter(options);
	const suggestCompare = createSuggesionComparator(options);

	// add suggestions from snippet registry.
	// currentWord is irrelevant, all suggestion use overwriteBefore
	let snippetSuggestResult : ISuggestResult = { suggestions: [], currentWord: '' };
	snippetsRegistry.getSnippetCompletions(model, position, snippetSuggestResult.suggestions);
	fillInSuggestResult(result, snippetSuggestResult, undefined, suggestFilter);


	// add suggestions from contributed providers - providers are ordered in groups of
	// equal score and once a group produces a result the process stops
	let hasResult = false;
	const factory = (options.groups || SuggestRegistry.orderedGroups(model)).map(supports => {
		return () => {
			// stop when we have a result
			if (hasResult) {
				return;
			}
			// for each support in the group ask for suggestions
			return TPromise.join(supports.map(support => asWinJsPromise(token => support.provideCompletionItems(model, position, token)).then(values => {
				if (!isFalsyOrEmpty(values)) {
					for (let suggestResult of values) {
						hasResult = fillInSuggestResult(result, suggestResult, support, suggestFilter) || hasResult;
					}
				}
			}, onUnexpectedError)));
		};
	});

	return sequence(factory).then(() => result.sort(suggestCompare));
}

function fillInSuggestResult(bucket: ISuggestionItem[], result: ISuggestResult, support: ISuggestSupport, acceptFn: (c: ISuggestion) => boolean): boolean {
	if (!result) {
		return false;
	}
	if (!result.suggestions) {
		return false;
	}
	const len = bucket.length;
	for (const suggestion of result.suggestions) {
		if (acceptFn(suggestion)) {
			bucket.push({
				support,
				suggestion,
				container: result,
			});
		}
	}
	return len !== bucket.length;
}

function createSuggesionFilter(options: ISuggestOptions): (candidate: ISuggestion) => boolean {
	if (options.snippetConfig === 'only') {
		return suggestion => suggestion.type === 'snippet';
	} else if (options.snippetConfig === 'none') {
		return suggestion => suggestion.type !== 'snippet';
	} else {
		return _ => true;
	}
}

function createSuggesionComparator(options: ISuggestOptions): (a: ISuggestionItem, b: ISuggestionItem) => number {

	function defaultComparator(a: ISuggestionItem, b: ISuggestionItem): number {

		if (typeof a.suggestion.sortText === 'string' && typeof b.suggestion.sortText === 'string') {
			const one = a.suggestion.sortText.toLowerCase();
			const other = b.suggestion.sortText.toLowerCase();

			if (one < other) {
				return -1;
			} else if (one > other) {
				return 1;
			}
		}

		return a.suggestion.label.toLowerCase() < b.suggestion.label.toLowerCase() ? -1 : 1;
	}

	function snippetUpComparator(a: ISuggestionItem, b: ISuggestionItem): number {
		if (a.suggestion.type !== b.suggestion.type) {
			if (a.suggestion.type === 'snippet') {
				return -1;
			} else if (b.suggestion.type === 'snippet') {
				return 1;
			}
		}
		return defaultComparator(a, b);
	}

	function snippetDownComparator(a: ISuggestionItem, b: ISuggestionItem): number {
		if (a.suggestion.type !== b.suggestion.type) {
			if (a.suggestion.type === 'snippet') {
				return 1;
			} else if (b.suggestion.type === 'snippet') {
				return -1;
			}
		}
		return defaultComparator(a, b);
	}

	if (options.snippetConfig === 'top') {
		return snippetUpComparator;
	} else if (options.snippetConfig === 'bottom') {
		return snippetDownComparator;
	} else {
		return defaultComparator;
	}
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeCompletionItemProvider', (model, position, args) => {
	return provideSuggestionItems(model, position);
});
