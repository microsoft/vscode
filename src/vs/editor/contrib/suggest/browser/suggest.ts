/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { canceled, isCancellationError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { FuzzyScore } from 'vs/base/common/filters';
import { DisposableStore, IDisposable, isDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import * as languages from 'vs/editor/common/languages';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { historyNavigationVisible } from 'vs/platform/history/browser/contextScopedHistoryWidget';

export const Context = {
	Visible: historyNavigationVisible,
	DetailsVisible: new RawContextKey<boolean>('suggestWidgetDetailsVisible', false, localize('suggestWidgetDetailsVisible', "Whether suggestion details are visible")),
	MultipleSuggestions: new RawContextKey<boolean>('suggestWidgetMultipleSuggestions', false, localize('suggestWidgetMultipleSuggestions', "Whether there are multiple suggestions to pick from")),
	MakesTextEdit: new RawContextKey('suggestionMakesTextEdit', true, localize('suggestionMakesTextEdit', "Whether inserting the current suggestion yields in a change or has everything already been typed")),
	AcceptSuggestionsOnEnter: new RawContextKey<boolean>('acceptSuggestionOnEnter', true, localize('acceptSuggestionOnEnter', "Whether suggestions are inserted when pressing Enter")),
	HasInsertAndReplaceRange: new RawContextKey('suggestionHasInsertAndReplaceRange', false, localize('suggestionHasInsertAndReplaceRange', "Whether the current suggestion has insert and replace behaviour")),
	InsertMode: new RawContextKey<'insert' | 'replace'>('suggestionInsertMode', undefined, { type: 'string', description: localize('suggestionInsertMode', "Whether the default behaviour is to insert or replace") }),
	CanResolve: new RawContextKey('suggestionCanResolve', false, localize('suggestionCanResolve', "Whether the current suggestion supports to resolve further details")),
};

export const suggestWidgetStatusbarMenu = new MenuId('suggestWidgetStatusBar');

export class CompletionItem {

	_brand!: 'ISuggestionItem';

	//
	readonly editStart: IPosition;
	readonly editInsertEnd: IPosition;
	readonly editReplaceEnd: IPosition;

	//
	readonly textLabel: string;

	// perf
	readonly labelLow: string;
	readonly sortTextLow?: string;
	readonly filterTextLow?: string;

	// validation
	readonly isInvalid: boolean = false;

	// sorting, filtering
	score: FuzzyScore = FuzzyScore.Default;
	distance: number = 0;
	idx?: number;
	word?: string;

	// resolving
	private _isResolved?: boolean;
	private _resolveCache?: Promise<void>;

	constructor(
		readonly position: IPosition,
		readonly completion: languages.CompletionItem,
		readonly container: languages.CompletionList,
		readonly provider: languages.CompletionItemProvider,
	) {
		this.textLabel = typeof completion.label === 'string'
			? completion.label
			: completion.label.label;

		// ensure lower-variants (perf)
		this.labelLow = this.textLabel.toLowerCase();

		// validate label
		this.isInvalid = !this.textLabel;

		this.sortTextLow = completion.sortText && completion.sortText.toLowerCase();
		this.filterTextLow = completion.filterText && completion.filterText.toLowerCase();

		// normalize ranges
		if (Range.isIRange(completion.range)) {
			this.editStart = new Position(completion.range.startLineNumber, completion.range.startColumn);
			this.editInsertEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);
			this.editReplaceEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);

			// validate range
			this.isInvalid = this.isInvalid
				|| Range.spansMultipleLines(completion.range) || completion.range.startLineNumber !== position.lineNumber;

		} else {
			this.editStart = new Position(completion.range.insert.startLineNumber, completion.range.insert.startColumn);
			this.editInsertEnd = new Position(completion.range.insert.endLineNumber, completion.range.insert.endColumn);
			this.editReplaceEnd = new Position(completion.range.replace.endLineNumber, completion.range.replace.endColumn);

			// validate ranges
			this.isInvalid = this.isInvalid
				|| Range.spansMultipleLines(completion.range.insert) || Range.spansMultipleLines(completion.range.replace)
				|| completion.range.insert.startLineNumber !== position.lineNumber || completion.range.replace.startLineNumber !== position.lineNumber
				|| completion.range.insert.startColumn !== completion.range.replace.startColumn;
		}

		// create the suggestion resolver
		if (typeof provider.resolveCompletionItem !== 'function') {
			this._resolveCache = Promise.resolve();
			this._isResolved = true;
		}
	}

	// ---- resolving

	get isResolved(): boolean {
		return !!this._isResolved;
	}

	async resolve(token: CancellationToken) {
		if (!this._resolveCache) {
			const sub = token.onCancellationRequested(() => {
				this._resolveCache = undefined;
				this._isResolved = false;
			});
			this._resolveCache = Promise.resolve(this.provider.resolveCompletionItem!(this.completion, token)).then(value => {
				Object.assign(this.completion, value);
				this._isResolved = true;
				sub.dispose();
			}, err => {
				if (isCancellationError(err)) {
					// the IPC queue will reject the request with the
					// cancellation error -> reset cached
					this._resolveCache = undefined;
					this._isResolved = false;
				}
			});
		}
		return this._resolveCache;
	}
}

export const enum SnippetSortOrder {
	Top, Inline, Bottom
}

export class CompletionOptions {

	static readonly default = new CompletionOptions();

	constructor(
		readonly snippetSortOrder = SnippetSortOrder.Bottom,
		readonly kindFilter = new Set<languages.CompletionItemKind>(),
		readonly providerFilter = new Set<languages.CompletionItemProvider>(),
		readonly showDeprecated = true
	) { }
}

let _snippetSuggestSupport: languages.CompletionItemProvider;

export function getSnippetSuggestSupport(): languages.CompletionItemProvider {
	return _snippetSuggestSupport;
}

export function setSnippetSuggestSupport(support: languages.CompletionItemProvider): languages.CompletionItemProvider {
	const old = _snippetSuggestSupport;
	_snippetSuggestSupport = support;
	return old;
}

export interface CompletionDurationEntry {
	readonly providerName: string;
	readonly elapsedProvider: number;
	readonly elapsedOverall: number;
}

export interface CompletionDurations {
	readonly entries: readonly CompletionDurationEntry[];
	readonly elapsed: number;
}

export class CompletionItemModel {
	constructor(
		readonly items: CompletionItem[],
		readonly needsClipboard: boolean,
		readonly durations: CompletionDurations,
		readonly disposable: IDisposable,
	) { }
}

export async function provideSuggestionItems(
	registry: LanguageFeatureRegistry<languages.CompletionItemProvider>,
	model: ITextModel,
	position: Position,
	options: CompletionOptions = CompletionOptions.default,
	context: languages.CompletionContext = { triggerKind: languages.CompletionTriggerKind.Invoke },
	token: CancellationToken = CancellationToken.None
): Promise<CompletionItemModel> {

	const sw = new StopWatch(true);
	position = position.clone();

	const word = model.getWordAtPosition(position);
	const defaultReplaceRange = word ? new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : Range.fromPositions(position);
	const defaultRange = { replace: defaultReplaceRange, insert: defaultReplaceRange.setEndPosition(position.lineNumber, position.column) };

	const result: CompletionItem[] = [];
	const disposables = new DisposableStore();
	const durations: CompletionDurationEntry[] = [];
	let needsClipboard = false;

	const onCompletionList = (provider: languages.CompletionItemProvider, container: languages.CompletionList | null | undefined, sw: StopWatch): boolean => {
		let didAddResult = false;
		if (!container) {
			return didAddResult;
		}
		for (let suggestion of container.suggestions) {
			if (!options.kindFilter.has(suggestion.kind)) {
				// skip if not showing deprecated suggestions
				if (!options.showDeprecated && suggestion?.tags?.includes(languages.CompletionItemTag.Deprecated)) {
					continue;
				}
				// fill in default range when missing
				if (!suggestion.range) {
					suggestion.range = defaultRange;
				}
				// fill in default sortText when missing
				if (!suggestion.sortText) {
					suggestion.sortText = typeof suggestion.label === 'string' ? suggestion.label : suggestion.label.label;
				}
				if (!needsClipboard && suggestion.insertTextRules && suggestion.insertTextRules & languages.CompletionItemInsertTextRule.InsertAsSnippet) {
					needsClipboard = SnippetParser.guessNeedsClipboard(suggestion.insertText);
				}
				result.push(new CompletionItem(position, suggestion, container, provider));
				didAddResult = true;
			}
		}
		if (isDisposable(container)) {
			disposables.add(container);
		}
		durations.push({
			providerName: provider._debugDisplayName ?? 'unknown_provider', elapsedProvider: container.duration ?? -1, elapsedOverall: sw.elapsed()
		});
		return didAddResult;
	};

	// ask for snippets in parallel to asking "real" providers. Only do something if configured to
	// do so - no snippet filter, no special-providers-only request
	const snippetCompletions = (async () => {
		if (!_snippetSuggestSupport || options.kindFilter.has(languages.CompletionItemKind.Snippet)) {
			return;
		}
		if (options.providerFilter.size > 0 && !options.providerFilter.has(_snippetSuggestSupport)) {
			return;
		}
		const sw = new StopWatch(true);
		const list = await _snippetSuggestSupport.provideCompletionItems(model, position, context, token);
		onCompletionList(_snippetSuggestSupport, list, sw);
	})();

	// add suggestions from contributed providers - providers are ordered in groups of
	// equal score and once a group produces a result the process stops
	// get provider groups, always add snippet suggestion provider
	for (let providerGroup of registry.orderedGroups(model)) {

		// for each support in the group ask for suggestions
		let didAddResult = false;
		await Promise.all(providerGroup.map(async provider => {
			if (options.providerFilter.size > 0 && !options.providerFilter.has(provider)) {
				return;
			}
			try {
				const sw = new StopWatch(true);
				const list = await provider.provideCompletionItems(model, position, context, token);
				didAddResult = onCompletionList(provider, list, sw) || didAddResult;
			} catch (err) {
				onUnexpectedExternalError(err);
			}
		}));

		if (didAddResult || token.isCancellationRequested) {
			break;
		}
	}

	await snippetCompletions;

	if (token.isCancellationRequested) {
		disposables.dispose();
		return Promise.reject<any>(canceled());
	}

	return new CompletionItemModel(
		result.sort(getSuggestionComparator(options.snippetSortOrder)),
		needsClipboard,
		{ entries: durations, elapsed: sw.elapsed() },
		disposables,
	);
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
		if (a.completion.kind === languages.CompletionItemKind.Snippet) {
			return -1;
		} else if (b.completion.kind === languages.CompletionItemKind.Snippet) {
			return 1;
		}
	}
	return defaultComparator(a, b);
}

function snippetDownComparator(a: CompletionItem, b: CompletionItem): number {
	if (a.completion.kind !== b.completion.kind) {
		if (a.completion.kind === languages.CompletionItemKind.Snippet) {
			return 1;
		} else if (b.completion.kind === languages.CompletionItemKind.Snippet) {
			return -1;
		}
	}
	return defaultComparator(a, b);
}

interface Comparator<T> { (a: T, b: T): number }
const _snippetComparators = new Map<SnippetSortOrder, Comparator<CompletionItem>>();
_snippetComparators.set(SnippetSortOrder.Top, snippetUpComparator);
_snippetComparators.set(SnippetSortOrder.Bottom, snippetDownComparator);
_snippetComparators.set(SnippetSortOrder.Inline, defaultComparator);

export function getSuggestionComparator(snippetConfig: SnippetSortOrder): (a: CompletionItem, b: CompletionItem) => number {
	return _snippetComparators.get(snippetConfig)!;
}

CommandsRegistry.registerCommand('_executeCompletionItemProvider', async (accessor, ...args: [URI, IPosition, string?, number?]) => {
	const [uri, position, triggerCharacter, maxItemsToResolve] = args;
	assertType(URI.isUri(uri));
	assertType(Position.isIPosition(position));
	assertType(typeof triggerCharacter === 'string' || !triggerCharacter);
	assertType(typeof maxItemsToResolve === 'number' || !maxItemsToResolve);

	const { completionProvider } = accessor.get(ILanguageFeaturesService);
	const ref = await accessor.get(ITextModelService).createModelReference(uri);
	try {

		const result: languages.CompletionList = {
			incomplete: false,
			suggestions: []
		};

		const resolving: Promise<any>[] = [];
		const completions = await provideSuggestionItems(completionProvider, ref.object.textEditorModel, Position.lift(position), undefined, { triggerCharacter, triggerKind: triggerCharacter ? languages.CompletionTriggerKind.TriggerCharacter : languages.CompletionTriggerKind.Invoke });
		for (const item of completions.items) {
			if (resolving.length < (maxItemsToResolve ?? 0)) {
				resolving.push(item.resolve(CancellationToken.None));
			}
			result.incomplete = result.incomplete || item.container.incomplete;
			result.suggestions.push(item.completion);
		}

		try {
			await Promise.all(resolving);
			return result;
		} finally {
			setTimeout(() => completions.disposable.dispose(), 100);
		}

	} finally {
		ref.dispose();
	}

});

interface SuggestController extends IEditorContribution {
	triggerSuggest(onlyFrom?: Set<languages.CompletionItemProvider>): void;
}


let _onlyOnceProvider: languages.CompletionItemProvider | undefined;
let _onlyOnceSuggestions: languages.CompletionItem[] = [];

export function showSimpleSuggestions(accessor: ServicesAccessor, editor: ICodeEditor, suggestions: languages.CompletionItem[]) {

	const { completionProvider } = accessor.get(ILanguageFeaturesService);

	if (!_onlyOnceProvider) {
		_onlyOnceProvider = new class implements languages.CompletionItemProvider {
			provideCompletionItems(): languages.CompletionList {
				let suggestions = _onlyOnceSuggestions.slice(0);
				let result = { suggestions };
				_onlyOnceSuggestions.length = 0;
				return result;
			}
		};
		completionProvider.register('*', _onlyOnceProvider);
	}

	setTimeout(() => {
		_onlyOnceSuggestions.push(...suggestions);
		editor.getContribution<SuggestController>('editor.contrib.suggestController')?.triggerSuggest(
			new Set<languages.CompletionItemProvider>().add(_onlyOnceProvider!)
		);
	}, 0);
}

export interface ISuggestItemPreselector {
	/**
	 * The preselector with highest priority is asked first.
	*/
	readonly priority: number;

	/**
	 * Is called to preselect a suggest item.
	 * When -1 is returned, item preselectors with lower priority are asked.
	*/
	select(model: ITextModel, pos: IPosition, items: CompletionItem[]): number | -1;
}
