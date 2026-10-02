/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ReplaceCommand, ReplaceCommandWithOffsetCursorState } from '../../../common/commands/replaceCommand.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { TypeAutoClosingCounterpartCommand } from '../../../common/cursor/cursorTypeEditOperations.js';
import { CommandExecutor } from '../../../common/cursor/cursor.js';
import { createTextModel } from '../../common/testTextModel.js';

suite('Editor Commands - Auto Closing Counterpart Command', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses updated selections after earlier commands shift cursors', () => {
		const model = store.add(createTextModel('ab cd'));
		const selections = [new Selection(1, 3, 1, 3), new Selection(1, 6, 1, 6)];
		const typingCommands = selections.map(selection => new ReplaceCommand(selection, 'x'));
		const closingCommands = selections.map(selection => new TypeAutoClosingCounterpartCommand(selection, '(', ')'));

		const afterTyping = CommandExecutor.executeCommands(model, selections, typingCommands);
		assert.ok(afterTyping);
		for (let i = 0; i < afterTyping.length; i++) {
			closingCommands[i].setSelection(afterTyping[i]);
		}
		const afterClosing = CommandExecutor.executeCommands(model, afterTyping, closingCommands);

		assert.deepStrictEqual({ text: model.getValue(), selections: afterClosing }, {
			text: 'abx) cdx)',
			selections: [new Selection(1, 4, 1, 4), new Selection(1, 9, 1, 9)]
		});
	});

	test('explicit ranges are independent of the current selection', () => {
		const model = store.add(createTextModel('abc'));
		const command = new ReplaceCommandWithOffsetCursorState(new Range(1, 2, 1, 3), '()', 0, -1);
		const selections = CommandExecutor.executeCommands(model, [new Selection(1, 1, 1, 1)], [command]);

		assert.deepStrictEqual({ text: model.getValue(), selections }, {
			text: 'a()c',
			selections: [new Selection(1, 3, 1, 3)]
		});
	});

});
