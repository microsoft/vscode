/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { IPatternInfo } from 'vs/workbench/services/search/common/search';
import { CharCode } from 'vs/base/common/charCode';
import { buildReplaceStringWithCasePreserved } from 'vs/base/common/search';

export class ReplacePattern {

	private _replacePattern: string;
	private _hasParameters: boolean = false;
	private _regExp: RegExp;

	constructor(replaceString: string, searchPatternInfo: IPatternInfo)
	constructor(replaceString: string, parseParameters: boolean, regEx: RegExp)
	constructor(replaceString: string, arg2: any, arg3?: any) {
		this._replacePattern = replaceString;
		let searchPatternInfo: IPatternInfo;
		let parseParameters: boolean;
		if (typeof arg2 === 'boolean') {
			parseParameters = arg2;
			this._regExp = arg3;

		} else {
			searchPatternInfo = arg2;
			parseParameters = !!searchPatternInfo.isRegExp;
			this._regExp = strings.createRegExp(searchPatternInfo.pattern, !!searchPatternInfo.isRegExp, { matchCase: searchPatternInfo.isCaseSensitive, wholeWord: searchPatternInfo.isWordMatch, multiline: searchPatternInfo.isMultiline, global: false });
		}

		if (parseParameters) {
			this.parseReplaceString(replaceString);
		}

		if (this._regExp.global) {
			this._regExp = strings.createRegExp(this._regExp.source, true, { matchCase: !this._regExp.ignoreCase, wholeWord: false, multiline: this._regExp.multiline, global: false });
		}
	}

	get hasParameters(): boolean {
		return this._hasParameters;
	}

	get pattern(): string {
		return this._replacePattern;
	}

	get regExp(): RegExp {
		return this._regExp;
	}

	/**
	* Returns the replace string for the first match in the given text.
	* If text has no matches then returns null.
	*/
	getReplaceString(text: string, preserveCase?: boolean): string | null {
		this._regExp.lastIndex = 0;
		let match = this._regExp.exec(text);
		if (match) {
			if (this.hasParameters) {
				if (match[0] === text) {
					return text.replace(this._regExp, this.pattern);
				}
				let replaceString = text.replace(this._regExp, this.pattern);
				return replaceString.substr(match.index, match[0].length - (text.length - replaceString.length));
			}
			return this.buildReplaceString(match, preserveCase);
		}

		return null;
	}

	public buildReplaceString(matches: string[] | null, preserveCase?: boolean): string {
		if (preserveCase) {
			return buildReplaceStringWithCasePreserved(matches, this._replacePattern);
		} else {
			return this._replacePattern;
		}
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

			if (chCode === CharCode.Backslash) {

				// move to next char
				i++;

				if (i >= len) {
					// string ends with a \
					break;
				}

				let nextChCode = replaceString.charCodeAt(i);
				let replaceWithCharacter: string | null = null;

				switch (nextChCode) {
					case CharCode.Backslash:
						// \\ => \
						replaceWithCharacter = '\\';
						break;
					case CharCode.n:
						// \n => LF
						replaceWithCharacter = '\n';
						break;
					case CharCode.t:
						// \t => TAB
						replaceWithCharacter = '\t';
						break;
				}

				if (replaceWithCharacter) {
					result += replaceString.substring(substrFrom, i - 1) + replaceWithCharacter;
					substrFrom = i + 1;
				}
			}

			if (chCode === CharCode.DollarSign) {

				// move to next char
				i++;

				if (i >= len) {
					// string ends with a $
					break;
				}

				let nextChCode = replaceString.charCodeAt(i);
				let replaceWithCharacter: string | null = null;

				switch (nextChCode) {
					case CharCode.Digit0:
						// $0 => $&
						replaceWithCharacter = '$&';
						this._hasParameters = true;
						break;
					case CharCode.BackTick:
					case CharCode.SingleQuote:
						this._hasParameters = true;
						break;
					default:
						// check if it is a valid string parameter $n (0 <= n <= 99). $0 is already handled by now.
						if (!this.between(nextChCode, CharCode.Digit1, CharCode.Digit9)) {
							break;
						}
						if (i === replaceString.length - 1) {
							this._hasParameters = true;
							break;
						}
						let charCode = replaceString.charCodeAt(++i);
						if (!this.between(charCode, CharCode.Digit0, CharCode.Digit9)) {
							this._hasParameters = true;
							--i;
							break;
						}
						if (i === replaceString.length - 1) {
							this._hasParameters = true;
							break;
						}
						charCode = replaceString.charCodeAt(++i);
						if (!this.between(charCode, CharCode.Digit0, CharCode.Digit9)) {
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
			// no replacement occurred
			return;
		}

		this._replacePattern = result + replaceString.substring(substrFrom);
	}

	private between(value: number, from: number, to: number): boolean {
		return from <= value && value <= to;
	}
}
