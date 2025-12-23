/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import * as languages from '../../../common/languages.js';
import { NullState, nullTokenizeEncoded, nullTokenize } from '../../../common/languages/nullTokenize.js';
import { TokenTheme } from '../../../common/languages/supports/tokenization.js';
import { ILanguageService } from '../../../common/languages/language.js';
import * as monarchCommon from './monarchCommon.js';
import { IStandaloneThemeService } from '../standaloneTheme.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { LanguageId, MetadataConsts } from '../../../common/encodedTokenAttributes.js';

const CACHE_STACK_DEPTH = 5;

/**
 * Reuse the same stack elements up to a certain depth.
 */
class MonarchStackElementFactory {

	private static readonly _INSTANCE = new MonarchStackElementFactory(CACHE_STACK_DEPTH);
	public static create(parent: MonarchStackElement | null, state: string): MonarchStackElement {
		return this._INSTANCE.create(parent, state);
	}

	private readonly _maxCacheDepth: number;
	private readonly _entries: { [stackElementId: string]: MonarchStackElement };

	constructor(maxCacheDepth: number) {
		this._maxCacheDepth = maxCacheDepth;
		this._entries = Object.create(null);
	}

	public create(parent: MonarchStackElement | null, state: string): MonarchStackElement {
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

	public readonly parent: MonarchStackElement | null;
	public readonly state: string;
	public readonly depth: number;

	constructor(parent: MonarchStackElement | null, state: string) {
		this.parent = parent;
		this.state = state;
		this.depth = (this.parent ? this.parent.depth : 0) + 1;
	}

	public static getStackElementId(element: MonarchStackElement | null): string {
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

	private static _equals(a: MonarchStackElement | null, b: MonarchStackElement | null): boolean {
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

	public equals(other: MonarchStackElement): boolean {
		return MonarchStackElement._equals(this, other);
	}

	public push(state: string): MonarchStackElement {
		return MonarchStackElementFactory.create(this, state);
	}

	public pop(): MonarchStackElement | null {
		return this.parent;
	}

	public popall(): MonarchStackElement {
		let result: MonarchStackElement = this;
		while (result.parent) {
			result = result.parent;
		}
		return result;
	}

	public switchTo(state: string): MonarchStackElement {
		return MonarchStackElementFactory.create(this.parent, state);
	}
}

class EmbeddedLanguageData {
	public readonly languageId: string;
	public readonly state: languages.IState;

	constructor(languageId: string, state: languages.IState) {
		this.languageId = languageId;
		this.state = state;
	}

	public equals(other: EmbeddedLanguageData): boolean {
		return (
			this.languageId === other.languageId
			&& this.state.equals(other.state)
		);
	}

	public clone(): EmbeddedLanguageData {
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

	private static readonly _INSTANCE = new MonarchLineStateFactory(CACHE_STACK_DEPTH);
	public static create(stack: MonarchStackElement, embeddedLanguageData: EmbeddedLanguageData | null): MonarchLineState {
		return this._INSTANCE.create(stack, embeddedLanguageData);
	}

	private readonly _maxCacheDepth: number;
	private readonly _entries: { [stackElementId: string]: MonarchLineState };

	constructor(maxCacheDepth: number) {
		this._maxCacheDepth = maxCacheDepth;
		this._entries = Object.create(null);
	}

	public create(stack: MonarchStackElement, embeddedLanguageData: EmbeddedLanguageData | null): MonarchLineState {
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

class MonarchLineState implements languages.IState {

	public readonly stack: MonarchStackElement;
	public readonly embeddedLanguageData: EmbeddedLanguageData | null;

	constructor(
		stack: MonarchStackElement,
		embeddedLanguageData: EmbeddedLanguageData | null
	) {
		this.stack = stack;
		this.embeddedLanguageData = embeddedLanguageData;
	}

	public clone(): languages.IState {
		const embeddedlanguageDataClone = this.embeddedLanguageData ? this.embeddedLanguageData.clone() : null;
		// save an object
		if (embeddedlanguageDataClone === this.embeddedLanguageData) {
			return this;
		}
		return MonarchLineStateFactory.create(this.stack, this.embeddedLanguageData);
	}

	public equals(other: languages.IState): boolean {
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

interface IMonarchTokensCollector {
	enterLanguage(languageId: string): void;
	emit(startOffset: number, type: string): void;
	nestedLanguageTokenize(embeddedLanguageLine: string, hasEOL: boolean, embeddedLanguageData: EmbeddedLanguageData, offsetDelta: number): languages.IState;
}

class MonarchClassicTokensCollector implements IMonarchTokensCollector {

	private _tokens: languages.Token[];
	private _languageId: string | null;
	private _lastTokenType: string | null;
	private _lastTokenLanguage: string | null;

	constructor() {
		this._tokens = [];
		this._languageId = null;
		this._lastTokenType = null;
		this._lastTokenLanguage = null;
	}

	public enterLanguage(languageId: string): void {
		this._languageId = languageId;
	}

	public emit(startOffset: number, type: string): void {
		if (this._lastTokenType === type && this._lastTokenLanguage === this._languageId) {
			return;
		}
		this._lastTokenType = type;
		this._lastTokenLanguage = this._languageId;
		this._tokens.push(new languages.Token(startOffset, type, this._languageId!));
	}

	public nestedLanguageTokenize(embeddedLanguageLine: string, hasEOL: boolean, embeddedLanguageData: EmbeddedLanguageData, offsetDelta: number): languages.IState {
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
		} else {
			this._tokens = this._tokens.concat(nestedResult.tokens);
		}
		this._lastTokenType = null;
		this._lastTokenLanguage = null;
		this._languageId = null;
		return nestedResult.endState;
	}

	public finalize(endState: MonarchLineState): languages.TokenizationResult {
		return new languages.TokenizationResult(this._tokens, endState);
	}
}

class MonarchModernTokensCollector implements IMonarchTokensCollector {

	private readonly _languageService: ILanguageService;
	private readonly _theme: TokenTheme;
	private _prependTokens: Uint32Array | null;
	private _tokens: number[];
	private _currentLanguageId: LanguageId;
	private _lastTokenMetadata: number;

	constructor(languageService: ILanguageService, theme: TokenTheme) {
		this._languageService = languageService;
		this._theme = theme;
		this._prependTokens = null;
		this._tokens = [];
		this._currentLanguageId = LanguageId.Null;
		this._lastTokenMetadata = 0;
	}

	public enterLanguage(languageId: string): void {
		this._currentLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
	}

	public emit(startOffset: number, type: string): void {
		const metadata = this._theme.match(this._currentLanguageId, type) | MetadataConsts.BALANCED_BRACKETS_MASK;
		if (this._lastTokenMetadata === metadata) {
			return;
		}
		this._lastTokenMetadata = metadata;
		this._tokens.push(startOffset);
		this._tokens.push(metadata);
	}

	private static _merge(a: Uint32Array | null, b: number[], c: Uint32Array | null): Uint32Array {
		const aLen = (a !== null ? a.length : 0);
		const bLen = b.length;
		const cLen = (c !== null ? c.length : 0);

		if (aLen === 0 && bLen === 0 && cLen === 0) {
			return new Uint32Array(0);
		}
		if (aLen === 0 && bLen === 0) {
			return c!;
		}
		if (bLen === 0 && cLen === 0) {
			return a!;
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

	public nestedLanguageTokenize(embeddedLanguageLine: string, hasEOL: boolean, embeddedLanguageData: EmbeddedLanguageData, offsetDelta: number): languages.IState {
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

	public finalize(endState: MonarchLineState): languages.EncodedTokenizationResult {
		return new languages.EncodedTokenizationResult(
			MonarchModernTokensCollector._merge(this._prependTokens, this._tokens, null),
			[],
			endState
		);
	}
}

export type ILoadStatus = { loaded: true } | { loaded: false; promise: Promise<void> };

export class MonarchTokenizer extends Disposable implements languages.ITokenizationSupport, IDisposable {

	private readonly _languageService: ILanguageService;
	private readonly _standaloneThemeService: IStandaloneThemeService;
	private readonly _languageId: string;
	private readonly _lexer: monarchCommon.ILexer;
	private readonly _embeddedLanguages: { [languageId: string]: boolean };
	public embeddedLoaded: Promise<void>;
	private _maxTokenizationLineLength: number;

	constructor(languageService: ILanguageService, standaloneThemeService: IStandaloneThemeService, languageId: string, lexer: monarchCommon.ILexer, @IConfigurationService private readonly _configurationService: IConfigurationService) {
		super();
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
		this._maxTokenizationLineLength = this._configurationService.getValue<number>('editor.maxTokenizationLineLength', {
			overrideIdentifier: this._languageId
		});
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.maxTokenizationLineLength')) {
				this._maxTokenizationLineLength = this._configurationService.getValue<number>('editor.maxTokenizationLineLength', {
					overrideIdentifier: this._languageId
				});
			}
		}));
	}

	public getLoadStatus(): ILoadStatus {
		const promises: Thenable<any>[] = [];
		for (const nestedLanguageId in this._embeddedLanguages) {
			const tokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
			if (tokenizationSupport) {
				// The nested language is already loaded
				if (tokenizationSupport instanceof MonarchTokenizer) {
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

	public getInitialState(): languages.IState {
		const rootState = MonarchStackElementFactory.create(null, this._lexer.start!);
		return MonarchLineStateFactory.create(rootState, null);
	}

	public tokenize(line: string, hasEOL: boolean, lineState: languages.IState): languages.TokenizationResult {
		if (line.length >= this._maxTokenizationLineLength) {
			return nullTokenize(this._languageId, lineState);
		}
		const tokensCollector = new MonarchClassicTokensCollector();
		const endLineState = this._tokenize(line, hasEOL, <MonarchLineState>lineState, tokensCollector);
		return tokensCollector.finalize(endLineState);
	}

	public tokenizeEncoded(line: string, hasEOL: boolean, lineState: languages.IState): languages.EncodedTokenizationResult {
		if (line.length >= this._maxTokenizationLineLength) {
			return nullTokenizeEncoded(this._languageService.languageIdCodec.encodeLanguageId(this._languageId), lineState);
		}
		const tokensCollector = new MonarchModernTokensCollector(this._languageService, this._standaloneThemeService.getColorTheme().tokenTheme);
		const endLineState = this._tokenize(line, hasEOL, <MonarchLineState>lineState, tokensCollector);
		return tokensCollector.finalize(endLineState);
	}

	private _tokenize(line: string, hasEOL: boolean, lineState: MonarchLineState, collector: IMonarchTokensCollector): MonarchLineState {
		if (lineState.embeddedLanguageData) {
			return this._nestedTokenize(line, hasEOL, lineState, 0, collector);
		} else {
			return this._myTokenize(line, hasEOL, lineState, 0, collector);
		}
	}

	private _findLeavingNestedLanguageOffset(line: string, state: MonarchLineState): number {
		let rules: monarchCommon.IRule[] | null = this._lexer.tokenizer[state.stack.state];
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

	private _nestedTokenize(line: string, hasEOL: boolean, lineState: MonarchLineState, offsetDelta: number, tokensCollector: IMonarchTokensCollector): MonarchLineState {

		const popOffset = this._findLeavingNestedLanguageOffset(line, lineState);

		if (popOffset === -1) {
			// tokenization will not leave nested language
			const nestedEndState = tokensCollector.nestedLanguageTokenize(line, hasEOL, lineState.embeddedLanguageData!, offsetDelta);
			return MonarchLineStateFactory.create(lineState.stack, new EmbeddedLanguageData(lineState.embeddedLanguageData!.languageId, nestedEndState));
		}

		const nestedLanguageLine = line.substring(0, popOffset);
		if (nestedLanguageLine.length > 0) {
			// tokenize with the nested language
			tokensCollector.nestedLanguageTokenize(nestedLanguageLine, false, lineState.embeddedLanguageData!, offsetDelta);
		}

		const restOfTheLine = line.substring(popOffset);
		return this._myTokenize(restOfTheLine, hasEOL, lineState, offsetDelta + popOffset, tokensCollector);
	}

	private _safeRuleName(rule: monarchCommon.IRule | null): string {
		if (rule) {
			return rule.name;
		}
		return '(unknown)';
	}

	private _myTokenize(lineWithoutLF: string, hasEOL: boolean, lineState: MonarchLineState, offsetDelta: number, tokensCollector: IMonarchTokensCollector): MonarchLineState {
		tokensCollector.enterLanguage(this._languageId);

		const lineWithoutLFLength = lineWithoutLF.length;
		const line = (hasEOL && this._lexer.includeLF ? lineWithoutLF + '\n' : lineWithoutLF);
		const lineLength = line.length;

		let embeddedLanguageData = lineState.embeddedLanguageData;
		let stack = lineState.stack;
		let pos = 0;

		// regular expression group matching
		// these never need cloning or equality since they are only used within a line match
		interface GroupMatching {
			matches: string[];
			rule: monarchCommon.IRule | null;
			groups: { action: monarchCommon.FuzzyAction; matched: string }[];
		}
		let groupMatching: GroupMatching | null = null;

		// See https://github.com/microsoft/monaco-editor/issues/1235
		// Evaluate rules at least once for an empty line
		let forceEvaluation = true;

		while (forceEvaluation || pos < lineLength) {

			const pos0 = pos;
			const stackLen0 = stack.depth;
			const groupLen0 = groupMatching ? groupMatching.groups.length : 0;
			const state = stack.state;

			let matches: string[] | null = null;
			let matched: string | null = null;
			let action: monarchCommon.FuzzyAction | monarchCommon.FuzzyAction[] | null = null;
			let rule: monarchCommon.IRule | null = null;

			let enteringEmbeddedLanguage: string | null = null;

			// check if we need to process group matches first
			if (groupMatching) {
				matches = groupMatching.matches;
				const groupEntry = groupMatching.groups.shift()!;
				matched = groupEntry.matched;
				action = groupEntry.action;
				rule = groupMatching.rule;

				// cleanup if necessary
				if (groupMatching.groups.length === 0) {
					groupMatching = null;
				}
			} else {
				// otherwise we match on the token stream

				if (!forceEvaluation && pos >= lineLength) {
					// nothing to do
					break;
				}

				forceEvaluation = false;

				// get the rules for this state
				let rules: monarchCommon.IRule[] | null = this._lexer.tokenizer[state];
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

			let result: monarchCommon.FuzzyAction | monarchCommon.FuzzyAction[] | null = null;
			// set the result: either a string or an array of actions
			if (typeof action === 'string' || Array.isArray(action)) {
				result = action;
			} else if (action.group) {
				result = action.group;
			} else if (action.token !== null && action.token !== undefined) {

				// do $n replacements?
				if (action.tokenSubst) {
					result = monarchCommon.substituteMatches(this._lexer, action.token, matched, matches, state);
				} else {
					result = action.token;
				}

				// enter embedded language?
				if (action.nextEmbedded) {
					if (action.nextEmbedded === '@pop') {
						if (!embeddedLanguageData) {
							throw monarchCommon.createError(this._lexer, 'cannot pop embedded language if not inside one');
						}
						embeddedLanguageData = null;
					} else if (embeddedLanguageData) {
						throw monarchCommon.createError(this._lexer, 'cannot enter embedded language from within an embedded language');
					} else {
						enteringEmbeddedLanguage = monarchCommon.substituteMatches(this._lexer, action.nextEmbedded, matched, matches, state);
					}
				}

				// state transformations
				if (action.goBack) { // back up the stream..
					pos = Math.max(0, pos - action.goBack);
				}

				if (action.switchTo && typeof action.switchTo === 'string') {
					let nextState = monarchCommon.substituteMatches(this._lexer, action.switchTo, matched, matches, state);  // switch state without a push...
					if (nextState[0] === '@') {
						nextState = nextState.substr(1); // peel off starting '@'
					}
					if (!monarchCommon.findRules(this._lexer, nextState)) {
						throw monarchCommon.createError(this._lexer, 'trying to switch to a state \'' + nextState + '\' that is undefined in rule: ' + this._safeRuleName(rule));
					} else {
						stack = stack.switchTo(nextState);
					}
				} else if (action.transform && typeof action.transform === 'function') {
					throw monarchCommon.createError(this._lexer, 'action.transform not supported');
				} else if (action.next) {
					if (action.next === '@push') {
						if (stack.depth >= this._lexer.maxStack) {
							throw monarchCommon.createError(this._lexer, 'maximum tokenizer stack size reached: [' +
								stack.state + ',' + stack.parent!.state + ',...]');
						} else {
							stack = stack.push(state);
						}
					} else if (action.next === '@pop') {
						if (stack.depth <= 1) {
							throw monarchCommon.createError(this._lexer, 'trying to pop an empty stack in rule: ' + this._safeRuleName(rule));
						} else {
							stack = stack.pop()!;
						}
					} else if (action.next === '@popall') {
						stack = stack.popall();
					} else {
						let nextState = monarchCommon.substituteMatches(this._lexer, action.next, matched, matches, state);
						if (nextState[0] === '@') {
							nextState = nextState.substr(1); // peel off starting '@'
						}

						if (!monarchCommon.findRules(this._lexer, nextState)) {
							throw monarchCommon.createError(this._lexer, 'trying to set a next state \'' + nextState + '\' that is undefined in rule: ' + this._safeRuleName(rule));
						} else {
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

			const computeNewStateForEmbeddedLanguage = (enteringEmbeddedLanguage: string) => {
				// support language names, mime types, and language ids
				const languageId = (
					this._languageService.getLanguageIdByLanguageName(enteringEmbeddedLanguage)
					|| this._languageService.getLanguageIdByMimeType(enteringEmbeddedLanguage)
					|| enteringEmbeddedLanguage
				);

				const embeddedLanguageData = this._getNestedEmbeddedLanguageData(languageId);

				if (pos < lineLength) {
					// there is content from the embedded language on this line
					const restOfLine = lineWithoutLF.substr(pos);
					return this._nestedTokenize(restOfLine, hasEOL, MonarchLineStateFactory.create(stack, embeddedLanguageData), offsetDelta + pos, tokensCollector);
				} else {
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
			} else {
				// regular result

				// check for '@rematch'
				if (result === '@rematch') {
					pos -= matched.length;
					matched = '';  // better set the next state too..
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
					} else {
						throw monarchCommon.createError(this._lexer, 'no progress in tokenizer in rule: ' + this._safeRuleName(rule));
					}
				}

				// return the result (and check for brace matching)
				// todo: for efficiency we could pre-sanitize tokenPostfix and substitutions
				let tokenType: string | null = null;
				if (monarchCommon.isString(result) && result.indexOf('@brackets') === 0) {
					const rest = result.substr('@brackets'.length);
					const bracket = findBracket(this._lexer, matched);
					if (!bracket) {
						throw monarchCommon.createError(this._lexer, '@brackets token returned but no bracket defined as: ' + matched);
					}
					tokenType = monarchCommon.sanitize(bracket.token + rest);
				} else {
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

	private _getNestedEmbeddedLanguageData(languageId: string): EmbeddedLanguageData {
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
}

/**
 * Searches for a bracket in the 'brackets' attribute that matches the input.
 */
function findBracket(lexer: monarchCommon.ILexer, matched: string) {
	if (!matched) {
		return null;
	}
	matched = monarchCommon.fixCase(lexer, matched);

	const brackets = lexer.brackets;
	for (const bracket of brackets) {
		if (bracket.open === matched) {
			return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Open };
		}
		else if (bracket.close === matched) {
			return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Close };
		}
	}
	return null;
}
