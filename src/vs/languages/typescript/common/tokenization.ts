/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

export enum Language {
	TypeScript,
	EcmaScript5
}

export function createTokenizationSupport2(language:Language):Modes.TokensProvider {

	var classifier = ts.createClassifier(),
		bracketTypeTable = language === Language.TypeScript ? tsBracketTypeTable : jsBracketTypeTable,
		tokenTypeTable = language === Language.TypeScript ? tsTokenTypeTable : jsTokenTypeTable;

	return {
		getInitialState: () => new State2(language, ts.EndOfLineState.None, false),
		tokenize: (line, state) => tokenize2(bracketTypeTable, tokenTypeTable, classifier, <State2> state, line)
	};
}

class State2 implements Modes.IState2 {

	public language: Language;
	public eolState: ts.EndOfLineState;
	public inJsDocComment: boolean;

	constructor(language:Language, eolState: ts.EndOfLineState, inJsDocComment: boolean) {
		this.language = language;
		this.eolState = eolState;
		this.inJsDocComment = inJsDocComment;
	}

	public clone(): State2 {
		return new State2(this.language, this.eolState, this.inJsDocComment);
	}

	public equals(other:Modes.IState2):boolean {
		if(other === this) {
			return true;
		}
		if(!other || !(other instanceof State2)) {
			return false;
		}
		if (this.eolState !== (<State2> other).eolState) {
			return false;
		}
		if(this.inJsDocComment !== (<State2> other).inJsDocComment) {
			return false;
		}
		return true;
	}
}

function tokenize2(bracketTypeTable: { [i: number]: string }, tokenTypeTable: { [i: number]: string },
	classifier: ts.Classifier, state: State2, text: string): Modes.ILineTokens2 {

	// Create result early and fill in tokens
	var ret = {
		tokens: <Modes.IToken2[]>[],
		endState: new State2(state.language, ts.EndOfLineState.None, false)
	};

	function appendFn(startIndex:number, type:string):void {
		if(ret.tokens.length === 0 || ret.tokens[ret.tokens.length - 1].scopes !== type) {
			ret.tokens.push({
				startIndex: startIndex,
				scopes: type
			});
		}
	}

	var isTypeScript = state.language === Language.TypeScript;

	// shebang statement, #! /bin/node
	if (!isTypeScript && checkSheBang(0, text, appendFn)) {
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
			appendFn(offset, type);

		} else if (entry.classification === ts.TokenClass.Comment) {
			// comments: check for JSDoc, block, and line comments
			if (ret.endState.inJsDocComment || /\/\*\*.*\*\//.test(text.substr(offset, entry.length))) {
				appendFn(offset, isTypeScript ? 'comment.doc.ts' : 'comment.doc.js');
			} else {
				appendFn(offset, isTypeScript ? 'comment.ts' : 'comment.js');
			}
		} else {
			// everything else
			appendFn(offset,
				tokenTypeTable[entry.classification] || '');
		}

		offset += entry.length;
	}

	return ret;
}

interface INumberStringDictionary {
	[idx: number]: string;
}

var tsBracketTypeTable:INumberStringDictionary = Object.create(null);
tsBracketTypeTable['('.charCodeAt(0)] = 'delimiter.parenthesis.ts';
tsBracketTypeTable[')'.charCodeAt(0)] = 'delimiter.parenthesis.ts';
tsBracketTypeTable['{'.charCodeAt(0)] = 'delimiter.bracket.ts';
tsBracketTypeTable['}'.charCodeAt(0)] = 'delimiter.bracket.ts';
tsBracketTypeTable['['.charCodeAt(0)] = 'delimiter.array.ts';
tsBracketTypeTable[']'.charCodeAt(0)] = 'delimiter.array.ts';

var tsTokenTypeTable:INumberStringDictionary = Object.create(null);
tsTokenTypeTable[ts.TokenClass.Identifier] = 'identifier.ts';
tsTokenTypeTable[ts.TokenClass.Keyword] = 'keyword.ts';
tsTokenTypeTable[ts.TokenClass.Operator] = 'delimiter.ts';
tsTokenTypeTable[ts.TokenClass.Punctuation] = 'delimiter.ts';
tsTokenTypeTable[ts.TokenClass.NumberLiteral] = 'number.ts';
tsTokenTypeTable[ts.TokenClass.RegExpLiteral] = 'regexp.ts';
tsTokenTypeTable[ts.TokenClass.StringLiteral] = 'string.ts';

var jsBracketTypeTable:INumberStringDictionary = Object.create(null);
jsBracketTypeTable['('.charCodeAt(0)] = 'delimiter.parenthesis.js';
jsBracketTypeTable[')'.charCodeAt(0)] = 'delimiter.parenthesis.js';
jsBracketTypeTable['{'.charCodeAt(0)] = 'delimiter.bracket.js';
jsBracketTypeTable['}'.charCodeAt(0)] = 'delimiter.bracket.js';
jsBracketTypeTable['['.charCodeAt(0)] = 'delimiter.array.js';
jsBracketTypeTable[']'.charCodeAt(0)] = 'delimiter.array.js';

var jsTokenTypeTable:INumberStringDictionary = Object.create(null);
jsTokenTypeTable[ts.TokenClass.Identifier] = 'identifier.js';
jsTokenTypeTable[ts.TokenClass.Keyword] = 'keyword.js';
jsTokenTypeTable[ts.TokenClass.Operator] = 'delimiter.js';
jsTokenTypeTable[ts.TokenClass.Punctuation] = 'delimiter.js';
jsTokenTypeTable[ts.TokenClass.NumberLiteral] = 'number.js';
jsTokenTypeTable[ts.TokenClass.RegExpLiteral] = 'regexp.js';
jsTokenTypeTable[ts.TokenClass.StringLiteral] = 'string.js';


function checkSheBang(deltaOffset: number, line: string, appendFn: (startIndex: number, type: string) => void): boolean {
	if (line.indexOf('#!') === 0) {
		appendFn(deltaOffset, 'comment.shebang');
		return true;
	}
}
