/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { DisposableStore, isDisposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { SnippetParser } from '../../snippet/browser/snippetParser.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { historyNavigationVisible } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
export const Context = {
    Visible: historyNavigationVisible,
    HasFocusedSuggestion: new RawContextKey('suggestWidgetHasFocusedSuggestion', false, localize('suggestWidgetHasSelection', "Whether any suggestion is focused")),
    DetailsVisible: new RawContextKey('suggestWidgetDetailsVisible', false, localize('suggestWidgetDetailsVisible', "Whether suggestion details are visible")),
    DetailsFocused: new RawContextKey('suggestWidgetDetailsFocused', false, localize('suggestWidgetDetailsFocused', "Whether the details pane of the suggest widget has focus")),
    MultipleSuggestions: new RawContextKey('suggestWidgetMultipleSuggestions', false, localize('suggestWidgetMultipleSuggestions', "Whether there are multiple suggestions to pick from")),
    MakesTextEdit: new RawContextKey('suggestionMakesTextEdit', true, localize('suggestionMakesTextEdit', "Whether inserting the current suggestion yields in a change or has everything already been typed")),
    AcceptSuggestionsOnEnter: new RawContextKey('acceptSuggestionOnEnter', true, localize('acceptSuggestionOnEnter', "Whether suggestions are inserted when pressing Enter")),
    HasInsertAndReplaceRange: new RawContextKey('suggestionHasInsertAndReplaceRange', false, localize('suggestionHasInsertAndReplaceRange', "Whether the current suggestion has insert and replace behaviour")),
    InsertMode: new RawContextKey('suggestionInsertMode', undefined, { type: 'string', description: localize('suggestionInsertMode', "Whether the default behaviour is to insert or replace") }),
    CanResolve: new RawContextKey('suggestionCanResolve', false, localize('suggestionCanResolve', "Whether the current suggestion supports to resolve further details")),
};
export const suggestWidgetStatusbarMenu = new MenuId('suggestWidgetStatusBar');
export class CompletionItem {
    constructor(position, completion, container, provider) {
        this.position = position;
        this.completion = completion;
        this.container = container;
        this.provider = provider;
        // validation
        this.isInvalid = false;
        // sorting, filtering
        this.score = FuzzyScore.Default;
        this.distance = 0;
        this.textLabel = typeof completion.label === 'string'
            ? completion.label
            : completion.label?.label;
        // ensure lower-variants (perf)
        this.labelLow = this.textLabel.toLowerCase();
        // validate label
        this.isInvalid = !this.textLabel;
        this.sortTextLow = completion.sortText && completion.sortText.toLowerCase();
        this.filterTextLow = completion.filterText && completion.filterText.toLowerCase();
        this.extensionId = completion.extensionId;
        // normalize ranges
        if (Range.isIRange(completion.range)) {
            this.editStart = new Position(completion.range.startLineNumber, completion.range.startColumn);
            this.editInsertEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);
            this.editReplaceEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);
            // validate range
            this.isInvalid = this.isInvalid
                || Range.spansMultipleLines(completion.range) || completion.range.startLineNumber !== position.lineNumber;
        }
        else {
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
            this._resolveDuration = 0;
        }
    }
    // ---- resolving
    get isResolved() {
        return this._resolveDuration !== undefined;
    }
    get resolveDuration() {
        return this._resolveDuration !== undefined ? this._resolveDuration : -1;
    }
    async resolve(token) {
        if (!this._resolveCache) {
            const sub = token.onCancellationRequested(() => {
                this._resolveCache = undefined;
                this._resolveDuration = undefined;
            });
            const sw = new StopWatch(true);
            this._resolveCache = Promise.resolve(this.provider.resolveCompletionItem(this.completion, token)).then(value => {
                Object.assign(this.completion, value);
                this._resolveDuration = sw.elapsed();
            }, err => {
                if (isCancellationError(err)) {
                    // the IPC queue will reject the request with the
                    // cancellation error -> reset cached
                    this._resolveCache = undefined;
                    this._resolveDuration = undefined;
                }
            }).finally(() => {
                sub.dispose();
            });
        }
        return this._resolveCache;
    }
}
export var SnippetSortOrder;
(function (SnippetSortOrder) {
    SnippetSortOrder[SnippetSortOrder["Top"] = 0] = "Top";
    SnippetSortOrder[SnippetSortOrder["Inline"] = 1] = "Inline";
    SnippetSortOrder[SnippetSortOrder["Bottom"] = 2] = "Bottom";
})(SnippetSortOrder || (SnippetSortOrder = {}));
export class CompletionOptions {
    static { this.default = new CompletionOptions(); }
    constructor(snippetSortOrder = 2 /* SnippetSortOrder.Bottom */, kindFilter = new Set(), providerFilter = new Set(), providerItemsToReuse = new Map(), showDeprecated = true) {
        this.snippetSortOrder = snippetSortOrder;
        this.kindFilter = kindFilter;
        this.providerFilter = providerFilter;
        this.providerItemsToReuse = providerItemsToReuse;
        this.showDeprecated = showDeprecated;
    }
}
let _snippetSuggestSupport;
export function getSnippetSuggestSupport() {
    return _snippetSuggestSupport;
}
export function setSnippetSuggestSupport(support) {
    const old = _snippetSuggestSupport;
    _snippetSuggestSupport = support;
    return old;
}
export class CompletionItemModel {
    constructor(items, needsClipboard, durations, disposable) {
        this.items = items;
        this.needsClipboard = needsClipboard;
        this.durations = durations;
        this.disposable = disposable;
    }
}
export async function provideSuggestionItems(registry, model, position, options = CompletionOptions.default, context = { triggerKind: 0 /* languages.CompletionTriggerKind.Invoke */ }, token = CancellationToken.None) {
    const sw = new StopWatch();
    position = position.clone();
    const word = model.getWordAtPosition(position);
    const defaultReplaceRange = word ? new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : Range.fromPositions(position);
    const defaultRange = { replace: defaultReplaceRange, insert: defaultReplaceRange.setEndPosition(position.lineNumber, position.column) };
    const result = [];
    const disposables = new DisposableStore();
    const durations = [];
    let needsClipboard = false;
    const onCompletionList = (provider, container, sw) => {
        let didAddResult = false;
        if (!container) {
            return didAddResult;
        }
        for (const suggestion of container.suggestions) {
            if (!options.kindFilter.has(suggestion.kind)) {
                // skip if not showing deprecated suggestions
                if (!options.showDeprecated && suggestion?.tags?.includes(1 /* languages.CompletionItemTag.Deprecated */)) {
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
                if (!needsClipboard && suggestion.insertTextRules && suggestion.insertTextRules & 4 /* languages.CompletionItemInsertTextRule.InsertAsSnippet */) {
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
        if (!_snippetSuggestSupport || options.kindFilter.has(28 /* languages.CompletionItemKind.Snippet */)) {
            return;
        }
        // we have items from a previous session that we can reuse
        const reuseItems = options.providerItemsToReuse.get(_snippetSuggestSupport);
        if (reuseItems) {
            reuseItems.forEach(item => result.push(item));
            return;
        }
        if (options.providerFilter.size > 0 && !options.providerFilter.has(_snippetSuggestSupport)) {
            return;
        }
        const sw = new StopWatch();
        const list = await _snippetSuggestSupport.provideCompletionItems(model, position, context, token);
        onCompletionList(_snippetSuggestSupport, list, sw);
    })();
    // add suggestions from contributed providers - providers are ordered in groups of
    // equal score and once a group produces a result the process stops
    // get provider groups, always add snippet suggestion provider
    for (const providerGroup of registry.orderedGroups(model)) {
        // for each support in the group ask for suggestions
        let didAddResult = false;
        await Promise.all(providerGroup.map(async (provider) => {
            // we have items from a previous session that we can reuse
            if (options.providerItemsToReuse.has(provider)) {
                const items = options.providerItemsToReuse.get(provider);
                items.forEach(item => result.push(item));
                didAddResult = didAddResult || items.length > 0;
                return;
            }
            // check if this provider is filtered out
            if (options.providerFilter.size > 0 && !options.providerFilter.has(provider)) {
                return;
            }
            try {
                const sw = new StopWatch();
                const list = await provider.provideCompletionItems(model, position, context, token);
                didAddResult = onCompletionList(provider, list, sw) || didAddResult;
            }
            catch (err) {
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
        return Promise.reject(new CancellationError());
    }
    return new CompletionItemModel(result.sort(getSuggestionComparator(options.snippetSortOrder)), needsClipboard, { entries: durations, elapsed: sw.elapsed() }, disposables);
}
function defaultComparator(a, b) {
    // check with 'sortText'
    if (a.sortTextLow && b.sortTextLow) {
        if (a.sortTextLow < b.sortTextLow) {
            return -1;
        }
        else if (a.sortTextLow > b.sortTextLow) {
            return 1;
        }
    }
    // check with 'label'
    if (a.textLabel < b.textLabel) {
        return -1;
    }
    else if (a.textLabel > b.textLabel) {
        return 1;
    }
    // check with 'type'
    return a.completion.kind - b.completion.kind;
}
function snippetUpComparator(a, b) {
    if (a.completion.kind !== b.completion.kind) {
        if (a.completion.kind === 28 /* languages.CompletionItemKind.Snippet */) {
            return -1;
        }
        else if (b.completion.kind === 28 /* languages.CompletionItemKind.Snippet */) {
            return 1;
        }
    }
    return defaultComparator(a, b);
}
function snippetDownComparator(a, b) {
    if (a.completion.kind !== b.completion.kind) {
        if (a.completion.kind === 28 /* languages.CompletionItemKind.Snippet */) {
            return 1;
        }
        else if (b.completion.kind === 28 /* languages.CompletionItemKind.Snippet */) {
            return -1;
        }
    }
    return defaultComparator(a, b);
}
const _snippetComparators = new Map();
_snippetComparators.set(0 /* SnippetSortOrder.Top */, snippetUpComparator);
_snippetComparators.set(2 /* SnippetSortOrder.Bottom */, snippetDownComparator);
_snippetComparators.set(1 /* SnippetSortOrder.Inline */, defaultComparator);
export function getSuggestionComparator(snippetConfig) {
    return _snippetComparators.get(snippetConfig);
}
CommandsRegistry.registerCommand('_executeCompletionItemProvider', async (accessor, ...args) => {
    const [uri, position, triggerCharacter, maxItemsToResolve] = args;
    assertType(URI.isUri(uri));
    assertType(Position.isIPosition(position));
    assertType(typeof triggerCharacter === 'string' || !triggerCharacter);
    assertType(typeof maxItemsToResolve === 'number' || !maxItemsToResolve);
    const { completionProvider } = accessor.get(ILanguageFeaturesService);
    const ref = await accessor.get(ITextModelService).createModelReference(uri);
    try {
        const result = {
            incomplete: false,
            suggestions: []
        };
        const resolving = [];
        const actualPosition = ref.object.textEditorModel.validatePosition(position);
        const completions = await provideSuggestionItems(completionProvider, ref.object.textEditorModel, actualPosition, undefined, { triggerCharacter: triggerCharacter ?? undefined, triggerKind: triggerCharacter ? 1 /* languages.CompletionTriggerKind.TriggerCharacter */ : 0 /* languages.CompletionTriggerKind.Invoke */ });
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
        }
        finally {
            setTimeout(() => completions.disposable.dispose(), 100);
        }
    }
    finally {
        ref.dispose();
    }
});
export function showSimpleSuggestions(editor, provider) {
    editor.getContribution('editor.contrib.suggestController')?.triggerSuggest(new Set().add(provider), undefined, true);
}
export class QuickSuggestionsOptions {
    static isAllOff(config) {
        return config.other === 'off' && config.comments === 'off' && config.strings === 'off';
    }
    static isAllOn(config) {
        return config.other === 'on' && config.comments === 'on' && config.strings === 'on';
    }
    static valueFor(config, tokenType) {
        switch (tokenType) {
            case 1 /* StandardTokenType.Comment */: return config.comments;
            case 2 /* StandardTokenType.String */: return config.strings;
            default: return config.other;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBYSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFJdEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDeEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxN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