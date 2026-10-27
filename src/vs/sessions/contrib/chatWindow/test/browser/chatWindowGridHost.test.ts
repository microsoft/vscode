/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeSessionGridLayout, ISessionGridLayoutState, SessionGridCell, SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowCellView, ChatWindowGridHost, getChatWindowCellInsets } from '../../browser/chatWindowGridHost.js';
import { getChatWindowDefaultSizing } from '../../browser/chatWindowService.js';

interface IBox { top: number; left: number; width: number; height: number }

const WIDTH = 1000;
const HEIGHT = 800;
const COLUMN_WIDTH = 34;

suite('ChatWindowGridHost', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(store: DisposableStore) {
		const container = $('.chat-window-host');
		container.style.position = 'absolute';
		container.style.width = `${WIDTH}px`;
		container.style.height = `${HEIGHT}px`;
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const boxes = new Map<SessionGridCell, IBox>();
		const cells = new Map<SessionGridCell, ChatWindowCellView>();
		for (const cell of [SessionGridCell.Chat, SessionGridCell.SidePane, SessionGridCell.Terminals, SessionGridCell.Column]) {
			const fixedWidth = cell === SessionGridCell.Column;
			const view = store.add(new ChatWindowCellView(cell, { minimumWidth: fixedWidth ? COLUMN_WIDTH : 100, maximumWidth: fixedWidth ? COLUMN_WIDTH : Number.POSITIVE_INFINITY, minimumHeight: 50, maximumHeight: Number.POSITIVE_INFINITY }));
			view.setContent({ element: $(`.content-${cell}`), layout: (width, height, top, left) => boxes.set(cell, { top, left, width, height }) });
			cells.set(cell, view);
		}
		const host = store.add(new ChatWindowGridHost(container, cells, (cell, axis) => cell === SessionGridCell.Column && axis === 'row' ? { kind: 'fixed', size: COLUMN_WIDTH } : getChatWindowDefaultSizing(cell, axis)));
		host.layoutGrid(WIDTH, HEIGHT);
		return { host, container, boxes, cells };
	}

	function state(overrides: Partial<ISessionGridLayoutState>): ISessionGridLayoutState {
		return { mode: SessionLayoutMode.SideBySide, terminalPosition: SessionTerminalPosition.FullWidth, terminalsVisible: true, activityBar: true, inputOnly: false, ...overrides };
	}

	/** The visible cells in DOM order, which is the tab and landmark order. */
	function domOrder(container: HTMLElement): string[] {
		return Array.from(container.querySelectorAll<HTMLElement>('.chat-window-cell'))
			.filter(element => !element.classList.contains('hidden') && element.offsetParent !== null)
			.map(element => Array.from(element.classList).find(name => name.startsWith('chat-window-cell-') && name !== 'chat-window-cell-card')!.replace('chat-window-cell-', ''));
	}

	test('lays the cells out in the DOM in the order of the topology, in every mode', () => {
		const store = disposables.add(new DisposableStore());
		const { host, container } = createHost(store);
		const results = [SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly].map(mode => {
			const layout = computeSessionGridLayout(state({ mode }));
			host.apply(layout);
			return { mode, dom: domOrder(container).join(','), tabOrder: layout.tabOrder.join(',') };
		});
		assert.deepStrictEqual(results.map(result => result.dom === result.tabOrder), [true, true, true, true]);
		store.dispose();
	});

	test('stacked: the column runs the full height past the terminals, which span only the editor area and the chat', () => {
		const store = disposables.add(new DisposableStore());
		const { host, boxes } = createHost(store);
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.Stacked })));
		const column = boxes.get(SessionGridCell.Column)!;
		const terminals = boxes.get(SessionGridCell.Terminals)!;
		assert.deepStrictEqual({
			columnTop: column.top, columnBottom: column.top + column.height, columnWidth: column.width,
			terminalsRight: terminals.left + terminals.width, columnLeft: column.left,
		}, { columnTop: 0, columnBottom: HEIGHT, columnWidth: COLUMN_WIDTH, terminalsRight: WIDTH - COLUMN_WIDTH, columnLeft: WIDTH - COLUMN_WIDTH });
		store.dispose();
	});

	test('editor only: the column is beside the editor area and stops above the terminals, which keep the full width', () => {
		const store = disposables.add(new DisposableStore());
		const { host, boxes } = createHost(store);
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.EditorOnly })));
		const column = boxes.get(SessionGridCell.Column)!;
		const sidePane = boxes.get(SessionGridCell.SidePane)!;
		const terminals = boxes.get(SessionGridCell.Terminals)!;
		assert.deepStrictEqual({ columnBottom: column.top + column.height, terminalsWidth: terminals.width, terminalsTop: terminals.top }, { columnBottom: sidePane.top + sidePane.height, terminalsWidth: WIDTH, terminalsTop: sidePane.top + sidePane.height });
		store.dispose();
	});

	test('showing or hiding the terminals moves no other cell, does not rebuild the grid, and gives the terminals their size back', () => {
		const store = disposables.add(new DisposableStore());
		const { host, boxes } = createHost(store);
		host.apply(computeSessionGridLayout(state({ terminalsVisible: true })));
		const rebuilds = host.rebuilds;
		const terminalsHeight = boxes.get(SessionGridCell.Terminals)!.height;
		const chatWidth = boxes.get(SessionGridCell.Chat)!.width;
		host.apply(computeSessionGridLayout(state({ terminalsVisible: false })));
		const hidden = { chatWidth: boxes.get(SessionGridCell.Chat)!.width, chatHeight: boxes.get(SessionGridCell.Chat)!.height };
		host.apply(computeSessionGridLayout(state({ terminalsVisible: true })));
		assert.deepStrictEqual({
			rebuilt: host.rebuilds !== rebuilds,
			hidden,
			shownAgain: boxes.get(SessionGridCell.Terminals)!.height,
		}, { rebuilt: false, hidden: { chatWidth, chatHeight: HEIGHT }, shownAgain: terminalsHeight });
		store.dispose();
	});

	test('every mode round trip keeps every cell of the topology in the grid and in the DOM', () => {
		const store = disposables.add(new DisposableStore());
		const { host, container } = createHost(store);
		const modes = [SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly];
		const positions = [SessionTerminalPosition.FullWidth, SessionTerminalPosition.UnderChat, SessionTerminalPosition.UnderEditor];
		const failures: string[] = [];
		for (const position of positions) {
			for (const from of modes) {
				for (const to of modes) {
					for (const mode of [from, to]) {
						const layout = computeSessionGridLayout(state({ mode, terminalPosition: position }));
						host.apply(layout);
						const dom = domOrder(container).join(',');
						if (dom !== layout.tabOrder.join(',')) {
							failures.push(`${position} ${from}->${to}: ${dom} != ${layout.tabOrder.join(',')}`);
						}
					}
				}
			}
		}
		assert.deepStrictEqual(failures, []);
		store.dispose();
	});

	test('a cell keeps the size the user gave it when the mode changes away and back', () => {
		const store = disposables.add(new DisposableStore());
		const { host, boxes } = createHost(store);
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalsVisible: false })));
		host.resizeCell(SessionGridCell.Chat, { width: 300 });
		const resized = boxes.get(SessionGridCell.Chat)!.width;
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.ChatOnly, terminalsVisible: false })));
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalsVisible: false })));
		assert.deepStrictEqual({ resized, back: boxes.get(SessionGridCell.Chat)!.width }, { resized: 300, back: 300 });
		store.dispose();
	});

	test('tall terminals give way first when the mode changes, so that the editor area and the chat keep their heights', () => {
		const store = disposables.add(new DisposableStore());
		const { host, boxes } = createHost(store);
		// Side by side, the terminals below the chat are made tall; Stacked has not shown yet.
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalPosition: SessionTerminalPosition.UnderChat })));
		host.resizeCell(SessionGridCell.Terminals, { height: 700 });
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.Stacked, terminalPosition: SessionTerminalPosition.UnderChat })));
		const sidePane = boxes.get(SessionGridCell.SidePane)!.height;
		const chat = boxes.get(SessionGridCell.Chat)!.height;
		const terminals = boxes.get(SessionGridCell.Terminals)!.height;
		assert.deepStrictEqual({ editorAndChatKeepMost: sidePane + chat >= HEIGHT * 0.9, fills: sidePane + chat + terminals }, { editorAndChatKeepMost: true, fills: HEIGHT });
		store.dispose();
	});

	test('the sizes the cells showed with come back in another host, such as after a reload', () => {
		const store = disposables.add(new DisposableStore());
		const first = createHost(store);
		first.host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalsVisible: false })));
		first.host.resizeCell(SessionGridCell.Chat, { width: 320 });
		const exported = first.host.exportSizes();
		const second = createHost(store);
		second.host.importSizes(exported);
		second.host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalsVisible: false })));
		assert.deepStrictEqual(second.boxes.get(SessionGridCell.Chat)!.width, 320);
		store.dispose();
	});

	test('a mode shown with the terminals hidden does not squeeze them when it shows again with them', () => {
		const store = disposables.add(new DisposableStore());
		const { host, boxes } = createHost(store);
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.EditorOnly, terminalsVisible: false })));
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide, terminalsVisible: true })));
		host.resizeCell(SessionGridCell.Terminals, { height: 225 });
		host.apply(computeSessionGridLayout(state({ mode: SessionLayoutMode.EditorOnly, terminalsVisible: true })));
		assert.deepStrictEqual(boxes.get(SessionGridCell.Terminals)!.height, 225);
		store.dispose();
	});

	test('the sashes in the gaps between the cards show the gripper of the main window\'s, in every mode, and none without a gap', () => {
		const store = disposables.add(new DisposableStore());
		const { host, container } = createHost(store);
		const gripped = () => {
			const sashes = Array.from(container.querySelectorAll('.monaco-sash'));
			return { sashes: sashes.length > 0, gripped: sashes.every(sash => sash.classList.contains('agents-grid-gap-sash')), none: sashes.every(sash => !sash.classList.contains('agents-grid-gap-sash')) };
		};
		const result: Record<string, ReturnType<typeof gripped>> = {};
		host.setGap(8);
		for (const mode of [SessionLayoutMode.SideBySide, SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly]) {
			host.apply(computeSessionGridLayout(state({ mode })));
			result[mode] = gripped();
		}
		host.setGap(0);
		result.noGap = gripped();
		const withGap = { sashes: true, gripped: true, none: false };
		assert.deepStrictEqual(result, {
			[SessionLayoutMode.SideBySide]: withGap,
			[SessionLayoutMode.Stacked]: withGap,
			[SessionLayoutMode.EditorOnly]: withGap,
			[SessionLayoutMode.ChatOnly]: withGap,
			noGap: { sashes: true, gripped: false, none: true },
		});
		store.dispose();
	});

	test('cards keep a shared gap to the cells beside them, none at the edges of the window, and are flush without a gap', () => {
		const layout = computeSessionGridLayout(state({ mode: SessionLayoutMode.SideBySide }));
		assert.deepStrictEqual([Object.fromEntries(getChatWindowCellInsets(layout.topology, 8)), Object.fromEntries(getChatWindowCellInsets(layout.topology, 0))], [{
			[SessionGridCell.Chat]: { top: 0, right: 4, bottom: 4, left: 0 },
			[SessionGridCell.SidePane]: { top: 0, right: 0, bottom: 4, left: 4 },
			[SessionGridCell.Terminals]: { top: 4, right: 0, bottom: 0, left: 0 },
		}, {
			[SessionGridCell.Chat]: { top: 0, right: 0, bottom: 0, left: 0 },
			[SessionGridCell.SidePane]: { top: 0, right: 0, bottom: 0, left: 0 },
			[SessionGridCell.Terminals]: { top: 0, right: 0, bottom: 0, left: 0 },
		}]);
	});
});
