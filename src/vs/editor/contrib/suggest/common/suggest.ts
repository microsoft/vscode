/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {sequence, asWinJsPromise} from 'vs/base/common/async';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {compare} from 'vs/base/common/strings';
import {assign} from 'vs/base/common/objects';
import {onUnexpectedError} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IReadOnlyModel, IPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ISuggestResult, ISuggestSupport, ISuggestion, SuggestRegistry} from 'vs/editor/common/modes';
import {ISnippetsRegistry, Extensions} from 'vs/editor/common/modes/snippetsRegistry';
import {Position} from 'vs/editor/common/core/position';
import {Registry} from 'vs/platform/platform';
import {RawContextKey} from 'vs/platform/contextkey/common/contextkey';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';

export const Context = {
	Visible: new RawContextKey<boolean>('suggestWidgetVisible', false),
	MultipleSuggestions: new RawContextKey<boolean>('suggestWidgetMultipleSuggestions', false),
	AcceptOnKey: new RawContextKey<boolean>('suggestionSupportsAcceptOnKey', true),
	AcceptSuggestionsOnEnter: new RawContextKey<boolean>('acceptSuggestionOnEnter', DefaultConfig.editor.acceptSuggestionOnEnter)
};

export interface ISuggestionItem {
	position: IPosition;
	suggestion: ISuggestion;
	container: ISuggestResult;
	support: ISuggestSupport;
	resolve(): TPromise<void>;
}

export type SnippetConfig = 'top' | 'bottom' | 'inline' | 'none';


// add suggestions from snippet registry.
export const snippetSuggestSupport: ISuggestSupport = {

	triggerCharacters: [],

	provideCompletionItems(model: IReadOnlyModel, position: Position): ISuggestResult {
		// currentWord is irrelevant, all suggestion use overwriteBefore
		const result: ISuggestResult = { suggestions: [], currentWord: '' };
		Registry.as<ISnippetsRegistry>(Extensions.Snippets).getSnippetCompletions(model, position, result.suggestions);
		return result;
	}
};

export function provideSuggestionItems(model: IReadOnlyModel, position: Position, snippetConfig: SnippetConfig = 'bottom', onlyFrom?: ISuggestSupport[]): TPromise<ISuggestionItem[]> {

	const result: ISuggestionItem[] = [];
	const acceptSuggestion = createSuggesionFilter(snippetConfig);

	position = position.clone();

	// get provider groups, always add snippet suggestion provider
	const supports = SuggestRegistry.orderedGroups(model);
	supports.unshift([snippetSuggestSupport]);

	// add suggestions from contributed providers - providers are ordered in groups of
	// equal score and once a group produces a result the process stops
	let hasResult = false;
	const factory = supports.map(supports => {
		return () => {
			// stop when we have a result
			if (hasResult) {
				return;
			}
			// for each support in the group ask for suggestions
			return TPromise.join(supports.map(support => {

				if (!isFalsyOrEmpty(onlyFrom) && onlyFrom.indexOf(support) < 0) {
					return;
				}

				return asWinJsPromise(token => support.provideCompletionItems(model, position, token)).then(container => {

					const len = result.length;

					if (container && !isFalsyOrEmpty(container.suggestions)) {
						for (let suggestion of container.suggestions) {
							if (acceptSuggestion(suggestion)) {

								fixOverwriteBeforeAfter(suggestion, container);

								result.push({
									position,
									container,
									suggestion,
									support,
									resolve: createSuggestionResolver(support, suggestion, model, position)
								});
							}
						}
					}

					if (len !== result.length && support !== snippetSuggestSupport) {
						hasResult = true;
					}

				}, onUnexpectedError);
			}));
		};
	});

	return sequence(factory).then(() => result.sort(getSuggestionComparator(snippetConfig)));
}

function fixOverwriteBeforeAfter(suggestion: ISuggestion, container: ISuggestResult): void {
	if (typeof suggestion.overwriteBefore !== 'number') {
		suggestion.overwriteBefore = container.currentWord.length;
	}
	if (typeof suggestion.overwriteAfter !== 'number' || suggestion.overwriteAfter < 0) {
		suggestion.overwriteAfter = 0;
	}
}

function createSuggestionResolver(provider: ISuggestSupport, suggestion: ISuggestion, model: IReadOnlyModel, position: Position): () => TPromise<void> {
	return () => {
		if (typeof provider.resolveCompletionItem === 'function') {
			return asWinJsPromise(token => provider.resolveCompletionItem(model, position, suggestion, token))
				.then(value => { assign(suggestion, value); });
		}
		return TPromise.as(void 0);
	};
}

function createSuggesionFilter(snippetConfig: SnippetConfig): (candidate: ISuggestion) => boolean {
	if (snippetConfig === 'none') {
		return suggestion => suggestion.type !== 'snippet';
	} else {
		return () => true;
	}
}

export function getSuggestionComparator(snippetConfig: SnippetConfig): (a: ISuggestionItem, b: ISuggestionItem) => number {

	function defaultComparator(a: ISuggestionItem, b: ISuggestionItem): number {

		let ret = 0;

		// check with 'sortText'
		if (typeof a.suggestion.sortText === 'string' && typeof b.suggestion.sortText === 'string') {
			ret = compare(a.suggestion.sortText.toLowerCase(), b.suggestion.sortText.toLowerCase());
		}

		// check with 'label'
		if (!ret) {
			ret = compare(a.suggestion.label.toLowerCase(), b.suggestion.label.toLowerCase());
		}

		// check with 'type' and lower snippets
		if (!ret && a.suggestion.type !== b.suggestion.type) {
			if (a.suggestion.type === 'snippet') {
				ret = 1;
			} else if (b.suggestion.type === 'snippet') {
				ret = -1;
			}
		}

		return ret;
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

	if (snippetConfig === 'top') {
		return snippetUpComparator;
	} else if (snippetConfig === 'bottom') {
		return snippetDownComparator;
	} else {
		return defaultComparator;
	}
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeCompletionItemProvider', (model, position, args) => {
	return provideSuggestionItems(model, position);
});
