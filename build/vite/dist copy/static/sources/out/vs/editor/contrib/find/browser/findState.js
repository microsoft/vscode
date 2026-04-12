/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../common/core/range.js';
import { MATCHES_LIMIT } from './findModel.js';
export var FindOptionOverride;
(function (FindOptionOverride) {
    FindOptionOverride[FindOptionOverride["NotSet"] = 0] = "NotSet";
    FindOptionOverride[FindOptionOverride["True"] = 1] = "True";
    FindOptionOverride[FindOptionOverride["False"] = 2] = "False";
})(FindOptionOverride || (FindOptionOverride = {}));
function effectiveOptionValue(override, value) {
    if (override === 1 /* FindOptionOverride.True */) {
        return true;
    }
    if (override === 2 /* FindOptionOverride.False */) {
        return false;
    }
    return value;
}
export class FindReplaceState extends Disposable {
    get searchString() { return this._searchString; }
    get replaceString() { return this._replaceString; }
    get isRevealed() { return this._isRevealed; }
    get isReplaceRevealed() { return this._isReplaceRevealed; }
    get isRegex() { return effectiveOptionValue(this._isRegexOverride, this._isRegex); }
    get wholeWord() { return effectiveOptionValue(this._wholeWordOverride, this._wholeWord); }
    get matchCase() { return effectiveOptionValue(this._matchCaseOverride, this._matchCase); }
    get preserveCase() { return effectiveOptionValue(this._preserveCaseOverride, this._preserveCase); }
    get actualIsRegex() { return this._isRegex; }
    get actualWholeWord() { return this._wholeWord; }
    get actualMatchCase() { return this._matchCase; }
    get actualPreserveCase() { return this._preserveCase; }
    get searchScope() { return this._searchScope; }
    get matchesPosition() { return this._matchesPosition; }
    get matchesCount() { return this._matchesCount; }
    get currentMatch() { return this._currentMatch; }
    get isSearching() { return this._isSearching; }
    get filters() { return this._filters; }
    constructor() {
        super();
        this._onFindReplaceStateChange = this._register(new Emitter());
        this.onFindReplaceStateChange = this._onFindReplaceStateChange.event;
        this._searchString = '';
        this._replaceString = '';
        this._isRevealed = false;
        this._isReplaceRevealed = false;
        this._isRegex = false;
        this._isRegexOverride = 0 /* FindOptionOverride.NotSet */;
        this._wholeWord = false;
        this._wholeWordOverride = 0 /* FindOptionOverride.NotSet */;
        this._matchCase = false;
        this._matchCaseOverride = 0 /* FindOptionOverride.NotSet */;
        this._preserveCase = false;
        this._preserveCaseOverride = 0 /* FindOptionOverride.NotSet */;
        this._searchScope = null;
        this._matchesPosition = 0;
        this._matchesCount = 0;
        this._currentMatch = null;
        this._loop = true;
        this._isSearching = false;
        this._filters = null;
    }
    changeMatchInfo(matchesPosition, matchesCount, currentMatch) {
        const changeEvent = {
            moveCursor: false,
            updateHistory: false,
            searchString: false,
            replaceString: false,
            isRevealed: false,
            isReplaceRevealed: false,
            isRegex: false,
            wholeWord: false,
            matchCase: false,
            preserveCase: false,
            searchScope: false,
            matchesPosition: false,
            matchesCount: false,
            currentMatch: false,
            loop: false,
            isSearching: false,
            filters: false
        };
        let somethingChanged = false;
        if (matchesCount === 0) {
            matchesPosition = 0;
        }
        if (matchesPosition > matchesCount) {
            matchesPosition = matchesCount;
        }
        if (this._matchesPosition !== matchesPosition) {
            this._matchesPosition = matchesPosition;
            changeEvent.matchesPosition = true;
            somethingChanged = true;
        }
        if (this._matchesCount !== matchesCount) {
            this._matchesCount = matchesCount;
            changeEvent.matchesCount = true;
            somethingChanged = true;
        }
        if (typeof currentMatch !== 'undefined') {
            if (!Range.equalsRange(this._currentMatch, currentMatch)) {
                this._currentMatch = currentMatch;
                changeEvent.currentMatch = true;
                somethingChanged = true;
            }
        }
        if (somethingChanged) {
            this._onFindReplaceStateChange.fire(changeEvent);
        }
    }
    change(newState, moveCursor, updateHistory = true) {
        const changeEvent = {
            moveCursor: moveCursor,
            updateHistory: updateHistory,
            searchString: false,
            replaceString: false,
            isRevealed: false,
            isReplaceRevealed: false,
            isRegex: false,
            wholeWord: false,
            matchCase: false,
            preserveCase: false,
            searchScope: false,
            matchesPosition: false,
            matchesCount: false,
            currentMatch: false,
            loop: false,
            isSearching: false,
            filters: false
        };
        let somethingChanged = false;
        const oldEffectiveIsRegex = this.isRegex;
        const oldEffectiveWholeWords = this.wholeWord;
        const oldEffectiveMatchCase = this.matchCase;
        const oldEffectivePreserveCase = this.preserveCase;
        if (typeof newState.searchString !== 'undefined') {
            if (this._searchString !== newState.searchString) {
                this._searchString = newState.searchString;
                changeEvent.searchString = true;
                somethingChanged = true;
            }
        }
        if (typeof newState.replaceString !== 'undefined') {
            if (this._replaceString !== newState.replaceString) {
                this._replaceString = newState.replaceString;
                changeEvent.replaceString = true;
                somethingChanged = true;
            }
        }
        if (typeof newState.isRevealed !== 'undefined') {
            if (this._isRevealed !== newState.isRevealed) {
                this._isRevealed = newState.isRevealed;
                changeEvent.isRevealed = true;
                somethingChanged = true;
            }
        }
        if (typeof newState.isReplaceRevealed !== 'undefined') {
            if (this._isReplaceRevealed !== newState.isReplaceRevealed) {
                this._isReplaceRevealed = newState.isReplaceRevealed;
                changeEvent.isReplaceRevealed = true;
                somethingChanged = true;
            }
        }
        if (typeof newState.isRegex !== 'undefined') {
            this._isRegex = newState.isRegex;
        }
        if (typeof newState.wholeWord !== 'undefined') {
            this._wholeWord = newState.wholeWord;
        }
        if (typeof newState.matchCase !== 'undefined') {
            this._matchCase = newState.matchCase;
        }
        if (typeof newState.preserveCase !== 'undefined') {
            this._preserveCase = newState.preserveCase;
        }
        if (typeof newState.searchScope !== 'undefined') {
            if (!newState.searchScope?.every((newSearchScope) => {
                return this._searchScope?.some(existingSearchScope => {
                    return !Range.equalsRange(existingSearchScope, newSearchScope);
                });
            })) {
                this._searchScope = newState.searchScope;
                changeEvent.searchScope = true;
                somethingChanged = true;
            }
        }
        if (typeof newState.loop !== 'undefined') {
            if (this._loop !== newState.loop) {
                this._loop = newState.loop;
                changeEvent.loop = true;
                somethingChanged = true;
            }
        }
        if (typeof newState.isSearching !== 'undefined') {
            if (this._isSearching !== newState.isSearching) {
                this._isSearching = newState.isSearching;
                changeEvent.isSearching = true;
                somethingChanged = true;
            }
        }
        if (typeof newState.filters !== 'undefined') {
            if (this._filters) {
                this._filters.update(newState.filters);
            }
            else {
                this._filters = newState.filters;
            }
            changeEvent.filters = true;
            somethingChanged = true;
        }
        // Overrides get set when they explicitly come in and get reset anytime something else changes
        this._isRegexOverride = (typeof newState.isRegexOverride !== 'undefined' ? newState.isRegexOverride : 0 /* FindOptionOverride.NotSet */);
        this._wholeWordOverride = (typeof newState.wholeWordOverride !== 'undefined' ? newState.wholeWordOverride : 0 /* FindOptionOverride.NotSet */);
        this._matchCaseOverride = (typeof newState.matchCaseOverride !== 'undefined' ? newState.matchCaseOverride : 0 /* FindOptionOverride.NotSet */);
        this._preserveCaseOverride = (typeof newState.preserveCaseOverride !== 'undefined' ? newState.preserveCaseOverride : 0 /* FindOptionOverride.NotSet */);
        if (oldEffectiveIsRegex !== this.isRegex) {
            somethingChanged = true;
            changeEvent.isRegex = true;
        }
        if (oldEffectiveWholeWords !== this.wholeWord) {
            somethingChanged = true;
            changeEvent.wholeWord = true;
        }
        if (oldEffectiveMatchCase !== this.matchCase) {
            somethingChanged = true;
            changeEvent.matchCase = true;
        }
        if (oldEffectivePreserveCase !== this.preserveCase) {
            somethingChanged = true;
            changeEvent.preserveCase = true;
        }
        if (somethingChanged) {
            this._onFindReplaceStateChange.fire(changeEvent);
        }
    }
    canNavigateBack() {
        return this.canNavigateInLoop() || (this.matchesPosition !== 1);
    }
    canNavigateForward() {
        return this.canNavigateInLoop() || (this.matchesPosition < this.matchesCount);
    }
    canNavigateInLoop() {
        return this._loop || (this.matchesCount >= MATCHES_LIMIT);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZFN0YXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRTdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUF1Qi9DLE1BQU0sQ0FBTixJQUFrQixrQkFJakI7QUFKRCxXQUFrQixrQkFBa0I7SUFDbkMsK0RBQVUsQ0FBQTtJQUNWLDJEQUFRLENBQUE7SUFDUiw2REFBUyxDQUFBO0FBQ1YsQ0FBQyxFQUppQixrQkFBa0IsS0FBbEIsa0JBQWtCLFFBSW5DO0FBcUJELFNBQVMsb0JBQW9CLENBQUMsUUFBNEIsRUFBRSxLQUFjO0lBQ3pFLElBQUksUUFBUSxvQ0FBNEIsRUFBRSxDQUFDO1FBQzFDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNELElBQUksUUFBUSxxQ0FBNkIsRUFBRSxDQUFDO1FBQzNDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELE1BQU0sT0FBTyxnQkFBa0YsU0FBUSxVQUFVO0lBc0JoSCxJQUFXLFlBQVksS0FBYSxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLElBQVcsYUFBYSxLQUFhLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7SUFDbEUsSUFBVyxVQUFVLEtBQWMsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUM3RCxJ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