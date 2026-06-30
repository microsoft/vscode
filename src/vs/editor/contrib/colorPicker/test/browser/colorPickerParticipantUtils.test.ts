/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { ColorPickerModel } from '../../browser/colorPickerModel.js';
import { updateEditorModel } from '../../browser/colorPickerParticipantUtils.js';

suite('ColorPickerParticipantUtils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('updateEditorModel replaces all insertion ranges with multiple cursors', () => {
		withTestCodeEditor(['', ''], {}, editor => {
			const model = new ColorPickerModel(new Color(new RGBA(255, 0, 0, 1)), [{ label: '#ff0000' }], 0);
			editor.registerDisposable(model);

			updateEditorModel(editor, new Range(1, 1, 1, 1), model, [new Range(1, 1, 1, 1), new Range(2, 1, 2, 1)]);

			assert.strictEqual(editor.getValue(), '#ff0000\n#ff0000');
		});
	});

	test('updateEditorModel keeps single-cursor replace behavior', () => {
		withTestCodeEditor(['#000000'], {}, editor => {
			const model = new ColorPickerModel(new Color(new RGBA(255, 0, 0, 1)), [{ label: '#ff0000' }], 0);
			editor.registerDisposable(model);

			updateEditorModel(editor, new Range(1, 1, 1, 8), model);

			assert.strictEqual(editor.getValue(), '#ff0000');
		});
	});
});
