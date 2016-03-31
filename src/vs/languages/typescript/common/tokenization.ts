/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import collections = require('vs/base/common/collections');
import Modes = require('vs/editor/common/modes');
import supports = require('vs/editor/common/modes/supports');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import {AbstractState} from 'vs/editor/common/modes/abstractState';

export enum Language {
	TypeScript,
	EcmaScript5
}

export function createTokenizationSupport(mode:Modes.IMode, language:Language):Modes.ITokenizationSupport {

	var classifier = ts.createClassifier(),
		bracketTypeTable = language === Language.TypeScript ? tsBracketTypeTable : jsBracketTypeTable,
		tokenTypeTable = language === Language.TypeScript ? tsTokenTypeTable : jsTokenTypeTable;

	return {
		shouldGenerateEmbeddedModels: false,
		getInitialState: () => new State(mode, null, language, ts.EndOfLineState.None, false),
		tokenize: (line, state, offsetDelta?, stopAtOffset?) => tokenize(bracketTypeTable, tokenTypeTable, classifier, <State> state, line, offsetDelta, stopAtOffset)
	};
}

class State implements Modes.IState {

	private _mode: Modes.IMode;
	private _state: Modes.IState;

	public language: Language;
	public eolState: ts.EndOfLineState;
	public inJsDocComment: boolean;

	constructor(mode: Modes.IMode, state: Modes.IState, language:Language, eolState: ts.EndOfLineState, inJsDocComment: boolean) {
		this._mode = mode;
		this._state = state;
		this.language = language;
		this.eolState = eolState;
		this.inJsDocComment = inJsDocComment;
	}

	public clone(): State {
		return new State(this._mode, AbstractState.safeClone(this._state), this.language, this.eolState, this.inJsDocComment);
	}

	public equals(other:Modes.IState):boolean {
		if(other === this) {
			return true;
		}
		if(!other || !(other instanceof State)) {
			return false;
		}
		if (this.eolState !== (<State> other).eolState) {
			return false;
		}
		if(this.inJsDocComment !== (<State> other).inJsDocComment) {
			return false;
		}
		return AbstractState.safeEquals(this._state, (<State> other)._state);
	}

	public getMode():Modes.IMode {
		return this._mode;
	}

	public tokenize(stream:any):Modes.ITokenizationResult {
		throw new Error();
	}

	public getStateData():Modes.IState {
		return this._state;
	}

	public setStateData(state:Modes.IState):void {
		this._state = state;
	}
}

function tokenize(bracketTypeTable: { [i: number]: string }, tokenTypeTable: { [i: number]: string },
	classifier: ts.Classifier, state: State, text: string, offsetDelta: number = 0, stopAtOffset?: number): Modes.ILineTokens {

	// Create result early and fill in tokens
	var ret = {
		tokens: <Modes.IToken[]>[],
		actualStopOffset: offsetDelta + text.length,
		endState: new State(state.getMode(), state.getStateData(), state.language, ts.EndOfLineState.None, false),
		modeTransitions: [{ startIndex: offsetDelta, mode: state.getMode() }],
	};

	function appendFn(startIndex:number, type:string):void {
		if(ret.tokens.length === 0 || arrays.tail(ret.tokens).type !== type) {
			ret.tokens.push(new supports.Token(startIndex, type));
		}
	}

	var isTypeScript = state.language === Language.TypeScript;

	// shebang statement, #! /bin/node
	if (!isTypeScript && checkSheBang(state, offsetDelta, text, appendFn)) {
		return ret;
	}

	var result = classifier.getClassificationsForLine(text, state.eolState, true),
		offset = 0;

	ret.endState.eolState = result.finalLexState;
	ret.endState.inJsDocComment = result.finalLexState === ts.EndOfLineState.InMultiLineCommentTrivia && (state.inJsDocComment || /\/\*\*.*$/.test(text));

	for (let entry of result.entries) {

		var type: string;

		if (entry.classification === ts.TokenClass.Punctuation) {
			// punctions: check for brackets: (){}[]
			var ch = text.charCodeAt(offset);
			type = bracketTypeTable[ch] || tokenTypeTable[entry.classification];
			appendFn(offset + offsetDelta, type);

		} else if (entry.classification === ts.TokenClass.Comment) {
			// comments: check for JSDoc, block, and line comments
			if (ret.endState.inJsDocComment || /\/\*\*.*\*\//.test(text.substr(offset, entry.length))) {
				appendFn(offset + offsetDelta, isTypeScript ? 'comment.doc.ts' : 'comment.doc.js');
			} else {
				appendFn(offset + offsetDelta, isTypeScript ? 'comment.ts' : 'comment.js');
			}
		} else {
			// everything else
			appendFn(offset + offsetDelta,
				tokenTypeTable[entry.classification] || strings.empty);
		}

		offset += entry.length;
	}

	return ret;
}

var tsBracketTypeTable = collections.createNumberDictionary<string>();
tsBracketTypeTable['('.charCodeAt(0)] = 'delimiter.parenthesis.ts';
tsBracketTypeTable[')'.charCodeAt(0)] = 'delimiter.parenthesis.ts';
tsBracketTypeTable['{'.charCodeAt(0)] = 'delimiter.bracket.ts';
tsBracketTypeTable['}'.charCodeAt(0)] = 'delimiter.bracket.ts';
tsBracketTypeTable['['.charCodeAt(0)] = 'delimiter.array.ts';
tsBracketTypeTable[']'.charCodeAt(0)] = 'delimiter.array.ts';

var tsTokenTypeTable = collections.createNumberDictionary<string>();
tsTokenTypeTable[ts.TokenClass.Identifier] = 'identifier.ts';
tsTokenTypeTable[ts.TokenClass.Keyword] = 'keyword.ts';
tsTokenTypeTable[ts.TokenClass.Operator] = 'delimiter.ts';
tsTokenTypeTable[ts.TokenClass.Punctuation] = 'delimiter.ts';
tsTokenTypeTable[ts.TokenClass.NumberLiteral] = 'number.ts';
tsTokenTypeTable[ts.TokenClass.RegExpLiteral] = 'regexp.ts';
tsTokenTypeTable[ts.TokenClass.StringLiteral] = 'string.ts';

var jsBracketTypeTable = collections.createNumberDictionary<string>();
jsBracketTypeTable['('.charCodeAt(0)] = 'delimiter.parenthesis.js';
jsBracketTypeTable[')'.charCodeAt(0)] = 'delimiter.parenthesis.js';
jsBracketTypeTable['{'.charCodeAt(0)] = 'delimiter.bracket.js';
jsBracketTypeTable['}'.charCodeAt(0)] = 'delimiter.bracket.js';
jsBracketTypeTable['['.charCodeAt(0)] = 'delimiter.array.js';
jsBracketTypeTable[']'.charCodeAt(0)] = 'delimiter.array.js';

var jsTokenTypeTable = collections.createNumberDictionary<string>();
jsTokenTypeTable[ts.TokenClass.Identifier] = 'identifier.js';
jsTokenTypeTable[ts.TokenClass.Keyword] = 'keyword.js';
jsTokenTypeTable[ts.TokenClass.Operator] = 'delimiter.js';
jsTokenTypeTable[ts.TokenClass.Punctuation] = 'delimiter.js';
jsTokenTypeTable[ts.TokenClass.NumberLiteral] = 'number.js';
jsTokenTypeTable[ts.TokenClass.RegExpLiteral] = 'regexp.js';
jsTokenTypeTable[ts.TokenClass.StringLiteral] = 'string.js';


function checkSheBang(state: State, deltaOffset: number, line: string, appendFn: (startIndex: number, type: string) => void): boolean {
	if (line.indexOf('#!') === 0) {
		appendFn(deltaOffset, 'comment.shebang');
		return true;
	}
}
