/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NewChatModelPickerService } from '../../browser/newChatModelPicker.js';

suite('NewChatModelPickerService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens only a picker registered for that input scope', () => {
		const disposables = new DisposableStore();
		const firstInputPickers = new NewChatModelPickerService();
		const secondInputPickers = new NewChatModelPickerService();
		const opened: string[] = [];

		disposables.add(firstInputPickers.registerModelPicker(() => opened.push('first')));
		disposables.add(secondInputPickers.registerModelPicker(() => opened.push('second')));

		firstInputPickers.openModelPicker();

		assert.deepStrictEqual(opened, ['first']);
		disposables.dispose();
	});
});