/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ICodeSnippet } from './snippet';
import { CharCode } from 'vs/base/common/charCode';

export enum TokenType {
	Dollar,
	Colon,
	CurlyOpen,
	CurlyClose,
	DoubleCurlyOpen,
	DoubleCurlyClose,
	Backslash,
	Int,
	VariableName,
	Format,
	EOF
}

export interface Token {
	type: TokenType;
	pos: number;
	len: number;
}


export class Scanner {

	private static _table: { [ch: number]: TokenType } = {
		[CharCode.DollarSign]: TokenType.Dollar,
		[CharCode.Colon]: TokenType.Colon,
		[CharCode.OpenCurlyBrace]: TokenType.CurlyOpen,
		[CharCode.CloseCurlyBrace]: TokenType.CurlyClose,
		[CharCode.Backslash]: TokenType.Backslash,
	};

	static isDigitCharacter(ch: number): boolean {
		return ch >= CharCode.Digit0 && ch <= CharCode.Digit9;
	}

	static isVariableCharacter(ch: number): boolean {
		return ch === CharCode.Underline
			|| (ch >= CharCode.a && ch <= CharCode.z)
			|| (ch >= CharCode.A && ch <= CharCode.Z);
	}

	value: string;
	pos: number;

	constructor() {
		this.text('');
	}

	text(value: string) {
		this.value = value;
		this.pos = 0;
	}

	tokenText(token: Token): string {
		return this.value.substr(token.pos, token.len);
	}

	next(): Token {

		if (this.pos >= this.value.length) {
			return { type: TokenType.EOF, pos: this.pos, len: 0 };
		}

		let pos = this.pos;
		let len = 0;
		let ch = this.value.charCodeAt(pos);
		let type: TokenType;

		// static types
		type = Scanner._table[ch];
		if (typeof type === 'number') {

			if (type === TokenType.CurlyOpen && this.value.charCodeAt(pos + 1) === CharCode.OpenCurlyBrace) {
				this.pos += 2;
				return { type: TokenType.DoubleCurlyOpen, pos, len: 2 };
			} else if (type === TokenType.CurlyClose && this.value.charCodeAt(pos + 1) === CharCode.CloseCurlyBrace) {
				this.pos += 2;
				return { type: TokenType.DoubleCurlyClose, pos, len: 2 };

			} else {
				this.pos += 1;
				return { type, pos, len: 1 };
			}
		}

		// number
		if (Scanner.isDigitCharacter(ch)) {
			type = TokenType.Int;
			do {
				len += 1;
				ch = this.value.charCodeAt(pos + len);
			} while (Scanner.isDigitCharacter(ch));

			this.pos += len;
			return { type, pos, len };
		}

		// variable name
		if (Scanner.isVariableCharacter(ch)) {
			type = TokenType.VariableName;
			do {
				ch = this.value.charCodeAt(pos + (++len));
			} while (Scanner.isVariableCharacter(ch) || Scanner.isDigitCharacter(ch));

			this.pos += len;
			return { type, pos, len };
		}


		// format
		type = TokenType.Format;
		do {
			len += 1;
			ch = this.value.charCodeAt(pos + len);
		} while (
			!isNaN(ch)
			&& typeof Scanner._table[ch] === 'undefined' // not static token
			&& !Scanner.isDigitCharacter(ch) // not number
			&& !Scanner.isVariableCharacter(ch) // not variable
		);

		this.pos += len;
		return { type, pos, len };
	}
}


abstract class Marker {
	// pos: number;
	toString() {
		return '';
	}
}

class Text extends Marker {
	constructor(public string: string) {
		super();
	}
	toString() {
		return this.string;
	}
}

class TabStop extends Marker {
	constructor(public order: string) {
		super();
	}
}

class Placeholder extends Marker {
	constructor(public name: string, public value: Marker[]) {
		super();
	}
	toString() {
		let result = '';
		for (const m of this.value) {
			result += m.toString();
		}
		return result;
	}
}


class CodeSnippet implements ICodeSnippet {
	finishPlaceHolderIndex = -1;
	placeHolders = [];
	lines = [];

	constructor(marker: Marker[]) {
		let output = '';
		for (const m of marker) {
			output += m.toString();
		}
		this.lines = output.split('\n');
	}
}

export class SnippetParser {

	private _scanner = new Scanner();
	private _token: Token;
	private _prevToken: Token;

	parse(value: string): ICodeSnippet {

		const marker: Marker[] = [];

		this._scanner.text(value);
		this._token = this._scanner.next();
		while (this._parse(marker) || this._parseAny(marker)) {
			// nothing
		}

		return new CodeSnippet(marker);
	}

	private _accept(type: TokenType): boolean {
		if (type === undefined || this._token.type === type) {
			this._prevToken = this._token;
			this._token = this._scanner.next();
			return true;
		}
	}

	private _return(token: Token): void {
		this._prevToken = undefined;
		this._token = token;
		this._scanner.pos = token.pos + token.len;
	}

	private _parse(marker: Marker[]): boolean {
		if (this._parseEscaped(marker)) {
			return true;
		} else if (this._parseBlock(marker)) {
			return true;
		}
	}

	private _parseAny(marker: Marker[]): boolean {
		if (this._token.type !== TokenType.EOF) {
			this._accept(undefined);
			marker.push(this._scanner.tokenText(this._prevToken));
			return true;
		}
	}

	private _parseBlock(marker: Marker[]): boolean {
		let {pos, value} = this._scanner;
		if (this._accept(TokenType.DoubleCurlyOpen)) {

			let name: string;
			if (this._accept(TokenType.VariableName)) {
				name = this._scanner.tokenText(this._prevToken);
				if (!this._accept(TokenType.Colon)) {
					this._return(this._prevToken);
					name = undefined;
				}
			}

			let children: Marker[] = [];
			while (true) {

				if (this._accept(TokenType.DoubleCurlyClose)) {
					marker.push(new Placeholder(name, children));
					return true;
				}

				if (this._parse(children) || this._parseAny(children)) {
					continue;
				}

				marker.push(new Text('{{'));
				marker.push(...children);
				return;
			}
		}
	}

	private _parseEscaped(marker: Marker[]): boolean {
		if (this._accept(TokenType.Backslash)) {
			if (this._accept(TokenType.CurlyOpen) || this._accept(TokenType.CurlyClose) || this._accept(TokenType.Backslash)) {
				// just consume them
			}
			marker.push(new Text(this._scanner.tokenText(this._prevToken)));
			return true;
		}
	}
}
