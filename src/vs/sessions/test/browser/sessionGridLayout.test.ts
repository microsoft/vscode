/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener } from '../../../base/browser/dom.js';
import { Direction, ISerializedGrid, IView } from '../../../base/browser/ui/grid/grid.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ISessionGridEntry, SessionGridLayout } from '../../browser/parts/sessionGridLayout.js';
import { getSessionDropDirection } from '../../browser/parts/sessionDropTarget.js';
import { ISessionGridState, isSessionGridState, projectSessionGrid } from '../../services/sessions/browser/sessionGridState.js';
import '../../browser/media/workbench.css';
import '../../browser/parts/media/chatCompositeBar.css';

suite('Sessions - Grid Layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class View implements IView {
		readonly element = document.createElement('input');
		readonly minimumWidth = 80;
		readonly minimumHeight = 80;
		readonly maximumWidth = Number.POSITIVE_INFINITY;
		readonly maximumHeight = Number.POSITIVE_INFINITY;
		readonly onDidChange = Event.None;
		visible = true;
		size = { width: 0, height: 0 };
		layout(width: number, height: number): void { this.size = { width, height }; }
		setVisible(visible: boolean): void { this.visible = visible; }
	}

	function harness() {
		const grid = store.add(new SessionGridLayout());
		document.body.appendChild(grid.element);
		store.add(toDisposable(() => grid.element.remove()));
		const a = { id: 'a', view: new View() };
		const b = { id: 'b', view: new View() };
		const c = { id: 'c', view: new View(), placement: { reference: 'b', direction: Direction.Down } };
		grid.reconcile([a, b], 'a');
		grid.layout(1200, 600, 0, 0, false);
		grid.resize('a', 400, 600);
		return { grid, a, b, c };
	}

	function sizes(grid: SessionGridLayout) {
		return grid.order.map(id => ({ id, ...grid.getSize(id) }));
	}

	test('only exposed session-grid corners use the native connected-tabs radius', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench agent-sessions-workbench mac modern-ui-tabs modern-ui-connected-editor-tabs nopanel noeditorpane nosidebar';
		root.style.cssText = '--vscode-cornerRadius-large: 8px; --vscode-agents-layout-floatingPanelGap: 4px; --vscode-strokeThickness: 1px; --window-corner-radius: 16px;';
		const card = document.createElement('div');
		card.className = 'part sessionspart agents-part-card';
		root.appendChild(card);
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const grid = store.add(new SessionGridLayout());
		card.appendChild(grid.element);
		const entry = (id: string): ISessionGridEntry => {
			const element = document.createElement('div');
			element.className = 'session-view';
			return {
				id,
				view: {
					element,
					minimumWidth: 80, maximumWidth: Number.POSITIVE_INFINITY,
					minimumHeight: 80, maximumHeight: Number.POSITIVE_INFINITY,
					onDidChange: Event.None,
					layout: (width, height) => {
						element.style.width = `${width}px`;
						element.style.height = `${height}px`;
					},
				},
			};
		};
		const a = entry('a');
		const b = entry('b');
		const c = { ...entry('c'), placement: { reference: 'b', direction: Direction.Down } };
		const d = { ...entry('d'), placement: { reference: 'a', direction: Direction.Down } };
		const corners = () => [a, b, c, d].map(({ view }) => {
			const style = mainWindow.getComputedStyle(view.element, '::after');
			return [style.borderBottomLeftRadius, style.borderBottomRightRadius];
		});
		grid.reconcile([a, b], 'a');
		grid.layout(1200, 600, 20, 100, false);
		grid.reconcile([a, d, b, c], 'a');
		const split = corners();
		grid.reconcile([d, a, c, b].map(({ id, view }) => ({ id, view })), 'a');
		const reordered = corners();
		grid.toggleMaximized('c');
		const maximized = corners();
		grid.toggleMaximized('c');
		const unmaximized = corners();
		grid.layout(1600, 800, 40, 200, false);
		const resized = corners();
		grid.reconcile([a], 'a');
		const single = corners()[0];

		assert.deepStrictEqual({ split, reordered, maximized, unmaximized, resized, single }, {
			split: [['7px', '7px'], ['7px', '7px'], ['7px', '11px'], ['11px', '7px']],
			reordered: [['11px', '7px'], ['7px', '11px'], ['7px', '7px'], ['7px', '7px']],
			maximized: [['7px', '7px'], ['7px', '7px'], ['11px', '11px'], ['7px', '7px']],
			unmaximized: [['11px', '7px'], ['7px', '11px'], ['7px', '7px'], ['7px', '7px']],
			resized: [['11px', '7px'], ['7px', '11px'], ['7px', '7px'], ['7px', '7px']],
			single: ['11px', '11px'],
		});
	});

	test('nested insertion and removal preserve an unrelated user-sized column', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'b');
		const split = sizes(grid);
		grid.reconcile([a, b], 'b');
		assert.deepStrictEqual({ split, closed: sizes(grid) }, {
			split: [{ id: 'a', width: 400, height: 600 }, { id: 'b', width: 800, height: 300 }, { id: 'c', width: 800, height: 300 }],
			closed: [{ id: 'a', width: 400, height: 600 }, { id: 'b', width: 800, height: 600 }],
		});
	});

	test('directional moves preserve live content and owned focus across parents', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'c');
		c.view.element.value = 'unsent input';
		c.view.element.focus();
		grid.reconcile([a, { ...c, placement: { reference: 'a', direction: Direction.Down } }, b], 'c');
		assert.deepStrictEqual({
			order: grid.order, above: grid.neighbor('c', Direction.Up), right: grid.neighbor('c', Direction.Right),
			focused: document.activeElement === c.view.element, input: c.view.element.value,
		}, { order: ['a', 'c', 'b'], above: 'a', right: 'b', focused: true, input: 'unsent input' });
	});

	test('reordering and balanced arrangement never steal external focus', () => {
		const { grid, a, b, c } = harness();
		const outside = document.createElement('input');
		document.body.appendChild(outside);
		store.add(toDisposable(() => outside.remove()));
		outside.focus();
		grid.reconcile([c, a, b], 'a');
		grid.arrange();
		assert.deepStrictEqual({ order: grid.order, focused: document.activeElement === outside }, { order: ['c', 'a', 'b'], focused: true });
	});

	test('a new leaf can reference another leaf later in the same update', () => {
		const { grid, a } = harness();
		const b = { id: 'new-b', view: new View() };
		const c = { id: 'new-c', view: new View(), placement: { reference: b.id, direction: Direction.Up } };
		grid.reconcile([a, c, b], 'a');
		assert.deepStrictEqual({ order: grid.order, below: grid.neighbor(c.id, Direction.Down) }, { order: ['a', 'new-c', 'new-b'], below: b.id });
	});

	test('unequal nested geometry and maximization round-trip with existing views', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'c');
		grid.resize('c', 800, 220);
		grid.toggleMaximized('c');
		const state = grid.serialize()!;
		grid.arrange();
		grid.restore(state);
		const maximized = grid.maximized;
		grid.toggleMaximized('c');
		assert.deepStrictEqual({ maximized, sizes: sizes(grid), view: c.view.element.isConnected }, {
			maximized: 'c',
			sizes: [{ id: 'a', width: 400, height: 600 }, { id: 'b', width: 800, height: 380 }, { id: 'c', width: 800, height: 220 }],
			view: true,
		});
	});

	test('phone projection is reversible, including activation and structural edits', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'b');
		const desktop = grid.serialize();
		grid.layout(390, 780, 0, 0, true);
		const phone = { visibility: [a, b, c].map(entry => entry.view.visible), size: b.view.size, geometry: grid.serialize() };
		grid.reconcile([a, b, c], 'c');
		const switched = { visibility: [a, b, c].map(entry => entry.view.visible), size: c.view.size };
		grid.reconcile([a, c], 'c');
		grid.layout(1200, 600, 0, 0, false);
		assert.deepStrictEqual({ phone, switched, desktop: sizes(grid) }, {
			phone: { visibility: [false, true, false], size: { width: 390, height: 780 }, geometry: desktop },
			switched: { visibility: [false, false, true], size: { width: 390, height: 780 } },
			desktop: [{ id: 'a', width: 400, height: 600 }, { id: 'c', width: 800, height: 600 }],
		});
	});

	for (const exit of ['toggle', 'activate', 'insert', 'resize'] as const) {
		test(`maximized viewport resize keeps live and restored geometry identical after ${exit}`, () => {
			const live = harness();
			live.grid.reconcile([live.a, live.b, live.c], 'a');
			live.grid.resize('c', 800, 220);
			live.grid.toggleMaximized('a');
			live.grid.layout(1800, 900, 0, 0, false);
			const state = live.grid.serialize()!;
			const restored = harness();
			restored.grid.reconcile([restored.a, restored.b, restored.c], 'a');
			restored.grid.layout(1800, 900, 0, 0, false);
			restored.grid.restore(state);
			for (const { grid, a, b, c } of [live, restored]) {
				switch (exit) {
					case 'toggle': grid.toggleMaximized('a'); break;
					case 'activate': grid.reconcile([a, b, c], 'b'); break;
					case 'insert': grid.reconcile([a, b, c, { id: 'd', view: new View(), placement: { reference: 'c', direction: Direction.Down } }], 'a'); break;
					case 'resize': grid.resize('a', 650, 900); break;
				}
			}
			assert.deepStrictEqual({ geometry: live.grid.serialize(), maximized: live.grid.maximized }, { geometry: restored.grid.serialize(), maximized: undefined });
		});
	}

	test('neighbor queries do not change maximization or geometry', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'a');
		grid.toggleMaximized('a');
		const state = grid.serialize();
		const neighbor = grid.neighbor('a', Direction.Right);
		assert.deepStrictEqual({ neighbor, state: grid.serialize(), maximized: grid.maximized }, { neighbor: 'b', state, maximized: 'a' });
	});

	test('maximization projects a single live view while canonical desktop geometry scales', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'a');
		grid.resize('c', 800, 220);
		a.view.element.value = 'Keep this input';
		a.view.element.focus();
		grid.toggleMaximized('a');
		grid.layout(1800, 900, 0, 0, false);
		const desktop = { size: a.view.size, visibility: [a, b, c].map(entry => entry.view.visible), geometry: sizes(grid) };
		grid.layout(390, 780, 0, 0, true);
		const phone = { size: a.view.size, geometry: sizes(grid) };
		grid.layout(1800, 900, 0, 0, false);
		grid.toggleMaximized('a');
		assert.deepStrictEqual({ desktop, phone, restored: [a, b, c].map(entry => entry.view.size), focused: document.activeElement === a.view.element, input: a.view.element.value }, {
			desktop: {
				size: { width: 1800, height: 900 }, visibility: [true, false, false], geometry: [
					{ id: 'a', width: 600, height: 900 }, { id: 'b', width: 1200, height: 570 }, { id: 'c', width: 1200, height: 330 },
				]
			},
			phone: { size: { width: 390, height: 780 }, geometry: desktop.geometry },
			restored: [{ width: 600, height: 900 }, { width: 1200, height: 570 }, { width: 1200, height: 330 }],
			focused: true, input: 'Keep this input',
		});
	});

	test('focus restored during a phone transition does not expand a temporarily narrow pane', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'b');
		grid.arrange();
		store.add(addDisposableListener(b.view.element, 'focus', () => grid.expand('b')));
		b.view.element.focus();
		const original = grid.serialize();
		grid.layout(390, 780, 0, 0, true);
		grid.layout(160, 600, 0, 0, false);
		grid.layout(1200, 600, 0, 0, false);
		assert.deepStrictEqual({ geometry: grid.serialize(), focused: document.activeElement === b.view.element }, { geometry: original, focused: true });
	});

	test('a phone-born grid restores desktop geometry without compressing its sizes', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'b');
		const state = grid.serialize()!;
		const restored = store.add(new SessionGridLayout());
		const entries: ISessionGridEntry[] = ['a', 'b', 'c'].map(id => ({ id, view: new View() }));
		restored.reconcile(entries, 'b');
		restored.layout(390, 780, 0, 0, true);
		restored.restore(state);
		const phoneState = restored.serialize();
		restored.layout(1200, 600, 0, 0, false);
		assert.deepStrictEqual({ phoneState, desktop: sizes(restored) }, { phoneState: state, desktop: sizes(grid) });
	});

	test('a fresh phone-born grid has usable desktop allocations before its first save', () => {
		const grid = store.add(new SessionGridLayout());
		grid.reconcile(['a', 'b'].map(id => ({ id, view: new View() })), 'a');
		grid.layout(390, 780, 0, 0, true);
		assert.deepStrictEqual(sizes(grid), [{ id: 'a', width: 500, height: 800 }, { id: 'b', width: 500, height: 800 }]);
	});

	test('maximizing outside a nested branch preserves that hidden branch on reload', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'a');
		grid.resize('c', 800, 220);
		const original = grid.serialize();
		grid.toggleMaximized('a');
		const maximized = grid.serialize()!;
		grid.arrange();
		grid.restore(maximized);
		grid.toggleMaximized('a');
		assert.deepStrictEqual(grid.serialize(), original);
	});

	test('pruning and remapping persisted leaves retains nesting and removes duplicates', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'a');
		const state = grid.serialize()!;
		const partial = projectSessionGrid(state, id => id === 'b' ? undefined : id)!;
		grid.reconcile([a, c], 'a');
		grid.restore(partial);
		assert.deepStrictEqual({ order: grid.order, right: grid.neighbor('a', Direction.Right), sizes: sizes(grid) }, {
			order: ['a', 'c'], right: 'c', sizes: [{ id: 'a', width: 400, height: 600 }, { id: 'c', width: 800, height: 600 }],
		});
	});

	test('losing a maximized leaf reveals the surviving panes', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'c');
		grid.toggleMaximized('c');
		const state = grid.serialize()!;
		grid.reconcile([a, b], 'a');
		grid.restore(state);
		assert.deepStrictEqual({ maximized: grid.maximized, visible: [a, b].map(entry => entry.view.visible), sizes: sizes(grid) }, {
			maximized: undefined, visible: [true, true],
			sizes: [{ id: 'a', width: 400, height: 600 }, { id: 'b', width: 800, height: 600 }],
		});
	});

	test('redirected duplicate leaves retain maximization on their surviving binding', () => {
		const { grid, a, b, c } = harness();
		grid.reconcile([a, b, c], 'c');
		grid.toggleMaximized('c');
		const state = projectSessionGrid(grid.serialize()!, id => id === 'c' ? 'b' : id)!;
		grid.reconcile([a, b], 'b');
		grid.restore(state);
		assert.deepStrictEqual({ maximized: grid.maximized, visible: [a, b].map(entry => entry.view.visible) }, { maximized: 'b', visible: [false, true] });
	});

	test('state validation rejects malformed geometry before constructing a grid', () => {
		const { grid } = harness();
		const state: ISessionGridState = { version: 1, grid: grid.serialize()!, sessions: [{ id: 'a', resource: 'test:a', sticky: true }, { id: 'b', sticky: false }], active: 'a' };
		const invalidGrid = (overrides: Partial<ISerializedGrid>) => isSessionGridState({ ...state, grid: { ...state.grid, ...overrides } });
		assert.deepStrictEqual([
			isSessionGridState(state), isSessionGridState({ ...state, version: 2 }),
			isSessionGridState({ ...state, active: 'missing' }), invalidGrid({ width: Infinity }),
			invalidGrid({ root: { type: 'leaf', size: 1, data: { id: 'missing' } } }),
			isSessionGridState({ ...state, sessions: [state.sessions[0], state.sessions[0]] }),
			isSessionGridState({ ...state, sessions: [{ ...state.sessions[0], resource: '' }, state.sessions[1]] }),
			isSessionGridState({ ...state, sessions: [state.sessions[0]], grid: { ...state.grid, root: { type: 'leaf', size: 1, data: { id: 'a' } } } }),
		], [true, false, false, false, false, false, false, false]);
	});

	test('drop direction uses normalized nearest edges, including corners and the center', () => {
		assert.deepStrictEqual([
			[10, 200], [990, 200], [500, 10], [500, 390], [100, 40], [500, 200],
		].map(([x, y]) => getSessionDropDirection(x, y, 1000, 400)), ['left', 'right', 'up', 'down', 'left', 'left']);
	});
});
