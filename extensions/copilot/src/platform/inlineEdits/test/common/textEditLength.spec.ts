/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { describe, expect, it } from 'vitest';
import { Range } from '../../../../util/vs/editor/common/core/range';
import { TextLength } from '../../../../util/vs/editor/common/core/text/textLength';
import { SingleTextEditLength, TextLengthEdit } from '../../common/dataTypes/textEditLength';

describe('getRange', () => {

	it('should return undefined for empty edits', () => {
		const textLengthEdit = TextLengthEdit.empty;
		expect(textLengthEdit.getRange()).toMatchInlineSnapshot(`undefined`);
	});

	it('should return the correct range for single edit', () => {
		const range = new Range(1, 1, 1, 5);
		const textLength = new TextLength(0, 4);
		const singleEdit = new SingleTextEditLength(range, textLength);
		const textLengthEdit = new TextLengthEdit([singleEdit]);
		expect(textLengthEdit.getRange()?.toString()).toMatchInlineSnapshot(`"[1,1 -> 1,5]"`);
	});

	it('should return the correct range for multiple edits', () => {
		const range1 = new Range(1, 1, 1, 5);
		const textLength1 = new TextLength(0, 4);
		const singleEdit1 = new SingleTextEditLength(range1, textLength1);

		const range2 = new Range(2, 1, 2, 5);
		const textLength2 = new TextLength(0, 4);
		const singleEdit2 = new SingleTextEditLength(range2, textLength2);

		const textLengthEdit = new TextLengthEdit([singleEdit1, singleEdit2]);
		expect(textLengthEdit.getRange()?.toString()).toMatchInlineSnapshot(`"[1,1 -> 2,5]"`);
	});
});

describe('compose', () => {

	it('should return empty for composing two empty edits', () => {
		const edit1 = TextLengthEdit.empty;
		const edit2 = TextLengthEdit.empty;
		const composedEdit = edit1.compose(edit2);
		expect(composedEdit.edits).toMatchInlineSnapshot(`[]`);
	});

	it('should compose two non-overlapping edits correctly', () => {
		const range1 = new Range(1, 1, 1, 5);
		const textLength1 = new TextLength(0, 4);
		const singleEdit1 = new SingleTextEditLength(range1, textLength1);
		const edit1 = new TextLengthEdit([singleEdit1]);

		const range2 = new Range(2, 1, 2, 5);
		const textLength2 = new TextLength(0, 4);
		const singleEdit2 = new SingleTextEditLength(range2, textLength2);
		const edit2 = new TextLengthEdit([singleEdit2]);

		const composedEdit = edit1.compose(edit2);
		expect(composedEdit.edits.toString()).toMatchInlineSnapshot(`"{ range: [1,1 -> 1,5], newLength: 0,4 },{ range: [2,1 -> 2,5], newLength: 0,4 }"`);
	});

	it('should compose two non-overlapping edits correctly - 2', () => {
		const range1 = new Range(1, 1, 1, 5);
		const textLength1 = new TextLength(2, 4);
		const singleEdit1 = new SingleTextEditLength(range1, textLength1);
		const edit1 = new TextLengthEdit([singleEdit1]);

		const range2 = new Range(2, 1, 2, 5);
		const textLength2 = new TextLength(0, 4);
		const singleEdit2 = new SingleTextEditLength(range2, textLength2);
		const edit2 = new TextLengthEdit([singleEdit2]);

		const composedEdit = edit1.compose(edit2);
		expect(composedEdit.edits.toString()).toMatchInlineSnapshot(`"{ range: [1,1 -> 1,5], newLength: 2,4 }"`);
	});

	it('should compose two non-overlapping edits correctly - 3', () => {
		const range1 = new Range(1, 1, 1, 5);
		const textLength1 = new TextLength(2, 4);
		const singleEdit1 = new SingleTextEditLength(range1, textLength1);
		const edit1 = new TextLengthEdit([singleEdit1]);

		const range2 = new Range(12, 1, 12, 5);
		const textLength2 = new TextLength(4, 4);
		const singleEdit2 = new SingleTextEditLength(range2, textLength2);
		const edit2 = new TextLengthEdit([singleEdit2]);

		const composedEdit = edit1.compose(edit2);
		expect(composedEdit.edits.toString()).toMatchInlineSnapshot(`"{ range: [1,1 -> 1,5], newLength: 2,4 },{ range: [10,1 -> 10,5], newLength: 4,4 }"`);

		const composedEdit2 = edit2.compose(edit1);
		expect(composedEdit2.edits.toString()).toMatchInlineSnapshot(`"{ range: [1,1 -> 1,5], newLength: 2,4 },{ range: [12,1 -> 12,5], newLength: 4,4 }"`);
	});

	it('should compose overlapping edits correctly', () => {
		const range1 = new Range(1, 1, 1, 5);
		const textLength1 = new TextLength(0, 4);
		const singleEdit1 = new SingleTextEditLength(range1, textLength1);
		const edit1 = new TextLengthEdit([singleEdit1]);

		const range2 = new Range(1, 3, 1, 7);
		const textLength2 = new TextLength(0, 4);
		const singleEdit2 = new SingleTextEditLength(range2, textLength2);
		const edit2 = new TextLengthEdit([singleEdit2]);

		const composedEdit = edit1.compose(edit2);
		expect(composedEdit.edits.toString()).toMatchInlineSnapshot(`"{ range: [1,1 -> 1,7], newLength: 0,6 }"`);
	});
});
