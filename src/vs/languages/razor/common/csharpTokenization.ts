/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import objects = require('vs/base/common/objects');
import Modes = require('vs/editor/common/modes');
import htmlMode = require('vs/languages/html/common/html');
import VSXML = require('vs/languages/razor/common/vsxml');
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {isDigit} from 'vs/editor/common/modes/abstractMode';
import razorTokenTypes = require('vs/languages/razor/common/razorTokenTypes');

var htmlTokenTypes = htmlMode.htmlTokenTypes;

var punctuations = '+-*%&|^~!=<>/?;:.,';
var separators = '+-*/%&|^~!=<>(){}[]\"\'\\/?;:.,';
var whitespace = '\t ';

var brackets = (function() {

	let bracketsSource = [
		{ tokenType:'punctuation.bracket.cs', open: '{', close: '}' },
		{ tokenType:'punctuation.array.cs', open: '[', close: ']' },
		{ tokenType:'punctuation.parenthesis.cs', open: '(', close: ')' }
	];

	let MAP: {
		[text:string]:{
			tokenType: string;
		}
	} = Object.create(null);

	for (let i = 0; i < bracketsSource.length; i++) {
		let bracket = bracketsSource[i];
		MAP[bracket.open] = {
			tokenType: bracket.tokenType,
		};
		MAP[bracket.close] = {
			tokenType: bracket.tokenType,
		};
	}

	return {
		stringIsBracket: (text:string): boolean => {
			return !!MAP[text];
		},
		tokenTypeFromString: (text:string): string => {
			return MAP[text].tokenType;
		}
	};
})();

var isKeyword = objects.createKeywordMatcher([
	'abstract', 'as', 'async', 'await', 'base', 'bool',
	'break', 'by', 'byte', 'case',
	'catch', 'char', 'checked', 'class',
	'const', 'continue', 'decimal', 'default',
	'delegate',	'do', 'double',	'descending',
	'explicit',	'event', 'extern', 'else',
	'enum',	'false', 'finally', 'fixed',
	'float', 'for', 'foreach', 'from',
	'goto',	'group', 'if', 'implicit',
	'in', 'int', 'interface', 'internal',
	'into', 'is', 'lock', 'long',
	'new', 'null', 'namespace', 'object',
	'operator', 'out', 'override', 'orderby',
	'params', 'private', 'protected', 'public',
	'readonly', 'ref', 'return', 'switch',
	'struct', 'sbyte', 'sealed', 'short',
	'sizeof', 'stackalloc', 'static', 'string',
	'select', 'this', 'throw', 'true',
	'try', 'typeof', 'uint', 'ulong',
	'unchecked', 'unsafe', 'ushort', 'using',
	'var', 'virtual', 'volatile', 'void',
	'while', 'where', 'yield',
	'model', 'inject' // Razor specific
]);

var ispunctuation = (character:string) => {
	return punctuations.indexOf(character) > -1;
};

export class CSState extends AbstractState {

	public name:string;
	public parent:AbstractState;

	constructor(mode:Modes.IMode, name:string, parent:AbstractState) {
		super(mode);
		this.name = name;
		this.parent = parent;
	}

	public equals(other:Modes.IState):boolean {
		if (!super.equals(other)) {
			return false;
		}
		var otherCSState:CSState = <CSState>other;
		return (other instanceof CSState) && (this.getMode() === otherCSState.getMode()) && (this.name === otherCSState.name) && ((this.parent === null && otherCSState.parent === null) || (this.parent !== null && this.parent.equals(otherCSState.parent)));
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		stream.setTokenRules(separators, whitespace);
		if (stream.skipWhitespace().length > 0) {
			return { type: '' };
		}
		return this.stateTokenize(stream);
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		throw new Error('To be implemented');
	}
}

class CSString extends CSState {

	private isAtBeginning:boolean;
	private punctuation:string;

	constructor(mode:Modes.IMode, parent:AbstractState, punctuation:string) {
		super(mode, 'string', parent);
		this.isAtBeginning = true;
		this.punctuation = punctuation;
	}

	public makeClone():CSString {
		return new CSString(this.getMode(), this.parent ? <AbstractState>this.parent.clone() : null, this.punctuation);
	}

	public equals(other:CSString):boolean {
		return super.equals(other) && this.punctuation === other.punctuation;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		var readChars = this.isAtBeginning ? 1 : 0;
		this.isAtBeginning = false;
		while (!stream.eos()) {
			var c = stream.next();
			if (c === '\\') {
				if (readChars === 0) {
					if (stream.eos()) {
						return { type: 'string.escape.cs' };
					} else {
						stream.next();
						if (stream.eos()) {
							return { type: 'string.escape.cs', nextState: this.parent };
						} else {
							return { type: 'string.escape.cs' };
						}
					}
				} else {
					stream.goBack(1);
					return { type: 'string.cs' };
				}
			} else if (c === this.punctuation) {
				break;
			}
			readChars += 1;
		}
		return { type: 'string.cs', nextState: this.parent };
	}
}

class CSVerbatimString extends CSState {

	constructor(mode:Modes.IMode, parent:AbstractState) {
		super(mode, 'verbatimstring', parent);
	}

	public makeClone():CSVerbatimString {
		return new CSVerbatimString(this.getMode(), this.parent ? <AbstractState>this.parent.clone() : null);
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		while (!stream.eos()) {
			var token = stream.next();
			if (token === '"') {
				if (!stream.eos() && stream.peek() === '"') {
					stream.next();
				} else {
					return { type: 'string.cs', nextState: this.parent };
				}
			}
		}
		return { type: 'string.cs' };
	}
}

class CSNumber extends CSState {
	private firstDigit:string;

	constructor(mode:Modes.IMode, parent:AbstractState, firstDigit:string) {
		super(mode, 'number', parent);
		this.firstDigit = firstDigit;
	}

	public makeClone():CSNumber {
		return new CSNumber(this.getMode(), this.parent ? <AbstractState>this.parent.clone() : null, this.firstDigit);
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		var character = this.firstDigit;
		var base = 10, isDecimal = false, isExponent = false;
		if (character === '0' && !stream.eos()) {
			character = stream.peek();
			if (character === 'x') {
				base = 16;
			} else if (character === '.') {
				base = 10;
			} else {
				return { type: 'number.cs', nextState: this.parent };
			}
			stream.next();
		}
		while (!stream.eos()) {
			character = stream.peek();
			if (isDigit(character, base)) {
				stream.next();
			} else if (base === 10) {
				if (character === '.' && !isExponent && !isDecimal) {
					isDecimal = true;
					stream.next();
				} else if (character.toLowerCase() === 'e' && !isExponent) {
					isExponent = true;
					stream.next();
					if (!stream.eos() && stream.peek() === '-') {
						stream.next();
					}
				} else if (character.toLowerCase() === 'f' || character.toLowerCase() === 'd') {
					stream.next();
					break;
				} else {
					break;
				}
			} else {
				break;
			}
		}
		var tokenType = 'number';
		if (base === 16) {
			tokenType += '.hex';
		}
		return { type: tokenType + '.cs', nextState: this.parent };
	}
}

// the multi line comment
export class CSComment extends CSState {
	private commentChar:string;

	constructor(mode:Modes.IMode, parent:AbstractState, commentChar:string) {
		super(mode, 'comment', parent);
		this.commentChar = commentChar;
	}

	public makeClone():CSComment {
		return new CSComment(this.getMode(), this.parent ? <AbstractState>this.parent.clone() : null, this.commentChar);
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		while (!stream.eos()) {
			var token = stream.next();
			if (token === '*' && !stream.eos() && !stream.peekWhitespace() && stream.peek() === this.commentChar) {
				stream.next();
				return { type: 'comment.cs', nextState: this.parent};
			}
		}
		return { type: 'comment.cs' };
	}
}

export class CSStatement extends CSState implements VSXML.IVSXMLWrapperState {
	private level:number;
	private plevel:number;
	private razorMode:boolean;
	private expression:boolean;
	private vsState: VSXML.VSXMLState;
	private firstToken: boolean;
	private firstTokenWasKeyword: boolean;

	constructor(mode: Modes.IMode, parent: AbstractState, level: number, plevel: number, razorMode: boolean,
				expression: boolean, firstToken: boolean, firstTokenWasKeyword: boolean) {
		super(mode, 'expression', parent);
		this.level = level;
		this.plevel = plevel;
		this.razorMode = razorMode;
		this.expression = expression;
		this.vsState = new VSXML.VSXMLExpression(mode, null);
		this.firstToken = firstToken;
		this.firstTokenWasKeyword = firstTokenWasKeyword;
	}

	public setVSXMLState(newVSState:VSXML.VSXMLState):void {
		this.vsState = newVSState;
	}

	public makeClone():CSStatement {
		var st = new CSStatement(this.getMode(), this.parent ? <AbstractState>this.parent.clone() : null, this.level,
			this.plevel, this.razorMode, this.expression, this.firstToken, this.firstTokenWasKeyword);
		if (this.vsState !== null) {
			st.setVSXMLState(<VSXML.VSXMLState>this.vsState.clone());
		}
		return st;
	}

	public equals(other:Modes.IState):boolean {
		return super.equals(other) &&
				(other instanceof CSStatement) &&
				((this.vsState === null && (<CSStatement>other).vsState === null) ||
				(this.vsState !== null && this.vsState.equals((<CSStatement>other).vsState)));
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {

		if (isDigit(stream.peek(), 10)) {
			this.firstToken = false;
			return { nextState: new CSNumber(this.getMode(), this, stream.next()) };
		}

		var token = stream.nextToken();
		var acceptNestedModes = !this.firstTokenWasKeyword;
		var nextStateAtEnd = (this.level <= 0 && this.plevel <= 0 && stream.eos()  ? this.parent : undefined);

		if (stream.eos()) {
			this.firstTokenWasKeyword = false; // Set this for the state starting on the next line.
		}

		if (isKeyword(token)) {
			if (this.level <= 0) {	// if we find a keyword outside of a block, we know that we are outside of an expression
				this.expression = false;
			}
			if (this.firstToken) {
				this.firstTokenWasKeyword = true;
			}
			return { type: 'keyword.cs' };
		}

		this.firstToken = false;

		if (this.razorMode && token === '<' && acceptNestedModes) {
			if (!stream.eos() && /[_:!\/\w]/.test(stream.peek())) {
				return { nextState: new CSSimpleHTML(this.getMode(), this, htmlMode.States.Content) };
			}
		}

		// exit expressions on anything that doesn't look like part of the same expression
		if (this.razorMode && this.expression && this.level <= 0 && this.plevel <= 0&& !stream.eos()) {
			if (!/^(\.|\[|\(|\{\w+)$/.test(stream.peekToken())) {
				nextStateAtEnd = this.parent;
			}
		}

		if (token === '/') {
			if (!stream.eos() && !stream.peekWhitespace()) {
				switch(stream.peekToken()) {
					case '/':
						stream.nextToken();
						if (!stream.eos() && stream.peekToken() === '/') {
							stream.nextToken();
							if (stream.eos()) {
								return {
									type: 'comment.vs'
								};
							}
							if (stream.peekToken() !== '/') {
								return {
									type: 'comment.vs',
									nextState: new VSXML.VSXMLEmbeddedState(this.getMode(), this.vsState, this)
								};
							}
						}
						stream.advanceToEOS();
						return { type: 'comment.cs' };
					case '*':
						stream.nextToken();
						return { nextState: new CSComment(this.getMode(), this, '/') };
				}
			}
			return { type: 'punctuation.cs', nextState: nextStateAtEnd };
		}
		if (token === '@') {	// a verbatim string (or a razor construct)
			if (!stream.eos()) {
				switch(stream.peekToken()) {
				case '"':
					stream.nextToken();
					return { nextState: new CSVerbatimString(this.getMode(), this) };
				case '*':
					stream.nextToken();
					return { nextState: new CSComment(this.getMode(), this, '@') };
				}
			}
		}
		if (/@?\w+/.test(token)) {
			return { type: 'ident.cs', nextState: nextStateAtEnd };
		}

		if (token === '"' || token === '\'') { // string or character
			return { nextState: new CSString(this.getMode(), this, token) };
		}
		if (brackets.stringIsBracket(token)) {

			var tr: Modes.ITokenizationResult = {
				type: brackets.tokenTypeFromString(token),
				nextState: nextStateAtEnd
			};

			if (this.razorMode) {
				if (token === '{') {
					this.expression = false;	// whenever we enter a block, we exit expression mode
					this.level++;
					if (this.level === 1) {
						tr.type = razorTokenTypes.EMBED_CS;
						tr.nextState = undefined;
					}
				}
				if (token === '}') {
					this.level--;
					if (this.level <= 0) {
						tr.type = razorTokenTypes.EMBED_CS;
						tr.nextState = this.parent;
					}
				}
				if (this.expression) {
					if (token === '(') {
						this.plevel++;
						if (this.plevel === 1) {
							tr.type = razorTokenTypes.EMBED_CS;
							tr.nextState = undefined;
						}
					}
					if (token === ')') {
						this.plevel--;
						if (this.expression && this.plevel <= 0) {	// we only leave csharp mode if we are in expression mode
							tr.type = razorTokenTypes.EMBED_CS;
							tr.nextState = this.parent;
						}
					}
					if (token === '[') {
						this.plevel++;
						tr.nextState = undefined;
					}
					if (token === ']') {
						this.plevel--;
					}
				}
			}
			return tr;
		}

		if (ispunctuation(token)) {
			return { type: 'punctuation.cs', nextState: nextStateAtEnd };
		}

		if (this.razorMode && this.expression && this.plevel <= 0) {	// in razor mode exit on non-keywords in expressions
			return { type: '', nextState: this.parent };
		}

		return { type: '', nextState: nextStateAtEnd };
	}
}

// this state always returns to parent state if it leaves a html tag
class CSSimpleHTML extends CSState {
	private state:htmlMode.States;

	constructor(mode:Modes.IMode, parent:AbstractState, state:htmlMode.States) {
		super(mode, 'number', parent);
		this.state = state;
	}

	public makeClone():CSSimpleHTML {
		return new CSSimpleHTML(this.getMode(), this.parent ? <AbstractState>this.parent.clone() : null, this.state);
	}

	private nextName(stream:Modes.IStream):string {
		return stream.advanceIfRegExp(/^[_:\w][_:\w-.\d]*/);
	}

	private nextAttrValue(stream:Modes.IStream):string {
		return stream.advanceIfRegExp(/^('|').*?\1/);
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {

		switch (this.state) {

			case htmlMode.States.WithinComment:
				if (stream.advanceUntil('-->', false).length > 0) {
					return { type: htmlTokenTypes.COMMENT};
				}
				if (stream.advanceIfString('-->').length > 0) {
					this.state = htmlMode.States.Content;
					return { type: htmlTokenTypes.DELIM_COMMENT, nextState: this.parent };
				}
				break;

			case htmlMode.States.WithinDoctype:
				if (stream.advanceUntil('>', false).length > 0) {
					return { type: htmlTokenTypes.DOCTYPE };
				}
				if (stream.advanceIfString('>').length > 0) {
					this.state = htmlMode.States.Content;
					return { type: htmlTokenTypes.DELIM_DOCTYPE, nextState: this.parent };
				}
				break;

			case htmlMode.States.Content:
				if (stream.advanceIfString('!--').length > 0){
					this.state = htmlMode.States.WithinComment;
					return { type: htmlTokenTypes.DELIM_COMMENT };
				}
				if (stream.advanceIfRegExp(/!DOCTYPE/i).length > 0) {
					this.state = htmlMode.States.WithinDoctype;
					return { type: htmlTokenTypes.DELIM_DOCTYPE };
				}
				if (stream.advanceIfString('/').length > 0){
					this.state = htmlMode.States.OpeningEndTag;
					return { type: htmlTokenTypes.DELIM_END };
				}
				this.state = htmlMode.States.OpeningStartTag;
				return { type: htmlTokenTypes.DELIM_START };

			case htmlMode.States.OpeningEndTag: {
				let tagName = this.nextName(stream);
				if (tagName.length > 0) {
					return {
						type: htmlTokenTypes.getTag(tagName)
					};
				}
				if (stream.advanceIfString('>').length > 0) {
					this.state = htmlMode.States.Content;
					return { type: htmlTokenTypes.DELIM_END, nextState: this.parent };
				}
				stream.advanceUntil('>', false);
				return { type: '' };
			}

			case htmlMode.States.OpeningStartTag: {
				let tagName = this.nextName(stream);
				if (tagName.length > 0) {
					this.state = htmlMode.States.WithinTag;
					return {
						type: htmlTokenTypes.getTag(tagName)
					};
				}
				break;
			}

			case htmlMode.States.WithinTag:
				if (stream.skipWhitespace().length > 0) {
					return { type: '' };
				}
				var name:string = this.nextName(stream);
				if (name.length > 0) {
					this.state = htmlMode.States.AttributeName;
					return { type: htmlTokenTypes.ATTRIB_NAME };
				}
				if (stream.advanceIfRegExp(/^\/?>/).length > 0) {
					this.state = htmlMode.States.Content;
					return { type: htmlTokenTypes.DELIM_START, nextState: this.parent };
				}
				stream.next();
				return { type: '' };

			case htmlMode.States.AttributeName:
				if (stream.skipWhitespace().length > 0 || stream.eos()) {
					return { type: '' };
				}
				if (stream.peek() === '=') {
					stream.next();
					this.state = htmlMode.States.AttributeValue;
					return { type: '' };
				}
				this.state = htmlMode.States.WithinTag;
				return this.tokenize(stream); // no advance yet - jump to WithinTag

			case htmlMode.States.AttributeValue:
				if (stream.skipWhitespace().length > 0 || stream.eos()) {
					return { type: '' };
				}
				var value = this.nextAttrValue(stream);
				if (value.length > 0) {
					this.state = htmlMode.States.WithinTag;
					return { type: htmlTokenTypes.ATTRIB_VALUE };
				}
				this.state = htmlMode.States.WithinTag;
				return this.tokenize(stream); // no advance yet - jump to WithinTag
		}
		stream.next();
		this.state = htmlMode.States.Content;
		return { type: '', nextState: this.parent };
	}
}