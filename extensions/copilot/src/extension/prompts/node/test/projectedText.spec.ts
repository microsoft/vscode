/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { ProjectedText } from '../inline/summarizedDocument/projectedText';

describe('projectedText', () => {

	it('tryRebase should rebase', async () => {
		const originalText = 'abc012def3456gh789ijkl';
		const text0 = new ProjectedText(originalText, StringEdit.fromJson([
			{ pos: 0, len: 3, txt: '' },
			{ pos: 6, len: 3, txt: '' },
			{ pos: 13, len: 2, txt: '' },
			{ pos: 18, len: 4, txt: '' },
		]));
		expect(text0.text).toBe('0123456789');

		const res1 = text0.tryRebase(StringEdit.fromJson([{ pos: 4, len: 1, txt: 'ABC' }]));
		expect(res1).toBeDefined();
		const { edit: edit1, text: text1 } = res1!;
		expect(edit1.replacements.length).toBe(1);
		expect(edit1.replacements[0].replaceRange.start).toBe(1);
		expect(edit1.replacements[0].replaceRange.endExclusive).toBe(2);
		expect(edit1.replacements[0].newText).toBe('ABC');
		expect(text1.originalText).toBe('abc0ABC2def3456gh789ijkl');
		expect(text1.text).toBe('0ABC23456789');

		const res2 = text1.tryRebase(StringEdit.fromJson([{ pos: 12, len: 2, txt: 'D' }]));
		expect(res2).toBeDefined();
		const { edit: edit2, text: text2 } = res2!;
		expect(edit2.replacements.length).toBe(1);
		expect(edit2.replacements[0].replaceRange.start).toBe(6);
		expect(edit2.replacements[0].replaceRange.endExclusive).toBe(8);
		expect(edit2.replacements[0].newText).toBe('D');
		expect(text2.originalText).toBe('abc0ABC2def3D6gh789ijkl');
		expect(text2.text).toBe('0ABC23D6789');

		const res3 = text2.tryRebase(StringEdit.fromJson([{ pos: 17, len: 0, txt: 'EFGH' }]));
		expect(res3).toBeDefined();
		const { edit: edit3, text: text3 } = res3!;
		expect(edit3.replacements.length).toBe(1);
		expect(edit3.replacements[0].replaceRange.start).toBe(9);
		expect(edit3.replacements[0].replaceRange.endExclusive).toBe(9);
		expect(edit3.replacements[0].newText).toBe('EFGH');
		expect(text3.originalText).toBe('abc0ABC2def3D6gh7EFGH89ijkl');
		expect(text3.text).toBe('0ABC23D67EFGH89');
	});

	it('tryRebase should rebase (mixed order edits)', async () => {
		const originalText = 'abc012def3456gh789ijkl';
		const text0 = new ProjectedText(originalText, StringEdit.fromJson([
			{ pos: 0, len: 3, txt: '' },
			{ pos: 6, len: 3, txt: '' },
			{ pos: 13, len: 2, txt: '' },
			{ pos: 18, len: 4, txt: '' },
		]));
		expect(text0.text).toBe('0123456789');

		const res2 = text0.tryRebase(StringEdit.fromJson([{ pos: 10, len: 2, txt: 'D' }]));
		expect(res2).toBeDefined();
		const { edit: edit2, text: text2 } = res2!;
		expect(edit2.replacements.length).toBe(1);
		expect(edit2.replacements[0].replaceRange.start).toBe(4);
		expect(edit2.replacements[0].replaceRange.endExclusive).toBe(6);
		expect(edit2.replacements[0].newText).toBe('D');
		expect(text2.originalText).toBe('abc012def3D6gh789ijkl');
		expect(text2.text).toBe('0123D6789');

		const res1 = text2.tryRebase(StringEdit.fromJson([{ pos: 4, len: 1, txt: 'ABC' }]));
		expect(res1).toBeDefined();
		const { edit: edit1, text: text1 } = res1!;
		expect(edit1.replacements.length).toBe(1);
		expect(edit1.replacements[0].replaceRange.start).toBe(1);
		expect(edit1.replacements[0].replaceRange.endExclusive).toBe(2);
		expect(edit1.replacements[0].newText).toBe('ABC');
		expect(text1.originalText).toBe('abc0ABC2def3D6gh789ijkl');
		expect(text1.text).toBe('0ABC23D6789');

		const res3 = text1.tryRebase(StringEdit.fromJson([{ pos: 17, len: 0, txt: 'EFGH' }]));
		expect(res3).toBeDefined();
		const { edit: edit3, text: text3 } = res3!;
		expect(edit3.replacements.length).toBe(1);
		expect(edit3.replacements[0].replaceRange.start).toBe(9);
		expect(edit3.replacements[0].replaceRange.endExclusive).toBe(9);
		expect(edit3.replacements[0].newText).toBe('EFGH');
		expect(text3.originalText).toBe('abc0ABC2def3D6gh7EFGH89ijkl');
		expect(text3.text).toBe('0ABC23D67EFGH89');
	});

	it('tryRebase should detect conflicts', async () => {
		const originalText = 'abc012def3456gh789ijkl';
		const text0 = new ProjectedText(originalText, StringEdit.fromJson([
			{ pos: 0, len: 3, txt: '' },
			{ pos: 6, len: 3, txt: '' },
			{ pos: 13, len: 2, txt: '' },
			{ pos: 18, len: 4, txt: '' },
		]));
		expect(text0.text).toBe('0123456789');

		const res1 = text0.tryRebase(StringEdit.fromJson([{ pos: 4, len: 1, txt: 'ABC' }]));
		expect(res1).toBeDefined();
		const { edit: edit1, text: text1 } = res1!;
		expect(edit1.replacements.length).toBe(1);
		expect(edit1.replacements[0].replaceRange.start).toBe(1);
		expect(edit1.replacements[0].replaceRange.endExclusive).toBe(2);
		expect(edit1.replacements[0].newText).toBe('ABC');
		expect(text1.originalText).toBe('abc0ABC2def3456gh789ijkl');
		expect(text1.text).toBe('0ABC23456789');

		const res2 = text1.tryRebase(StringEdit.fromJson([{ pos: 21, len: 2, txt: 'D' }]));
		expect(res2).toBeUndefined();
	});
});
