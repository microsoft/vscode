/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { Direction, IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { autorun, constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IPartGridPartFactory, PartGridLocation } from '../../../../browser/parts/partGrid/partGrid.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatWindowGrid, ChatWindowGridCell, IChatWindowGridChrome } from '../../browser/chatWindowGrid.js';
import { GroupModelChangeKind } from '../../../../common/editor.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { ChatWindowLayoutMode, ChatWindowTerminalPosition } from '../../common/chatWindowLayout.js';
import { ChatWindowPartSizes } from '../../common/chatWindowState.js';

suite('Chat window grid', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPart(name: string): IContentPart {
		const group = new class extends mock<IEditorGroup>() {
			override readonly isEmpty = false;
			override readonly onDidModelChange = Event.None;
			override getEditors() { return []; }
			override focus(): void { }
		}();
		return new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [group];
			override readonly activeGroup = group;
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
	}

	/** A container in the window, where the sashes of the grid are where they show, for the user to drag. */
	function createAttachedContainer(): HTMLElement {
		const container = mainWindow.document.body.appendChild($('div'));
		container.style.cssText = 'position: fixed; top: 0; left: 0; width: 1200px; height: 800px;';
		disposables.add(toDisposable(() => container.remove()));
		return container;
	}

	/** Drags, as the user does with the mouse, the sash at the bottom (`edge: 'bottom'`) or right of `cell` so that it is `size` tall or wide. */
	function drag(container: HTMLElement, grid: ChatWindowGrid, cell: ChatWindowGridCell, edge: 'top' | 'right', size: number): void {
		const element = container.querySelector(`[data-part-grid-cell="${cell}"]`)!;
		const bounds = element.getBoundingClientRect();
		const current = edge === 'top' ? grid.partGrid!.getCellSize(cell).height : grid.partGrid!.getCellSize(cell).width;
		const sash = [...container.querySelectorAll<HTMLElement>(`.monaco-sash.${edge === 'top' ? 'horizontal' : 'vertical'}`)].find(candidate => {
			const sashBounds = candidate.getBoundingClientRect();
			return edge === 'top' ? Math.abs(sashBounds.top + sashBounds.height / 2 - bounds.top) < 8 : Math.abs(sashBounds.left + sashBounds.width / 2 - bounds.right) < 8;
		});
		assert.ok(sash, `a sash at the ${edge} of ${cell}`);
		const sashBounds = sash.getBoundingClientRect();
		const start = { clientX: sashBounds.left + sashBounds.width / 2, clientY: sashBounds.top + sashBounds.height / 2 };
		const end = edge === 'top' ? { ...start, clientY: start.clientY + current - size } : { ...start, clientX: start.clientX + size - current };
		// As the browser does, each pointer event before its mouse event
		sash.dispatchEvent(new PointerEvent('pointerdown', { ...start, bubbles: true, button: 0 }));
		sash.dispatchEvent(new MouseEvent('mousedown', { ...start, bubbles: true, button: 0 }));
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { ...end, bubbles: true }));
		mainWindow.dispatchEvent(new PointerEvent('pointerup', { ...end, bubbles: true }));
		mainWindow.dispatchEvent(new MouseEvent('mouseup', { ...end, bubbles: true }));
	}

	function createChrome(size: number): IChatWindowGridChrome {
		return { element: $('div'), visible: constObservable(true), size: constObservable(size), layout: () => { } };
	}

	/** The part the editors moved into a new part come from. */
	let sourcePart: IContentPart | undefined;
	const editorGroupsService = new class extends mock<IEditorGroupsService>() {
		override getScopedInstantiationService(): IInstantiationService {
			const contextKeyService = new MockContextKeyService();
			return upcastPartial<IInstantiationService>({ invokeFunction: (<R>(fn: (accessor: ServicesAccessor) => R) => fn(upcastPartial<ServicesAccessor>({ get: <T>() => contextKeyService as T }))) as IInstantiationService['invokeFunction'] });
		}
		override getGroup(): IEditorGroup {
			return new class extends mock<IEditorGroup>() {
				override moveEditors(): boolean { return true; }
			}();
		}
		override getPart(): IEditorPart {
			return sourcePart!;
		}
	}();

	function setup(partFactory?: IPartGridPartFactory) {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, mode, constObservable(0), undefined, undefined, partFactory, editorGroupsService));
		grid.layout(1000, 800);
		const visible = () => [ChatWindowGridCell.TitleRow, ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Strip].filter(cell => grid.partGrid!.isCellVisible(cell));
		const userResize = (cell: ChatWindowGridCell, edge: 'top' | 'right', size: number) => drag(container, grid, cell, edge, size);
		return { mode, grid, visible, userResize, container };
	}

	test('a part dragged onto the center of another part merges into it, the whole part highlighted, but onto the chat it goes beside it; at the sides, it goes beside', () => {
		const { container } = setup();
		const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${id}"]`)!;
		const pointer = (target: EventTarget, type: string, clientX: number, clientY: number) => target.dispatchEvent(new PointerEvent(type, { clientX, clientY, button: 0, pointerId: 1, bubbles: true, cancelable: true }));
		const drag = (id: ChatWindowGridCell, over: ChatWindowGridCell, fraction: number) => {
			const handle = cellOf(id).querySelector('.part-grid-drag-handle')!;
			const start = handle.getBoundingClientRect();
			pointer(handle, 'pointerdown', start.left + start.width / 2, start.top + start.height / 2);
			pointer(handle, 'pointermove', start.left + start.width / 2 + 10, start.top + start.height / 2 + 10);
			const target = cellOf(over).getBoundingClientRect();
			pointer(handle, 'pointermove', target.left + target.width * fraction, target.top + target.height / 2);
			const indicator = container.querySelector<HTMLElement>('.part-grid-drop-indicator.part');
			const shown = !indicator || indicator.style.display === 'none' ? 'none' : indicator.classList.contains('merge') ? 'merge' : 'beside';
			// Escape: the part goes nowhere
			mainWindow.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			return shown;
		};

		assert.deepStrictEqual({
			chatOnMainCenter: drag(ChatWindowGridCell.Chat, ChatWindowGridCell.Main, 0.5),
			chatOnMainSide: drag(ChatWindowGridCell.Chat, ChatWindowGridCell.Main, 0.9),
			mainOnChatCenter: drag(ChatWindowGridCell.Main, ChatWindowGridCell.Chat, 0.5)
		}, { chatOnMainCenter: 'merge', chatOnMainSide: 'beside', mainOnChatCenter: 'beside' });
	});

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
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow, strip: createChrome(34) }, mode, constObservable(0), undefined, undefined, undefined, editorGroupsService));
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

	test('a window that starts closing does not arrange its parts, such as the title row showing as editors move out of the chat\'s group, and arranges them again when it stays open', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const shown = observableValue('shown', false);
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(30), visible: shown }, strip: createChrome(34) }, mode, constObservable(0), undefined, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const visible = () => grid.partGrid!.isCellVisible(ChatWindowGridCell.TitleRow);

		grid.setClosing(true);
		shown.set(true, undefined);
		const whileClosing = visible();
		grid.setClosing(false);

		assert.deepStrictEqual({ whileClosing, stayedOpen: visible() }, { whileClosing: false, stayedOpen: true });
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
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, mode, constObservable(0), undefined, undefined, undefined, editorGroupsService));
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
		const { mode, grid, userResize } = setup();
		userResize(ChatWindowGridCell.Chat, 'right', 300);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		userResize(ChatWindowGridCell.Chat, 'top', 200);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const backSideBySide = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width;
		const sizes = grid.exportSizes();

		const restored = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.Stacked), constObservable(0), sizes, undefined, undefined, editorGroupsService));
		restored.layout(1000, 800);

		assert.deepStrictEqual({ backSideBySide, restoredStacked: restored.partGrid!.getCellSize(ChatWindowGridCell.Chat).height }, { backSideBySide: 300, restoredStacked: 200 });
	});

	test('sizes of an arrangement that something else changed, such as a part moved, are not remembered for the arrangement: the main part comes back at its remembered share, not at its minimum', () => {
		const { mode, grid, userResize } = setup();
		userResize(ChatWindowGridCell.Chat, 'right', 300);
		// Moved by the user, such as with Move Part Down: the chat across the window, below the main part.
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Down });
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ topology: grid.partGrid!.describe(), chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, exported: grid.exportSizes()['column(titleRow,row(chat,main))']?.[ChatWindowGridCell.Chat]?.width }, { topology: 'column(titleRow, row(chat, main))', chat: 300, exported: 300 });
	});

	test('reset forgets the sizes the user gave the cells and the parts moved, and arranges them as in a new window', () => {
		const { mode, grid, userResize } = setup();
		const fresh = { topology: grid.partGrid!.describe(), chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width };
		userResize(ChatWindowGridCell.Chat, 'right', 300);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		// Moved by the user, such as with Move Part Down.
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Down });
		const before = { topology: grid.partGrid!.describe(), sizes: Object.keys(grid.exportSizes()).length > 0 };

		grid.reset();

		assert.deepStrictEqual({ before, after: { topology: grid.partGrid!.describe(), chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width }, sizes: grid.exportSizes() }, {
			before: { topology: 'column(titleRow, main, chat)', sizes: true },
			after: fresh,
			sizes: {},
		});
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
			override readonly onDidMoveGroup = Event.None;
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
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals }, mode, constObservable(0), undefined, position, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const userResize = (cell: ChatWindowGridCell, edge: 'top' | 'right', size: number) => drag(container, grid, cell, edge, size);
		const open = () => {
			terminals.set(terminalsPart.part, undefined);
			terminalsPart.setEmpty(false);
		};
		const height = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		return { mode, position, terminals: terminals as IObservable<IContentPart | undefined>, terminalsPart, grid, open, height, userResize, container };
	}

	test('the terminals merged into the main part leave the grid, their editors in the main part, and do not come back while the terminals part stays empty', () => {
		const terminalEditor = new class extends mock<EditorInput>() {
			override readonly typeId = 'workbench.editors.terminal';
			override readonly resource = undefined;
			override getName() { return 'terminal'; }
		}();
		const moved: string[] = [];
		const mainGroup = new class extends mock<IEditorGroup>() {
			override readonly id = 10;
			override readonly isEmpty = false;
			override readonly onDidModelChange = Event.None;
			override getEditors() { return []; }
			override focus(): void { }
		}();
		const main = new class extends mock<IContentPart>() {
			override readonly element = $('.main');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [mainGroup];
			override get activeGroup() { return mainGroup; }
			override getGroups() { return this.groups; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const onDidModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		let terminalEditors: EditorInput[] = [terminalEditor];
		const terminalsGroup = new class extends mock<IEditorGroup>() {
			override get isEmpty() { return terminalEditors.length === 0; }
			override readonly onDidModelChange = onDidModelChange.event;
			override getEditors() { return terminalEditors; }
			override moveEditors(editors: { editor: EditorInput }[], target: IEditorGroup) {
				moved.push(`${editors.map(e => e.editor.getName()).join()} → ${target.id}`);
				terminalEditors = [];
				onDidModelChange.fire({ kind: GroupModelChangeKind.EDITOR_CLOSE } as IGroupModelChangeEvent);
				return true;
			}
		}();
		const terminalsPart = new class extends mock<IContentPart>() {
			override readonly element = $('.terminals');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [terminalsGroup];
			override get activeGroup() { return terminalsGroup; }
			override getGroups() { return this.groups; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main, chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart) }, observableValue('mode', ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const before = { visible: grid.terminalsVisible.get(), shape: grid.partGrid!.describe() };

		const merged = grid.partGrid!.mergeCell(ChatWindowGridCell.Terminals, ChatWindowGridCell.Main);
		grid.layout(1000, 800);

		assert.deepStrictEqual({ before, merged, moved, after: { visible: grid.terminalsVisible.get(), terminalsCellVisible: grid.partGrid!.isCellVisible(ChatWindowGridCell.Terminals) } }, {
			before: { visible: true, shape: before.shape },
			merged: true,
			moved: ['terminal → 10'],
			after: { visible: false, terminalsCellVisible: false },
		});
	});

	test('a part moved beside the terminals goes back to its place, with its size, once the layout mode changes, also to a mode that arranges the parts as the one before', () => {
		const { mode, grid, open } = setupWithTerminals();
		open();
		const sizeOf = (cell: ChatWindowGridCell) => grid.partGrid!.getCellSize(cell).height;
		const before = { shape: grid.partGrid!.describe(), main: sizeOf(ChatWindowGridCell.Main) };
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Terminals, direction: Direction.Up });
		const moved = grid.partGrid!.describe();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ moved, after: { shape: grid.partGrid!.describe(), main: sizeOf(ChatWindowGridCell.Main) } }, {
			moved: 'column(titleRow, chat, main, terminals)',
			after: before
		});
	});

	test('each layout mode arranges the parts from its own arrangement: a part moved beside the terminals, adopted as cells showed meanwhile, and the main part hidden in Chat Only come back to their places at their sizes', () => {
		const roundTrip = (position: ChatWindowTerminalPosition, move: boolean) => {
			const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
			const titleRowVisible = observableValue('titleRowVisible', true);
			const terminalsPart = createPartWithEditors('terminals');
			const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
			const titleRow = { ...createChrome(30), visible: titleRowVisible };
			const grid = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow, strip: createChrome(34), terminals }, mode, constObservable(0), undefined, constObservable(position), undefined, editorGroupsService));
			grid.layout(1000, 800);
			terminals.set(terminalsPart.part, undefined);
			terminalsPart.setEmpty(false);
			const state = () => {
				const { width, height } = grid.partGrid!.getCellSize(ChatWindowGridCell.Main);
				return { shape: grid.partGrid!.describe(), main: `${width}x${height}` };
			};
			const before = state();
			if (move) {
				// Dropped on the top edge of the terminals; the title row then shows again, as the chat no longer leads
				grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Terminals, direction: Direction.Up });
				titleRowVisible.set(false, undefined);
				titleRowVisible.set(true, undefined);
			}
			mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
			mode.set(ChatWindowLayoutMode.SideBySide, undefined);
			return { back: JSON.stringify(state()) === JSON.stringify(before) };
		};

		assert.deepStrictEqual({
			movedAboveFullWidthTerminals: roundTrip(ChatWindowTerminalPosition.FullWidth, true),
			terminalsUnderTheEditor: roundTrip(ChatWindowTerminalPosition.UnderEditor, false),
		}, {
			movedAboveFullWidthTerminals: { back: true },
			terminalsUnderTheEditor: { back: true },
		});
	});

	test('between layout modes that arrange the parts alike, with none moved, the parts only show or hide: the grid stays and the chat input keeps the focus', () => {
		const { mode, grid, container } = setupWithTerminals();
		const input = container.querySelector('.chat')!.appendChild($('input'));
		input.focus();
		const partGrid = grid.partGrid;
		const states: { mode: ChatWindowLayoutMode; sameGrid: boolean; focused: boolean }[] = [];
		for (const candidate of [ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly]) {
			mode.set(candidate, undefined);
			states.push({ mode: candidate, sameGrid: grid.partGrid === partGrid, focused: mainWindow.document.activeElement === input });
		}

		assert.deepStrictEqual(states, [
			{ mode: ChatWindowLayoutMode.ChatOnly, sameGrid: true, focused: true },
			{ mode: ChatWindowLayoutMode.SideBySide, sameGrid: true, focused: true },
			{ mode: ChatWindowLayoutMode.ChatOnly, sameGrid: true, focused: true },
		]);
	});

	test('a layout mode that arranges the parts again, as a part was moved or its arrangement differs, keeps the focus where it was in them', () => {
		const { mode, grid, open, container } = setupWithTerminals();
		open();
		const input = container.querySelector('.chat')!.appendChild($('input'));
		const partGrid = grid.partGrid;
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Terminals, direction: Direction.Up });
		// The user then types in the chat
		input.focus();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		const afterMove = { rebuilt: grid.partGrid !== partGrid, shape: grid.partGrid!.describe(), focused: mainWindow.document.activeElement === input };
		const chatOnlyGrid = grid.partGrid;
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const otherArrangement = { rebuilt: grid.partGrid !== chatOnlyGrid, focused: mainWindow.document.activeElement === input };

		assert.deepStrictEqual({ afterMove, otherArrangement }, {
			afterMove: { rebuilt: true, shape: 'column(titleRow, row(chat, main), terminals)', focused: true },
			otherArrangement: { rebuilt: true, focused: true },
		});
	});

	test('the grid is resizing from the press on a sash until it lets go, already as the sash takes the press: a chat that shows only its input, and grows only while its window resizes, is dragged taller, and back to its input once let go', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.Stacked);
		const container = createAttachedContainer();
		const onDidChangeChat = disposables.add(new Emitter<IViewSize | undefined>());
		const resizing = observableValue('resizing', false);
		const heights: number[] = [];
		const chat = new class extends mock<IContentPart>() {
			override readonly element = $('.chat');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 100;
			override get maximumHeight() { return resizing.get() ? Number.POSITIVE_INFINITY : 101; }
			override readonly onDidChange = onDidChangeChat.event;
			override readonly groups = [createPart('chatGroup').groups[0]];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout(_width: number, height: number) { heights.push(height); }
			override setVisible() { }
		}();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat }, mode, constObservable(0), undefined, undefined, undefined, editorGroupsService));
		// As the chat view does, the chat follows its window resizing
		disposables.add(autorun(reader => {
			resizing.set(grid.resizing.read(reader), undefined);
			onDidChangeChat.fire(undefined);
		}));
		grid.layout(1000, 800);
		const atRest = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height;
		heights.length = 0;
		drag(container, grid, ChatWindowGridCell.Chat, 'top', 300);

		assert.deepStrictEqual({ atRest, dragged: Math.max(...heights), resizing: grid.resizing.get(), letGo: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height }, {
			atRest: 101,
			dragged: 300,
			resizing: false,
			letGo: 101,
		});
	});

	test('the grid resizes from a press on a sash by any pointer, also after a press whose release went elsewhere, until it lets go or the grid goes', () => {
		const { grid, container } = setupWithTerminals(ChatWindowLayoutMode.Stacked);
		const sash = container.querySelector<HTMLElement>('.monaco-sash.horizontal')!;
		const press = (pointerType: string) => sash.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType }));
		press('mouse');
		const pressed = grid.resizing.get();
		// Released outside the window: no pointerup
		press('pen');
		const pressedAgain = grid.resizing.get();
		mainWindow.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		const released = grid.resizing.get();
		press('touch');
		mainWindow.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));

		assert.deepStrictEqual({ pressed, pressedAgain, released, cancelled: grid.resizing.get() }, { pressed: true, pressedAgain: true, released: false, cancelled: false });
	});

	test('the chat showing only its input does not move: no grabber, its top edge is the sash\'s, and neither a drag nor Move Part moves it; showing its conversation, it moves again; the other parts move all along', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.Stacked);
		const chatInputOnly = observableValue('chatInputOnly', true);
		const container = createAttachedContainer();
		// The grabber is as tall as this size token of the workbench
		container.style.setProperty('--vscode-spacing-size40', '8px');
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), chatInputOnly }, mode, constObservable(0), undefined, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const handleOf = (cell: ChatWindowGridCell) => container.querySelector<HTMLElement>(`[data-part-grid-cell="${cell}"] .part-grid-drag-handle`)!;
		const read = () => {
			const partGrid = grid.partGrid!;
			const chatTop = container.querySelector(`[data-part-grid-cell="${ChatWindowGridCell.Chat}"]`)!.getBoundingClientRect();
			const onTopEdge = mainWindow.document.elementFromPoint(chatTop.left + chatTop.width / 2, chatTop.top + 1);
			const drags = partGrid.startPartDrag(ChatWindowGridCell.Chat, new PointerEvent('pointerdown', { button: 0, clientX: chatTop.left + 10, clientY: chatTop.top + 4 }));
			mainWindow.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
			return {
				chatGrabber: mainWindow.getComputedStyle(handleOf(ChatWindowGridCell.Chat)).display !== 'none',
				mainGrabber: mainWindow.getComputedStyle(handleOf(ChatWindowGridCell.Main)).display !== 'none',
				topEdge: onTopEdge === handleOf(ChatWindowGridCell.Chat) ? 'grabber' : onTopEdge?.closest('.monaco-sash') ? 'sash' : 'other',
				drags,
				mainDrags: (() => { const started = partGrid.startPartDrag(ChatWindowGridCell.Main, new PointerEvent('pointerdown', { button: 0 })); mainWindow.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return started; })(),
				movePart: partGrid.isCellMovable(ChatWindowGridCell.Chat),
			};
		};

		const inputOnly = read();
		const movedByCommand = grid.partGrid!.moveCellInDirection(ChatWindowGridCell.Chat, Direction.Up);
		chatInputOnly.set(false, undefined);

		assert.deepStrictEqual({ inputOnly, movedByCommand, conversation: read() }, {
			inputOnly: { chatGrabber: false, mainGrabber: true, topEdge: 'sash', drags: false, mainDrags: true, movePart: false },
			movedByCommand: false,
			conversation: { chatGrabber: true, mainGrabber: true, topEdge: 'grabber', drags: true, mainDrags: true, movePart: true },
		});
	});

	test('a part does not merge into the terminals, whose groups stay locked to terminals, as it does not into the chat', () => {
		const { grid, open } = setupWithTerminals();
		open();

		assert.deepStrictEqual({ intoTerminals: grid.partGrid!.mergeCell(ChatWindowGridCell.Main, ChatWindowGridCell.Terminals), intoChat: grid.partGrid!.mergeCell(ChatWindowGridCell.Main, ChatWindowGridCell.Chat) }, { intoTerminals: false, intoChat: false });
	});

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

	test('the chat and the main part keep their widths as the terminals walk through every position, show and hide, after a mode round trip and a resize, and their share of the grid as the outer insets change', () => {
		const { mode, position, grid, open, terminalsPart, userResize } = setupWithTerminals();
		open();
		userResize(ChatWindowGridCell.Chat, 'right', 400);
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

		// With the outer insets, the grid is narrower than it started, and the chat keeps its share of it
		assert.deepStrictEqual(widths, [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 397]);
	});

	test('as the window is resized, such as to full screen, the chat and the main part keep their shares of it, the title row, the strip and the terminals keep their sizes, and the way back gives the sizes they had', () => {
		const { mode, grid, open, userResize } = setupWithTerminals();
		open();
		userResize(ChatWindowGridCell.Chat, 'right', 400);
		const size = (cell: ChatWindowGridCell) => grid.partGrid!.getCellSize(cell);
		const sideBySide = () => `${size(ChatWindowGridCell.Chat).width}/${size(ChatWindowGridCell.Main).width} title ${size(ChatWindowGridCell.TitleRow).height} terminals ${size(ChatWindowGridCell.Terminals).height}`;
		const stacked = () => `${size(ChatWindowGridCell.Main).height}/${size(ChatWindowGridCell.Chat).height} title ${size(ChatWindowGridCell.TitleRow).height} terminals ${size(ChatWindowGridCell.Terminals).height} strip ${size(ChatWindowGridCell.Strip).width}`;
		const resize = (read: () => string) => [1000, 1600, 800, 1000].map(width => {
			grid.layout(width, width * 0.8);
			return read();
		});

		const sideBySideSizes = resize(sideBySide);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const stackedSizes = resize(stacked);

		assert.deepStrictEqual({ sideBySideSizes, stackedSizes }, {
			sideBySideSizes: ['400/600 title 30 terminals 240', '640/960 title 30 terminals 240', '320/480 title 30 terminals 240', '400/600 title 30 terminals 240'],
			stackedSizes: ['292/238 title 30 terminals 240 strip 34', '556/454 title 30 terminals 240 strip 34', '204/166 title 30 terminals 240 strip 34', '292/238 title 30 terminals 240 strip 34']
		});
	});

	test('in Stacked, resizing the window by small uneven steps, out and back, as a window is dragged, gives the main part and the chat back their exact heights', () => {
		const { mode, grid, open, userResize } = setupWithTerminals();
		open();
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		userResize(ChatWindowGridCell.Chat, 'top', 177);
		const heights = () => [ChatWindowGridCell.Main, ChatWindowGridCell.Chat, ChatWindowGridCell.Terminals, ChatWindowGridCell.TitleRow].map(cell => grid.partGrid!.getCellSize(cell).height);
		const strip = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Strip).width;
		const before = heights();
		const chrome = new Set<string>();
		// As a window is dragged: by uneven steps, out and back
		const steps = [1, 3, 2, 7, 1, 5, 4, 1, 9, 2];
		let height = 800;
		for (let i = 0; i < 60; i++) {
			height += steps[i % steps.length];
			grid.layout(1000, height);
			chrome.add(`${heights()[3]}/${strip()}`);
		}
		for (let i = 0; i < 60; i++) {
			height -= steps[(i * 3) % steps.length];
			grid.layout(1000, height);
			chrome.add(`${heights()[3]}/${strip()}`);
		}
		grid.layout(1000, 800);

		// The title row and the strip keep their sizes at every step
		assert.deepStrictEqual({ heights: heights(), chrome: [...chrome] }, { heights: before, chrome: ['30/34'] });
	});

	test('in Stacked, with a part dropped at the bottom edge of the window, below the parts and the strip, the parts keep their shares of the window as it is resized, and the title row and the strip their sizes', () => {
		const { mode, grid } = setup({ createPart: () => ({ id: 'created', part: createPart('created') }) });
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Down }, { dropped: true });
		const size = (cell: string) => grid.partGrid!.getCellSize(cell);
		const sizes = () => `${size(ChatWindowGridCell.Main).height + size(ChatWindowGridCell.Chat).height}/${size('created').height} title ${size(ChatWindowGridCell.TitleRow).height} strip ${size(ChatWindowGridCell.Strip).width}`;
		const resized = [800, 1200, 700, 800].map(height => {
			grid.layout(1000, height);
			return sizes();
		});

		assert.deepStrictEqual({ shape: grid.partGrid!.describe(), resized }, {
			shape: 'column(titleRow, row(column(main, chat), strip), created)',
			resized: ['556/214 title 30 strip 34', '845/325 title 30 strip 34', '484/186 title 30 strip 34', '556/214 title 30 strip 34'],
		});
	});

	test('QA\'s INFO-2 sequence: side by side, only the chat (its sizes saved meanwhile), a part moved, stacked, and side by side again: the split the user had, never the main part at its minimum', () => {
		const { mode, grid, open, userResize } = setupWithTerminals();
		open();
		userResize(ChatWindowGridCell.Chat, 'right', 400);
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
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), sizes, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);

		assert.deepStrictEqual([grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width], [400, 600]);
	});

	test('QA\'s terminals round trip: the height the user gave the terminals stays the same through every mode and back', () => {
		// As in the window: the title row across the window shows while the chat view shows no title of its own, with gaps and outer insets.
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const titleRowVisible = derived(reader => mode.read(reader) === ChatWindowLayoutMode.Stacked || mode.read(reader) === ChatWindowLayoutMode.EditorOnly);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(33), visible: titleRowVisible }, strip: createChrome(34), terminals }, mode, constObservable(4), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
		const userResize = (cell: ChatWindowGridCell, edge: 'top' | 'right', size: number) => drag(container, grid, cell, edge, size);
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		grid.layout(1200, 800);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);
		const height = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		// An earlier visit of each mode, with the terminals at other heights: the user's last height is what counts.
		for (const [earlier, earlierHeight] of [[ChatWindowLayoutMode.Stacked, 286], [ChatWindowLayoutMode.EditorOnly, 265], [ChatWindowLayoutMode.SideBySide, 232]] as const) {
			mode.set(earlier, undefined);
			userResize(ChatWindowGridCell.Terminals, 'top', earlierHeight);
		}
		userResize(ChatWindowGridCell.Terminals, 'top', 199);
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

	test('QA\'s live terminals round trip (Beta): the chat only its input while stacked, sizes of an earlier session, the terminals joining empty; the height the user gave them comes back in every mode', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const titleRowVisible = derived(reader => mode.read(reader) === ChatWindowLayoutMode.Stacked || mode.read(reader) === ChatWindowLayoutMode.EditorOnly);
		// While stacked, the chat shows only its input: as tall as it, exactly.
		const onDidChangeChat = disposables.add(new Emitter<IViewSize | undefined>());
		const inputOnly = () => mode.get() === ChatWindowLayoutMode.Stacked;
		const chat = new class extends mock<IContentPart>() {
			override readonly element = $('.chat');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override get minimumHeight() { return inputOnly() ? 164 : 50; }
			override get maximumHeight() { return inputOnly() ? 164 : Number.POSITIVE_INFINITY; }
			override readonly onDidChange = onDidChangeChat.event;
			override readonly groups = [new class extends mock<IEditorGroup>() { override readonly isEmpty = false; override readonly onDidModelChange = Event.None; }()];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		disposables.add(autorun(reader => { mode.read(reader); onDidChangeChat.fire(undefined); }));
		const sizes: ChatWindowPartSizes = {
			'column(titleRow,row(column(main,chat,terminals),strip))': { [ChatWindowGridCell.Main]: { width: 1158, height: 379 }, [ChatWindowGridCell.Chat]: { width: 1158, height: 164 }, [ChatWindowGridCell.Terminals]: { width: 1158, height: 286 } },
			'column(titleRow,row(column(main,chat),strip),terminals)|chat hidden': { [ChatWindowGridCell.Main]: { width: 1158, height: 450 }, [ChatWindowGridCell.Terminals]: { width: 1192, height: 265 } },
		};
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat, titleRow: { ...createChrome(33), visible: titleRowVisible }, strip: createChrome(34), terminals }, mode, constObservable(4), sizes, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
		const userResize = (cell: ChatWindowGridCell, edge: 'top' | 'right', size: number) => drag(container, grid, cell, edge, size);
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		grid.layout(1200, 800);
		userResize(ChatWindowGridCell.Chat, 'right', 476);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);
		userResize(ChatWindowGridCell.Terminals, 'top', 199);
		const read = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		const heights: string[] = [];
		for (const candidate of [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.SideBySide]) {
			mode.set(candidate, undefined);
			heights.push(`${candidate} ${read()}`);
		}

		assert.deepStrictEqual({ heights, split: `${grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width}/${grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width}` }, {
			heights: ['stacked 199', 'sideBySide 199', 'chatOnly 199', 'sideBySide 199', 'editorOnly 199', 'sideBySide 199'],
			split: '476/716',
		});
	});

	test('QA\'s second INFO-2 walk, through every mode with the side part showing an editor and the window saving its state, keeps the split and the terminals, also in a new grid after a restart', () => {
		const create = (sizes: ChatWindowPartSizes | undefined) => {
			const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
			const titleRowVisible = derived(reader => mode.read(reader) === ChatWindowLayoutMode.Stacked || mode.read(reader) === ChatWindowLayoutMode.EditorOnly);
			const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
			const terminalsPart = createPartWithEditors('terminals');
			const container = createAttachedContainer();
			const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(33), visible: titleRowVisible }, strip: createChrome(34), terminals }, mode, constObservable(4), sizes, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
			const userResize = (cell: ChatWindowGridCell, edge: 'top' | 'right', size: number) => drag(container, grid, cell, edge, size);
			grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
			grid.layout(1200, 800);
			terminals.set(terminalsPart.part, undefined);
			terminalsPart.setEmpty(false);
			const read = () => `${grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width}/${grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width}, terminals ${grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height}`;
			return { mode, grid, read, userResize };
		};
		const { mode, grid, read, userResize } = create(undefined);
		userResize(ChatWindowGridCell.Chat, 'right', 476);
		userResize(ChatWindowGridCell.Terminals, 'top', 105);
		const walk: string[] = [read()];
		for (const candidate of [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.SideBySide]) {
			mode.set(candidate, undefined);
			// The window saves its state from time to time, in whatever mode.
			grid.exportSizes();
		}
		walk.push(read());
		const restarted = create(grid.exportSizes());

		assert.deepStrictEqual({ walk, restarted: restarted.read() }, { walk: ['476/716, terminals 105', '476/716, terminals 105'], restarted: '476/716, terminals 105' });
	});

	test('a density round trip, default to compact and back, gives the chat and the main part back their exact widths', () => {
		const gap = observableValue('gap', 4);
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(33), visible: constObservable(false) }, strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.SideBySide), gap, undefined, undefined, undefined, editorGroupsService));
		const userResize = (cell: ChatWindowGridCell, edge: 'top' | 'right', size: number) => drag(container, grid, cell, edge, size);
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		grid.layout(1200, 800);
		userResize(ChatWindowGridCell.Chat, 'right', 476);
		const split = () => `${grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width}/${grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width}`;
		const before = split();
		// Compact: flush, no outer insets; then default again.
		gap.set(0, undefined);
		grid.setOuterInsets({ top: 0, left: 0, right: 0, bottom: 0 });
		const compact = split();
		gap.set(4, undefined);
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });

		// Compact, the chat and the main part keep their shares of the room the insets leave
		assert.deepStrictEqual({ before, compact, after: split() }, { before: '476/716', compact: '479/721', after: '476/716' });
	});

	test('a change of density lays the grid out again once its styles apply, so that the cards read the frames of the new density', async () => {
		const gap = observableValue('gap', 4);
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat') }, constObservable(ChatWindowLayoutMode.SideBySide), gap, undefined, undefined, undefined, editorGroupsService));
		grid.layout(1200, 800);
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		const layout = sinon.spy(grid.partGrid!, 'layout');
		gap.set(0, undefined);
		const atOnce = layout.callCount;
		for (let frame = 0; frame < 2; frame++) {
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		}

		assert.deepStrictEqual({ atOnce, onceStylesApply: layout.args.slice(atOnce) }, { atOnce: 0, onceStylesApply: [[1200, 800]] });
	});

	test('QA\'s gap-sash walk: the height the user drags the terminals to across the window comes back in every mode, and the default is a share of the window', () => {
		const container = createAttachedContainer();
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const titleRowVisible = derived(reader => mode.read(reader) === ChatWindowLayoutMode.Stacked || mode.read(reader) === ChatWindowLayoutMode.EditorOnly);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(33), visible: titleRowVisible }, strip: createChrome(34), terminals }, mode, constObservable(4), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		grid.layout(1200, 800);
		drag(container, grid, ChatWindowGridCell.Chat, 'right', 476);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);
		const read = () => `${grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height}`;
		const shown = read();
		drag(container, grid, ChatWindowGridCell.Terminals, 'top', 199);
		const heights = [`dragged ${read()}`];
		for (const candidate of [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.SideBySide]) {
			mode.set(candidate, undefined);
			heights.push(`${candidate} ${read()}`);
		}

		assert.deepStrictEqual({ shown, heights, split: `${grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width}/${grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width}` }, {
			shown: '239',
			heights: ['dragged 199', 'stacked 199', 'sideBySide 199', 'chatOnly 199', 'sideBySide 199', 'editorOnly 199', 'sideBySide 199'],
			split: '476/716',
		});
	});

	test('terminals the user never sized keep their share of the window through every mode (QA: 239, then 215 after stacked)', () => {
		const container = createAttachedContainer();
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const titleRowVisible = derived(reader => mode.read(reader) === ChatWindowLayoutMode.Stacked || mode.read(reader) === ChatWindowLayoutMode.EditorOnly);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(33), visible: titleRowVisible }, strip: createChrome(34), terminals }, mode, constObservable(4), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		grid.layout(1200, 800);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);
		const heights = [`shown ${grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height}`];
		for (const candidate of [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.SideBySide]) {
			mode.set(candidate, undefined);
			grid.exportSizes();
			heights.push(`${candidate} ${grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height}`);
		}

		assert.deepStrictEqual(heights, ['shown 239', 'stacked 239', 'sideBySide 239', 'editorOnly 239', 'sideBySide 239']);
	});

	test('a width the chat is forced to, such as by an editor split into its part, is not remembered as the user\'s: once the editor leaves, side by side shows the user\'s split again', () => {
		const container = createAttachedContainer();
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const onDidChangeChat = disposables.add(new Emitter<IViewSize | undefined>());
		let chatMinimumWidth = 280;
		const chat = new class extends mock<IContentPart>() {
			override readonly element = $('.chat');
			override get minimumWidth() { return chatMinimumWidth; }
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = onDidChangeChat.event;
			override readonly groups = [new class extends mock<IEditorGroup>() { override readonly isEmpty = false; override readonly onDidModelChange = Event.None; }()];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat, titleRow: { ...createChrome(33), visible: derived(reader => mode.read(reader) === ChatWindowLayoutMode.Stacked) }, strip: createChrome(34) }, mode, constObservable(4), undefined, undefined, undefined, editorGroupsService));
		grid.setOuterInsets({ top: 0, left: 4, right: 4, bottom: 4 });
		grid.layout(1200, 800);
		drag(container, grid, ChatWindowGridCell.Chat, 'right', 476);
		const split = () => `${grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width}/${grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width}`;
		const roundTrip = () => {
			mode.set(ChatWindowLayoutMode.Stacked, undefined);
			grid.exportSizes();
			mode.set(ChatWindowLayoutMode.SideBySide, undefined);
			return split();
		};
		const user = split();
		// An editor split into the chat part: the part is as wide as its chat and the editor's group at least.
		chatMinimumWidth = 503;
		onDidChangeChat.fire(undefined);
		const forced = roundTrip();
		// The editor moved out of the chat part again.
		chatMinimumWidth = 280;
		onDidChangeChat.fire(undefined);

		assert.deepStrictEqual({ user, forced, again: roundTrip() }, { user: '476/716', forced: '505/687', again: '476/716' });
	});

	test('closing the editor area, which shows only the chat, with the terminals under the editor keeps the terminals, across the window and as tall, and they go back under the editor as it shows again', () => {
		const { mode, position, grid, open, height, userResize } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 200);
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
		const { position, grid, open, height, userResize } = setupWithTerminals();
		open();
		const partGrid = grid.partGrid;
		userResize(ChatWindowGridCell.Terminals, 'top', 200);
		const moves = [ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.FullWidth].map(terminalPosition => {
			position.set(terminalPosition, undefined);
			// A new grid of a window whose terminals are at that position from the start.
			const fresh = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(createPart('terminals')) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, constObservable(terminalPosition), undefined, editorGroupsService));
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
		const { grid, open, height, terminalsPart, userResize } = setupWithTerminals();
		const beforeFirst = grid.terminalsVisible.get();
		open();
		const partGrid = grid.partGrid;
		userResize(ChatWindowGridCell.Terminals, 'top', 225);
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

	test('the height the user gave the terminals is theirs in an arrangement they did not show in yet, as far as the chat and the main part can give it', () => {
		const { mode, position, grid, open, height, userResize } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderChat, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 600);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const main = grid.partGrid!.getCellSize(ChatWindowGridCell.Main).height;
		const chat = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height;

		assert.deepStrictEqual({ terminals: height(), fills: main + chat + height() }, { terminals: 600, fills: 770 });
	});

	test('an arrangement shown with the terminals hidden does not squeeze them when it shows again with them', () => {
		const { mode, open, height, userResize } = setupWithTerminals(ChatWindowLayoutMode.EditorOnly);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 225);
		mode.set(ChatWindowLayoutMode.EditorOnly, undefined);

		assert.deepStrictEqual(height(), 225);
	});

	test('the chat leads the window while it shows with no part before it: not after it moved after the main part or below it, nor while hidden', () => {
		const { mode, grid } = setup();
		const leads: Record<string, boolean> = { sideBySide: grid.chatLeads.get() };
		grid.partGrid!.moveCellInDirection(ChatWindowGridCell.Chat, Direction.Right);
		leads.movedRight = grid.chatLeads.get();
		grid.partGrid!.moveCellInDirection(ChatWindowGridCell.Chat, Direction.Left);
		leads.movedBack = grid.chatLeads.get();
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		leads.stacked = grid.chatLeads.get();
		mode.set(ChatWindowLayoutMode.EditorOnly, undefined);
		leads.editorOnly = grid.chatLeads.get();

		assert.deepStrictEqual(leads, { sideBySide: true, movedRight: false, movedBack: true, stacked: false, editorOnly: false });
	});

	test('the terminals keep the height the user gave them when an editor moves into a new part beside the main part; at an edge of the window, they make room for it in proportion, as every part in its column does; also once the arrangement shows again', () => {
		const results: Record<string, { added: number; rearranged: number }> = {};
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		const cases: [string, PartGridLocation][] = [
			['above', { reference: ChatWindowGridCell.Main, direction: Direction.Up }],
			['below', { reference: ChatWindowGridCell.Main, direction: Direction.Down }],
			['left', { reference: ChatWindowGridCell.Main, direction: Direction.Left }],
			['right', { reference: ChatWindowGridCell.Main, direction: Direction.Right }],
			['top edge', { edge: Direction.Up }],
			['bottom edge', { edge: Direction.Down }],
		];
		for (const [name, location] of cases) {
			const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const main = createPart('main');
			sourcePart = main;
			const created = new class extends mock<IContentPart>() {
				override readonly element = $('.created');
				override readonly minimumWidth = 100;
				override readonly maximumWidth = Number.POSITIVE_INFINITY;
				override readonly minimumHeight = 50;
				override readonly maximumHeight = Number.POSITIVE_INFINITY;
				override readonly onDidChange = Event.None;
				override readonly groups = [new class extends mock<IEditorGroup>() {
					override readonly isEmpty = false;
					override readonly onDidModelChange = Event.None;
					override focus(): void { }
				}()];
				override get activeGroup() { return this.groups[0]; }
				override readonly onDidAddGroup = Event.None;
				override readonly onDidRemoveGroup = Event.None;
				override readonly onDidMoveGroup = Event.None;
				override readonly onWillClose = Event.None;
				override layout() { }
			}();
			const partFactory: IPartGridPartFactory = { createPart: () => ({ id: 'created', part: created }) };
			const container = createAttachedContainer();
			const grid = disposables.add(new ChatWindowGrid(container, { main, chat: createPart('chat'), titleRow: createChrome(30), terminals: constObservable(terminalsPart.part) }, mode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), partFactory, editorGroupsService));
			grid.layout(1000, 800);
			drag(container, grid, ChatWindowGridCell.Terminals, 'top', 199);

			grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], location);
			const added = grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
			mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
			mode.set(ChatWindowLayoutMode.SideBySide, undefined);
			results[name] = { added, rearranged: grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height };
		}
		sourcePart = undefined;

		// At an edge, the new part takes an even third of the parts' column (257 of 770), the others making room in
		// proportion: the terminals 199 * 513 / 770
		const atEdge = { added: 133, rearranged: 133 };
		assert.deepStrictEqual(results, Object.fromEntries(cases.map(([name]) => [name, name.endsWith('edge') ? atEdge : { added: 199, rearranged: 199 }])));
	});

	test('an editor dropped at an edge of the window goes into a new part with an even share of the row, as its preview shows, the other parts keeping their least sizes, such as the chat split into groups', () => {
		const partWith = (name: string, minimumWidth: number) => new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = minimumWidth;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [new class extends mock<IEditorGroup>() {
				override readonly isEmpty = false;
				override readonly onDidModelChange = Event.None;
				override focus(): void { }
			}()];
			override get activeGroup() { return this.groups[0]; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const grid = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: partWith('main', 220), chat: partWith('chat', 500), titleRow: createChrome(30) }, mode, constObservable(0), undefined, undefined, { createPart: () => ({ id: 'created', part: partWith('created', 220) }) }, editorGroupsService));
		grid.layout(1200, 800);
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 504, height: 770 });
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		const widths = (rects: ReadonlyMap<string, { readonly width: number }> | undefined) => Object.fromEntries(['chat', 'main', 'new'].map(id => [id, Math.round(rects?.get(id)?.width ?? 0)]));

		const preview = widths(grid.partGrid!.previewNewPart('new', { edge: Direction.Right }, 'main', false, true));
		grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Right }, { dropped: true });
		const result = { chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, main: grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width, new: grid.partGrid!.getCellSize('created').width };

		// An even third of 1200 is 400: the chat keeps its least 500 rather than 336 in proportion, so main takes the rest
		assert.deepStrictEqual({ preview, result }, {
			preview: { chat: 500, main: 300, new: 400 },
			result: { chat: 500, main: 300, new: 400 }
		});
	});

	test('a part created for an editor dropped on an edge of the window stays when the layout mode changes, until it closes, and the sizes of the arrangement with it or without it are remembered', () => {
		const onWillClose = new Emitter<void>();
		const created = new class extends mock<IContentPart>() {
			override readonly element = $('.created');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [new class extends mock<IEditorGroup>() {
				override readonly isEmpty = false;
				override readonly onDidModelChange = Event.None;
				override focus(): void { }
			}()];
			override get activeGroup() { return this.groups[0]; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = onWillClose.event;
			override layout() { }
		}();
		const { mode, grid, userResize } = setup({ createPart: () => ({ id: 'created', part: created }) });

		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Right });
		const added = grid.partGrid!.describe();
		// The window still arranged it: the size the user gives the chat is remembered for the arrangement
		userResize(ChatWindowGridCell.Chat, 'right', 300);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const afterModeChange = grid.partGrid!.describe();
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const chatWidthBack = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width;
		onWillClose.fire();
		const afterClose = grid.partGrid!.describe();
		userResize(ChatWindowGridCell.Chat, 'right', 400);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const chatWidthAfterClose = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width;
		onWillClose.dispose();

		assert.deepStrictEqual({ added, afterModeChange, chatWidthBack, afterClose, chatWidthAfterClose }, {
			added: 'column(titleRow, row(chat, main, created))',
			afterModeChange: 'column(titleRow, row(column(main, chat), strip, created))',
			chatWidthBack: 300,
			afterClose: 'column(titleRow, row(chat, main))',
			chatWidthAfterClose: 400
		});
	});

	test('resetting the layout closes the parts the grid created, their editors moving into the main part first, and the arrangement is the mode\'s again', () => {
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
			override canMove() { return true as const; }
		}();
		const moved: string[] = [];
		const mainGroup = new class extends mock<IEditorGroup>() {
			override readonly id = 10;
			override readonly isEmpty = false;
			override readonly onDidModelChange = Event.None;
			override getEditors() { return []; }
			override contains() { return moved.length > 0; }
			override async openEditor() { return undefined; }
		}();
		const main = new class extends mock<IContentPart>() {
			override readonly element = $('.main');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [mainGroup];
			override get activeGroup() { return mainGroup; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const onWillClose = disposables.add(new Emitter<void>());
		const created = new class extends mock<IContentPart>() {
			override readonly element = $('.created');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [new class extends mock<IEditorGroup>() {
				override readonly id = 20;
				override readonly isEmpty = false;
				override readonly activeEditor = editor;
				override readonly onDidModelChange = Event.None;
				override focus(): void { }
				override getEditors() { return [editor]; }
				override moveEditors(editors: { editor: EditorInput }[], target: IEditorGroup) { moved.push(`${editors.map(e => e.editor.getName()).join()} → ${target.id}`); return true; }
			}()];
			override get activeGroup() { return this.groups[0]; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = onWillClose.event;
			override layout() { }
			override close() { moved.push('closed'); onWillClose.fire(); return true; }
		}();
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main, chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, observableValue('mode', ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, undefined, { createPart: () => ({ id: 'created', part: created }) }, editorGroupsService));
		grid.layout(1000, 800);

		grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Right });
		grid.partGrid!.moveCellInDirection('created', Direction.Left);
		const added = grid.partGrid!.describe();
		grid.reset();

		assert.deepStrictEqual({ added, moved, after: grid.partGrid!.describe() }, {
			added: 'column(titleRow, row(chat, created, main))',
			moved: ['file → 10', 'closed'],
			after: 'column(titleRow, row(chat, main))'
		});
	});

	test('a window with terminals closes without arranging its parts again: its main part and chat part close first, then, as it goes away, the part that holds its terminals', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const closing = (name: string) => {
			const onWillClose = disposables.add(new Emitter<void>());
			const part = new class extends mock<IContentPart>() {
				override readonly element = $(`.${name}`);
				override readonly minimumWidth = 100;
				override readonly maximumWidth = Number.POSITIVE_INFINITY;
				override readonly minimumHeight = 50;
				override readonly maximumHeight = Number.POSITIVE_INFINITY;
				override readonly onDidChange = Event.None;
				override readonly groups = createPart(name).groups;
				override readonly onDidAddGroup = Event.None;
				override readonly onDidRemoveGroup = Event.None;
				override readonly onDidMoveGroup = Event.None;
				override readonly onWillClose = onWillClose.event;
				override layout() { }
				override setVisible() { }
			}();
			return { part, close: () => onWillClose.fire() };
		};
		const main = closing('main');
		const chat = closing('chat');
		const grid = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: main.part, chat: chat.part, titleRow: createChrome(30), strip: createChrome(34), terminals }, mode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.UnderEditor), undefined, editorGroupsService));
		grid.layout(1000, 800);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);

		main.close();
		chat.close();
		// As the window goes away (its willUnload), which then closes the part that holds its terminals
		grid.willClose();
		terminals.set(undefined, undefined);

		assert.deepStrictEqual(grid.partGrid!.describe(), 'column(titleRow, terminals)');
	});

	test('a window whose parts close while it stays open, such as a part created for dropped editors, keeps arranging its parts', () => {
		const onWillClose = disposables.add(new Emitter<void>());
		const created = new class extends mock<IContentPart>() {
			override readonly element = $('.created');
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [new class extends mock<IEditorGroup>() {
				override readonly isEmpty = false;
				override readonly onDidModelChange = Event.None;
				override focus(): void { }
			}()];
			override get activeGroup() { return this.groups[0]; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = onWillClose.event;
			override layout() { }
		}();
		const { mode, grid } = setup({ createPart: () => ({ id: 'created', part: created }) });
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Right });
		onWillClose.fire();
		mode.set(ChatWindowLayoutMode.Stacked, undefined);

		assert.deepStrictEqual(grid.partGrid!.describe(), 'column(titleRow, row(column(main, chat), strip))');
	});
});
