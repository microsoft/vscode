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
import {IReadOnlyModel} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ISuggestResult, ISuggestSupport, ISuggestion, SuggestRegistry} from 'vs/editor/common/modes';
import {ISnippetsRegistry, Extensions} from 'vs/editor/common/modes/snippetsRegistry';
import {Position} from 'vs/editor/common/core/position';
import {Registry} from 'vs/platform/platform';
import {KbCtxKey} from 'vs/platform/keybinding/common/keybinding';

export const Context = {
	Visible: new KbCtxKey<boolean>('suggestWidgetVisible', false),
	MultipleSuggestions: new KbCtxKey<boolean>('suggestWidgetMultipleSuggestions', false),
	AcceptOnKey: new KbCtxKey<boolean>('suggestionSupportsAcceptOnKey', true)
};

export interface ISuggestionItem {
	suggestion: ISuggestion;
	container: ISuggestResult;
	support: ISuggestSupport;
	resolve(): TPromise<void>;
}

export type SnippetConfig = 'top' | 'bottom' | 'inline' | 'none' | 'only';

export interface ISuggestOptions {
	groups?: ISuggestSupport[][];
	snippetConfig?: SnippetConfig;
}


// add suggestions from snippet registry.
const snippetSuggestSupport: ISuggestSupport = {

	triggerCharacters: [],

	provideCompletionItems(model: IReadOnlyModel, position: Position): ISuggestResult[] {
		// currentWord is irrelevant, all suggestion use overwriteBefore
		const result: ISuggestResult = { suggestions: [], currentWord: '' };
		Registry.as<ISnippetsRegistry>(Extensions.Snippets).getSnippetCompletions(model, position, result.suggestions);
		return [result];
	}
};

export function provideSuggestionItems(model: IReadOnlyModel, position: Position, options: ISuggestOptions = {}): TPromise<ISuggestionItem[]> {

	const result: ISuggestionItem[] = [];
	const acceptSuggestion = createSuggesionFilter(options);

	// get provider groups, always add snippet suggestion provider
	const supports = (options.groups || SuggestRegistry.orderedGroups(model));
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
			return TPromise.join(supports.map(support => asWinJsPromise(token => support.provideCompletionItems(model, position, token)).then(values => {

				if (isFalsyOrEmpty(values)) {
					return;
				}

				const len = result.length;

				for (let container of values) {
					if (container && !isFalsyOrEmpty(container.suggestions)) {
						for (let suggestion of container.suggestions) {
							if (acceptSuggestion(suggestion)) {

								fixOverwriteBeforeAfter(suggestion, container);

								result.push({
									container,
									suggestion,
									support,
									resolve: createSuggestionResolver(support, suggestion, model, position)
								});
							}
						}
					}
				}

				if (len !== result.length && support !== snippetSuggestSupport) {
					hasResult = true;
				}

			}, onUnexpectedError)));
		};
	});

	return sequence(factory).then(() => result.sort(createSuggesionComparator(options)));
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
