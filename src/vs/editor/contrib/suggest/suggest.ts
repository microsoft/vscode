/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { first } from 'vs/base/common/async';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { assign } from 'vs/base/common/objects';
import { onUnexpectedExternalError, canceled, isPromiseCanceledError } from 'vs/base/common/errors';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import * as modes from 'vs/editor/common/modes';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Range } from 'vs/editor/common/core/range';
import { FuzzyScore } from 'vs/base/common/filters';

export const Context = {
	Visible: new RawContextKey<boolean>('suggestWidgetVisible', false),
	MultipleSuggestions: new RawContextKey<boolean>('suggestWidgetMultipleSuggestions', false),
	MakesTextEdit: new RawContextKey('suggestionMakesTextEdit', true),
	AcceptSuggestionsOnEnter: new RawContextKey<boolean>('acceptSuggestionOnEnter', true)
};

export class CompletionItem {

	_brand: 'ISuggestionItem';

	readonly resolve: (token: CancellationToken) => Promise<void>;

	// perf
	readonly labelLow: string;
	readonly sortTextLow?: string;
	readonly filterTextLow?: string;

	// sorting, filtering
	score: FuzzyScore = FuzzyScore.Default;
	distance: number = 0;
	idx?: number;
	word?: string;

	constructor(
		readonly position: IPosition,
		readonly completion: modes.CompletionItem,
		readonly container: modes.CompletionList,
		readonly provider: modes.CompletionItemProvider,
		model: ITextModel
	) {
		// ensure lower-variants (perf)
		this.labelLow = completion.label.toLowerCase();
		this.sortTextLow = completion.sortText && completion.sortText.toLowerCase();
		this.filterTextLow = completion.filterText && completion.filterText.toLowerCase();

		// create the suggestion resolver
		const { resolveCompletionItem } = provider;
		if (typeof resolveCompletionItem !== 'function') {
			this.resolve = () => Promise.resolve();
		} else {
			let cached: Promise<void> | undefined;
			this.resolve = (token) => {
				if (!cached) {
					let isDone = false;
					cached = Promise.resolve(resolveCompletionItem.call(provider, model, position, completion, token)).then(value => {
						assign(completion, value);
						isDone = true;
					}, err => {
						if (isPromiseCanceledError(err)) {
							// the IPC queue will reject the request with the
							// cancellation error -> reset cached
							cached = undefined;
						}
					});
					token.onCancellationRequested(() => {
						if (!isDone) {
							// cancellation after the request has been
							// dispatched -> reset cache
							cached = undefined;
						}
					});
				}
				return cached;
			};
		}
	}
}

export type SnippetConfig = 'top' | 'bottom' | 'inline' | 'none';

let _snippetSuggestSupport: modes.CompletionItemProvider;

export function getSnippetSuggestSupport(): modes.CompletionItemProvider {
	return _snippetSuggestSupport;
}

export function setSnippetSuggestSupport(support: modes.CompletionItemProvider): modes.CompletionItemProvider {
	const old = _snippetSuggestSupport;
	_snippetSuggestSupport = support;
	return old;
}

export function provideSuggestionItems(
	model: ITextModel,
	position: Position,
	snippetConfig: SnippetConfig = 'bottom',
	onlyFrom?: modes.CompletionItemProvider[],
	context?: modes.CompletionContext,
	token: CancellationToken = CancellationToken.None
): Promise<CompletionItem[]> {

	const allSuggestions: CompletionItem[] = [];
	const acceptSuggestion = createSuggesionFilter(snippetConfig);

	const wordUntil = model.getWordUntilPosition(position);
	const defaultRange = new Range(position.lineNumber, wordUntil.startColumn, position.lineNumber, wordUntil.endColumn);

	position = position.clone();

	// get provider groups, always add snippet suggestion provider
	const supports = modes.CompletionProviderRegistry.orderedGroups(model);

	// add snippets provider unless turned off
	if (snippetConfig !== 'none' && _snippetSuggestSupport) {
		supports.unshift([_snippetSuggestSupport]);
	}

	const suggestConext = context || { triggerKind: modes.CompletionTriggerKind.Invoke };

	// add suggestions from contributed providers - providers are ordered in groups of
	// equal score and once a group produces a result the process stops
	let hasResult = false;
	const factory = supports.map(supports => () => {
		// for each support in the group ask for suggestions
		return Promise.all(supports.map(provider => {

			if (isNonEmptyArray(onlyFrom) && onlyFrom.indexOf(provider) < 0) {
				return undefined;
			}

			return Promise.resolve(provider.provideCompletionItems(model, position, suggestConext, token)).then(container => {

				const len = allSuggestions.length;

				if (container) {
					for (let suggestion of container.suggestions || []) {
						if (acceptSuggestion(suggestion)) {

							// fill in default range when missing
							if (!suggestion.range) {
								suggestion.range = defaultRange;
							}

							allSuggestions.push(new CompletionItem(position, suggestion, container, provider, model));
						}
					}
				}

				if (len !== allSuggestions.length && provider !== _snippetSuggestSupport) {
					hasResult = true;
				}

			}, onUnexpectedExternalError);
		}));
	});

	const result = first(factory, () => {
		// stop on result or cancellation
		return hasResult || token.isCancellationRequested;
	}).then(() => {
		if (token.isCancellationRequested) {
			return Promise.reject(canceled());
		}
		return allSuggestions.sort(getSuggestionComparator(snippetConfig));
	});

	// result.then(items => {
	// 	console.log(model.getWordUntilPosition(position), items.map(item => `${item.suggestion.label}, type=${item.suggestion.type}, incomplete?${item.container.incomplete}, overwriteBefore=${item.suggestion.overwriteBefore}`));
	// 	return items;
	// }, err => {
	// 	console.warn(model.getWordUntilPosition(position), err);
	// });

	return result;
}

function createSuggesionFilter(snippetConfig: SnippetConfig): (candidate: modes.CompletionItem) => boolean {
	if (snippetConfig === 'none') {
		return suggestion => suggestion.kind !== modes.CompletionItemKind.Snippet;
	} else {
		return () => true;
	}
}
function defaultComparator(a: CompletionItem, b: CompletionItem): number {
	// check with 'sortText'
	if (a.sortTextLow && b.sortTextLow) {
		if (a.sortTextLow < b.sortTextLow) {
			return -1;
		} else if (a.sortTextLow > b.sortTextLow) {
			return 1;
		}
	}
	// check with 'label'
	if (a.completion.label < b.completion.label) {
		return -1;
	} else if (a.completion.label > b.completion.label) {
		return 1;
	}
	// check with 'type'
	return a.completion.kind - b.completion.kind;
}

function snippetUpComparator(a: CompletionItem, b: CompletionItem): number {
	if (a.completion.kind !== b.completion.kind) {
		if (a.completion.kind === modes.CompletionItemKind.Snippet) {
			return -1;
		} else if (b.completion.kind === modes.CompletionItemKind.Snippet) {
			return 1;
		}
	}
	return defaultComparator(a, b);
}

function snippetDownComparator(a: CompletionItem, b: CompletionItem): number {
	if (a.completion.kind !== b.completion.kind) {
		if (a.completion.kind === modes.CompletionItemKind.Snippet) {
			return 1;
		} else if (b.completion.kind === modes.CompletionItemKind.Snippet) {
			return -1;
		}
	}
	return defaultComparator(a, b);
}

export function getSuggestionComparator(snippetConfig: SnippetConfig): (a: CompletionItem, b: CompletionItem) => number {
	if (snippetConfig === 'top') {
		return snippetUpComparator;
	} else if (snippetConfig === 'bottom') {
		return snippetDownComparator;
	} else {
		return defaultComparator;
	}
}

registerDefaultLanguageCommand('_executeCompletionItemProvider', (model, position, args) => {

	const result: modes.CompletionList = {
		incomplete: false,
		suggestions: []
	};

	let resolving: Promise<any>[] = [];
	let maxItemsToResolve = args['maxItemsToResolve'] || 0;

	return provideSuggestionItems(model, position).then(items => {
		for (const item of items) {
			if (resolving.length < maxItemsToResolve) {
				resolving.push(item.resolve(CancellationToken.None));
			}
			result.incomplete = result.incomplete || item.container.incomplete;
			result.suggestions.push(item.completion);
		}
	}).then(() => {
		return Promise.all(resolving);
	}).then(() => {
		return result;
	});
});

interface SuggestController extends IEditorContribution {
	triggerSuggest(onlyFrom?: modes.CompletionItemProvider[]): void;
}


let _provider = new class implements modes.CompletionItemProvider {

	onlyOnceSuggestions: modes.CompletionItem[] = [];

	provideCompletionItems(): modes.CompletionList {
		let suggestions = this.onlyOnceSuggestions.slice(0);
		let result = { suggestions };
		this.onlyOnceSuggestions.length = 0;
		return result;
	}
};

modes.CompletionProviderRegistry.register('*', _provider);

export function showSimpleSuggestions(editor: ICodeEditor, suggestions: modes.CompletionItem[]) {
	setTimeout(() => {
		_provider.onlyOnceSuggestions.push(...suggestions);
		editor.getContribution<SuggestController>('editor.contrib.suggestController').triggerSuggest([_provider]);
	}, 0);
}
