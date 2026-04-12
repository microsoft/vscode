/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MonarchTokenizer_1;
/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as languages from '../../../common/languages.js';
import { NullState, nullTokenizeEncoded, nullTokenize } from '../../../common/languages/nullTokenize.js';
import * as monarchCommon from './monarchCommon.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
const CACHE_STACK_DEPTH = 5;
/**
 * Reuse the same stack elements up to a certain depth.
 */
class MonarchStackElementFactory {
    static { this._INSTANCE = new MonarchStackElementFactory(CACHE_STACK_DEPTH); }
    static create(parent, state) {
        return this._INSTANCE.create(parent, state);
    }
    constructor(maxCacheDepth) {
        this._maxCacheDepth = maxCacheDepth;
        this._entries = Object.create(null);
    }
    create(parent, state) {
        if (parent !== null && parent.depth >= this._maxCacheDepth) {
            // no caching above a certain depth
            return new MonarchStackElement(parent, state);
        }
        let stackElementId = MonarchStackElement.getStackElementId(parent);
        if (stackElementId.length > 0) {
            stackElementId += '|';
        }
        stackElementId += state;
        let result = this._entries[stackElementId];
        if (result) {
            return result;
        }
        result = new MonarchStackElement(parent, state);
        this._entries[stackElementId] = result;
        return result;
    }
}
class MonarchStackElement {
    constructor(parent, state) {
        this.parent = parent;
        this.state = state;
        this.depth = (this.parent ? this.parent.depth : 0) + 1;
    }
    static getStackElementId(element) {
        let result = '';
        while (element !== null) {
            if (result.length > 0) {
                result += '|';
            }
            result += element.state;
            element = element.parent;
        }
        return result;
    }
    static _equals(a, b) {
        while (a !== null && b !== null) {
            if (a === b) {
                return true;
            }
            if (a.state !== b.state) {
                return false;
            }
            a = a.parent;
            b = b.parent;
        }
        if (a === null && b === null) {
            return true;
        }
        return false;
    }
    equals(other) {
        return MonarchStackElement._equals(this, other);
    }
    push(state) {
        return MonarchStackElementFactory.create(this, state);
    }
    pop() {
        return this.parent;
    }
    popall() {
        let result = this;
        while (result.parent) {
            result = result.parent;
        }
        return result;
    }
    switchTo(state) {
        return MonarchStackElementFactory.create(this.parent, state);
    }
}
class EmbeddedLanguageData {
    constructor(languageId, state) {
        this.languageId = languageId;
        this.state = state;
    }
    equals(other) {
        return (this.languageId === other.languageId
            && this.state.equals(other.state));
    }
    clone() {
        const stateClone = this.state.clone();
        // save an object
        if (stateClone === this.state) {
            return this;
        }
        return new EmbeddedLanguageData(this.languageId, this.state);
    }
}
/**
 * Reuse the same line states up to a certain depth.
 */
class MonarchLineStateFactory {
    static { this._INSTANCE = new MonarchLineStateFactory(CACHE_STACK_DEPTH); }
    static create(stack, embeddedLanguageData) {
        return this._INSTANCE.create(stack, embeddedLanguageData);
    }
    constructor(maxCacheDepth) {
        this._maxCacheDepth = maxCacheDepth;
        this._entries = Object.create(null);
    }
    create(stack, embeddedLanguageData) {
        if (embeddedLanguageData !== null) {
            // no caching when embedding
            return new MonarchLineState(stack, embeddedLanguageData);
        }
        if (stack !== null && stack.depth >= this._maxCacheDepth) {
            // no caching above a certain depth
            return new MonarchLineState(stack, embeddedLanguageData);
        }
        const stackElementId = MonarchStackElement.getStackElementId(stack);
        let result = this._entries[stackElementId];
        if (result) {
            return result;
        }
        result = new MonarchLineState(stack, null);
        this._entries[stackElementId] = result;
        return result;
    }
}
class MonarchLineState {
    constructor(stack, embeddedLanguageData) {
        this.stack = stack;
        this.embeddedLanguageData = embeddedLanguageData;
    }
    clone() {
        const embeddedlanguageDataClone = this.embeddedLanguageData ? this.embeddedLanguageData.clone() : null;
        // save an object
        if (embeddedlanguageDataClone === this.embeddedLanguageData) {
            return this;
        }
        return MonarchLineStateFactory.create(this.stack, this.embeddedLanguageData);
    }
    equals(other) {
        if (!(other instanceof MonarchLineState)) {
            return false;
        }
        if (!this.stack.equals(other.stack)) {
            return false;
        }
        if (this.embeddedLanguageData === null && other.embeddedLanguageData === null) {
            return true;
        }
        if (this.embeddedLanguageData === null || other.embeddedLanguageData === null) {
            return false;
        }
        return this.embeddedLanguageData.equals(other.embeddedLanguageData);
    }
}
class MonarchClassicTokensCollector {
    constructor() {
        this._tokens = [];
        this._languageId = null;
        this._lastTokenType = null;
        this._lastTokenLanguage = null;
    }
    enterLanguage(languageId) {
        this._languageId = languageId;
    }
    emit(startOffset, type) {
        if (this._lastTokenType === type && this._lastTokenLanguage === this._languageId) {
            return;
        }
        this._lastTokenType = type;
        this._lastTokenLanguage = this._languageId;
        this._tokens.push(new languages.Token(startOffset, type, this._languageId));
    }
    nestedLanguageTokenize(embeddedLanguageLine, hasEOL, embeddedLanguageData, offsetDelta) {
        const nestedLanguageId = embeddedLanguageData.languageId;
        const embeddedModeState = embeddedLanguageData.state;
        const nestedLanguageTokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
        if (!nestedLanguageTokenizationSupport) {
            this.enterLanguage(nestedLanguageId);
            this.emit(offsetDelta, '');
            return embeddedModeState;
        }
        const nestedResult = nestedLanguageTokenizationSupport.tokenize(embeddedLanguageLine, hasEOL, embeddedModeState);
        if (offsetDelta !== 0) {
            for (const token of nestedResult.tokens) {
                this._tokens.push(new languages.Token(token.offset + offsetDelta, token.type, token.language));
            }
        }
        else {
            this._tokens = this._tokens.concat(nestedResult.tokens);
        }
        this._lastTokenType = null;
        this._lastTokenLanguage = null;
        this._languageId = null;
        return nestedResult.endState;
    }
    finalize(endState) {
        return new languages.TokenizationResult(this._tokens, endState);
    }
}
class MonarchModernTokensCollector {
    constructor(languageService, theme) {
        this._languageService = languageService;
        this._theme = theme;
        this._prependTokens = null;
        this._tokens = [];
        this._currentLanguageId = 0 /* LanguageId.Null */;
        this._lastTokenMetadata = 0;
    }
    enterLanguage(languageId) {
        this._currentLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
    }
    emit(startOffset, type) {
        const metadata = this._theme.match(this._currentLanguageId, type) | 1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */;
        if (this._lastTokenMetadata === metadata) {
            return;
        }
        this._lastTokenMetadata = metadata;
        this._tokens.push(startOffset);
        this._tokens.push(metadata);
    }
    static _merge(a, b, c) {
        const aLen = (a !== null ? a.length : 0);
        const bLen = b.length;
        const cLen = (c !== null ? c.length : 0);
        if (aLen === 0 && bLen === 0 && cLen === 0) {
            return new Uint32Array(0);
        }
        if (aLen === 0 && bLen === 0) {
            return c;
        }
        if (bLen === 0 && cLen === 0) {
            return a;
        }
        const result = new Uint32Array(aLen + bLen + cLen);
        if (a !== null) {
            result.set(a);
        }
        for (let i = 0; i < bLen; i++) {
            result[aLen + i] = b[i];
        }
        if (c !== null) {
            result.set(c, aLen + bLen);
        }
        return result;
    }
    nestedLanguageTokenize(embeddedLanguageLine, hasEOL, embeddedLanguageData, offsetDelta) {
        const nestedLanguageId = embeddedLanguageData.languageId;
        const embeddedModeState = embeddedLanguageData.state;
        const nestedLanguageTokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
        if (!nestedLanguageTokenizationSupport) {
            this.enterLanguage(nestedLanguageId);
            this.emit(offsetDelta, '');
            return embeddedModeState;
        }
        const nestedResult = nestedLanguageTokenizationSupport.tokenizeEncoded(embeddedLanguageLine, hasEOL, embeddedModeState);
        if (offsetDelta !== 0) {
            for (let i = 0, len = nestedResult.tokens.length; i < len; i += 2) {
                nestedResult.tokens[i] += offsetDelta;
            }
        }
        this._prependTokens = MonarchModernTokensCollector._merge(this._prependTokens, this._tokens, nestedResult.tokens);
        this._tokens = [];
        this._currentLanguageId = 0;
        this._lastTokenMetadata = 0;
        return nestedResult.endState;
    }
    finalize(endState) {
        return new languages.EncodedTokenizationResult(MonarchModernTokensCollector._merge(this._prependTokens, this._tokens, null), [], endState);
    }
}
let MonarchTokenizer = MonarchTokenizer_1 = class MonarchTokenizer extends Disposable {
    constructor(languageService, standaloneThemeService, languageId, lexer, _configurationService) {
        super();
        this._configurationService = _configurationService;
        this._languageService = languageService;
        this._standaloneThemeService = standaloneThemeService;
        this._languageId = languageId;
        this._lexer = lexer;
        this._embeddedLanguages = Object.create(null);
        this.embeddedLoaded = Promise.resolve(undefined);
        // Set up listening for embedded modes
        let emitting = false;
        this._register(languages.TokenizationRegistry.onDidChange((e) => {
            if (emitting) {
                return;
            }
            let isOneOfMyEmbeddedModes = false;
            for (let i = 0, len = e.changedLanguages.length; i < len; i++) {
                const language = e.changedLanguages[i];
                if (this._embeddedLanguages[language]) {
                    isOneOfMyEmbeddedModes = true;
                    break;
                }
            }
            if (isOneOfMyEmbeddedModes) {
                emitting = true;
                languages.TokenizationRegistry.handleChange([this._languageId]);
                emitting = false;
            }
        }));
        this._maxTokenizationLineLength = this._configurationService.getValue('editor.maxTokenizationLineLength', {
            overrideIdentifier: this._languageId
        });
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor.maxTokenizationLineLength')) {
                this._maxTokenizationLineLength = this._configurationService.getValue('editor.maxTokenizationLineLength', {
                    overrideIdentifier: this._languageId
                });
            }
        }));
    }
    getLoadStatus() {
        const promises = [];
        for (const nestedLanguageId in this._embeddedLanguages) {
            const tokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
            if (tokenizationSupport) {
                // The nested language is already loaded
                if (tokenizationSupport instanceof MonarchTokenizer_1) {
                    const nestedModeStatus = tokenizationSupport.getLoadStatus();
                    if (nestedModeStatus.loaded === false) {
                        promises.push(nestedModeStatus.promise);
                    }
                }
                continue;
            }
            if (!languages.TokenizationRegistry.isResolved(nestedLanguageId)) {
                // The nested language is in the process of being loaded
                promises.push(languages.TokenizationRegistry.getOrCreate(nestedLanguageId));
            }
        }
        if (promises.length === 0) {
            return {
                loaded: true
            };
        }
        return {
            loaded: false,
            promise: Promise.all(promises).then(_ => undefined)
        };
    }
    getInitialState() {
        const rootState = MonarchStackElementFactory.create(null, this._lexer.start);
        return MonarchLineStateFactory.create(rootState, null);
    }
    tokenize(line, hasEOL, lineState) {
        if (line.length >= this._maxTokenizationLineLength) {
            return nullTokenize(this._languageId, lineState);
        }
        const tokensCollector = new MonarchClassicTokensCollector();
        const endLineState = this._tokenize(line, hasEOL, lineState, tokensCollector);
        return tokensCollector.finalize(endLineState);
    }
    tokenizeEncoded(line, hasEOL, lineState) {
        if (line.length >= this._maxTokenizationLineLength) {
            return nullTokenizeEncoded(this._languageService.languageIdCodec.encodeLanguageId(this._languageId), lineState);
        }
        const tokensCollector = new MonarchModernTokensCollector(this._languageService, this._standaloneThemeService.getColorTheme().tokenTheme);
        const endLineState = this._tokenize(line, hasEOL, lineState, tokensCollector);
        return tokensCollector.finalize(endLineState);
    }
    _tokenize(line, hasEOL, lineState, collector) {
        if (lineState.embeddedLanguageData) {
            return this._nestedTokenize(line, hasEOL, lineState, 0, collector);
        }
        else {
            return this._myTokenize(line, hasEOL, lineState, 0, collector);
        }
    }
    _findLeavingNestedLanguageOffset(line, state) {
        let rules = this._lexer.tokenizer[state.stack.state];
        if (!rules) {
            rules = monarchCommon.findRules(this._lexer, state.stack.state); // do parent matching
            if (!rules) {
                throw monarchCommon.createError(this._lexer, 'tokenizer state is not defined: ' + state.stack.state);
            }
        }
        let popOffset = -1;
        let hasEmbeddedPopRule = false;
        for (const rule of rules) {
            if (!monarchCommon.isIAction(rule.action) || !(rule.action.nextEmbedded === '@pop' || rule.action.hasEmbeddedEndInCases)) {
                continue;
            }
            hasEmbeddedPopRule = true;
            let regex = rule.resolveRegex(state.stack.state);
            const regexSource = regex.source;
            if (regexSource.substr(0, 4) === '^(?:' && regexSource.substr(regexSource.length - 1, 1) === ')') {
                const flags = (regex.ignoreCase ? 'i' : '') + (regex.unicode ? 'u' : '');
                regex = new RegExp(regexSource.substr(4, regexSource.length - 5), flags);
            }
            const result = line.search(regex);
            if (result === -1 || (result !== 0 && rule.matchOnlyAtLineStart)) {
                continue;
            }
            if (popOffset === -1 || result < popOffset) {
                popOffset = result;
            }
        }
        if (!hasEmbeddedPopRule) {
            throw monarchCommon.createError(this._lexer, 'no rule containing nextEmbedded: "@pop" in tokenizer embedded state: ' + state.stack.state);
        }
        return popOffset;
    }
    _nestedTokenize(line, hasEOL, lineState, offsetDelta, tokensCollector) {
        const popOffset = this._findLeavingNestedLanguageOffset(line, lineState);
        if (popOffset === -1) {
            // tokenization will not leave nested language
            const nestedEndState = tokensCollector.nestedLanguageTokenize(line, hasEOL, lineState.embeddedLanguageData, offsetDelta);
            return MonarchLineStateFactory.create(lineState.stack, new EmbeddedLanguageData(lineState.embeddedLanguageData.languageId, nestedEndState));
        }
        const nestedLanguageLine = line.substring(0, popOffset);
        if (nestedLanguageLine.length > 0) {
            // tokenize with the nested language
            tokensCollector.nestedLanguageTokenize(nestedLanguageLine, false, lineState.embeddedLanguageData, offsetDelta);
        }
        const restOfTheLine = line.substring(popOffset);
        return this._myTokenize(restOfTheLine, hasEOL, lineState, offsetDelta + popOffset, tokensCollector);
    }
    _safeRuleName(rule) {
        if (rule) {
            return rule.name;
        }
        return '(unknown)';
    }
    _myTokenize(lineWithoutLF, hasEOL, lineState, offsetDelta, tokensCollector) {
        tokensCollector.enterLanguage(this._languageId);
        const lineWithoutLFLength = lineWithoutLF.length;
        const line = (hasEOL && this._lexer.includeLF ? lineWithoutLF + '\n' : lineWithoutLF);
        const lineLength = line.length;
        let embeddedLanguageData = lineState.embeddedLanguageData;
        let stack = lineState.stack;
        let pos = 0;
        let groupMatching = null;
        // See https://github.com/microsoft/monaco-editor/issues/1235
        // Evaluate rules at least once for an empty line
        let forceEvaluation = true;
        while (forceEvaluation || pos < lineLength) {
            const pos0 = pos;
            const stackLen0 = stack.depth;
            const groupLen0 = groupMatching ? groupMatching.groups.length : 0;
            const state = stack.state;
            let matches = null;
            let matched = null;
            let action = null;
            let rule = null;
            let enteringEmbeddedLanguage = null;
            // check if we need to process group matches first
            if (groupMatching) {
                matches = groupMatching.matches;
                const groupEntry = groupMatching.groups.shift();
                matched = groupEntry.matched;
                action = groupEntry.action;
                rule = groupMatching.rule;
                // cleanup if necessary
                if (groupMatching.groups.length === 0) {
                    groupMatching = null;
                }
            }
            else {
                // otherwise we match on the token stream
                if (!forceEvaluation && pos >= lineLength) {
                    // nothing to do
                    break;
                }
                forceEvaluation = false;
                // get the rules for this state
                let rules = this._lexer.tokenizer[state];
                if (!rules) {
                    rules = monarchCommon.findRules(this._lexer, state); // do parent matching
                    if (!rules) {
                        throw monarchCommon.createError(this._lexer, 'tokenizer state is not defined: ' + state);
                    }
                }
                // try each rule until we match
                const restOfLine = line.substr(pos);
                for (const rule of rules) {
                    if (pos === 0 || !rule.matchOnlyAtLineStart) {
                        matches = restOfLine.match(rule.resolveRegex(state));
                        if (matches) {
                            matched = matches[0];
                            action = rule.action;
                            break;
                        }
                    }
                }
            }
            // We matched 'rule' with 'matches' and 'action'
            if (!matches) {
                matches = [''];
                matched = '';
            }
            if (!action) {
                // bad: we didn't match anything, and there is no action to take
                // we need to advance the stream or we get progress trouble
                if (pos < lineLength) {
                    matches = [line.charAt(pos)];
                    matched = matches[0];
                }
                action = this._lexer.defaultToken;
            }
            if (matched === null) {
                // should never happen, needed for strict null checking
                break;
            }
            // advance stream
            pos += matched.length;
            // maybe call action function (used for 'cases')
            while (monarchCommon.isFuzzyAction(action) && monarchCommon.isIAction(action) && action.test) {
                action = action.test(matched, matches, state, pos === lineLength);
            }
            let result = null;
            // set the result: either a string or an array of actions
            if (typeof action === 'string' || Array.isArray(action)) {
                result = action;
            }
            else if (action.group) {
                result = action.group;
            }
            else if (action.token !== null && action.token !== undefined) {
                // do $n replacements?
                if (action.tokenSubst) {
                    result = monarchCommon.substituteMatches(this._lexer, action.token, matched, matches, state);
                }
                else {
                    result = action.token;
                }
                // enter embedded language?
                if (action.nextEmbedded) {
                    if (action.nextEmbedded === '@pop') {
                        if (!embeddedLanguageData) {
                            throw monarchCommon.createError(this._lexer, 'cannot pop embedded language if not inside one');
                        }
                        embeddedLanguageData = null;
                    }
                    else if (embeddedLanguageData) {
                        throw monarchCommon.createError(this._lexer, 'cannot enter embedded language from within an embedded language');
                    }
                    else {
                        enteringEmbeddedLanguage = monarchCommon.substituteMatches(this._lexer, action.nextEmbedded, matched, matches, state);
                    }
                }
                // state transformations
                if (action.goBack) { // back up the stream..
                    pos = Math.max(0, pos - action.goBack);
                }
                if (action.switchTo && typeof action.switchTo === 'string') {
                    let nextState = monarchCommon.substituteMatches(this._lexer, action.switchTo, matched, matches, state); // switch state without a push...
                    if (nextState[0] === '@') {
                        nextState = nextState.substr(1); // peel off starting '@'
                    }
                    if (!monarchCommon.findRules(this._lexer, nextState)) {
                        throw monarchCommon.createError(this._lexer, 'trying to switch to a state \'' + nextState + '\' that is undefined in rule: ' + this._safeRuleName(rule));
                    }
                    else {
                        stack = stack.switchTo(nextState);
                    }
                }
                else if (action.transform && typeof action.transform === 'function') {
                    throw monarchCommon.createError(this._lexer, 'action.transform not supported');
                }
                else if (action.next) {
                    if (action.next === '@push') {
                        if (stack.depth >= this._lexer.maxStack) {
                            throw monarchCommon.createError(this._lexer, 'maximum tokenizer stack size reached: [' +
                                stack.state + ',' + stack.parent.state + ',...]');
                        }
                        else {
                            stack = stack.push(state);
                        }
                    }
                    else if (action.next === '@pop') {
                        if (stack.depth <= 1) {
                            throw monarchCommon.createError(this._lexer, 'trying to pop an empty stack in rule: ' + this._safeRuleName(rule));
                        }
                        else {
                            stack = stack.pop();
                        }
                    }
                    else if (action.next === '@popall') {
                        stack = stack.popall();
                    }
                    else {
                        let nextState = monarchCommon.substituteMatches(this._lexer, action.next, matched, matches, state);
                        if (nextState[0] === '@') {
                            nextState = nextState.substr(1); // peel off starting '@'
                        }
                        if (!monarchCommon.findRules(this._lexer, nextState)) {
                            throw monarchCommon.createError(this._lexer, 'trying to set a next state \'' + nextState + '\' that is undefined in rule: ' + this._safeRuleName(rule));
                        }
                        else {
                            stack = stack.push(nextState);
                        }
                    }
                }
                if (action.log && typeof (action.log) === 'string') {
                    monarchCommon.log(this._lexer, this._lexer.languageId + ': ' + monarchCommon.substituteMatches(this._lexer, action.log, matched, matches, state));
                }
            }
            // check result
            if (result === null) {
                throw monarchCommon.createError(this._lexer, 'lexer rule has no well-defined action in rule: ' + this._safeRuleName(rule));
            }
            const computeNewStateForEmbeddedLanguage = (enteringEmbeddedLanguage) => {
                // support language names, mime types, and language ids
                const languageId = (this._languageService.getLanguageIdByLanguageName(enteringEmbeddedLanguage)
                    || this._languageService.getLanguageIdByMimeType(enteringEmbeddedLanguage)
                    || enteringEmbeddedLanguage);
                const embeddedLanguageData = this._getNestedEmbeddedLanguageData(languageId);
                if (pos < lineLength) {
                    // there is content from the embedded language on this line
                    const restOfLine = lineWithoutLF.substr(pos);
                    return this._nestedTokenize(restOfLine, hasEOL, MonarchLineStateFactory.create(stack, embeddedLanguageData), offsetDelta + pos, tokensCollector);
                }
                else {
                    return MonarchLineStateFactory.create(stack, embeddedLanguageData);
                }
            };
            // is the result a group match?
            if (Array.isArray(result)) {
                if (groupMatching && groupMatching.groups.length > 0) {
                    throw monarchCommon.createError(this._lexer, 'groups cannot be nested: ' + this._safeRuleName(rule));
                }
                if (matches.length !== result.length + 1) {
                    throw monarchCommon.createError(this._lexer, 'matched number of groups does not match the number of actions in rule: ' + this._safeRuleName(rule));
                }
                let totalLen = 0;
                for (let i = 1; i < matches.length; i++) {
                    totalLen += matches[i].length;
                }
                if (totalLen !== matched.length) {
                    throw monarchCommon.createError(this._lexer, 'with groups, all characters should be matched in consecutive groups in rule: ' + this._safeRuleName(rule));
                }
                groupMatching = {
                    rule: rule,
                    matches: matches,
                    groups: []
                };
                for (let i = 0; i < result.length; i++) {
                    groupMatching.groups[i] = {
                        action: result[i],
                        matched: matches[i + 1]
                    };
                }
                pos -= matched.length;
                // call recursively to initiate first result match
                continue;
            }
            else {
                // regular result
                // check for '@rematch'
                if (result === '@rematch') {
                    pos -= matched.length;
                    matched = ''; // better set the next state too..
                    matches = null;
                    result = '';
                    // Even though `@rematch` was specified, if `nextEmbedded` also specified,
                    // a state transition should occur.
                    if (enteringEmbeddedLanguage !== null) {
                        return computeNewStateForEmbeddedLanguage(enteringEmbeddedLanguage);
                    }
                }
                // check progress
                if (matched.length === 0) {
                    if (lineLength === 0 || stackLen0 !== stack.depth || state !== stack.state || (!groupMatching ? 0 : groupMatching.groups.length) !== groupLen0) {
                        continue;
                    }
                    else {
                        throw monarchCommon.createError(this._lexer, 'no progress in tokenizer in rule: ' + this._safeRuleName(rule));
                    }
                }
                // return the result (and check for brace matching)
                // todo: for efficiency we could pre-sanitize tokenPostfix and substitutions
                let tokenType = null;
                if (monarchCommon.isString(result) && result.indexOf('@brackets') === 0) {
                    const rest = result.substr('@brackets'.length);
                    const bracket = findBracket(this._lexer, matched);
                    if (!bracket) {
                        throw monarchCommon.createError(this._lexer, '@brackets token returned but no bracket defined as: ' + matched);
                    }
                    tokenType = monarchCommon.sanitize(bracket.token + rest);
                }
                else {
                    const token = (result === '' ? '' : result + this._lexer.tokenPostfix);
                    tokenType = monarchCommon.sanitize(token);
                }
                if (pos0 < lineWithoutLFLength) {
                    tokensCollector.emit(pos0 + offsetDelta, tokenType);
                }
            }
            if (enteringEmbeddedLanguage !== null) {
                return computeNewStateForEmbeddedLanguage(enteringEmbeddedLanguage);
            }
        }
        return MonarchLineStateFactory.create(stack, embeddedLanguageData);
    }
    _getNestedEmbeddedLanguageData(languageId) {
        if (!this._languageService.isRegisteredLanguageId(languageId)) {
            return new EmbeddedLanguageData(languageId, NullState);
        }
        if (languageId !== this._languageId) {
            // Fire language loading event
            this._languageService.requestBasicLanguageFeatures(languageId);
            languages.TokenizationRegistry.getOrCreate(languageId);
            this._embeddedLanguages[languageId] = true;
        }
        const tokenizationSupport = languages.TokenizationRegistry.get(languageId);
        if (tokenizationSupport) {
            return new EmbeddedLanguageData(languageId, tokenizationSupport.getInitialState());
        }
        return new EmbeddedLanguageData(languageId, NullState);
    }
};
MonarchTokenizer = MonarchTokenizer_1 = __decorate([
    __param(4, IConfigurationService)
], MonarchTokenizer);
export { MonarchTokenizer };
/**
 * Searches for a bracket in the 'brackets' attribute that matches the input.
 */
function findBracket(lexer, matched) {
    if (!matched) {
        return null;
    }
    matched = monarchCommon.fixCase(lexer, matched);
    const brackets = lexer.brackets;
    for (const bracket of brackets) {
        if (bracket.open === matched) {
            return { token: bracket.token, bracketType: 1 /* monarchCommon.MonarchBracket.Open */ };
        }
        else if (bracket.close === matched) {
            return { token: bracket.token, bracketType: -1 /* monarchCommon.MonarchBracket.Close */ };
        }
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uYXJjaExleGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3N0YW5kYWxvbmUvY29tbW9uL21vbmFyY2gvbW9uYXJjaExleGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRzs7O0dBR0c7QUFFSCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxLQUFLLFNBQVMsTUFBTSw4QkFBOEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsU0FBUyxFQUFFLG1CQUFtQixFQUFFLFlBQVksRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBR3pHLE9BQU8sS0FBSyxhQUFhLE1BQU0sb0JBQW9CLENBQUM7QUFFcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHbkcsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLENBQUM7QUFFNUI7O0dBRUc7QUFDSCxNQUFNLDBCQUEwQjthQUVQLGNBQVMsR0FBRyxJQUFJLDBCQUEwQixDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDL0UsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFrQyxFQUFFLEtBQWE7UUFDckUsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUtELFlBQVksYUFBcUI7UUFDaEMsSUFBSSxDQUFDLGNBQWMsR0FBRyxhQUFhLENBQUM7UUFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFTSxNQUFNLENBQUMsTUFBa0MsRUFBRSxLQUFhO1FBQzlELElBQUksTUFBTSxLQUFLLElBQUksSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxjQUFjLEVB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