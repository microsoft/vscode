/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IStream} from 'vs/editor/common/modes';
import {CharacterClassifier} from 'vs/editor/common/core/characterClassifier';

class CharacterSet {

	private static _CACHE:{ [key:string]:CharacterSet; } = {}; // TODO@Alex unbounded cache

	public static getOrCreate(source:string): CharacterSet {
		if (!CharacterSet._CACHE.hasOwnProperty(source)) {
			CharacterSet._CACHE[source] = new CharacterSet(source);
		}
		return CharacterSet._CACHE[source];
	}

	private _classifier: CharacterClassifier<boolean>;

	constructor(source:string) {
		this._classifier = new CharacterClassifier<boolean>(false);
		for (let i = 0, len = source.length; i < len; i++) {
			this._classifier.set(source.charCodeAt(i), true);
		}
	}

	public contains(charCode:number): boolean {
		return this._classifier.get(charCode);
	}
}

export class LineStream implements IStream {

	private _source:string;
	private _sourceLength:number;
	private _pos:number;
	private _whitespace:string;
	private _whitespaceArr:CharacterSet;
	private _separators:string;
	private _separatorsArr:CharacterSet;
	private _tokenStart:number;
	private _tokenEnd:number;

	constructor(source:string) {
		this._source = source;
		this._sourceLength = source.length;
		this._pos = 0;
		this._whitespace = '\t \u00a0';
		this._whitespaceArr = CharacterSet.getOrCreate(this._whitespace);
		this._separators = '';
		this._separatorsArr = CharacterSet.getOrCreate(this._separators);
		this._tokenStart = -1;
		this._tokenEnd = -1;
	}

	public pos():number {
		return this._pos;
	}

	public eos() {
		return this._pos >= this._sourceLength;
	}

	public peek():string {
		// Check EOS
		if (this._pos >= this._sourceLength) {
			throw new Error('Stream is at the end');
		}
		return this._source[this._pos];
	}

	public next():string {
		// Check EOS
		if (this._pos >= this._sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Reset peeked token
		this._tokenStart = -1;
		this._tokenEnd = -1;

		return this._source[this._pos++];
	}

	public next2(): void {
		// Check EOS
		if (this._pos >= this._sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Reset peeked token
		this._tokenStart = -1;
		this._tokenEnd = -1;

		this._pos++;
	}

	public advance(n: number): string {
		if (n === 0) {
			return '';
		}
		const oldPos = this._pos;
		this._pos += n;
		// Reset peeked token
		this._tokenStart = -1;
		this._tokenEnd = -1;
		return this._source.substring(oldPos, this._pos);
	}

	private _advance2(n: number): number {
		if (n === 0) {
			return n;
		}
		this._pos += n;
		// Reset peeked token
		this._tokenStart = -1;
		this._tokenEnd = -1;
		return n;
	}

	public advanceToEOS():string {
		const oldPos = this._pos;
		this._pos = this._sourceLength;
		this.resetPeekedToken();
		return this._source.substring(oldPos, this._pos);
	}

	public goBack(n:number) {
		this._pos -= n;
		this.resetPeekedToken();
	}

	private createPeeker(condition:RegExp|string):()=>number {
		if (condition instanceof RegExp) {
			return () => {
				let result = condition.exec(this._source.substr(this._pos));
				if (result === null) {
					return 0;
				} else if (result.index !== 0) {
					throw new Error('Regular expression must begin with the character "^"');
				}
				return result[0].length;
			};
		} else if ((typeof condition === 'string') && condition) {
			return () => {
				const len = condition.length;
				let match = (this._pos + len <= this._sourceLength);
				for (let i = 0; match && i < len; i++) {
					match = this._source.charCodeAt(this._pos + i) === condition.charCodeAt(i);
				}
				return (match ? len : 0);
			};
		}
		throw new Error('Condition must be either a regular expression, function or a non-empty string');
	}

	// --- BEGIN `_advanceIfStringCaseInsensitive`
	private _advanceIfStringCaseInsensitive(condition:string): number {
		const oldPos = this._pos;
		const source = this._source;
		const len = condition.length;

		if (len < 1 || oldPos + len > this._sourceLength) {
			return 0;
		}

		for (let i = 0; i < len; i++) {
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
		const oldPos = this._pos;
		const source = this._source;
		const len = condition.length;

		if (len < 1 || oldPos + len > this._sourceLength) {
			return 0;
		}

		for (let i = 0; i < len; i++) {
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
		if (this._pos < this._sourceLength && this._source.charCodeAt(this._pos) === charCode) {
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
		if (this._pos >= this._sourceLength) {
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

	private advanceLoop(condition:RegExp|string, isWhile:boolean, including:boolean):string {
		if (this.eos()) {
			return '';
		}
		const peeker = this.createPeeker(condition);
		const oldPos = this._pos;
		let n = 0;
		let f = null;
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

	public advanceWhile(condition:RegExp|string):string {
		return this.advanceLoop(condition, true, false);
	}

	public advanceUntil(condition:RegExp|string, including:boolean):string {
		return this.advanceLoop(condition, false, including);
	}

	// --- BEGIN `advanceUntilString`
	private _advanceUntilString(condition: string, including: boolean): number {
		if (this.eos() || condition.length === 0) {
			return 0;
		}

		const oldPos = this._pos;
		const index = this._source.indexOf(condition, oldPos);

		if (index === -1) {
			// String was not found => advanced to `eos`
			return (this._sourceLength - oldPos);
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
		this._tokenStart = -1;
		this._tokenEnd = -1;
	}

	public setTokenRules(separators:string, whitespace:string):void {
		if (this._separators !== separators || this._whitespace !== whitespace) {
			this._separators = separators;
			this._separatorsArr = CharacterSet.getOrCreate(this._separators);
			this._whitespace = whitespace;
			this._whitespaceArr = CharacterSet.getOrCreate(this._whitespace);
			this.resetPeekedToken();
		}
	}

	// --- tokens

	public peekToken():string {
		if (this._tokenStart !== -1) {
			return this._source.substring(this._tokenStart, this._tokenEnd);
		}

		const source = this._source;
		const sourceLength = this._sourceLength;
		const whitespaceArr = this._whitespaceArr;
		const separatorsArr = this._separatorsArr;

		let tokenStart = this._pos;

		// Check EOS
		if (tokenStart >= sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Skip whitespace
		while (whitespaceArr.contains(source.charCodeAt(tokenStart)) && tokenStart < sourceLength) {
			tokenStart++;
		}

		var tokenEnd = tokenStart;
		// If a separator is hit, it is a token
		if (separatorsArr.contains(source.charCodeAt(tokenEnd)) && tokenEnd < sourceLength) {
			tokenEnd++;
		} else {
			// Advance until a separator or a whitespace is hit
			while (!separatorsArr.contains(source.charCodeAt(tokenEnd)) && !whitespaceArr.contains(source.charCodeAt(tokenEnd)) && tokenEnd < sourceLength) {
				tokenEnd++;
			}
		}

		// Cache peeked token
		this._tokenStart = tokenStart;
		this._tokenEnd = tokenEnd;

		return source.substring(tokenStart, tokenEnd);
	}

	public nextToken():string {
		// Check EOS
		if (this._pos >= this._sourceLength) {
			throw new Error('Stream is at the end');
		}

		// Peek token if necessary
		let result:string;
		if (this._tokenStart === -1)  {
			result = this.peekToken();
		} else {
			result = this._source.substring(this._tokenStart, this._tokenEnd);
		}

		// Advance to tokenEnd
		this._pos = this._tokenEnd;

		// Reset peeked token
		this._tokenStart = -1;
		this._tokenEnd = -1;

		return result;
	}

	// -- whitespace

	public peekWhitespace():string {
		const source = this._source;
		const sourceLength = this._sourceLength;
		const whitespaceArr = this._whitespaceArr;

		let peek = this._pos;
		while (whitespaceArr.contains(source.charCodeAt(peek)) && peek < sourceLength) {
			peek++;
		}
		return source.substring(this._pos, peek);
	}

	// --- BEGIN `skipWhitespace`
	private _skipWhitespace(): number {
		const source = this._source;
		const sourceLength = this._sourceLength;
		const whitespaceArr = this._whitespaceArr;
		const oldPos = this._pos;

		let peek = this._pos;
		while (whitespaceArr.contains(source.charCodeAt(peek)) && peek < sourceLength) {
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
