/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getQuickPickSessionOpenOptions } from '../../../browser/agentSessions/agentSessionsPicker.js';

suite('agentSessionsPicker', () => {
	test('background quick pick accept preserves focus without forcing side-by-side', () => {
		const options = getQuickPickSessionOpenOptions(true);

		assert.strictEqual(options.sideBySide, false);
		assert.strictEqual(options.editorOptions?.preserveFocus, true);
		assert.strictEqual(options.editorOptions?.pinned, true);
	});

	test('foreground quick pick accept keeps the default open target', () => {
		const options = getQuickPickSessionOpenOptions(false);

		assert.strictEqual(options.sideBySide, false);
		assert.strictEqual(options.editorOptions?.preserveFocus, false);
		assert.strictEqual(options.editorOptions?.pinned, false);
	});
});
