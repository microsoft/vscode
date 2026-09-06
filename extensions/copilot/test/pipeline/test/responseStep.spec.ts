/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { describe, expect, test } from 'vitest';
import { formatAsEditWindowOnly } from '../responseStep';

/**
 * Compute the character offset of the first character of `line` (0-based) in `doc`.
 */
function lineOffset(doc: string, line: number): number {
	let off = 0;
	for (let i = 0; i < line; i++) {
		const nl = doc.indexOf('\n', off);
		off = nl + 1;
	}
	return off;
}

describe('formatAsEditWindowOnly (xtab-275)', () => {

	const docLines = Array.from({ length: 20 }, (_, i) => `L${i}`);
	const docContent = docLines.join('\n');

	test('drops only the oracle edits that fall outside the prompt edit window', () => {
		// Edit window covers lines [5, 10): L5..L9
		const windowStart = 5;
		const windowLineCount = 5;

		// First edit is inside the window: replace "L6" → "EDITED6"
		const inWindowStart = lineOffset(docContent, 6);
		const inWindowEnd = inWindowStart + 'L6'.length;

		// Second edit is outside the window: replace "L15" → "OUTSIDE"
		const outOfWindowStart = lineOffset(docContent, 15);
		const outOfWindowEnd = outOfWindowStart + 'L15'.length;

		// Third edit is back inside the window. Oracle edits come from
		// StringEdit.compose().replacements upstream, so each edit's offsets
		// are independent — this in-window edit is kept even though an
		// earlier edit was dropped.
		const inWindowStart2 = lineOffset(docContent, 8);
		const inWindowEnd2 = inWindowStart2 + 'L8'.length;

		const edits: [number, number, string][] = [
			[inWindowStart, inWindowEnd, 'EDITED6'],
			[outOfWindowStart, outOfWindowEnd, 'OUTSIDE'],
			[inWindowStart2, inWindowEnd2, 'EDITED8'],
		];

		const result = formatAsEditWindowOnly(edits, docContent, windowStart, windowLineCount);

		// Only the line-15 edit is dropped; the two in-window edits both apply.
		expect(result).toEqual({
			assistant: ['L5', 'EDITED6', 'L7', 'EDITED8', 'L9'].join('\n'),
			droppedCount: 1,
		});
	});

	test('keeps all edits when every edit lies inside the window', () => {
		const windowStart = 5;
		const windowLineCount = 5;

		const edit1Start = lineOffset(docContent, 6);
		const edit1End = edit1Start + 'L6'.length;

		const edit2Start = lineOffset(docContent, 8);
		const edit2End = edit2Start + 'L8'.length;

		const edits: [number, number, string][] = [
			[edit1Start, edit1End, 'EDITED6'],
			[edit2Start, edit2End, 'EDITED8'],
		];

		const result = formatAsEditWindowOnly(edits, docContent, windowStart, windowLineCount);

		expect(result).toEqual({
			assistant: ['L5', 'EDITED6', 'L7', 'EDITED8', 'L9'].join('\n'),
			droppedCount: 0,
		});
	});

	test('grows the assistant slice when an in-window edit inserts lines', () => {
		// Window: lines [5, 10). Replace "L6" with two lines.
		const windowStart = 5;
		const windowLineCount = 5;

		const start = lineOffset(docContent, 6);
		const end = start + 'L6'.length;

		const edits: [number, number, string][] = [[start, end, 'A\nB']];

		const result = formatAsEditWindowOnly(edits, docContent, windowStart, windowLineCount);

		expect(result).toEqual({
			assistant: ['L5', 'A', 'B', 'L7', 'L8', 'L9'].join('\n'),
			droppedCount: 0,
		});
	});

	test('shrinks the assistant slice when an in-window edit deletes a full line', () => {
		// Window: lines [5, 10). Delete the whole "L6\n" line.
		const windowStart = 5;
		const windowLineCount = 5;

		const start = lineOffset(docContent, 6);
		const end = lineOffset(docContent, 7); // up to (but not including) the next line's first char

		const edits: [number, number, string][] = [[start, end, '']];

		const result = formatAsEditWindowOnly(edits, docContent, windowStart, windowLineCount);

		expect(result).toEqual({
			assistant: ['L5', 'L7', 'L8', 'L9'].join('\n'),
			droppedCount: 0,
		});
	});

	test('drops an edit that straddles the window boundary', () => {
		// Window: lines [5, 10). Edit covers L9..L10 — its end line (10) is
		// outside the window, so the edit must not be applied even though it
		// starts inside.
		const windowStart = 5;
		const windowLineCount = 5;

		const start = lineOffset(docContent, 9);
		const end = lineOffset(docContent, 10) + 'L10'.length;

		const edits: [number, number, string][] = [[start, end, 'STRADDLE']];

		const result = formatAsEditWindowOnly(edits, docContent, windowStart, windowLineCount);

		expect(result).toEqual({
			assistant: ['L5', 'L6', 'L7', 'L8', 'L9'].join('\n'),
			droppedCount: 1,
		});
	});

	test('returns the unmodified window slice when every oracle edit falls outside the window', () => {
		// Window: lines [5, 10). All edits target line 15.
		const windowStart = 5;
		const windowLineCount = 5;

		const start = lineOffset(docContent, 15);
		const end = start + 'L15'.length;

		const edits: [number, number, string][] = [[start, end, 'OUTSIDE']];

		const result = formatAsEditWindowOnly(edits, docContent, windowStart, windowLineCount);

		expect(result).toEqual({
			assistant: ['L5', 'L6', 'L7', 'L8', 'L9'].join('\n'),
			droppedCount: 1,
		});
	});
});
