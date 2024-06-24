/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCode, ScanCode } from 'vs/base/common/keyCodes';
import { KeyCodeChord, ScanCodeChord } from 'vs/base/common/keybindings';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('keyCodes', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #173325: wrong interpretations of special keys (e.g. [Equal] is mistaken for V)', () => {
		const a = new KeyCodeChord(true, false, false, false, KeyCode.KeyV);
		const b = new ScanCodeChord(true, false, false, false, ScanCode.Equal);
		assert.strictEqual(a.getHashCode() === b.getHashCode(), false);
	});

});
