/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { first } from 'vs/base/common/async';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { assign } from 'vs/base/common/objects';
import { onUnexpectedExternalError, canceled } from 'vs/base/common/errors';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { CompletionList, CompletionItemProvider, CompletionItem, CompletionProviderRegistry, CompletionContext, CompletionTriggerKind, CompletionItemKind } from 'vs/editor/common/modes';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Range } from 'vs/editor/common/core/range';

export const Context = {
	Visible: new RawContextKey<boolean>('suggestWidgetVisible', false),
	MultipleSuggestions: new RawContextKey<boolean>('suggestWidgetMultipleSuggestions', false),
	MakesTextEdit: new RawContextKey('suggestionMakesTextEdit', true),
	AcceptSuggestionsOnEnter: new RawContextKey<boolean>('acceptSuggestionOnEnter', true)
};

export interface ISuggestionItem {
	position: IPosition;
	suggestion: CompletionItem;
	container: CompletionList;
	support: CompletionItemProvider;
	resolve(token: CancellationToken): Thenable<void>;
}

export type SnippetConfig = 'top' | 'bottom' | 'inline' | 'none';

let _snippetSuggestSupport: CompletionItemProvider;

export function getSnippetSuggestSupport(): CompletionItemProvider {
	return _snippetSuggestSupport;
}

export function setSnippetSuggestSupport(support: CompletionItemProvider): CompletionItemProvider {
	const old = _snippetSuggestSupport;
	_snippetSuggestSupport = support;
	return old;
}

export function provideSuggestionItems(
	model: ITextModel,
	position: Position,
	snippetConfig: SnippetConfig = 'bottom',
	onlyFrom?: CompletionItemProvider[],
	context?: CompletionContext,
	token: CancellationToken = CancellationToken.None
): Promise<ISuggestionItem[]> {

	const allSuggestions: ISuggestionItem[] = [];
	const acceptSuggestion = createSuggesionFilter(snippetConfig);

	const wordUntil = model.getWordUntilPosition(position);
	const defaultRange = new Range(position.lineNumber, wordUntil.startColumn, position.lineNumber, wordUntil.endColumn);

	position = position.clone();

	// get provider groups, always add snippet suggestion provider
	const supports = CompletionProviderRegistry.orderedGroups(model);

	// add snippets provider unless turned off
	if (snippetConfig !== 'none' && _snippetSuggestSupport) {
		supports.unshift([_snippetSuggestSupport]);
	}

	const suggestConext = context || { triggerKind: CompletionTriggerKind.Invoke };

	// add suggestions from contributed providers - providers are ordered in groups of
	// equal score and once a group produces a result the process stops
	let hasResult = false;
	const factory = supports.map(supports => () => {
		// for each support in the group ask for suggestions
		return Promise.all(supports.map(support => {

			if (!isFalsyOrEmpty(onlyFrom) && onlyFrom!.indexOf(support) < 0) {
				return undefined;
			}

			return Promise.resolve(support.provideCompletionItems(model, position, suggestConext, token)).then(container => {

				const len = allSuggestions.length;

				if (container && !isFalsyOrEmpty(container.suggestions)) {
					for (let suggestion of container.suggestions) {
						if (acceptSuggestion(suggestion)) {

							// fill in default range when missing
							if (!suggestion.range) {
								suggestion.range = defaultRange;
							}

							// fill in lower-case text
							ensureLowerCaseVariants(suggestion);

							allSuggestions.push({
								position,
								container,
								suggestion,
								support,
								resolve: createSuggestionResolver(support, suggestion, model, position)
							});
						}
					}
				}

				if (len !== allSuggestions.length && support !== _snippetSuggestSupport) {
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

export function ensureLowerCaseVariants(suggestion: CompletionItem) {
	if (!suggestion._labelLow) {
		suggestion._labelLow = suggestion.label.toLowerCase();
	}
	if (suggestion.sortText && !suggestion._sortTextLow) {
		suggestion._sortTextLow = suggestion.sortText.toLowerCase();
	}
	if (suggestion.filterText && !suggestion._filterTextLow) {
		suggestion._filterTextLow = suggestion.filterText.toLowerCase();
	}
}

function createSuggestionResolver(provider: CompletionItemProvider, suggestion: CompletionItem, model: ITextModel, position: Position): (token: CancellationToken) => Promise<void> {
	let cached: Promise<void>;
	return (token) => {
		if (!cached) {
			if (typeof provider.resolveCompletionItem === 'function') {
				cached = Promise.resolve(provider.resolveCompletionItem(model, position, suggestion, token)).then(value => { assign(suggestion, value); });
			} else {
				cached = Promise.resolve(void 0);
			}
		}
		return cached;
	};
}

function createSuggesionFilter(snippetConfig: SnippetConfig): (candidate: CompletionItem) => boolean {
	if (snippetConfig === 'none') {
		return suggestion => suggestion.kind !== CompletionItemKind.Snippet;
	} else {
		return () => true;
	}
}
function defaultComparator(a: ISuggestionItem, b: ISuggestionItem): number {
	// check with 'sortText'
	if (a.suggestion._sortTextLow && b.suggestion._sortTextLow) {
		if (a.suggestion._sortTextLow < b.suggestion._sortTextLow) {
			return -1;
		} else if (a.suggestion._sortTextLow > b.suggestion._sortTextLow) {
			return 1;
		}
	}
	// check with 'label'
	if (a.suggestion.label < b.suggestion.label) {
		return -1;
	} else if (a.suggestion.label > b.suggestion.label) {
		return 1;
	}
	// check with 'type'
	return a.suggestion.kind - b.suggestion.kind;
}

function snippetUpComparator(a: ISuggestionItem, b: ISuggestionItem): number {
	if (a.suggestion.kind !== b.suggestion.kind) {
		if (a.suggestion.kind === CompletionItemKind.Snippet) {
			return -1;
		} else if (b.suggestion.kind === CompletionItemKind.Snippet) {
			return 1;
		}
	}
	return defaultComparator(a, b);
}

function snippetDownComparator(a: ISuggestionItem, b: ISuggestionItem): number {
	if (a.suggestion.kind !== b.suggestion.kind) {
		if (a.suggestion.kind === CompletionItemKind.Snippet) {
			return 1;
		} else if (b.suggestion.kind === CompletionItemKind.Snippet) {
			return -1;
		}
	}
	return defaultComparator(a, b);
}

export function getSuggestionComparator(snippetConfig: SnippetConfig): (a: ISuggestionItem, b: ISuggestionItem) => number {
	if (snippetConfig === 'top') {
		return snippetUpComparator;
	} else if (snippetConfig === 'bottom') {
		return snippetDownComparator;
	} else {
		return defaultComparator;
	}
}

registerDefaultLanguageCommand('_executeCompletionItemProvider', (model, position, args) => {

	const result: CompletionList = {
		incomplete: false,
		suggestions: []
	};

	let resolving: Thenable<any>[] = [];
	let maxItemsToResolve = args['maxItemsToResolve'] || 0;

	return provideSuggestionItems(model, position).then(items => {
		for (const item of items) {
			if (resolving.length < maxItemsToResolve) {
				resolving.push(item.resolve(CancellationToken.None));
			}
			result.incomplete = result.incomplete || item.container.incomplete;
			result.suggestions.push(item.suggestion);
		}
	}).then(() => {
		return Promise.all(resolving);
	}).then(() => {
		return result;
	});
});

interface SuggestController extends IEditorContribution {
	triggerSuggest(onlyFrom?: CompletionItemProvider[]): void;
}


let _provider = new class implements CompletionItemProvider {

	onlyOnceSuggestions: CompletionItem[] = [];

	provideCompletionItems(): CompletionList {
		let suggestions = this.onlyOnceSuggestions.slice(0);
		let result = { suggestions };
		this.onlyOnceSuggestions.length = 0;
		return result;
	}
};

CompletionProviderRegistry.register('*', _provider);

export function showSimpleSuggestions(editor: ICodeEditor, suggestions: CompletionItem[]) {
	setTimeout(() => {
		_provider.onlyOnceSuggestions.push(...suggestions);
		editor.getContribution<SuggestController>('editor.contrib.suggestController').triggerSuggest([_provider]);
	}, 0);
}
