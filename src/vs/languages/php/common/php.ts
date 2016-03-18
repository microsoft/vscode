/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import objects = require('vs/base/common/objects');
import Modes = require('vs/editor/common/modes');
import {AbstractMode, isDigit, createWordRegExp} from 'vs/editor/common/modes/abstractMode';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {IModeService} from 'vs/editor/common/services/modeService';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {TokenizationSupport, ILeavingNestedModeData, ITokenizationCustomization} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {TextualSuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';


var brackets = (function() {

	let bracketsSource = [
		{ tokenType:'delimiter.bracket.php', open: '{', close: '}' },
		{ tokenType:'delimiter.array.php', open: '[', close: ']' },
		{ tokenType:'delimiter.parenthesis.php', open: '(', close: ')' }
	];

	let MAP: {
		[text:string]:{
			tokenType: string;
		}
	} = Object.create(null);

	for (let i = 0; i < bracketsSource.length; i++) {
		let bracket = bracketsSource[i];
		MAP[bracket.open] = {
			tokenType: bracket.tokenType
		};
		MAP[bracket.close] = {
			tokenType: bracket.tokenType
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

var delimiters = '+-*%&|^~!=<>(){}[]/?;:.,@';
var separators = '+-*/%&|^~!=<>(){}[]"\'\\/?;:.,#';

var whitespace = '\t ';

var isKeyword = objects.createKeywordMatcher([
	'abstract', 'and', 'array', 'as', 'break',
	'callable', 'case', 'catch', 'cfunction', 'class', 'clone',
	'const', 'continue', 'declare', 'default', 'do',
	'else', 'elseif', 'enddeclare', 'endfor', 'endforeach',
	'endif', 'endswitch', 'endwhile', 'extends', 'false', 'final',
	'for', 'foreach', 'function', 'global', 'goto',
	'if', 'implements', 'interface', 'instanceof', 'insteadof',
	'namespace', 'new', 'null', 'object', 'old_function', 'or', 'private',
	'protected', 'public', 'resource', 'static', 'switch', 'throw', 'trait',
	'try', 'true', 'use', 'var', 'while', 'xor',
	'die', 'echo', 'empty', 'exit', 'eval',
	'include', 'include_once', 'isset', 'list', 'require',
	'require_once', 'return', 'print', 'unset', 'yield',
	'__construct'
]);

var isCompileTimeConstant = objects.createKeywordMatcher([
	'__CLASS__',
	'__DIR__',
	'__FILE__',
	'__LINE__',
	'__NAMESPACE__',
	'__METHOD__',
	'__FUNCTION__',
	'__TRAIT__'
]);

var isPreDefinedVariable =  objects.createKeywordMatcher([
	'$GLOBALS',
	'$_SERVER',
	'$_GET',
	'$_POST',
	'$_FILES',
	'$_REQUEST',
	'$_SESSION',
	'$_ENV',
	'$_COOKIE',
	'$php_errormsg',
	'$HTTP_RAW_POST_DATA',
	'$http_response_header',
	'$argc',
	'$argv'
]);

var isDelimiter = (character:string) => {
	return delimiters.indexOf(character) > -1;
};

var isVariable = (character:string) => {
	return (character[0] === '$');
};

export class PHPState extends AbstractState {

	private name:string;
	private whitespaceTokenType:string;
	public parent:Modes.IState;

	constructor(mode:Modes.IMode, name:string, parent:Modes.IState, whitespaceTokenType:string='') {
		super(mode);
		this.name = name;
		this.parent = parent;
		this.whitespaceTokenType = whitespaceTokenType;
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPState) {
			return (
				super.equals(other) &&
				this.name === other.name &&
				this.whitespaceTokenType === other.whitespaceTokenType &&
				AbstractState.safeEquals(this.parent, other.parent)
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		stream.setTokenRules(separators, whitespace);
		if (stream.skipWhitespace().length > 0) {
			return { type: this.whitespaceTokenType };
		}
		return this.stateTokenize(stream);
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		throw new Error('To be implemented');
	}

}

export class PHPString extends PHPState {

	private delimiter:string;
	private isAtBeginning:boolean;

	constructor(mode:Modes.IMode, parent:Modes.IState, delimiter:string, isAtBeginning:boolean=true) {
		super(mode, 'string', parent, 'string.php');
		this.delimiter = delimiter;
		this.isAtBeginning = isAtBeginning;
	}

	public makeClone():AbstractState {
		return new PHPString(this.getMode(), AbstractState.safeClone(this.parent), this.delimiter, this.isAtBeginning);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPString) {
			return (
				super.equals(other) &&
				this.delimiter === other.delimiter &&
				this.isAtBeginning === other.isAtBeginning
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		var readChars = this.isAtBeginning ? 1 : 0;
		this.isAtBeginning = false;
		while (!stream.eos()) {
			var c = stream.next();
			if (c === '\\') {
				if (readChars === 0) {
					if (stream.eos()) {
						return { type: 'string.php', nextState: this.parent  };
					} else {
						stream.next();
					}
				} else {
					stream.goBack(1);
					return { type: 'string.php' };
				}

			} else if (c === this.delimiter) {
				return { type: 'string.php' , nextState: this.parent };
			}
			readChars += 1;
		}
		return { type: 'string.php' };
	}
}

export class PHPNumber extends PHPState {

	private firstDigit:string;

	constructor(mode:Modes.IMode, parent:Modes.IState, firstDigit:string) {
		super(mode, 'number', parent);
		this.firstDigit = firstDigit;
	}

	public makeClone():AbstractState {
		return new PHPNumber(this.getMode(), AbstractState.safeClone(this.parent), this.firstDigit);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPNumber) {
			return (
				super.equals(other) &&
				this.firstDigit === other.firstDigit
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		var character = this.firstDigit;
		var base = 10, isDecimal = false, isExponent = false;
		if (character === '0' && !stream.eos()) {
			character = stream.peek();
			if (character.toLowerCase() === 'x') { base = 16; }
			else if (character.toLowerCase() === 'b') { base = 2; }
			else if (character === '.') { base = 10; }
			else if (isDigit(character, 8)) { base = 8; }
			else {
				return { type: 'number.php', nextState: this.parent };
			}
			stream.next();
		}
		while (!stream.eos()) {
			character = stream.peek();
			if (isDigit(character,base)) {
				stream.next();
			} else if (base === 10) {
				if (character === '.' && !isExponent && !isDecimal) {
					isDecimal = true;
					stream.next();
				} else if (character === 'e' && !isExponent) {
					isExponent = true;
					stream.next();
					if (!stream.eos() && stream.peek() === '-') {
						stream.next();
					}
				} else {
					break;
				}
			} else if (base === 8 && isDigit(character,10)) {
				base = 10;
				stream.next();
			} else {
				break;
			}
		}
		var tokenType = 'number';
		if (base === 16) {
			tokenType += '.hex';
		} else if (base === 8) {
			tokenType += '.octal';
		} else if (base === 2) {
			tokenType += '.binary';
		}
		return { type: tokenType + '.php', nextState: this.parent };
	}
}

export class PHPLineComment extends PHPState {

	constructor(mode:Modes.IMode, parent:Modes.IState) {
		super(mode, 'comment', parent, 'comment.php');
	}

	public makeClone():AbstractState {
		return new PHPDocComment(this.getMode(), AbstractState.safeClone(this.parent));
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPLineComment) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		while (!stream.eos()) {
			var token = stream.next();
			if (token === '?' && !stream.eos() && stream.peek() === '>') {
				stream.goBack(1);
				return { type: 'comment.php', nextState: this.parent};
			}
		}
		return { type: 'comment.php', nextState: this.parent };
	}
}

export class PHPDocComment extends PHPState {

	constructor(mode:Modes.IMode, parent:Modes.IState) {
		super(mode, 'comment', parent, 'comment.php');
	}

	public makeClone():AbstractState {
		return new PHPDocComment(this.getMode(), AbstractState.safeClone(this.parent));
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPDocComment) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		while (!stream.eos()) {
			var token = stream.next();
			if (token === '*' && !stream.eos() && !stream.peekWhitespace() && stream.peek() === '/') {
				stream.next();
				return { type: 'comment.php', nextState: this.parent};
			}
		}
		return { type: 'comment.php' };
	}
}

export class PHPStatement extends PHPState {

	constructor(mode:Modes.IMode, parent:Modes.IState) {
		super(mode, 'expression', parent);
	}

	public makeClone():AbstractState {
		return new PHPStatement(this.getMode(), AbstractState.safeClone(this.parent));
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPStatement) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		if (isDigit(stream.peek(), 10)) {
			return { nextState: new PHPNumber(this.getMode(), this, stream.next()) };
		}
		if (stream.advanceIfString('?>').length) {
			return { type: 'metatag.php', nextState: this.parent };
		}

		var token = stream.nextToken();
		if (isKeyword(token.toString().toLowerCase())) {
			return { type: 'keyword.php' };
		} else if (isCompileTimeConstant(token)) {
			return { type: 'constant.php' };
		} else if (isPreDefinedVariable(token)) {
			return { type: 'variable.predefined.php' };
		} else if (isVariable(token)) {
			return { type: 'variable.php' };
		} else if (token === '/') {
			if (!stream.eos() && !stream.peekWhitespace()) {
				switch(stream.peekToken()) {
					case '/':
						return { nextState: new PHPLineComment(this.getMode(), this) };
					case '*':
						stream.nextToken();
						return { nextState: new PHPDocComment(this.getMode(), this) };
				}
			}
		} else if (token === '#') {
			return { nextState: new PHPLineComment(this.getMode(), this) };
		} else if (token === '"' || token === '\'') {
			return { nextState: new PHPString(this.getMode(), this, token) };
		} else if (brackets.stringIsBracket(token)) {
			return {
				type: brackets.tokenTypeFromString(token)
			};
		} else if (isDelimiter(token)) {
			return { type: 'delimiter.php' };
		}
		return { type: '' };
	}
}

export class PHPPlain extends PHPState {

	constructor(mode:Modes.IMode, parent:Modes.IState) {
		super(mode, 'plain', parent);
	}

	public makeClone():AbstractState {
		return new PHPPlain(this.getMode(), AbstractState.safeClone(this.parent));
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPPlain) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		if (stream.advanceIfStringCaseInsensitive('<?php').length ||
		stream.advanceIfString('<?=').length || stream.advanceIfString('<%=').length ||
		stream.advanceIfString('<?').length || stream.advanceIfString('<%').length) {
			return {
				type: 'metatag.php',
				nextState: new PHPStatement(this.getMode(), new PHPEnterHTMLState(this.getMode(), this.parent))
			};
		}
		stream.next();
		return { type: '' };
	}
}

export class PHPEnterHTMLState extends PHPState {

	constructor(mode:Modes.IMode, parent:Modes.IState) {
		super(mode, 'enterHTML', parent);
	}

	public makeClone():AbstractState {
		return new PHPEnterHTMLState(this.getMode(), AbstractState.safeClone(this.parent));
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof PHPEnterHTMLState) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

}

export class PHPMode extends AbstractMode implements ITokenizationCustomization {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;
	public suggestSupport:Modes.ISuggestSupport;

	private modeService:IModeService;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IModeService modeService: IModeService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id);
		this.modeService = modeService;

		this.tokenizationSupport = new TokenizationSupport(this, this, true, false);

		this.richEditSupport = new RichEditSupport(this.getId(), null, {
			wordPattern: createWordRegExp('$_'),

			comments: {
				lineComment: '//',
				blockComment: ['/*', '*/']
			},

			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}', notIn: ['string.php'] },
					{ open: '[', close: ']', notIn: ['string.php'] },
					{ open: '(', close: ')', notIn: ['string.php'] },
					{ open: '"', close: '"', notIn: ['string.php'] },
					{ open: '\'', close: '\'', notIn: ['string.php'] }
				]
			}
		});

		if (editorWorkerService) {
			this.suggestSupport = new TextualSuggestSupport(this.getId(), editorWorkerService);
		}
	}

	public asyncCtor(): WinJS.Promise {
		return this.modeService.getOrCreateMode('text/html');
	}

	public getInitialState():Modes.IState {
		// Because AbstractMode doesn't allow the initial state to immediately enter a nested
		// mode, we will enter a nested mode ourselves
		var htmlMode = this.modeService.getMode('text/html');
		var htmlState:Modes.IState = htmlMode.tokenizationSupport.getInitialState();
		htmlState.setStateData(new PHPEnterHTMLState(this, null));
		return htmlState;
	}

	public enterNestedMode(state:Modes.IState):boolean {
		return state instanceof PHPEnterHTMLState;
	}

	public getNestedModeInitialState(myState:Modes.IState): { state:Modes.IState; missingModePromise:WinJS.Promise; } {
		// Recall previous HTML state, that was saved in .parent, and carried over by the PHP states
		// Also, prevent a .clone() endless loop by clearing the .parent pointer
		// (the result will have its stateData point to myState)
		var result = (<PHPState>myState).parent;
		(<PHPState>myState).parent = null;
		return {
			state: result,
			missingModePromise: null
		};
	}

	public getLeavingNestedModeData(line:string, state:Modes.IState):ILeavingNestedModeData {
		// Leave HTML if <? is found on a line
		var match:any = /<\?/i.exec(line);
		if (match !== null) {
			return {
				nestedModeBuffer: line.substring(0, match.index),
				bufferAfterNestedMode: line.substring(match.index),
				stateAfterNestedMode: new PHPPlain(this, null)
			};
		}
		return null;
	}

	public onReturningFromNestedMode(myStateAfterNestedMode:Modes.IState, lastNestedModeState:Modes.IState): void {
		// Record in .parent the last HTML state before we entered into PHP
		// The PHP states will take care of passing .parent along
		// such that when we enter HTML again, we can recover the HTML state from .parent
		(<PHPPlain>myStateAfterNestedMode).parent = lastNestedModeState;
	}
}
