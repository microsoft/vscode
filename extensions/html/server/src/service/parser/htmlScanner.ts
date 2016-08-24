/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export enum TokenType {
	StartCommentTag,
	Comment,
	EndCommentTag,
	StartTagOpen,
	StartTagClose,
	StartTagSelfClose,
	StartTag,
	EndTagOpen,
	EndTagClose,
	EndTag,
	DelimiterAssign,
	AttributeName,
	AttributeValue,
	StartDoctypeTag,
	Doctype,
	EndDoctypeTag,
	Content,
	Whitespace,
	Unknown,
	Script,
	Styles,
	EOS
}

export interface IToken {
	type: TokenType;
	offset: number;
	len: number;
}

class MultiLineStream {

	private source: string;
	private len: number;
	private position: number;

	constructor(source: string) {
		this.source = source;
		this.len = source.length;
		this.position = 0;
	}

	public eos(): boolean {
		return this.len <= this.position;
	}

	public pos(): number {
		return this.position;
	}

	public goBackTo(pos: number): void {
		this.position = pos;
	}

	public goBack(n: number): void {
		this.position -= n;
	}

	public advance(n: number): void {
		this.position += n;
	}

	public goToEnd(): void {
		this.position = this.source.length;
	}

	public nextChar(): number {
		return this.source.charCodeAt(this.position++) || 0;
	}

	public peekChar(n: number = 0): number {
		return this.source.charCodeAt(this.position + n) || 0;
	}

	public advanceIfChar(ch: number): boolean {
		if (ch === this.source.charCodeAt(this.position)) {
			this.position++;
			return true;
		}
		return false;
	}

	public advanceIfChars(ch: number[]): boolean {
		let i: number;
		if (this.position + ch.length > this.source.length) {
			return false;
		}
		for (i = 0; i < ch.length; i++) {
			if (this.source.charCodeAt(this.position + i) !== ch[i]) {
				return false;
			}
		}
		this.advance(i);
		return true;
	}

	public advanceIfRegExp(regex: RegExp): string {
		let str = this.source.substr(this.position);
		let match = str.match(regex);
		if (match) {
			this.position = this.position + match.index + match[0].length;
			return match[0];
		}
		return '';
	}

	public advanceUntilRegExp(regex: RegExp): string {
		let str = this.source.substr(this.position);
		let match = str.match(regex);
		if (match) {
			this.position = this.position + match.index;
			return match[0];
		}
		return '';
	}

	public advanceUntilChar(ch: number): boolean {
		while (this.position < this.source.length) {
			if (this.source.charCodeAt(this.position) === ch) {
				return true;
			}
			this.advance(1);
		}
		return false;
	}

	public advanceUntilChars(ch: number[]): boolean {
		while (this.position + ch.length < this.source.length) {
			for (let i = 0; i < ch.length; i++) {
				if (this.source.charCodeAt(this.position + i) !== ch[i]) {
					break;
				}
				return true;
			}
			this.advance(1);
		}
		return false;
	}

	public skipWhitespace(): boolean {
		let n = this.advanceWhileChar(ch => {
			return ch === _WSP || ch === _TAB || ch === _NWL || ch === _LFD || ch === _CAR;
		});
		return n > 0;
	}

	public advanceWhileChar(condition: (ch: number) => boolean): number {
		let posNow = this.position;
		while (this.position < this.len && condition(this.source.charCodeAt(this.position))) {
			this.position++;
		}
		return this.position - posNow;
	}
}
const _BNG = '!'.charCodeAt(0);
const _MIN = '-'.charCodeAt(0);
const _LAN = '<'.charCodeAt(0);
const _RAN = '>'.charCodeAt(0);
const _FSL = '/'.charCodeAt(0);
const _EQS = '='.charCodeAt(0);
const _DQO = '"'.charCodeAt(0);
const _SQO = '\''.charCodeAt(0);
const _NWL = '\n'.charCodeAt(0);
const _CAR = '\r'.charCodeAt(0);
const _LFD = '\f'.charCodeAt(0);
const _WSP = ' '.charCodeAt(0);
const _TAB = '\t'.charCodeAt(0);


export enum ScannerState {
	Content,
	OpeningStartTag,
	OpeningEndTag,
	WithinDoctype,
	WithinTag,
	WithinComment,
	WithinScriptContent,
	WithinStyleContent,
	AttributeName,
	AttributeValue
}

export class Scanner {

	private _stream: MultiLineStream;
	private _state: ScannerState;
	private _tokenType: TokenType;
	private _tokenOffset: number;

	private _hasSpaceAfterTag: boolean;
	private _lastTag: string;

	public setSource(input: string, initialState: ScannerState = ScannerState.Content): void {
		this._stream = new MultiLineStream(input);
		this._state = initialState;
	}

	public get position(): number {
		return this._stream.pos();
	}

	public get scannerState(): number {
		return this._state;
	}

	public get tokenType(): number {
		return this._tokenType;
	}

	public get tokenOffset(): number {
		return this._tokenOffset;
	}

	public get tokenLength(): number {
		return this._stream.pos() - this._tokenOffset;
	}

	private nextElementName(): string {
		return this._stream.advanceIfRegExp(/^[_:\w][_:\w-.\d]*/).toLowerCase();
	}

	private nextAttributeName(): string {
		return this._stream.advanceIfRegExp(/^[^\s"'>/=\x00-\x0F\x7F\x80-\x9F]*/).toLowerCase();
	}

	private finishToken(offset: number, type: TokenType): TokenType {
		this._tokenType = type;
		this._tokenOffset = offset;
		return type;
	}

	public scan(): TokenType {
		let offset = this._stream.pos();
		if (this._stream.eos()) {
			return this.finishToken(offset, TokenType.EOS);
		}

		switch (this._state) {
			case ScannerState.WithinComment:
				if (this._stream.advanceIfChars([_MIN, _MIN, _RAN])) { // -->
					this._state = ScannerState.Content;
					return this.finishToken(offset, TokenType.EndCommentTag);
				}
				this._stream.advanceUntilChars([_MIN, _MIN, _RAN]);  // -->
				return this.finishToken(offset, TokenType.Comment);
			case ScannerState.WithinDoctype:
				if (this._stream.advanceIfChar(_RAN)) {
					this._state = ScannerState.Content;
					return this.finishToken(offset, TokenType.EndDoctypeTag);
				}
				this._stream.advanceUntilChar(_RAN); // >
				return this.finishToken(offset, TokenType.Doctype);
			case ScannerState.Content:
				if (this._stream.advanceIfChar(_LAN)) { // <
					if (!this._stream.eos() && this._stream.peekChar() === _BNG) { // !
						if (this._stream.advanceIfChars([_BNG, _MIN, _MIN])) { // <!--
							this._state = ScannerState.WithinComment;
							return this.finishToken(offset, TokenType.StartCommentTag);
						}
						if (this._stream.advanceIfRegExp(/^!doctype/i)) {
							this._state = ScannerState.WithinDoctype;
							return this.finishToken(offset, TokenType.StartDoctypeTag);
						}
					}
					if (this._stream.advanceIfChar(_FSL)) { // /
						this._state = ScannerState.OpeningEndTag;
						return this.finishToken(offset, TokenType.EndTagOpen);
					}
					this._state = ScannerState.OpeningStartTag;
					return this.finishToken(offset, TokenType.StartTagOpen);
				}
				this._stream.advanceUntilChar(_LAN);
				return this.finishToken(offset, TokenType.Content);
			case ScannerState.OpeningEndTag:
				let tagName = this.nextElementName();
				if (tagName.length > 0) {
					return this.finishToken(offset, TokenType.EndTag);
				} else if (this._stream.advanceIfChar(_RAN)) { // >
					this._state = ScannerState.Content;
					return this.finishToken(offset, TokenType.EndTagClose);
				}
				this._stream.advanceUntilChar(_RAN);
				return this.finishToken(offset, TokenType.Whitespace);
			case ScannerState.OpeningStartTag:
				this._lastTag = this.nextElementName();
				if (this._lastTag.length > 0) {
					this._hasSpaceAfterTag = false;
					this._state = ScannerState.WithinTag;
					return this.finishToken(offset, TokenType.StartTag);
				}
				break;
			case ScannerState.WithinTag:
				if (this._stream.skipWhitespace()) {
					this._hasSpaceAfterTag = true; // remember that we have seen a whitespace
					return this.finishToken(offset, TokenType.Whitespace);
				}
				if (this._hasSpaceAfterTag) {
					let name = this.nextAttributeName();
					if (name.length > 0) {
						this._state = ScannerState.AttributeName;
						this._hasSpaceAfterTag = false;
						return this.finishToken(offset, TokenType.AttributeName);
					}
				}
				if (this._stream.advanceIfChars([_FSL, _RAN])) { // />
					this._state = ScannerState.Content;
					return this.finishToken(offset, TokenType.StartTagSelfClose);
				}
				if (this._stream.advanceIfChar(_RAN)) { // >
					if (this._lastTag === 'script') {
						this._state = ScannerState.WithinScriptContent;
					} else if (this._lastTag === 'style') {
						this._state = ScannerState.WithinStyleContent;
					} else {
						this._state = ScannerState.Content;
					}
					return this.finishToken(offset, TokenType.StartTagClose);
				}
				this._stream.advance(1);
				return this.finishToken(offset, TokenType.Unknown);
			case ScannerState.AttributeName:
				if (this._stream.skipWhitespace()) {
					this._hasSpaceAfterTag = true;
					return this.finishToken(offset, TokenType.Whitespace);
				}

				if (this._stream.advanceIfChar(_EQS)) {
					this._state = ScannerState.AttributeValue;
					return this.finishToken(offset, TokenType.DelimiterAssign);
				}
				this._state = ScannerState.WithinTag;
				return this.scan(); // no advance yet - jump to WithinTag
			case ScannerState.AttributeValue:
				if (this._stream.skipWhitespace()) {
					return this.finishToken(offset, TokenType.Whitespace);
				}
				let attributeValue = this._stream.advanceIfRegExp(/^[^\s"'`=<>]+/);
				if (attributeValue.length > 0) {
					this._state = ScannerState.WithinTag;
					this._hasSpaceAfterTag = false;
					return this.finishToken(offset, TokenType.AttributeValue);
				}
				let ch = this._stream.peekChar();
				if (ch === _SQO || ch === _DQO) {
					this._stream.advance(1); // consume quote
					if (this._stream.advanceUntilChar(ch)) {
						this._stream.advance(1); // consume quote
					}
					this._state = ScannerState.WithinTag;
					this._hasSpaceAfterTag = false;
					return this.finishToken(offset, TokenType.AttributeValue);
				}
				this._state = ScannerState.WithinTag;
				this._hasSpaceAfterTag = false;
				return this.scan(); // no advance yet - jump to WithinTag
			case ScannerState.WithinScriptContent:
				// see http://stackoverflow.com/questions/14574471/how-do-browsers-parse-a-script-tag-exactly
				let state = 1;
				while (!this._stream.eos()) {
					let match = this._stream.advanceIfRegExp(/<!--|-->|<\/?script\s*\/?>?/i);
					if (match.length === 0) {
						this._stream.goToEnd();
						return this.finishToken(offset, TokenType.Script);
					} else if (match === '<!--') {
						if (state === 1) {
							state = 2;
						}
					} else if (match === '-->') {
						state = 1;
					} else if (match[1] !== '/') { // <script
						if (state === 2) {
							state = 3;
						}
					} else { // </script
						if (state === 3) {
							state = 2;
						} else {
							this._stream.goBack(match.length); // to the beginning of the closing tag
							break;
						}
					}
				}
				this._state = ScannerState.Content;
				if (offset < this._stream.pos()) {
					return this.finishToken(offset, TokenType.Script);
				}
				return this.scan(); // no advance yet - jump to content
			case ScannerState.WithinScriptContent:
				this._stream.advanceUntilRegExp(/<\/style/i);
				this._state = ScannerState.Content;
				if (offset < this._stream.pos()) {
					return this.finishToken(offset, TokenType.Styles);
				}
				return this.scan(); // no advance yet - jump to content
		}

		this._stream.advance(1);
		this._state = ScannerState.Content;
		return this.finishToken(offset, TokenType.Unknown);
	}
}
