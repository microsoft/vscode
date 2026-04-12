/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CallbackIterable, compareBy } from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../core/range.js';
import { ignoreBracketsInToken } from '../../languages/supports.js';
import { BracketsUtils } from '../../languages/supports/richEditBrackets.js';
import { BracketPairsTree } from './bracketPairsTree/bracketPairsTree.js';
export class BracketPairsTextModelPart extends Disposable {
    get canBuildAST() {
        const maxSupportedDocumentLength = /* max lines */ 50_000 * /* average column count */ 100;
        return this.textModel.getValueLength() <= maxSupportedDocumentLength;
    }
    constructor(textModel, languageConfigurationService) {
        super();
        this.textModel = textModel;
        this.languageConfigurationService = languageConfigurationService;
        this.bracketPairsTree = this._register(new MutableDisposable());
        this.onDidChangeEmitter = this._register(new Emitter());
        this.onDidChange = this.onDidChangeEmitter.event;
        this.bracketsRequested = false;
    }
    //#region TextModel events
    handleLanguageConfigurationServiceChange(e) {
        if (!e.languageId || this.bracketPairsTree.value?.object.didLanguageChange(e.languageId)) {
            this.bracketPairsTree.clear();
            this.updateBracketPairsTree();
        }
    }
    handleDidChangeOptions(e) {
        this.bracketPairsTree.clear();
        this.updateBracketPairsTree();
    }
    handleDidChangeLanguage(e) {
        this.bracketPairsTree.clear();
        this.updateBracketPairsTree();
    }
    handleDidChangeContent(change) {
        this.bracketPairsTree.value?.object.handleContentChanged(change);
    }
    handleDidChangeBackgroundTokenizationState() {
        this.bracketPairsTree.value?.object.handleDidChangeBackgroundTokenizationState();
    }
    handleDidChangeTokens(e) {
        this.bracketPairsTree.value?.object.handleDidChangeTokens(e);
    }
    //#endregion
    updateBracketPairsTree() {
        if (this.bracketsRequested && this.canBuildAST) {
            if (!this.bracketPairsTree.value) {
                const store = new DisposableStore();
                this.bracketPairsTree.value = createDisposableRef(store.add(new BracketPairsTree(this.textModel, (languageId) => {
                    return this.languageConfigurationService.getLanguageConfiguration(languageId);
                })), store);
                store.add(this.bracketPairsTree.value.object.onDidChange(e => this.onDidChangeEmitter.fire(e)));
                this.onDidChangeEmitter.fire();
            }
        }
        else {
            if (this.bracketPairsTree.value) {
                this.bracketPairsTree.clear();
                // Important: Don't call fire if there was no change!
                this.onDidChangeEmitter.fire();
            }
        }
    }
    /**
     * Returns all bracket pairs that intersect the given range.
     * The result is sorted by the start position.
    */
    getBracketPairsInRange(range) {
        this.bracketsRequested = true;
        this.updateBracketPairsTree();
        return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, false) || CallbackIterable.empty;
    }
    getBracketPairsInRangeWithMinIndentation(range) {
        this.bracketsRequested = true;
        this.updateBracketPairsTree();
        return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, true) || CallbackIterable.empty;
    }
    getBracketsInRange(range, onlyColorizedBrackets = false) {
        this.bracketsRequested = true;
        this.updateBracketPairsTree();
        return this.bracketPairsTree.value?.object.getBracketsInRange(range, onlyColorizedBrackets) || CallbackIterable.empty;
    }
    findMatchingBracketUp(_bracket, _position, maxDuration) {
        const position = this.textModel.validatePosition(_position);
        const languageId = this.textModel.getLanguageIdAtPosition(position.lineNumber, position.column);
        if (this.canBuildAST) {
            const closingBracketInfo = this.languageConfigurationService
                .getLanguageConfiguration(languageId)
                .bracketsNew.getClosingBracketInfo(_bracket);
            if (!closingBracketInfo) {
                return null;
            }
            const bracketPair = this.getBracketPairsInRange(Range.fromPositions(_position, _position)).findLast((b) => closingBracketInfo.closes(b.openingBracketInfo));
            if (bracketPair) {
                return bracketPair.openingBracketRange;
            }
            return null;
        }
        else {
            // Fallback to old bracket matching code:
            const bracket = _bracket.toLowerCase();
            const bracketsSupport = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
            if (!bracketsSupport) {
                return null;
            }
            const data = bracketsSupport.textIsBracket[bracket];
            if (!data) {
                return null;
            }
            return stripBracketSearchCanceled(this._findMatchingBracketUp(data, position, createTimeBasedContinueBracketSearchPredicate(maxDuration)));
        }
    }
    matchBracket(position, maxDuration) {
        if (this.canBuildAST) {
            const bracketPair = this.getBracketPairsInRange(Range.fromPositions(position, position)).filter((item) => item.closingBracketRange !== undefined &&
                (item.openingBracketRange.containsPosition(position) ||
                    item.closingBracketRange.containsPosition(position))).findLastMaxBy(compareBy((item) => item.openingBracketRange.containsPosition(position)
                ? item.openingBracketRange
                : item.closingBracketRange, Range.compareRangesUsingStarts));
            if (bracketPair) {
                return [bracketPair.openingBracketRange, bracketPair.closingBracketRange];
            }
            return null;
        }
        else {
            // Fallback to old bracket matching code:
            const continueSearchPredicate = createTimeBasedContinueBracketSearchPredicate(maxDuration);
            return this._matchBracket(this.textModel.validatePosition(position), continueSearchPredicate);
        }
    }
    _establishBracketSearchOffsets(position, lineTokens, modeBrackets, tokenIndex) {
        const tokenCount = lineTokens.getCount();
        const currentLanguageId = lineTokens.getLanguageId(tokenIndex);
        // limit search to not go before `maxBracketLength`
        let searchStartOffset = Math.max(0, position.column - 1 - modeBrackets.maxBracketLength);
        for (let i = tokenIndex - 1; i >= 0; i--) {
            const tokenEndOffset = lineTokens.getEndOffset(i);
            if (tokenEndOffset <= searchStartOffset) {
                break;
            }
            if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
                searchStartOffset = tokenEndOffset;
                break;
            }
        }
        // limit search to not go after `maxBracketLength`
        let searchEndOffset = Math.min(lineTokens.getLineContent().length, position.column - 1 + modeBrackets.maxBracketLength);
        for (let i = tokenIndex + 1; i < tokenCount; i++) {
            const tokenStartOffset = lineTokens.getStartOffset(i);
            if (tokenStartOffset >= searchEndOffset) {
                break;
            }
            if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
                searchEndOffset = tokenStartOffset;
                break;
            }
        }
        return { searchStartOffset, searchEndOffset };
    }
    _matchBracket(position, continueSearchPredicate) {
        const lineNumber = position.lineNumber;
        const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
        const lineText = this.textModel.getLineContent(lineNumber);
        const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        if (tokenIndex < 0) {
            return null;
        }
        const currentModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(tokenIndex)).brackets;
        // check that the token is not to be ignored
        if (currentModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex))) {
            let { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, currentModeBrackets, tokenIndex);
            // it might be the case that [currentTokenStart -> currentTokenEnd] contains multiple brackets
            // `bestResult` will contain the most right-side result
            let bestResult = null;
            while (true) {
                const foundBracket = BracketsUtils.findNextBracketInRange(currentModeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (!foundBracket) {
                    // there are no more brackets in this text
                    break;
                }
                // check that we didn't hit a bracket too far away from position
                if (foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
                    const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
                    const r = this._matchFoundBracket(foundBracket, currentModeBrackets.textIsBracket[foundBracketText], currentModeBrackets.textIsOpenBracket[foundBracketText], continueSearchPredicate);
                    if (r) {
                        if (r instanceof BracketSearchCanceled) {
                            return null;
                        }
                        bestResult = r;
                    }
                }
                searchStartOffset = foundBracket.endColumn - 1;
            }
            if (bestResult) {
                return bestResult;
            }
        }
        // If position is in between two tokens, try also looking in the previous token
        if (tokenIndex > 0 && lineTokens.getStartOffset(tokenIndex) === position.column - 1) {
            const prevTokenIndex = tokenIndex - 1;
            const prevModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(prevTokenIndex)).brackets;
            // check that previous token is not to be ignored
            if (prevModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(prevTokenIndex))) {
                const { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, prevModeBrackets, prevTokenIndex);
                const foundBracket = BracketsUtils.findPrevBracketInRange(prevModeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                // check that we didn't hit a bracket too far away from position
                if (foundBracket && foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
                    const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
                    const r = this._matchFoundBracket(foundBracket, prevModeBrackets.textIsBracket[foundBracketText], prevModeBrackets.textIsOpenBracket[foundBracketText], continueSearchPredicate);
                    if (r) {
                        if (r instanceof BracketSearchCanceled) {
                            return null;
                        }
                        return r;
                    }
                }
            }
        }
        return null;
    }
    _matchFoundBracket(foundBracket, data, isOpen, continueSearchPredicate) {
        if (!data) {
            return null;
        }
        const matched = (isOpen
            ? this._findMatchingBracketDown(data, foundBracket.getEndPosition(), continueSearchPredicate)
            : this._findMatchingBracketUp(data, foundBracket.getStartPosition(), continueSearchPredicate));
        if (!matched) {
            return null;
        }
        if (matched instanceof BracketSearchCanceled) {
            return matched;
        }
        return [foundBracket, matched];
    }
    _findMatchingBracketUp(bracket, position, continueSearchPredicate) {
        // console.log('_findMatchingBracketUp: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));
        const languageId = bracket.languageId;
        const reversedBracketRegex = bracket.reversedRegex;
        let count = -1;
        let totalCallCount = 0;
        const searchPrevMatchingBracketInRange = (lineNumber, lineText, searchStartOffset, searchEndOffset) => {
            while (true) {
                if (continueSearchPredicate && (++totalCallCount) % 100 === 0 && !continueSearchPredicate()) {
                    return BracketSearchCanceled.INSTANCE;
                }
                const r = BracketsUtils.findPrevBracketInRange(reversedBracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (!r) {
                    break;
                }
                const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
                if (bracket.isOpen(hitText)) {
                    count++;
                }
                else if (bracket.isClose(hitText)) {
                    count--;
                }
                if (count === 0) {
                    return r;
                }
                searchEndOffset = r.startColumn - 1;
            }
            return null;
        };
        for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
            const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
            const tokenCount = lineTokens.getCount();
            const lineText = this.textModel.getLineContent(lineNumber);
            let tokenIndex = tokenCount - 1;
            let searchStartOffset = lineText.length;
            let searchEndOffset = lineText.length;
            if (lineNumber === position.lineNumber) {
                tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
                searchStartOffset = position.column - 1;
                searchEndOffset = position.column - 1;
            }
            let prevSearchInToken = true;
            for (; tokenIndex >= 0; tokenIndex--) {
                const searchInToken = (lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));
                if (searchInToken) {
                    // this token should be searched
                    if (prevSearchInToken) {
                        // the previous token should be searched, simply extend searchStartOffset
                        searchStartOffset = lineTokens.getStartOffset(tokenIndex);
                    }
                    else {
                        // the previous token should not be searched
                        searchStartOffset = lineTokens.getStartOffset(tokenIndex);
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                }
                else {
                    // this token should not be searched
                    if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return r;
                        }
                    }
                }
                prevSearchInToken = searchInToken;
            }
            if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
                const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (r) {
                    return r;
                }
            }
        }
        return null;
    }
    _findMatchingBracketDown(bracket, position, continueSearchPredicate) {
        // console.log('_findMatchingBracketDown: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));
        const languageId = bracket.languageId;
        const bracketRegex = bracket.forwardRegex;
        let count = 1;
        let totalCallCount = 0;
        const searchNextMatchingBracketInRange = (lineNumber, lineText, searchStartOffset, searchEndOffset) => {
            while (true) {
                if (continueSearchPredicate && (++totalCallCount) % 100 === 0 && !continueSearchPredicate()) {
                    return BracketSearchCanceled.INSTANCE;
                }
                const r = BracketsUtils.findNextBracketInRange(bracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (!r) {
                    break;
                }
                const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
                if (bracket.isOpen(hitText)) {
                    count++;
                }
                else if (bracket.isClose(hitText)) {
                    count--;
                }
                if (count === 0) {
                    return r;
                }
                searchStartOffset = r.endColumn - 1;
            }
            return null;
        };
        const lineCount = this.textModel.getLineCount();
        for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
            const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
            const tokenCount = lineTokens.getCount();
            const lineText = this.textModel.getLineContent(lineNumber);
            let tokenIndex = 0;
            let searchStartOffset = 0;
            let searchEndOffset = 0;
            if (lineNumber === position.lineNumber) {
                tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
                searchStartOffset = position.column - 1;
                searchEndOffset = position.column - 1;
            }
            let prevSearchInToken = true;
            for (; tokenIndex < tokenCount; tokenIndex++) {
                const searchInToken = (lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));
                if (searchInToken) {
                    // this token should be searched
                    if (prevSearchInToken) {
                        // the previous token should be searched, simply extend searchEndOffset
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                    else {
                        // the previous token should not be searched
                        searchStartOffset = lineTokens.getStartOffset(tokenIndex);
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                }
                else {
                    // this token should not be searched
                    if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return r;
                        }
                    }
                }
                prevSearchInToken = searchInToken;
            }
            if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
                const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (r) {
                    return r;
                }
            }
        }
        return null;
    }
    findPrevBracket(_position) {
        const position = this.textModel.validatePosition(_position);
        if (this.canBuildAST) {
            this.bracketsRequested = true;
            this.updateBracketPairsTree();
            return this.bracketPairsTree.value?.object.getFirstBracketBefore(position) || null;
        }
        let languageId = null;
        let modeBrackets = null;
        let bracketConfig = null;
        for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
            const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
            const tokenCount = lineTokens.getCount();
            const lineText = this.textModel.getLineContent(lineNumber);
            let tokenIndex = tokenCount - 1;
            let searchStartOffset = lineText.length;
            let searchEndOffset = lineText.length;
            if (lineNumber === position.lineNumber) {
                tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
                searchStartOffset = position.column - 1;
                searchEndOffset = position.column - 1;
                const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
                if (languageId !== tokenLanguageId) {
                    languageId = tokenLanguageId;
                    modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
                    bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
                }
            }
            let prevSearchInToken = true;
            for (; tokenIndex >= 0; tokenIndex--) {
                const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
                if (languageId !== tokenLanguageId) {
                    // language id change!
                    if (modeBrackets && bracketConfig && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return this._toFoundBracket(bracketConfig, r);
                        }
                        prevSearchInToken = false;
                    }
                    languageId = tokenLanguageId;
                    modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
                    bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
                }
                const searchInToken = (!!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));
                if (searchInToken) {
                    // this token should be searched
                    if (prevSearchInToken) {
                        // the previous token should be searched, simply extend searchStartOffset
                        searchStartOffset = lineTokens.getStartOffset(tokenIndex);
                    }
                    else {
                        // the previous token should not be searched
                        searchStartOffset = lineTokens.getStartOffset(tokenIndex);
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                }
                else {
                    // this token should not be searched
                    if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return this._toFoundBracket(bracketConfig, r);
                        }
                    }
                }
                prevSearchInToken = searchInToken;
            }
            if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (r) {
                    return this._toFoundBracket(bracketConfig, r);
                }
            }
        }
        return null;
    }
    findNextBracket(_position) {
        const position = this.textModel.validatePosition(_position);
        if (this.canBuildAST) {
            this.bracketsRequested = true;
            this.updateBracketPairsTree();
            return this.bracketPairsTree.value?.object.getFirstBracketAfter(position) || null;
        }
        const lineCount = this.textModel.getLineCount();
        let languageId = null;
        let modeBrackets = null;
        let bracketConfig = null;
        for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
            const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
            const tokenCount = lineTokens.getCount();
            const lineText = this.textModel.getLineContent(lineNumber);
            let tokenIndex = 0;
            let searchStartOffset = 0;
            let searchEndOffset = 0;
            if (lineNumber === position.lineNumber) {
                tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
                searchStartOffset = position.column - 1;
                searchEndOffset = position.column - 1;
                const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
                if (languageId !== tokenLanguageId) {
                    languageId = tokenLanguageId;
                    modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
                    bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
                }
            }
            let prevSearchInToken = true;
            for (; tokenIndex < tokenCount; tokenIndex++) {
                const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
                if (languageId !== tokenLanguageId) {
                    // language id change!
                    if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return this._toFoundBracket(bracketConfig, r);
                        }
                        prevSearchInToken = false;
                    }
                    languageId = tokenLanguageId;
                    modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
                    bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
                }
                const searchInToken = (!!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));
                if (searchInToken) {
                    // this token should be searched
                    if (prevSearchInToken) {
                        // the previous token should be searched, simply extend searchEndOffset
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                    else {
                        // the previous token should not be searched
                        searchStartOffset = lineTokens.getStartOffset(tokenIndex);
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                }
                else {
                    // this token should not be searched
                    if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return this._toFoundBracket(bracketConfig, r);
                        }
                    }
                }
                prevSearchInToken = searchInToken;
            }
            if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (r) {
                    return this._toFoundBracket(bracketConfig, r);
                }
            }
        }
        return null;
    }
    findEnclosingBrackets(_position, maxDuration) {
        const position = this.textModel.validatePosition(_position);
        if (this.canBuildAST) {
            const range = Range.fromPositions(position);
            const bracketPair = this.getBracketPairsInRange(Range.fromPositions(position, position)).findLast((item) => item.closingBracketRange !== undefined && item.range.strictContainsRange(range));
            if (bracketPair) {
                return [bracketPair.openingBracketRange, bracketPair.closingBracketRange];
            }
            return null;
        }
        const continueSearchPredicate = createTimeBasedContinueBracketSearchPredicate(maxDuration);
        const lineCount = this.textModel.getLineCount();
        const savedCounts = new Map();
        let counts = [];
        const resetCounts = (languageId, modeBrackets) => {
            if (!savedCounts.has(languageId)) {
                const tmp = [];
                for (let i = 0, len = modeBrackets ? modeBrackets.brackets.length : 0; i < len; i++) {
                    tmp[i] = 0;
                }
                savedCounts.set(languageId, tmp);
            }
            counts = savedCounts.get(languageId);
        };
        let totalCallCount = 0;
        const searchInRange = (modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset) => {
            while (true) {
                if (continueSearchPredicate && (++totalCallCount) % 100 === 0 && !continueSearchPredicate()) {
                    return BracketSearchCanceled.INSTANCE;
                }
                const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (!r) {
                    break;
                }
                const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
                const bracket = modeBrackets.textIsBracket[hitText];
                if (bracket) {
                    if (bracket.isOpen(hitText)) {
                        counts[bracket.index]++;
                    }
                    else if (bracket.isClose(hitText)) {
                        counts[bracket.index]--;
                    }
                    if (counts[bracket.index] === -1) {
                        return this._matchFoundBracket(r, bracket, false, continueSearchPredicate);
                    }
                }
                searchStartOffset = r.endColumn - 1;
            }
            return null;
        };
        let languageId = null;
        let modeBrackets = null;
        for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
            const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
            const tokenCount = lineTokens.getCount();
            const lineText = this.textModel.getLineContent(lineNumber);
            let tokenIndex = 0;
            let searchStartOffset = 0;
            let searchEndOffset = 0;
            if (lineNumber === position.lineNumber) {
                tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
                searchStartOffset = position.column - 1;
                searchEndOffset = position.column - 1;
                const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
                if (languageId !== tokenLanguageId) {
                    languageId = tokenLanguageId;
                    modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
                    resetCounts(languageId, modeBrackets);
                }
            }
            let prevSearchInToken = true;
            for (; tokenIndex < tokenCount; tokenIndex++) {
                const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
                if (languageId !== tokenLanguageId) {
                    // language id change!
                    if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return stripBracketSearchCanceled(r);
                        }
                        prevSearchInToken = false;
                    }
                    languageId = tokenLanguageId;
                    modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
                    resetCounts(languageId, modeBrackets);
                }
                const searchInToken = (!!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));
                if (searchInToken) {
                    // this token should be searched
                    if (prevSearchInToken) {
                        // the previous token should be searched, simply extend searchEndOffset
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                    else {
                        // the previous token should not be searched
                        searchStartOffset = lineTokens.getStartOffset(tokenIndex);
                        searchEndOffset = lineTokens.getEndOffset(tokenIndex);
                    }
                }
                else {
                    // this token should not be searched
                    if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                        const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
                        if (r) {
                            return stripBracketSearchCanceled(r);
                        }
                    }
                }
                prevSearchInToken = searchInToken;
            }
            if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
                const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
                if (r) {
                    return stripBracketSearchCanceled(r);
                }
            }
        }
        return null;
    }
    _toFoundBracket(bracketConfig, r) {
        if (!r) {
            return null;
        }
        let text = this.textModel.getValueInRange(r);
        text = text.toLowerCase();
        const bracketInfo = bracketConfig.getBracketInfo(text);
        if (!bracketInfo) {
            return null;
        }
        return {
            range: r,
            bracketInfo
        };
    }
}
function createDisposableRef(object, disposable) {
    return {
        object,
        dispose: () => disposable?.dispose(),
    };
}
function createTimeBasedContinueBracketSearchPredicate(maxDuration) {
    if (typeof maxDuration === 'undefined') {
        return () => true;
    }
    else {
        const startTime = Date.now();
        return () => {
            return (Date.now() - startTime <= maxDuration);
        };
    }
}
class BracketSearchCanceled {
    static { this.INSTANCE = new BracketSearchCanceled(); }
    constructor() {
        this._searchCanceledBrand = undefined;
    }
}
function stripBracketSearchCanceled(result) {
    if (result instanceof BracketSearchCanceled) {
        return null;
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJhY2tldFBhaXJzSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNJbXBsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQTJCLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFL0gsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTVDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXBFLE9BQU8sRUFBRSxhQUFhLEVBQXFDLE1BQU0sOENBQThDLENBQUM7QUFDaEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFNMUUsTUFBTSxPQUFPLHlCQUEwQixTQUFRLFVBQVU7SUFNeEQsSUFBWSxXQUFXO1FBQ3RCLE1BQU0sMEJBQTBCLEdBQUcsZUFBZSxDQUFDLE1BQU0sR0FBRywwQkFBMEIsQ0FBQyxHQUFHLENBQUM7UUFDM0YsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSxJQUFJLDBCQUEwQixDQUFDO0lBQ3RFLENBQUM7SUFJRCxZQUNrQixTQUFvQixFQUNwQiw0QkFBMkQ7UUFFNUUsS0FBSyxFQUFFLENBQUM7UUFIUyxjQUFTLEdBQVQsU0FBUyxDQUFXO1FBQ3BCLGlDQUE0QixHQUE1Qiw0QkFBNEIsQ0FBK0I7UUFkNUQscUJBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixF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