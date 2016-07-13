/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {IPatternInfo} from 'vs/platform/search/common/search';

const BACKSLASH_CHAR_CODE = '\\'.charCodeAt(0);
const DOLLAR_CHAR_CODE = '$'.charCodeAt(0);
const ZERO_CHAR_CODE = '0'.charCodeAt(0);
const ONE_CHAR_CODE = '1'.charCodeAt(0);
const NINE_CHAR_CODE = '9'.charCodeAt(0);
const BACK_TICK_CHAR_CODE = '`'.charCodeAt(0);
const SINGLE_QUOTE_CHAR_CODE = '`'.charCodeAt(0);
const n_CHAR_CODE = 'n'.charCodeAt(0);
const t_CHAR_CODE = 't'.charCodeAt(0);

export class ReplacePattern {

	private _replacePattern: string;
	private _searchRegExp: RegExp;
	private _hasParameters: boolean= false;

	constructor(private replaceString: string, private searchPatternInfo: IPatternInfo) {
		this._replacePattern= replaceString;
		if (searchPatternInfo.isRegExp) {
			this._searchRegExp= strings.createRegExp(searchPatternInfo.pattern, searchPatternInfo.isRegExp, searchPatternInfo.isCaseSensitive, searchPatternInfo.isWordMatch, true);
			this.parseReplaceString(replaceString);
		}
	}

	public get hasParameters(): boolean {
		return this._hasParameters;
	}

	public get pattern(): string {
		return this._replacePattern;
	}

	public getReplaceString(matchedString: string): string {
		if (this.hasParameters) {
			return matchedString.replace(this._searchRegExp, this.pattern);
		}
		return this.pattern;
	}

	/**
	 * \n => LF
	 * \t => TAB
	 * \\ => \
	 * $0 => $& (see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter)
	 * everything else stays untouched
	 */
	private parseReplaceString(replaceString: string): void {
		if (!replaceString || replaceString.length === 0) {
			return;
		}

		let substrFrom = 0, result = '';
		for (let i = 0, len = replaceString.length; i < len; i++) {
			let chCode = replaceString.charCodeAt(i);

			if (chCode === BACKSLASH_CHAR_CODE) {

				// move to next char
				i++;

				if (i >= len) {
					// string ends with a \
					break;
				}

				let nextChCode = replaceString.charCodeAt(i);
				let replaceWithCharacter: string = null;

				switch (nextChCode) {
					case BACKSLASH_CHAR_CODE:
						// \\ => \
						replaceWithCharacter = '\\';
						break;
					case n_CHAR_CODE:
						// \n => LF
						replaceWithCharacter = '\n';
						break;
					case t_CHAR_CODE:
						// \t => TAB
						replaceWithCharacter = '\t';
						break;
				}

				if (replaceWithCharacter) {
					result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
					substrFrom = i + 1;
				}
			}

			if (chCode === DOLLAR_CHAR_CODE) {

				// move to next char
				i++;

				if (i >= len) {
					// string ends with a $
					break;
				}

				let nextChCode = replaceString.charCodeAt(i);
				let replaceWithCharacter: string = null;

				switch (nextChCode) {
					case ZERO_CHAR_CODE:
						// $0 => $&
						replaceWithCharacter = '$&';
						this._hasParameters = true;
						break;
					case BACK_TICK_CHAR_CODE:
					case SINGLE_QUOTE_CHAR_CODE:
						this._hasParameters = true;
						break;
					default:
						// check if it is a valid string parameter $n (0 <= n <= 99). $0 is already handled by now.
						if (!this.between(nextChCode, ONE_CHAR_CODE, NINE_CHAR_CODE)) {
							break;
						}
						if (i === replaceString.length - 1) {
							this._hasParameters = true;
							break;
						}
						let charCode= replaceString.charCodeAt(++i);
						if (!this.between(charCode, ZERO_CHAR_CODE, NINE_CHAR_CODE)) {
							this._hasParameters = true;
							--i;
							break;
						}
						if (i === replaceString.length - 1) {
							this._hasParameters = true;
							break;
						}
						charCode= replaceString.charCodeAt(++i);
						if (!this.between(charCode, ZERO_CHAR_CODE, NINE_CHAR_CODE)) {
							this._hasParameters = true;
							--i;
							break;
						}
						break;
				}

				if (replaceWithCharacter) {
					result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
					substrFrom = i + 1;
				}
			}
		}

		if (substrFrom === 0) {
			// no replacement occured
			return;
		}

		this._replacePattern= result + replaceString.substring(substrFrom);
	}

	private between(value: number, from: number, to: number): boolean {
		return from <= value && value <= to;
	}
}

