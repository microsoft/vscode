/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';

export enum ScanError {
	None,
	UnexpectedEndOfComment,
	UnexpectedEndOfString,
	UnexpectedEndOfNumber,
	InvalidUnicode,
	InvalidEscapeCharacter,
	InvalidCharacter
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

/**
 * The scanner object, representing a JSON scanner at a position in the input string.
 */
export interface JSONScanner {
	/**
	 * Sets the scan position to a new offset. A call to 'scan' is needed to get the first token.
	 */
	setPosition(pos: number): void;
	/**
	 * Read the next token. Returns the tolen code.
	 */
	scan(): SyntaxKind;
	/**
	 * Returns the current scan position, which is after the last read token.
	 */
	getPosition(): number;
	/**
	 * Returns the last read token.
	 */
	getToken(): SyntaxKind;
	/**
	 * Returns the last read token value. The value for strings is the decoded string content. For numbers its of type number, for boolean it's true or false.
	 */
	getTokenValue(): string;
	/**
	 * The start offset of the last read token.
	 */
	getTokenOffset(): number;
	/**
	 * The length of the last read token.
	 */
	getTokenLength(): number;
	/**
	 * An error code of the last scan.
	 */
	getTokenError(): ScanError;
}
/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
export function createScanner(text: string, ignoreTrivia: boolean = false): JSONScanner {

	let pos = 0,
		len = text.length,
		value: string = '',
		tokenOffset = 0,
		token: SyntaxKind = SyntaxKind.Unknown,
		scanError: ScanError = ScanError.None;

	function scanHexDigits(count: number, exact?: boolean): number {
		let digits = 0;
		let value = 0;
		while (digits < count || !exact) {
			let ch = text.charCodeAt(pos);
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

	function setPosition(newPosition: number) {
		pos = newPosition;
		value = '';
		tokenOffset = 0;
		token = SyntaxKind.Unknown;
		scanError = ScanError.None;
	}

	function scanNumber(): string {
		let start = pos;
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
				return text.substring(start, pos);
			}
		}
		let end = pos;
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

		let result = '',
			start = pos;

		while (true) {
			if (pos >= len) {
				result += text.substring(start, pos);
				scanError = ScanError.UnexpectedEndOfString;
				break;
			}
			let ch = text.charCodeAt(pos);
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
						let ch = scanHexDigits(4, true);
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
			if (ch >= 0 && ch <= 0x1f) {
				if (isLineBreak(ch)) {
					result += text.substring(start, pos);
					scanError = ScanError.UnexpectedEndOfString;
					break;
				} else {
					scanError = ScanError.InvalidCharacter;
					break;
				}
			}
			pos++;
		}
		return result;
	}

	function scanNext(): SyntaxKind {

		value = '';
		scanError = ScanError.None;

		tokenOffset = pos;

		if (pos >= len) {
			// at the end
			tokenOffset = len;
			return token = SyntaxKind.EOF;
		}

		let code = text.charCodeAt(pos);
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

		switch (code) {
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
				let start = pos - 1;
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

					let safeLength = len - 1; // For lookahead.
					let commentClosed = false;
					while (pos < safeLength) {
						let ch = text.charCodeAt(pos);

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


	function scanNextNonTrivia(): SyntaxKind {
		let result: SyntaxKind;
		do {
			result = scanNext();
		} while (result >= SyntaxKind.LineCommentTrivia && result <= SyntaxKind.Trivia);
		return result;
	}

	return {
		setPosition: setPosition,
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

const enum CharacterCodes {
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
export function stripComments(text: string, replaceCh?: string): string {

	let _scanner = createScanner(text),
		parts: string[] = [],
		kind: SyntaxKind,
		offset = 0,
		pos: number;

	do {
		pos = _scanner.getPosition();
		kind = _scanner.scan();
		switch (kind) {
			case SyntaxKind.LineCommentTrivia:
			case SyntaxKind.BlockCommentTrivia:
			case SyntaxKind.EOF:
				if (offset !== pos) {
					parts.push(text.substring(offset, pos));
				}
				if (replaceCh !== void 0) {
					parts.push(_scanner.getTokenValue().replace(/[^\r\n]/g, replaceCh));
				}
				offset = _scanner.getPosition();
				break;
		}
	} while (kind !== SyntaxKind.EOF);

	return parts.join('');
}

export interface ParseError {
	error: ParseErrorCode;
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

export function getParseErrorMessage(errorCode: ParseErrorCode): string {
	switch (errorCode) {
		case ParseErrorCode.InvalidSymbol: return localize('error.invalidSymbol', 'Invalid symbol');
		case ParseErrorCode.InvalidNumberFormat: return localize('error.invalidNumberFormat', 'Invalid number format');
		case ParseErrorCode.PropertyNameExpected: return localize('error.propertyNameExpected', 'Property name expected');
		case ParseErrorCode.ValueExpected: return localize('error.valueExpected', 'Value expected');
		case ParseErrorCode.ColonExpected: return localize('error.colonExpected', 'Colon expected');
		case ParseErrorCode.CommaExpected: return localize('error.commaExpected', 'Comma expected');
		case ParseErrorCode.CloseBraceExpected: return localize('error.closeBraceExpected', 'Closing brace expected');
		case ParseErrorCode.CloseBracketExpected: return localize('error.closeBracketExpected', 'Closing bracket expected');
		case ParseErrorCode.EndOfFileExpected: return localize('error.endOfFileExpected', 'End of file expected');
		default:
			return '';
	}
}

export type NodeType = 'object' | 'array' | 'property' | 'string' | 'number' | 'boolean' | 'null';

function getLiteralNodeType(value: any): NodeType {
	switch (typeof value) {
		case 'boolean': return 'boolean';
		case 'number': return 'number';
		case 'string': return 'string';
		default: return 'null';
	}
}

export interface Node {
	type: NodeType;
	value?: any;
	offset: number;
	length: number;
	columnOffset?: number;
	parent?: Node;
	children?: Node[];
}

export type Segment = string | number;
export type JSONPath = Segment[];

export interface Location {
	/**
	 * The previous property key or literal value (string, number, boolean or null) or undefined.
	 */
	previousNode?: Node;
	/**
	 * The path describing the location in the JSON document. The path consists of a sequence strings
	 * representing an object property or numbers for array indices.
	 */
	path: JSONPath;
	/**
	 * Matches the locations path against a pattern consisting of strings (for properties) and numbers (for array indices).
	 * '*' will match a single segment, of any property name or index.
	 * '**' will match a sequece of segments or no segment, of any property name or index.
	 */
	matches: (patterns: JSONPath) => boolean;
	/**
	 * If set, the location's offset is at a property key.
	 */
	isAtPropertyKey: boolean;
}


/**
 * For a given offset, evaluate the location in the JSON document. Each segment in the location path is either a property name or an array index.
 */
export function getLocation(text: string, position: number): Location {
	let segments: any[] = []; // strings or numbers
	let earlyReturnException = new Object();
	let previousNode: Node = void 0;
	const previousNodeInst: Node = {
		value: void 0,
		offset: void 0,
		length: void 0,
		type: void 0
	};
	let isAtPropertyKey = false;
	function setPreviousNode(value: string, offset: number, length: number, type: NodeType) {
		previousNodeInst.value = value;
		previousNodeInst.offset = offset;
		previousNodeInst.length = length;
		previousNodeInst.type = type;
		previousNodeInst.columnOffset = void 0;
		previousNode = previousNodeInst;
	}
	try {

		visit(text, {
			onObjectBegin: (offset: number, length: number) => {
				if (position <= offset) {
					throw earlyReturnException;
				}
				previousNode = void 0;
				isAtPropertyKey = position > offset;
				segments.push(''); // push a placeholder (will be replaced)
			},
			onObjectProperty: (name: string, offset: number, length: number) => {
				if (position < offset) {
					throw earlyReturnException;
				}
				setPreviousNode(name, offset, length, 'property');
				segments[segments.length - 1] = name;
				if (position <= offset + length) {
					throw earlyReturnException;
				}
			},
			onObjectEnd: (offset: number, length: number) => {
				if (position <= offset) {
					throw earlyReturnException;
				}
				previousNode = void 0;
				segments.pop();
			},
			onArrayBegin: (offset: number, length: number) => {
				if (position <= offset) {
					throw earlyReturnException;
				}
				previousNode = void 0;
				segments.push(0);
			},
			onArrayEnd: (offset: number, length: number) => {
				if (position <= offset) {
					throw earlyReturnException;
				}
				previousNode = void 0;
				segments.pop();
			},
			onLiteralValue: (value: any, offset: number, length: number) => {
				if (position < offset) {
					throw earlyReturnException;
				}
				setPreviousNode(value, offset, length, getLiteralNodeType(value));

				if (position <= offset + length) {
					throw earlyReturnException;
				}
			},
			onSeparator: (sep: string, offset: number, length: number) => {
				if (position <= offset) {
					throw earlyReturnException;
				}
				if (sep === ':' && previousNode.type === 'property') {
					previousNode.columnOffset = offset;
					isAtPropertyKey = false;
					previousNode = void 0;
				} else if (sep === ',') {
					let last = segments[segments.length - 1];
					if (typeof last === 'number') {
						segments[segments.length - 1] = last + 1;
					} else {
						isAtPropertyKey = true;
						segments[segments.length - 1] = '';
					}
					previousNode = void 0;
				}
			}
		});
	} catch (e) {
		if (e !== earlyReturnException) {
			throw e;
		}
	}

	return {
		path: segments,
		previousNode,
		isAtPropertyKey,
		matches: (pattern: string[]) => {
			let k = 0;
			for (let i = 0; k < pattern.length && i < segments.length; i++) {
				if (pattern[k] === segments[i] || pattern[k] === '*') {
					k++;
				} else if (pattern[k] !== '**') {
					return false;
				}
			}
			return k === pattern.length;
		}
	};
}

export interface ParseOptions {
	disallowComments?: boolean;
	allowTrailingComma?: boolean;
}

/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore always check the errors list to find out if the input was valid.
 */
export function parse(text: string, errors: ParseError[] = [], options?: ParseOptions): any {
	let currentProperty: string = null;
	let currentParent: any = [];
	let previousParents: any[] = [];

	function onValue(value: any) {
		if (Array.isArray(currentParent)) {
			(<any[]>currentParent).push(value);
		} else if (currentProperty) {
			currentParent[currentProperty] = value;
		}
	}

	let visitor: JSONVisitor = {
		onObjectBegin: () => {
			let object = {};
			onValue(object);
			previousParents.push(currentParent);
			currentParent = object;
			currentProperty = null;
		},
		onObjectProperty: (name: string) => {
			currentProperty = name;
		},
		onObjectEnd: () => {
			currentParent = previousParents.pop();
		},
		onArrayBegin: () => {
			let array = [];
			onValue(array);
			previousParents.push(currentParent);
			currentParent = array;
			currentProperty = null;
		},
		onArrayEnd: () => {
			currentParent = previousParents.pop();
		},
		onLiteralValue: onValue,
		onError: (error: ParseErrorCode) => {
			errors.push({ error: error });
		}
	};
	visit(text, visitor, options);
	return currentParent[0];
}


/**
 * Parses the given text and returns a tree representation the JSON content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
export function parseTree(text: string, errors: ParseError[] = [], options?: ParseOptions): Node {
	let currentParent: Node = { type: 'array', offset: -1, length: -1, children: [] }; // artificial root

	function ensurePropertyComplete(endOffset: number) {
		if (currentParent.type === 'property') {
			currentParent.length = endOffset - currentParent.offset;
			currentParent = currentParent.parent;
		}
	}

	function onValue(valueNode: Node): Node {
		currentParent.children.push(valueNode);
		return valueNode;
	}

	let visitor: JSONVisitor = {
		onObjectBegin: (offset: number) => {
			currentParent = onValue({ type: 'object', offset, length: -1, parent: currentParent, children: [] });
		},
		onObjectProperty: (name: string, offset: number, length: number) => {
			currentParent = onValue({ type: 'property', offset, length: -1, parent: currentParent, children: [] });
			currentParent.children.push({ type: 'string', value: name, offset, length, parent: currentParent });
		},
		onObjectEnd: (offset: number, length: number) => {
			currentParent.length = offset + length - currentParent.offset;
			currentParent = currentParent.parent;
			ensurePropertyComplete(offset + length);
		},
		onArrayBegin: (offset: number, length: number) => {
			currentParent = onValue({ type: 'array', offset, length: -1, parent: currentParent, children: [] });
		},
		onArrayEnd: (offset: number, length: number) => {
			currentParent.length = offset + length - currentParent.offset;
			currentParent = currentParent.parent;
			ensurePropertyComplete(offset + length);
		},
		onLiteralValue: (value: any, offset: number, length: number) => {
			onValue({ type: getLiteralNodeType(value), offset, length, parent: currentParent, value });
			ensurePropertyComplete(offset + length);
		},
		onSeparator: (sep: string, offset: number, length: number) => {
			if (currentParent.type === 'property') {
				if (sep === ':') {
					currentParent.columnOffset = offset;
				} else if (sep === ',') {
					ensurePropertyComplete(offset);
				}
			}
		},
		onError: (error: ParseErrorCode) => {
			errors.push({ error: error });
		}
	};
	visit(text, visitor, options);

	let result = currentParent.children[0];
	if (result) {
		delete result.parent;
	}
	return result;
}

export function findNodeAtLocation(root: Node, path: JSONPath): Node {
	if (!root) {
		return void 0;
	}
	let node = root;
	for (let segment of path) {
		if (typeof segment === 'string') {
			if (node.type !== 'object') {
				return void 0;
			}
			let found = false;
			for (let propertyNode of node.children) {
				if (propertyNode.children[0].value === segment) {
					node = propertyNode.children[1];
					found = true;
					break;
				}
			}
			if (!found) {
				return void 0;
			}
		} else {
			let index = <number>segment;
			if (node.type !== 'array' || index < 0 || index >= node.children.length) {
				return void 0;
			}
			node = node.children[index];
		}
	}
	return node;
}

export function getNodeValue(node: Node): any {
	if (node.type === 'array') {
		return node.children.map(getNodeValue);
	} else if (node.type === 'object') {
		let obj = {};
		for (let prop of node.children) {
			obj[prop.children[0].value] = getNodeValue(prop.children[1]);
		}
		return obj;
	}
	return node.value;
}


/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
export function visit(text: string, visitor: JSONVisitor, options?: ParseOptions): any {

	let _scanner = createScanner(text, false);

	function toNoArgVisit(visitFunction: (offset: number, length: number) => void): () => void {
		return visitFunction ? () => visitFunction(_scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
	}
	function toOneArgVisit<T>(visitFunction: (arg: T, offset: number, length: number) => void): (arg: T) => void {
		return visitFunction ? (arg: T) => visitFunction(arg, _scanner.getTokenOffset(), _scanner.getTokenLength()) : () => true;
	}

	let onObjectBegin = toNoArgVisit(visitor.onObjectBegin),
		onObjectProperty = toOneArgVisit(visitor.onObjectProperty),
		onObjectEnd = toNoArgVisit(visitor.onObjectEnd),
		onArrayBegin = toNoArgVisit(visitor.onArrayBegin),
		onArrayEnd = toNoArgVisit(visitor.onArrayEnd),
		onLiteralValue = toOneArgVisit(visitor.onLiteralValue),
		onSeparator = toOneArgVisit(visitor.onSeparator),
		onError = toOneArgVisit(visitor.onError);

	let disallowComments = options && options.disallowComments;
	let allowTrailingComma = options && options.allowTrailingComma;
	function scanNext(): SyntaxKind {
		while (true) {
			let token = _scanner.scan();
			switch (token) {
				case SyntaxKind.LineCommentTrivia:
				case SyntaxKind.BlockCommentTrivia:
					if (disallowComments) {
						handleError(ParseErrorCode.InvalidSymbol);
					}
					break;
				case SyntaxKind.Unknown:
					handleError(ParseErrorCode.InvalidSymbol);
					break;
				case SyntaxKind.Trivia:
				case SyntaxKind.LineBreakTrivia:
					break;
				default:
					return token;
			}
		}
	}

	function handleError(error: ParseErrorCode, skipUntilAfter: SyntaxKind[] = [], skipUntil: SyntaxKind[] = []): void {
		onError(error);
		if (skipUntilAfter.length + skipUntil.length > 0) {
			let token = _scanner.getToken();
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

	function parseString(isValue: boolean): boolean {
		let value = _scanner.getTokenValue();
		if (isValue) {
			onLiteralValue(value);
		} else {
			onObjectProperty(value);
		}
		scanNext();
		return true;
	}

	function parseLiteral(): boolean {
		switch (_scanner.getToken()) {
			case SyntaxKind.NumericLiteral:
				let value = 0;
				try {
					value = JSON.parse(_scanner.getTokenValue());
					if (typeof value !== 'number') {
						handleError(ParseErrorCode.InvalidNumberFormat);
						value = 0;
					}
				} catch (e) {
					handleError(ParseErrorCode.InvalidNumberFormat);
				}
				onLiteralValue(value);
				break;
			case SyntaxKind.NullKeyword:
				onLiteralValue(null);
				break;
			case SyntaxKind.TrueKeyword:
				onLiteralValue(true);
				break;
			case SyntaxKind.FalseKeyword:
				onLiteralValue(false);
				break;
			default:
				return false;
		}
		scanNext();
		return true;
	}

	function parseProperty(): boolean {
		if (_scanner.getToken() !== SyntaxKind.StringLiteral) {
			handleError(ParseErrorCode.PropertyNameExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
			return false;
		}
		parseString(false);
		if (_scanner.getToken() === SyntaxKind.ColonToken) {
			onSeparator(':');
			scanNext(); // consume colon

			if (!parseValue()) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
			}
		} else {
			handleError(ParseErrorCode.ColonExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
		}
		return true;
	}

	function parseObject(): boolean {
		onObjectBegin();
		scanNext(); // consume open brace

		let needsComma = false;
		while (_scanner.getToken() !== SyntaxKind.CloseBraceToken && _scanner.getToken() !== SyntaxKind.EOF) {
			if (_scanner.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handleError(ParseErrorCode.ValueExpected, [], []);
				}
				onSeparator(',');
				scanNext(); // consume comma
				if (_scanner.getToken() === SyntaxKind.CloseBraceToken && allowTrailingComma) {
					break;
				}
			} else if (needsComma) {
				handleError(ParseErrorCode.CommaExpected, [], []);
			}
			if (!parseProperty()) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBraceToken, SyntaxKind.CommaToken]);
			}
			needsComma = true;
		}
		onObjectEnd();
		if (_scanner.getToken() !== SyntaxKind.CloseBraceToken) {
			handleError(ParseErrorCode.CloseBraceExpected, [SyntaxKind.CloseBraceToken], []);
		} else {
			scanNext(); // consume close brace
		}
		return true;
	}

	function parseArray(): boolean {
		onArrayBegin();
		scanNext(); // consume open bracket

		let needsComma = false;
		while (_scanner.getToken() !== SyntaxKind.CloseBracketToken && _scanner.getToken() !== SyntaxKind.EOF) {
			if (_scanner.getToken() === SyntaxKind.CommaToken) {
				if (!needsComma) {
					handleError(ParseErrorCode.ValueExpected, [], []);
				}
				onSeparator(',');
				scanNext(); // consume comma
			} else if (needsComma) {
				handleError(ParseErrorCode.CommaExpected, [], []);
			}
			if (!parseValue()) {
				handleError(ParseErrorCode.ValueExpected, [], [SyntaxKind.CloseBracketToken, SyntaxKind.CommaToken]);
			}
			needsComma = true;
		}
		onArrayEnd();
		if (_scanner.getToken() !== SyntaxKind.CloseBracketToken) {
			handleError(ParseErrorCode.CloseBracketExpected, [SyntaxKind.CloseBracketToken], []);
		} else {
			scanNext(); // consume close bracket
		}
		return true;
	}

	function parseValue(): boolean {
		switch (_scanner.getToken()) {
			case SyntaxKind.OpenBracketToken:
				return parseArray();
			case SyntaxKind.OpenBraceToken:
				return parseObject();
			case SyntaxKind.StringLiteral:
				return parseString(true);
			default:
				return parseLiteral();
		}
	}

	scanNext();
	if (_scanner.getToken() === SyntaxKind.EOF) {
		return true;
	}
	if (!parseValue()) {
		handleError(ParseErrorCode.ValueExpected, [], []);
		return false;
	}
	if (_scanner.getToken() !== SyntaxKind.EOF) {
		handleError(ParseErrorCode.EndOfFileExpected, [], []);
	}
	return true;
}

export interface JSONVisitor {
	/**
	 * Invoked when an open brace is encountered and an object is started. The offset and length represent the location of the open brace.
	 */
	onObjectBegin?: (offset: number, length: number) => void;

	/**
	 * Invoked when a property is encountered. The offset and length represent the location of the property name.
	 */
	onObjectProperty?: (property: string, offset: number, length: number) => void;

	/**
	 * Invoked when a closing brace is encountered and an object is completed. The offset and length represent the location of the closing brace.
	 */
	onObjectEnd?: (offset: number, length: number) => void;

	/**
	 * Invoked when an open bracket is encountered. The offset and length represent the location of the open bracket.
	 */
	onArrayBegin?: (offset: number, length: number) => void;

	/**
	 * Invoked when a closing bracket is encountered. The offset and length represent the location of the closing bracket.
	 */
	onArrayEnd?: (offset: number, length: number) => void;

	/**
	 * Invoked when a literal value is encountered. The offset and length represent the location of the literal value.
	 */
	onLiteralValue?: (value: any, offset: number, length: number) => void;

	/**
	 * Invoked when a comma or colon separator is encountered. The offset and length represent the location of the separator.
	 */
	onSeparator?: (charcter: string, offset: number, length: number) => void;

	/**
	 * Invoked on an error.
	 */
	onError?: (error: ParseErrorCode, offset: number, length: number) => void;
}
