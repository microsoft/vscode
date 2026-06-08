/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getEditorHoverVerbosity, Verbosity } from '../../common/editor.js';

suite('Editor Common', () => {
	test('maps configured tab hover mode to editor hover verbosity', () => {
		assert.strictEqual(getEditorHoverVerbosity('default'), Verbosity.LONG);
		assert.strictEqual(getEditorHoverVerbosity('short'), Verbosity.SHORT);
		assert.strictEqual(getEditorHoverVerbosity('medium'), Verbosity.MEDIUM);
		assert.strictEqual(getEditorHoverVerbosity('long'), Verbosity.LONG);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
