/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ColorPickerModel } from '../../colorPickerModel.js';
import { updateEditorModel } from '../../colorPickerParticipantUtils.js';
import { Color, RGBA } from '../../../../../base/common/color.js';

suite('Standalone Color Picker Multi-cursor', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #180918: Standalone color picker should work with multi-cursor - insert at all positions', () => {
		withTestCodeEditor([
			'line1',
			'line2',
			'line3'
		], {}, (editor, viewModel) => {
			// Set up multiple cursors at the end of each line
			const selections = [
				new Selection(1, 6, 1, 6), // end of line 1 (after "line1")
				new Selection(2, 6, 2, 6), // end of line 2 (after "line2")
				new Selection(3, 6, 3, 6)  // end of line 3 (after "line3")
			];
			editor.setSelections(selections);
			
			// Verify we have multiple cursors
			assert.strictEqual(editor.getSelections().length, 3);

			// Create a mock color picker model
			const color = new Color(new RGBA(255, 0, 0, 1)); // red color
			const colorModel = new ColorPickerModel(color, [], 0);
			colorModel.colorPresentations = [{ label: '#ff0000', textEdit: undefined, additionalTextEdits: [] }];
			colorModel.presentation = colorModel.colorPresentations[0];

			// Call updateEditorModel - this should now insert color at all cursor positions
			const primaryRange = new Range(1, 6, 1, 6); // Primary cursor position
			updateEditorModel(editor, primaryRange, colorModel);

			// Verify that the color was inserted at all cursor positions
			const model = editor.getModel()!;
			assert.strictEqual(model.getLineContent(1), 'line1#ff0000');
			assert.strictEqual(model.getLineContent(2), 'line2#ff0000'); 
			assert.strictEqual(model.getLineContent(3), 'line3#ff0000');
		});
	});

	test('updateEditorModel should work normally with single cursor (existing behavior)', () => {
		withTestCodeEditor([
			'line1',
			'line2'
		], {}, (editor, viewModel) => {
			// Set up single cursor
			editor.setSelection(new Selection(1, 6, 1, 6));
			
			// Verify we have single cursor
			assert.strictEqual(editor.getSelections().length, 1);

			// Create a mock color picker model
			const color = new Color(new RGBA(0, 255, 0, 1)); // green color
			const colorModel = new ColorPickerModel(color, [], 0);
			colorModel.colorPresentations = [{ label: '#00ff00', textEdit: undefined, additionalTextEdits: [] }];
			colorModel.presentation = colorModel.colorPresentations[0];

			// Call updateEditorModel
			const range = new Range(1, 6, 1, 6);
			updateEditorModel(editor, range, colorModel);

			// Verify that the color was inserted only at the single cursor position
			const model = editor.getModel()!;
			assert.strictEqual(model.getLineContent(1), 'line1#00ff00');
			assert.strictEqual(model.getLineContent(2), 'line2'); // unchanged
		});
	});
});