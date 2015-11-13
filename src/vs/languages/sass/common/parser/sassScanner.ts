/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import scanner = require('vs/languages/css/common/parser/cssScanner');

var _FSL = '/'.charCodeAt(0);
var _NWL = '\n'.charCodeAt(0);
var _CAR = '\r'.charCodeAt(0);
var _LFD = '\f'.charCodeAt(0);

var _DLR = '$'.charCodeAt(0);
var _HSH = '#'.charCodeAt(0);
var _CUL = '{'.charCodeAt(0);
var _EQS = '='.charCodeAt(0);
var _BNG = '!'.charCodeAt(0);
var _LAN = '<'.charCodeAt(0);
var _RAN = '>'.charCodeAt(0);
var _DOT = '.'.charCodeAt(0);

var customTokenValue = scanner.TokenType.CustomToken;

export var VariableName = customTokenValue++;
export var InterpolationFunction: scanner.TokenType = customTokenValue++;
export var Default: scanner.TokenType = customTokenValue++;
export var EqualsOperator: scanner.TokenType = customTokenValue++;
export var NotEqualsOperator: scanner.TokenType = customTokenValue++;
export var GreaterEqualsOperator: scanner.TokenType = customTokenValue++;
export var SmallerEqualsOperator: scanner.TokenType = customTokenValue++;
export var Ellipsis: scanner.TokenType = customTokenValue++;

export class SassScanner extends scanner.Scanner {

	public scan(ignoreWhitespace:boolean=true): scanner.IToken {

		var result:scanner.IToken = {
			type: undefined,
			text: undefined,
			offset: this.stream.pos(),
			len: 0
		};

		// SingleLine Comments
		if (this.sassComment()) {
			if (!this.ignoreComment) {
				return this.finishToken(result, scanner.TokenType.SingleLineComment);
			} else {
				return this.scan(ignoreWhitespace);
			}
		}

		// sass variable
		if (this.stream.advanceIfChar(_DLR)) {
			var content = [ '$' ];
			if (this.ident(content)) {
				return this.finishToken(result, VariableName, content.join(''));
			} else {
				this.stream.goBackTo(result.offset);
			}
		}

		// Sass: interpolation function #{..})
		if (this.stream.advanceIfChars([_HSH, _CUL])) {
			return this.finishToken(result, InterpolationFunction);
		}

		// operator ==
		if (this.stream.advanceIfChars([_EQS, _EQS])) {
			return this.finishToken(result, EqualsOperator);
		}

		// operator !=
		if (this.stream.advanceIfChars([_BNG, _EQS])) {
			return this.finishToken(result, NotEqualsOperator);
		}

		// operators <, <=
		if (this.stream.advanceIfChar(_LAN)) {
			if (this.stream.advanceIfChar(_EQS)) {
				return this.finishToken(result, SmallerEqualsOperator);
			}
			return this.finishToken(result, scanner.TokenType.Delim);
		}

		// ooperators >, >=
		if (this.stream.advanceIfChar(_RAN)) {
			if (this.stream.advanceIfChar(_EQS)) {
				return this.finishToken(result, GreaterEqualsOperator);
			}
			return this.finishToken(result, scanner.TokenType.Delim);
		}

		// ellipis
		if (this.stream.advanceIfChars([_DOT, _DOT, _DOT])) {
			return this.finishToken(result, Ellipsis);
		}

		return super.scan(ignoreWhitespace);
	}

	private sassComment():boolean {
		if (this.stream.advanceIfChars([_FSL, _FSL])) {
			this.stream.advanceWhileChar((ch:number) => {
				switch(ch) {
					case _NWL:
					case _CAR:
					case _LFD:
						return false;
					default:
						return true;
				}
			});
			return true;
		} else {
			return false;
		}
	}
}