/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const CharacterCode = {
	Tab: 9,
	LineFeed: 10,
	FormFeed: 12,
	CarriageReturn: 13,
	Space: 32,
	DoubleQuote: 34,
	Dollar: 36,
	Ampersand: 38,
	SingleQuote: 39,
	LeftParenthesis: 40,
	RightParenthesis: 41,
	Asterisk: 42,
	Plus: 43,
	Comma: 44,
	Hyphen: 45,
	Dot: 46,
	Slash: 47,
	Colon: 58,
	Semicolon: 59,
	LessThan: 60,
	Equals: 61,
	GreaterThan: 62,
	At: 64,
	LeftSquareBracket: 91,
	Backslash: 92,
	RightSquareBracket: 93,
	Circumflex: 94,
	LeftCurlyBracket: 123,
	VerticalBar: 124,
	RightCurlyBracket: 125,
	Tilde: 126,
} as const;

interface Identifier {
	readonly end: number;
	readonly value: string;
}

interface SelectorScanResult {
	readonly containsRootAnchoredHas: boolean;
	readonly rootAnchoredHasOffset: number | undefined;
	readonly subjectContainsRoot: boolean;
}

interface StylesheetScanResult {
	readonly next: number;
	readonly rootAnchoredHasOffset: number | undefined;
}

/**
 * Whether a selector contains a `:has()` attached to a compound that anchors on
 * `body`, `html`, `:root` or `.monaco-workbench` - complete tokens only, at any
 * position within the compound (`.modern-ui.monaco-workbench:has()` counts,
 * `.monaco-workbench .foo:has()` and `.monaco-workbench-like:has()` do not).
 * Such rules make DOM mutations anywhere pay workbench-wide style invalidation
 * (microsoft/vscode#324985).
 */
export function containsRootAnchoredHas(css: string): boolean {
	return scanSelector(css, 0, css.length, true, false).containsRootAnchoredHas;
}

/**
 * Returns the offset of the first root-anchored `:has()` in a stylesheet.
 */
export function findRootAnchoredHas(css: string): number | undefined {
	if (!mayContainHasPseudo(css)) {
		return undefined;
	}
	return scanStylesheet(css, 0, css.length, false).rootAnchoredHasOffset;
}

/**
 * Returns the offset of the first substring operator used on a `class`
 * attribute in a stylesheet selector.
 */
export function findClassAttributeSubstringSelector(css: string): number | undefined {
	return scanStylesheetForClassAttributeSubstring(css, 0, css.length).offset;
}

function scanStylesheetForClassAttributeSubstring(css: string, start: number, end: number): { next: number; offset: number | undefined } {
	let index = start;
	while (index < end) {
		index = skipWhitespaceAndComments(css, index, end);
		if (css.charCodeAt(index) === CharacterCode.RightCurlyBracket) {
			return { next: index + 1, offset: undefined };
		}

		const preludeStart = index;
		index = findStatementBoundary(css, index, end);
		const boundary = css.charCodeAt(index);
		if (boundary === CharacterCode.Semicolon) {
			index++;
			continue;
		}
		if (boundary === CharacterCode.RightCurlyBracket) {
			return { next: index + 1, offset: undefined };
		}
		if (boundary !== CharacterCode.LeftCurlyBracket) {
			return { next: index, offset: undefined };
		}

		const contentStart = skipWhitespaceAndComments(css, preludeStart, index);
		const isAtRule = css.charCodeAt(contentStart) === CharacterCode.At;
		const declarationIdentifier = readIdentifier(css, contentStart, index);
		const isCustomProperty = declarationIdentifier.value.startsWith('--')
			&& css.charCodeAt(skipWhitespaceAndComments(css, declarationIdentifier.end, index)) === CharacterCode.Colon;
		if (isCustomProperty) {
			index = skipCustomPropertyDeclaration(css, index, end);
			continue;
		}
		if (isAtRule) {
			const atRuleName = readIdentifier(css, contentStart + 1, index);
			if (atRuleName.value === 'scope') {
				const offset = findClassAttributeSubstringInSelector(css, atRuleName.end, trimTrailingWhitespace(css, atRuleName.end, index));
				if (offset !== undefined) {
					return { next: index, offset };
				}
			}
		} else {
			const offset = findClassAttributeSubstringInSelector(css, preludeStart, trimTrailingWhitespace(css, preludeStart, index));
			if (offset !== undefined) {
				return { next: index, offset };
			}
		}

		const blockResult = scanStylesheetForClassAttributeSubstring(css, index + 1, end);
		if (blockResult.offset !== undefined) {
			return blockResult;
		}
		index = blockResult.next;
	}
	return { next: end, offset: undefined };
}

function findClassAttributeSubstringInSelector(css: string, start: number, end: number): number | undefined {
	for (let index = start; index < end;) {
		const character = css.charCodeAt(index);
		if (character === CharacterCode.LeftSquareBracket) {
			const bracketEnd = skipBracket(css, index + 1, end);
			const attribute = readAttributeName(css, index + 1, bracketEnd - 1);
			const operator = css.charCodeAt(attribute.end);
			if (attribute.value === 'class'
				&& (operator === CharacterCode.Asterisk || operator === CharacterCode.Circumflex || operator === CharacterCode.Dollar)
				&& css.charCodeAt(attribute.end + 1) === CharacterCode.Equals) {
				if (!isLegacyCodiconClassSubstring(css, operator, attribute.end + 2, bracketEnd - 1)) {
					return index;
				}
			}
			index = bracketEnd;
		} else if (character === CharacterCode.SingleQuote || character === CharacterCode.DoubleQuote) {
			index = skipString(css, index + 1, end, character);
		} else if (character === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end);
		} else {
			index++;
		}
	}
	return undefined;
}

function isLegacyCodiconClassSubstring(css: string, operator: number, start: number, end: number): boolean {
	if (operator !== CharacterCode.Asterisk) {
		return false;
	}
	let index = skipWhitespaceAndComments(css, start, end);
	const quote = css.charCodeAt(index);
	if (quote === CharacterCode.SingleQuote || quote === CharacterCode.DoubleQuote) {
		index++;
		let value = '';
		while (index < end) {
			const character = css.charCodeAt(index);
			if (character === quote) {
				return value.startsWith('codicon-');
			}
			if (character === CharacterCode.Backslash) {
				const escaped = readEscape(css, index + 1, end);
				if (!escaped) {
					return false;
				}
				value += escaped.value;
				index = escaped.end;
			} else {
				value += css[index++];
			}
		}
		return false;
	}
	return css.slice(index, readUnquotedAttributeValueEnd(css, index, end)).startsWith('codicon-');
}

function readUnquotedAttributeValueEnd(css: string, start: number, end: number): number {
	let index = start;
	while (index < end && !isWhitespace(css.charCodeAt(index)) && css.charCodeAt(index) !== CharacterCode.RightSquareBracket) {
		index++;
	}
	return index;
}

function readAttributeName(css: string, start: number, end: number): Identifier {
	let index = skipWhitespaceAndComments(css, start, end);
	let attribute = readIdentifier(css, index, end);
	index = skipWhitespaceAndComments(css, attribute.end, end);

	if (css.charCodeAt(index) === CharacterCode.Asterisk && css.charCodeAt(index + 1) === CharacterCode.VerticalBar) {
		index = skipWhitespaceAndComments(css, index + 2, end);
		attribute = readIdentifier(css, index, end);
	} else if (css.charCodeAt(index) === CharacterCode.VerticalBar && css.charCodeAt(index + 1) !== CharacterCode.Equals) {
		index = skipWhitespaceAndComments(css, index + 1, end);
		attribute = readIdentifier(css, index, end);
	}

	return {
		value: attribute.value,
		end: skipWhitespaceAndComments(css, attribute.end, end),
	};
}

function mayContainHasPseudo(css: string): boolean {
	for (let index = css.indexOf(':'); index >= 0; index = css.indexOf(':', index + 1)) {
		const firstCharacter = css.charCodeAt(index + 1);
		if (firstCharacter !== 72 && firstCharacter !== 104 && firstCharacter !== CharacterCode.Backslash && !(firstCharacter === CharacterCode.Slash && css.charCodeAt(index + 2) === CharacterCode.Asterisk)) {
			continue;
		}
		const identifier = readIdentifier(css, index + 1, css.length);
		if (identifier.value === 'has' && css.charCodeAt(identifier.end) === CharacterCode.LeftParenthesis) {
			return true;
		}
	}
	return false;
}

function scanSelector(css: string, start: number, end: number, detectHas: boolean, parentSubjectContainsRoot: boolean): SelectorScanResult {
	let selectorSubjectContainsRoot = false;
	let compoundContainsRoot = false;
	let compoundHasOffset: number | undefined;

	for (let index = start; index < end;) {
		const character = css.charCodeAt(index);

		if (character === CharacterCode.Comma) {
			selectorSubjectContainsRoot ||= compoundContainsRoot;
			compoundContainsRoot = false;
			compoundHasOffset = undefined;
			index++;
			continue;
		}

		if (isWhitespace(character) || isCombinator(character)) {
			compoundContainsRoot = false;
			compoundHasOffset = undefined;
			index++;
			continue;
		}

		if (character === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end);
			continue;
		}

		if (character === CharacterCode.SingleQuote || character === CharacterCode.DoubleQuote) {
			index = skipString(css, index + 1, end, character);
			continue;
		}

		if (character === CharacterCode.LeftSquareBracket) {
			index = skipBracket(css, index + 1, end);
			continue;
		}

		if (character === CharacterCode.Dot) {
			const identifier = readIdentifier(css, index + 1, end);
			if (identifier.value === 'monaco-workbench') {
				compoundContainsRoot = true;
				if (detectHas && compoundHasOffset !== undefined) {
					return { subjectContainsRoot: true, containsRootAnchoredHas: true, rootAnchoredHasOffset: compoundHasOffset };
				}
			}
			index = identifier.end;
			continue;
		}

		if (character === CharacterCode.Ampersand) {
			compoundContainsRoot ||= parentSubjectContainsRoot;
			if (detectHas && compoundContainsRoot && compoundHasOffset !== undefined) {
				return { subjectContainsRoot: true, containsRootAnchoredHas: true, rootAnchoredHasOffset: compoundHasOffset };
			}
			index++;
			continue;
		}

		if (character === CharacterCode.Colon) {
			const identifier = readIdentifier(css, index + 1, end);
			const functionStart = identifier.end;
			if (css.charCodeAt(functionStart) !== CharacterCode.LeftParenthesis) {
				if (identifier.value === 'root') {
					compoundContainsRoot = true;
					if (detectHas && compoundHasOffset !== undefined) {
						return { subjectContainsRoot: true, containsRootAnchoredHas: true, rootAnchoredHasOffset: compoundHasOffset };
					}
				}
				index = identifier.end;
				continue;
			}

			const functionEnd = findClosingParenthesis(css, functionStart + 1, end);
			if (identifier.value === 'has') {
				if (detectHas && compoundContainsRoot) {
					return { subjectContainsRoot: true, containsRootAnchoredHas: true, rootAnchoredHasOffset: index };
				}
				compoundHasOffset ??= index;
			} else if (identifier.value === 'is' || identifier.value === 'where') {
				const nestedResult = scanSelector(css, functionStart + 1, functionEnd, false, parentSubjectContainsRoot);
				if (nestedResult.subjectContainsRoot) {
					compoundContainsRoot = true;
					if (detectHas && compoundHasOffset !== undefined) {
						return { subjectContainsRoot: true, containsRootAnchoredHas: true, rootAnchoredHasOffset: compoundHasOffset };
					}
				}
			}
			index = functionEnd + 1;
			continue;
		}

		const identifier = readIdentifier(css, index, end);
		if (identifier.end > index) {
			if (identifier.value === 'body' || identifier.value === 'html') {
				compoundContainsRoot = true;
				if (detectHas && compoundHasOffset !== undefined) {
					return { subjectContainsRoot: true, containsRootAnchoredHas: true, rootAnchoredHasOffset: compoundHasOffset };
				}
			}
			index = identifier.end;
			continue;
		}

		index++;
	}

	return {
		subjectContainsRoot: selectorSubjectContainsRoot || compoundContainsRoot,
		containsRootAnchoredHas: false,
		rootAnchoredHasOffset: undefined,
	};
}

function isWhitespace(character: number): boolean {
	return character === CharacterCode.Space || character === CharacterCode.Tab || character === CharacterCode.LineFeed || character === CharacterCode.FormFeed || character === CharacterCode.CarriageReturn;
}

function isCombinator(character: number): boolean {
	return character === CharacterCode.GreaterThan || character === CharacterCode.Plus || character === CharacterCode.Tilde;
}

function readIdentifier(css: string, start: number, end: number): Identifier {
	let index = start;
	let value = '';
	while (index < end) {
		const character = css.charCodeAt(index);
		if (character === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end);
			continue;
		}
		if (isIdentifierCharacter(character)) {
			value += css[index].toLowerCase();
			index++;
			continue;
		}
		if (character !== CharacterCode.Backslash) {
			break;
		}
		const escaped = readEscape(css, index + 1, end);
		if (!escaped) {
			break;
		}
		value += escaped.value.toLowerCase();
		index = escaped.end;
	}
	return { end: index, value };
}

function isIdentifierCharacter(character: number): boolean {
	return character >= 128 || character === CharacterCode.Hyphen || character === 95 || character >= 48 && character <= 57 || character >= 65 && character <= 90 || character >= 97 && character <= 122;
}

function readEscape(css: string, start: number, end: number): Identifier | undefined {
	if (start >= end || css.charCodeAt(start) === CharacterCode.LineFeed || css.charCodeAt(start) === CharacterCode.CarriageReturn) {
		return undefined;
	}
	let index = start;
	let codePoint = 0;
	let digitCount = 0;
	while (index < end && digitCount < 6) {
		const digit = hexValue(css.charCodeAt(index));
		if (digit < 0) {
			break;
		}
		codePoint = codePoint * 16 + digit;
		digitCount++;
		index++;
	}
	if (digitCount === 0) {
		return { end: index + 1, value: css[index] };
	}
	if (css.charCodeAt(index) === CharacterCode.CarriageReturn && css.charCodeAt(index + 1) === CharacterCode.LineFeed) {
		index += 2;
	} else if (isWhitespace(css.charCodeAt(index))) {
		index++;
	}
	const validCodePoint = codePoint === 0 || codePoint > 0x10FFFF || codePoint >= 0xD800 && codePoint <= 0xDFFF ? 0xFFFD : codePoint;
	return { end: index, value: String.fromCodePoint(validCodePoint) };
}

function hexValue(character: number): number {
	if (character >= 48 && character <= 57) {
		return character - 48;
	}
	if (character >= 65 && character <= 70) {
		return character - 55;
	}
	if (character >= 97 && character <= 102) {
		return character - 87;
	}
	return -1;
}

function skipComment(css: string, start: number, end: number): number {
	const commentEnd = css.indexOf('*/', start);
	return commentEnd < 0 || commentEnd >= end ? end : commentEnd + 2;
}

function skipString(css: string, start: number, end: number, quote: number): number {
	for (let index = start; index < end; index++) {
		const character = css.charCodeAt(index);
		if (character === quote) {
			return index + 1;
		}
		if (character === CharacterCode.Backslash) {
			index++;
		}
	}
	return end;
}

function skipBracket(css: string, start: number, end: number): number {
	for (let index = start; index < end; index++) {
		const character = css.charCodeAt(index);
		if (character === CharacterCode.RightSquareBracket) {
			return index + 1;
		}

		if (character === CharacterCode.SingleQuote || character === CharacterCode.DoubleQuote) {
			index = skipString(css, index + 1, end, character) - 1;
		} else if (character === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end) - 1;
		}
	}
	return end;
}

function skipCustomPropertyDeclaration(css: string, start: number, end: number): number {
	let curlyDepth = 0;
	let parenthesisDepth = 0;
	for (let index = start; index < end; index++) {
		const character = css.charCodeAt(index);
		if (character === CharacterCode.LeftCurlyBracket) {
			curlyDepth++;
		} else if (character === CharacterCode.RightCurlyBracket) {
			if (curlyDepth === 0) {
				return index;
			}
			curlyDepth--;
		} else if (character === CharacterCode.LeftParenthesis) {
			parenthesisDepth++;
		} else if (character === CharacterCode.RightParenthesis && parenthesisDepth > 0) {
			parenthesisDepth--;
		} else if (character === CharacterCode.Semicolon && curlyDepth === 0 && parenthesisDepth === 0) {
			return index + 1;
		} else if (character === CharacterCode.SingleQuote || character === CharacterCode.DoubleQuote) {
			index = skipString(css, index + 1, end, character) - 1;
		} else if (character === CharacterCode.LeftSquareBracket) {
			index = skipBracket(css, index + 1, end) - 1;
		} else if (character === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end) - 1;
		} else if (character === CharacterCode.Backslash) {
			index = (readEscape(css, index + 1, end)?.end ?? index + 1) - 1;
		}
	}
	return end;
}

function findClosingParenthesis(css: string, start: number, end: number): number {
	let depth = 1;
	for (let index = start; index < end; index++) {
		const character = css.charCodeAt(index);
		if (character === CharacterCode.LeftParenthesis) {
			depth++;
		} else if (character === CharacterCode.RightParenthesis && --depth === 0) {
			return index;
		} else if (character === CharacterCode.SingleQuote || character === CharacterCode.DoubleQuote) {
			index = skipString(css, index + 1, end, character) - 1;
		} else if (character === CharacterCode.LeftSquareBracket) {
			index = skipBracket(css, index + 1, end) - 1;
		} else if (character === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end) - 1;
		}
	}
	return end;
}

function scanStylesheet(css: string, start: number, end: number, parentSubjectContainsRoot: boolean): StylesheetScanResult {
	let index = start;
	while (index < end) {
		index = skipWhitespaceAndComments(css, index, end);
		if (css.charCodeAt(index) === CharacterCode.RightCurlyBracket) {
			return { next: index + 1, rootAnchoredHasOffset: undefined };
		}

		const preludeStart = index;
		index = findStatementBoundary(css, index, end);
		const boundary = css.charCodeAt(index);
		if (boundary === CharacterCode.Semicolon) {
			index++;
			continue;
		}
		if (boundary === CharacterCode.RightCurlyBracket) {
			return { next: index + 1, rootAnchoredHasOffset: undefined };
		}
		if (boundary !== CharacterCode.LeftCurlyBracket) {
			return { next: index, rootAnchoredHasOffset: undefined };
		}

		const isAtRule = css.charCodeAt(skipWhitespaceAndComments(css, preludeStart, index)) === CharacterCode.At;
		let subjectContainsRoot = parentSubjectContainsRoot;
		if (!isAtRule) {
			const selectorResult = scanSelector(css, preludeStart, trimTrailingWhitespace(css, preludeStart, index), true, parentSubjectContainsRoot);
			if (selectorResult.rootAnchoredHasOffset !== undefined) {
				return { next: index, rootAnchoredHasOffset: selectorResult.rootAnchoredHasOffset };
			}
			subjectContainsRoot = selectorResult.subjectContainsRoot;
		}

		const blockResult = scanStylesheet(css, index + 1, end, subjectContainsRoot);
		if (blockResult.rootAnchoredHasOffset !== undefined) {
			return blockResult;
		}
		index = blockResult.next;
	}
	return { next: end, rootAnchoredHasOffset: undefined };
}

function skipWhitespaceAndComments(css: string, start: number, end: number): number {
	let index = start;
	while (index < end) {
		if (isWhitespace(css.charCodeAt(index))) {
			index++;
		} else if (css.charCodeAt(index) === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end);
		} else {
			break;
		}
	}
	return index;
}

function trimTrailingWhitespace(css: string, start: number, end: number): number {
	while (end > start && isWhitespace(css.charCodeAt(end - 1))) {
		end--;
	}
	return end;
}

function findStatementBoundary(css: string, start: number, end: number): number {
	let parenthesisDepth = 0;
	for (let index = start; index < end; index++) {
		const character = css.charCodeAt(index);
		if (character === CharacterCode.SingleQuote || character === CharacterCode.DoubleQuote) {
			index = skipString(css, index + 1, end, character) - 1;
		} else if (character === CharacterCode.LeftSquareBracket) {
			index = skipBracket(css, index + 1, end) - 1;
		} else if (character === CharacterCode.Slash && css.charCodeAt(index + 1) === CharacterCode.Asterisk) {
			index = skipComment(css, index + 2, end) - 1;
		} else if (character === CharacterCode.LeftParenthesis) {
			parenthesisDepth++;
		} else if (character === CharacterCode.RightParenthesis) {
			parenthesisDepth--;
		} else if (character === CharacterCode.Backslash) {
			index = (readEscape(css, index + 1, end)?.end ?? index + 1) - 1;
		} else if (parenthesisDepth === 0 && (character === CharacterCode.Semicolon || character === CharacterCode.LeftCurlyBracket || character === CharacterCode.RightCurlyBracket)) {
			return index;
		}
	}
	return end;
}
