/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { completeTerminalReturn, decideTerminalRowMove, EditorAreaCloser, ITerminalReturn, shouldCloseEditorArea, shouldHideTerminalRow, TerminalRowMoveAction } from '../../browser/chatWindowTerminalRowPolicy.js';

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

	test('an empty row hides, also after showing no terminal in it', () => {
		const row = { hostRegistered: true, rowIsEmpty: true, isCurrent: true, isEmptying: false };
		assert.deepStrictEqual({
			empty: shouldHideTerminalRow(row),
			hasTerminal: shouldHideTerminalRow({ ...row, rowIsEmpty: false }),
			replaced: shouldHideTerminalRow({ ...row, isCurrent: false }),
			emptying: shouldHideTerminalRow({ ...row, isEmptying: true }),
			noHostYet: shouldHideTerminalRow({ ...row, hostRegistered: false }),
		}, { empty: true, hasTerminal: false, replaced: false, emptying: false, noHostYet: false });
	});

	test('closing the last editor of the editor area closes it, unless it moved or the window changes', () => {
		const close = { areaIsEmpty: true, isMove: false, windowIsChanging: false };
		assert.deepStrictEqual({
			lastClosed: shouldCloseEditorArea(close),
			othersRemain: shouldCloseEditorArea({ ...close, areaIsEmpty: false }),
			moved: shouldCloseEditorArea({ ...close, isMove: true }),
			replacing: shouldCloseEditorArea({ ...close, windowIsChanging: true }),
		}, { lastClosed: true, othersRemain: false, moved: false, replacing: false });
	});

	test('the editor area closes once its group settled, after the focus it takes back, not as the editor closes', () => {
		const close = { areaIsEmpty: true, isMove: false, windowIsChanging: false };
		let closes = 0;
		const closer = new EditorAreaCloser(() => closes++);
		const steps: number[] = [];

		closer.closed(close);
		steps.push(closes);
		closer.settled(true);
		steps.push(closes);
		closer.settled(true);
		steps.push(closes);
		closer.closed({ ...close, isMove: true });
		closer.settled(true);
		steps.push(closes);
		closer.closed(close);
		closer.settled(false);
		steps.push(closes);

		assert.deepStrictEqual(steps, [0, 1, 1, 1, 1]);
	});
});
