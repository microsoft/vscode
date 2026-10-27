/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SessionColumnPlacement, SessionGridCell, SessionHeaderSpan, SessionGridLayoutNode, SessionTerminalPosition, computeSessionGridLayout, diffSessionGridLayout, resolveSessionLayoutMode, getPanelAlignmentOfTerminalPosition, ISessionGridLayoutState, SessionLayoutMode } from '../../../common/sessionGridLayout/sessionGridLayout.js';

/** Renders a topology compactly: `row[a,b]`, `col[a,b]`, and a `!` after a hidden cell. */
function render(node: SessionGridLayoutNode): string {
	if (hasKey(node, { children: true })) {
		return `${node.orientation === 'row' ? 'row' : 'col'}[${node.children.map(render).join(',')}]`;
	}
	return node.cell + (node.visible ? '' : '!');
}

function visibleCells(node: SessionGridLayoutNode): SessionGridCell[] {
	if (hasKey(node, { children: true })) {
		return node.children.flatMap(visibleCells);
	}
	return node.visible ? [node.cell] : [];
}

const modes = [SessionLayoutMode.ChatOnly, SessionLayoutMode.EditorOnly, SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide];
const positions = [SessionTerminalPosition.FullWidth, SessionTerminalPosition.UnderEditor, SessionTerminalPosition.UnderChat];

function state(overrides: Partial<ISessionGridLayoutState>): ISessionGridLayoutState {
	return { mode: SessionLayoutMode.ChatOnly, terminalPosition: SessionTerminalPosition.FullWidth, terminalsVisible: true, activityBar: true, inputOnly: false, ...overrides };
}

/** The rule table, written out by hand: terminals and column visible, one row per mode and position. */
const expected: { [mode: string]: { [position: string]: { topology: string; column: SessionColumnPlacement } } } = {
	[SessionLayoutMode.ChatOnly]: {
		[SessionTerminalPosition.FullWidth]: { topology: 'col[chat,terminals]', column: SessionColumnPlacement.None },
		[SessionTerminalPosition.UnderEditor]: { topology: 'col[chat,terminals]', column: SessionColumnPlacement.None },
		[SessionTerminalPosition.UnderChat]: { topology: 'col[chat,terminals]', column: SessionColumnPlacement.None },
	},
	[SessionLayoutMode.SideBySide]: {
		[SessionTerminalPosition.FullWidth]: { topology: 'col[row[chat,sidePane],terminals]', column: SessionColumnPlacement.None },
		[SessionTerminalPosition.UnderEditor]: { topology: 'row[chat,col[sidePane,terminals]]', column: SessionColumnPlacement.None },
		[SessionTerminalPosition.UnderChat]: { topology: 'row[col[chat,terminals],sidePane]', column: SessionColumnPlacement.None },
	},
	[SessionLayoutMode.Stacked]: {
		[SessionTerminalPosition.FullWidth]: { topology: 'row[col[sidePane,chat,terminals],column]', column: SessionColumnPlacement.Full },
		[SessionTerminalPosition.UnderEditor]: { topology: 'row[col[sidePane,chat,terminals],column]', column: SessionColumnPlacement.Full },
		[SessionTerminalPosition.UnderChat]: { topology: 'row[col[sidePane,chat,terminals],column]', column: SessionColumnPlacement.Full },
	},
	[SessionLayoutMode.EditorOnly]: {
		[SessionTerminalPosition.FullWidth]: { topology: 'col[row[sidePane,column],terminals]', column: SessionColumnPlacement.BesideEditor },
		[SessionTerminalPosition.UnderEditor]: { topology: 'col[row[sidePane,column],terminals]', column: SessionColumnPlacement.BesideEditor },
		[SessionTerminalPosition.UnderChat]: { topology: 'col[row[sidePane,column],terminals]', column: SessionColumnPlacement.BesideEditor },
	},
};

suite('Session grid layout', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function eachState(callback: (s: ISessionGridLayoutState) => void): void {
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
				const layout = computeSessionGridLayout(state({ mode, terminalPosition: position }));
				actual[mode][position] = { topology: render(layout.topology), column: layout.column };
			}
		}
		assert.deepStrictEqual(actual, expected);
	});

	test('L-03 resolveSessionLayoutMode: without an editor only Chat only is available', () => {
		const actual = modes.map(mode => [resolveSessionLayoutMode(mode, false), resolveSessionLayoutMode(mode, true)]);
		assert.deepStrictEqual(actual, modes.map(mode => [SessionLayoutMode.ChatOnly, mode]));
	});

	test('L-10 Side by Side and Chat only: the strip is inside the chat, no column cell', () => {
		eachState(s => {
			if (s.mode === SessionLayoutMode.ChatOnly || s.mode === SessionLayoutMode.SideBySide) {
				const layout = computeSessionGridLayout(s);
				assert.strictEqual(layout.column, SessionColumnPlacement.None, JSON.stringify(s));
				assert.ok(!layout.tabOrder.includes(SessionGridCell.Column), JSON.stringify(s));
			}
		});
	});

	test('L-11 Stacked: the column is a cell of its own at the right of the editor and the chat, past the terminals, in every position', () => {
		for (const position of positions) {
			const layout = computeSessionGridLayout(state({ mode: SessionLayoutMode.Stacked, terminalPosition: position }));
			assert.deepStrictEqual(
				[layout.column, render(layout.topology)],
				[SessionColumnPlacement.Full, 'row[col[sidePane,chat,terminals],column]']);
		}
	});

	test('L-12 Editor only: the column is beside the editor above the terminals, whatever the terminal position', () => {
		const actual = positions.map(position => render(computeSessionGridLayout(state({ mode: SessionLayoutMode.EditorOnly, terminalPosition: position })).topology));
		assert.deepStrictEqual(actual, ['col[row[sidePane,column],terminals]', 'col[row[sidePane,column],terminals]', 'col[row[sidePane,column],terminals]']);
	});

	test('L-10..L-12 no activity bar: no column placement, the column cell stays hidden', () => {
		for (const mode of modes) {
			const layout = computeSessionGridLayout(state({ mode, activityBar: false }));
			assert.strictEqual(layout.column, SessionColumnPlacement.None);
			const hidden = render(layout.topology).includes('column!');
			assert.strictEqual(hidden, mode === SessionLayoutMode.Stacked || mode === SessionLayoutMode.EditorOnly, mode);
			assert.ok(!layout.tabOrder.includes(SessionGridCell.Column), mode);
		}
	});

	test('L-20 L-21 input only: only Stacked, and only when asked', () => {
		const actual: { [key: string]: boolean } = {};
		for (const mode of modes) {
			actual[mode] = computeSessionGridLayout(state({ mode, inputOnly: true })).inputOnly;
			assert.strictEqual(computeSessionGridLayout(state({ mode, inputOnly: false })).inputOnly, false);
		}
		assert.deepStrictEqual(actual, { 'chatOnly': false, 'editorOnly': false, 'stacked': true, 'sideBySide': false });
	});

	test('L-31 Stacked forces the terminals across the bottom and the position applies again side by side', () => {
		for (const position of positions) {
			const stacked = computeSessionGridLayout(state({ mode: SessionLayoutMode.Stacked, terminalPosition: position }));
			assert.strictEqual(render(stacked.topology), expected[SessionLayoutMode.Stacked][SessionTerminalPosition.FullWidth].topology);
			const sideBySideAfter = computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalPosition: position }));
			assert.strictEqual(render(sideBySideAfter.topology), expected[SessionLayoutMode.SideBySide][position].topology);
		}
	});

	test('I6 the three Side by Side terminal positions have pairwise distinct topologies', () => {
		const topologies = positions.map(position => render(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalPosition: position })).topology));
		assert.strictEqual(new Set(topologies).size, positions.length);
	});

	test('L-32 positions share the main window panel alignment vocabulary', () => {
		assert.deepStrictEqual(positions.map(getPanelAlignmentOfTerminalPosition), ['justify', undefined, 'center']);
	});

	test('L-33 showing or hiding the terminals or the strip changes only visibility, never the shape', () => {
		eachState(s => {
			const shown = computeSessionGridLayout(s);
			for (const change of [{ terminalsVisible: !s.terminalsVisible }, { activityBar: !s.activityBar }, { inputOnly: !s.inputOnly }]) {
				const other = computeSessionGridLayout({ ...s, ...change });
				assert.strictEqual(shown.shapeKey, other.shapeKey, JSON.stringify(s));
				assert.notStrictEqual(diffSessionGridLayout(shown, other), 'rebuild', JSON.stringify(s));
			}
			const terminalsToggled = computeSessionGridLayout({ ...s, terminalsVisible: !s.terminalsVisible });
			assert.strictEqual(diffSessionGridLayout(shown, terminalsToggled), 'visibility', JSON.stringify(s));
			assert.strictEqual(diffSessionGridLayout(shown, computeSessionGridLayout({ ...s })), 'none');
			const inputOnlyToggled = computeSessionGridLayout({ ...s, inputOnly: !s.inputOnly });
			assert.strictEqual(diffSessionGridLayout(shown, inputOnlyToggled), shown.inputOnly === inputOnlyToggled.inputOnly ? 'none' : 'visibility', JSON.stringify(s));
		});
	});

	test('L-07 mode and position changes rebuild when the shape differs, and the first layout builds', () => {
		const a = computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide }));
		const b = computeSessionGridLayout(state({ mode: SessionLayoutMode.Stacked }));
		const c = computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalPosition: SessionTerminalPosition.UnderChat }));
		assert.deepStrictEqual(
			[diffSessionGridLayout(undefined, a), diffSessionGridLayout(a, b), diffSessionGridLayout(a, c), diffSessionGridLayout(b, a)],
			['rebuild', 'rebuild', 'rebuild', 'rebuild']);
	});

	test('L-07 every cell appears once, and the tree is normalized, in every state', () => {
		eachState(s => {
			const layout = computeSessionGridLayout(s);
			const leaves: string[] = [];
			const check = (node: SessionGridLayoutNode, parent: string | undefined) => {
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
			const layout = computeSessionGridLayout(s);
			assert.deepStrictEqual(layout.tabOrder, visibleCells(layout.topology), JSON.stringify(s));
		});
	});

	test('the header row spans the chat\'s column only Side by Side, where the editor runs to the top beside the chat, and the window otherwise, above the strip column too', () => {
		const header: Record<string, string[]> = {};
		for (const mode of [SessionLayoutMode.SideBySide, SessionLayoutMode.Stacked, SessionLayoutMode.ChatOnly, SessionLayoutMode.EditorOnly]) {
			header[mode] = [SessionTerminalPosition.FullWidth, SessionTerminalPosition.UnderEditor, SessionTerminalPosition.UnderChat].map(terminalPosition => computeSessionGridLayout(state({ mode, terminalPosition })).header);
		}
		// Side by Side, the chat is the leftmost cell at the top, with the editor to its right.
		const topLeft = (node: SessionGridLayoutNode): SessionGridCell => hasKey(node, { children: true }) ? topLeft(node.children[0]) : node.cell;
		assert.deepStrictEqual({ header, sideBySideTopLeft: topLeft(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide })).topology) }, {
			header: {
				[SessionLayoutMode.SideBySide]: [SessionHeaderSpan.ChatColumn, SessionHeaderSpan.ChatColumn, SessionHeaderSpan.ChatColumn],
				[SessionLayoutMode.Stacked]: [SessionHeaderSpan.Full, SessionHeaderSpan.Full, SessionHeaderSpan.Full],
				[SessionLayoutMode.ChatOnly]: [SessionHeaderSpan.Full, SessionHeaderSpan.Full, SessionHeaderSpan.Full],
				[SessionLayoutMode.EditorOnly]: [SessionHeaderSpan.Full, SessionHeaderSpan.Full, SessionHeaderSpan.Full],
			},
			sideBySideTopLeft: SessionGridCell.Chat,
		});
	});

	test('the layout is a pure function of its state', () => {
		eachState(s => assert.deepStrictEqual(computeSessionGridLayout(s), computeSessionGridLayout({ ...s })));
	});
});
