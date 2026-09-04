/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { IColorPresentation } from '../../../../common/languages.js';
import { ColorPickerModel } from '../../browser/colorPickerModel.js';
import { ColorHover, HoverColorPickerParticipant } from '../../browser/hoverColorPicker/hoverColorPickerParticipant.js';

suite('HoverColorPickerParticipant', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// getAccessibleContent only reads the hover part's color model, so the editor
	// and theme service are not needed for these tests.
	const participant = new HoverColorPickerParticipant(null!, null!);

	function createColorHover(color: Color, presentations: IColorPresentation[]): ColorHover {
		const model = disposables.add(new ColorPickerModel(color, presentations, 0));
		return new ColorHover(participant, new Range(1, 1, 1, 8), model, null!);
	}

	test('getAccessibleContent returns the picked color presentation label', () => {
		const colorHover = createColorHover(new Color(new RGBA(255, 0, 0, 1)), [{ label: '#ff0000' }]);

		assert.strictEqual(participant.getAccessibleContent(colorHover), '#ff0000');
	});

	test('getAccessibleContent falls back to the CSS-formatted color, not the placeholder, when there is no presentation (issue #322335)', () => {
		const colorHover = createColorHover(new Color(new RGBA(255, 0, 0, 1)), []);

		assert.strictEqual(participant.getAccessibleContent(colorHover), '#ff0000');
	});
});
