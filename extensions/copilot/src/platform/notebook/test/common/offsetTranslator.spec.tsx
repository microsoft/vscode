/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { CrLfOffsetTranslator } from '../../common/offsetTranslator';
import { EndOfLine } from '../../../../vscodeTypes';

describe('CrLfOffsetTranslator', () => {
	test('No CRLFs (LF only)', () => {
		const text = 'line1\nline2\nline3';
		const translator = new CrLfOffsetTranslator(text, EndOfLine.LF);
		for (let i = 0; i <= text.length; i++) {
			expect(translator.translate(i)).toBe(i);
		}
	});

	test('All CRLFs', () => {
		const text = 'line1\r\nline2\r\nline3';
		// text: 'line1\r\nline2\r\nline3'
		// Offsets: 0 1 2 3 4 5(\r) 6(\n) 7 8 9 10 11 12(\r) 13(\n) 14 15 16 17 18
		// CRLF at 5 and 12
		const translator = new CrLfOffsetTranslator(text, EndOfLine.CRLF);
		// Offsets before first CRLF
		for (let i = 0; i <= 5; i++) {
			expect(translator.translate(i)).toBe(i);
		}
		// Offset at 6 (\n of first CRLF)
		expect(translator.translate(6)).toBe(5);
		// Offset at 7 (l of line2)
		expect(translator.translate(7)).toBe(6);
		// Offset at 12 (\r of second CRLF)
		expect(translator.translate(12)).toBe(11);
		// Offset at 13 (\n of second CRLF)
		expect(translator.translate(13)).toBe(11);
		// Offset at 14 (l of line3)
		expect(translator.translate(14)).toBe(12);
		// Offset at end
		expect(translator.translate(text.length)).toBe(text.length - 2);
	});

	test('All LF', () => {
		const text = 'line1\nline2\nline3';
		// text: 'line1\r\nline2\r\nline3'
		// Offsets: 0 1 2 3 4 5(\r) 6(\n) 7 8 9 10 11 12(\r) 13(\n) 14 15 16 17 18
		// CRLF at 5 and 12
		const translator = new CrLfOffsetTranslator(text, EndOfLine.LF);
		// Offsets before first CRLF
		for (let i = 0; i <= 5; i++) {
			expect(translator.translate(i)).toBe(i);
		}
		// Offset at 6 (\n of first CRLF)
		expect(translator.translate(6)).toBe(6);
		// Offset at 7 (l of line2)
		expect(translator.translate(7)).toBe(7);
		// Offset at 12 (\r of second CRLF)
		expect(translator.translate(12)).toBe(12);
		// Offset at 13 (\n of second CRLF)
		expect(translator.translate(13)).toBe(13);
		// Offset at 14 (l of line3)
		expect(translator.translate(14)).toBe(14);
		// Offset at end
		expect(translator.translate(text.length)).toBe(text.length);
	});

	test('Empty string (lf)', () => {
		const translator = new CrLfOffsetTranslator('', EndOfLine.LF);
		expect(translator.translate(0)).toBe(0);
	});
	test('Empty string (crlf)', () => {
		const translator = new CrLfOffsetTranslator('', EndOfLine.CRLF);
		expect(translator.translate(0)).toBe(0);
	});
	test('String with only CRLF', () => {
		const text = '\r\n';
		const translator = new CrLfOffsetTranslator(text, EndOfLine.CRLF);
		expect(translator.translate(0)).toBe(0);
		expect(translator.translate(1)).toBe(0);
		expect(translator.translate(2)).toBe(1);
	});

	test('String with only LF', () => {
		const text = '\n';
		const translator = new CrLfOffsetTranslator(text, EndOfLine.LF);
		expect(translator.translate(0)).toBe(0);
		expect(translator.translate(1)).toBe(1);
	});

	test('String with only CR (as CRLF)', () => {
		const text = '\r';
		const translator = new CrLfOffsetTranslator(text, EndOfLine.CRLF);
		expect(translator.translate(0)).toBe(0);
		expect(translator.translate(1)).toBe(1);
	});

	test('String with only CR (as LF)', () => {
		const text = '\r';
		const translator = new CrLfOffsetTranslator(text, EndOfLine.LF);
		expect(translator.translate(0)).toBe(0);
		expect(translator.translate(1)).toBe(1);
	});

	test('CRLF at start, middle, end', () => {
		// "\nabc\ndef\n"
		const text = '\r\nabc\r\ndef\r\n';
		const translator = new CrLfOffsetTranslator(text, EndOfLine.CRLF);
		// CRLF at 0 and 6 and 12
		expect(translator.translate(0)).toBe(0);
		expect(translator.translate(1)).toBe(0);
		expect(translator.translate(2)).toBe(1);
		expect(translator.translate(6)).toBe(4);
		expect(translator.translate(7)).toBe(5);
		expect(translator.translate(8)).toBe(6);
		expect(translator.translate(12)).toBe(9);
		expect(translator.translate(13)).toBe(10);
		expect(translator.translate(14)).toBe(11);
		expect(translator.translate(text.length)).toBe(text.length - 3);
	});
	test('LDF at start, middle, end', () => {
		// "\nabc\ndef\n"
		const text = '\nabc\ndef\n';
		const translator = new CrLfOffsetTranslator(text, EndOfLine.LF);
		// CRLF at 0 and 6 and 12
		expect(translator.translate(0)).toBe(0);
		expect(translator.translate(1)).toBe(1);
		expect(translator.translate(2)).toBe(2);
		expect(translator.translate(6)).toBe(6);
		expect(translator.translate(7)).toBe(7);
		expect(translator.translate(8)).toBe(8);
		expect(translator.translate(12)).toBe(12);
		expect(translator.translate(13)).toBe(13);
		expect(translator.translate(14)).toBe(14);
		expect(translator.translate(text.length)).toBe(text.length);
	});
});
