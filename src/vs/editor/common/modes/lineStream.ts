/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IStream} from 'vs/editor/common/modes';

export class LineStream implements IStream {

	static STRING_TO_ARRAY_CACHE:{ [key:string]:boolean[]; } = {};

	/*protected*/ _source:string;
	private sourceLength:number;
	/*protected*/ _pos:number;
	private whitespace:string;
	private whitespaceArr:boolean[];
	private separators:string;
	private separatorsArr:boolean[];
	private tokenStart:number;
	private tokenEnd:number;

	constructor(source:string) {
		this._source = source;
		this.sourceLength = source.length;
		this._pos = 0;
		this.whitespace = '\t \u00a0';
		this.whitespaceArr = this.stringToArray(this.whitespace);
		this.separators = '';
		this.separatorsArr = this.stringToArray(this.separators);
		this.tokenStart = -1;
		this.tokenEnd = -1;
	}

	private stringToArray(str:string):boolean[] {
		if (!LineStream.STRING_TO_ARRAY_CACHE.hasOwnProperty(str)) {
			LineStream.STRING_TO_ARRAY_CACHE[str] = this.actualStringToArray(str);
		}
		return LineStream.STRING_TO_ARRAY_CACHE[str];
	}

	private actualStringToArray(str:string):boolean[] {
		let maxCharCode = 0;
		for (let i = 0; i < str.length; i++) {
			maxCharCode = Math.max(maxCharCode, str.charCodeAt(i));
		}
		let r:boolean[] = [];
		for (let i = 0; i <= maxCharCode; i++) {
			r[i] = false;
		}
		for (let i = 0; i < str.length; i++) {
			r[str.charCodeAt(i)] = true;
		}
		return r;
	}

	public pos():number {
		return this._pos;
	}

	public eos() {
		return this._pos >= this.sourceLength;
	}

	public peek():string {
		// Check EOS
		if (this._pos >= this.sourceLength) {
			throw new Error('Stream is at the end');
		}
		return this._source[this._pos];
	}

	public next():string {
		// Check EOS
		if (this._pos >= this.sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Reset peeked token
		this.tokenStart = -1;
		this.tokenEnd = -1;

		return this._source[this._pos++];
	}

	public next2(): void {
		// Check EOS
		if (this._pos >= this.sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Reset peeked token
		this.tokenStart = -1;
		this.tokenEnd = -1;

		this._pos++;
	}

	public advance(n: number): string {
		if (n === 0) {
			return '';
		}
		var oldPos = this._pos;
		this._pos += n;
		// Reset peeked token
		this.tokenStart = -1;
		this.tokenEnd = -1;
		return this._source.substring(oldPos, this._pos);
	}

	private _advance2(n: number): number {
		if (n === 0) {
			return n;
		}
		this._pos += n;
		// Reset peeked token
		this.tokenStart = -1;
		this.tokenEnd = -1;
		return n;
	}

	public advanceToEOS():string {
		var oldPos = this._pos;
		this._pos = this.sourceLength;
		this.resetPeekedToken();
		return this._source.substring(oldPos, this._pos);
	}

	public goBack(n:number) {
		this._pos -= n;
		this.resetPeekedToken();
	}

	private createPeeker(condition:any):()=>number {
		if (condition instanceof RegExp) {
			return () => {
				var result = condition.exec(this._source.substr(this._pos));
				if (result === null) {
					return 0;
				} else if (result.index !== 0) {
					throw new Error('Regular expression must begin with the character "^"');
				}
				return result[0].length;
			};
		} else if ((condition instanceof String || (typeof condition) === 'string') && condition) {
			return () => {
				var len = (<String> condition).length, match = this._pos + len <= this.sourceLength;
				for (var i = 0; match && i < len; i++) {
					match = this._source.charCodeAt(this._pos + i) === (<String> condition).charCodeAt(i);
				}
				return match ? len : 0;
			};
		}
		throw new Error('Condition must be either a regular expression, function or a non-empty string');
	}

	// --- BEGIN `_advanceIfStringCaseInsensitive`
	private _advanceIfStringCaseInsensitive(condition:string): number {
		var oldPos = this._pos,
			source = this._source,
			len = condition.length,
			i:number;

		if (len < 1 || oldPos + len > this.sourceLength) {
			return 0;
		}

		for (i = 0; i < len; i++) {
			if (source.charAt(oldPos + i).toLowerCase() !== condition.charAt(i).toLowerCase()) {
				return 0;
			}
		}

		return len;
	}
	public advanceIfStringCaseInsensitive(condition: string): string {
		return this.advance(this._advanceIfStringCaseInsensitive(condition));
	}
	public advanceIfStringCaseInsensitive2(condition: string): number {
		return this._advance2(this._advanceIfStringCaseInsensitive(condition));
	}
	// --- END

	// --- BEGIN `advanceIfString`
	private _advanceIfString(condition: string): number {
		var oldPos = this._pos,
			source = this._source,
			len = condition.length,
			i:number;

		if (len < 1 || oldPos + len > this.sourceLength) {
			return 0;
		}

		for (i = 0; i < len; i++) {
			if (source.charCodeAt(oldPos + i) !== condition.charCodeAt(i)) {
				return 0;
			}
		}

		return len;
	}
	public advanceIfString(condition:string): string {
		return this.advance(this._advanceIfString(condition));
	}
	public advanceIfString2(condition: string): number {
		return this._advance2(this._advanceIfString(condition));
	}
	// --- END

	// --- BEGIN `advanceIfString`
	private _advanceIfCharCode(charCode:number): number {
		if (this._pos < this.sourceLength && this._source.charCodeAt(this._pos) === charCode) {
			return 1;
		}

		return 0;
	}
	public advanceIfCharCode(charCode: number): string {
		return this.advance(this._advanceIfCharCode(charCode));
	}
	public advanceIfCharCode2(charCode: number): number {
		return this._advance2(this._advanceIfCharCode(charCode));
	}
	// --- END

	// --- BEGIN `advanceIfRegExp`
	private _advanceIfRegExp(condition:RegExp): number {
		if (this._pos >= this.sourceLength) {
			return 0;
		}
		if (!condition.test(this._source.substr(this._pos))) {
			return 0;
		}
		return RegExp.lastMatch.length;
	}
	public advanceIfRegExp(condition: RegExp): string {
		return this.advance(this._advanceIfRegExp(condition));
	}
	public advanceIfRegExp2(condition: RegExp): number {
		return this._advance2(this._advanceIfRegExp(condition));
	}
	// --- END

	private advanceLoop(condition:any, isWhile:boolean, including:boolean):string {
		if (this.eos()) {
			return '';
		}
		var peeker = this.createPeeker(condition);
		var oldPos = this._pos;
		var n = 0;
		var f = null;
		if (isWhile) {
			f = (n) => {
				return n > 0;
			};
		} else {
			f = (n) => {
				return n === 0;
			};
		}
		while (!this.eos() && f(n = peeker())) {
			if (n > 0) {
				this.advance(n);
			} else {
				this.next();
			}
		}
		if (including && !this.eos()) {
			this.advance(n);
		}
		return this._source.substring(oldPos, this._pos);
	}

	public advanceWhile(condition:any):string {
		return this.advanceLoop(condition, true, false);
	}

	public advanceUntil(condition:any, including:boolean):string {
		return this.advanceLoop(condition, false, including);
	}

	// --- BEGIN `advanceUntilString`
	private _advanceUntilString(condition: string, including: boolean): number {
		if (this.eos() || condition.length === 0) {
			return 0;
		}

		var oldPos = this._pos;
		var index = this._source.indexOf(condition, oldPos);

		if (index === -1) {
			// String was not found => advanced to `eos`
			return (this.sourceLength - oldPos);
		}

		if (including) {
			// String was found => advance to include `condition`
			return (index + condition.length - oldPos);
		}

		// String was found => advance right before `condition`
		return (index - oldPos);
	}
	public advanceUntilString(condition: string, including: boolean): string {
		return this.advance(this._advanceUntilString(condition, including));
	}
	public advanceUntilString2(condition: string, including: boolean): number {
		return this._advance2(this._advanceUntilString(condition, including));
	}
	// --- END

	private resetPeekedToken() {
		this.tokenStart = -1;
		this.tokenEnd = -1;
	}

	public setTokenRules(separators:string, whitespace:string):void {
		if (this.separators !== separators || this.whitespace !== whitespace) {
			this.separators = separators;
			this.separatorsArr = this.stringToArray(this.separators);
			this.whitespace = whitespace;
			this.whitespaceArr = this.stringToArray(this.whitespace);
			this.resetPeekedToken();
		}
	}

	// --- tokens

	public peekToken():string {
		if (this.tokenStart !== -1) {
			return this._source.substring(this.tokenStart, this.tokenEnd);
		}

		var	source = this._source,
			sourceLength = this.sourceLength,
			whitespaceArr = this.whitespaceArr,
			separatorsArr = this.separatorsArr,
			tokenStart = this._pos;

		// Check EOS
		if (tokenStart >= sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Skip whitespace
		while (whitespaceArr[source.charCodeAt(tokenStart)] && tokenStart < sourceLength) {
			tokenStart++;
		}

		var tokenEnd = tokenStart;
		// If a separator is hit, it is a token
		if (separatorsArr[source.charCodeAt(tokenEnd)] && tokenEnd < sourceLength) {
			tokenEnd++;
		} else {
			// Advance until a separator or a whitespace is hit
			while (!separatorsArr[source.charCodeAt(tokenEnd)] && !whitespaceArr[source.charCodeAt(tokenEnd)] && tokenEnd < sourceLength) {
				tokenEnd++;
			}
		}

		// Cache peeked token
		this.tokenStart = tokenStart;
		this.tokenEnd = tokenEnd;

		return source.substring(tokenStart, tokenEnd);
	}

	public nextToken():string {
		// Check EOS
		if (this._pos >= this.sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Peek token if necessary
		var result:string;
		if (this.tokenStart === -1)  {
			result = this.peekToken();
		} else {
			result = this._source.substring(this.tokenStart, this.tokenEnd);
		}

		// Advance to tokenEnd
		this._pos = this.tokenEnd;

		// Reset peeked token
		this.tokenStart = -1;
		this.tokenEnd = -1;

		return result;
	}

	// -- whitespace

	public peekWhitespace():string {
		var	source = this._source,
			sourceLength = this.sourceLength,
			whitespaceArr = this.whitespaceArr,
			peek = this._pos;

		while (whitespaceArr[source.charCodeAt(peek)] && peek < sourceLength) {
			peek++;
		}
		return source.substring(this._pos, peek);
	}

	// --- BEGIN `advanceIfRegExp`
	private _skipWhitespace(): number {
		var source = this._source,
			sourceLength = this.sourceLength,
			whitespaceArr = this.whitespaceArr,
			oldPos = this._pos,
			peek = this._pos;

		while (whitespaceArr[source.charCodeAt(peek)] && peek < sourceLength) {
			peek++;
		}

		return (peek - oldPos);
	}
	public skipWhitespace(): string {
		return this.advance(this._skipWhitespace());
	}
	public skipWhitespace2(): number {
		return this._advance2(this._skipWhitespace());
	}
	// --- END
}
