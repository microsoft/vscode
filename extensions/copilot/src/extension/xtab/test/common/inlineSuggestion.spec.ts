/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { Position } from '../../../../util/vs/editor/common/core/position';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { ensureDependenciesAreSet } from '../../../../util/vs/editor/common/core/text/positionToOffset';
import { determineIsInlineSuggestionPosition, isInlineSuggestionFromTextAfterCursor } from '../../common/inlineSuggestion';
import { CurrentDocument } from '../../common/xtabCurrentDocument';

describe('isInlineSuggestionFromTextAfterCursor', () => {
	describe('end of line positions (returns false)', () => {
		it.each([
			['empty string', ''],
			['only whitespace', '   '],
			['tabs only', '\t\t'],
			['mixed whitespace', '  \t  '],
		])('should return false for %s', (_description, textAfterCursor) => {
			expect(isInlineSuggestionFromTextAfterCursor(textAfterCursor)).toBe(false);
		});
	});

	describe('valid middle of line positions (returns true)', () => {
		it.each([
			// Single closing brackets/quotes
			['closing parenthesis', ')'],
			['closing bracket', ']'],
			['closing brace', '}'],
			['closing angle bracket', '>'],
			['double quote', String.fromCharCode(34)],
			['single quote', `'`],
			['backtick', '`'],

			// Trailing punctuation
			['semicolon', ';'],
			['colon', ':'],
			['comma', ','],
			['opening brace', '{'],

			// Combinations
			['closing paren with semicolon', ');'],
			['closing bracket with comma', '],'],
			['closing brace with semicolon', '};'],
			['double closing parens', '))'],
			['multiple closing brackets', ')]}'],
			['quotes with semicolon', '");'],
			['complex closing sequence', ')};'],
			['closing with whitespace', ')  '],
			['closing with trailing whitespace', ');  '],

			// With leading whitespace (trimmed in logic)
			['whitespace before closing', '  )'],
			['tabs before closing', '\t}'],
		])('should return true for %s: "%s"', (_description, textAfterCursor) => {
			expect(isInlineSuggestionFromTextAfterCursor(textAfterCursor)).toBe(true);
		});
	});

	describe('invalid middle of line positions (returns undefined)', () => {
		it.each([
			// Code after cursor
			['identifier', 'foo'],
			['function call', 'bar()'],
			['operator', '+ 1'],
			['assignment', '= 5'],
			['method chain', '.then()'],
			['property access', '.length'],
			['comparison', '== true'],
			['keyword', 'return'],

			// Mixed valid/invalid
			['text after closing paren', ') foo'],
			['identifier after bracket', '] bar'],
			['code after semicolon', '; var x'],

			// Invalid characters
			['open parenthesis alone', '('],
			['open bracket alone', '['],
			['at sign', '@'],
			['hash', '#'],
		])('should return undefined for %s: "%s"', (_description, textAfterCursor) => {
			expect(isInlineSuggestionFromTextAfterCursor(textAfterCursor)).toBeUndefined();
		});
	});
});

describe('isInlineSuggestion', () => {
	beforeEach(() => {
		ensureDependenciesAreSet();
	});

	function createDocument(lines: string[], cursorLine: number, cursorColumn: number): CurrentDocument {
		const content = new StringText(lines.join('\n'));
		const position = new Position(cursorLine, cursorColumn);
		return new CurrentDocument(content, position);
	}

	describe('end of line positions', () => {
		it('should return false when cursor is at end of line', () => {
			const document = createDocument(['const x = 1;', 'const y = 2;'], 1, 13);
			expect(determineIsInlineSuggestionPosition(document)).toBe(false);
		});

		it('should return false when only whitespace after cursor', () => {
			const document = createDocument(['const x = 1   ', 'const y = 2;'], 1, 12);
			expect(determineIsInlineSuggestionPosition(document)).toBe(false);
		});
	});

	describe('valid middle of line positions', () => {
		it('should return true when cursor is before closing paren', () => {
			const document = createDocument(['foo(bar)', 'next line'], 1, 8);
			expect(determineIsInlineSuggestionPosition(document)).toBe(true);
		});

		it('should return true when cursor is before closing bracket', () => {
			const document = createDocument(['arr[0]', 'next line'], 1, 6);
			expect(determineIsInlineSuggestionPosition(document)).toBe(true);
		});

		it('should return true when cursor is before semicolon', () => {
			const document = createDocument(['const x = 1;', 'next line'], 1, 12);
			expect(determineIsInlineSuggestionPosition(document)).toBe(true);
		});

		it('should return true when cursor is before complex ending', () => {
			const document = createDocument(['});', 'next line'], 1, 1);
			expect(determineIsInlineSuggestionPosition(document)).toBe(true);
		});
	});

	describe('invalid middle of line positions', () => {
		it('should return undefined when cursor is before identifier', () => {
			const document = createDocument(['hello world', 'next line'], 1, 6);
			expect(determineIsInlineSuggestionPosition(document)).toBeUndefined();
		});

		it('should return undefined when cursor is before operator and code', () => {
			const document = createDocument(['x = 1 + 2', 'next line'], 1, 6);
			expect(determineIsInlineSuggestionPosition(document)).toBeUndefined();
		});

		it('should return undefined when cursor is before function call', () => {
			const document = createDocument(['x.method()', 'next line'], 1, 2);
			expect(determineIsInlineSuggestionPosition(document)).toBeUndefined();
		});
	});

	describe('edge cases', () => {
		it('should handle cursor at first character of line', () => {
			const document = createDocument(['hello', 'world'], 1, 1);
			expect(determineIsInlineSuggestionPosition(document)).toBeUndefined();
		});

		it('should handle single character line', () => {
			const document = createDocument([';'], 1, 1);
			expect(determineIsInlineSuggestionPosition(document)).toBe(true);
		});

		it('should handle empty line', () => {
			const document = createDocument(['', 'next line'], 1, 1);
			expect(determineIsInlineSuggestionPosition(document)).toBe(false);
		});

		it('should handle cursor beyond line length gracefully', () => {
			const document = createDocument(['short'], 1, 100);
			expect(determineIsInlineSuggestionPosition(document)).toBe(false);
		});

		it('should handle multi-line document with cursor on different lines', () => {
			const lines = ['function test() {', '  const x = 1;', '  return x;', '}'];

			// Before `;` in "const x = 1;"
			const doc1 = createDocument(lines, 2, 14);
			expect(determineIsInlineSuggestionPosition(doc1)).toBe(true); // before `;`

			// End of line
			const doc2 = createDocument(lines, 2, 15);
			expect(determineIsInlineSuggestionPosition(doc2)).toBe(false);
		});
	});
});
