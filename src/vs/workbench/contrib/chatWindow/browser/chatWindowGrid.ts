/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { Direction, ISerializedGrid, ISerializedNode, IViewSize, Orientation } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IPartGridPartFactory, IPartGridPartOptions, IPartGridView, PartGrid, PartGridCellContent, PartGridLocation } from '../../../browser/parts/partGrid/partGrid.js';
import { IGridEdgeInsets, NO_GRID_EDGE_INSETS } from '../../../browser/parts/partGrid/partGridGap.js';
import { IContentPart, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ChatWindowLayoutMode, ChatWindowTerminalPosition } from '../common/chatWindowLayout.js';
import { ChatWindowPartSizes } from '../common/chatWindowState.js';
import { moveEditorsToChatWindow } from './chatWindowParts.js';

/** The cells of a chat window's grid. */
export const enum ChatWindowGridCell {
	TitleRow = 'titleRow',
	Chat = 'chat',
	Main = 'main',
	Strip = 'strip',
	Terminals = 'terminals',
}

/** The type of terminal editors, `TerminalEditorInput.ID`. */
export const TERMINAL_EDITOR_TYPE_ID = 'workbench.editors.terminal';

/** The share of the height of their column that the terminals take until the user sizes them. */
const TERMINALS_SHARE = 0.3;

/** The key of the sizes under which the terminals' last size is kept, whatever the arrangement it showed in. */
const TERMINALS_SIZE_KEY = 'terminals';

/** The terminals keep their height as the window is resized: the other parts take what it grows or shrinks by. */
const TERMINALS_OPTIONS: IPartGridPartOptions = { keepsSize: true };

/** A row or column of chrome in a chat window's grid, such as its title row or its strip. */
export interface IChatWindowGridChrome {
	readonly element: HTMLElement;
	/** Whether it shows; it takes no room while it does not. */
	readonly visible: IObservable<boolean>;
	/** The height of a row, the width of a column. */
	readonly size: IObservable<number>;
	layout(width: number, height: number): void;
}

/** What a chat window's grid shows. */
export interface IChatWindowGridCells {
	readonly main: IContentPart;
	readonly chat: IContentPart;
	readonly titleRow?: IChatWindowGridChrome;
	readonly strip?: IChatWindowGridChrome;
	/** The part that holds the window's terminals, once it exists. */
	readonly terminals?: IObservable<IContentPart | undefined>;
	/** Whether the chat shows only its input: it does not move then, so that the sash on its edge takes the pointer there. */
	readonly chatInputOnly?: IObservable<boolean>;
	/** Takes the terminal position the user arranged the terminals in, such as by dropping them below the main part. */
	readonly setTerminalPosition?: (position: ChatWindowTerminalPosition) => void;
}

type TopologyNode = { readonly cell: ChatWindowGridCell } | { readonly orientation: Orientation; readonly children: readonly TopologyNode[] };

function isBranch(node: TopologyNode): node is { readonly orientation: Orientation; readonly children: readonly TopologyNode[] } {
	return (node as { children?: unknown }).children !== undefined;
}

/** Builds a branch without nesting a branch of the same orientation in it, or keeping a branch of a single child. */
function branch(orientation: Orientation, ...children: TopologyNode[]): TopologyNode {
	const flat = children.flatMap(child => isBranch(child) && child.orientation === orientation ? child.children : [child]);
	return flat.length === 1 ? flat[0] : { orientation, children: flat };
}

/** Where the terminals show in `mode`: without the main part beside the chat, below the chat is across the window. */
function getEffectiveTerminalPosition(mode: ChatWindowLayoutMode, position: ChatWindowTerminalPosition): ChatWindowTerminalPosition {
	return mode === ChatWindowLayoutMode.ChatOnly && position === ChatWindowTerminalPosition.UnderEditor ? ChatWindowTerminalPosition.FullWidth : position;
}

/**
 * How a chat window arranges its cells for a layout mode, below the title row, which is across the top of the window
 * while it shows, with the strip in a column of its own at the right, as the main window's Session Activity Bar column:
 * - side by side (and chat only): the chat beside the main part; the terminals below the chat, below the main part, or
 *   across the bottom of the chat and the main part, as `cells.terminals` says (below the main part is across in chat
 *   only), the strip running past them;
 * - stacked (and editor only): the main part above the chat; the terminals across the bottom of the chat and the main
 *   part, the strip running past them.
 * The cells a mode hides, the chat or the main part, stay in the grid, so that showing them is not a move.
 */
export function getChatWindowTopology(mode: ChatWindowLayoutMode, cells: { readonly titleRow: boolean; readonly strip: boolean; readonly terminals?: ChatWindowTerminalPosition }): TopologyNode {
	const titleRow: TopologyNode[] = cells.titleRow ? [{ cell: ChatWindowGridCell.TitleRow }] : [];
	const strip: TopologyNode[] = cells.strip ? [{ cell: ChatWindowGridCell.Strip }] : [];
	const terminals: TopologyNode[] = cells.terminals !== undefined ? [{ cell: ChatWindowGridCell.Terminals }] : [];
	const chat: TopologyNode = { cell: ChatWindowGridCell.Chat };
	const main: TopologyNode = { cell: ChatWindowGridCell.Main };
	if (mode === ChatWindowLayoutMode.SideBySide || mode === ChatWindowLayoutMode.ChatOnly) {
		let parts: TopologyNode;
		switch (cells.terminals === undefined ? undefined : getEffectiveTerminalPosition(mode, cells.terminals)) {
			case undefined: parts = branch(Orientation.HORIZONTAL, chat, main); break;
			case ChatWindowTerminalPosition.UnderChat: parts = branch(Orientation.HORIZONTAL, branch(Orientation.VERTICAL, chat, ...terminals), main); break;
			case ChatWindowTerminalPosition.UnderEditor: parts = branch(Orientation.HORIZONTAL, chat, branch(Orientation.VERTICAL, main, ...terminals)); break;
			default: parts = branch(Orientation.VERTICAL, branch(Orientation.HORIZONTAL, chat, main), ...terminals); break;
		}
		return branch(Orientation.VERTICAL, ...titleRow, branch(Orientation.HORIZONTAL, parts, ...strip));
	}
	return branch(Orientation.VERTICAL, ...titleRow, branch(Orientation.HORIZONTAL, branch(Orientation.VERTICAL, main, chat, ...terminals), ...strip));
}

/** Where the terminals go in the grid of `mode`, beside a cell or at the bottom edge, as {@link getChatWindowTopology} places them. */
function getTerminalsLocation(mode: ChatWindowLayoutMode, position: ChatWindowTerminalPosition): PartGridLocation {
	if (mode === ChatWindowLayoutMode.Stacked) {
		return { reference: ChatWindowGridCell.Chat, direction: Direction.Down };
	}
	if (mode === ChatWindowLayoutMode.EditorOnly) {
		// Below the main part and the hidden chat, the strip running past them
		return { edge: Direction.Down };
	}
	switch (getEffectiveTerminalPosition(mode, position)) {
		case ChatWindowTerminalPosition.UnderChat: return { reference: ChatWindowGridCell.Chat, direction: Direction.Down };
		case ChatWindowTerminalPosition.UnderEditor: return { reference: ChatWindowGridCell.Main, direction: Direction.Down };
		// Across the chat and the main part, the strip running past them
		default: return { edge: Direction.Down };
	}
}

/**
 * The key the sizes of the cells are remembered under: the arrangement, and which of the chat and the main part it hides.
 * Only the chat and side by side share an arrangement, but the chat takes the room of the hidden main part in one of them.
 */
function getSizesKey(topologyKey: string, mode: ChatWindowLayoutMode): string {
	switch (mode) {
		case ChatWindowLayoutMode.ChatOnly: return `${topologyKey}|${ChatWindowGridCell.Main} hidden`;
		case ChatWindowLayoutMode.EditorOnly: return `${topologyKey}|${ChatWindowGridCell.Chat} hidden`;
		default: return topologyKey;
	}
}

function describeTopology(node: TopologyNode): string {
	return isBranch(node) ? `${node.orientation === Orientation.HORIZONTAL ? 'row' : 'column'}(${node.children.map(describeTopology).join(',')})` : node.cell;
}

/** How much of the room of a branch a cell takes until the user sizes it: the main part wider and taller than the chat. */
function getShare(node: TopologyNode, orientation: Orientation): number {
	if (isBranch(node)) {
		return Math.max(...node.children.map(child => getShare(child, orientation)));
	}
	switch (node.cell) {
		case ChatWindowGridCell.Main: return orientation === Orientation.HORIZONTAL ? 0.6 : 0.55;
		case ChatWindowGridCell.Chat: return orientation === Orientation.HORIZONTAL ? 0.4 : 0.45;
		default: return 0;
	}
}

/**
 * A row or column of chrome as a cell: as tall (row) or wide (column) as it says. The grid shows and hides its cell as it
 * says, with the other cells, so that the room of a hidden title row goes where the grid says, not to the terminals.
 */
class ChromeView implements IPartGridView {

	private readonly _onDidChange = new Emitter<IViewSize | undefined>();
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	private readonly _listener: { dispose(): void };

	constructor(protected readonly _chrome: IChatWindowGridChrome, private readonly _orientation: 'row' | 'column') {
		this._listener = autorun(reader => {
			_chrome.size.read(reader);
			this._onDidChange.fire(undefined);
		});
	}

	get element(): HTMLElement { return this._chrome.element; }
	private get _size(): number { return this._chrome.size.get(); }
	get minimumWidth(): number { return this._orientation === 'column' ? this._size : 0; }
	get maximumWidth(): number { return this._orientation === 'column' ? this._size : Number.POSITIVE_INFINITY; }
	get minimumHeight(): number { return this._orientation === 'row' ? this._size : 0; }
	get maximumHeight(): number { return this._orientation === 'row' ? this._size : Number.POSITIVE_INFINITY; }

	layout(width: number, height: number): void {
		this._chrome.layout(width, height);
	}

	dispose(): void {
		this._listener.dispose();
		this._onDidChange.dispose();
	}
}

/**
 * The title row of the window, the first row of its grid: its cell keeps the row's room there, inside the outer insets of
 * the window that the cards keep, while the title row spans the window from edge to edge over it, as the main window's
 * title bar does, so that the window's controls are at its corners. It stays first in the window, before the grid, as the
 * main window's title bar is first in the focus order.
 */
class TitleRowView extends ChromeView {

	private readonly _cell = $('.chat-window-title-row-cell');
	private readonly _visibility: { dispose(): void };

	constructor(chrome: IChatWindowGridChrome, container: HTMLElement, private readonly _insets: () => IGridEdgeInsets) {
		super(chrome, 'row');
		const element = chrome.element;
		if (element.parentElement !== container) {
			container.prepend(element);
		}
		// Over the grid, whose cells come after it
		element.style.position = 'absolute';
		element.style.left = '0';
		element.style.zIndex = '1';
		this._visibility = autorun(reader => element.style.display = chrome.visible.read(reader) ? '' : 'none');
	}

	override get element(): HTMLElement { return this._cell; }

	override layout(width: number, height: number): void {
		const insets = this._insets();
		const spanned = width + insets.left + insets.right;
		const element = this._chrome.element;
		element.style.top = `${insets.top}px`;
		element.style.width = `${spanned}px`;
		element.style.height = `${height}px`;
		super.layout(spanned, height);
	}

	override dispose(): void {
		this._visibility.dispose();
		super.dispose();
	}
}

/**
 * The grid of a chat window, on the workbench's part grid: its title row, its chat part, its main part, its strip and the
 * part that holds its terminals, arranged for its layout mode. The sizes the user gives its cells are kept per
 * arrangement, so that a mode shows with the sizes it had, and can be exported to come back for the chat after a reload.
 *
 * The terminals' part joins the grid where the terminal position says once it exists, and moves when the position
 * changes. Like every part, it hides while it has no editors. It keeps its height as the window is resized, and tall
 * terminals give way first when an arrangement shows that they did not show in yet.
 */
export class ChatWindowGrid extends Disposable {

	private readonly _grid = this._register(new MutableDisposable<PartGrid>());
	private readonly _gridListener = this._register(new MutableDisposable());
	private readonly _userResize = this._register(new MutableDisposable());
	private readonly _styleLayout = this._register(new MutableDisposable());
	private _topologyKey: string | undefined;
	/** The key the sizes of what shows are remembered under; see {@link getSizesKey}. */
	private _sizesKey: string | undefined;
	/** The key the sizes of the chat and the main part are also remembered under, without the terminals: they come back to it after a restart, for example, until the terminals are restored. */
	private _baseSizesKey: string | undefined;
	/** The height the terminals take when they first show: they join the grid empty, until their first terminal shows in them. */
	private _terminalsFirstShowHeight: number | undefined;
	/** The key of the arrangement without the terminals: while it stays, the terminals join or move rather than rebuild. */
	private _baseTopologyKey: string | undefined;
	private _terminalsInGrid = false;
	private _dimension: IViewSize | undefined;
	private _outerInsets: IGridEdgeInsets = NO_GRID_EDGE_INSETS;
	private _sizes: ChatWindowPartSizes = {};
	/** The arrangement of the part grid as the window arranged it: sizes are remembered for it only while the grid still shows it. */
	private _arranged: string | undefined;
	/** The layout mode the grid was last arranged for. */
	private _arrangedMode: ChatWindowLayoutMode | undefined;
	/**
	 * The arrangement of the part grid as the layout mode arranged it, with the parts the grid created: unlike
	 * {@link _arranged}, it does not take in parts the user moved meanwhile, so that a mode change can tell whether they did.
	 */
	private _modeArrangement: string | undefined;
	private _createdPartsChangingModeArrangement = false;
	private _createdPartsChanging = false;
	/** The height the terminals take once the cells of the arrangement they moved in show. */
	private _pendingTerminalsHeight: number | undefined;
	/** Whether the window closes; see {@link willClose}. */
	private _closing = false;

	private readonly _terminalsVisible = observableValue<boolean>(this, false);
	/** Whether the part that holds the window's terminals shows: it is in the grid and has editors. */
	readonly terminalsVisible: IObservable<boolean> = this._terminalsVisible;

	private readonly _resizing = observableValue<boolean>(this, false);
	/** Whether the user resizes the cells, dragging a sash between them, from the press on the sash until it lets go. */
	readonly resizing: IObservable<boolean> = this._resizing;

	private readonly _titleRow: ChromeView | undefined;
	private readonly _strip: ChromeView | undefined;

	/** The parts the grid created, such as for an editor dropped on an edge of the window, until they close. */
	private readonly _created = new Map<string, IContentPart>();
	private readonly _createdListeners = this._register(new DisposableMap<string>());
	private readonly _partFactory: IPartGridPartFactory | undefined;
	private readonly _partFactoryRegistration = this._register(new MutableDisposable());
	private readonly _movableRegistration = this._register(new MutableDisposable());

	private readonly _terminalPosition: IObservable<ChatWindowTerminalPosition>;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _cells: IChatWindowGridCells,
		private readonly _layoutMode: IObservable<ChatWindowLayoutMode>,
		private readonly _gap: IObservable<number>,
		sizes: ChatWindowPartSizes | undefined,
		terminalPosition: IObservable<ChatWindowTerminalPosition> | undefined,
		partFactory: IPartGridPartFactory | undefined,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super();
		this._sizes = { ...sizes };
		this._terminalPosition = terminalPosition ?? constObservable(ChatWindowTerminalPosition.FullWidth);
		this._partFactory = partFactory && {
			createPart: () => {
				const created = partFactory.createPart();
				this._created.set(created.id, created.part);
				this._willChangeCreatedParts();
				this._createdListeners.set(created.id, created.part.onWillClose(() => {
					this._created.delete(created.id);
					this._createdListeners.deleteAndDispose(created.id);
					this._willChangeCreatedParts();
				}));
				return created;
			}
		};
		this._titleRow = _cells.titleRow && this._register(new TitleRowView(_cells.titleRow, _container, () => this._outerInsets));
		this._strip = _cells.strip && this._register(new ChromeView(_cells.strip, 'column'));

		this._register(autorun(reader => {
			this._layoutMode.read(reader);
			_cells.strip?.visible.read(reader);
			_cells.titleRow?.visible.read(reader);
			_cells.terminals?.read(reader);
			this._terminalPosition.read(reader);
			if (!this._closing) {
				this._update();
			}
		}));
		// Only the sizes the user gives the cells are remembered: those of a sash they drag or reset. The sizes the grid takes
		// otherwise, such as by the least size of a part or as a mode shows, are not theirs.
		// On the pointer, before the sash takes the press, for a mouse, a pen or touch alike
		this._register(addDisposableListener(_container, EventType.POINTER_DOWN, e => {
			const sash = this._sashOf(e);
			if (!sash) {
				return;
			}
			const before = this._cellSizes();
			const window = getWindow(_container);
			const end = () => {
				up.dispose();
				this._rememberUserSizes(before);
			};
			// Replacing a resize that never ended, such as one whose release went elsewhere, ends that one first
			const up = this._userResize.value = combinedDisposable(
				addDisposableListener(window, EventType.POINTER_UP, end),
				addDisposableListener(window, 'pointercancel', end),
				toDisposable(() => {
					if (!this._store.isDisposed) {
						this._resizing.set(false, undefined);
					}
				}));
			// What the resize allows, such as a chat that shows only its input growing to show its conversation, is what
			// the sash drags within
			this._resizing.set(true, undefined);
		}, true));
		this._register(addDisposableListener(_container, EventType.DBLCLICK, e => {
			if (this._sashOf(e)) {
				this._rememberUserSizes(undefined);
			}
		}));
		this._register(autorun(reader => {
			_cells.chatInputOnly?.read(reader);
			this._grid.value?.updateMovable();
		}));
		this._register(autorun(reader => {
			// Read first: the grid is created later, and the gap must be followed from the start.
			const gap = this._gap.read(reader);
			this._grid.value?.setGap(gap);
			this._layoutOnceStylesApply();
		}));
	}

	/** The part grid of the window, for what acts on its cells, such as moving a part. */
	get partGrid(): PartGrid | undefined {
		return this._grid.value;
	}

	/**
	 * Closes the parts the grid created, their editors moving into the main part first. An editor that cannot move
	 * there goes where closing its part takes it.
	 */
	private _closeCreatedParts(): void {
		for (const part of [...this._created.values()]) {
			moveEditorsToChatWindow(part.groups, this._cells.main.activeGroup);
			part.close();
		}
	}

	/**
	 * The window closes: its chat part and main part closed, and their cells left the grid. What still changes as the
	 * rest of the window closes, such as the part that holds its terminals, is not arranged any more.
	 */
	willClose(): void {
		this.setClosing(true);
	}

	/**
	 * Whether the window is closing, from the start of its close, while its parts close and what they show moves to the
	 * main window: the grid does not arrange the parts meanwhile, and arranges them again when the close does not happen.
	 */
	setClosing(closing: boolean): void {
		if (this._closing === closing) {
			return;
		}
		this._closing = closing;
		if (!closing) {
			this._update();
		}
	}

	/** The parts the grid created, such as for editors dropped on an edge of the window, in the order it created them. */
	get createdParts(): readonly IContentPart[] {
		return Array.from(this._created.values());
	}

	/** The arrangement shown, such as `column(titleRow,row(chat,main))`. */
	get topology(): string | undefined {
		return this._topologyKey;
	}

	layout(width: number, height: number): void {
		const first = !this._dimension;
		this._dimension = { width, height };
		if (first) {
			// Arranged once the window has its size, so that the parts take their shares of it.
			this._update();
		} else {
			// The parts keep their shares of the window as it is resized, and the terminals their height (see `_contentOf`)
			this._grid.value?.layout(width, height);
		}
	}

	private _resizeTerminals(grid: PartGrid, height: number): void {
		// Only the height: resizing the width too would save the shares of the parts beside the terminals again, rounded
		grid.resizeCell(ChatWindowGridCell.Terminals, { height });
	}

	/**
	 * A part the grid creates or closes, such as for an editor dropped on an edge of the window, is part of the window's
	 * arrangement, which the window then still arranged, unless something else changed it, such as a part the user moved.
	 */
	private _willChangeCreatedParts(): void {
		const shown = this._grid.value?.describe();
		this._createdPartsChanging ||= shown !== undefined && shown === this._arranged;
		this._createdPartsChangingModeArrangement ||= shown !== undefined && shown === this._modeArrangement;
	}

	private _updateFromGrid(): void {
		if (this._createdPartsChanging) {
			this._createdPartsChanging = false;
			this._arranged = this._grid.value?.describe();
		}
		if (this._createdPartsChangingModeArrangement) {
			this._createdPartsChangingModeArrangement = false;
			this._modeArrangement = this._grid.value?.describe();
		}
		this._terminalsVisible.set(!!this._grid.value?.isCellVisible(ChatWindowGridCell.Terminals), undefined);
		this._adoptTerminalPosition();
	}

	/**
	 * Takes the terminal position the grid shows the terminals in, as the user moved them, such as by dropping them below
	 * the main part: the grid then shows exactly what the mode shows with them at that position, which the grid keeps as
	 * the window's arrangement, without moving them again. Elsewhere, the position stays.
	 */
	private _adoptTerminalPosition(): void {
		const grid = this._grid.value;
		const setTerminalPosition = this._cells.setTerminalPosition;
		const mode = this._arrangedMode;
		if (!grid || !setTerminalPosition || mode === undefined || this._closing || !this._terminalsInGrid) {
			return;
		}
		const shown = grid.describe();
		const current = this._terminalPosition.get();
		if (shown === this._describeArrangement(mode, current)) {
			return;
		}
		const adopted = [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.UnderEditor].find(position => shown === this._describeArrangement(mode, position));
		if (adopted === undefined) {
			return;
		}
		this._topologyKey = this._topology(mode, adopted).key;
		this._sizesKey = getSizesKey(this._topologyKey, mode);
		this._arranged = shown;
		this._modeArrangement = shown;
		setTerminalPosition(adopted);
	}

	/** What {@link PartGrid.describe} says for the arrangement of `mode` with the terminals at `position`, as {@link _arrange} builds it. */
	private _describeArrangement(mode: ChatWindowLayoutMode, position: ChatWindowTerminalPosition): string {
		const { topology } = this._topology(mode, position);
		const orientation = isBranch(topology) ? topology.orientation : Orientation.HORIZONTAL;
		const serialize = (node: TopologyNode): ISerializedNode => isBranch(node) ? { type: 'branch', data: node.children.map(serialize), size: 0 } : { type: 'leaf', data: { id: node.cell }, size: 0 };
		const root = serialize(topology);
		const cells = this._withCreatedParts(root.type === 'branch' ? root.data : [root], orientation, 0, 0);
		const describe = (node: ISerializedNode, along: Orientation): string => node.type === 'leaf'
			? (node.data as { id: string }).id
			: `${along === Orientation.HORIZONTAL ? 'row' : 'column'}(${node.data.map(child => describe(child, along === Orientation.HORIZONTAL ? Orientation.VERTICAL : Orientation.HORIZONTAL)).join(', ')})`;
		return cells.length === 1 ? describe(cells[0], orientation) : describe({ type: 'branch', data: cells, size: 0 }, orientation);
	}

	private _update(): void {
		if (!this._dimension) {
			return;
		}
		const mode = this._layoutMode.get();
		// A layout mode arranges the parts as it does, from its own arrangement: parts the user moved go back to their
		// places, also when the mode arranges them as the one before it, such as Side by Side and Chat Only, and a part
		// it hid, such as the main part in Chat Only, shows again at its size rather than where the terminals moved
		// beside it while hidden. Between modes that arrange the parts alike, with none moved, the parts only show or hide.
		if (mode !== this._arrangedMode && this._arrangedMode !== undefined) {
			const moved = this._grid.value?.describe() !== this._modeArrangement;
			if (moved || this._topology(mode).key !== this._topologyKey) {
				this._topologyKey = undefined;
				this._baseTopologyKey = undefined;
			}
		}
		this._arrangedMode = mode;
		if (this._arrange(mode, this._dimension)) {
			this._modeArrangement = this._grid.value!.describe();
		}
		const grid = this._grid.value!;
		// The terminals keep the height they have, or move with, as cells show and hide: a hidden cell, such as the title
		// row, would otherwise give them its room.
		const terminalsHeight = this._pendingTerminalsHeight ?? (grid.isCellVisible(ChatWindowGridCell.Terminals) ? grid.getCellSize(ChatWindowGridCell.Terminals).height : undefined);
		this._pendingTerminalsHeight = undefined;
		grid.setCellVisible(ChatWindowGridCell.Chat, mode !== ChatWindowLayoutMode.EditorOnly);
		grid.setCellVisible(ChatWindowGridCell.Main, mode !== ChatWindowLayoutMode.ChatOnly);
		if (this._titleRow) {
			grid.setCellVisible(ChatWindowGridCell.TitleRow, !!this._cells.titleRow?.visible.get());
		}
		if (this._strip) {
			grid.setCellVisible(ChatWindowGridCell.Strip, !!this._cells.strip?.visible.get());
		}
		// Sized once the cells beside them show, which would otherwise take a share of their height.
		if (terminalsHeight !== undefined && grid.isCellVisible(ChatWindowGridCell.Terminals) && grid.getCellSize(ChatWindowGridCell.Terminals).height !== terminalsHeight) {
			this._resizeTerminals(grid, terminalsHeight);
		}
		this._arranged = grid.describe();
		this._sizesKey = getSizesKey(this._topologyKey!, mode);
		this._baseSizesKey = getSizesKey(this._baseTopologyKey!, mode);
		this._updateFromGrid();
	}

	/**
	 * Forgets the sizes the user gave the cells and arranges them again as the mode arranges them, as in a new window:
	 * parts moved elsewhere go back to their places, the parts it created close, their editors moving into the main part,
	 * and the cells take their default shares.
	 */
	reset(): void {
		this._closeCreatedParts();
		this._sizes = {};
		this._topologyKey = undefined;
		this._baseTopologyKey = undefined;
		this._sizesKey = undefined;
		this._baseSizesKey = undefined;
		this._arranged = undefined;
		this._pendingTerminalsHeight = undefined;
		this._update();
	}

	/** The sizes the user gave the cells, per arrangement. */
	exportSizes(): ChatWindowPartSizes {
		return { ...this._sizes };
	}

	private _sashOf(e: MouseEvent): boolean {
		return isHTMLElement(e.target) && !!e.target.closest('.monaco-sash') && !!this._grid.value;
	}

	private _cellSizes(): Map<string, IViewSize> {
		const grid = this._grid.value;
		const sizes = new Map<string, IViewSize>();
		for (const cell of [ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Terminals]) {
			if (grid?.isCellVisible(cell)) {
				const { width, height } = grid.getCellSize(cell);
				sizes.set(cell, { width, height });
			}
		}
		return sizes;
	}

	/**
	 * Remembers the sizes of the cells a sash the user dragged changed, or of all after they reset one (`before` is
	 * undefined). The height of the terminals is theirs in every arrangement; the sizes of the chat and the main part are
	 * those of the arrangement, while the grid still shows it as the window arranged it.
	 */
	private _rememberUserSizes(before: Map<string, IViewSize> | undefined): void {
		const grid = this._grid.value;
		if (!grid || !this._sizesKey) {
			return;
		}
		const changed: Record<string, IViewSize> = {};
		for (const [cell, size] of this._cellSizes()) {
			const previous = before?.get(cell);
			if (!previous || previous.width !== size.width || previous.height !== size.height) {
				changed[cell] = size;
			}
		}
		if (changed[ChatWindowGridCell.Terminals]) {
			this._sizes[TERMINALS_SIZE_KEY] = { [ChatWindowGridCell.Terminals]: changed[ChatWindowGridCell.Terminals] };
		}
		const { [ChatWindowGridCell.Terminals]: _terminals, ...parts } = changed;
		if (!Object.keys(parts).length || grid.describe() !== this._arranged) {
			return;
		}
		this._sizes[this._sizesKey] = { ...this._sizes[this._sizesKey], ...parts };
		if (this._baseSizesKey && this._baseSizesKey !== this._sizesKey) {
			this._sizes[this._baseSizesKey] = { ...this._sizes[this._baseSizesKey], ...parts };
		}
	}

	/** The arrangement of a layout mode, with the terminals where they show, or at `position`, and its key. */
	private _topology(mode: ChatWindowLayoutMode, position = this._terminalPosition.get()) {
		const terminals = this._cells.terminals?.get();
		const chrome = { titleRow: !!this._titleRow, strip: !!this._strip };
		const topology = getChatWindowTopology(mode, { ...chrome, terminals: terminals ? position : undefined });
		return { terminals, position, chrome, topology, key: describeTopology(topology) };
	}

	/** Arranges the parts as the mode does, unless the grid already shows its arrangement. Returns whether it arranged them. */
	private _arrange(mode: ChatWindowLayoutMode, dimension: IViewSize): boolean {
		const { terminals, position, chrome, topology, key } = this._topology(mode);
		if (key === this._topologyKey) {
			return false;
		}
		this._topologyKey = key;
		const sizesKey = getSizesKey(key, mode);

		// While the rest of the arrangement stays, the terminals join it, move in it or leave it, as the part grid does.
		const baseKey = describeTopology(getChatWindowTopology(mode, chrome));
		const grid = this._grid.value;
		if (grid && baseKey === this._baseTopologyKey) {
			// The part grid may rebuild its grid for them, such as across the chat and the main part with the strip running past
			// them, which takes the focus from what had it, such as the chat input
			const focused = this._container.ownerDocument.activeElement;
			if (!terminals) {
				grid.removeCell(ChatWindowGridCell.Terminals);
				this._terminalsInGrid = false;
			} else if (this._terminalsInGrid) {
				grid.moveCell(ChatWindowGridCell.Terminals, getTerminalsLocation(mode, position));
				this._pendingTerminalsHeight = this._terminalsHeight();
			} else {
				const height = this._terminalsHeight();
				grid.addPart(ChatWindowGridCell.Terminals, terminals, getTerminalsLocation(mode, position), height, TERMINALS_OPTIONS);
				this._terminalsInGrid = true;
				this._terminalsFirstShowHeight = grid.isCellVisible(ChatWindowGridCell.Terminals) ? undefined : height;
			}
			this._restoreFocus(focused);
			return true;
		}
		this._baseTopologyKey = baseKey;
		this._terminalsInGrid = !!terminals;

		// The sizes of the arrangement, else those of the chat and the main part as they showed without the terminals, else
		// as they showed before the strip had a column of its own in every mode, which a version without it still reads.
		const withoutStrip = { ...chrome, strip: false };
		const legacyKeys = this._strip ? [getSizesKey(describeTopology(getChatWindowTopology(mode, withoutStrip)), mode), getSizesKey(describeTopology(getChatWindowTopology(mode, { ...withoutStrip, terminals: terminals ? position : undefined })), mode)] : [];
		const remembered: ChatWindowPartSizes[string] = {};
		for (const rememberedKey of [...legacyKeys, getSizesKey(baseKey, mode), sizesKey]) {
			Object.assign(remembered, this._sizes[rememberedKey]);
		}
		const orientation = isBranch(topology) ? topology.orientation : Orientation.HORIZONTAL;
		// The grid keeps the outer insets to the edges of the window: its cells share what is inside them.
		const insets = this._outerInsets;
		const width = Math.max(0, dimension.width - insets.left - insets.right);
		const height = Math.max(0, dimension.height - insets.top - insets.bottom);
		const root = this._serialize(topology, orientation === Orientation.HORIZONTAL ? width : height, orientation, remembered, { width, height });
		// Applied once the cells of the arrangement show or hide, such as the title row, whose room would otherwise go to them.
		this._pendingTerminalsHeight = terminals ? Math.min(height, this._terminalsHeight()) : undefined;
		const serializedRoot: ISerializedNode = { type: 'branch', data: this._withCreatedParts(root.type === 'branch' ? root.data : [root], orientation, width, height), size: orientation === Orientation.HORIZONTAL ? height : width };
		const serializedGrid: ISerializedGrid = { root: serializedRoot, orientation, width, height };
		const state = { grid: serializedGrid, hidden: [], parts: {}, created: Array.from(this._created.keys()) };
		// The parts move into the cells of the new grid, which takes the focus from what had it in them, such as the chat input
		const focused = this._container.ownerDocument.activeElement;
		const partGrid = this._grid.value = PartGrid.restore(this._container, state, id => this._contentOf(id), this._editorGroupsService);
		this._partFactoryRegistration.value = this._partFactory && partGrid.setPartFactory(this._partFactory);
		// A part dropped on the chat goes beside it: its editors would join the chat's group, whose title is the chat's own.
		// So does a part dropped on the terminals, whose groups stay locked to terminals.
		partGrid.setMergeAllowed((_id, targetId) => targetId !== ChatWindowGridCell.Chat && targetId !== ChatWindowGridCell.Terminals);
		// The chat showing only its input holds a part beside it in its row to the height of its input: a part dropped at its
		// left or right goes to that edge of the window
		partGrid.setSplitAllowed((targetId, direction) => targetId !== ChatWindowGridCell.Chat || !this._cells.chatInputOnly?.get() || direction === Direction.Up || direction === Direction.Down);
		// Terminals do not lay out while cards make way: their processes would resize, also for a drag that is cancelled
		// The chat showing only its input does not move: its edge is the sash's, which shows its conversation
		this._movableRegistration.value = partGrid.setMovable(id => id !== ChatWindowGridCell.Chat || !this._cells.chatInputOnly?.get());
		partGrid.setPreviewLayoutAllowed((id, part) => id !== ChatWindowGridCell.Terminals && !part.groups.some(group => group.activeEditor?.typeId === TERMINAL_EDITOR_TYPE_ID));
		// The title row spans the top of the window, whatever moves, as the first row of the grid: the window's controls
		// are in it, and no part's title is under them.
		if (this._titleRow) {
			partGrid.setPinnedTopView(ChatWindowGridCell.TitleRow);
		}
		this._terminalsFirstShowHeight = undefined;
		this._gridListener.value = combinedDisposable(partGrid.onDidChangeArrangement(() => this._updateFromGrid()), partGrid.onDidChangePartEmpty(e => {
			const height = this._terminalsFirstShowHeight;
			if (e.id === ChatWindowGridCell.Terminals && !e.empty && height !== undefined && partGrid.isCellVisible(ChatWindowGridCell.Terminals)) {
				this._terminalsFirstShowHeight = undefined;
				this._resizeTerminals(partGrid, height);
			}
			this._updateFromGrid();
		}));
		partGrid.setGap(this._gap.get());
		partGrid.setOuterInsets(insets);
		partGrid.layout(dimension.width, dimension.height);
		this._restoreFocus(focused);
		return true;
	}

	/** Gives the focus back to `focused`, an element of the window that lost it as the grid arranged its cells. */
	private _restoreFocus(focused: Element | null): void {
		if (isHTMLElement(focused) && focused.isConnected && this._container.contains(focused) && this._container.ownerDocument.activeElement !== focused) {
			focused.focus();
		}
	}

	/**
	 * The cells of the root of an arrangement with the parts the grid created after them, at the end of the window
	 * beside the arrangement of the layout mode: under the title row that spans the window, beside what is under it. They
	 * take their room from the main part, or else the chat, so that the other parts, such as the terminals, keep theirs.
	 */
	private _withCreatedParts(rootCells: readonly ISerializedNode[], orientation: Orientation, width: number, height: number): ISerializedNode[] {
		if (!this._created.size) {
			return [...rootCells];
		}
		const [first, content] = rootCells;
		const titleRowFirst = first?.type === 'leaf' && (first.data as { id: string }).id === ChatWindowGridCell.TitleRow;
		if (titleRowFirst && rootCells.length === 2 && content.type === 'branch') {
			return [first, { ...content, data: this._addCreatedParts(content.data, orientation === Orientation.HORIZONTAL ? height : width) }];
		}
		return this._addCreatedParts(rootCells, orientation === Orientation.HORIZONTAL ? width : height);
	}

	private _addCreatedParts(cells: readonly ISerializedNode[], extent: number): ISerializedNode[] {
		const contains = (node: ISerializedNode, id: string): boolean => node.type === 'leaf' ? (node.data as { id: string }).id === id : node.data.some(child => contains(child, id));
		const sizeOf = (node: ISerializedNode) => node.size ?? 0;
		const donor = [ChatWindowGridCell.Main, ChatWindowGridCell.Chat]
			.map(id => cells.find(cell => contains(cell, id)))
			.find(cell => cell && sizeOf(cell) > 0);
		const share = Math.round((donor ? sizeOf(donor) : extent) / (this._created.size + (donor ? 1 : 2)));
		const created: ISerializedNode[] = Array.from(this._created.keys(), id => ({ type: 'leaf', data: { id }, size: share }));
		const rest = donor ? cells.map(cell => cell === donor ? { ...cell, size: sizeOf(cell) - share * created.length } : cell) : cells;
		// Before the strip, which stays at the right edge of the window
		const last = rest.at(-1);
		const strip = last?.type === 'leaf' && (last.data as { id: string }).id === ChatWindowGridCell.Strip ? [last] : [];
		return [...rest.slice(0, rest.length - strip.length), ...created, ...strip];
	}

	/** The room the grid keeps to the edges of the window, such as the main window's outer insets. */
	setOuterInsets(insets: IGridEdgeInsets): void {
		this._outerInsets = insets;
		this._grid.value?.setOuterInsets(insets);
		this._layoutOnceStylesApply();
	}

	/**
	 * Lays the grid out again on the next frame: the gap and the insets change with the density, whose styles, such as
	 * the frames of the cards that their insets leave room for, may apply only after them.
	 */
	private _layoutOnceStylesApply(): void {
		this._styleLayout.value = scheduleAtNextAnimationFrame(getWindow(this._container), () => {
			// The grid reads the frames of the cards only when asked to, such as once the styles of the density applied.
			this._grid.value?.updateLook();
			if (this._dimension) {
				this.layout(this._dimension.width, this._dimension.height);
			}
		});
	}

	/** The height the terminals take in every arrangement: the height the user last gave them, else their share of the window. */
	private _terminalsHeight(): number {
		const insets = this._outerInsets;
		const total = Math.max(0, (this._dimension?.height ?? 0) - insets.top - insets.bottom);
		return this._sizes[TERMINALS_SIZE_KEY]?.[ChatWindowGridCell.Terminals]?.height ?? Math.round(total * TERMINALS_SHARE);
	}

	private _contentOf(id: string): PartGridCellContent {
		const created = this._created.get(id);
		if (created) {
			return { part: created };
		}
		switch (id) {
			// The main part shows as its mode says, also without editors, as it did: the terminals show only with terminals.
			case ChatWindowGridCell.Main: return { part: this._cells.main, options: { showWhileEmpty: true } };
			case ChatWindowGridCell.Chat: return { part: this._cells.chat };
			// Above the cards, as the title bar of a window is.
			case ChatWindowGridCell.TitleRow: return { view: this._titleRow!, options: { keepsNoGap: true } };
			case ChatWindowGridCell.Terminals: return { part: this._cells.terminals!.get()!, options: TERMINALS_OPTIONS };
			// Right beside the cards, without a gap of the grid's: as the main window's column, it keeps the gap to them itself.
			default: return { view: this._strip!, options: { edgeChrome: Direction.Right, keepsNoGap: true } };
		}
	}

	private _holdsMain(node: TopologyNode): boolean {
		return isBranch(node) ? node.children.some(child => this._holdsMain(child)) : node.cell === ChatWindowGridCell.Main;
	}

	/** The least room `node` needs along the width, or else the height. */
	private _minimumOf(node: TopologyNode, horizontal: boolean): number {
		if (isBranch(node)) {
			const minimums = node.children.map(child => this._minimumOf(child, horizontal));
			return (node.orientation === Orientation.HORIZONTAL) === horizontal ? minimums.reduce((sum, minimum) => sum + minimum, 0) : Math.max(0, ...minimums);
		}
		switch (node.cell) {
			case ChatWindowGridCell.Main: return horizontal ? this._cells.main.minimumWidth : this._cells.main.minimumHeight;
			case ChatWindowGridCell.Chat: return horizontal ? this._cells.chat.minimumWidth : this._cells.chat.minimumHeight;
			case ChatWindowGridCell.Terminals: {
				const terminals = this._cells.terminals?.get();
				return terminals ? (horizontal ? terminals.minimumWidth : terminals.minimumHeight) : 0;
			}
			case ChatWindowGridCell.TitleRow: return horizontal ? 0 : this._titleRow?.minimumHeight ?? 0;
			default: return horizontal ? this._strip?.minimumWidth ?? 0 : 0;
		}
	}

	/** The size the user gave the part `node` is, or holds. */
	private _rememberedOf(node: TopologyNode, remembered: Record<string, { readonly width: number; readonly height: number }>): { readonly width: number; readonly height: number } | undefined {
		if (!isBranch(node)) {
			return remembered[node.cell];
		}
		for (const child of node.children) {
			const size = this._rememberedOf(child, remembered);
			if (size) {
				return size;
			}
		}
		return undefined;
	}

	/** Serializes `node` as `size` along `orientation`, the orientation of its parent, with the room it has in `box`. */
	private _serialize(node: TopologyNode, size: number, orientation: Orientation, remembered: Record<string, { readonly width: number; readonly height: number }>, box: IViewSize): ISerializedNode {
		if (!isBranch(node)) {
			return { type: 'leaf', data: { id: node.cell }, size };
		}
		const horizontal = node.orientation === Orientation.HORIZONTAL;
		const total = horizontal ? box.width : box.height;
		const childBox = (childSize: number): IViewSize => horizontal ? { width: childSize, height: box.height } : { width: box.width, height: childSize };
		const sizes = this._divide(node.children, total, node.orientation, remembered);
		return { type: 'branch', size, data: node.children.map((child, index) => this._serialize(child, sizes[index], node.orientation, remembered, childBox(sizes[index]))) };
	}

	/** Divides `total` among `children` along `orientation`: chrome by its own size, cells as remembered, the rest by share. */
	private _divide(children: readonly TopologyNode[], total: number, orientation: Orientation, remembered: Record<string, { readonly width: number; readonly height: number }>): number[] {
		const horizontal = orientation === Orientation.HORIZONTAL;
		const fixed = children.map(child => {
			if (isBranch(child)) {
				return undefined;
			}
			if (child.cell === ChatWindowGridCell.TitleRow) {
				return horizontal ? undefined : this._titleRow?.minimumHeight ?? 0;
			}
			if (child.cell === ChatWindowGridCell.Strip) {
				return horizontal ? this._strip?.minimumWidth ?? 0 : undefined;
			}
			if (child.cell === ChatWindowGridCell.Terminals) {
				return horizontal ? undefined : Math.min(total, this._terminalsHeight());
			}
			return undefined;
		});
		// The size the user gave a part is kept; the last flexible child along the branch takes what is left.
		const flexible = children.map((_, index) => index).filter(index => fixed[index] === undefined);
		// The main part takes the rest, as the editor area does: the chat may be only as tall as its input.
		const lastFlexible = flexible.find(index => this._holdsMain(children[index])) ?? flexible.at(-1);
		const minimums = children.map((child, index) => fixed[index] ?? this._minimumOf(child, horizontal));
		const sizes = children.map((child, index) => {
			if (fixed[index] !== undefined || index === lastFlexible) {
				return fixed[index];
			}
			const rememberedSize = this._rememberedOf(child, remembered);
			const size = rememberedSize && (horizontal ? rememberedSize.width : rememberedSize.height);
			// A size that leaves the others less than they need, such as one taken while they were hidden, gives way to the shares.
			const others = minimums.reduce((sum, minimum, other) => other === index ? sum : sum + minimum, 0);
			return size !== undefined && size + others <= total ? size : undefined;
		});
		const room = total - sizes.reduce<number>((sum, value) => sum + (value ?? 0), 0);
		const open = children.map((child, index) => ({ child, index })).filter(({ index }) => sizes[index] === undefined);
		const shares = open.reduce((sum, { child }) => sum + getShare(child, orientation), 0);
		for (const { child, index } of open) {
			const share = shares ? getShare(child, orientation) / shares : 1 / open.length;
			sizes[index] = Math.max(0, Math.round(room * share));
		}
		// What rounding leaves goes to the last of the cells that share the room, else to the one that takes the rest.
		const remainder = open.at(-1)?.index ?? lastFlexible;
		if (remainder !== undefined) {
			const leftover = total - sizes.reduce<number>((sum, value) => sum + (value ?? 0), 0);
			sizes[remainder] = Math.max(0, (sizes[remainder] ?? 0) + leftover);
		}
		return sizes.map(value => value ?? 0);
	}
}
