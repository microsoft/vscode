/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { quickSelect } from '../../../../base/common/arrays.js';
import { anyScore, fuzzyScore, FuzzyScore, fuzzyScoreGracefulAggressive, FuzzyScoreOptions } from '../../../../base/common/filters.js';
import { compareIgnoreCase } from '../../../../base/common/strings.js';
export class LineContext {
    constructor(leadingLineContent, characterCountDelta) {
        this.leadingLineContent = leadingLineContent;
        this.characterCountDelta = characterCountDelta;
    }
}
var Refilter;
(function (Refilter) {
    Refilter[Refilter["Nothing"] = 0] = "Nothing";
    Refilter[Refilter["All"] = 1] = "All";
    Refilter[Refilter["Incr"] = 2] = "Incr";
})(Refilter || (Refilter = {}));
/**
 * Sorted, filtered completion view model
 * */
export class CompletionModel {
    constructor(items, column, lineContext, wordDistance, options, snippetSuggestions, fuzzyScoreOptions = FuzzyScoreOptions.default, clipboardText = undefined) {
        this.clipboardText = clipboardText;
        this._snippetCompareFn = CompletionModel._compareCompletionItems;
        this._items = items;
        this._column = column;
        this._wordDistance = wordDistance;
        this._options = options;
        this._refilterKind = 1 /* Refilter.All */;
        this._lineContext = lineContext;
        this._fuzzyScoreOptions = fuzzyScoreOptions;
        if (snippetSuggestions === 'top') {
            this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsUp;
        }
        else if (snippetSuggestions === 'bottom') {
            this._snippetCompareFn = CompletionModel._compareCompletionItemsSnippetsDown;
        }
    }
    get lineContext() {
        return this._lineContext;
    }
    set lineContext(value) {
        if (this._lineContext.leadingLineContent !== value.leadingLineContent
            || this._lineContext.characterCountDelta !== value.characterCountDelta) {
            this._refilterKind = this._lineContext.characterCountDelta < value.characterCountDelta && this._filteredItems ? 2 /* Refilter.Incr */ : 1 /* Refilter.All */;
            this._lineContext = value;
        }
    }
    get items() {
        this._ensureCachedState();
        return this._filteredItems;
    }
    getItemsByProvider() {
        this._ensureCachedState();
        return this._itemsByProvider;
    }
    getIncompleteProvider() {
        this._ensureCachedState();
        const result = new Set();
        for (const [provider, items] of this.getItemsByProvider()) {
            if (items.length > 0 && items[0].container.incomplete) {
                result.add(provider);
            }
        }
        return result;
    }
    get stats() {
        this._ensureCachedState();
        return this._stats;
    }
    _ensureCachedState() {
        if (this._refilterKind !== 0 /* Refilter.Nothing */) {
            this._createCachedState();
        }
    }
    _createCachedState() {
        this._itemsByProvider = new Map();
        const labelLengths = [];
        const { leadingLineContent, characterCountDelta } = this._lineContext;
        let word = '';
        let wordLow = '';
        // incrementally filter less
        const source = this._refilterKind === 1 /* Refilter.All */ ? this._items : this._filteredItems;
        const target = [];
        // picks a score function based on the number of
        // items that we have to score/filter and based on the
        // user-configuration
        const scoreFn = (!this._options.filterGraceful || source.length > 2000) ? fuzzyScore : fuzzyScoreGracefulAggressive;
        for (let i = 0; i < source.length; i++) {
            const item = source[i];
            if (item.isInvalid) {
                continue; // SKIP invalid items
            }
            // keep all items by their provider
            const arr = this._itemsByProvider.get(item.provider);
            if (arr) {
                arr.push(item);
            }
            else {
                this._itemsByProvider.set(item.provider, [item]);
            }
            // 'word' is that remainder of the current line that we
            // filter and score against. In theory each suggestion uses a
            // different word, but in practice not - that's why we cache
            const overwriteBefore = item.position.column - item.editStart.column;
            const wordLen = overwriteBefore + characterCountDelta - (item.position.column - this._column);
            if (word.length !== wordLen) {
                word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen);
                wordLow = word.toLowerCase();
            }
            // remember the word against which this item was
            // scored
            item.word = word;
            if (wordLen === 0) {
                // when there is nothing to score against, don't
                // event try to do. Use a const rank and rely on
                // the fallback-sort using the initial sort order.
                // use a score of `-100` because that is out of the
                // bound of values `fuzzyScore` will return
                item.score = FuzzyScore.Default;
            }
            else {
                // skip word characters that are whitespace until
                // we have hit the replace range (overwriteBefore)
                let wordPos = 0;
                while (wordPos < overwriteBefore) {
                    const ch = word.charCodeAt(wordPos);
                    if (ch === 32 /* CharCode.Space */ || ch === 9 /* CharCode.Tab */) {
                        wordPos += 1;
                    }
                    else {
                        break;
                    }
                }
                if (wordPos >= wordLen) {
                    // the wordPos at which scoring starts is the whole word
                    // and therefore the same rules as not having a word apply
                    item.score = FuzzyScore.Default;
                }
                else if (typeof item.completion.filterText === 'string') {
                    // when there is a `filterText` it must match the `word`.
                    // if it matches we check with the label to compute highlights
                    // and if that doesn't yield a result we have no highlights,
                    // despite having the match
                    const match = scoreFn(word, wordLow, wordPos, item.completion.filterText, item.filterTextLow, 0, this._fuzzyScoreOptions);
                    if (!match) {
                        continue; // NO match
                    }
                    if (compareIgnoreCase(item.completion.filterText, item.textLabel) === 0) {
                        // filterText and label are actually the same -> use good highlights
                        item.score = match;
                    }
                    else {
                        // re-run the scorer on the label in the hope of a result BUT use the rank
                        // of the filterText-match
                        item.score = anyScore(word, wordLow, wordPos, item.textLabel, item.labelLow, 0);
                        item.score[0] = match[0]; // use score from filterText
                    }
                }
                else {
                    // by default match `word` against the `label`
                    const match = scoreFn(word, wordLow, wordPos, item.textLabel, item.labelLow, 0, this._fuzzyScoreOptions);
                    if (!match) {
                        continue; // NO match
                    }
                    item.score = match;
                }
            }
            item.idx = i;
            item.distance = this._wordDistance.distance(item.position, item.completion);
            target.push(item);
            // update stats
            labelLengths.push(item.textLabel.length);
        }
        this._filteredItems = target.sort(this._snippetCompareFn);
        this._refilterKind = 0 /* Refilter.Nothing */;
        this._stats = {
            pLabelLen: labelLengths.length ?
                quickSelect(labelLengths.length - .85, labelLengths, (a, b) => a - b)
                : 0
        };
    }
    static _compareCompletionItems(a, b) {
        if (a.score[0] > b.score[0]) {
            return -1;
        }
        else if (a.score[0] < b.score[0]) {
            return 1;
        }
        else if (a.distance < b.distance) {
            return -1;
        }
        else if (a.distance > b.distance) {
            return 1;
        }
        else if (a.idx < b.idx) {
            return -1;
        }
        else if (a.idx > b.idx) {
            return 1;
        }
        else {
            return 0;
        }
    }
    static _compareCompletionItemsSnippetsDown(a, b) {
        if (a.completion.kind !== b.completion.kind) {
            if (a.completion.kind === 28 /* CompletionItemKind.Snippet */) {
                return 1;
            }
            else if (b.completion.kind === 28 /* CompletionItemKind.Snippet */) {
                return -1;
            }
        }
        return CompletionModel._compareCompletionItems(a, b);
    }
    static _compareCompletionItemsSnippetsUp(a, b) {
        if (a.completion.kind !== b.completion.kind) {
            if (a.completion.kind === 28 /* CompletionItemKind.Snippet */) {
                return -1;
            }
            else if (b.completion.kind === 28 /* CompletionItemKind.Snippet */) {
                return 1;
            }
        }
        return CompletionModel._compareCompletionItems(a, b);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGxldGlvbk1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL2NvbXBsZXRpb25Nb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLDRCQUE0QixFQUFFLGlCQUFpQixFQUFlLE1BQU0sb0NBQW9DLENBQUM7QUFDcEosT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFZdkUsTUFBTSxPQUFPLFdBQVc7SUFDdkIsWUFDVSxrQkFBMEIsRUFDMUIsbUJBQTJCO1FBRDNCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBUTtRQUMxQix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQVE7SUFDakMsQ0FBQztDQUNMO0FBRUQsSUFBVyxRQUlWO0FBSkQsV0FBVyxRQUFRO0lBQ2xCLDZDQUFXLENBQUE7SUFDWCxxQ0FBTyxDQUFBO0lBQ1AsdUNBQVEsQ0FBQTtBQUNULENBQUMsRUFKVSxRQUFRLEtBQVIsUUFBUSxRQUlsQjtBQUVEOztLQUVLO0FBQ0wsTUFBTSxPQUFPLGVBQWU7SUFnQjNCLFlBQ0MsS0FBdUIsRUFDdkIsTUFBYyxFQUNkLFdBQXdCLEVBQ3hCLFlBQTBCLEVBQzFCLE9BQStCLEVBQy9CLGtCQUF3RCxFQUN4RCxvQkFBbUQsaUJBQWlCLENBQUMsT0FBTyxFQUNuRSxnQkFBb0MsU0FBUztRQUE3QyxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0M7UUFsQnRDLHNCQUFpQixHQUFHLGVBQWUsQ0FBQyx1QkFBdUIsQ0FBQztRQW9CNUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxDQUFDLE9B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