/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Json = require('./json');

export interface FormattingOptions {
	/**
	 * If indentation is based on spaces (`insertSpaces` = true), then what is the number of spaces that make an indent?
	 */
	tabSize: number;
	/**
	 * Is indentation based on spaces?
	 */
	insertSpaces: boolean;
	/**
	 * The default end of line line character
	 */
	eol: string;
}

export interface Edit {
	offset: number;
	length: number;
	content: string;
}

export function applyEdit(text: string, edit: Edit): string {
	return text.substring(0, edit.offset) + edit.content + text.substring(edit.offset + edit.length);
}

export function applyEdits(text: string, edits: Edit[]): string {
	for (let i = edits.length - 1; i >= 0; i--) {
		text = applyEdit(text, edits[i]);
	}
	return text;
}

export function format(documentText: string, range: { offset: number, length: number }, options: FormattingOptions): Edit[] {
	let initialIndentLevel: number;
	let value: string;
	let rangeStart: number;
	let rangeEnd: number;
	if (range) {
		rangeStart = range.offset;
		rangeEnd = rangeStart + range.length;
		while (rangeStart > 0 && !isEOL(documentText, rangeStart - 1)) {
			rangeStart--;
		}
		let scanner = Json.createScanner(documentText, true);
		scanner.setPosition(rangeEnd);
		scanner.scan();
		rangeEnd = scanner.getPosition();

		value = documentText.substring(rangeStart, rangeEnd);
		initialIndentLevel = computeIndentLevel(value, 0, options);
	} else {
		value = documentText;
		rangeStart = 0;
		rangeEnd = documentText.length;
		initialIndentLevel = 0;
	}
	let eol = getEOL(options, documentText);

	let lineBreak = false;
	let indentLevel = 0;
	let indentValue: string;
	if (options.insertSpaces) {
		indentValue = repeat(' ', options.tabSize);
	} else {
		indentValue = '\t';
	}

	let scanner = Json.createScanner(value, false);

	function newLineAndIndent(): string {
		return eol + repeat(indentValue, initialIndentLevel + indentLevel);
	}
	function scanNext(): Json.SyntaxKind {
		let token = scanner.scan();
		lineBreak = false;
		while (token === Json.SyntaxKind.Trivia || token === Json.SyntaxKind.LineBreakTrivia) {
			lineBreak = lineBreak || (token === Json.SyntaxKind.LineBreakTrivia);
			token = scanner.scan();
		}
		return token;
	}
	let editOperations: Edit[] = [];
	function addEdit(text: string, startOffset: number, endOffset: number) {
		if (documentText.substring(startOffset, endOffset) !== text) {
			editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
		}
	}

	let firstToken = scanNext();
	if (firstToken !== Json.SyntaxKind.EOF) {
		let firstTokenStart = scanner.getTokenOffset() + rangeStart;
		let initialIndent = repeat(indentValue, initialIndentLevel);
		addEdit(initialIndent, rangeStart, firstTokenStart);
	}

	while (firstToken !== Json.SyntaxKind.EOF) {
		let firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + rangeStart;
		let secondToken = scanNext();

		let replaceContent = '';
		while (!lineBreak && (secondToken === Json.SyntaxKind.LineCommentTrivia || secondToken === Json.SyntaxKind.BlockCommentTrivia)) {
			// comments on the same line: keep them on the same line, but ignore them otherwise
			let commentTokenStart = scanner.getTokenOffset() + rangeStart;
			addEdit(' ', firstTokenEnd, commentTokenStart);
			firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + rangeStart;
			replaceContent = secondToken === Json.SyntaxKind.LineCommentTrivia ? newLineAndIndent() : '';
			secondToken = scanNext();
		}

		if (secondToken === Json.SyntaxKind.CloseBraceToken) {
			if (firstToken !== Json.SyntaxKind.OpenBraceToken) {
				indentLevel--;
				replaceContent = newLineAndIndent();
			}
		} else if (secondToken === Json.SyntaxKind.CloseBracketToken) {
			if (firstToken !== Json.SyntaxKind.OpenBracketToken) {
				indentLevel--;
				replaceContent = newLineAndIndent();
			}
		} else if (secondToken !== Json.SyntaxKind.EOF) {
			switch (firstToken) {
				case Json.SyntaxKind.OpenBracketToken:
				case Json.SyntaxKind.OpenBraceToken:
					indentLevel++;
					replaceContent = newLineAndIndent();
					break;
				case Json.SyntaxKind.CommaToken:
				case Json.SyntaxKind.LineCommentTrivia:
					replaceContent = newLineAndIndent();
					break;
				case Json.SyntaxKind.BlockCommentTrivia:
					if (lineBreak) {
						replaceContent = newLineAndIndent();
					} else {
						// symbol following comment on the same line: keep on same line, separate with ' '
						replaceContent = ' ';
					}
					break;
				case Json.SyntaxKind.ColonToken:
					replaceContent = ' ';
					break;
				case Json.SyntaxKind.NullKeyword:
				case Json.SyntaxKind.TrueKeyword:
				case Json.SyntaxKind.FalseKeyword:
				case Json.SyntaxKind.NumericLiteral:
					if (secondToken === Json.SyntaxKind.NullKeyword || secondToken === Json.SyntaxKind.FalseKeyword || secondToken === Json.SyntaxKind.NumericLiteral) {
						replaceContent = ' ';
					}
					break;
			}
			if (lineBreak && (secondToken === Json.SyntaxKind.LineCommentTrivia || secondToken === Json.SyntaxKind.BlockCommentTrivia)) {
				replaceContent = newLineAndIndent();
			}

		}
		let secondTokenStart = scanner.getTokenOffset() + rangeStart;
		addEdit(replaceContent, firstTokenEnd, secondTokenStart);
		firstToken = secondToken;
	}
	return editOperations;
}

function repeat(s: string, count: number): string {
	let result = '';
	for (let i = 0; i < count; i++) {
		result += s;
	}
	return result;
}

function computeIndentLevel(content: string, offset: number, options: FormattingOptions): number {
	let i = 0;
	let nChars = 0;
	let tabSize = options.tabSize || 4;
	while (i < content.length) {
		let ch = content.charAt(i);
		if (ch === ' ') {
			nChars++;
		} else if (ch === '\t') {
			nChars += tabSize;
		} else {
			break;
		}
		i++;
	}
	return Math.floor(nChars / tabSize);
}

function getEOL(options: FormattingOptions, text: string): string {
	for (let i = 0; i < text.length; i++) {
		let ch = text.charAt(i);
		if (ch === '\r') {
			if (i + 1 < text.length && text.charAt(i + 1) === '\n') {
				return '\r\n';
			}
			return '\r';
		} else if (ch === '\n') {
			return '\n';
		}
	}
	return (options && options.eol) || '\n';
}

function isEOL(text: string, offset: number) {
	return '\r\n'.indexOf(text.charAt(offset)) !== -1;
}