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
var _TIC = '`'.charCodeAt(0);
var _DOT = '.'.charCodeAt(0);

var customTokenValue = scanner.TokenType.CustomToken;
export var Ellipsis: scanner.TokenType = customTokenValue++;

export class LessScanner extends scanner.Scanner {

	public scan(ignoreWhitespace:boolean=true): scanner.IToken {

		var result:scanner.IToken = {
			type: undefined,
			text: undefined,
			offset: this.stream.pos(),
			len: 0
		};

		// SingleLine Comments
		if (this.lessComment()) {
			if (!this.ignoreComment) {
				return this.finishToken(result, scanner.TokenType.SingleLineComment);
			} else {
				return this.scan(ignoreWhitespace);
			}
		}

		// LESS: escaped JavaScript code `var a = "dddd"`
		var tokenType = this.escapedJavaScript();
		if(tokenType !== null) {
			return this.finishToken(result, tokenType);
		}

		if(this.stream.advanceIfChars([_DOT, _DOT, _DOT])) {
			return this.finishToken(result, Ellipsis);
		}

		return super.scan(ignoreWhitespace);
	}

	private lessComment():boolean {
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

	private escapedJavaScript():scanner.TokenType {
		var ch = this.stream.peekChar();
		if(ch === _TIC) {
			this.stream.advance(1);
			this.stream.advanceWhileChar((ch) => { return ch !== _TIC; });
			return this.stream.advanceIfChar(_TIC) ? scanner.TokenType.EscapedJavaScript : scanner.TokenType.BadEscapedJavaScript;
		}
		return null;
	}
}