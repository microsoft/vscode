/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { $ } from '../../../../../base/browser/dom.js';
import { Direction, IViewSize } from '../../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { autorun, constObservable, derived, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IPartGridPartFactory, PartGrid, PartGridLocation } from '../../../../browser/parts/partGrid/partGrid.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatWindowGrid, ChatWindowGridCell, IChatWindowGridChrome } from '../../browser/chatWindowGrid.js';
import { GroupModelChangeKind } from '../../../../common/editor.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition } from '../../common/chatWindowLayout.js';
import { ChatWindowPartSizes, IChatWindowArrangement } from '../../common/chatWindowState.js';

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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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

	test('the title row is across the top of the window in every mode; the strip has a column of its own at the right in every mode', () => {
		const { mode, grid, visible } = setup();
		const layouts: Record<string, { topology: string; visible: string[] }> = {};
		for (const candidate of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly]) {
			mode.set(candidate, undefined);
			layouts[candidate] = { topology: grid.partGrid!.describe(), visible: visible() };
		}

		assert.deepStrictEqual(layouts, {
			[ChatWindowLayoutMode.SideBySide]: { topology: 'column(titleRow, row(chat, main, strip))', visible: ['titleRow', 'chat', 'main', 'strip'] },
			[ChatWindowLayoutMode.ChatOnly]: { topology: 'column(titleRow, row(chat, main, strip))', visible: ['titleRow', 'chat', 'strip'] },
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
			hidden: { topology: 'column(titleRow,row(chat,main,strip))', visible: false, chatHeight: 800 },
			visible: { topology: 'column(titleRow,row(chat,main,strip))', visible: true, chatHeight: 770 },
			hiddenAgain: { topology: 'column(titleRow,row(chat,main,strip))', visible: false, chatHeight: 800, sameGrid: true, sameParent: true },
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
			sideBySide: { chat: 386, main: 580, titleRow: 30 },
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

		assert.deepStrictEqual({ sideBySide, stacked }, {
			sideBySide: { chat: 378, main: 568 },
			stacked: { chatAndMain: 946, strip: 34, chatHeight: 760 },
		});
	});

	test('the title row spans the window from edge to edge, as the main window\'s title bar does, with its window controls at the corner, while the cards below it keep the outer insets: in Default and Compact density', () => {
		const measure = (inset: number) => {
			const container = createAttachedContainer();
			const titleRow = createChrome(30);
			const controls = titleRow.element.appendChild($('.window-controls'));
			controls.style.cssText = 'position: absolute; top: 0; right: 0; width: 138px; height: 30px;';
			const laidOut: number[] = [];
			const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: { ...titleRow, layout: width => laidOut.push(width) }, strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(inset), undefined, undefined, undefined, editorGroupsService));
			grid.setOuterInsets({ top: 0, right: inset, bottom: inset, left: inset });
			grid.layout(1200, 800);
			const window = container.getBoundingClientRect();
			const title = titleRow.element.getBoundingClientRect();
			const chat = container.querySelector(`[data-part-grid-cell="${ChatWindowGridCell.Chat}"]`)!.getBoundingClientRect();
			return {
				title: { left: title.left - window.left, top: title.top - window.top, width: title.width, height: title.height },
				laidOutWidth: laidOut.at(-1),
				controlsRight: controls.getBoundingClientRect().right - window.left,
				chatLeft: chat.left - window.left,
				firstInWindow: container.firstElementChild === titleRow.element,
			};
		};

		assert.deepStrictEqual({ default: measure(4), compact: measure(0) }, {
			default: { title: { left: 0, top: 0, width: 1200, height: 30 }, laidOutWidth: 1200, controlsRight: 1200, chatLeft: 4, firstInWindow: true },
			compact: { title: { left: 0, top: 0, width: 1200, height: 30 }, laidOutWidth: 1200, controlsRight: 1200, chatLeft: 0, firstInWindow: true },
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

		assert.deepStrictEqual({ topology: grid.partGrid!.describe(), chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, exported: grid.exportSizes()['column(titleRow,row(chat,main,strip))']?.[ChatWindowGridCell.Chat]?.width }, { topology: 'column(titleRow, row(chat, main, strip))', chat: 300, exported: 300 });
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
			before: { topology: 'column(titleRow, row(column(main, chat), strip))', sizes: true },
			after: fresh,
			sizes: {},
		});
	});

	/** A part whose editors come and go: it is empty until an editor opens in it. */
	function createPartWithEditors(name: string, onWillClose: Event<void> = Event.None) {
		const onDidModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		let empty = true;
		const group = new class extends mock<IEditorGroup>() {
			override get isEmpty() { return empty; }
			override readonly onDidModelChange = onDidModelChange.event;
			override getEditors() { return []; }
			override focus(): void { }
		}();
		const part = new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [group];
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
			override get activeGroup() { return group; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = onWillClose;
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
		const setTerminalPosition = (value: ChatWindowTerminalPosition) => position.set(value, undefined);
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals, setTerminalPosition }, mode, constObservable(0), undefined, position, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const userResize = (cell: ChatWindowGridCell, edge: 'top' | 'right', size: number) => drag(container, grid, cell, edge, size);
		const open = () => {
			terminals.set(terminalsPart.part, undefined);
			terminalsPart.setEmpty(false);
		};
		const close = () => terminals.set(undefined, undefined);
		const height = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		return { mode, position, terminals: terminals as IObservable<IContentPart | undefined>, terminalsPart, grid, open, close, height, userResize, container };
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
			override findGroup() { return undefined; }
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
			override findGroup() { return undefined; }
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

	test('the main part moved to the left of the chat stays there as the editor hides and shows again', () => {
		const { mode, grid, visible } = setup();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		const swapped = grid.partGrid!.describe();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		const hidden = { shape: grid.partGrid!.describe(), visible: visible() };
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ swapped, hidden, shown: { shape: grid.partGrid!.describe(), visible: visible() } }, {
			swapped: 'column(titleRow, row(main, chat, strip))',
			hidden: { shape: 'column(titleRow, row(main, chat, strip))', visible: [ChatWindowGridCell.TitleRow, ChatWindowGridCell.Chat, ChatWindowGridCell.Strip] },
			shown: { shape: 'column(titleRow, row(main, chat, strip))', visible: [ChatWindowGridCell.TitleRow, ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Strip] },
		});
	});

	test('the parts the user moved stay where they are as the chat hides and shows again, in Editor Only, side by side or stacked; arranging them together the other way, or a reset, arranges them anew', () => {
		const { mode, grid, visible } = setup();
		const shape = () => grid.partGrid!.describe();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		mode.set(ChatWindowLayoutMode.EditorOnly, undefined);
		const chatHidden = { shape: shape(), visible: visible() };
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const chatShown = shape();
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const stacked = shape();
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { reference: ChatWindowGridCell.Main, direction: Direction.Up });
		mode.set(ChatWindowLayoutMode.EditorOnly, undefined);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const stackedChatShown = shape();
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const sideBySide = shape();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		grid.reset();

		assert.deepStrictEqual({ chatHidden, chatShown, stacked, stackedChatShown, sideBySide, reset: shape() }, {
			chatHidden: { shape: 'column(titleRow, row(main, chat, strip))', visible: [ChatWindowGridCell.TitleRow, ChatWindowGridCell.Main, ChatWindowGridCell.Strip] },
			chatShown: 'column(titleRow, row(main, chat, strip))',
			stacked: 'column(titleRow, row(column(main, chat), strip))',
			stackedChatShown: 'column(titleRow, row(column(chat, main), strip))',
			sideBySide: 'column(titleRow, row(chat, main, strip))',
			reset: 'column(titleRow, row(chat, main, strip))',
		});
	});

	test('the arrangement the user gave the parts, with its sizes, shows first in a new grid, such as after a reload, also exported while a part hides; the window\'s own arrangement exports none', () => {
		const { mode, grid } = setup();
		const untouched = grid.exportArrangement();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		const mainWidth = grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width;
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		const arrangement = grid.exportArrangement();
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), arrangement }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, undefined, undefined, editorGroupsService));
		restored.layout(1000, 800);

		assert.deepStrictEqual({ untouched, splitLayout: arrangement?.splitLayout, shape: restored.partGrid!.describe(), mainWidth: restored.partGrid!.getCellSize(ChatWindowGridCell.Main).width, exportedAgain: !!restored.exportArrangement() }, {
			untouched: undefined, splitLayout: ChatWindowLayoutMode.SideBySide, shape: 'column(titleRow, row(main, chat, strip))', mainWidth, exportedAgain: true,
		});
	});

	test('a window that closes, its parts leaving the grid, still exports the arrangement the user last gave them, also without an export before', () => {
		const exportOnClose = (arrange: (grid: ChatWindowGrid) => void) => {
			const { grid } = setup();
			arrange(grid);
			// As the window closes: it says so, then its parts leave the grid
			grid.setClosing(true);
			grid.partGrid!.removeCell(ChatWindowGridCell.Main);
			grid.partGrid!.removeCell(ChatWindowGridCell.Chat);
			return grid.exportArrangement() && JSON.stringify(collectIds(grid.exportArrangement()!.root));
		};
		const collectIds = (node: IChatWindowArrangement['root']): string[] => node.type === 'leaf' ? [node.data.id] : node.data.flatMap(collectIds);
		const swap = (grid: ChatWindowGrid) => grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });

		assert.deepStrictEqual({
			swapped: exportOnClose(swap),
			swappedBackAfterAnExport: exportOnClose(grid => {
				swap(grid);
				grid.exportArrangement();
				grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { reference: ChatWindowGridCell.Main, direction: Direction.Left });
			}),
		}, {
			swapped: JSON.stringify([ChatWindowGridCell.TitleRow, ChatWindowGridCell.Main, ChatWindowGridCell.Chat, ChatWindowGridCell.Strip]),
			swappedBackAfterAnExport: undefined,
		});
	});

	test('an arrangement a new grid cannot show falls back to the window\'s: of the other split layout, of other cells, such as with a strip the window no longer has, or of a cell it does not know', () => {
		const { grid } = setup();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		const arrangement = grid.exportArrangement()!;
		const shapeOf = (cells: { strip?: IChatWindowGridChrome; arrangement: IChatWindowArrangement }, mode = ChatWindowLayoutMode.SideBySide) => {
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), ...cells }, constObservable(mode), constObservable(0), undefined, undefined, undefined, editorGroupsService));
			restored.layout(1000, 800);
			return restored.partGrid!.describe();
		};
		const renamed = JSON.parse(JSON.stringify(arrangement).replace('"main"', '"other"'));

		assert.deepStrictEqual({
			stacked: shapeOf({ strip: createChrome(34), arrangement }, ChatWindowLayoutMode.Stacked),
			withoutStrip: shapeOf({ arrangement }),
			unknownCell: shapeOf({ strip: createChrome(34), arrangement: renamed }),
		}, {
			stacked: 'column(titleRow, row(column(main, chat), strip))',
			withoutStrip: 'column(titleRow, row(chat, main))',
			unknownCell: 'column(titleRow, row(chat, main, strip))',
		});
	});

	test('the arrangement the user gave the parts is without the terminals, which join it in a new grid where their position says', () => {
		const { grid, open } = setupWithTerminals();
		open();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		const arrangement = grid.exportArrangement();
		const terminalsPart = createPartWithEditors('terminals');
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals, arrangement }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.UnderEditor), undefined, editorGroupsService));
		restored.layout(1000, 800);
		const beforeTerminals = restored.partGrid!.describe();
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);

		assert.deepStrictEqual({ exported: JSON.stringify(arrangement).includes('terminals'), beforeTerminals, withTerminals: restored.partGrid!.describe() }, {
			exported: false,
			beforeTerminals: 'column(titleRow, row(main, chat, strip))',
			withTerminals: 'column(titleRow, row(column(main, terminals), chat, strip))',
		});
	});

	test('a part moved beside the terminals stays there, with its size, as the editor hides and shows again; arranging the parts stacked and side by side again puts it back in its place, with its size', () => {
		const { mode, grid, open } = setupWithTerminals();
		open();
		const state = () => ({ shape: grid.partGrid!.describe(), main: grid.partGrid!.getCellSize(ChatWindowGridCell.Main).height });
		const before = state();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Terminals, direction: Direction.Up });
		const moved = state();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const editorShownAgain = state();
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ moved: moved.shape, editorShownAgain, arrangedAgain: state() }, {
			moved: 'column(titleRow, row(column(chat, main, terminals), strip))',
			editorShownAgain: moved,
			arrangedAgain: before,
		});
	});

	test('the main part hidden in Chat Only shows again where it was, at its size: beside the chat with the terminals under it, or where the user moved it, also as cells showed meanwhile', () => {
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
			if (move) {
				// Dropped on the top edge of the terminals; the title row then shows again, as the chat no longer leads
				grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Terminals, direction: Direction.Up });
				titleRowVisible.set(false, undefined);
				titleRowVisible.set(true, undefined);
			}
			const before = state();
			mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
			mode.set(ChatWindowLayoutMode.SideBySide, undefined);
			return { back: JSON.stringify(state()) === JSON.stringify(before), shape: before.shape };
		};

		assert.deepStrictEqual({
			movedAboveFullWidthTerminals: roundTrip(ChatWindowTerminalPosition.FullWidth, true),
			terminalsUnderTheEditor: roundTrip(ChatWindowTerminalPosition.UnderEditor, false),
		}, {
			movedAboveFullWidthTerminals: { back: true, shape: 'column(titleRow, row(column(chat, main, terminals), strip))' },
			terminalsUnderTheEditor: { back: true, shape: 'column(titleRow, row(chat, column(main, terminals), strip))' },
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

	test('hiding the editor keeps a part the user moved, and the grid; arranging the parts the other way arranges them again and keeps the focus where it was in them', () => {
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
			afterMove: { rebuilt: false, shape: 'column(titleRow, row(column(chat, main, terminals), strip))', focused: true },
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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

	test('in Stacked, a part dropped at the left or right of the chat showing only its input goes to that edge of the window, as the chat\'s row would hold it to the height of the input; with its conversation, it goes beside the chat', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.Stacked);
		const chatInputOnly = observableValue('chatInputOnly', true);
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(createPart('terminals')), chatInputOnly }, mode, constObservable(0), undefined, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const pointer = (target: EventTarget, type: string, clientX: number, clientY: number) => target.dispatchEvent(new PointerEvent(type, { clientX, clientY, button: 0, pointerId: 1, bubbles: true, cancelable: true }));
		// Without motion, where the pointer is says where the card goes beside a part
		const drop = (fx: number) => {
			const handle = container.querySelector<HTMLElement>(`[data-part-grid-cell="${ChatWindowGridCell.Terminals}"] .part-grid-drag-handle`)!;
			const start = handle.getBoundingClientRect();
			const chat = container.querySelector(`[data-part-grid-cell="${ChatWindowGridCell.Chat}"] > .part-grid-card`)!.getBoundingClientRect();
			pointer(handle, 'pointerdown', start.left + start.width / 2, start.top + start.height / 2);
			pointer(handle, 'pointermove', start.left + start.width / 2 + 10, start.top + start.height / 2 + 10);
			pointer(handle, 'pointermove', chat.left + chat.width * fx, chat.top + chat.height / 2);
			pointer(handle, 'pointerup', chat.left + chat.width * fx, chat.top + chat.height / 2);
			const shape = grid.partGrid!.describe();
			grid.reset();
			return shape;
		};

		const inputOnly = { left: drop(0.1), right: drop(0.9) };
		chatInputOnly.set(false, undefined);
		const conversation = { left: drop(0.1), right: drop(0.9) };

		assert.deepStrictEqual({ inputOnly, conversation }, {
			inputOnly: { left: 'column(titleRow, row(terminals, column(main, chat), strip))', right: 'column(titleRow, row(column(main, chat), terminals, strip))' },
			conversation: { left: 'column(titleRow, row(column(main, row(terminals, chat)), strip))', right: 'column(titleRow, row(column(main, row(chat, terminals)), strip))' },
		});
	});

	test('a part does not merge into the terminals, whose groups stay locked to terminals, as it does not into the chat', () => {
		const { grid, open } = setupWithTerminals();
		open();

		assert.deepStrictEqual({ intoTerminals: grid.partGrid!.mergeCell(ChatWindowGridCell.Main, ChatWindowGridCell.Terminals), intoChat: grid.partGrid!.mergeCell(ChatWindowGridCell.Main, ChatWindowGridCell.Chat) }, { intoTerminals: false, intoChat: false });
	});

	test('the terminals join the grid below the chat, below the main part or across the chat and the main part, the strip running past them in every mode', () => {
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
			before: 'column(titleRow, row(chat, main, strip))',
			layouts: {
				'sideBySide/fullWidth': 'column(titleRow, row(column(row(chat, main), terminals), strip))',
				'sideBySide/underChat': 'column(titleRow, row(column(chat, terminals), main, strip))',
				'sideBySide/underEditor': 'column(titleRow, row(chat, column(main, terminals), strip))',
				'chatOnly/fullWidth': 'column(titleRow, row(column(row(chat, main), terminals), strip))',
				'chatOnly/underChat': 'column(titleRow, row(column(chat, terminals), main, strip))',
				'chatOnly/underEditor': 'column(titleRow, row(chat, column(main, terminals), strip))',
				'stacked/fullWidth': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'stacked/underChat': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'stacked/underEditor': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'editorOnly/fullWidth': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'editorOnly/underChat': 'column(titleRow, row(column(main, chat, terminals), strip))',
				'editorOnly/underEditor': 'column(titleRow, row(column(main, chat, terminals), strip))',
			},
		});
	});

	test('across the chat and the main part side by side, the terminals join, move and leave in place, the strip running past them as tall as the window: the grid stays, the chat input keeps the focus, and the chat and the main part their widths', () => {
		const { position, grid, open, close, container } = setupWithTerminals();
		const input = container.querySelector('.chat')!.appendChild($('input'));
		input.focus();
		const partGrid = grid.partGrid;
		const states: string[] = [];
		const read = (step: string) => {
			const size = (cell: ChatWindowGridCell) => grid.partGrid!.isCellVisible(cell) ? grid.partGrid!.getCellSize(cell) : undefined;
			states.push(`${step}: ${grid.partGrid!.describe()} chat ${size(ChatWindowGridCell.Chat)?.width} main ${size(ChatWindowGridCell.Main)?.width} strip ${size(ChatWindowGridCell.Strip)?.width}x${size(ChatWindowGridCell.Strip)?.height} terminals ${size(ChatWindowGridCell.Terminals)?.width} sameGrid ${grid.partGrid === partGrid} focused ${mainWindow.document.activeElement === input}`);
		};
		read('before');
		open();
		read('joined');
		position.set(ChatWindowTerminalPosition.UnderChat, undefined);
		position.set(ChatWindowTerminalPosition.FullWidth, undefined);
		read('moved back');
		close();
		read('left');

		assert.deepStrictEqual(states, [
			'before: column(titleRow, row(chat, main, strip)) chat 386 main 580 strip 34x770 terminals undefined sameGrid true focused true',
			'joined: column(titleRow, row(column(row(chat, main), terminals), strip)) chat 386 main 580 strip 34x770 terminals 966 sameGrid true focused true',
			'moved back: column(titleRow, row(column(row(chat, main), terminals), strip)) chat 386 main 580 strip 34x770 terminals 966 sameGrid true focused true',
			'left: column(titleRow, row(chat, main, strip)) chat 386 main 580 strip 34x770 terminals undefined sameGrid true focused true',
		]);
	});

	test('the strip\'s column takes the width its size says, as the layout density changes it, while it shows and while it does not, the cards beside it taking or giving the rest', () => {
		const size = observableValue('size', 48);
		const shown = observableValue('shown', true);
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: { ...createChrome(0), size, visible: shown } }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const widths = () => {
			const width = (cell: ChatWindowGridCell) => grid.partGrid!.getCellSize(cell).width;
			return `${width(ChatWindowGridCell.Chat) + width(ChatWindowGridCell.Main)} + ${shown.get() ? width(ChatWindowGridCell.Strip) : 'hidden'}`;
		};
		const states = [widths()];
		size.set(40, undefined);
		states.push(widths());
		shown.set(false, undefined);
		size.set(48, undefined);
		shown.set(true, undefined);
		states.push(widths());

		assert.deepStrictEqual(states, ['952 + 48', '960 + 40', '952 + 48']);
	});

	test('the strip takes no room in any mode while it does not show, such as while the Session Activity Bar is off', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const shown = observableValue('shown', false);
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: { ...createChrome(34), visible: shown } }, mode, constObservable(0), undefined, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		const states: Record<string, string> = {};
		for (const candidate of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly]) {
			mode.set(candidate, undefined);
			const hidden = grid.partGrid!.isCellVisible(ChatWindowGridCell.Strip);
			shown.set(true, undefined);
			states[candidate] = `${hidden} → ${grid.partGrid!.isCellVisible(ChatWindowGridCell.Strip)}`;
			shown.set(false, undefined);
		}

		assert.deepStrictEqual(states, {
			[ChatWindowLayoutMode.SideBySide]: 'false → true',
			[ChatWindowLayoutMode.ChatOnly]: 'false → true',
			[ChatWindowLayoutMode.Stacked]: 'false → true',
			[ChatWindowLayoutMode.EditorOnly]: 'false → true',
		});
	});

	test('side by side, the chat comes back at the width the user gave it before the strip had a column there, which stays for a version without it to read', () => {
		const legacyKey = 'column(titleRow,row(chat,main))';
		const sizes: ChatWindowPartSizes = { [legacyKey]: { [ChatWindowGridCell.Chat]: { width: 300, height: 770 } } };
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), sizes, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);

		assert.deepStrictEqual({ chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, main: grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width, legacy: grid.exportSizes()[legacyKey] }, {
			chat: 300,
			main: 666,
			legacy: sizes[legacyKey],
		});
	});

	test('a part moved or dropped at the top edge of the window goes above the parts, beside the strip, which keeps spanning the window below the title row, shown or hidden', () => {
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		const results: Record<string, string> = {};
		for (const title of ['shown', 'hidden'] as const) {
			const create = () => {
				const grid = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(30), visible: constObservable(title === 'shown') }, strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(4), undefined, undefined, { createPart: () => ({ id: 'created', part: createPart('created') }) }, editorGroupsService));
				grid.layout(1000, 800);
				return grid;
			};
			const moved = create();
			moved.partGrid!.moveCell(ChatWindowGridCell.Main, { edge: Direction.Up });
			results[`main moved to the top edge, title ${title}`] = moved.partGrid!.describe();
			const dropped = create();
			dropped.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Up }, { dropped: true });
			results[`editor dropped on the top edge, title ${title}`] = dropped.partGrid!.describe();
		}

		assert.deepStrictEqual(results, {
			'main moved to the top edge, title shown': 'column(titleRow, row(column(main, chat), strip))',
			'editor dropped on the top edge, title shown': 'column(titleRow, row(column(created, row(chat, main)), strip))',
			'main moved to the top edge, title hidden': 'column(titleRow, row(column(main, chat), strip))',
			'editor dropped on the top edge, title hidden': 'column(titleRow, row(column(created, row(chat, main)), strip))',
		});
	});

	test('a new grid side by side opens with the shares of its arrangement wherever the terminals are, also beside the strip, which keeps its size in the row with them', () => {
		const sizes: Record<string, string> = {};
		for (const position of [ChatWindowTerminalPosition.UnderEditor, ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.FullWidth]) {
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart.part) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, constObservable(position), undefined, editorGroupsService));
			grid.layout(1000, 800);
			const width = (cell: ChatWindowGridCell) => grid.partGrid!.getCellSize(cell).width;
			sizes[position] = `${width(ChatWindowGridCell.Chat)}/${width(ChatWindowGridCell.Main)} strip ${width(ChatWindowGridCell.Strip)}`;
		}

		assert.deepStrictEqual(sizes, {
			[ChatWindowTerminalPosition.UnderEditor]: '386/580 strip 34',
			[ChatWindowTerminalPosition.UnderChat]: '386/580 strip 34',
			[ChatWindowTerminalPosition.FullWidth]: '386/580 strip 34',
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
			sideBySideSizes: ['400/566 title 30 terminals 240', '648/918 title 30 terminals 240', '317/449 title 30 terminals 240', '400/566 title 30 terminals 240'],
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

	test('in Stacked, with a part dropped at the bottom edge of the window, below the parts, the strip running past it, the parts keep their shares of the window as it is resized, and the title row and the strip their sizes', () => {
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
			shape: 'column(titleRow, row(column(main, chat, created), strip))',
			resized: ['513/257 title 30 strip 34', '779/391 title 30 strip 34', '446/224 title 30 strip 34', '513/257 title 30 strip 34'],
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

		assert.deepStrictEqual({ sideBySide, again: split() }, { sideBySide: '400/566', again: '400/566' });
	});

	test('a remembered width that leaves the main part less than its minimum gives way to the default share', () => {
		const sizes = { 'column(titleRow,row(chat,main))': { [ChatWindowGridCell.Chat]: { width: 1000, height: 770 } } };
		const grid = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), sizes, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);

		assert.deepStrictEqual([grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width], [386, 580]);
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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
			split: '476/682',
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

		assert.deepStrictEqual({ walk, restarted: restarted.read() }, { walk: ['476/682, terminals 105', '476/682, terminals 105'], restarted: '476/682, terminals 105' });
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
		assert.deepStrictEqual({ before, compact, after: split() }, { before: '476/682', compact: '479/687', after: '476/682' });
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
			split: '476/682',
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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

		assert.deepStrictEqual({ user, forced, again: roundTrip() }, { user: '476/682', forced: '505/653', again: '476/682' });
	});

	test('closing the editor area, which shows only the chat, with the terminals under the editor keeps the terminals in their place, beside the chat, and they show as tall as they were under the editor as it shows again', () => {
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
			editorAreaClosed: { topology: 'column(titleRow, row(chat, column(main, terminals), strip))', visible: [ChatWindowGridCell.Chat, ChatWindowGridCell.Terminals], terminalsVisible: true, height: 770, acrossTheWindow: false },
			editorShownAgain: { topology: 'column(titleRow, row(chat, column(main, terminals), strip))', visible: [ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Terminals], terminalsVisible: true, height: 200 },
		});
	});

	test('the main part arranged side by side while hidden, as Stacked is switched off in Chat Only, shows again at its share beside the terminals under it, which are as tall as the user made them', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.Stacked);
		const splitLayout = observableValue<ChatWindowSplitLayout>('splitLayout', ChatWindowLayoutMode.Stacked);
		const terminalsPart = createPartWithEditors('terminals');
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals, splitLayout }, mode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.UnderEditor), undefined, editorGroupsService));
		grid.layout(1000, 800);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);
		drag(container, grid, ChatWindowGridCell.Terminals, 'top', 200);
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		// Toggle Arrangement while only the chat shows
		splitLayout.set(ChatWindowLayoutMode.SideBySide, undefined);
		const hidden = grid.partGrid!.describe();
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const size = (cell: ChatWindowGridCell) => grid.partGrid!.getCellSize(cell).height;

		assert.deepStrictEqual({ hidden, shown: { main: size(ChatWindowGridCell.Main), terminals: size(ChatWindowGridCell.Terminals) } }, {
			hidden: 'column(titleRow, row(chat, column(main, terminals), strip))',
			shown: { main: 570, terminals: 200 },
		});
	});

	test('the height the user gives the terminals while the main part is hidden is theirs as it shows again; the others share the rest as they did', () => {
		const { mode, grid, open, height, userResize } = setupWithTerminals(ChatWindowLayoutMode.Stacked);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 200);
		const size = (cell: ChatWindowGridCell) => grid.partGrid!.getCellSize(cell).height;
		const before = { main: size(ChatWindowGridCell.Main), chat: size(ChatWindowGridCell.Chat) };
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		userResize(ChatWindowGridCell.Terminals, 'top', 300);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const share = (before.main + before.chat - 100) / (before.main + before.chat);

		assert.deepStrictEqual({ terminals: height(), main: size(ChatWindowGridCell.Main), chat: size(ChatWindowGridCell.Chat) }, {
			terminals: 300, main: Math.round(before.main * share), chat: before.chat + before.main - 100 - Math.round(before.main * share),
		});
	});

	test('a part hidden in Stacked, with the parts moved and the terminals below them, shows again in a new grid at the share it had, after a reload', () => {
		const { mode, grid, open } = setupWithTerminals(ChatWindowLayoutMode.Stacked);
		open();
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { reference: ChatWindowGridCell.Main, direction: Direction.Up });
		const size = (target: ChatWindowGrid, cell: ChatWindowGridCell) => target.partGrid!.getCellSize(cell).height;
		const share = size(grid, ChatWindowGridCell.Main) / (size(grid, ChatWindowGridCell.Main) + size(grid, ChatWindowGridCell.Chat));
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		const arrangement = grid.exportArrangement();
		const terminalsPart = createPartWithEditors('terminals');
		terminalsPart.setEmpty(false);
		const restoredMode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.ChatOnly);
		const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart.part), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.Stacked), arrangement }, restoredMode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
		restored.layout(1000, 800);
		restoredMode.set(ChatWindowLayoutMode.Stacked, undefined);
		const restoredShare = size(restored, ChatWindowGridCell.Main) / (size(restored, ChatWindowGridCell.Main) + size(restored, ChatWindowGridCell.Chat));

		assert.deepStrictEqual({ shape: restored.partGrid!.describe(), share: Math.round(restoredShare * 100) }, { shape: 'column(titleRow, row(column(chat, main, terminals), strip))', share: Math.round(share * 100) });
	});

	test('the terminals keep the height they had as the main part hid when it shows again in a window resized meanwhile; the others share the rest', () => {
		const { mode, grid, open, height } = setupWithTerminals(ChatWindowLayoutMode.Stacked);
		open();
		const before = height();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		grid.layout(1000, 900);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);

		assert.deepStrictEqual({ before, after: height() }, { before, after: before });
	});

	test('the terminals squeezed as a part shows in a window too short for their height take it back as the window grows', () => {
		const { mode, grid, position, open, userResize, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 400);
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		grid.layout(1000, 450);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const squeezed = height();
		grid.layout(1000, 800);

		assert.deepStrictEqual({ squeezed: squeezed < 400, grown: height(), saved: grid.exportSizes().terminals?.[ChatWindowGridCell.Terminals]?.height }, { squeezed: true, grown: 400, saved: 400 });
	});

	test('the terminals at their default height, squeezed as a part shows in a window too short for it, take it back as the window grows', () => {
		const { mode, grid, position, open, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		const initial = height();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		grid.layout(1000, 300);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const squeezed = height();
		grid.layout(1000, 800);

		assert.deepStrictEqual({ squeezed: squeezed < initial, grown: height(), saved: grid.exportSizes().terminals?.[ChatWindowGridCell.Terminals]?.height }, { squeezed: true, grown: initial, saved: undefined });
	});

	test('the terminals at their default height, not squeezed, keep their height as the window grows', () => {
		const { grid, position, open, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		const initial = height();
		const heights = [1000, 1200, 800].map(windowHeight => {
			grid.layout(1000, windowHeight);
			return height();
		});

		assert.deepStrictEqual(heights, [initial, initial, initial]);
	});

	test('the terminals a user dragged shorter, or that were never given a height, keep their height as the window grows', () => {
		const { grid, position, open, userResize, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		const initial = height();
		grid.layout(1000, 1000);
		const untouched = height();
		userResize(ChatWindowGridCell.Terminals, 'top', 400);
		userResize(ChatWindowGridCell.Terminals, 'top', 250);
		grid.layout(1000, 1200);

		assert.deepStrictEqual({ untouched: untouched === initial, dragged: height() }, { untouched: true, dragged: 250 });
	});

	test('the terminals that take their height back as the window grows while a part is hidden keep it as that part shows', () => {
		const { mode, grid, position, open, userResize, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 400);
		grid.layout(1000, 450);
		const squeezed = height();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		grid.layout(1000, 800);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ squeezed: squeezed < 400, shown: height() }, { squeezed: true, shown: 400 });
	});

	test('the terminals in a row above a part, as a user arranged them, do not squeeze that part to take their height back', () => {
		const { grid, position, open, userResize } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 400);
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Down });
		grid.partGrid!.moveCell(ChatWindowGridCell.Terminals, { reference: ChatWindowGridCell.Chat, direction: Direction.Right });
		grid.layout(1000, 450);
		const main = grid.partGrid!.getCellSize(ChatWindowGridCell.Main).height;

		assert.deepStrictEqual({ mainAtItsMinimum: main <= 50 }, { mainAtItsMinimum: false });
	});

	test('the terminals that shrank as a part was dropped at an edge of the window, or in a layout that does not grow the window, keep their height', () => {
		const { grid, position, open, userResize, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 400);
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Down });
		const arranged = height();
		grid.layout(1000, 800);
		const same = height();
		grid.layout(1200, 800);

		assert.deepStrictEqual({ arranged: arranged < 400, same, widthOnly: height() }, { arranged: true, same: arranged, widthOnly: arranged });
	});

	test('the terminals at their default height, shrunk as a part was dropped at an edge of the window, take it back as the window grows', () => {
		const { grid, position, open, height } = setupWithTerminals();
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		const initial = height();
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Down });
		const arranged = height();
		grid.layout(1000, 1000);

		assert.deepStrictEqual({ arranged: arranged < initial, grown: height() }, { arranged: true, grown: initial });
	});

	test('a row among the parts above the terminals gives room to them as a unit, in proportion to the parts beside it', () => {
		const { grid, open, userResize, height } = setupWithTerminals();
		open();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { edge: Direction.Up });
		userResize(ChatWindowGridCell.Terminals, 'top', 300);
		const heights = () => [ChatWindowGridCell.Main, ChatWindowGridCell.Chat].map(cell => grid.partGrid!.getCellSize(cell).height);
		const before = heights();
		grid.layout(1000, 400);
		const squeezed = height() < 300;
		grid.layout(1000, 800);

		assert.deepStrictEqual({ squeezed, terminals: height(), parts: heights().map(size => Math.round(size / 10)) }, { squeezed: true, terminals: 300, parts: before.map(size => Math.round(size / 10)) });
	});

	test('with parts nested deeper than a row above them, the terminals take their height back as a plain resize does', () => {
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		const terminalsPart = createPartWithEditors('terminals');
		terminalsPart.setEmpty(false);
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart.part) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), { createPart: () => ({ id: 'created', part: createPart('created') }) }, editorGroupsService));
		grid.layout(1000, 800);
		grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Up }, { dropped: true });
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: 'created', direction: Direction.Left });
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { reference: 'created', direction: Direction.Down });
		const arrangement = grid.partGrid!.describe();
		drag(container, grid, ChatWindowGridCell.Terminals, 'top', 300);
		const height = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		grid.layout(1000, 400);
		const squeezed = height() < 300;
		grid.layout(1000, 800);

		assert.deepStrictEqual({ arrangement, squeezed, terminals: height() }, { arrangement: 'column(titleRow, row(column(row(main, column(created, chat)), terminals), strip))', squeezed: true, terminals: 300 });
	});

	test('in Stacked, the chat and the main part keep their shares as the terminals take their height back', () => {
		const { mode, grid, position, open, userResize } = setupWithTerminals(ChatWindowLayoutMode.ChatOnly);
		position.set(ChatWindowTerminalPosition.FullWidth, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 400);
		grid.layout(1000, 450);
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const heights = () => [ChatWindowGridCell.Main, ChatWindowGridCell.Chat, ChatWindowGridCell.Terminals].map(cell => grid.partGrid!.getCellSize(cell).height);
		const squeezed = heights();
		grid.layout(1000, 800);
		const grown = heights();

		assert.deepStrictEqual({ squeezedTerminals: squeezed[2] < 400, terminals: grown[2], ratio: Math.round(grown[0] / grown[1] * 10) }, { squeezedTerminals: true, terminals: 400, ratio: Math.round(squeezed[0] / squeezed[1] * 10) });
	});

	test('a part hidden while the terminals open shows again at its share, beside the terminals at their height: the chat in Stacked, and the main part with the terminals under it', () => {
		const roundTrip = (initial: ChatWindowLayoutMode, hiding: ChatWindowLayoutMode, position: ChatWindowTerminalPosition, cell: ChatWindowGridCell) => {
			const { mode, position: terminalPosition, grid, open, height } = setupWithTerminals(initial);
			terminalPosition.set(position, undefined);
			const size = (target: ChatWindowGridCell) => grid.partGrid!.getCellSize(target).height;
			mode.set(hiding, undefined);
			open();
			mode.set(initial, undefined);
			return { minimum: size(cell) <= 50, terminals: height() };
		};

		assert.deepStrictEqual({
			chatInStacked: roundTrip(ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly, ChatWindowTerminalPosition.FullWidth, ChatWindowGridCell.Chat),
			mainWithTerminalsUnderIt: roundTrip(ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowTerminalPosition.UnderEditor, ChatWindowGridCell.Main),
		}, {
			chatInStacked: { minimum: false, terminals: 240 },
			mainWithTerminalsUnderIt: { minimum: false, terminals: 240 },
		});
	});

	test('with the terminals joining an arrangement the user moved, moving the parts back as the window arranges them remembers the sizes the user gives them again', () => {
		const { grid, open, position, userResize } = setupWithTerminals();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Left });
		const shape = grid.partGrid!.describe();
		userResize(ChatWindowGridCell.Chat, 'right', 300);

		assert.deepStrictEqual({ shape, arrangement: grid.exportArrangement(), chat: grid.exportSizes()['column(titleRow,row(chat,column(main,terminals),strip))']?.[ChatWindowGridCell.Chat]?.width }, {
			shape: 'column(titleRow, row(chat, column(main, terminals), strip))', arrangement: undefined, chat: 300,
		});
	});

	test('a width the user gives the terminals\' column while the main part above them is hidden is the main part\'s after a reload, and the terminals keep the height the user gave them, not the one they fill meanwhile', () => {
		const { mode, grid, open, position, userResize } = setupWithTerminals();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		userResize(ChatWindowGridCell.Terminals, 'top', 200);
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		userResize(ChatWindowGridCell.Terminals, 'right', 300);
		const terminalsPart = createPartWithEditors('terminals');
		terminalsPart.setEmpty(false);
		const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart.part), arrangement: grid.exportArrangement() }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), grid.exportSizes(), constObservable(ChatWindowTerminalPosition.UnderEditor), undefined, editorGroupsService));
		restored.layout(1000, 800);
		const size = (cell: ChatWindowGridCell) => restored.partGrid!.getCellSize(cell);

		assert.deepStrictEqual({ hidden: grid.partGrid!.describe(), shape: restored.partGrid!.describe(), main: size(ChatWindowGridCell.Main).width, terminals: size(ChatWindowGridCell.Terminals).height }, {
			hidden: 'column(titleRow, row(column(main, terminals), chat, strip))', shape: 'column(titleRow, row(column(main, terminals), chat, strip))', main: 300, terminals: 200,
		});
	});

	test('while a part is hidden, a width the terminals take or a reset of a sash leaves the height the user gave them, rather than the one they fill there: the main part above them, or the chat', () => {
		const run = (hide: ChatWindowLayoutMode, position: ChatWindowTerminalPosition, action: 'width' | 'reset') => {
			const { mode, grid, open, position: terminalPosition, userResize, container } = setupWithTerminals();
			terminalPosition.set(position, undefined);
			open();
			userResize(ChatWindowGridCell.Terminals, 'top', 200);
			mode.set(hide, undefined);
			// The sash between the terminals' column and the chat: at the right of the chat, or of the terminals under it
			const leftOfSash = position === ChatWindowTerminalPosition.UnderEditor ? ChatWindowGridCell.Chat : ChatWindowGridCell.Terminals;
			if (action === 'width') {
				userResize(leftOfSash, 'right', 300);
			} else {
				const cell = container.querySelector(`[data-part-grid-cell="${leftOfSash}"]`)!.getBoundingClientRect();
				const sash = [...container.querySelectorAll<HTMLElement>('.monaco-sash.vertical')].find(candidate => Math.abs(candidate.getBoundingClientRect().left + candidate.getBoundingClientRect().width / 2 - cell.right) < 8)!;
				sash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			}
			return grid.exportSizes().terminals?.[ChatWindowGridCell.Terminals]?.height;
		};

		assert.deepStrictEqual({
			mainHiddenWidth: run(ChatWindowLayoutMode.ChatOnly, ChatWindowTerminalPosition.UnderEditor, 'width'),
			mainHiddenReset: run(ChatWindowLayoutMode.ChatOnly, ChatWindowTerminalPosition.UnderEditor, 'reset'),
			chatHiddenWidth: run(ChatWindowLayoutMode.EditorOnly, ChatWindowTerminalPosition.UnderChat, 'width'),
			chatHiddenReset: run(ChatWindowLayoutMode.EditorOnly, ChatWindowTerminalPosition.UnderChat, 'reset'),
		}, { mainHiddenWidth: 200, mainHiddenReset: 200, chatHiddenWidth: 200, chatHiddenReset: 200 });
	});

	test('sizes the user gives the parts as the window arranges them, while one of them hides, come back after a reload as both show: a width beside the terminals under the main part, and the terminals\' height stacked', () => {
		const reload = (grid: ChatWindowGrid, splitLayout: ChatWindowSplitLayout, position: ChatWindowTerminalPosition) => {
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart.part), splitLayout: constObservable(splitLayout), arrangement: grid.exportArrangement() }, constObservable(splitLayout), constObservable(0), grid.exportSizes(), constObservable(position), undefined, editorGroupsService));
			restored.layout(1000, 800);
			return restored;
		};
		const sizes = (grid: ChatWindowGrid) => Object.fromEntries([ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Terminals].map(cell => {
			const { width, height } = grid.partGrid!.getCellSize(cell);
			return [cell, `${width}x${height}`];
		}));

		const sideBySide = setupWithTerminals();
		sideBySide.position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		sideBySide.open();
		sideBySide.userResize(ChatWindowGridCell.Chat, 'right', 400);
		sideBySide.userResize(ChatWindowGridCell.Terminals, 'top', 200);
		sideBySide.mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		sideBySide.userResize(ChatWindowGridCell.Chat, 'right', 300);
		sideBySide.mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const sideBySideShown = sizes(sideBySide.grid);

		const stacked = setupWithTerminals(ChatWindowLayoutMode.Stacked);
		stacked.open();
		stacked.userResize(ChatWindowGridCell.Terminals, 'top', 200);
		stacked.userResize(ChatWindowGridCell.Chat, 'top', 200);
		stacked.mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		stacked.userResize(ChatWindowGridCell.Terminals, 'top', 300);
		stacked.mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const stackedShown = sizes(stacked.grid);

		assert.deepStrictEqual({
			sideBySide: { shown: sideBySideShown, reloaded: sizes(reload(sideBySide.grid, ChatWindowLayoutMode.SideBySide, ChatWindowTerminalPosition.UnderEditor)) },
			stacked: { shown: stackedShown, reloaded: sizes(reload(stacked.grid, ChatWindowLayoutMode.Stacked, ChatWindowTerminalPosition.FullWidth)) },
		}, {
			sideBySide: { shown: sideBySideShown, reloaded: sideBySideShown },
			stacked: { shown: stackedShown, reloaded: stackedShown },
		});
		assert.deepStrictEqual({ chat: sideBySideShown[ChatWindowGridCell.Chat], terminals: stackedShown[ChatWindowGridCell.Terminals] }, { chat: '300x770', terminals: '966x300' });
	});

	test('sizes an earlier version remembered for a mode that hides a part are not read: a window opening in Chat Only shows the main part again at the split the user gave both', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.ChatOnly);
		const sizes: ChatWindowPartSizes = {
			'column(titleRow,row(chat,main,strip))': { [ChatWindowGridCell.Chat]: { width: 300, height: 770 } },
			'column(titleRow,row(chat,main,strip))|main hidden': { [ChatWindowGridCell.Chat]: { width: 900, height: 770 } },
		};
		const grid = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), splitLayout: constObservable(ChatWindowLayoutMode.SideBySide) }, mode, constObservable(0), sizes, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, kept: grid.exportSizes()['column(titleRow,row(chat,main,strip))|main hidden'] }, {
			chat: 300, kept: { [ChatWindowGridCell.Chat]: { width: 900, height: 770 } },
		});
	});

	test('a window that opens with a part hidden shows it again at the split the user gave both: the main part stacked, and the chat side by side', () => {
		const run = (splitLayout: ChatWindowSplitLayout, hide: ChatWindowLayoutMode, edge: 'top' | 'right', size: number) => {
			const { mode, grid, userResize } = setupWithTerminals(splitLayout);
			userResize(ChatWindowGridCell.Chat, edge, size);
			mode.set(hide, undefined);
			const restoredMode = observableValue<ChatWindowLayoutMode>('mode', hide);
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), splitLayout: constObservable(splitLayout), arrangement: grid.exportArrangement() }, restoredMode, constObservable(0), grid.exportSizes(), undefined, undefined, editorGroupsService));
			restored.layout(1000, 800);
			restoredMode.set(splitLayout, undefined);
			return restored.partGrid!.getCellSize(ChatWindowGridCell.Chat)[edge === 'top' ? 'height' : 'width'];
		};

		assert.deepStrictEqual({
			stacked: run(ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.ChatOnly, 'top', 200),
			sideBySide: run(ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.EditorOnly, 'right', 300),
		}, { stacked: 200, sideBySide: 300 });
	});

	test('a reset of the sash above the terminals while a part is hidden gives them the height they take then, as the part shows again, and remembers it for every arrangement: across the window side by side, and stacked', () => {
		const run = (splitLayout: ChatWindowSplitLayout) => {
			const { mode, grid, open, height, userResize, container } = setupWithTerminals(splitLayout);
			open();
			userResize(ChatWindowGridCell.Terminals, 'top', 200);
			mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
			const cell = container.querySelector(`[data-part-grid-cell="${ChatWindowGridCell.Terminals}"]`)!.getBoundingClientRect();
			const sash = [...container.querySelectorAll<HTMLElement>('.monaco-sash.horizontal')].find(candidate => Math.abs(candidate.getBoundingClientRect().top + candidate.getBoundingClientRect().height / 2 - cell.top) < 8)!;
			sash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			const reset = height();
			mode.set(splitLayout, undefined);
			return { reset: reset !== 200, shown: height() === reset, remembered: grid.exportSizes().terminals?.[ChatWindowGridCell.Terminals]?.height === reset };
		};

		assert.deepStrictEqual({ sideBySide: run(ChatWindowLayoutMode.SideBySide), stacked: run(ChatWindowLayoutMode.Stacked) }, {
			sideBySide: { reset: true, shown: true, remembered: true },
			stacked: { reset: true, shown: true, remembered: true },
		});
	});

	test('without a title row, a width the user gives the chat while the main part is hidden, after the terminals joined under it, comes back after a reload', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), strip: createChrome(34), terminals, splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.SideBySide) }, mode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.UnderEditor), undefined, editorGroupsService));
		grid.layout(1000, 800);
		drag(container, grid, ChatWindowGridCell.Chat, 'right', 300);
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		terminals.set(terminalsPart.part, undefined);
		terminalsPart.setEmpty(false);
		drag(container, grid, ChatWindowGridCell.Chat, 'right', 400);
		const restoredTerminals = createPartWithEditors('terminals');
		restoredTerminals.setEmpty(false);
		const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), strip: createChrome(34), terminals: constObservable(restoredTerminals.part), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.SideBySide), arrangement: grid.exportArrangement() }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), grid.exportSizes(), constObservable(ChatWindowTerminalPosition.UnderEditor), undefined, editorGroupsService));
		restored.layout(1000, 800);

		assert.deepStrictEqual({ shape: restored.partGrid!.describe(), chat: restored.partGrid!.getCellSize(ChatWindowGridCell.Chat).width }, { shape: 'row(chat, column(main, terminals), strip)', chat: 400 });
	});

	test('a window that opens with a part hidden and the strip hidden by its setting shows the part again at the split the user gave both', () => {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.ChatOnly);
		const sizes: ChatWindowPartSizes = { 'column(titleRow,row(chat,main,strip))': { [ChatWindowGridCell.Chat]: { width: 300, height: 770 } } };
		const grid = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: { ...createChrome(34), visible: constObservable(false) }, splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.SideBySide) }, mode, constObservable(0), sizes, undefined, undefined, editorGroupsService));
		grid.layout(1000, 800);
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual(grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, 300);
	});

	test('switching right from Chat Only to Editor Only, or back, shows the hidden part again at its share beside the terminals under it, as tall as the user made them, also as both show then', () => {
		const run = (position: ChatWindowTerminalPosition, first: ChatWindowLayoutMode, second: ChatWindowLayoutMode, cell: ChatWindowGridCell) => {
			const { mode, grid, open, position: terminalPosition, height, userResize } = setupWithTerminals();
			terminalPosition.set(position, undefined);
			open();
			userResize(ChatWindowGridCell.Terminals, 'top', 200);
			const before = grid.partGrid!.getCellSize(cell).height;
			mode.set(first, undefined);
			mode.set(second, undefined);
			const switched = { part: grid.partGrid!.getCellSize(cell).height, terminals: height() };
			mode.set(ChatWindowLayoutMode.SideBySide, undefined);
			return { before, switched, bothShow: { part: grid.partGrid!.getCellSize(cell).height, terminals: height() } };
		};
		const underEditor = run(ChatWindowTerminalPosition.UnderEditor, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.EditorOnly, ChatWindowGridCell.Main);
		const underChat = run(ChatWindowTerminalPosition.UnderChat, ChatWindowLayoutMode.EditorOnly, ChatWindowLayoutMode.ChatOnly, ChatWindowGridCell.Chat);

		assert.deepStrictEqual({ underEditor, underChat }, {
			underEditor: { before: 570, switched: { part: 570, terminals: 200 }, bothShow: { part: 570, terminals: 200 } },
			underChat: { before: 570, switched: { part: 570, terminals: 200 }, bothShow: { part: 570, terminals: 200 } },
		});
	});

	test('the terminals keep the height the user gave them as a part hidden with the title row shows again: in a window opening so, and as the title row hides with the part', () => {
		const run = (opening: boolean) => {
			const mode = observableValue<ChatWindowLayoutMode>('mode', opening ? ChatWindowLayoutMode.ChatOnly : ChatWindowLayoutMode.Stacked);
			const titleRowVisible = observableValue('titleRowVisible', !opening);
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const sizes: ChatWindowPartSizes = { terminals: { [ChatWindowGridCell.Terminals]: { width: 966, height: 200 } } };
			const grid = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: { ...createChrome(30), visible: titleRowVisible }, strip: createChrome(34), terminals: constObservable(terminalsPart.part), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.Stacked) }, mode, constObservable(0), sizes, undefined, undefined, editorGroupsService));
			grid.layout(1000, 800);
			if (!opening) {
				transaction(tx => {
					titleRowVisible.set(false, tx);
					mode.set(ChatWindowLayoutMode.ChatOnly, tx);
				});
			}
			mode.set(ChatWindowLayoutMode.Stacked, undefined);
			return grid.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height;
		};

		assert.deepStrictEqual({ opening: run(true), hidingWithThePart: run(false) }, { opening: 200, hidingWithThePart: 200 });
	});

	test('a width the user gives the parts while one is hidden in a window too short for the terminals\' height comes back after a reload, and so does that height: the main part above them, or the chat', () => {
		const run = (position: ChatWindowTerminalPosition, hide: ChatWindowLayoutMode, sized: ChatWindowGridCell) => {
			const { mode, grid, open, position: terminalPosition, userResize, container } = setupWithTerminals();
			terminalPosition.set(position, undefined);
			open();
			userResize(sized, 'right', 300);
			userResize(ChatWindowGridCell.Terminals, 'top', 600);
			mode.set(hide, undefined);
			grid.layout(1000, 500);
			drag(container, grid, sized, 'right', 400);
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart.part), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.SideBySide), arrangement: grid.exportArrangement() }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), grid.exportSizes(), constObservable(position), undefined, editorGroupsService));
			restored.layout(1000, 800);
			return { width: restored.partGrid!.getCellSize(sized).width, terminals: restored.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height };
		};

		assert.deepStrictEqual({
			mainHidden: run(ChatWindowTerminalPosition.UnderEditor, ChatWindowLayoutMode.ChatOnly, ChatWindowGridCell.Chat),
			chatHidden: run(ChatWindowTerminalPosition.UnderChat, ChatWindowLayoutMode.EditorOnly, ChatWindowGridCell.Terminals),
		}, { mainHidden: { width: 400, terminals: 600 }, chatHidden: { width: 400, terminals: 600 } });
	});

	test('as the window is too short for the terminals beside a hidden part, or leaves less room than the parts need beside them, a width the user gives the parts leaves their heights as the user gave them, whichever part hides, and the title row keeps its height in the arrangement saved', () => {
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		const stackedWithCreatedPart = (height: number, hide: ChatWindowLayoutMode) => {
			const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.Stacked);
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const createdPart = createPartWithEditors('created');
			createdPart.setEmpty(false);
			const main = createPart('main');
			sourcePart = main;
			const container = createAttachedContainer();
			const grid = disposables.add(new ChatWindowGrid(container, { main, chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(terminalsPart.part), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.Stacked) }, mode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), { createPart: () => ({ id: 'created', part: createdPart.part }) }, editorGroupsService));
			grid.layout(1000, 800);
			grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Right });
			drag(container, grid, ChatWindowGridCell.Terminals, 'top', 500);
			drag(container, grid, ChatWindowGridCell.Chat, 'top', 130);
			mode.set(hide, undefined);
			grid.layout(1000, height);
			const shown = hide === ChatWindowLayoutMode.ChatOnly ? ChatWindowGridCell.Chat : ChatWindowGridCell.Main;
			const width = grid.partGrid!.getCellSize(shown).width - 40;
			drag(container, grid, shown, 'right', width);
			sourcePart = undefined;
			const restoredTerminals = createPartWithEditors('terminals');
			restoredTerminals.setEmpty(false);
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(restoredTerminals.part), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.Stacked), arrangement: grid.exportArrangement() }, constObservable(ChatWindowLayoutMode.Stacked), constObservable(0), grid.exportSizes(), constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
			restored.layout(1000, 800);
			const size = (cell: ChatWindowGridCell) => restored.partGrid!.getCellSize(cell).height;
			return { chat: size(ChatWindowGridCell.Chat), terminals: size(ChatWindowGridCell.Terminals), widthRemembered: grid.exportSizes()['column(titleRow,row(column(main,chat,terminals),strip))']?.[shown]?.width === width };
		};
		const reorderedWithoutStrip = () => {
			const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.Stacked);
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const container = createAttachedContainer();
			const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), terminals: constObservable(terminalsPart.part), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.Stacked) }, mode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
			grid.layout(1000, 800);
			grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { reference: ChatWindowGridCell.Main, direction: Direction.Up });
			drag(container, grid, ChatWindowGridCell.Terminals, 'top', 500);
			const share = (target: ChatWindowGrid) => {
				const [main, chat] = [target.partGrid!.getCellSize(ChatWindowGridCell.Main).height, target.partGrid!.getCellSize(ChatWindowGridCell.Chat).height];
				return Math.round(main * 100 / (main + chat));
			};
			const before = share(grid);
			mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
			grid.layout(1000, 300);
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), splitLayout: constObservable<ChatWindowSplitLayout>(ChatWindowLayoutMode.Stacked), arrangement: grid.exportArrangement() }, constObservable(ChatWindowLayoutMode.Stacked), constObservable(0), undefined, undefined, undefined, editorGroupsService));
			restored.layout(1000, 800);
			return { shape: restored.partGrid!.describe(), withinAPoint: Math.abs(share(restored) - before) <= 1 };
		};

		const { ChatOnly, EditorOnly } = { ChatOnly: ChatWindowLayoutMode.ChatOnly, EditorOnly: ChatWindowLayoutMode.EditorOnly } as const;
		assert.deepStrictEqual({
			stackedWithCreatedPart: stackedWithCreatedPart(500, ChatOnly),
			stackedWithCreatedPartChatHidden: stackedWithCreatedPart(500, EditorOnly),
			// Room for the parts beside the terminals, 70, less than both need
			stackedWithCreatedPartNearFit: stackedWithCreatedPart(600, ChatOnly),
			stackedWithCreatedPartNearFitChatHidden: stackedWithCreatedPart(600, EditorOnly),
			reorderedWithoutStrip: reorderedWithoutStrip(),
		}, {
			stackedWithCreatedPart: { chat: 130, terminals: 500, widthRemembered: true },
			stackedWithCreatedPartChatHidden: { chat: 130, terminals: 500, widthRemembered: true },
			stackedWithCreatedPartNearFit: { chat: 130, terminals: 500, widthRemembered: true },
			stackedWithCreatedPartNearFitChatHidden: { chat: 130, terminals: 500, widthRemembered: true },
			reorderedWithoutStrip: { shape: 'column(titleRow, chat, main)', withinAPoint: true },
		});
	});

	test('in a window shorter and narrower than the sizes kept beside a hidden part, a width, a height or a reset keeps the saved sizes of the other dimension where the terminals do not fit in it, else saves those the parts show in it as both show, as without a hidden part; the chrome keeps its size, and the split shows after a reload as it does as both show again', () => {
		// The room beside the terminals, 500 high: none, or some, but less than the chat and the main part both need (50 each)
		type Row = { split: ChatWindowSplitLayout; position: ChatWindowTerminalPosition; hide: ChatWindowLayoutMode; move?: 'swap' | 'reorder'; chrome: boolean; gesture: 'width' | 'height' | 'reset'; room: 'none' | 'nearFit' };
		const run = ({ split, position, hide, move, chrome, gesture, room }: Row) => {
			const height = room === 'none' ? 400 : (chrome ? 30 : 0) + 500 + 70;
			const mode = observableValue<ChatWindowLayoutMode>('mode', split);
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const terminalsCell = observableValue<IContentPart | undefined>('terminals', undefined);
			const cells = (arrangement?: IChatWindowArrangement) => ({ main: createPart('main'), chat: createPart('chat'), ...(chrome ? { titleRow: createChrome(30), strip: createChrome(34) } : {}), terminals: terminalsCell, splitLayout: constObservable(split), arrangement });
			const container = createAttachedContainer();
			const grid = disposables.add(new ChatWindowGrid(container, cells(), mode, constObservable(0), undefined, constObservable(position), undefined, editorGroupsService));
			grid.layout(1000, 800);
			if (move === 'swap') {
				grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
			} else if (move === 'reorder') {
				grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { reference: ChatWindowGridCell.Main, direction: Direction.Up });
			}
			// The terminals join where their position says, beside the parts as the user moved them
			terminalsCell.set(terminalsPart.part, undefined);
			drag(container, grid, ChatWindowGridCell.Terminals, 'top', 500);
			const along = split === ChatWindowLayoutMode.Stacked ? 'height' : 'width';
			if (along === 'width') {
				drag(container, grid, move === 'swap' ? ChatWindowGridCell.Main : ChatWindowGridCell.Chat, 'right', 300);
			} else {
				drag(container, grid, move === 'reorder' ? ChatWindowGridCell.Main : ChatWindowGridCell.Chat, 'top', 130);
			}
			const recorded = JSON.parse(JSON.stringify(grid.exportSizes())) as ChatWindowPartSizes;
			mode.set(hide, undefined);
			grid.layout(700, height);
			// The sash of the gesture: between the chat and the main part's sides, or above the terminals
			const hiddenCell = hide === ChatWindowLayoutMode.ChatOnly ? ChatWindowGridCell.Main : ChatWindowGridCell.Chat;
			const leftSide = move === 'swap' ? ChatWindowGridCell.Main : ChatWindowGridCell.Chat;
			const besideSash = leftSide === hiddenCell ? ChatWindowGridCell.Terminals : leftSide;
			const vertical = gesture === 'width' || (gesture === 'reset' && along === 'width' && position !== ChatWindowTerminalPosition.FullWidth);
			if (gesture === 'width') {
				drag(container, grid, besideSash, 'right', grid.partGrid!.getCellSize(besideSash).width - 30);
			} else if (gesture === 'height') {
				drag(container, grid, ChatWindowGridCell.Terminals, 'top', 200);
			} else {
				const bounds = container.querySelector(`[data-part-grid-cell="${vertical ? besideSash : ChatWindowGridCell.Terminals}"]`)!.getBoundingClientRect();
				const sash = [...container.querySelectorAll<HTMLElement>(`.monaco-sash.${vertical ? 'vertical' : 'horizontal'}`)].find(candidate => {
					const box = candidate.getBoundingClientRect();
					return vertical ? Math.abs(box.left + box.width / 2 - bounds.right) < 8 : Math.abs(box.top + box.height / 2 - bounds.top) < 8;
				});
				if (!sash) {
					return 'no sash';
				}
				sash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			}
			const sizes = grid.exportSizes();
			const arrangement = grid.exportArrangement();
			const chromeOf = (node: IChatWindowArrangement['root']): number[] => node.type === 'leaf' ? (node.data.id === ChatWindowGridCell.TitleRow || node.data.id === ChatWindowGridCell.Strip ? [node.size] : []) : node.data.flatMap(chromeOf);
			const chromeKept = !arrangement || chromeOf(arrangement.root).every(size => size === 30 || size === 34);
			const share = (target: ChatWindowGrid) => {
				const [main, chat] = [target.partGrid!.getCellSize(ChatWindowGridCell.Main)[along], target.partGrid!.getCellSize(ChatWindowGridCell.Chat)[along]];
				return Math.round(main * 100 / (main + chat));
			};
			// Reopened as it was saved, the hidden part shows again in both as it does
			const restoredMode = observableValue<ChatWindowLayoutMode>('mode', hide);
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { ...cells(arrangement), terminals: constObservable(terminalsPart.part) }, restoredMode, constObservable(0), sizes, constObservable(position), undefined, editorGroupsService));
			restored.layout(700, height);
			restoredMode.set(split, undefined);
			mode.set(split, undefined);
			// Where the terminals, 500 high, do not fit the window's height, the heights stay as saved; so they do where the
			// parts beside them have less room than they need. Else the sizes are those the window shows the parts with now,
			// as a gesture saves them without a hidden part.
			const untouched = vertical ? 'height' : 'width';
			const forced = untouched === 'height' && room === 'none';
			const otherKept = Object.entries(recorded).every(([key, entries]) => key === 'terminals' || key.includes('|') || Object.entries(entries).every(([cell, size]) => {
				const saved = sizes[key]?.[cell]?.[untouched];
				return saved !== undefined && (forced ? saved === size[untouched] : Math.abs(saved - grid.partGrid!.getCellSize(cell as ChatWindowGridCell)[untouched]) <= 1);
			}));
			const splitKept = Math.abs(share(restored) - share(grid)) <= 1;
			return otherKept && chromeKept && splitKept ? 'kept' : JSON.stringify({ otherKept, chromeKept, splitKept, shown: share(grid), reloaded: share(restored) });
		};
		const { SideBySide, Stacked, ChatOnly, EditorOnly } = { SideBySide: ChatWindowLayoutMode.SideBySide, Stacked: ChatWindowLayoutMode.Stacked, ChatOnly: ChatWindowLayoutMode.ChatOnly, EditorOnly: ChatWindowLayoutMode.EditorOnly } as const;
		const rows: Record<string, Row> = {};
		for (const [room, suffix] of [['none', ''], ['nearFit', ', near fit']] as const) {
			for (const chrome of [true, false]) {
				const name = (row: string) => `${row}${chrome ? '' : ', no chrome'}${suffix}`;
				for (const [hide, position] of [[ChatOnly, ChatWindowTerminalPosition.UnderEditor], [EditorOnly, ChatWindowTerminalPosition.UnderChat]] as const) {
					for (const move of [undefined, 'swap'] as const) {
						for (const gesture of ['width', 'reset'] as const) {
							rows[name(`side by side${move ? ', swapped' : ''}, ${hide === ChatOnly ? 'main' : 'chat'} hidden above the terminals, ${gesture}`)] = { split: SideBySide, position, hide, move, chrome, gesture, room };
						}
					}
				}
				for (const hide of [ChatOnly, EditorOnly]) {
					for (const gesture of ['height', 'reset'] as const) {
						rows[name(`side by side, ${hide === ChatOnly ? 'main' : 'chat'} hidden, terminals across, ${gesture}`)] = { split: SideBySide, position: ChatWindowTerminalPosition.FullWidth, hide, chrome, gesture, room };
						for (const move of [undefined, 'reorder'] as const) {
							rows[name(`stacked${move ? ', reordered' : ''}, ${hide === ChatOnly ? 'main' : 'chat'} hidden, ${gesture}`)] = { split: Stacked, position: ChatWindowTerminalPosition.FullWidth, hide, move, chrome, gesture, room };
						}
					}
				}
			}
		}

		const results = Object.fromEntries(Object.entries(rows).map(([name, row]) => {
			try {
				return [name, run(row)];
			} catch (error) {
				return [name, String(error)];
			}
		}));
		assert.deepStrictEqual(results, Object.fromEntries(Object.keys(rows).map(name => [name, 'kept'])));
	});

	test('the split the user gave the parts, restored without the chrome, stays as the terminals first show beside it: shown from the start, registered empty and then filled, as the terminals service does, or joining empty later and then filled, also at a height that takes all but the least sizes of the parts, and while a part hides; only then, as later the terminals show among the sizes the user gave the parts', () => {
		type Case = { split: ChatWindowSplitLayout; order: 'shown' | 'registeredEmpty' | 'joiningEmpty'; terminalsHeight: number; hide?: ChatWindowLayoutMode };
		const run = ({ split, order, terminalsHeight, hide }: Case) => {
			const stacked = split === ChatWindowLayoutMode.Stacked;
			const position = stacked ? ChatWindowTerminalPosition.FullWidth : ChatWindowTerminalPosition.UnderEditor;
			const along = stacked ? 'height' : 'width';
			const edge = stacked ? 'top' : 'right';
			// The room the chat and the main part share along the split, of which the main part takes about half, then more
			const room = stacked ? 800 - terminalsHeight : 1000;
			const share = (target: ChatWindowGrid) => {
				const [main, chat] = [target.partGrid!.getCellSize(ChatWindowGridCell.Main)[along], target.partGrid!.getCellSize(ChatWindowGridCell.Chat)[along]];
				return Math.round(main * 100 / (main + chat));
			};
			const cells = (arrangement?: IChatWindowArrangement) => ({ main: createPart('main'), chat: createPart('chat'), splitLayout: constObservable(split), arrangement });
			const terminalsPart = createPartWithEditors('terminals');
			terminalsPart.setEmpty(false);
			const originalTerminals = observableValue<IContentPart | undefined>('terminals', undefined);
			const container = createAttachedContainer();
			const grid = disposables.add(new ChatWindowGrid(container, { ...cells(), terminals: originalTerminals }, constObservable(split), constObservable(0), undefined, constObservable(position), undefined, editorGroupsService));
			grid.layout(1000, 800);
			grid.partGrid!.moveCell(stacked ? ChatWindowGridCell.Chat : ChatWindowGridCell.Main, stacked ? { reference: ChatWindowGridCell.Main, direction: Direction.Up } : { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
			originalTerminals.set(terminalsPart.part, undefined);
			drag(container, grid, ChatWindowGridCell.Terminals, 'top', terminalsHeight);
			drag(container, grid, ChatWindowGridCell.Main, edge, Math.round(room * 0.45));
			const saved = share(grid);

			const restoredTerminals = createPartWithEditors('terminals');
			restoredTerminals.setEmpty(order !== 'shown');
			const terminalsCell = observableValue<IContentPart | undefined>('terminals', order === 'joiningEmpty' ? undefined : restoredTerminals.part);
			const restoredMode = observableValue<ChatWindowLayoutMode>('mode', split);
			const restoredContainer = createAttachedContainer();
			const restored = disposables.add(new ChatWindowGrid(restoredContainer, { ...cells(grid.exportArrangement()), terminals: terminalsCell }, restoredMode, constObservable(0), grid.exportSizes(), constObservable(position), undefined, editorGroupsService));
			restored.layout(1000, 800);
			terminalsCell.set(restoredTerminals.part, undefined);
			// Until the terminals have something to show, the parts keep the split
			const whileEmpty = share(restored);
			if (hide !== undefined) {
				restoredMode.set(hide, undefined);
			}
			restoredTerminals.setEmpty(false);
			restoredMode.set(split, undefined);
			const first = share(restored);
			// The user gives the parts another split; the terminals then empty and fill again
			drag(restoredContainer, restored, ChatWindowGridCell.Main, edge, Math.round(room * 0.6));
			const live = share(restored);
			restoredTerminals.setEmpty(true);
			restoredTerminals.setEmpty(false);
			const kept = (from: number, to: number) => Math.abs(to - from) <= 1 ? 'kept' : `${from} -> ${to}`;
			return { whileEmpty: kept(saved, whileEmpty), firstShow: kept(saved, first), laterShow: kept(live, share(restored)), terminals: restored.partGrid!.getCellSize(ChatWindowGridCell.Terminals).height };
		};
		const cases: Record<string, Case> = {};
		for (const split of [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.SideBySide] as const) {
			const name = split === ChatWindowLayoutMode.Stacked ? 'stacked, reordered' : 'side by side, swapped';
			for (const terminalsHeight of [200, 600]) {
				for (const order of ['shown', 'registeredEmpty', 'joiningEmpty'] as const) {
					cases[`${name}, ${order}, terminals ${terminalsHeight}`] = { split, order, terminalsHeight };
				}
				for (const hide of [ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.EditorOnly] as const) {
					cases[`${name}, registeredEmpty, filled while ${hide === ChatWindowLayoutMode.ChatOnly ? 'main' : 'chat'} hides, terminals ${terminalsHeight}`] = { split, order: 'registeredEmpty', terminalsHeight, hide };
				}
			}
		}
		const results = Object.fromEntries(Object.entries(cases).map(([name, row]) => {
			try {
				return [name, run(row)];
			} catch (error) {
				return [name, String(error)];
			}
		}));
		assert.deepStrictEqual(results, Object.fromEntries(Object.entries(cases).map(([name, row]) => [name, { whileEmpty: 'kept', firstShow: 'kept', laterShow: 'kept', terminals: row.terminalsHeight }])));
	});

	test('the main part hidden with the terminals under it while they have nothing to show is as wide after a reload as the user made it', () => {
		const { mode, grid, open, position, terminalsPart, userResize } = setupWithTerminals();
		grid.partGrid!.moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
		userResize(ChatWindowGridCell.Main, 'right', 400);
		position.set(ChatWindowTerminalPosition.UnderEditor, undefined);
		open();
		mode.set(ChatWindowLayoutMode.ChatOnly, undefined);
		terminalsPart.setEmpty(true);
		const arrangement = grid.exportArrangement();
		const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), arrangement }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, undefined, undefined, editorGroupsService));
		restored.layout(1000, 800);

		assert.deepStrictEqual({ shape: restored.partGrid!.describe(), main: restored.partGrid!.getCellSize(ChatWindowGridCell.Main).width }, { shape: 'column(titleRow, row(main, chat, strip))', main: 400 });
	});

	test('the split the user gave the chat and the main part comes back after a reload, within a point as sizes round, whichever part was hidden as it saved, with the terminals beside it showing, empty or absent, a part the grid created coming or going meanwhile, with or without the chrome', () => {
		type Case = { split: ChatWindowSplitLayout; move: 'swap' | 'nested' | 'reorder'; hide: ChatWindowLayoutMode; terminals?: { position: ChatWindowTerminalPosition; empty: boolean }; chrome?: false; created?: 'addedWhileHidden' | 'closedWhileHidden' | 'addedResizedAndClosedWhileHidden' };
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditor';
			override readonly resource = undefined;
			override getName() { return 'file'; }
		}();
		const run = ({ split, move, hide, terminals, chrome, created }: Case) => {
			const mode = observableValue<ChatWindowLayoutMode>('mode', split);
			const terminalsPart = createPartWithEditors('terminals');
			const terminalsCell = observableValue<IContentPart | undefined>('terminals', undefined);
			const closeCreated = disposables.add(new Emitter<void>());
			const createdPart = createPartWithEditors('created', closeCreated.event);
			terminalsPart.setEmpty(false);
			createdPart.setEmpty(false);
			const cells = (arrangement?: IChatWindowArrangement) => ({ main: createPart('main'), chat: createPart('chat'), ...(chrome === false ? {} : { titleRow: createChrome(30), strip: createChrome(34) }), splitLayout: constObservable(split), arrangement });
			const original = cells();
			sourcePart = original.main;
			const container = createAttachedContainer();
			const grid = disposables.add(new ChatWindowGrid(container, { ...original, terminals: terminalsCell }, mode, constObservable(0), undefined, constObservable(terminals?.position ?? ChatWindowTerminalPosition.FullWidth), { createPart: () => ({ id: 'created', part: createdPart.part }) }, editorGroupsService));
			const addCreated = () => grid.partGrid!.moveEditorsIntoNewPart([{ editor, groupId: 1 }], { edge: Direction.Right });
			grid.layout(1000, 800);
			const partGrid = () => grid.partGrid!;
			if (move === 'swap') {
				partGrid().moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Left });
			} else if (move === 'nested') {
				partGrid().moveCell(ChatWindowGridCell.Main, { reference: ChatWindowGridCell.Chat, direction: Direction.Up });
			} else {
				partGrid().moveCell(ChatWindowGridCell.Chat, { reference: ChatWindowGridCell.Main, direction: Direction.Up });
			}
			if (terminals) {
				terminalsCell.set(terminalsPart.part, undefined);
			}
			if (created === 'closedWhileHidden') {
				addCreated();
			}
			// Beside each other, the chat and the main part split the width; one above the other, the height
			const along = split === ChatWindowLayoutMode.Stacked || move === 'nested' ? 'height' : 'width';
			const share = (target: PartGrid) => {
				const [main, chat] = [target.getCellSize(ChatWindowGridCell.Main)[along], target.getCellSize(ChatWindowGridCell.Chat)[along]];
				return { share: Math.round(main * 100 / (main + chat)), atMinimum: Math.min(main, chat) <= 100 };
			};
			partGrid().resizeCell(ChatWindowGridCell.Main, along === 'width' ? { width: 300 } : { height: 250 });
			const before = share(partGrid());
			mode.set(hide, undefined);
			if (terminals?.empty) {
				terminalsPart.setEmpty(true);
			}
			if (created === 'addedWhileHidden') {
				addCreated();
			} else if (created === 'closedWhileHidden') {
				closeCreated.fire();
			} else if (created === 'addedResizedAndClosedWhileHidden') {
				addCreated();
				// The sash between the part that shows and the created part
				const beside = hide === ChatWindowLayoutMode.ChatOnly ? ChatWindowGridCell.Chat : ChatWindowGridCell.Main;
				drag(container, grid, beside, 'right', partGrid().getCellSize(beside).width - 40);
				closeCreated.fire();
			}
			const arrangement = grid.exportArrangement();
			const restored = disposables.add(new ChatWindowGrid(createAttachedContainer(), cells(arrangement), constObservable(split), constObservable(0), undefined, undefined, undefined, editorGroupsService));
			restored.layout(1000, 800);
			const after = share(restored.partGrid!);
			// Within a point: the sizes round as the room is shared again, and as the parts the grid created leave the arrangement
			return !!arrangement && Math.abs(after.share - before.share) <= 1 && !after.atMinimum ? 'kept' : `${JSON.stringify(before)} -> ${JSON.stringify(after)}${arrangement ? '' : ' (not saved)'}`;
		};
		const [SideBySide, Stacked, ChatOnly, EditorOnly] = [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.EditorOnly] as const;
		const [FullWidth, UnderChat, UnderEditor] = [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.UnderEditor] as const;
		const cases: Record<string, Case> = {
			'swapped, main hidden': { split: SideBySide, move: 'swap', hide: ChatOnly },
			'swapped, chat hidden': { split: SideBySide, move: 'swap', hide: EditorOnly },
			'swapped, main hidden, without chrome': { split: SideBySide, move: 'swap', hide: ChatOnly, chrome: false },
			'swapped, main hidden, terminals across': { split: SideBySide, move: 'swap', hide: ChatOnly, terminals: { position: FullWidth, empty: false } },
			'swapped, main hidden, terminals across, empty': { split: SideBySide, move: 'swap', hide: ChatOnly, terminals: { position: FullWidth, empty: true } },
			'swapped, main hidden, terminals under it': { split: SideBySide, move: 'swap', hide: ChatOnly, terminals: { position: UnderEditor, empty: false } },
			'swapped, main hidden, terminals under it, empty': { split: SideBySide, move: 'swap', hide: ChatOnly, terminals: { position: UnderEditor, empty: true } },
			'swapped, chat hidden, terminals under it': { split: SideBySide, move: 'swap', hide: EditorOnly, terminals: { position: UnderChat, empty: false } },
			'swapped, chat hidden, terminals under it, empty': { split: SideBySide, move: 'swap', hide: EditorOnly, terminals: { position: UnderChat, empty: true } },
			'nested, main hidden': { split: SideBySide, move: 'nested', hide: ChatOnly },
			'nested, chat hidden, terminals across, empty': { split: SideBySide, move: 'nested', hide: EditorOnly, terminals: { position: FullWidth, empty: true } },
			'stacked reordered, main hidden, terminals': { split: Stacked, move: 'reorder', hide: ChatOnly, terminals: { position: FullWidth, empty: false } },
			'stacked reordered, chat hidden, terminals empty': { split: Stacked, move: 'reorder', hide: EditorOnly, terminals: { position: FullWidth, empty: true } },
			'stacked reordered, main hidden, without chrome': { split: Stacked, move: 'reorder', hide: ChatOnly, chrome: false },
			'swapped, main hidden, terminals under it, empty, a part created meanwhile': { split: SideBySide, move: 'swap', hide: ChatOnly, terminals: { position: UnderEditor, empty: true }, created: 'addedWhileHidden' },
			'swapped, chat hidden, terminals under it, empty, a part created meanwhile': { split: SideBySide, move: 'swap', hide: EditorOnly, terminals: { position: UnderChat, empty: true }, created: 'addedWhileHidden' },
			'swapped, main hidden, terminals under it, empty, a part closed meanwhile': { split: SideBySide, move: 'swap', hide: ChatOnly, terminals: { position: UnderEditor, empty: true }, created: 'closedWhileHidden' },
			'swapped, main hidden, a part created meanwhile': { split: SideBySide, move: 'swap', hide: ChatOnly, created: 'addedWhileHidden' },
			'stacked reordered, chat hidden, terminals empty, a part closed meanwhile': { split: Stacked, move: 'reorder', hide: EditorOnly, terminals: { position: FullWidth, empty: true }, created: 'closedWhileHidden' },
			'swapped, main hidden, terminals under it, empty, a part created, resized beside and closed meanwhile': { split: SideBySide, move: 'swap', hide: ChatOnly, terminals: { position: UnderEditor, empty: true }, created: 'addedResizedAndClosedWhileHidden' },
			'swapped, chat hidden, terminals under it, empty, a part created, resized beside and closed meanwhile': { split: SideBySide, move: 'swap', hide: EditorOnly, terminals: { position: UnderChat, empty: true }, created: 'addedResizedAndClosedWhileHidden' },
		};

		const results = Object.fromEntries(Object.entries(cases).map(([name, testCase]) => [name, run(testCase)]));
		sourcePart = undefined;
		assert.deepStrictEqual(results, Object.fromEntries(Object.keys(cases).map(name => [name, 'kept'])));
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
				{ topology: 'column(titleRow, row(column(chat, terminals), main, strip))', height: 200, asNew: true },
				{ topology: 'column(titleRow, row(chat, column(main, terminals), strip))', height: 200, asNew: true },
				{ topology: 'column(titleRow, row(column(row(chat, main), terminals), strip))', height: 200, asNew: true },
			],
		});
	});

	test('the terminals dropped below the main part or below the chat take that terminal position, and full width again at the bottom edge of the window: a mode round trip, the terminals leaving and joining again, and a new grid show them there; dropped where no position puts them, the position stays', () => {
		const { mode, position, grid, open, close, container } = setupWithTerminals();
		open();
		const pointer = (target: EventTarget, type: string, clientX: number, clientY: number) => target.dispatchEvent(new PointerEvent(type, { clientX, clientY, button: 0, pointerId: 1, bubbles: true, cancelable: true }));
		const cardOf = (cell: ChatWindowGridCell) => container.querySelector(`[data-part-grid-cell="${cell}"] > .part-grid-card`)!.getBoundingClientRect();
		// Without motion, where the pointer is says where the card goes beside a part: at `fx`, `fy` of `over`, else at the bottom edge of the window
		const drop = (over: ChatWindowGridCell | undefined, fx = 0.5, fy = 0.9) => {
			const handle = container.querySelector<HTMLElement>(`[data-part-grid-cell="${ChatWindowGridCell.Terminals}"] .part-grid-drag-handle`)!;
			const start = handle.getBoundingClientRect();
			const [x, y] = [start.left + start.width / 2, start.top + start.height / 2];
			const target = over && cardOf(over);
			const [toX, toY] = target ? [target.left + target.width * fx, target.top + target.height * fy] : [300, 796];
			pointer(handle, 'pointerdown', x, y);
			pointer(handle, 'pointermove', x + 10, y + 10);
			pointer(handle, 'pointermove', toX, toY);
			pointer(handle, 'pointerup', toX, toY);
		};
		const read = () => {
			const shape = grid.partGrid!.describe();
			mode.set(ChatWindowLayoutMode.Stacked, undefined);
			mode.set(ChatWindowLayoutMode.SideBySide, undefined);
			const afterModeRoundTrip = grid.partGrid!.describe();
			close();
			open();
			const rejoined = grid.partGrid!.describe();
			const fresh = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals: constObservable(createPart('terminals')) }, constObservable(ChatWindowLayoutMode.SideBySide), constObservable(0), undefined, constObservable(position.get()), undefined, editorGroupsService));
			fresh.layout(1000, 800);
			return { position: position.get(), shape, afterModeRoundTrip, rejoined, asNew: fresh.partGrid!.describe() };
		};
		const arranged = (terminalPosition: ChatWindowTerminalPosition, shape: string) => ({ position: terminalPosition, shape, afterModeRoundTrip: shape, rejoined: shape, asNew: shape });

		drop(ChatWindowGridCell.Main);
		const underEditor = read();
		drop(ChatWindowGridCell.Chat);
		const underChat = read();
		drop(undefined);
		const fullWidth = read();
		drop(ChatWindowGridCell.Main, 0.9, 0.5);
		const besideMain = { position: position.get(), shape: grid.partGrid!.describe() };

		assert.deepStrictEqual({ underEditor, underChat, fullWidth, besideMain }, {
			underEditor: arranged(ChatWindowTerminalPosition.UnderEditor, 'column(titleRow, row(chat, column(main, terminals), strip))'),
			underChat: arranged(ChatWindowTerminalPosition.UnderChat, 'column(titleRow, row(column(chat, terminals), main, strip))'),
			fullWidth: arranged(ChatWindowTerminalPosition.FullWidth, 'column(titleRow, row(column(row(chat, main), terminals), strip))'),
			besideMain: { position: ChatWindowTerminalPosition.FullWidth, shape: 'column(titleRow, row(chat, main, terminals, strip))' },
		});
	});

	test('terminals joining and leaving while the chat is hidden, in Editor Only, keep the chat\'s height: it is the same in Stacked after each round trip', () => {
		const { mode, open, close, grid } = setupWithTerminals(ChatWindowLayoutMode.Stacked);
		const chatHeight = () => grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height;
		const heights = [chatHeight()];
		for (let i = 0; i < 3; i++) {
			mode.set(ChatWindowLayoutMode.EditorOnly, undefined);
			open();
			close();
			mode.set(ChatWindowLayoutMode.Stacked, undefined);
			heights.push(chatHeight());
		}

		assert.deepStrictEqual(heights, [heights[0], heights[0], heights[0], heights[0]]);
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
				override getGroups() { return this.groups; }
				override findGroup() { return undefined; }
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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
			added: 'column(titleRow, row(chat, main, created, strip))',
			afterModeChange: 'column(titleRow, row(column(main, chat), created, strip))',
			chatWidthBack: 300,
			afterClose: 'column(titleRow, row(chat, main, strip))',
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
			override readonly groups = [new class extends mock<IEditorGroup>() {
				override readonly id = 20;
				override readonly isEmpty = false;
				override readonly activeEditor = editor;
				override readonly onDidModelChange = Event.None;
				override focus(): void { }
				override getEditors() { return [editor]; }
				// The editor leaves the group as it moves
				override contains() { return moved.length === 0; }
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
			added: 'column(titleRow, row(chat, created, main, strip))',
			moved: ['file → 10', 'closed'],
			after: 'column(titleRow, row(chat, main, strip))'
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
				override getGroups() { return this.groups; }
				override findGroup() { return undefined; }
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

		assert.deepStrictEqual(grid.partGrid!.describe(), 'column(titleRow, row(terminals, strip))');
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
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
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
	/** A grid of a chat window, its title row always showing, as a chat window's does. */
	function setupTitled(initialMode: ChatWindowLayoutMode, withTerminals: boolean) {
		const mode = observableValue<ChatWindowLayoutMode>('mode', initialMode);
		const terminals = observableValue<IContentPart | undefined>('terminals', undefined);
		const terminalsPart = createPartWithEditors('terminals');
		const container = createAttachedContainer();
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34), terminals }, mode, constObservable(0), undefined, constObservable(ChatWindowTerminalPosition.FullWidth), undefined, editorGroupsService));
		grid.layout(1000, 800);
		if (withTerminals) {
			terminals.set(terminalsPart.part, undefined);
			terminalsPart.setEmpty(false);
		}
		return { grid, mode };
	}

	/** Where the title row is: the first row of the grid, across the whole window, above every part. */
	function observeTitle(grid: ChatWindowGrid) {
		const partGrid = grid.partGrid!;
		return {
			shape: partGrid.describe().startsWith('column(titleRow, ') ? 'title row first, across the top' : partGrid.describe(),
			titleRow: partGrid.isCellVisible(ChatWindowGridCell.TitleRow) ? `${partGrid.getCellSize(ChatWindowGridCell.TitleRow).width} wide` : 'hidden',
		};
	}

	const TITLE_ACROSS_THE_TOP = { shape: 'title row first, across the top', titleRow: '1000 wide' };
	const MODES = [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly];
	const DIRECTIONS: [string, Direction][] = [['left', Direction.Left], ['right', Direction.Right], ['top', Direction.Up], ['bottom', Direction.Down]];

	test('the chat part and the main part moved to every edge of the window and beside each other, in every mode: the title row shows across the top of the window, above them', () => {
		const moves: [string, ChatWindowGridCell | undefined, PartGridLocation | undefined][] = [['as arranged', undefined, undefined]];
		for (const [cell, other] of [[ChatWindowGridCell.Chat, ChatWindowGridCell.Main], [ChatWindowGridCell.Main, ChatWindowGridCell.Chat]] as const) {
			for (const [name, direction] of DIRECTIONS) {
				moves.push([`${cell} to the ${name} edge`, cell, { edge: direction }]);
				moves.push([`${cell} to the ${name} of ${other}`, cell, { reference: other, direction }]);
			}
		}
		for (const mode of MODES) {
			for (const [moveName, cell, location] of moves) {
				const { grid } = setupTitled(mode, false);
				if (cell && location) {
					grid.partGrid!.moveCell(cell, location);
				}
				assert.deepStrictEqual(observeTitle(grid), TITLE_ACROSS_THE_TOP, `${mode}, ${moveName}`);
			}
		}
	});

	test('the terminals and a part for dropped editors moved to the top of the window, above the chat or the main part, or to its left, in every mode: the title row shows across the top of the window, above them', () => {
		const moves: [string, (grid: ChatWindowGrid) => void][] = [
			['terminals to the top edge', grid => grid.partGrid!.moveCell(ChatWindowGridCell.Terminals, { edge: Direction.Up })],
			['terminals above the chat', grid => grid.partGrid!.moveCell(ChatWindowGridCell.Terminals, { reference: ChatWindowGridCell.Chat, direction: Direction.Up })],
			['terminals above the main part', grid => grid.partGrid!.moveCell(ChatWindowGridCell.Terminals, { reference: ChatWindowGridCell.Main, direction: Direction.Up })],
			['terminals to the left edge', grid => grid.partGrid!.moveCell(ChatWindowGridCell.Terminals, { edge: Direction.Left })],
			['a part at the top edge', grid => grid.partGrid!.addPart('other', createPart('other'), { edge: Direction.Up })],
			['a part at the left edge', grid => grid.partGrid!.addPart('other', createPart('other'), { edge: Direction.Left })],
			['a part above the chat', grid => grid.partGrid!.addPart('other', createPart('other'), { reference: ChatWindowGridCell.Chat, direction: Direction.Up })],
		];
		for (const mode of MODES) {
			for (const [moveName, move] of moves) {
				const { grid } = setupTitled(mode, true);
				move(grid);
				assert.deepStrictEqual(observeTitle(grid), TITLE_ACROSS_THE_TOP, `${mode}, ${moveName}`);
			}
		}
	});

	test('the title row shows across the top of the window as the layout mode changes after a part moved, and as the window arranges the parts again for the mode', () => {
		for (const from of MODES) {
			for (const to of MODES) {
				const { grid, mode } = setupTitled(from, false);
				grid.partGrid!.moveCell(ChatWindowGridCell.Chat, { edge: Direction.Right });
				mode.set(to, undefined);
				assert.deepStrictEqual(observeTitle(grid), TITLE_ACROSS_THE_TOP, `${from} with the chat moved right, then ${to}`);
			}
		}
	});
});
