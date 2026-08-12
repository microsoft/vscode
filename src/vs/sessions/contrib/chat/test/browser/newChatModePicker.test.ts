/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NewChatModePickerService } from '../../browser/newChatModePicker.js';

suite('NewChatModePickerService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opens the latest picker registered for that input scope', () => {
		const firstInputPickers = new NewChatModePickerService();
		const secondInputPickers = new NewChatModePickerService();
		const opened: string[] = [];

		disposables.add(firstInputPickers.registerModePicker(() => opened.push('first')));
		disposables.add(firstInputPickers.registerModePicker(() => opened.push('first-latest')));
		disposables.add(secondInputPickers.registerModePicker(() => opened.push('second')));

		firstInputPickers.openModePicker();

		assert.deepStrictEqual(opened, ['first-latest']);
	});
});
