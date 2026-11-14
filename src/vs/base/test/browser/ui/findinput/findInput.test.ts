/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FindInput } from '../../../../../base/browser/ui/findinput/findInput.js';
import { IInputBoxStyles } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { unthemedToggleStyles } from '../../../../../base/browser/ui/toggle/toggle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('FindInput', () => {

	const TEST_FIND_INPUT_LABEL = 'Test Find Input';
	const TEST_INPUT_BOX_STYLES: IInputBoxStyles = {
		inputBackground: undefined,
		inputForeground: undefined,
		inputBorder: undefined,
		inputValidationInfoBorder: undefined,
		inputValidationInfoBackground: undefined,
		inputValidationInfoForeground: undefined,
		inputValidationWarningBorder: undefined,
		inputValidationWarningBackground: undefined,
		inputValidationWarningForeground: undefined,
		inputValidationErrorBorder: undefined,
		inputValidationErrorBackground: undefined,
		inputValidationErrorForeground: undefined
	};

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #176523: disables native drag from the find input', () => {
		const findInput = new FindInput(null, undefined, {
			label: TEST_FIND_INPUT_LABEL,
			inputBoxStyles: TEST_INPUT_BOX_STYLES,
			toggleStyles: unthemedToggleStyles
		});
		const dragStartEvent = new DragEvent('dragstart', { bubbles: true, cancelable: true });

		findInput.inputBox.inputElement.dispatchEvent(dragStartEvent);

		assert.strictEqual(dragStartEvent.defaultPrevented, true);

		findInput.dispose();
	});
});
