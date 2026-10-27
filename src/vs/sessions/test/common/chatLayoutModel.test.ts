/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hasKey } from '../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ChatColumnPlacement, ChatLayoutCell, ChatLayoutNode, ChatTerminalPosition, computeChatLayout, diffChatLayout, getPanelAlignmentOfTerminalPosition, IChatLayoutState, SessionLayoutMode } from '../../common/chatLayoutModel.js';

/** Renders a topology compactly: `row[a,b]`, `col[a,b]`, and a `!` after a hidden cell. */
function render(node: ChatLayoutNode): string {
	if (hasKey(node, { children: true })) {
		return `${node.orientation === 'row' ? 'row' : 'col'}[${node.children.map(render).join(',')}]`;
	}
	return node.cell + (node.visible ? '' : '!');
}

const modes = [SessionLayoutMode.ChatOnly, SessionLayoutMode.EditorOnly, SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide];
const positions = [ChatTerminalPosition.FullWidth, ChatTerminalPosition.UnderEditor, ChatTerminalPosition.UnderChat];

function state(overrides: Partial<IChatLayoutState>): IChatLayoutState {
	return { mode: SessionLayoutMode.ChatOnly, terminalPosition: ChatTerminalPosition.FullWidth, terminalsVisible: true, activityBar: true, docked: false, inputOnly: false, ...overrides };
}

/** The rule table, written out by hand: terminals and column visible, one row per mode and position. */
const expected: { [mode: string]: { [position: string]: { topology: string; column: ChatColumnPlacement } } } = {
	[SessionLayoutMode.ChatOnly]: {
		[ChatTerminalPosition.FullWidth]: { topology: 'col[chat,terminals]', column: ChatColumnPlacement.None },
		[ChatTerminalPosition.UnderEditor]: { topology: 'col[chat,terminals]', column: ChatColumnPlacement.None },
		[ChatTerminalPosition.UnderChat]: { topology: 'col[chat,terminals]', column: ChatColumnPlacement.None },
	},
	[SessionLayoutMode.SideBySide]: {
		[ChatTerminalPosition.FullWidth]: { topology: 'col[row[chat,sidePane],terminals]', column: ChatColumnPlacement.None },
		[ChatTerminalPosition.UnderEditor]: { topology: 'row[chat,col[sidePane,terminals]]', column: ChatColumnPlacement.None },
		[ChatTerminalPosition.UnderChat]: { topology: 'row[col[chat,terminals],sidePane]', column: ChatColumnPlacement.None },
	},
	[SessionLayoutMode.Stacked]: {
		[ChatTerminalPosition.FullWidth]: { topology: 'row[col[sidePane,chat,terminals],column]', column: ChatColumnPlacement.Full },
		[ChatTerminalPosition.UnderEditor]: { topology: 'row[col[sidePane,chat,terminals],column]', column: ChatColumnPlacement.Full },
		[ChatTerminalPosition.UnderChat]: { topology: 'row[col[sidePane,chat,terminals],column]', column: ChatColumnPlacement.Full },
	},
	[SessionLayoutMode.EditorOnly]: {
		[ChatTerminalPosition.FullWidth]: { topology: 'col[row[sidePane,column],terminals]', column: ChatColumnPlacement.BesideEditor },
		[ChatTerminalPosition.UnderEditor]: { topology: 'col[row[sidePane,column],terminals]', column: ChatColumnPlacement.BesideEditor },
		[ChatTerminalPosition.UnderChat]: { topology: 'row[terminals,sidePane,column]', column: ChatColumnPlacement.BesideEditor },
	},
};

suite('Chat layout model', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function eachState(callback: (s: IChatLayoutState) => void): void {
		for (const mode of modes) {
			for (const terminalPosition of positions) {
				for (const terminalsVisible of [true, false]) {
					for (const activityBar of [true, false]) {
						for (const docked of [true, false]) {
							for (const inputOnly of [true, false]) {
								callback({ mode, terminalPosition, terminalsVisible, activityBar, docked, inputOnly });
							}
						}
					}
				}
			}
		}
	}

	test('L-01 four modes and L-30 terminal positions: topology and column per mode and position', () => {
		const actual: typeof expected = {};
		for (const mode of modes) {
			actual[mode] = {};
			for (const position of positions) {
				const layout = computeChatLayout(state({ mode, terminalPosition: position }));
				actual[mode][position] = { topology: render(layout.topology), column: layout.column };
			}
		}
		assert.deepStrictEqual(actual, expected);
	});

	test('L-03 docked has no Side by Side: it shows Stacked, other modes stay', () => {
		const actual = modes.map(mode => {
			const layout = computeChatLayout(state({ mode, docked: true }));
			return [mode, layout.mode, render(layout.topology)];
		});
		const stacked = 'row[col[sidePane,chat,terminals],column]';
		assert.deepStrictEqual(actual, [
			[SessionLayoutMode.ChatOnly, SessionLayoutMode.ChatOnly, 'col[chat,terminals]'],
			[SessionLayoutMode.EditorOnly, SessionLayoutMode.EditorOnly, 'col[row[sidePane,column],terminals]'],
			[SessionLayoutMode.Stacked, SessionLayoutMode.Stacked, stacked],
			[SessionLayoutMode.SideBySide, SessionLayoutMode.Stacked, stacked],
		]);
	});

	test('L-10 Side by Side and Chat only: the strip is inside the chat, no column cell', () => {
		eachState(s => {
			if (s.mode === SessionLayoutMode.ChatOnly || (s.mode === SessionLayoutMode.SideBySide && !s.docked)) {
				const layout = computeChatLayout(s);
				assert.strictEqual(layout.column, ChatColumnPlacement.None, JSON.stringify(s));
				assert.ok(!layout.tabOrder.includes(ChatLayoutCell.Column), JSON.stringify(s));
			}
		});
	});

	test('L-11 Stacked: the column is a cell of its own at the right of the editor and the chat, past the terminals, in every position', () => {
		for (const position of positions) {
			const layout = computeChatLayout(state({ mode: SessionLayoutMode.Stacked, terminalPosition: position }));
			assert.deepStrictEqual(
				[layout.column, render(layout.topology)],
				[ChatColumnPlacement.Full, 'row[col[sidePane,chat,terminals],column]']);
		}
	});

	test('L-12 Editor only: the column is beside the editor above the terminals; under chat the terminals are beside the editor', () => {
		const actual = positions.map(position => render(computeChatLayout(state({ mode: SessionLayoutMode.EditorOnly, terminalPosition: position })).topology));
		assert.deepStrictEqual(actual, ['col[row[sidePane,column],terminals]', 'col[row[sidePane,column],terminals]', 'row[terminals,sidePane,column]']);
	});

	test('L-10..L-12 no activity bar: no column placement, the column cell stays hidden', () => {
		for (const mode of modes) {
			const layout = computeChatLayout(state({ mode, activityBar: false }));
			assert.strictEqual(layout.column, ChatColumnPlacement.None);
			const hidden = render(layout.topology).includes('column!');
			assert.strictEqual(hidden, layout.tabOrder.includes(ChatLayoutCell.Column), mode);
		}
	});

	test('L-20 L-21 input only: only Stacked, and only when asked', () => {
		const actual: { [key: string]: boolean } = {};
		for (const mode of modes) {
			for (const docked of [false, true]) {
				const layout = computeChatLayout(state({ mode, docked, inputOnly: true }));
				actual[`${mode}${docked ? ' docked' : ''}`] = layout.inputOnly;
				assert.strictEqual(computeChatLayout(state({ mode, docked, inputOnly: false })).inputOnly, false);
			}
		}
		assert.deepStrictEqual(actual, {
			'chatOnly': false, 'chatOnly docked': false,
			'editorOnly': false, 'editorOnly docked': false,
			'stacked': true, 'stacked docked': true,
			'sideBySide': false, 'sideBySide docked': true,
		});
	});

	test('L-31 Stacked forces the terminals across the bottom and the position applies again side by side', () => {
		for (const position of positions) {
			const before = render(computeChatLayout(state({ mode: SessionLayoutMode.SideBySide, terminalPosition: position })).topology);
			assert.strictEqual(render(computeChatLayout(state({ mode: SessionLayoutMode.Stacked, terminalPosition: position })).topology), expected[SessionLayoutMode.Stacked][ChatTerminalPosition.FullWidth].topology);
			assert.strictEqual(render(computeChatLayout(state({ mode: SessionLayoutMode.SideBySide, terminalPosition: position })).topology), before);
		}
	});

	test('L-32 positions share the main window panel alignment vocabulary', () => {
		assert.deepStrictEqual(positions.map(getPanelAlignmentOfTerminalPosition), ['justify', undefined, 'center']);
	});

	test('L-33 showing or hiding the terminals or the strip changes only visibility, never the shape', () => {
		eachState(s => {
			const shown = computeChatLayout(s);
			for (const change of [{ terminalsVisible: !s.terminalsVisible }, { activityBar: !s.activityBar }, { inputOnly: !s.inputOnly }]) {
				const other = computeChatLayout({ ...s, ...change });
				assert.strictEqual(shown.shapeKey, other.shapeKey, JSON.stringify(s));
				assert.notStrictEqual(diffChatLayout(shown, other), 'rebuild', JSON.stringify(s));
			}
			const terminalsToggled = computeChatLayout({ ...s, terminalsVisible: !s.terminalsVisible });
			assert.strictEqual(diffChatLayout(shown, terminalsToggled), 'visibility', JSON.stringify(s));
			assert.strictEqual(diffChatLayout(shown, computeChatLayout({ ...s })), 'none');
		});
	});

	test('L-07 mode and position changes rebuild when the shape differs, and the first layout builds', () => {
		const a = computeChatLayout(state({ mode: SessionLayoutMode.SideBySide }));
		const b = computeChatLayout(state({ mode: SessionLayoutMode.Stacked }));
		const c = computeChatLayout(state({ mode: SessionLayoutMode.SideBySide, terminalPosition: ChatTerminalPosition.UnderChat }));
		assert.deepStrictEqual(
			[diffChatLayout(undefined, a), diffChatLayout(a, b), diffChatLayout(a, c), diffChatLayout(b, a)],
			['rebuild', 'rebuild', 'rebuild', 'rebuild']);
	});

	test('L-07 every cell appears once, and the tree is normalized, in every state', () => {
		eachState(s => {
			const layout = computeChatLayout(s);
			const leaves: string[] = [];
			const check = (node: ChatLayoutNode, parent: string | undefined) => {
				if (hasKey(node, { children: true })) {
					assert.ok(node.children.length > 1 || node === layout.topology, `single child ${JSON.stringify(s)}`);
					assert.notStrictEqual(node.orientation, parent, `nested ${node.orientation} ${JSON.stringify(s)}`);
					node.children.forEach(child => check(child, node.orientation));
				} else {
					leaves.push(node.cell);
				}
			};
			check(layout.topology, undefined);
			assert.strictEqual(new Set(leaves).size, leaves.length);
			assert.deepStrictEqual([...leaves].sort(), [...layout.tabOrder].sort());
		});
	});

	test('L-60 tab order is chat, side pane, terminals, strip in every mode', () => {
		const actual = modes.map(mode => computeChatLayout(state({ mode })).tabOrder);
		assert.deepStrictEqual(actual, [
			[ChatLayoutCell.Chat, ChatLayoutCell.Terminals],
			[ChatLayoutCell.SidePane, ChatLayoutCell.Terminals, ChatLayoutCell.Column],
			[ChatLayoutCell.Chat, ChatLayoutCell.SidePane, ChatLayoutCell.Terminals, ChatLayoutCell.Column],
			[ChatLayoutCell.Chat, ChatLayoutCell.SidePane, ChatLayoutCell.Terminals],
		]);
	});

	test('the layout is a pure function of its state', () => {
		eachState(s => assert.deepStrictEqual(computeChatLayout(s), computeChatLayout({ ...s })));
	});
});
