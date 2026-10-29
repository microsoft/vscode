/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { getEditedLineSpan, isSpanFullyVisible, isSpanFullyVisibleInDocument } from '../../common/visibleLines';

describe('visibleLines', () => {
	it('treats an edit inside one visible range as fully visible', () => {
		expect(isSpanFullyVisible([{ startLine: 10, endLine: 40 }], { startLine: 12, endLine: 20 })).toBe(true);
	});

	it('is not fully visible when the edit runs past the visible range', () => {
		expect(isSpanFullyVisible([{ startLine: 10, endLine: 40 }], { startLine: 35, endLine: 60 })).toBe(false);
	});

	it('does not combine separate visible ranges (folded code)', () => {
		const ranges = [{ startLine: 0, endLine: 10 }, { startLine: 20, endLine: 30 }];
		expect(isSpanFullyVisible(ranges, { startLine: 8, endLine: 22 })).toBe(false);
	});

	it('extends the span by the lines of the new text', () => {
		expect(getEditedLineSpan(5, 5, 'a\nb\nc')).toEqual({ startLine: 5, endLine: 7 });
	});

	it('keeps the replaced lines when the new text is shorter', () => {
		expect(getEditedLineSpan(5, 9, 'a')).toEqual({ startLine: 5, endLine: 9 });
	});

	describe('isSpanFullyVisibleInDocument', () => {
		const span = { startLine: 2, endLine: 4 };
		const editor = (document: object, startLine: number, endLine: number) => ({ document, visibleRanges: [{ startLine, endLine }] });

		it('finds a notebook cell editor by the cell document, using cell-relative lines', () => {
			const notebook = {};
			const activeCell = editor({}, 0, 50);
			const targetCell = editor({}, 0, 5);

			expect({
				byCell: isSpanFullyVisibleInDocument(targetCell.document, span, activeCell, [activeCell, targetCell]),
				byNotebook: isSpanFullyVisibleInDocument(notebook, span, activeCell, [activeCell, targetCell]),
			}).toEqual({ byCell: true, byNotebook: false });
		});

		it('uses the active editor when it shows the document, otherwise any visible editor of the document', () => {
			const document = {};
			const scrolledAway = editor(document, 100, 140);
			const showsSpan = editor(document, 0, 40);
			const otherDocument = editor({}, 0, 40);

			expect({
				activeScrolledAway: isSpanFullyVisibleInDocument(document, span, scrolledAway, [scrolledAway, showsSpan]),
				activeShowsOtherDocument: isSpanFullyVisibleInDocument(document, span, otherDocument, [otherDocument, scrolledAway, showsSpan]),
				noActiveEditor: isSpanFullyVisibleInDocument(document, span, undefined, [scrolledAway]),
			}).toEqual({ activeScrolledAway: false, activeShowsOtherDocument: true, noActiveEditor: false });
		});
	});
});
