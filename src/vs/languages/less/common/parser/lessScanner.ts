/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import scanner = require('vs/languages/css/common/parser/cssScanner');

const _FSL = '/'.charCodeAt(0);
const _NWL = '\n'.charCodeAt(0);
const _CAR = '\r'.charCodeAt(0);
const _LFD = '\f'.charCodeAt(0);
const _TIC = '`'.charCodeAt(0);
const _DOT = '.'.charCodeAt(0);

let customTokenValue = scanner.TokenType.CustomToken;
export const Ellipsis: scanner.TokenType = customTokenValue++;

export class LessScanner extends scanner.Scanner {

	public scan(): scanner.IToken {

		let triviaToken = this.trivia();
		if (triviaToken !== null) {
			return triviaToken;
		}

		let offset = this.stream.pos();

		// LESS: escaped JavaScript code `let a = "dddd"`
		let tokenType = this.escapedJavaScript();
		if (tokenType !== null) {
			return this.finishToken(offset, tokenType);
		}

		if (this.stream.advanceIfChars([_DOT, _DOT, _DOT])) {
			return this.finishToken(offset, Ellipsis);
		}

		return super.scan();
	}

	protected comment():boolean {
		if (super.comment()) {
			return true;
		}
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
		let ch = this.stream.peekChar();
		if (ch === _TIC) {
			this.stream.advance(1);
			this.stream.advanceWhileChar((ch) => { return ch !== _TIC; });
			return this.stream.advanceIfChar(_TIC) ? scanner.TokenType.EscapedJavaScript : scanner.TokenType.BadEscapedJavaScript;
		}
		return null;
	}
}