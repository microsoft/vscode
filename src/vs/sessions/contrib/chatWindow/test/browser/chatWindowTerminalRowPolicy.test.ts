/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { decideTerminalRowMove, TerminalRowMoveAction } from '../../browser/chatWindowTerminalRowPolicy.js';

suite('Chat window terminal row policy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns a terminal moved out of the row, and ignores everything else', () => {
		const row = 3;
		assert.deepStrictEqual({
			terminalToEditorGroup: decideTerminalRowMove(true, row, 2),
			terminalToNewWindowGroup: decideTerminalRowMove(true, row, 9),
			terminalWithinRow: decideTerminalRowMove(true, row, row),
			otherEditorOutOfRow: decideTerminalRowMove(false, row, 2),
		}, {
			terminalToEditorGroup: TerminalRowMoveAction.ReturnToRow,
			terminalToNewWindowGroup: TerminalRowMoveAction.ReturnToRow,
			terminalWithinRow: TerminalRowMoveAction.Ignore,
			otherEditorOutOfRow: TerminalRowMoveAction.Ignore,
		});
	});
});
