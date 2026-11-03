/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContentPart, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatWindowGrid, ChatWindowGridCell, IChatWindowGridChrome } from '../../browser/chatWindowGrid.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { ChatWindowLayoutMode, ChatWindowTerminalPosition } from '../../common/chatWindowLayout.js';

suite('Chat window grid', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPart(name: string): IContentPart {
		const group = new class extends mock<IEditorGroup>() {
			override readonly isEmpty = false;
			override readonly onDidModelChange = Event.None;
		}();
		return new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [group];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
	}

	function createChrome(size: number): IChatWindowGridChrome {
		return { element: $('div'), visible: constObservable(true), size: constObservable(size), layout: () => { } };
	}

	function setup() {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const container = $('div');
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, mode, constObservable(0), undefined));
		grid.layout(1000, 800);
		const visible = () => [ChatWindowGridCell.TitleRow, ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Strip].filter(cell => grid.partGrid!.isCellVisible(cell));
		return { mode, grid, visible };
	}

	test('the title row is above the chat while the main part is beside it, else across the window; the strip has a column of its own while the chat is below the main part or hidden', () => {
		const { mode, grid, visible } = setup();
		const layouts: Record<string, { topology: string; visible: string[] }> = {};
		for (const candidate of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly]) {
			mode.set(candidate, undefined);
			layouts[candidate] = { topology: grid.partGrid!.describe(), visible: visible() };
		}

		assert.deepStrictEqual(layouts, {
			[ChatWindowLayoutMode.SideBySide]: { topology: 'column(titleRow, row(chat, main))', visible: ['titleRow', 'chat', 'main'] },
			[ChatWindowLayoutMode.ChatOnly]: { topology: 'column(titleRow, row(chat, main))', visible: ['titleRow', 'chat'] },
			[ChatWindowLayoutMode.Stacked]: { topology: 'column(titleRow, row(column(main, chat), strip))', visible: ['titleRow', 'chat', 'main', 'strip'] },
			[ChatWindowLayoutMode.EditorOnly]: { topology: 'column(titleRow, row(column(main, chat), strip))', visible: ['titleRow', 'main', 'strip'] },
		});
	});

	test('the title row is across the top of the window in every mode, and shows or hides as it says, without moving or rebuilding anything', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const shown = observableValue('shown', false);
		const titleRow = { ...createChrome(30), visible: shown };
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow, strip: createChrome(34) }, mode, constObservable(0), undefined));
		grid.layout(1000, 800);
		const partGrid = grid.partGrid;
		const parent = titleRow.element.parentElement;
		const read = () => ({ topology: grid.topology, visible: grid.partGrid!.isCellVisible(ChatWindowGridCell.TitleRow), chatHeight: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height });
		const hidden = read();
		shown.set(true, undefined);
		const visible = read();
		shown.set(false, undefined);
		const hiddenAgain = { ...read(), sameGrid: grid.partGrid === partGrid, sameParent: titleRow.element.parentElement === parent };

		assert.deepStrictEqual({ hidden, visible, hiddenAgain }, {
			hidden: { topology: 'column(titleRow,row(chat,main))', visible: false, chatHeight: 800 },
			visible: { topology: 'column(titleRow,row(chat,main))', visible: true, chatHeight: 770 },
			hiddenAgain: { topology: 'column(titleRow,row(chat,main))', visible: false, chatHeight: 800, sameGrid: true, sameParent: true },
		});
	});

	test('opens with the main part wider and taller than the chat, and the title row and strip as large as they say', () => {
		const { mode, grid } = setup();
		const sideBySide = { chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, main: grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width, titleRow: grid.partGrid!.getCellSize(ChatWindowGridCell.TitleRow).height };
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const stacked = { chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height, main: grid.partGrid!.getCellSize(ChatWindowGridCell.Main).height, strip: grid.partGrid!.getCellSize(ChatWindowGridCell.Strip).width };

		assert.deepStrictEqual({ sideBySide, stacked }, {
			sideBySide: { chat: 400, main: 600, titleRow: 30 },
			stacked: { chat: 346, main: 424, strip: 34 },
		});
	});

	test('keeps the outer insets to the edges of the window, also after a change of arrangement, and the parts share what is inside them', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const container = $('div');
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, mode, constObservable(0), undefined));
		grid.setOuterInsets({ top: 0, right: 10, bottom: 10, left: 10 });
		grid.layout(1000, 800);
		const width = (cell: ChatWindowGridCell) => grid.partGrid!.getCellSize(cell).width;
		const sideBySide = { chat: width(ChatWindowGridCell.Chat), main: width(ChatWindowGridCell.Main) };
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const stacked = { chatAndMain: width(ChatWindowGridCell.Main), strip: width(ChatWindowGridCell.Strip), chatHeight: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height + grid.partGrid!.getCellSize(ChatWindowGridCell.Main).height };

		assert.deepStrictEqual({ sideBySide, stacked, leftInset: container.style.getPropertyValue('--chat-window-outer-inset-left') }, {
			sideBySide: { chat: 392, main: 588 },
			stacked: { chatAndMain: 946, strip: 34, chatHeight: 760 },
			leftInset: '10px',
		});
	});

	test('a part keeps the size the user gave it in each arrangement, and the sizes come back for the chat in a new window', () => {
		const { mode, grid } = setup();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 300, height: 770 });
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 966, height: 200 });
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const backSideBySide = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width;
		const sizes = grid.exportSizes();

		const restored = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.Stacked), constObservable(0), sizes));
		restored.layout(1000, 800);

		assert.deepStrictEqual({ backSideBySide, restoredStacked: restored.partGrid!.getCellSize(ChatWindowGridCell.Chat).height }, { backSideBySide: 300, restoredStacked: 200 });
	});

	test('sizes of an arrangement that something else changed, such as a part moved, are not remembered for the arrangement: the main part comes back at its remembered share, not at its minimum', () => {
		const { mode, grid } = setup();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 400, height: 770 });
		// Moved by the user, such as with Move Part Down: the chat across the window, below the main part.
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Down });
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ topology: grid.partGrid!.describe(), chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, exported: grid.exportSizes()['column(titleRow,row(chat,main))']?.[ChatWindowGridCell.Chat]?.width }, { topology: 'column(titleRow, row(chat, main))', chat: 400, exported: 400 });
	});

	/** A part whose editors come and go: it is empty until an editor opens in it. */
	function createPartWithEditors(name: string) {
		const onDidModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		let empty = true;
		const group = new class extends mock<IEditorGroup>() {
			override get isEmpty() { return empty; }
			override readonly onDidModelChange = onDidModelChange.event;
		}();
		const part = new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [group];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const setEmpty = (value: boolean) => {
			empty = value;
			onDidModelChange.fire({ kind: 0 } as IGroupModelChangeEvent);
		};
		return { part, setEmpty };
	}

	function setupWithTerminals(initialMode = ChatWindowLayoutMode.SideBySide) {
		const mode = observableValue<ChatWindowLayoutMode>('mode', initialMode);
		const position = observableValue<ChatWindowTerminalPosition>('position', ChatWindowTerminalPosition.FullWidth);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals }, mode, constObservable(0), undefined, position));
		grid.layout(1000, 800);
		const open = () => {
			terminals.set(terminalsPart.part, undefined);
			terminalsPart.setEmpty(false);
		};
		const height = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		return { mode, position, terminals: terminals as IObservable<IContentPart | undefined>, terminalsPart, grid, open, height };
	}

	test('the terminals join the grid below the chat, below the main part or across the window, across the chat and the main part while stacked, and below the strip in editor only', () => {
		const { mode, position, grid, open } = setupWithTerminals();
		const before = grid.partGrid!.describe();
		open();
		const layouts: Record<string, string> = {};
		for (const candidate of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly]) {
			mode.set(candidate, undefined);
			for (const terminalPosition of [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.UnderEditor]) {
				position.set(terminalPosition, undefined);
				layouts[`${candidate}/${terminalPosition}`] = grid.partGrid!.describe();
			}
		}

		assert.deepStrictEqual({ before, layouts }, {
			before: 'column(titleRow, row(chat, main))',
			layouts: {
				'sideBySide/fullWidth': 'column(titleRow, row(chat, main), terminals)',
				'sideBySide/underChat': 'column(titleRow, row(column(chat, terminals), main))',
				'sideBySide/underEditor': 'column(titleRow, row(chat, column(main, terminals)))',
				'chatOnly/fullWidth': 'column(titleRow, row(chat, main), terminals)',
				'chatOnly/underChat': 'column(titleRow, row(column(chat, terminals), main))',
				'chatOnly/underEditor': 'column(titleRow, row(chat, main), terminals)',
				'stacked/fullWidth': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'stacked/underChat': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'stacked/underEditor': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'editorOnly/fullWidth': 'column(titleRow, row(column(main, chat), strip), terminals)',
				'editorOnly/underChat': 'column(titleRow, row(column(main, chat), strip), terminals)',
				'editorOnly/underEditor': 'column(titleRow, row(column(main, chat), strip), terminals)',
			},
		});
	});

	test('the chat and the main part keep their widths as the terminals walk through every position, show and hide, after a mode round trip, a resize and a change of density', () => {
		const { mode, position, grid, open, terminalsPart } = setupWithTerminals();
		open();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 400, height: 500 });
		const widths: number[] = [];
		const read = () => widths.push(grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width);
		for (const terminalPosition of [ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.UnderChat]) {
			position.set(terminalPosition, undefined);
			read();
		}
		terminalsPart.setEmpty(true);
		read();
		terminalsPart.setEmpty(false);
		read();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		read();
		grid.layout(1100, 800);
		grid.layout(1000, 800);
		read();
		// Default density to compact and back: the outer insets go and come back.
		grid.setOuterInsets({ top: 0, left: 0, right: 0, bottom: 0 });
		read();
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		read();

		assert.deepStrictEqual(widths, [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400]);
	});

	test('QA\'s INFO-2 sequence: side by side, only the chat (its sizes saved meanwhile), a part moved, stacked, and side by side again: the split the user had, never the main part at its minimum', () => {
		const { mode, grid, open } = setupWithTerminals();
		open();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 400, height: 500 });
		const split = () => `${grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width}/${grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width}`;
		const sideBySide = split();
		// The side part empties: only the chat shows, and the window saves its state meanwhile.
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		grid.exportSizes();
		// Move Part Down, by the user.
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Down });
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ sideBySide, again: split() }, { sideBySide: '400/600', again: '400/600' });
	});

	test('a remembered width that leaves the main part less than its minimum gives way to the default share', () => {
		const sizes = { 'column(titleRow,row(chat,main))': { [ChatWindowGridCell.Chat]: { width: 1000, height: 770 } } };
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), sizes));
		grid.layout(1000, 800);

		assert.deepStrictEqual([grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width], [400, 600]);
	});

	test('QA\'s terminals round trip: the height the user gave the terminals stays the same through every mode and back', () => {
		// As in the window: the title row across the window shows while the chat view shows no title of its own, with gaps and outer insets.
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const titleRowVisible = derived(reader => mode.read(reader) === ChatWindowLayoutMode.Stacked || mode.read(reader) === ChatWindowLayoutMode.EditorOnly);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(33), visible: titleRowVisible }, strip: createChrome(34), terminals }, mode, constObservable(4), undefined, constObservable(ChatWindowTerminalPosition.FullWidth)));
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		grid.layout(1200, 800);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);
		const height = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		// An earlier visit of each mode, with the terminals at other heights: the user's last height is what counts.
		for (const [earlier, earlierHeight] of [[ChatWindowLayoutMode.Stacked, 286], [ChatWindowLayoutMode.EditorOnly, 265], [ChatWindowLayoutMode.SideBySide, 232]] as const) {
			mode.set(earlier, undefined);
			grid.partGrid!.resizeCell(ChatWindowGridCell.Terminals, { width: 1192, height: earlierHeight });
		}
		grid.partGrid!.resizeCell(ChatWindowGridCell.Terminals, { width: 1192, height: 199 });
		const heights: Record<string, number>[] = [];
		for (const candidate of [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.SideBySide]) {
			mode.set(candidate, undefined);
			heights.push({ [candidate]: height() });
		}

		assert.deepStrictEqual(heights, [
			{ [ChatWindowLayoutMode.Stacked]: 199 },
			{ [ChatWindowLayoutMode.SideBySide]: 199 },
			{ [ChatWindowLayoutMode.ChatOnly]: 199 },
			{ [ChatWindowLayoutMode.SideBySide]: 199 },
			{ [ChatWindowLayoutMode.EditorOnly]: 199 },
			{ [ChatWindowLayoutMode.SideBySide]: 199 },
		]);
	});

	test('closing the editor area, which shows only the chat, with the terminals under the editor keeps the terminals, across the window and as tall, and they go back under the editor as it shows again', () => {
		const { mode, position, grid, open, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Terminals, { width: 500, height: 200 });
		const read = () => ({
			topology: grid.partGrid!.describe(),
			visible: [ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Terminals].filter(cell => grid.partGrid!.isCellVisible(cell)),
			terminalsVisible: grid.terminalsVisible.get(),
		});

		// What Close Editor Area of an empty main part does.
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		const editorAreaClosed = { ...read(), height: height(), acrossTheWindow: grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).width === grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width };
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ editorAreaClosed, editorShownAgain: { ...read(), height: height() } }, {
			editorAreaClosed: { topology: 'column(titleRow, row(chat, main), terminals)', visible: [ChatWindowGridCell.Chat, ChatWindowGridCell.Terminals], terminalsVisible: true, height: 200, acrossTheWindow: true },
			editorShownAgain: { topology: 'column(titleRow, row(chat, column(main, terminals)))', visible: [ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Terminals], terminalsVisible: true, height: 200 },
		});
	});

	test('the terminal position moves the terminals\' part in the grid, which keeps its height, and the arrangement it moves to is the one a new grid shows', () => {
		const { position, grid, open, height } = setupWithTerminals();
		open();
		const partGrid = grid.partGrid;
		grid.partGrid!.resizeCell(ChatWindowGridCell.Terminals, { width: 1000, height: 200 });
		const moves = [ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.FullWidth].map(terminalPosition => {
			position.set(terminalPosition, undefined);
			// A new grid of a window whose terminals are at that position from the start.
			const fresh = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(createPart('terminals')) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, constObservable(terminalPosition)));
			fresh.layout(1000, 800);
			return { topology: grid.partGrid!.describe(), height: height(), asNew: fresh.partGrid!.describe() === grid.partGrid!.describe() };
		});

		assert.deepStrictEqual({ moved: grid.partGrid === partGrid, moves }, {
			moved: true,
			moves: [
				{ topology: 'column(titleRow, row(column(chat, terminals), main))', height: 200, asNew: true },
				{ topology: 'column(titleRow, row(chat, column(main, terminals)))', height: 200, asNew: true },
				{ topology: 'column(titleRow, row(chat, main), terminals)', height: 200, asNew: true },
			],
		});
	});

	test('the terminals show only with a terminal in them: hiding them with their last terminal moves no other part, does not rebuild the grid, and showing them gives them their height back', () => {
		const { grid, open, height, terminalsPart } = setupWithTerminals();
		const beforeFirst = grid.terminalsVisible.get();
		open();
		const partGrid = grid.partGrid;
		grid.partGrid!.resizeCell(ChatWindowGridCell.Terminals, { width: 1000, height: 225 });
		const chatWidth = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width;
		terminalsPart.setEmpty(true);
		const hidden = { visible: grid.terminalsVisible.get(), chatWidth: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, chatHeight: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height };
		terminalsPart.setEmpty(false);

		assert.deepStrictEqual({ beforeFirst, hidden, shownAgain: { visible: grid.terminalsVisible.get(), height: height() }, rebuilt: grid.partGrid !== partGrid }, {
			beforeFirst: false,
			hidden: { visible: false, chatWidth, chatHeight: 770 },
			shownAgain: { visible: true, height: 225 },
			rebuilt: false,
		});
	});

	test('the terminals keep their height as the window shrinks and grows again, in every mode and position; the chat and the main part take the change', () => {
		const { mode, position, grid, open, height } = setupWithTerminals();
		open();
		const result: Record<string, number[]> = {};
		for (const candidate of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.ChatOnly]) {
			mode.set(candidate, undefined);
			for (const terminalPosition of [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.UnderChat]) {
				position.set(terminalPosition, undefined);
				const heights = [height()];
				grid.layout(1000, 500);
				heights.push(height());
				grid.layout(1000, 800);
				heights.push(height());
				result[`${candidate}/${terminalPosition}`] = heights.map(value => value === heights[0] ? 0 : value);
			}
		}

		const expected: Record<string, number[]> = {};
		for (const key of Object.keys(result)) {
			expected[key] = [0, 0, 0];
		}
		assert.deepStrictEqual(result, expected);
	});

	test('tall terminals give way first when an arrangement shows that they did not show in yet, so that the chat and the main part keep their heights', () => {
		const { mode, position, grid, open, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderChat, undefined);
		open();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Terminals, { width: 400, height: 600 });
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const main = grid.partGrid!.getCellSize(ChatWindowGridCell.Main).height;
		const chat = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height;

		assert.deepStrictEqual({ mainAndChatKeepMost: main + chat >= 770 * 0.9, fills: main + chat + height() }, { mainAndChatKeepMost: true, fills: 770 });
	});

	test('an arrangement shown with the terminals hidden does not squeeze them when it shows again with them', () => {
		const { mode, grid, open, height } = setupWithTerminals(ChatWindowLayoutMode.EditorOnly);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		open();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Terminals, { width: 1000, height: 225 });
		mode.set(ChatWindowLayoutMode.EditorOnly, undefined);

		assert.deepStrictEqual(height(), 225);
	});
});
