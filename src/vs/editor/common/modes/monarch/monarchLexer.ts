/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import { IDisposable } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import * as monarchCommon from 'vs/editor/common/modes/monarch/monarchCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Token } from 'vs/editor/common/core/token';
import { NULL_STATE, nullTokenize, NULL_MODE_ID } from 'vs/editor/common/modes/nullMode';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';

const CACHE_STACK_DEPTH = 5;

/**
 * Reuse the same stack elements up to a certain depth.
 */
export class MonarchStackElementFactory {

	private static _INSTANCE = new MonarchStackElementFactory(CACHE_STACK_DEPTH);
	public static create(parent: MonarchStackElement, state: string): MonarchStackElement {
		return this._INSTANCE.create(parent, state);
	}

	private readonly _maxCacheDepth: number;
	private readonly _entries: { [stackElementId: string]: MonarchStackElement; };

	constructor(maxCacheDepth: number) {
		this._maxCacheDepth = maxCacheDepth;
		this._entries = Object.create(null);
	}

	public create(parent: MonarchStackElement, state: string): MonarchStackElement {
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

export class MonarchStackElement {

	public readonly parent: MonarchStackElement;
	public readonly state: string;
	public readonly depth: number;

	constructor(parent: MonarchStackElement, state: string) {
		this.parent = parent;
		this.state = state;
		this.depth = (this.parent ? this.parent.depth : 0) + 1;
	}

	public static getStackElementId(element: MonarchStackElement): string {
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

	private static _equals(a: MonarchStackElement, b: MonarchStackElement): boolean {
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

	public pop(): MonarchStackElement {
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

export class EmbeddedModeData {
	public readonly modeId: string;
	public readonly state: modes.IState;

	constructor(modeId: string, state: modes.IState) {
		this.modeId = modeId;
		this.state = state;
	}

	public equals(other: EmbeddedModeData): boolean {
		return (
			this.modeId === other.modeId
			&& this.state.equals(other.state)
		);
	}

	public clone(): EmbeddedModeData {
		let stateClone = this.state.clone();
		// save an object
		if (stateClone === this.state) {
			return this;
		}
		return new EmbeddedModeData(this.modeId, this.state);
	}
}

/**
 * Reuse the same line states up to a certain depth.
 */
export class MonarchLineStateFactory {

	private static _INSTANCE = new MonarchLineStateFactory(CACHE_STACK_DEPTH);
	public static create(stack: MonarchStackElement, embeddedModeData: EmbeddedModeData): MonarchLineState {
		return this._INSTANCE.create(stack, embeddedModeData);
	}

	private readonly _maxCacheDepth: number;
	private readonly _entries: { [stackElementId: string]: MonarchLineState; };

	constructor(maxCacheDepth: number) {
		this._maxCacheDepth = maxCacheDepth;
		this._entries = Object.create(null);
	}

	public create(stack: MonarchStackElement, embeddedModeData: EmbeddedModeData): MonarchLineState {
		if (embeddedModeData !== null) {
			// no caching when embedding
			return new MonarchLineState(stack, embeddedModeData);
		}
		if (stack !== null && stack.depth >= this._maxCacheDepth) {
			// no caching above a certain depth
			return new MonarchLineState(stack, embeddedModeData);
		}
		let stackElementId = MonarchStackElement.getStackElementId(stack);

		let result = this._entries[stackElementId];
		if (result) {
			return result;
		}
		result = new MonarchLineState(stack, null);
		this._entries[stackElementId] = result;
		return result;
	}
}

export class MonarchLineState implements modes.IState {

	public readonly stack: MonarchStackElement;
	public readonly embeddedModeData: EmbeddedModeData;

	constructor(
		stack: MonarchStackElement,
		embeddedModeData: EmbeddedModeData
	) {
		this.stack = stack;
		this.embeddedModeData = embeddedModeData;
	}

	public clone(): modes.IState {
		let embeddedModeDataClone = this.embeddedModeData ? this.embeddedModeData.clone() : null;
		// save an object
		if (embeddedModeDataClone === this.embeddedModeData) {
			return this;
		}
		return MonarchLineStateFactory.create(this.stack, this.embeddedModeData);
	}

	public equals(other: modes.IState): boolean {
		if (!(other instanceof MonarchLineState)) {
			return false;
		}
		if (!this.stack.equals(other.stack)) {
			return false;
		}
		if (this.embeddedModeData === null && other.embeddedModeData === null) {
			return true;
		}
		if (this.embeddedModeData === null || other.embeddedModeData === null) {
			return false;
		}
		return this.embeddedModeData.equals(other.embeddedModeData);
	}
}

const hasOwnProperty = Object.hasOwnProperty;

export class MonarchTokenizer implements modes.ITokenizationSupport {

	private readonly _modeService: IModeService;
	private readonly _modeId: string;
	private readonly _lexer: monarchCommon.ILexer;
	private _embeddedModes: { [modeId: string]: boolean; };
	private _tokenizationRegistryListener: IDisposable;

	constructor(modeService: IModeService, modeId: string, lexer: monarchCommon.ILexer) {
		this._modeService = modeService;
		this._modeId = modeId;
		this._lexer = lexer;
		this._embeddedModes = Object.create(null);

		// Set up listening for embedded modes
		let emitting = false;
		this._tokenizationRegistryListener = modes.TokenizationRegistry.onDidChange((e) => {
			if (emitting) {
				return;
			}
			let isOneOfMyEmbeddedModes = this._embeddedModes[e.languageId];
			if (isOneOfMyEmbeddedModes) {
				emitting = true;
				modes.TokenizationRegistry.fire(this._modeId);
				emitting = false;
			}
		});
	}

	public dispose(): void {
		this._tokenizationRegistryListener.dispose();
	}

	public getInitialState(): modes.IState {
		let rootState = MonarchStackElementFactory.create(null, this._lexer.start);
		return MonarchLineStateFactory.create(rootState, null);
	}

	public tokenize(line: string, _lineState: modes.IState, offsetDelta: number): modes.ILineTokens {
		let lineState = (<MonarchLineState>_lineState);
		if (lineState.embeddedModeData) {
			return this._nestedTokenize(line, lineState, offsetDelta, [], []);
		} else {
			return this._myTokenize(line, lineState, offsetDelta, [], []);
		}
	}

	private _findLeavingNestedModeOffset(line: string, state: MonarchLineState): number {
		let rules = this._lexer.tokenizer[state.stack.state];
		if (!rules) {
			rules = monarchCommon.findRules(this._lexer, state.stack.state); // do parent matching
			if (!rules) {
				monarchCommon.throwError(this._lexer, 'tokenizer state is not defined: ' + state);
			}
		}

		let popOffset = -1;
		let hasEmbeddedPopRule = false;

		for (let idx in rules) {
			if (!hasOwnProperty.call(rules, idx)) {
				continue;
			}
			let rule: monarchCommon.IRule = rules[idx];
			if (rule.action.nextEmbedded !== '@pop') {
				continue;
			}
			hasEmbeddedPopRule = true;

			let regex = rule.regex;
			let regexSource = rule.regex.source;
			if (regexSource.substr(0, 4) === '^(?:' && regexSource.substr(regexSource.length - 1, 1) === ')') {
				regex = new RegExp(regexSource.substr(4, regexSource.length - 5), regex.ignoreCase ? 'i' : '');
			}

			let result = line.search(regex);
			if (result === -1) {
				continue;
			}

			if (popOffset === -1 || result < popOffset) {
				popOffset = result;
			}
		}

		if (!hasEmbeddedPopRule) {
			monarchCommon.throwError(this._lexer, 'no rule containing nextEmbedded: "@pop" in tokenizer embedded state: ' + state);
		}

		return popOffset;
	}

	private _safeNestedModeTokenize(embeddedModeLine: string, embeddedModeData: EmbeddedModeData, offsetDelta: number): modes.ILineTokens {
		const nestedModeId = embeddedModeData.modeId;
		const embeddedModeState = embeddedModeData.state;

		const nestedModeTokenizationSupport = modes.TokenizationRegistry.get(nestedModeId);
		if (nestedModeTokenizationSupport) {
			return nestedModeTokenizationSupport.tokenize(embeddedModeLine, embeddedModeState, offsetDelta);
		}

		// The nested mode doesn't have tokenization support,
		// unfortunatelly this means we have to fake it
		return nullTokenize(nestedModeId, embeddedModeLine, embeddedModeState, offsetDelta);
	}

	private _nestedTokenize(line: string, lineState: MonarchLineState, offsetDelta: number, prependTokens: Token[], prependModeTransitions: ModeTransition[]): modes.ILineTokens {

		let popOffset = this._findLeavingNestedModeOffset(line, lineState);

		if (popOffset === -1) {
			// tokenization will not leave nested mode
			let nestedModeLineTokens = this._safeNestedModeTokenize(line, lineState.embeddedModeData, offsetDelta);
			// Prepend nested mode's result to our result
			return {
				tokens: prependTokens.concat(nestedModeLineTokens.tokens),
				actualStopOffset: nestedModeLineTokens.actualStopOffset,
				modeTransitions: prependModeTransitions.concat(nestedModeLineTokens.modeTransitions),
				endState: MonarchLineStateFactory.create(lineState.stack, new EmbeddedModeData(lineState.embeddedModeData.modeId, nestedModeLineTokens.endState))
			};
		}

		let nestedModeLine = line.substring(0, popOffset);
		if (nestedModeLine.length > 0) {
			// tokenize with the nested mode
			let nestedModeLineTokens = this._safeNestedModeTokenize(nestedModeLine, lineState.embeddedModeData, offsetDelta);
			// Prepend nested mode's result to our result
			prependTokens = prependTokens.concat(nestedModeLineTokens.tokens);
			prependModeTransitions = prependModeTransitions.concat(nestedModeLineTokens.modeTransitions);
		}

		let restOfTheLine = line.substring(popOffset);
		return this._myTokenize(restOfTheLine, lineState, offsetDelta + popOffset, prependTokens, prependModeTransitions);
	}

	private _myTokenize(line: string, lineState: MonarchLineState, offsetDelta: number, prependTokens: Token[], prependModeTransitions: ModeTransition[]): modes.ILineTokens {

		if (prependModeTransitions.length === 0 || prependModeTransitions[prependModeTransitions.length - 1].modeId !== this._modeId) {
			// Avoid transitioning to the same mode (this can happen in case of empty embedded modes)
			prependModeTransitions.push(new ModeTransition(offsetDelta, this._modeId));
		}

		const lineLength = line.length;

		let embeddedModeData = lineState.embeddedModeData;
		let stack = lineState.stack;
		let pos = 0;

		// regular expression group matching
		// these never need cloning or equality since they are only used within a line match
		let groupActions: monarchCommon.IAction[] = null;
		let groupMatches: string[] = null;
		let groupMatched: string[] = null;
		let groupRule: monarchCommon.IRule = null;

		while (pos < lineLength) {
			const pos0 = pos;
			const stackLen0 = stack.depth;
			const groupLen0 = groupActions ? groupActions.length : 0;
			const state = stack.state;

			let matches: string[] = null;
			let matched: string = null;
			let action: monarchCommon.IAction = null;
			let rule: monarchCommon.IRule = null;

			let enteringEmbeddedMode: string = null;

			// check if we need to process group matches first
			if (groupActions) {
				matches = groupMatches;
				matched = groupMatched.shift();
				action = groupActions.shift();
				rule = groupRule;

				// cleanup if necessary
				if (groupActions.length === 0) {
					groupActions = null;
					groupMatches = null;
					groupMatched = null;
					groupRule = null;
				}
			} else {
				// otherwise we match on the token stream

				if (pos >= lineLength) {
					// nothing to do
					break;
				}

				// get the rules for this state
				let rules = this._lexer.tokenizer[state];
				if (!rules) {
					rules = monarchCommon.findRules(this._lexer, state); // do parent matching
					if (!rules) {
						monarchCommon.throwError(this._lexer, 'tokenizer state is not defined: ' + state);
					}
				}

				// try each rule until we match
				let restOfLine = line.substr(pos);
				for (let idx in rules) {
					if (hasOwnProperty.call(rules, idx)) {
						let rule: monarchCommon.IRule = rules[idx];
						if (pos === 0 || !rule.matchOnlyAtLineStart) {
							matches = restOfLine.match(rule.regex);
							if (matches) {
								matched = matches[0];
								action = rule.action;
								break;
							}
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

			// advance stream
			pos += matched.length;

			// maybe call action function (used for 'cases')
			while (action.test) {
				action = action.test(matched, matches, state, pos === lineLength);
			}

			let result: string | monarchCommon.IAction[] = null;
			// set the result: either a string or an array of actions
			if (typeof action === 'string' || Array.isArray(action)) {
				result = action;
			} else if (action.group) {
				result = action.group;
			} else if (action.token !== null && action.token !== undefined) {
				result = action.token;

				// do $n replacements?
				if (action.tokenSubst) {
					result = monarchCommon.substituteMatches(this._lexer, result, matched, matches, state);
				}

				// enter embedded mode?
				if (action.nextEmbedded) {
					if (action.nextEmbedded === '@pop') {
						if (!embeddedModeData) {
							monarchCommon.throwError(this._lexer, 'cannot pop embedded mode if not inside one');
						}
						embeddedModeData = null;
					} else if (embeddedModeData) {
						monarchCommon.throwError(this._lexer, 'cannot enter embedded mode from within an embedded mode');
					} else {
						enteringEmbeddedMode = monarchCommon.substituteMatches(this._lexer, action.nextEmbedded, matched, matches, state);
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
						monarchCommon.throwError(this._lexer, 'trying to switch to a state \'' + nextState + '\' that is undefined in rule: ' + rule.name);
					} else {
						stack = stack.switchTo(nextState);
					}
				} else if (action.transform && typeof action.transform === 'function') {
					monarchCommon.throwError(this._lexer, 'action.transform not supported');
				} else if (action.next) {
					if (action.next === '@push') {
						if (stack.depth >= this._lexer.maxStack) {
							monarchCommon.throwError(this._lexer, 'maximum tokenizer stack size reached: [' +
								stack.state + ',' + stack.parent.state + ',...]');
						} else {
							stack = stack.push(state);
						}
					} else if (action.next === '@pop') {
						if (stack.depth <= 1) {
							monarchCommon.throwError(this._lexer, 'trying to pop an empty stack in rule: ' + rule.name);
						} else {
							stack = stack.pop();
						}
					} else if (action.next === '@popall') {
						stack = stack.popall();
					} else {
						let nextState = monarchCommon.substituteMatches(this._lexer, action.next, matched, matches, state);
						if (nextState[0] === '@') {
							nextState = nextState.substr(1); // peel off starting '@'
						}

						if (!monarchCommon.findRules(this._lexer, nextState)) {
							monarchCommon.throwError(this._lexer, 'trying to set a next state \'' + nextState + '\' that is undefined in rule: ' + rule.name);
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
				monarchCommon.throwError(this._lexer, 'lexer rule has no well-defined action in rule: ' + rule.name);
			}

			// is the result a group match?
			if (Array.isArray(result)) {
				if (groupActions && groupActions.length > 0) {
					monarchCommon.throwError(this._lexer, 'groups cannot be nested: ' + rule.name);
				}
				if (matches.length !== result.length + 1) {
					monarchCommon.throwError(this._lexer, 'matched number of groups does not match the number of actions in rule: ' + rule.name);
				}
				let totalLen = 0;
				for (let i = 1; i < matches.length; i++) {
					totalLen += matches[i].length;
				}
				if (totalLen !== matched.length) {
					monarchCommon.throwError(this._lexer, 'with groups, all characters should be matched in consecutive groups in rule: ' + rule.name);
				}
				groupMatches = matches;
				groupMatched = matches.slice(1);
				groupActions = result.slice(0);
				groupRule = rule;
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
				}

				// check progress
				if (matched.length === 0) {
					if (stackLen0 !== stack.depth || state !== stack.state || (!groupActions ? 0 : groupActions.length) !== groupLen0) {
						continue;
					} else {
						monarchCommon.throwError(this._lexer, 'no progress in tokenizer in rule: ' + rule.name);
						pos = lineLength; // must make progress or editor loops
					}
				}

				// return the result (and check for brace matching)
				// todo: for efficiency we could pre-sanitize tokenPostfix and substitutions
				let tokenType: string = null;
				if (result.indexOf('@brackets') === 0) {
					let rest = result.substr('@brackets'.length);
					let bracket = findBracket(this._lexer, matched);
					if (!bracket) {
						monarchCommon.throwError(this._lexer, '@brackets token returned but no bracket defined as: ' + matched);
						bracket = { token: '', bracketType: monarchCommon.MonarchBracket.None };
					}
					tokenType = monarchCommon.sanitize(bracket.token + rest);
				} else {
					let token = (result === '' ? '' : result + this._lexer.tokenPostfix);
					tokenType = monarchCommon.sanitize(token);
				}

				if (prependTokens.length === 0 || prependTokens[prependTokens.length - 1].type !== tokenType) {
					prependTokens[prependTokens.length] = new Token(pos0 + offsetDelta, tokenType);
				}
			}

			if (enteringEmbeddedMode) {
				// substitute language alias to known modes to support syntax highlighting
				let enteringEmbeddedModeId = this._modeService.getModeIdForLanguageName(enteringEmbeddedMode);
				if (enteringEmbeddedModeId) {
					enteringEmbeddedMode = enteringEmbeddedModeId;
				}

				let embeddedModeData = this._getNestedEmbeddedModeData(enteringEmbeddedMode);

				if (pos < lineLength) {
					// there is content from the embedded mode on this line
					let restOfLine = line.substr(pos);
					return this._nestedTokenize(restOfLine, MonarchLineStateFactory.create(stack, embeddedModeData), offsetDelta + pos, prependTokens, prependModeTransitions);
				} else {
					return {
						tokens: prependTokens,
						endState: MonarchLineStateFactory.create(stack, embeddedModeData),
						actualStopOffset: offsetDelta + line.length,
						modeTransitions: prependModeTransitions
					};
				}
			}
		}

		return {
			tokens: prependTokens,
			endState: MonarchLineStateFactory.create(stack, embeddedModeData),
			actualStopOffset: offsetDelta + line.length,
			modeTransitions: prependModeTransitions
		};
	}

	private _getNestedEmbeddedModeData(mimetypeOrModeId: string): EmbeddedModeData {
		let nestedMode = this._locateMode(mimetypeOrModeId);
		if (nestedMode) {
			let tokenizationSupport = modes.TokenizationRegistry.get(nestedMode.getId());
			if (tokenizationSupport) {
				return new EmbeddedModeData(nestedMode.getId(), tokenizationSupport.getInitialState());
			}
		}

		let nestedModeId = nestedMode ? nestedMode.getId() : NULL_MODE_ID;
		return new EmbeddedModeData(nestedModeId, NULL_STATE);
	}

	private _locateMode(mimetypeOrModeId: string): modes.IMode {
		if (!mimetypeOrModeId || !this._modeService.isRegisteredMode(mimetypeOrModeId)) {
			return null;
		}

		let modeId = this._modeService.getModeId(mimetypeOrModeId);

		let mode = this._modeService.getMode(modeId);
		if (mode) {
			// Re-emit tokenizationSupport change events from all modes that I ever embedded
			this._embeddedModes[modeId] = true;
			return mode;
		}

		// Fire mode loading event
		this._modeService.getOrCreateMode(modeId);

		this._embeddedModes[modeId] = true;

		return null;
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

	var brackets = lexer.brackets;
	for (var i = 0; i < brackets.length; i++) {
		var bracket = brackets[i];
		if (bracket.open === matched) {
			return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Open };
		}
		else if (bracket.close === matched) {
			return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Close };
		}
	}
	return null;
}

export function createTokenizationSupport(_modeService: IModeService, modeId: string, lexer: monarchCommon.ILexer): modes.ITokenizationSupport {
	return new MonarchTokenizer(_modeService, modeId, lexer);
}
