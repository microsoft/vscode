/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getCustomEditorWindowMoveVeto } from '../../browser/customEditorInput.js';

suite('CustomEditorInput', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('only a modified editor whose model cannot hot exit is kept in its window, exactly as canHotExit === false', () => {
		const veto = (modified: boolean, canHotExit: boolean | undefined, sameWindow: boolean) => typeof getCustomEditorWindowMoveVeto({ modified, canHotExit, isSameWindow: () => sameWindow, getName: () => 'image.png' });

		assert.deepStrictEqual({
			modifiedCannotHotExitToOtherWindow: veto(true, false, false),
			modifiedCannotHotExitInItsWindow: veto(true, false, true),
			modifiedCanHotExit: veto(true, true, false),
			modifiedHotExitUnknown: veto(true, undefined, false),
			unmodified: veto(false, false, false),
		}, {
			modifiedCannotHotExitToOtherWindow: 'string',
			modifiedCannotHotExitInItsWindow: 'boolean',
			modifiedCanHotExit: 'boolean',
			modifiedHotExitUnknown: 'boolean',
			unmodified: 'boolean',
		});
	});
});
