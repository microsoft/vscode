/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {LineStream} from 'vs/editor/common/modes/lineStream';
import ModesRegistry = require('vs/editor/common/modes/modesRegistry');
import Supports = require('vs/editor/common/modes/supports');
import MonarchCommonTypes = require('vs/editor/common/modes/monarch/monarchCommon');
import Modes = require('vs/editor/common/modes');
import {Registry} from 'vs/platform/platform';
import {IModeService} from 'vs/editor/common/services/modeService';

var modesRegistry = <ModesRegistry.IEditorModesRegistry>Registry.as(ModesRegistry.Extensions.EditorModes);

/**
 * The MonarchLexer class implements a monaco lexer that highlights source code.
 * It takes a compiled lexer to guide the tokenizer and maintains a stack of
 * lexer states.
 */
export class MonarchLexer extends AbstractState {

	static ID = 0;

	private id: number;
	private lexer: MonarchCommonTypes.ILexer;
	private stack: string[];

	public embeddedMode: string;
	public embeddedEntered: boolean;

	private groupActions: MonarchCommonTypes.IAction[];
	private groupMatches: string[];
	private groupMatched: string[];
	private groupRule: MonarchCommonTypes.IRule;

	constructor(mode: Modes.IMode, lexer: MonarchCommonTypes.ILexer, stack?: string[], embeddedMode?: string) {
		super(mode);
		this.id = MonarchLexer.ID++; // for debugging, assigns unique id to each instance

		this.lexer = lexer; // (compiled) lexer description
		this.stack = (stack ? stack : [lexer.start]); // stack of states
		this.embeddedMode = (embeddedMode ? embeddedMode : null); // are we scanning an embedded section?

		// did we encounter an embedded start on this line?
		// no need for cloning or equality since it is used only within a line
		this.embeddedEntered = false;

		// regular expression group matching
		// these never need cloning or equality since they are only used within a line match
		this.groupActions = null;
		this.groupMatches = null;
		this.groupMatched = null;
		this.groupRule = null;
	}

	public makeClone(): MonarchLexer {
		return new MonarchLexer(this.getMode(), this.lexer, this.stack.slice(0), this.embeddedMode);
	}

	public equals(other: Modes.IState): boolean {
		if (!super.equals(other)) {
			return false;
		}
		if (!(other instanceof MonarchLexer)) return false;
		var otherm: MonarchLexer = <MonarchLexer>other;
		if ((this.stack.length !== otherm.stack.length) || (this.lexer.name !== otherm.lexer.name) ||
			(this.embeddedMode !== otherm.embeddedMode)) {
			return false;
		}
		var idx: string;
		for (idx in this.stack) {
			if (this.stack.hasOwnProperty(idx)) {
				if (this.stack[idx] !== otherm.stack[idx]) return false;
			}
		}
		return true;
	}

	/**
	 * The main tokenizer: this function gets called by monaco to tokenize lines
	 * Note: we don't want to raise exceptions here and always keep going..
	 *
	 * TODO: there are many optimizations possible here for the common cases
	 * but for now I concentrated on functionality and correctness.
	 */
	public tokenize(stream: Modes.IStream, noConsumeIsOk?: boolean): Modes.ITokenizationResult {
		var stackLen0 = this.stack.length;  // these are saved to check progress
		var groupLen0 = 0;
		var state: string = this.stack[0];  // the current state
		this.embeddedEntered = false;

		var matches: string[] = null;
		var matched: string = null;
		var action: MonarchCommonTypes.IAction = null;
		var next: string = null;
		var rule: MonarchCommonTypes.IRule = null;

		// check if we need to process group matches first
		if (this.groupActions) {
			groupLen0 = this.groupActions.length;
			matches = this.groupMatches;
			matched = this.groupMatched.shift();
			action = this.groupActions.shift();
			rule = this.groupRule;

			// cleanup if necessary
			if (this.groupActions.length === 0) {
				this.groupActions = null;
				this.groupMatches = null;
				this.groupMatched = null;
				this.groupRule = null;
			}
		}
			// otherwise we match on the token stream
		else {
			// nothing to do
			if (stream.eos()) {
				return { type: '' };
			}

			// get the entire line
			var line = stream.advanceToEOS();
			stream.goBack(line.length);

			// get the rules for this state
			var rules = this.lexer.tokenizer[state];
			if (!rules) rules = MonarchCommonTypes.findRules(this.lexer, state); // do parent matching

			if (!rules) {
				MonarchCommonTypes.throwError(this.lexer, 'tokenizer state is not defined: ' + state);
			}
			else {
				// try each rule until we match
				rule = null;
				var pos = stream.pos();
				var idx: string;
				for (idx in rules) {
					if (rules.hasOwnProperty(idx)) {
						rule = rules[idx];
						if (pos === 0 || !rule.matchOnlyAtLineStart) {
							matches = line.match(rule.regex);
							if (matches) {
								matched = matches[0];
								action = rule.action;
								break;
							}
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
			if (!stream.eos()) {
				matches = [stream.peek()];
				matched = matches[0];
			}
			action = this.lexer.defaultToken;
		}

		// advance stream
		stream.advance(matched.length);

		// maybe call action function (used for 'cases')
		while (action.test) {
			var callres = action.test(matched, matches, state, stream.eos());
			action = callres;
		}

		// set the result: either a string or an array of actions
		var result = null;
		if (typeof (action) === 'string' || Array.isArray(action)) {
			result = action;
		}
		else if (action.group) {
			result = action.group;
		}
		else if (action.token !== null && action.token !== undefined) {
			result = action.token;

			// do $n replacements?
			if (action.tokenSubst) {
				result = MonarchCommonTypes.substituteMatches(this.lexer, result, matched, matches, state);
			}

			// enter embedded mode?
			if (action.nextEmbedded) {
				if (action.nextEmbedded === '@pop') {
					if (!this.embeddedMode) {
						MonarchCommonTypes.throwError(this.lexer, 'cannot pop embedded mode if not inside one');
					}
					this.embeddedMode = null;
				}
				else if (this.embeddedMode) {
					MonarchCommonTypes.throwError(this.lexer, 'cannot enter embedded mode from within an embedded mode');
				}
				else {
					this.embeddedMode = MonarchCommonTypes.substituteMatches(this.lexer, action.nextEmbedded, matched, matches, state);

					// substitute language alias to known modes to support syntax highlighting
					var embeddedMode = modesRegistry.getModeIdForLanguageName(this.embeddedMode);
					if (this.embeddedMode && embeddedMode) {
						this.embeddedMode = embeddedMode;
					}

					this.embeddedEntered = true;
				}
			}

			// state transformations
			if (action.goBack) { // back up the stream..
				stream.goBack(action.goBack);
			}
			if (action.switchTo && typeof action.switchTo === 'string') {
				var nextState = MonarchCommonTypes.substituteMatches(this.lexer, action.switchTo, matched, matches, state);  // switch state without a push...
				if (nextState[0] === '@') nextState = nextState.substr(1); // peel off starting '@'
				if (!MonarchCommonTypes.findRules(this.lexer, nextState)) {
					MonarchCommonTypes.throwError(this.lexer, 'trying to switch to a state \'' + nextState + '\' that is undefined in rule: ' + rule.name);
				}
				else {
					this.stack[0] = nextState;
				}
				next = null;
			}
			else if (action.transform && typeof action.transform === 'function') {
				this.stack = action.transform(this.stack); // if you need to do really funky stuff...
				next = null;
			}
			else if (action.next) {
				if (action.next === '@push') {
					if (this.stack.length >= this.lexer.maxStack) {
						MonarchCommonTypes.throwError(this.lexer, 'maximum tokenizer stack size reached: [' +
							this.stack[0] + ',' + this.stack[1] + ',...,' +
							this.stack[this.stack.length - 2] + ',' + this.stack[this.stack.length - 1] + ']');
					}
					else {
						this.stack.unshift(state);
					}
				}
				else if (action.next === '@pop') {
					if (this.stack.length <= 1) {
						MonarchCommonTypes.throwError(this.lexer, 'trying to pop an empty stack in rule: ' + rule.name);
					}
					else {
						this.stack.shift();
					}
				}
				else if (action.next === '@popall') {
					if (this.stack.length > 1) this.stack = [this.stack[this.stack.length - 1]];
				}
				else {
					var nextState = MonarchCommonTypes.substituteMatches(this.lexer, action.next, matched, matches, state);
					if (nextState[0] === '@') nextState = nextState.substr(1); // peel off starting '@'

					if (!MonarchCommonTypes.findRules(this.lexer, nextState)) {
						MonarchCommonTypes.throwError(this.lexer, 'trying to set a next state \'' + nextState + '\' that is undefined in rule: ' + rule.name);
					}
					else {
						this.stack.unshift(nextState);
					}
				}
			}

			if (action.log && typeof (action.log) === 'string') {
				MonarchCommonTypes.log(this.lexer, this.lexer.displayName + ': ' + MonarchCommonTypes.substituteMatches(this.lexer, action.log, matched, matches, state));
			}
		}

		// check result
		if (result === null) {
			MonarchCommonTypes.throwError(this.lexer, 'lexer rule has no well-defined action in rule: ' + rule.name);
			result = this.lexer.defaultToken;
		}

		// is the result a group match?
		if (Array.isArray(result)) {
			if (this.groupActions && this.groupActions.length > 0) {
				MonarchCommonTypes.throwError(this.lexer, 'groups cannot be nested: ' + rule.name);
			}
			if (matches.length !== result.length + 1) {
				MonarchCommonTypes.throwError(this.lexer, 'matched number of groups does not match the number of actions in rule: ' + rule.name);
			}
			var totalLen = 0;
			for (var i = 1; i < matches.length; i++) {
				totalLen += matches[i].length;
			}
			if (totalLen !== matched.length) {
				MonarchCommonTypes.throwError(this.lexer, 'with groups, all characters should be matched in consecutive groups in rule: ' + rule.name);
			}
			this.groupMatches = matches;
			this.groupMatched = matches.slice(1);
			this.groupActions = result.slice(0);
			this.groupRule = rule;
			stream.goBack(matched.length);
			return this.tokenize(stream);  // call recursively to initiate first result match
		}
			// regular result
		else {
			// check for '@rematch'
			if (result === '@rematch') {
				stream.goBack(matched.length);
				matched = '';  // better set the next state too..
				matches = null;
				result = '';
			}

			// check progress
			if (matched.length === 0) {
				if (stackLen0 !== this.stack.length || state !== this.stack[0]
					|| (!this.groupActions ? 0 : this.groupActions.length) !== groupLen0) {
					if (!noConsumeIsOk) { // used for nested modes..
						return this.tokenize(stream); // tokenize again in the new state
					}
				}
				else {
					MonarchCommonTypes.throwError(this.lexer, 'no progress in tokenizer in rule: ' + rule.name);
					stream.advanceToEOS(); // must make progress or editor loops
					// result='';
				}
			}

			// return the result (and check for brace matching)
			// todo: for efficiency we could pre-sanitize tokenPostfix and substitutions
			if (result.indexOf('@brackets') === 0) {
				var rest = result.substr('@brackets'.length);
				var bracket = findBracket(this.lexer, matched);
				if (!bracket) {
					MonarchCommonTypes.throwError(this.lexer, '@brackets token returned but no bracket defined as: ' + matched);
					bracket = { token: '', bracketType: Modes.Bracket.None };
				}
				return { type: MonarchCommonTypes.sanitize(bracket.token + rest), bracket: bracket.bracketType };
			}
			else {
				var token = (result === '' ? '' : result + this.lexer.tokenPostfix);
				return { type: MonarchCommonTypes.sanitize(token), bracket: action.bracket };
			}
		}
	}
}

/**
 * Searches for a bracket in the 'brackets' attribute that matches the input.
 */
function findBracket(lexer: MonarchCommonTypes.ILexer, matched: string) {
	if (!matched) return null;
	matched = MonarchCommonTypes.fixCase(lexer, matched);

	var brackets = lexer.brackets;
	for (var i = 0; i < brackets.length; i++) {
		var bracket = brackets[i];
		if (bracket.open === matched) {
			return { token: bracket.token, bracketType: Modes.Bracket.Open }
		}
		else if (bracket.close === matched) {
			return { token: bracket.token, bracketType: Modes.Bracket.Close };
		}
	}
	return null;
}

export function createTokenizationSupport(modeService:IModeService, mode:Modes.IMode, lexer: MonarchCommonTypes.ILexer): Modes.ITokenizationSupport {
	return new Supports.TokenizationSupport(mode, {
		getInitialState: (): Modes.IState => {
			return new MonarchLexer(mode, lexer);
		},

		enterNestedMode: (state: Modes.IState): boolean => {
			if (state instanceof MonarchLexer) {
				return state.embeddedEntered;
			}
			return false;
		},

		getNestedMode: (rawState: Modes.IState): Supports.IEnteringNestedModeData => {
			var mime = (<MonarchLexer>rawState).embeddedMode;

			if (!modesRegistry.isRegisteredMode(mime)) {
				// unknown mode
				return {
					mode: modeService.getMode('text/plain'),
					missingModePromise: null
				};
			}

			var mode = modeService.getMode(mime);
			if (mode) {
				// mode is available
				return {
					mode: mode,
					missingModePromise: null
				};
			}

			// mode is not yet loaded
			return {
				mode: modeService.getMode('text/plain'),
				missingModePromise: modeService.getOrCreateMode(mime).then(() => null)
			};
		},

		getLeavingNestedModeData: (line: string, state: Modes.IState) => {
			// state = state.clone();
			var mstate = <MonarchLexer>state.clone();
			var stream = new LineStream(line);
			while (!stream.eos() && mstate.embeddedMode) {
				mstate.tokenize(stream, true); // allow no consumption for @rematch
			}
			if (mstate.embeddedMode) return null;  // don't leave yet

			var end = stream.pos();
			return {
				nestedModeBuffer: line.substring(0, end),
				bufferAfterNestedMode: line.substring(end),
				stateAfterNestedMode: mstate
			};
		}
	}, lexer.usesEmbedded, false);
}
