/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { completeTerminalReturn, decideTerminalRowMove, ITerminalReturn, TerminalRowMoveAction } from '../../browser/chatWindowTerminalRowPolicy.js';

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

	suite('completeTerminalReturn', () => {

		function run(overrides: Partial<{ current: boolean; canMove: boolean; empty: boolean; remaining: number; emptying: boolean }>): string[] {
			const o = { current: true, canMove: true, empty: false, remaining: 0, emptying: false, ...overrides };
			const calls: string[] = [];
			const r: ITerminalReturn = {
				isCurrent: () => o.current,
				canMove: () => o.canMove,
				move: () => { calls.push('move'); },
				end: () => { calls.push('end'); return o.remaining; },
				rowIsEmpty: () => o.empty,
				isEmptying: () => o.emptying,
				hideRow: () => { calls.push('hide'); },
			};
			completeTerminalReturn(r);
			return calls;
		}

		test('moves the terminal back', () => {
			assert.deepStrictEqual(run({}), ['move', 'end']);
		});

		test('leaves the terminal and does not hide when the window closed or the row was replaced', () => {
			assert.deepStrictEqual(run({ current: false, empty: true }), ['end']);
		});

		test('hides the row when the move was skipped and the row is empty', () => {
			assert.deepStrictEqual(run({ canMove: false, empty: true }), ['end', 'hide']);
		});

		test('does not hide while another terminal returns, or while the row is being emptied', () => {
			assert.deepStrictEqual({
				otherReturning: run({ canMove: false, empty: true, remaining: 1 }),
				emptying: run({ canMove: false, empty: true, emptying: true }),
			}, {
				otherReturning: ['end'],
				emptying: ['end'],
			});
		});
	});
});
