/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../../base/common/charCode.js';
import { buildReplaceStringWithCasePreserved } from '../../../../base/common/search.js';

const enum ReplacePatternKind {
	StaticValue = 0,
	DynamicPieces = 1
}

/**
 * Assigned when the replace pattern is entirely static.
 */
class StaticValueReplacePattern {
	public readonly kind = ReplacePatternKind.StaticValue;
	constructor(public readonly staticValue: string) { }
}

/**
 * Assigned when the replace pattern has replacement patterns.
 */
class DynamicPiecesReplacePattern {
	public readonly kind = ReplacePatternKind.DynamicPieces;
	constructor(public readonly pieces: ReplacePiece[]) { }
}

export class ReplacePattern {

	public static fromStaticValue(value: string): ReplacePattern {
		return new ReplacePattern([ReplacePiece.staticValue(value)]);
	}

	private readonly _state: StaticValueReplacePattern | DynamicPiecesReplacePattern;

	public get hasReplacementPatterns(): boolean {
		return (this._state.kind === ReplacePatternKind.DynamicPieces);
	}

	constructor(pieces: ReplacePiece[] | null) {
		if (!pieces || pieces.length === 0) {
			this._state = new StaticValueReplacePattern('');
		} else if (pieces.length === 1 && pieces[0].staticValue !== null) {
			this._state = new StaticValueReplacePattern(pieces[0].staticValue);
		} else {
			this._state = new DynamicPiecesReplacePattern(pieces);
		}
	}

	public buildReplaceString(matches: string[] | null, preserveCase?: boolean, groups?: { [key: string]: string } | null): string {
		if (this._state.kind === ReplacePatternKind.StaticValue) {
			if (preserveCase) {
				return buildReplaceStringWithCasePreserved(matches, this._state.staticValue);
			} else {
				return this._state.staticValue;
			}
		}

		let result = '';
		for (let i = 0, len = this._state.pieces.length; i < len; i++) {
			const piece = this._state.pieces[i];
			if (piece.staticValue !== null) {
				// static value ReplacePiece
				result += piece.staticValue;
				continue;
			}

			// Get the match value from either matchIndex or groupName
			let match: string;
			if (piece.groupName !== null) {
				// named group ReplacePiece
				match = ReplacePattern._substituteNamedGroup(piece.groupName, groups);
			} else {
				// match index ReplacePiece
				match = ReplacePattern._substitute(piece.matchIndex, matches);
			}

			if (piece.caseOps !== null && piece.caseOps.length > 0) {
				const repl: string[] = [];
				const lenOps: number = piece.caseOps.length;
				let opIdx: number = 0;
				for (let idx: number = 0, len: number = match.length; idx < len; idx++) {
					if (opIdx >= lenOps) {
						repl.push(match.slice(idx));
						break;
					}
					switch (piece.caseOps[opIdx]) {
						case 'U':
							repl.push(match[idx].toUpperCase());
							break;
						case 'u':
							repl.push(match[idx].toUpperCase());
							opIdx++;
							break;
						case 'L':
							repl.push(match[idx].toLowerCase());
							break;
						case 'l':
							repl.push(match[idx].toLowerCase());
							opIdx++;
							break;
						default:
							repl.push(match[idx]);
					}
				}
				match = repl.join('');
			}
			result += match;
		}

		return result;
	}

	private static _substitute(matchIndex: number, matches: string[] | null): string {
		if (matches === null) {
			return '';
		}
		if (matchIndex === 0) {
			return matches[0];
		}

		let remainder = '';
		while (matchIndex > 0) {
			if (matchIndex < matches.length) {
				// A match can be undefined
				const match = (matches[matchIndex] || '');
				return match + remainder;
			}
			remainder = String(matchIndex % 10) + remainder;
			matchIndex = Math.floor(matchIndex / 10);
		}
		return '$' + remainder;
	}

	private static _substituteNamedGroup(groupName: string, groups: { [key: string]: string } | null | undefined): string {
		if (!groups) {
			return '';
		}
		const value = groups[groupName];
		return value ?? '';
	}
}

/**
 * A replace piece can either be a static string or an index to a specific match.
 */
export class ReplacePiece {

	public static staticValue(value: string): ReplacePiece {
		return new ReplacePiece(value, -1, null, null);
	}

	public static matchIndex(index: number): ReplacePiece {
		return new ReplacePiece(null, index, null, null);
	}

	public static caseOps(index: number, caseOps: string[]): ReplacePiece {
		return new ReplacePiece(null, index, caseOps, null);
	}

	public static namedGroup(name: string, caseOps: string[]): ReplacePiece {
		return new ReplacePiece(null, -1, caseOps, name);
	}

	public readonly staticValue: string | null;
	public readonly matchIndex: number;
	public readonly caseOps: string[] | null;
	public readonly groupName: string | null;

	private constructor(staticValue: string | null, matchIndex: number, caseOps: string[] | null, groupName: string | null) {
		this.staticValue = staticValue;
		this.matchIndex = matchIndex;
		this.groupName = groupName;
		if (!caseOps || caseOps.length === 0) {
			this.caseOps = null;
		} else {
			this.caseOps = caseOps.slice(0);
		}
	}
}

class ReplacePieceBuilder {

	private readonly _source: string;
	private _lastCharIndex: number;
	private readonly _result: ReplacePiece[];
	private _resultLen: number;
	private _currentStaticPiece: string;

	constructor(source: string) {
		this._source = source;
		this._lastCharIndex = 0;
		this._result = [];
		this._resultLen = 0;
		this._currentStaticPiece = '';
	}

	public emitUnchanged(toCharIndex: number): void {
		this._emitStatic(this._source.substring(this._lastCharIndex, toCharIndex));
		this._lastCharIndex = toCharIndex;
	}

	public emitStatic(value: string, toCharIndex: number): void {
		this._emitStatic(value);
		this._lastCharIndex = toCharIndex;
	}

	private _emitStatic(value: string): void {
		if (value.length === 0) {
			return;
		}
		this._currentStaticPiece += value;
	}

	public emitMatchIndex(index: number, toCharIndex: number, caseOps: string[]): void {
		if (this._currentStaticPiece.length !== 0) {
			this._result[this._resultLen++] = ReplacePiece.staticValue(this._currentStaticPiece);
			this._currentStaticPiece = '';
		}
		this._result[this._resultLen++] = ReplacePiece.caseOps(index, caseOps);
		this._lastCharIndex = toCharIndex;
	}

	public emitNamedGroup(name: string, toCharIndex: number, caseOps: string[]): void {
		if (this._currentStaticPiece.length !== 0) {
			this._result[this._resultLen++] = ReplacePiece.staticValue(this._currentStaticPiece);
			this._currentStaticPiece = '';
		}
		this._result[this._resultLen++] = ReplacePiece.namedGroup(name, caseOps);
		this._lastCharIndex = toCharIndex;
	}

	public finalize(): ReplacePattern {
		this.emitUnchanged(this._source.length);
		if (this._currentStaticPiece.length !== 0) {
			this._result[this._resultLen++] = ReplacePiece.staticValue(this._currentStaticPiece);
			this._currentStaticPiece = '';
		}
		return new ReplacePattern(this._result);
	}
}

/**
 * \n			=> inserts a LF
 * \t			=> inserts a TAB
 * \\			=> inserts a "\".
 * \u			=> upper-cases one character in a match.
 * \U			=> upper-cases ALL remaining characters in a match.
 * \l			=> lower-cases one character in a match.
 * \L			=> lower-cases ALL remaining characters in a match.
 * $$			=> inserts a "$".
 * $& and $0	=> inserts the matched substring.
 * $n			=> Where n is a non-negative integer lesser than 100, inserts the nth parenthesized submatch string
 * ${name}		=> inserts the named capture group value
 * everything else stays untouched
 *
 * Also see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter
 */
export function parseReplaceString(replaceString: string): ReplacePattern {
	if (!replaceString || replaceString.length === 0) {
		return new ReplacePattern(null);
	}

	const caseOps: string[] = [];
	const result = new ReplacePieceBuilder(replaceString);

	for (let i = 0, len = replaceString.length; i < len; i++) {
		const chCode = replaceString.charCodeAt(i);

		if (chCode === CharCode.Backslash) {

			// move to next char
			i++;

			if (i >= len) {
				// string ends with a \
				break;
			}

			const nextChCode = replaceString.charCodeAt(i);
			// let replaceWithCharacter: string | null = null;

			switch (nextChCode) {
				case CharCode.Backslash:
					// \\ => inserts a "\"
					result.emitUnchanged(i - 1);
					result.emitStatic('\\', i + 1);
					break;
				case CharCode.n:
					// \n => inserts a LF
					result.emitUnchanged(i - 1);
					result.emitStatic('\n', i + 1);
					break;
				case CharCode.t:
					// \t => inserts a TAB
					result.emitUnchanged(i - 1);
					result.emitStatic('\t', i + 1);
					break;
				// Case modification of string replacements, patterned after Boost, but only applied
				// to the replacement text, not subsequent content.
				case CharCode.u:
				// \u => upper-cases one character.
				case CharCode.U:
				// \U => upper-cases ALL following characters.
				case CharCode.l:
				// \l => lower-cases one character.
				case CharCode.L:
					// \L => lower-cases ALL following characters.
					result.emitUnchanged(i - 1);
					result.emitStatic('', i + 1);
					caseOps.push(String.fromCharCode(nextChCode));
					break;
			}

			continue;
		}

		if (chCode === CharCode.DollarSign) {

			// move to next char
			i++;

			if (i >= len) {
				// string ends with a $
				break;
			}

			const nextChCode = replaceString.charCodeAt(i);

			if (nextChCode === CharCode.DollarSign) {
				// $$ => inserts a "$"
				result.emitUnchanged(i - 1);
				result.emitStatic('$', i + 1);
				continue;
			}

			if (nextChCode === CharCode.Digit0 || nextChCode === CharCode.Ampersand) {
				// $& and $0 => inserts the matched substring.
				result.emitUnchanged(i - 1);
				result.emitMatchIndex(0, i + 1, caseOps);
				caseOps.length = 0;
				continue;
			}

			if (CharCode.Digit1 <= nextChCode && nextChCode <= CharCode.Digit9) {
				// $n

				let matchIndex = nextChCode - CharCode.Digit0;

				// peek next char to probe for $nn
				if (i + 1 < len) {
					const nextNextChCode = replaceString.charCodeAt(i + 1);
					if (CharCode.Digit0 <= nextNextChCode && nextNextChCode <= CharCode.Digit9) {
						// $nn

						// move to next char
						i++;
						matchIndex = matchIndex * 10 + (nextNextChCode - CharCode.Digit0);

						result.emitUnchanged(i - 2);
						result.emitMatchIndex(matchIndex, i + 1, caseOps);
						caseOps.length = 0;
						continue;
					}
				}

				result.emitUnchanged(i - 1);
				result.emitMatchIndex(matchIndex, i + 1, caseOps);
				caseOps.length = 0;
				continue;
			}

			if (nextChCode === CharCode.OpenCurlyBrace) {
				// ${name} - named capture group reference
				const closeBraceIndex = replaceString.indexOf('}', i + 1);
				if (closeBraceIndex !== -1) {
					const groupName = replaceString.substring(i + 1, closeBraceIndex);
					if (groupName.length > 0 && isValidIdentifier(groupName)) {
						result.emitUnchanged(i - 1);
						result.emitNamedGroup(groupName, closeBraceIndex + 1, caseOps);
						caseOps.length = 0;
						i = closeBraceIndex; // move past the closing brace
						continue;
					}
				}
				// Invalid or empty name, treat as literal
			}
		}
	}

	return result.finalize();
}

function isValidIdentifier(str: string): boolean {
	// Valid identifier: starts with a letter or underscore, contains only letters, digits, underscores
	if (str.length === 0) {
		return false;
	}
	const firstCh = str.charCodeAt(0);
	// First char must be letter (a-z, A-Z) or underscore
	const isLetter = (firstCh >= CharCode.a && firstCh <= CharCode.z) || (firstCh >= CharCode.A && firstCh <= CharCode.Z);
	if (!isLetter && firstCh !== CharCode.Underline) {
		return false;
	}
	// Rest can be letter, digit, or underscore
	for (let i = 1; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		const isLetterOrDigit = (ch >= CharCode.a && ch <= CharCode.z) || (ch >= CharCode.A && ch <= CharCode.Z) || (ch >= CharCode.Digit0 && ch <= CharCode.Digit9);
		if (!isLetterOrDigit && ch !== CharCode.Underline) {
			return false;
		}
	}
	return true;
}
