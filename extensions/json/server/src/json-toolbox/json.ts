/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export enum ScanError {
	None,
	UnexpectedEndOfComment,
	UnexpectedEndOfString,
	UnexpectedEndOfNumber,
	InvalidUnicode,
	InvalidEscapeCharacter
}

export enum SyntaxKind {
	Unknown = 0,
	OpenBraceToken,
	CloseBraceToken,
	OpenBracketToken,
	CloseBracketToken,
	CommaToken,
	ColonToken,
	NullKeyword,
	TrueKeyword,
	FalseKeyword,
	StringLiteral,
	NumericLiteral,
	LineCommentTrivia,
	BlockCommentTrivia,
	LineBreakTrivia,
	Trivia,
	EOF
}

export interface JSONScanner {
	scan(): SyntaxKind;
	getPosition(): number;
	getToken(): SyntaxKind;
	getTokenValue(): string;
	getTokenOffset(): number;
	getTokenLength(): number;
	getTokenError(): ScanError;
}

export function createScanner(text:string, ignoreTrivia:boolean = false):JSONScanner {

	var pos = 0,
		len = text.length,
		value:string = '',
		tokenOffset = 0,
		token:SyntaxKind = SyntaxKind.Unknown,
		scanError:ScanError = ScanError.None;

	function scanHexDigits(count: number, exact?: boolean): number {
		var digits = 0;
		var value = 0;
		while (digits < count || !exact) {
			var ch = text.charCodeAt(pos);
			if (ch >= CharacterCodes._0 && ch <= CharacterCodes._9) {
				value = value * 16 + ch - CharacterCodes._0;
			}
			else if (ch >= CharacterCodes.A && ch <= CharacterCodes.F) {
				value = value * 16 + ch - CharacterCodes.A + 10;
			}
			else if (ch >= CharacterCodes.a && ch <= CharacterCodes.f) {
				value = value * 16 + ch - CharacterCodes.a + 10;
			}
			else {
				break;
			}
			pos++;
			digits++;
		}
		if (digits < count) {
			value = -1;
		}
		return value;
	}

	function scanNumber(): string {
		var start = pos;
		if (text.charCodeAt(pos) === CharacterCodes._0) {
			pos++;
		} else {
			pos++;
			while (pos < text.length && isDigit(text.charCodeAt(pos))) {
				pos++;
			}
		}
		if (pos < text.length && text.charCodeAt(pos) === CharacterCodes.dot) {
			pos++;
			if (pos < text.length && isDigit(text.charCodeAt(pos))) {
				pos++;
				while (pos < text.length && isDigit(text.charCodeAt(pos))) {
					pos++;
				}
			} else {
				scanError = ScanError.UnexpectedEndOfNumber;
				return text.substring(start, end);
			}
		}
		var end = pos;
		if (pos < text.length && (text.charCodeAt(pos) === CharacterCodes.E || text.charCodeAt(pos) === CharacterCodes.e)) {
			pos++;
			if (pos < text.length && text.charCodeAt(pos) === CharacterCodes.plus || text.charCodeAt(pos) === CharacterCodes.minus) {
				pos++;
			}
			if (pos < text.length && isDigit(text.charCodeAt(pos))) {
				pos++;
				while (pos < text.length && isDigit(text.charCodeAt(pos))) {
					pos++;
				}
				end = pos;
			} else {
				scanError = ScanError.UnexpectedEndOfNumber;
			}
		}
		return text.substring(start, end);
	}

	function scanString(): string {

		var result = '',
			start = pos;

		while (true) {
			if (pos >= len) {
				result += text.substring(start, pos);
				scanError = ScanError.UnexpectedEndOfString;
				break;
			}
			var ch = text.charCodeAt(pos);
			if (ch === CharacterCodes.doubleQuote) {
				result += text.substring(start, pos);
				pos++;
				break;
			}
			if (ch === CharacterCodes.backslash) {
				result += text.substring(start, pos);
				pos++;
				if (pos >= len) {
					scanError = ScanError.UnexpectedEndOfString;
					break;
				}
				ch = text.charCodeAt(pos++);
				switch (ch) {
					case CharacterCodes.doubleQuote:
						result += '\"';
						break;
					case CharacterCodes.backslash:
						result += '\\';
						break;
					case CharacterCodes.slash:
						result += '/';
						break;
					case CharacterCodes.b:
						result += '\b';
						break;
					case CharacterCodes.f:
						result += '\f';
						break;
					case CharacterCodes.n:
						result += '\n';
						break;
					case CharacterCodes.r:
						result += '\r';
						break;
					case CharacterCodes.t:
						result += '\t';
						break;
					case CharacterCodes.u:
						var ch = scanHexDigits(4, true);
						if (ch >= 0) {
							result += String.fromCharCode(ch);
						} else {
							scanError = ScanError.InvalidUnicode;
						}
						break;
					default:
						scanError = ScanError.InvalidEscapeCharacter;
				}
				start = pos;
				continue;
			}
			if (isLineBreak(ch)) {
				result += text.substring(start, pos);
				scanError = ScanError.UnexpectedEndOfString;
				break;
			}
			pos++;
		}
		return result;
	}

	function scanNext():SyntaxKind {

		value = '';
		scanError = ScanError.None;

		tokenOffset = pos;

		if(pos >= len) {
			// at the end
			tokenOffset = len;
			return token = SyntaxKind.EOF;
		}

		var code = text.charCodeAt(pos);
		// trivia: whitespace
		if (isWhiteSpace(code)) {
			do {
				pos++;
				value += String.fromCharCode(code);
				code = text.charCodeAt(pos);
			} while (isWhiteSpace(code));

			return token = SyntaxKind.Trivia;
		}

		// trivia: newlines
		if (isLineBreak(code)) {
			pos++;
			value += String.fromCharCode(code);
			if (code === CharacterCodes.carriageReturn && text.charCodeAt(pos) === CharacterCodes.lineFeed) {
				pos++;
				value += '\n';
			}
			return token = SyntaxKind.LineBreakTrivia;
		}

		switch(code) {
			// tokens: []{}:,
			case CharacterCodes.openBrace:
				pos++;
				return token = SyntaxKind.OpenBraceToken;
			case CharacterCodes.closeBrace:
				pos++;
				return token = SyntaxKind.CloseBraceToken;
			case CharacterCodes.openBracket:
				pos++;
				return token = SyntaxKind.OpenBracketToken;
			case CharacterCodes.closeBracket:
				pos++;
				return token = SyntaxKind.CloseBracketToken;
			case CharacterCodes.colon:
				pos++;
				return token = SyntaxKind.ColonToken;
			case CharacterCodes.comma:
				pos++;
				return token = SyntaxKind.CommaToken;

			// strings
			case CharacterCodes.doubleQuote:
				pos++;
				value = scanString();
				return token = SyntaxKind.StringLiteral;

			// comments
			case CharacterCodes.slash:
				var start = pos - 1;
				// Single-line comment
				if (text.charCodeAt(pos + 1) === CharacterCodes.slash) {
					pos += 2;

					while (pos < len) {
						if (isLineBreak(text.charCodeAt(pos))) {
							break;
						}
						pos++;

					}
					value = text.substring(start, pos);
					return token = SyntaxKind.LineCommentTrivia;
				}

				// Multi-line comment
				if (text.charCodeAt(pos + 1) === CharacterCodes.asterisk) {
					pos += 2;

					var safeLength = len - 1; // For lookahead.
					var commentClosed = false;
					while (pos < safeLength) {
						var ch = text.charCodeAt(pos);

						if (ch === CharacterCodes.asterisk && text.charCodeAt(pos + 1) === CharacterCodes.slash) {
							pos += 2;
							commentClosed = true;
							break;
						}
						pos++;
					}

					if (!commentClosed) {
						pos++;
						scanError = ScanError.UnexpectedEndOfComment;
					}

					value = text.substring(start, pos);
					return token = SyntaxKind.BlockCommentTrivia;
				}
				// just a single slash
				value += String.fromCharCode(code);
				pos++;
				return token = SyntaxKind.Unknown;

			// numbers
			case CharacterCodes.minus:
				value += String.fromCharCode(code);
				pos++;
				if (pos === len || !isDigit(text.charCodeAt(pos))) {
					return token = SyntaxKind.Unknown;
				}
				// found a minus, followed by a number so
				// we fall through to proceed with scanning
				// numbers
			case CharacterCodes._0:
			case CharacterCodes._1:
			case CharacterCodes._2:
			case CharacterCodes._3:
			case CharacterCodes._4:
			case CharacterCodes._5:
			case CharacterCodes._6:
			case CharacterCodes._7:
			case CharacterCodes._8:
			case CharacterCodes._9:
				value += scanNumber();
				return token = SyntaxKind.NumericLiteral;
			// literals and unknown symbols
			default:
				// is a literal? Read the full word.
				while (pos < len && isUnknownContentCharacter(code)) {
					pos++;
					code = text.charCodeAt(pos);
				}
				if (tokenOffset !== pos) {
					value = text.substring(tokenOffset, pos);
					// keywords: true, false, null
					switch (value) {
						case 'true': return token = SyntaxKind.TrueKeyword;
						case 'false': return token = SyntaxKind.FalseKeyword;
						case 'null': return token = SyntaxKind.NullKeyword;
					}
					return token = SyntaxKind.Unknown;
				}
				// some
				value += String.fromCharCode(code);
				pos++;
				return token = SyntaxKind.Unknown;
		}
	}

	function isUnknownContentCharacter(code: CharacterCodes) {
		if (isWhiteSpace(code) || isLineBreak(code)) {
			return false;
		}
		switch (code) {
			case CharacterCodes.closeBrace:
			case CharacterCodes.closeBracket:
			case CharacterCodes.openBrace:
			case CharacterCodes.openBracket:
			case CharacterCodes.doubleQuote:
			case CharacterCodes.colon:
			case CharacterCodes.comma:
				return false;
		}
		return true;
	}


	function scanNextNonTrivia():SyntaxKind {
		var result : SyntaxKind;
		do {
			result = scanNext();
		} while (result >= SyntaxKind.LineCommentTrivia && result <= SyntaxKind.Trivia);
		return result;
	}

	return {
		getPosition: () => pos,
		scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
		getToken: () => token,
		getTokenValue: () => value,
		getTokenOffset: () => tokenOffset,
		getTokenLength: () => pos - tokenOffset,
		getTokenError: () => scanError
	};
}

function isWhiteSpace(ch: number): boolean {
	return ch === CharacterCodes.space || ch === CharacterCodes.tab || ch === CharacterCodes.verticalTab || ch === CharacterCodes.formFeed ||
		ch === CharacterCodes.nonBreakingSpace || ch === CharacterCodes.ogham || ch >= CharacterCodes.enQuad && ch <= CharacterCodes.zeroWidthSpace ||
		ch === CharacterCodes.narrowNoBreakSpace || ch === CharacterCodes.mathematicalSpace || ch === CharacterCodes.ideographicSpace || ch === CharacterCodes.byteOrderMark;
}

function isLineBreak(ch: number): boolean {
	return ch === CharacterCodes.lineFeed || ch === CharacterCodes.carriageReturn || ch === CharacterCodes.lineSeparator || ch === CharacterCodes.paragraphSeparator;
}

function isDigit(ch: number): boolean {
	return ch >= CharacterCodes._0 && ch <= CharacterCodes._9;
}

export function isLetter(ch: number): boolean {
	return ch >= CharacterCodes.a && ch <= CharacterCodes.z || ch >= CharacterCodes.A && ch <= CharacterCodes.Z;
}

enum CharacterCodes {
	nullCharacter = 0,
	maxAsciiCharacter = 0x7F,

	lineFeed = 0x0A,              // \n
	carriageReturn = 0x0D,        // \r
	lineSeparator = 0x2028,
	paragraphSeparator = 0x2029,

	// REVIEW: do we need to support this?  The scanner doesn't, but our IText does.  This seems
	// like an odd disparity?  (Or maybe it's completely fine for them to be different).
	nextLine = 0x0085,

	// Unicode 3.0 space characters
	space = 0x0020,   // " "
	nonBreakingSpace = 0x00A0,   //
	enQuad = 0x2000,
	emQuad = 0x2001,
	enSpace = 0x2002,
	emSpace = 0x2003,
	threePerEmSpace = 0x2004,
	fourPerEmSpace = 0x2005,
	sixPerEmSpace = 0x2006,
	figureSpace = 0x2007,
	punctuationSpace = 0x2008,
	thinSpace = 0x2009,
	hairSpace = 0x200A,
	zeroWidthSpace = 0x200B,
	narrowNoBreakSpace = 0x202F,
	ideographicSpace = 0x3000,
	mathematicalSpace = 0x205F,
	ogham = 0x1680,

	_ = 0x5F,
	$ = 0x24,

	_0 = 0x30,
	_1 = 0x31,
	_2 = 0x32,
	_3 = 0x33,
	_4 = 0x34,
	_5 = 0x35,
	_6 = 0x36,
	_7 = 0x37,
	_8 = 0x38,
	_9 = 0x39,

	a = 0x61,
	b = 0x62,
	c = 0x63,
	d = 0x64,
	e = 0x65,
	f = 0x66,
	g = 0x67,
	h = 0x68,
	i = 0x69,
	j = 0x6A,
	k = 0x6B,
	l = 0x6C,
	m = 0x6D,
	n = 0x6E,
	o = 0x6F,
	p = 0x70,
	q = 0x71,
	r = 0x72,
	s = 0x73,
	t = 0x74,
	u = 0x75,
	v = 0x76,
	w = 0x77,
	x = 0x78,
	y = 0x79,
	z = 0x7A,

	A = 0x41,
	B = 0x42,
	C = 0x43,
	D = 0x44,
	E = 0x45,
	F = 0x46,
	G = 0x47,
	H = 0x48,
	I = 0x49,
	J = 0x4A,
	K = 0x4B,
	L = 0x4C,
	M = 0x4D,
	N = 0x4E,
	O = 0x4F,
	P = 0x50,
	Q = 0x51,
	R = 0x52,
	S = 0x53,
	T = 0x54,
	U = 0x55,
	V = 0x56,
	W = 0x57,
	X = 0x58,
	Y = 0x59,
	Z = 0x5a,

	ampersand = 0x26,             // &
	asterisk = 0x2A,              // *
	at = 0x40,                    // @
	backslash = 0x5C,             // \
	bar = 0x7C,                   // |
	caret = 0x5E,                 // ^
	closeBrace = 0x7D,            // }
	closeBracket = 0x5D,          // ]
	closeParen = 0x29,            // )
	colon = 0x3A,                 // :
	comma = 0x2C,                 // ,
	dot = 0x2E,                   // .
	doubleQuote = 0x22,           // "
	equals = 0x3D,                // =
	exclamation = 0x21,           // !
	greaterThan = 0x3E,           // >
	lessThan = 0x3C,              // <
	minus = 0x2D,                 // -
	openBrace = 0x7B,             // {
	openBracket = 0x5B,           // [
	openParen = 0x28,             // (
	percent = 0x25,               // %
	plus = 0x2B,                  // +
	question = 0x3F,              // ?
	semicolon = 0x3B,             // ;
	singleQuote = 0x27,           // '
	slash = 0x2F,                 // /
	tilde = 0x7E,                 // ~

	backspace = 0x08,             // \b
	formFeed = 0x0C,              // \f
	byteOrderMark = 0xFEFF,
	tab = 0x09,                   // \t
	verticalTab = 0x0B,           // \v
}


/**
 * Takes JSON with JavaScript-style comments and remove
 * them. Optionally replaces every none-newline character
 * of comments with a replaceCharacter
 */
export function stripComments(text:string, replaceCh?:string):string {

	var _scanner = createScanner(text),
		parts: string[] = [],
		kind:SyntaxKind,
		offset = 0,
		pos:number;

	do {
		pos = _scanner.getPosition();
		kind = _scanner.scan();
		switch (kind) {
			case SyntaxKind.LineCommentTrivia:
			case SyntaxKind.BlockCommentTrivia:
			case SyntaxKind.EOF:
				if(offset !== pos) {
					parts.push(text.substring(offset, pos));
				}
				if(replaceCh !== void 0) {
					parts.push(_scanner.getTokenValue().replace(/[^\r\n]/g, replaceCh));
				}
				offset = _scanner.getPosition();
				break;
		}
	} while(kind !== SyntaxKind.EOF);

	return parts.join('');
}

export enum ParseErrorCode {
	InvalidSymbol,
	InvalidNumberFormat,
	PropertyNameExpected,
	ValueExpected,
	ColonExpected,
	CommaExpected,
	CloseBraceExpected,
	CloseBracketExpected,
	EndOfFileExpected
}

export function getParseErrorMessage(errorCode: ParseErrorCode) : string {
	switch (errorCode) {
		case ParseErrorCode.InvalidSymbol: return 'Invalid symbol';
		case ParseErrorCode.InvalidNumberFormat: return 'Invalid number format';
		case ParseErrorCode.PropertyNameExpected: return 'Property name expected';
		case ParseErrorCode.ValueExpected: return 'Value expected';
		case ParseErrorCode.ColonExpected: return 'Colon expected';
		case ParseErrorCode.CommaExpected: return 'Comma expected';
		case ParseErrorCode.CloseBraceExpected: return 'Closing brace expected';
		case ParseErrorCode.CloseBracketExpected: return 'Closing bracket expected';
		case ParseErrorCode.EndOfFileExpected: return 'End of file expected';
		default:
			return '';
	}
}


export function parse(text:string, errors: { error:ParseErrorCode; }[] = []) : any {
	var noMatch = Object();
	var _scanner = createScanner(text, true);

	function scanNext() : SyntaxKind {
		var token = _scanner.scan();
		while (token === SyntaxKind.Unknown) {
			handleError(ParseErrorCode.InvalidSymbol);
			token = _scanner.scan();
		}
		return token;
	}

	function handleError(error:ParseErrorCode, skipUntilAfter: SyntaxKind[] = [], skipUntil: SyntaxKind[] = []) : void {
		errors.push({ error: error });
		if (skipUntilAfter.length + skipUntil.length > 0) {
			var token = _scanner.getToken();
			while (token !== SyntaxKind.EOF) {
				if (skipUntilAfter.indexOf(token) !== -1) {
					scanNext();
					break;
				} else if (skipUntil.indexOf(token) !== -1) {
					break;
				}
				token = scanNext();
			}
		}
	}

	function parseString() : any {
		if (_scanner.getToken() !== SyntaxKind.StringLiteral) {
			return noMatch;
		}
		var value = _scanner.getTokenValue();
		scanNext();
		return value;
	}

	function parseLiteral() : any {
		var value : any;
		switch (_scanner.getToken()) {
			case SyntaxKind.NumericLiteral:
				try {
					value = JSON.parse(_scanner.getTokenValue());
					if (typeof value !== 'number') {
						handleError(ParseErrorCode.InvalidNumberFormat);
						value = 0;
					}
				} catch (e) {
					value = 0;
				}
				break;
			case SyntaxKind.NullKeyword:
				value = null;
				break;
			case SyntaxKind.TrueKeyword:
				value = true;
				break;
			case SyntaxKind.FalseKeyword:
				value = false;
				break;
			default:
				return noMatch;
		}
		scanNext();
		return value;
	}

	function parseProperty(result: any) : any {
		var key = parseString();
		if (key === noMatch) {
			handleError(ParseErrorCode.PropertyNameExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken] );
			return false;
		}
		if (_scanner.getToken() === SyntaxKind.ColonToken) {
			scanNext(); // consume colon

			var value = parseValue();
			if (value !== noMatch) {
				result[key] = value;
			} else {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken] );
			}
		} else {
			handleError(ParseErrorCode.ColonExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken] );
		}
		return true;
	}

	function parseObject() : any {
		if (_scanner.getToken() !== SyntaxKind.OpenBraceToken) {
			return noMatch;
		}
		var obj = {};
		scanNext(); // consume open brace

		var needsComma = false;
		while (_scanner.getToken() !== SyntaxKind.CloseBraceToken && _scanner.getToken() !== SyntaxKind.EOF) {
			if (_scanner.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handleError(ParseErrorCode.ValueExpected, [], [] );
				}
				scanNext(); // consume comma
			} else if (needsComma) {
				handleError(ParseErrorCode.CommaExpected, [], [] );
			}
			var propertyParsed = parseProperty(obj);
			if (!propertyParsed) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken] );
			}
			needsComma = true;
		}

		if (_scanner.getToken() !== SyntaxKind.CloseBraceToken) {
			handleError(ParseErrorCode.CloseBraceExpected, [SyntaxKind.CloseBraceToken], []);
		} else {
			scanNext(); // consume close brace
		}
		return obj;
	}

	function parseArray() : any {
		if (_scanner.getToken() !== SyntaxKind.OpenBracketToken) {
			return noMatch;
		}
		var arr: any[] = [];
		scanNext(); // consume open bracket

		var needsComma = false;
		while (_scanner.getToken() !== SyntaxKind.CloseBracketToken && _scanner.getToken() !== SyntaxKind.EOF) {
			if (_scanner.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handleError(ParseErrorCode.ValueExpected, [], [] );
				}
				scanNext(); // consume comma
			} else if (needsComma) {
				handleError(ParseErrorCode.CommaExpected, [], [] );
			}
			var value = parseValue();
			if (value === noMatch) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBracketToken, SyntaxKind.CommaToken] );
			} else {
				arr.push(value);
			}
			needsComma = true;
		}

		if (_scanner.getToken() !== SyntaxKind.CloseBracketToken) {
			handleError(ParseErrorCode.CloseBracketExpected, [SyntaxKind.CloseBracketToken], []);
		} else {
			scanNext(); // consume close bracket
		}
		return arr;
	}

	function parseValue() : any {
		var result = parseArray();
		if (result !== noMatch) {
			return result;
		}
		result = parseObject();
		if (result !== noMatch) {
			return result;
		}
		result = parseString();
		if (result !== noMatch) {
			return result;
		}
		return parseLiteral();
	}

	scanNext();
	var value = parseValue();
	if (value === noMatch) {
		handleError(ParseErrorCode.ValueExpected, [], []);
		return void 0;
	}
	if (_scanner.getToken() !== SyntaxKind.EOF) {
		handleError(ParseErrorCode.EndOfFileExpected, [], []);
	}
	return value;
}