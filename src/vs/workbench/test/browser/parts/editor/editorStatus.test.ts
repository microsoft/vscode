/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getEditorSelectionStatusLabel } from '../../../../browser/parts/editor/editorStatus.js';

suite('EditorStatus', () => {

	test('formats the editor selection status', () => {
		const selection = new Selection(1, 1, 12, 34);
		const multipleSelections = [selection, new Selection(2, 2, 56, 78)];

		assert.deepStrictEqual({
			missingSelections: getEditorSelectionStatusLabel({}, false),
			emptySelections: getEditorSelectionStatusLabel({ selections: [] }, false),
			singleSelection: getEditorSelectionStatusLabel({ selections: [selection] }, false),
			compactSingleSelection: getEditorSelectionStatusLabel({ selections: [selection] }, true),
			singleSelectionRange: getEditorSelectionStatusLabel({ selections: [selection], charactersSelected: 9 }, false),
			compactSingleSelectionRange: getEditorSelectionStatusLabel({ selections: [selection], charactersSelected: 9 }, true),
			multipleSelections: getEditorSelectionStatusLabel({ selections: multipleSelections }, false),
			compactMultipleSelections: getEditorSelectionStatusLabel({ selections: multipleSelections }, true),
			multipleSelectionRanges: getEditorSelectionStatusLabel({ selections: multipleSelections, charactersSelected: 9 }, false),
			compactMultipleSelectionRanges: getEditorSelectionStatusLabel({ selections: multipleSelections, charactersSelected: 9 }, true),
		}, {
			missingSelections: undefined,
			emptySelections: undefined,
			singleSelection: 'Ln 12, Col 34',
			compactSingleSelection: '12:34',
			singleSelectionRange: 'Ln 12, Col 34 (9 selected)',
			compactSingleSelectionRange: '12:34 (9 selected)',
			multipleSelections: '2 selections',
			compactMultipleSelections: '2 selections',
			multipleSelectionRanges: '2 selections (9 characters selected)',
			compactMultipleSelectionRanges: '2 selections (9 characters selected)',
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
