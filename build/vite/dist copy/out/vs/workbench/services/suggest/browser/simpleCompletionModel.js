/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { quickSelect } from '../../../../base/common/arrays.js';
import { FuzzyScore, fuzzyScore, fuzzyScoreGracefulAggressive, FuzzyScoreOptions } from '../../../../base/common/filters.js';
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
export class SimpleCompletionModel {
    constructor(_items, _lineContext, _rawCompareFn) {
        this._items = _items;
        this._lineContext = _lineContext;
        this._rawCompareFn = _rawCompareFn;
        this._refilterKind = 1 /* Refilter.All */;
        this._fuzzyScoreOptions = {
            ...FuzzyScoreOptions.default,
            firstMatchCanBeWeak: true
        };
        // TODO: Pass in options
        this._options = {};
    }
    get items() {
        this._ensureCachedState();
        return this._filteredItems;
    }
    get stats() {
        this._ensureCachedState();
        return this._stats;
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
    forceRefilterAll() {
        this._refilterKind = 1 /* Refilter.All */;
    }
    _ensureCachedState() {
        if (this._refilterKind !== 0 /* Refilter.Nothing */) {
            this._createCachedState();
        }
    }
    _createCachedState() {
        // this._providerInfo = new Map();
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
            // collect all support, know if their result is incomplete
            // this._providerInfo.set(item.provider, Boolean(item.container.incomplete));
            // 'word' is that remainder of the current line that we
            // filter and score against. In theory each suggestion uses a
            // different word, but in practice not - that's why we cache
            const overwriteBefore = item.completion.replacementRange ? (item.completion.replacementRange[1] - item.completion.replacementRange[0]) : 0;
            const wordLen = overwriteBefore + characterCountDelta;
            if (word.length !== wordLen) {
                word = wordLen === 0 ? '' : leadingLineContent.slice(-wordLen);
                wordLow = word.toLowerCase();
            }
            // remember the word against which this item was
            // scored. If word is undefined, then match against the empty string.
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
                    // } else if (typeof item.completion.filterText === 'string') {
                    // 	// when there is a `filterText` it must match the `word`.
                    // 	// if it matches we check with the label to compute highlights
                    // 	// and if that doesn't yield a result we have no highlights,
                    // 	// despite having the match
                    // 	const match = scoreFn(word, wordLow, wordPos, item.completion.filterText, item.filterTextLow!, 0, this._fuzzyScoreOptions);
                    // 	if (!match) {
                    // 		continue; // NO match
                    // 	}
                    // 	if (compareIgnoreCase(item.completion.filterText, item.textLabel) === 0) {
                    // 		// filterText and label are actually the same -> use good highlights
                    // 		item.score = match;
                    // 	} else {
                    // 		// re-run the scorer on the label in the hope of a result BUT use the rank
                    // 		// of the filterText-match
                    // 		item.score = anyScore(word, wordLow, wordPos, item.textLabel, item.labelLow, 0);
                    // 		item.score[0] = match[0]; // use score from filterText
                    // 	}
                }
                else {
                    // by default match `word` against the `label`
                    const match = scoreFn(word, wordLow, wordPos, item.textLabel, item.labelLow, 0, this._fuzzyScoreOptions);
                    if (!match && word !== '') {
                        continue; // NO match
                    }
                    // Use default sorting when word is empty
                    item.score = match || FuzzyScore.Default;
                }
            }
            item.idx = i;
            target.push(item);
            // update stats
            labelLengths.push(item.textLabel.length);
        }
        this._filteredItems = target.sort(this._rawCompareFn?.bind(undefined, leadingLineContent));
        this._refilterKind = 0 /* Refilter.Nothing */;
        this._stats = {
            pLabelLen: labelLengths.length ?
                quickSelect(labelLengths.length - .85, labelLengths, (a, b) => a - b)
                : 0
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlQ29tcGxldGlvbk1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3N1Z2dlc3QvYnJvd3Nlci9zaW1wbGVDb21wbGV0aW9uTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLDRCQUE0QixFQUFFLGlCQUFpQixFQUFlLE1BQU0sb0NBQW9DLENBQUM7QUFNMUksTUFBTSxPQUFPLFdBQVc7SUFDdkIsWUFDVSxrQkFBMEIsRUFDMUIsbUJBQTJCO1FBRDNCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBUTtRQUMxQix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQVE7SUFDakMsQ0FBQztDQUNMO0FBRUQsSUFBVyxRQUlWO0FBSkQsV0FBVyxRQUFRO0lBQ2xCLDZDQUFXLENBQUE7SUFDWCxxQ0FBTyxDQUFBO0lBQ1AsdUNBQVEsQ0FBQTtBQUNULENBQUMsRUFKVSxRQUFRLEtBQVIsUUFBUSxRQUlsQjtBQUVELE1BQU0sT0FBTyxxQkFBcUI7SUFjakMsWUFDa0IsTUFBVyxFQUNwQixZQUF5QixFQUNoQixhQUFrRTtRQUZsRSxXQUFNLEdBQU4sTUFBTSxDQUFLO1FBQ3BCLGlCQUFZLEdBQVosWUFBWSxDQUFhO1FBQ2hCLGtCQUFhLEdBQWIsYUFBYSxDQUFxRDtRQWQ1RSxrQkFBYSx3QkFBMEI7UUFDdkMsdUJBQWtCLEdBQWtDO1lBQzNELEdBQUcsaUJBQWlCLENBQUMsT0FBTztZQUM1QixtQkFBbUIsRUFBRSxJQUFJO1NBQ3pCLENBQUM7UUFFRix3QkFBd0I7UUFDaEIsYUFBUSxHQUVaLEVBQUUsQ0FBQztJQU9QLENBQUM7SUFFRCxJQUFJLEtBQUs7UUFDUixJQUFJLENB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