/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hasKey } from '../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatWindowColumnPlacement, ChatWindowLayoutCell, ChatWindowLayoutNode, ChatWindowTerminalPosition, computeChatWindowLayout, diffChatWindowLayout, resolveChatWindowLayoutMode, getPanelAlignmentOfTerminalPosition, IChatWindowLayoutState, ChatWindowLayoutMode } from '../../common/chatWindowLayout.js';

/** Renders a topology compactly: `row[a,b]`, `col[a,b]`, and a `!` after a hidden cell. */
function render(node: ChatWindowLayoutNode): string {
	if (hasKey(node, { children: true })) {
		return `${node.orientation === 'row' ? 'row' : 'col'}[${node.children.map(render).join(',')}]`;
	}
	return node.cell + (node.visible ? '' : '!');
}

function visibleCells(node: ChatWindowLayoutNode): ChatWindowLayoutCell[] {
	if (hasKey(node, { children: true })) {
		return node.children.flatMap(visibleCells);
	}
	return node.visible ? [node.cell] : [];
}

const modes = [ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.SideBySide];
const positions = [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.UnderChat];

function state(overrides: Partial<IChatWindowLayoutState>): IChatWindowLayoutState {
	return { mode: ChatWindowLayoutMode.ChatOnly, terminalPosition: ChatWindowTerminalPosition.FullWidth, terminalsVisible: true, activityBar: true, inputOnly: false, ...overrides };
}

/** The rule table, written out by hand: terminals and column visible, one row per mode and position. */
const expected: { [mode: string]: { [position: string]: { topology: string; column: ChatWindowColumnPlacement } } } = {
	[ChatWindowLayoutMode.ChatOnly]: {
		[ChatWindowTerminalPosition.FullWidth]: { topology: 'col[chat,terminals]', column: ChatWindowColumnPlacement.None },
		[ChatWindowTerminalPosition.UnderEditor]: { topology: 'col[chat,terminals]', column: ChatWindowColumnPlacement.None },
		[ChatWindowTerminalPosition.UnderChat]: { topology: 'col[chat,terminals]', column: ChatWindowColumnPlacement.None },
	},
	[ChatWindowLayoutMode.SideBySide]: {
		[ChatWindowTerminalPosition.FullWidth]: { topology: 'col[row[chat,sidePane],terminals]', column: ChatWindowColumnPlacement.None },
		[ChatWindowTerminalPosition.UnderEditor]: { topology: 'row[chat,col[sidePane,terminals]]', column: ChatWindowColumnPlacement.None },
		[ChatWindowTerminalPosition.UnderChat]: { topology: 'row[col[chat,terminals],sidePane]', column: ChatWindowColumnPlacement.None },
	},
	[ChatWindowLayoutMode.Stacked]: {
		[ChatWindowTerminalPosition.FullWidth]: { topology: 'row[col[sidePane,chat,terminals],column]', column: ChatWindowColumnPlacement.Full },
		[ChatWindowTerminalPosition.UnderEditor]: { topology: 'row[col[sidePane,chat,terminals],column]', column: ChatWindowColumnPlacement.Full },
		[ChatWindowTerminalPosition.UnderChat]: { topology: 'row[col[sidePane,chat,terminals],column]', column: ChatWindowColumnPlacement.Full },
	},
	[ChatWindowLayoutMode.EditorOnly]: {
		[ChatWindowTerminalPosition.FullWidth]: { topology: 'col[row[sidePane,column],terminals]', column: ChatWindowColumnPlacement.BesideEditor },
		[ChatWindowTerminalPosition.UnderEditor]: { topology: 'col[row[sidePane,column],terminals]', column: ChatWindowColumnPlacement.BesideEditor },
		[ChatWindowTerminalPosition.UnderChat]: { topology: 'col[row[sidePane,column],terminals]', column: ChatWindowColumnPlacement.BesideEditor },
	},
};

suite('Chat window layout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function eachState(callback: (s: IChatWindowLayoutState) => void): void {
		for (const mode of modes) {
			for (const terminalPosition of positions) {
				for (const terminalsVisible of [true, false]) {
					for (const activityBar of [true, false]) {
						for (const inputOnly of [true, false]) {
							callback({ mode, terminalPosition, terminalsVisible, activityBar, inputOnly });
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
				const layout = computeChatWindowLayout(state({ mode, terminalPosition: position }));
				actual[mode][position] = { topology: render(layout.topology), column: layout.column };
			}
		}
		assert.deepStrictEqual(actual, expected);
	});

	test('L-03 resolveChatWindowLayoutMode: without an editor only Chat only is available', () => {
		const actual = modes.map(mode => [resolveChatWindowLayoutMode(mode, false), resolveChatWindowLayoutMode(mode, true)]);
		assert.deepStrictEqual(actual, modes.map(mode => [ChatWindowLayoutMode.ChatOnly, mode]));
	});

	test('L-10 Side by Side and Chat only: the strip is inside the chat, no column cell', () => {
		eachState(s => {
			if (s.mode === ChatWindowLayoutMode.ChatOnly || s.mode === ChatWindowLayoutMode.SideBySide) {
				const layout = computeChatWindowLayout(s);
				assert.strictEqual(layout.column, ChatWindowColumnPlacement.None, JSON.stringify(s));
				assert.ok(!layout.tabOrder.includes(ChatWindowLayoutCell.Column), JSON.stringify(s));
			}
		});
	});

	test('L-11 Stacked: the column is a cell of its own at the right of the editor and the chat, past the terminals, in every position', () => {
		for (const position of positions) {
			const layout = computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.Stacked, terminalPosition: position }));
			assert.deepStrictEqual(
				[layout.column, render(layout.topology)],
				[ChatWindowColumnPlacement.Full, 'row[col[sidePane,chat,terminals],column]']);
		}
	});

	test('L-12 Editor only: the column is beside the editor above the terminals, whatever the terminal position', () => {
		const actual = positions.map(position => render(computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.EditorOnly, terminalPosition: position })).topology));
		assert.deepStrictEqual(actual, ['col[row[sidePane,column],terminals]', 'col[row[sidePane,column],terminals]', 'col[row[sidePane,column],terminals]']);
	});

	test('L-10..L-12 no activity bar: no column placement, the column cell stays hidden', () => {
		for (const mode of modes) {
			const layout = computeChatWindowLayout(state({ mode, activityBar: false }));
			assert.strictEqual(layout.column, ChatWindowColumnPlacement.None);
			const hidden = render(layout.topology).includes('column!');
			assert.strictEqual(hidden, mode === ChatWindowLayoutMode.Stacked || mode === ChatWindowLayoutMode.EditorOnly, mode);
			assert.ok(!layout.tabOrder.includes(ChatWindowLayoutCell.Column), mode);
		}
	});

	test('L-20 L-21 input only: only Stacked, and only when asked', () => {
		const actual: { [key: string]: boolean } = {};
		for (const mode of modes) {
			actual[mode] = computeChatWindowLayout(state({ mode, inputOnly: true })).inputOnly;
			assert.strictEqual(computeChatWindowLayout(state({ mode, inputOnly: false })).inputOnly, false);
		}
		assert.deepStrictEqual(actual, { 'chatOnly': false, 'editorOnly': false, 'stacked': true, 'sideBySide': false });
	});

	test('L-31 Stacked forces the terminals across the bottom and the position applies again side by side', () => {
		for (const position of positions) {
			const stacked = computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.Stacked, terminalPosition: position }));
			assert.strictEqual(render(stacked.topology), expected[ChatWindowLayoutMode.Stacked][ChatWindowTerminalPosition.FullWidth].topology);
			const sideBySideAfter = computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.SideBySide, terminalPosition: position }));
			assert.strictEqual(render(sideBySideAfter.topology), expected[ChatWindowLayoutMode.SideBySide][position].topology);
		}
	});

	test('I6 the three Side by Side terminal positions have pairwise distinct topologies', () => {
		const topologies = positions.map(position => render(computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.SideBySide, terminalPosition: position })).topology));
		assert.strictEqual(new Set(topologies).size, positions.length);
	});

	test('L-32 positions share the main window panel alignment vocabulary', () => {
		assert.deepStrictEqual(positions.map(getPanelAlignmentOfTerminalPosition), ['justify', undefined, 'center']);
	});

	test('L-33 showing or hiding the terminals or the strip changes only visibility, never the shape', () => {
		eachState(s => {
			const shown = computeChatWindowLayout(s);
			for (const change of [{ terminalsVisible: !s.terminalsVisible }, { activityBar: !s.activityBar }, { inputOnly: !s.inputOnly }]) {
				const other = computeChatWindowLayout({ ...s, ...change });
				assert.strictEqual(shown.shapeKey, other.shapeKey, JSON.stringify(s));
				assert.notStrictEqual(diffChatWindowLayout(shown, other), 'rebuild', JSON.stringify(s));
			}
			const terminalsToggled = computeChatWindowLayout({ ...s, terminalsVisible: !s.terminalsVisible });
			assert.strictEqual(diffChatWindowLayout(shown, terminalsToggled), 'visibility', JSON.stringify(s));
			assert.strictEqual(diffChatWindowLayout(shown, computeChatWindowLayout({ ...s })), 'none');
			const inputOnlyToggled = computeChatWindowLayout({ ...s, inputOnly: !s.inputOnly });
			assert.strictEqual(diffChatWindowLayout(shown, inputOnlyToggled), shown.inputOnly === inputOnlyToggled.inputOnly ? 'none' : 'visibility', JSON.stringify(s));
		});
	});

	test('L-07 mode and position changes rebuild when the shape differs, and the first layout builds', () => {
		const a = computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.SideBySide }));
		const b = computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.Stacked }));
		const c = computeChatWindowLayout(state({ mode: ChatWindowLayoutMode.SideBySide, terminalPosition: ChatWindowTerminalPosition.UnderChat }));
		assert.deepStrictEqual(
			[diffChatWindowLayout(undefined, a), diffChatWindowLayout(a, b), diffChatWindowLayout(a, c), diffChatWindowLayout(b, a)],
			['rebuild', 'rebuild', 'rebuild', 'rebuild']);
	});

	test('L-07 every cell appears once, and the tree is normalized, in every state', () => {
		eachState(s => {
			const layout = computeChatWindowLayout(s);
			const leaves: string[] = [];
			const check = (node: ChatWindowLayoutNode, parent: string | undefined) => {
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
			assert.ok(layout.tabOrder.every(cell => leaves.includes(cell)));
		});
	});

	test('L-60 tab order is the visual (topology leaf) order of the visible cells, in every state', () => {
		eachState(s => {
			const layout = computeChatWindowLayout(s);
			assert.deepStrictEqual(layout.tabOrder, visibleCells(layout.topology), JSON.stringify(s));
		});
	});

	test('the layout is a pure function of its state', () => {
		eachState(s => assert.deepStrictEqual(computeChatWindowLayout(s), computeChatWindowLayout({ ...s })));
	});
});
