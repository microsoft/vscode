/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/*
 * This module only exports 'compile' which compiles a JSON language definition
 * into a typed and checked ILexer definition.
 */

import * as objects from 'vs/base/common/objects';
import * as monarchCommon from 'vs/editor/standalone/common/monarch/monarchCommon';
import { IMonarchLanguage, IMonarchLanguageBracket } from 'vs/editor/standalone/common/monarch/monarchTypes';

/*
 * Type helpers
 *
 * Note: this is just for sanity checks on the JSON description which is
 * helpful for the programmer. No checks are done anymore once the lexer is
 * already 'compiled and checked'.
 *
 */

function isArrayOf(elemType: (x: any) => boolean, obj: any): boolean {
	if (!obj) {
		return false;
	}
	if (!(Array.isArray(obj))) {
		return false;
	}
	var idx: any;
	for (idx in obj) {
		if (obj.hasOwnProperty(idx)) {
			if (!(elemType(obj[idx]))) {
				return false;
			}
		}
	}
	return true;
}

function bool(prop: any, def?: boolean, onerr?: () => void): boolean {
	if (typeof (prop) === 'boolean') {
		return prop;
	}
	if (onerr && (prop || def === undefined)) {
		onerr(); // type is wrong, or there is no default
	}
	return (def === undefined ? null : def);
}

function string(prop: any, def?: string, onerr?: () => void): string {
	if (typeof (prop) === 'string') {
		return prop;
	}
	if (onerr && (prop || def === undefined)) {
		onerr(); // type is wrong, or there is no default
	}
	return (def === undefined ? null : def);

}

// Lexer helpers

/**
 * Compiles a regular expression string, adding the 'i' flag if 'ignoreCase' is set.
 * Also replaces @\w+ or sequences with the content of the specified attribute
 */
function compileRegExp(lexer: monarchCommon.ILexerMin, str: string): RegExp {
	if (typeof (str) !== 'string') {
		return null;
	}

	var n = 0;
	while (str.indexOf('@') >= 0 && n < 5) { // at most 5 expansions
		n++;
		str = str.replace(/@(\w+)/g, function (s, attr?) {
			var sub = '';
			if (typeof (lexer[attr]) === 'string') {
				sub = lexer[attr];
			} else if (lexer[attr] && lexer[attr] instanceof RegExp) {
				sub = lexer[attr].source;
			} else {
				if (lexer[attr] === undefined) {
					monarchCommon.throwError(lexer, 'language definition does not contain attribute \'' + attr + '\', used at: ' + str);
				} else {
					monarchCommon.throwError(lexer, 'attribute reference \'' + attr + '\' must be a string, used at: ' + str);
				}
			}
			return (monarchCommon.empty(sub) ? '' : '(?:' + sub + ')');
		});
	}

	return new RegExp(str, (lexer.ignoreCase ? 'i' : ''));
}

/**
 * Compiles guard functions for case matches.
 * This compiles 'cases' attributes into efficient match functions.
 *
 */
function selectScrutinee(id: string, matches: string[], state: string, num: number): string {
	if (num < 0) {
		return id;
	}
	if (num < matches.length) {
		return matches[num];
	}
	if (num >= 100) {
		num = num - 100;
		var parts = state.split('.');
		parts.unshift(state);
		if (num < parts.length) {
			return parts[num];
		}
	}
	return null;
}

function createGuard(lexer: monarchCommon.ILexerMin, ruleName: string, tkey: string, val: monarchCommon.FuzzyAction): monarchCommon.IBranch {
	// get the scrutinee and pattern
	var scrut = -1; // -1: $!, 0-99: $n, 100+n: $Sn
	var oppat = tkey;
	var matches: string[] = tkey.match(/^\$(([sS]?)(\d\d?)|#)(.*)$/);
	if (matches) {
		if (matches[3]) { // if digits
			scrut = parseInt(matches[3]);
			if (matches[2]) {
				scrut = scrut + 100; // if [sS] present
			}
		}
		oppat = matches[4];
	}
	// get operator
	var op = '~';
	var pat = oppat;
	if (!oppat || oppat.length === 0) {
		op = '!=';
		pat = '';
	}
	else if (/^\w*$/.test(pat)) {  // just a word
		op = '==';
	}
	else {
		matches = oppat.match(/^(@|!@|~|!~|==|!=)(.*)$/);
		if (matches) {
			op = matches[1];
			pat = matches[2];
		}
	}

	// set the tester function
	var tester: (s: string, id: string, matches: string[], state: string, eos: boolean) => boolean;

	// special case a regexp that matches just words
	if ((op === '~' || op === '!~') && /^(\w|\|)*$/.test(pat)) {
		var inWords = objects.createKeywordMatcher(pat.split('|'), lexer.ignoreCase);
		tester = function (s) { return (op === '~' ? inWords(s) : !inWords(s)); };
	}
	else if (op === '@' || op === '!@') {
		var words = lexer[pat];
		if (!words) {
			monarchCommon.throwError(lexer, 'the @ match target \'' + pat + '\' is not defined, in rule: ' + ruleName);
		}
		if (!(isArrayOf(function (elem) { return (typeof (elem) === 'string'); }, words))) {
			monarchCommon.throwError(lexer, 'the @ match target \'' + pat + '\' must be an array of strings, in rule: ' + ruleName);
		}
		var inWords = objects.createKeywordMatcher(words, lexer.ignoreCase);
		tester = function (s) { return (op === '@' ? inWords(s) : !inWords(s)); };
	}
	else if (op === '~' || op === '!~') {
		if (pat.indexOf('$') < 0) {
			// precompile regular expression
			var re = compileRegExp(lexer, '^' + pat + '$');
			tester = function (s) { return (op === '~' ? re.test(s) : !re.test(s)); };
		}
		else {
			tester = function (s, id, matches, state) {
				var re = compileRegExp(lexer, '^' + monarchCommon.substituteMatches(lexer, pat, id, matches, state) + '$');
				return re.test(s);
			};
		}
	}
	else { // if (op==='==' || op==='!=') {
		if (pat.indexOf('$') < 0) {
			var patx = monarchCommon.fixCase(lexer, pat);
			tester = function (s) { return (op === '==' ? s === patx : s !== patx); };
		}
		else {
			var patx = monarchCommon.fixCase(lexer, pat);
			tester = function (s, id, matches, state, eos) {
				var patexp = monarchCommon.substituteMatches(lexer, patx, id, matches, state);
				return (op === '==' ? s === patexp : s !== patexp);
			};
		}
	}

	// return the branch object
	if (scrut === -1) {
		return {
			name: tkey, value: val, test: function (id, matches, state, eos) {
				return tester(id, id, matches, state, eos);
			}
		};
	}
	else {
		return {
			name: tkey, value: val, test: function (id, matches, state, eos) {
				var scrutinee = selectScrutinee(id, matches, state, scrut);
				return tester(!scrutinee ? '' : scrutinee, id, matches, state, eos);
			}
		};
	}
}

/**
 * Compiles an action: i.e. optimize regular expressions and case matches
 * and do many sanity checks.
 *
 * This is called only during compilation but if the lexer definition
 * contains user functions as actions (which is usually not allowed), then this
 * may be called during lexing. It is important therefore to compile common cases efficiently
 */
function compileAction(lexer: monarchCommon.ILexerMin, ruleName: string, action: any): monarchCommon.FuzzyAction {
	if (!action) {
		return { token: '' };
	}
	else if (typeof (action) === 'string') {
		return action; // { token: action };
	}
	else if (action.token || action.token === '') {
		if (typeof (action.token) !== 'string') {
			monarchCommon.throwError(lexer, 'a \'token\' attribute must be of type string, in rule: ' + ruleName);
			return { token: '' };
		}
		else {
			// only copy specific typed fields (only happens once during compile Lexer)
			var newAction: monarchCommon.IAction = { token: action.token };
			if (action.token.indexOf('$') >= 0) {
				newAction.tokenSubst = true;
			}
			if (typeof (action.bracket) === 'string') {
				if (action.bracket === '@open') {
					newAction.bracket = monarchCommon.MonarchBracket.Open;
				} else if (action.bracket === '@close') {
					newAction.bracket = monarchCommon.MonarchBracket.Close;
				} else {
					monarchCommon.throwError(lexer, 'a \'bracket\' attribute must be either \'@open\' or \'@close\', in rule: ' + ruleName);
				}
			}
			if (action.next) {
				if (typeof (action.next) !== 'string') {
					monarchCommon.throwError(lexer, 'the next state must be a string value in rule: ' + ruleName);
				}
				else {
					var next: string = action.next;
					if (!/^(@pop|@push|@popall)$/.test(next)) {
						if (next[0] === '@') {
							next = next.substr(1); // peel off starting @ sign
						}
						if (next.indexOf('$') < 0) {  // no dollar substitution, we can check if the state exists
							if (!monarchCommon.stateExists(lexer, monarchCommon.substituteMatches(lexer, next, '', [], ''))) {
								monarchCommon.throwError(lexer, 'the next state \'' + action.next + '\' is not defined in rule: ' + ruleName);
							}
						}
					}
					newAction.next = next;
				}
			}
			if (typeof (action.goBack) === 'number') {
				newAction.goBack = action.goBack;
			}
			if (typeof (action.switchTo) === 'string') {
				newAction.switchTo = action.switchTo;
			}
			if (typeof (action.log) === 'string') {
				newAction.log = action.log;
			}
			if (typeof (action.nextEmbedded) === 'string') {
				newAction.nextEmbedded = action.nextEmbedded;
				lexer.usesEmbedded = true;
			}
			return newAction;
		}
	}
	else if (Array.isArray(action)) {
		var results: monarchCommon.FuzzyAction[] = [];
		var idx: string;
		for (idx in action) {
			if (action.hasOwnProperty(idx)) {
				results[idx] = compileAction(lexer, ruleName, action[idx]);
			}
		}
		return { group: results };
	}
	else if (action.cases) {
		// build an array of test cases
		var cases: monarchCommon.IBranch[] = [];

		// for each case, push a test function and result value
		var tkey: string;
		for (tkey in action.cases) {
			if (action.cases.hasOwnProperty(tkey)) {
				var val = compileAction(lexer, ruleName, action.cases[tkey]);

				// what kind of case
				if (tkey === '@default' || tkey === '@' || tkey === '') {
					cases.push({ test: null, value: val, name: tkey });
				}
				else if (tkey === '@eos') {
					cases.push({ test: function (id, matches, state, eos) { return eos; }, value: val, name: tkey });
				}
				else {
					cases.push(createGuard(lexer, ruleName, tkey, val));  // call separate function to avoid local variable capture
				}
			}
		}

		// create a matching function
		var def = lexer.defaultToken;
		return {
			test: function (id, matches, state, eos) {
				var idx: string;
				for (idx in cases) {
					if (cases.hasOwnProperty(idx)) {
						var didmatch = (!cases[idx].test || cases[idx].test(id, matches, state, eos));
						if (didmatch) {
							return cases[idx].value;
						}
					}
				}
				return def;
			}
		};
	}
	else {
		monarchCommon.throwError(lexer, 'an action must be a string, an object with a \'token\' or \'cases\' attribute, or an array of actions; in rule: ' + ruleName);
		return '';
	}
}

/**
 * Helper class for creating matching rules
 */
class Rule implements monarchCommon.IRule {
	public regex: RegExp = new RegExp('');
	public action: monarchCommon.FuzzyAction = { token: '' };
	public matchOnlyAtLineStart: boolean = false;
	public name: string = '';

	constructor(name: string) {
		this.name = name;
	}

	public setRegex(lexer: monarchCommon.ILexerMin, re: string);
	public setRegex(lexer: monarchCommon.ILexerMin, re: RegExp);
	public setRegex(lexer: monarchCommon.ILexerMin, re: any) {
		var sregex: string;
		if (typeof (re) === 'string') {
			sregex = re;
		}
		else if (re instanceof RegExp) {
			sregex = (<RegExp>re).source;
		}
		else {
			monarchCommon.throwError(lexer, 'rules must start with a match string or regular expression: ' + this.name);
		}

		this.matchOnlyAtLineStart = (sregex.length > 0 && sregex[0] === '^');
		this.name = this.name + ': ' + sregex;
		this.regex = compileRegExp(lexer, '^(?:' + (this.matchOnlyAtLineStart ? sregex.substr(1) : sregex) + ')');
	}

	public setAction(lexer: monarchCommon.ILexerMin, act: monarchCommon.IAction) {
		this.action = compileAction(lexer, this.name, act);
	}
}

/**
 * Compiles a json description function into json where all regular expressions,
 * case matches etc, are compiled and all include rules are expanded.
 * We also compile the bracket definitions, supply defaults, and do many sanity checks.
 * If the 'jsonStrict' parameter is 'false', we allow at certain locations
 * regular expression objects and functions that get called during lexing.
 * (Currently we have no samples that need this so perhaps we should always have
 * jsonStrict to true).
 */
export function compile(languageId: string, json: IMonarchLanguage): monarchCommon.ILexer {
	if (!json || typeof (json) !== 'object') {
		throw new Error('Monarch: expecting a language definition object');
	}

	// Create our lexer
	var lexer: monarchCommon.ILexer = <monarchCommon.ILexer>{};
	lexer.languageId = languageId;
	lexer.noThrow = false; // raise exceptions during compilation
	lexer.maxStack = 100;

	// Set standard fields: be defensive about types
	lexer.start = string(json.start);
	lexer.ignoreCase = bool(json.ignoreCase, false);

	lexer.tokenPostfix = string(json.tokenPostfix, '.' + lexer.languageId);
	lexer.defaultToken = string(json.defaultToken, 'source', function () { monarchCommon.throwError(lexer, 'the \'defaultToken\' must be a string'); });

	lexer.usesEmbedded = false; // becomes true if we find a nextEmbedded action

	// For calling compileAction later on
	var lexerMin: monarchCommon.ILexerMin = <any>json;
	lexerMin.languageId = languageId;
	lexerMin.ignoreCase = lexer.ignoreCase;
	lexerMin.noThrow = lexer.noThrow;
	lexerMin.usesEmbedded = lexer.usesEmbedded;
	lexerMin.stateNames = json.tokenizer;
	lexerMin.defaultToken = lexer.defaultToken;


	// Compile an array of rules into newrules where RegExp objects are created.
	function addRules(state: string, newrules: monarchCommon.IRule[], rules: any[]) {
		var idx: string;
		for (idx in rules) {
			if (rules.hasOwnProperty(idx)) {
				var rule = rules[idx];
				var include = rule.include;
				if (include) {
					if (typeof (include) !== 'string') {
						monarchCommon.throwError(lexer, 'an \'include\' attribute must be a string at: ' + state);
					}
					if (include[0] === '@') {
						include = include.substr(1); // peel off starting @
					}
					if (!json.tokenizer[include]) {
						monarchCommon.throwError(lexer, 'include target \'' + include + '\' is not defined at: ' + state);
					}
					addRules(state + '.' + include, newrules, json.tokenizer[include]);
				}
				else {
					var newrule = new Rule(state);


					// Set up new rule attributes
					if (Array.isArray(rule) && rule.length >= 1 && rule.length <= 3) {
						newrule.setRegex(lexerMin, rule[0]);
						if (rule.length >= 3) {
							if (typeof (rule[1]) === 'string') {
								newrule.setAction(lexerMin, { token: rule[1], next: rule[2] });
							}
							else if (typeof (rule[1]) === 'object') {
								var rule1 = rule[1];
								rule1.next = rule[2];
								newrule.setAction(lexerMin, rule1);
							}
							else {
								monarchCommon.throwError(lexer, 'a next state as the last element of a rule can only be given if the action is either an object or a string, at: ' + state);
							}
						}
						else {
							newrule.setAction(lexerMin, rule[1]);
						}
					}
					else {
						if (!rule.regex) {
							monarchCommon.throwError(lexer, 'a rule must either be an array, or an object with a \'regex\' or \'include\' field at: ' + state);
						}
						if (rule.name) {
							newrule.name = string(rule.name);
						}
						if (rule.matchOnlyAtStart) {
							newrule.matchOnlyAtLineStart = bool(rule.matchOnlyAtLineStart);
						}
						newrule.setRegex(lexerMin, rule.regex);
						newrule.setAction(lexerMin, rule.action);
					}

					newrules.push(newrule);
				}
			}
		}
	}

	// compile the tokenizer rules
	if (!json.tokenizer || typeof (json.tokenizer) !== 'object') {
		monarchCommon.throwError(lexer, 'a language definition must define the \'tokenizer\' attribute as an object');
	}

	lexer.tokenizer = [];
	var key: string;
	for (key in json.tokenizer) {
		if (json.tokenizer.hasOwnProperty(key)) {
			if (!lexer.start) {
				lexer.start = key;
			}

			var rules = json.tokenizer[key];
			lexer.tokenizer[key] = new Array();
			addRules('tokenizer.' + key, lexer.tokenizer[key], rules);
		}
	}
	lexer.usesEmbedded = lexerMin.usesEmbedded;  // can be set during compileAction

	// Set simple brackets
	if (json.brackets) {
		if (!(Array.isArray(<any>json.brackets))) {
			monarchCommon.throwError(lexer, 'the \'brackets\' attribute must be defined as an array');
		}
	}
	else {
		json.brackets = [
			{ open: '{', close: '}', token: 'delimiter.curly' },
			{ open: '[', close: ']', token: 'delimiter.square' },
			{ open: '(', close: ')', token: 'delimiter.parenthesis' },
			{ open: '<', close: '>', token: 'delimiter.angle' }];
	}
	var brackets: IMonarchLanguageBracket[] = [];
	for (var bracketIdx in json.brackets) {
		if (json.brackets.hasOwnProperty(bracketIdx)) {
			var desc = <any>json.brackets[bracketIdx];
			if (desc && Array.isArray(desc) && desc.length === 3) {
				desc = { token: desc[2], open: desc[0], close: desc[1] };
			}
			if (desc.open === desc.close) {
				monarchCommon.throwError(lexer, 'open and close brackets in a \'brackets\' attribute must be different: ' + desc.open +
					'\n hint: use the \'bracket\' attribute if matching on equal brackets is required.');
			}
			if (typeof (desc.open) === 'string' && typeof (desc.token) === 'string') {
				brackets.push({
					token: string(desc.token) + lexer.tokenPostfix
					, open: monarchCommon.fixCase(lexer, string(desc.open))
					, close: monarchCommon.fixCase(lexer, string(desc.close))
				});
			}
			else {
				monarchCommon.throwError(lexer, 'every element in the \'brackets\' array must be a \'{open,close,token}\' object or array');
			}
		}
	}
	lexer.brackets = brackets;

	// Disable throw so the syntax highlighter goes, no matter what
	lexer.noThrow = true;
	return lexer;
}
