/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { Direction, ISerializedBranchNode, ISerializedGrid, ISerializedNode, IViewSize, Orientation, orthogonal } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IPartGridPartFactory, IPartGridPartOptions, IPartGridView, PartGrid, PartGridCellContent, PartGridLocation } from '../../../browser/parts/partGrid/partGrid.js';
import { IGridEdgeInsets, NO_GRID_EDGE_INSETS } from '../../../browser/parts/partGrid/partGridGap.js';
import { IContentPart, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout, ChatWindowTerminalPosition, isChatWindowSplitLayout } from '../common/chatWindowLayout.js';
import { ChatWindowArrangementNode, ChatWindowPartSizes, IChatWindowArrangement } from '../common/chatWindowState.js';
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
	/**
	 * How the chat and the main part are arranged while both show, or will next show: the one a layout mode hides hides
	 * in that arrangement. Without it, the arrangement of the last layout mode that showed both.
	 */
	readonly splitLayout?: IObservable<ChatWindowSplitLayout>;
	/** How the user last arranged the parts, as {@link ChatWindowGrid.exportArrangement} exports it: the grid shows it first, if it can. */
	readonly arrangement?: IChatWindowArrangement;
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

/**
 * How a chat window arranges its cells while the chat and the main part show as `splitLayout`, below the title row,
 * which is across the top of the window while it shows, with the strip in a column of its own at the right, as the main
 * window's Session Activity Bar column:
 * - side by side: the chat beside the main part; the terminals below the chat, below the main part, or across the bottom
 *   of the chat and the main part, as `cells.terminals` says, the strip running past them;
 * - stacked: the main part above the chat; the terminals across the bottom of the chat and the main part, the strip
 *   running past them.
 * A layout mode that shows only the chat or only the main part hides the other in the arrangement, so that showing it
 * again is not a move.
 */
export function getChatWindowTopology(splitLayout: ChatWindowSplitLayout, cells: { readonly titleRow: boolean; readonly strip: boolean; readonly terminals?: ChatWindowTerminalPosition }): TopologyNode {
	const titleRow: TopologyNode[] = cells.titleRow ? [{ cell: ChatWindowGridCell.TitleRow }] : [];
	const strip: TopologyNode[] = cells.strip ? [{ cell: ChatWindowGridCell.Strip }] : [];
	const terminals: TopologyNode[] = cells.terminals !== undefined ? [{ cell: ChatWindowGridCell.Terminals }] : [];
	const chat: TopologyNode = { cell: ChatWindowGridCell.Chat };
	const main: TopologyNode = { cell: ChatWindowGridCell.Main };
	if (splitLayout === ChatWindowLayoutMode.SideBySide) {
		let parts: TopologyNode;
		switch (cells.terminals) {
			case undefined: parts = branch(Orientation.HORIZONTAL, chat, main); break;
			case ChatWindowTerminalPosition.UnderChat: parts = branch(Orientation.HORIZONTAL, branch(Orientation.VERTICAL, chat, ...terminals), main); break;
			case ChatWindowTerminalPosition.UnderEditor: parts = branch(Orientation.HORIZONTAL, chat, branch(Orientation.VERTICAL, main, ...terminals)); break;
			default: parts = branch(Orientation.VERTICAL, branch(Orientation.HORIZONTAL, chat, main), ...terminals); break;
		}
		return branch(Orientation.VERTICAL, ...titleRow, branch(Orientation.HORIZONTAL, parts, ...strip));
	}
	return branch(Orientation.VERTICAL, ...titleRow, branch(Orientation.HORIZONTAL, branch(Orientation.VERTICAL, main, chat, ...terminals), ...strip));
}

/** Where the terminals go in the arrangement of `splitLayout`, beside a cell or at the bottom edge, as {@link getChatWindowTopology} places them. */
function getTerminalsLocation(splitLayout: ChatWindowSplitLayout, position: ChatWindowTerminalPosition): PartGridLocation {
	if (splitLayout === ChatWindowLayoutMode.Stacked) {
		// Across the bottom, wherever the user moved the chat and the main part, the strip running past them
		return { edge: Direction.Down };
	}
	switch (position) {
		case ChatWindowTerminalPosition.UnderChat: return { reference: ChatWindowGridCell.Chat, direction: Direction.Down };
		case ChatWindowTerminalPosition.UnderEditor: return { reference: ChatWindowGridCell.Main, direction: Direction.Down };
		// Across the chat and the main part, the strip running past them
		default: return { edge: Direction.Down };
	}
}

/** The cell `mode` hides, the chat or the main part, if it hides one. */
function getHiddenCell(mode: ChatWindowLayoutMode): ChatWindowGridCell | undefined {
	switch (mode) {
		case ChatWindowLayoutMode.ChatOnly: return ChatWindowGridCell.Main;
		case ChatWindowLayoutMode.EditorOnly: return ChatWindowGridCell.Chat;
		default: return undefined;
	}
}

function describeTopology(node: TopologyNode): string {
	return isBranch(node) ? `${node.orientation === Orientation.HORIZONTAL ? 'row' : 'column'}(${node.children.map(describeTopology).join(',')})` : node.cell;
}

/** The cells of `node`, without their sizes, as the part grid serializes them. */
function serializeTopology(node: TopologyNode): ISerializedNode {
	return isBranch(node) ? { type: 'branch', data: node.children.map(serializeTopology), size: 0 } : { type: 'leaf', data: { id: node.cell }, size: 0 };
}

/** What {@link PartGrid.describe} says for `cells`, the children of a branch along `orientation`. */
function describeSerialized(cells: readonly ISerializedNode[], orientation: Orientation): string {
	const describe = (node: ISerializedNode, along: Orientation): string => node.type === 'leaf'
		? (node.data as { id: string }).id
		: `${along === Orientation.HORIZONTAL ? 'row' : 'column'}(${node.data.map(child => describe(child, orthogonal(along))).join(', ')})`;
	return cells.length === 1 ? describe(cells[0], orientation) : describe({ type: 'branch', data: [...cells], size: 0 }, orientation);
}

/**
 * The cells of `node` that `keep` keeps, to put in place of `node` in the branch around it: a branch with one cell left is
 * that cell, and one with a single branch left gives that branch's cells, which are along the branch around it. The room
 * of the cells dropped goes to the cells beside them, in proportion.
 */
function keepCells(node: ISerializedNode, keep: (id: string) => boolean): ISerializedNode[] {
	if (node.type === 'leaf') {
		return keep((node.data as { id: string }).id) ? [node] : [];
	}
	const kept = node.data.flatMap(child => keepCells(child, keep));
	if (!kept.length) {
		return [];
	}
	if (kept.length === 1) {
		const [only] = kept;
		return only.type === 'branch' ? only.data : [{ ...only, size: node.size }];
	}
	// A hidden cell's size is the one it shows at again, not room it takes, and chrome keeps its size: only the other cells
	// that show share the room
	const sharing = (child: ISerializedNode) => child.visible !== false && !isChrome(child);
	const sharedSize = (cells: readonly ISerializedNode[]) => cells.reduce((sum, child) => sharing(child) ? sum + child.size : sum, 0);
	const total = sharedSize(node.data);
	const left = sharedSize(kept);
	return [{ ...node, data: left > 0 ? kept.map(child => sharing(child) ? { ...child, size: Math.round(child.size * total / left) } : child) : kept }];
}

/** What {@link PartGrid.describe} says for the cells of `grid` that `persistent` keeps, such as without the terminals. */
function describeParts(grid: ISerializedGrid | undefined, persistent: (id: string) => boolean): string | undefined {
	const parts = grid && withCellsOf(grid, persistent);
	return parts && describeSerialized(parts.root.type === 'branch' ? parts.root.data : [parts.root], parts.orientation);
}

/** `grid` with only the cells `keep` keeps, or undefined without any left. */
function withCellsOf(grid: ISerializedGrid, keep: (id: string) => boolean): ISerializedGrid | undefined {
	const cells = keepCells(grid.root, keep);
	if (cells.length > 1) {
		// The root kept a single branch: its cells are along the other orientation
		const orientation = orthogonal(grid.orientation);
		return { ...grid, orientation, root: { type: 'branch', data: cells, size: orientation === Orientation.HORIZONTAL ? grid.height : grid.width } };
	}
	const [root] = cells;
	if (!root) {
		return undefined;
	}
	return { ...grid, root: root.type === 'branch' ? root : { type: 'branch', data: [root], size: grid.root.size } };
}

function collectCellIds(node: ISerializedNode | ChatWindowArrangementNode): string[] {
	return node.type === 'leaf' ? [(node.data as { id: string }).id] : (node.data as readonly (ISerializedNode | ChatWindowArrangementNode)[]).flatMap(collectCellIds);
}

/**
 * `shown`, a grid with the cell `id` hidden, with the row or column it hides in as it was in `before`, as both showed: the
 * cells beside it took its room meanwhile. It hides in the row or column of its cell, or, where nothing else there shows,
 * such as with the terminals while they have nothing to show, in the one around that. The rows and columns elsewhere
 * stay as they are now, with the sizes the user gave them, and so do the cells without any cell `persistent` keeps,
 * such as the terminals, which may have joined or left meanwhile and keep their size in it. Where those do not fit,
 * the cells share the room as they would be, along the dimension `constrained` says: such sizes are not the ones the user
 * gave them. So are sizes below the least sizes of the cells, by `minimum`, which the grid holds them to, such as where
 * the terminals leave less room than the parts need.
 * Undefined where the cell's row or column cannot be told from `before`. Where that row or column is new, such as one the
 * terminals joined it in, it stays as it is.
 */
function withLineSharesOf(shown: ISerializedGrid, id: string, before: ISerializedGrid, persistent: (id: string) => boolean, terminalsHeight: number | undefined, minimum: (id: string) => IViewSize): { readonly grid: ISerializedGrid; readonly constrained: 'width' | 'height' | undefined } | undefined {
	const path = pathTo(shown.root, id);
	if (!path) {
		return undefined;
	}
	let hiddenIndex = path.length - 1;
	while (hiddenIndex > 1 && (path[hiddenIndex - 1] as ISerializedBranchNode).data.every(child => child.visible === false)) {
		hiddenIndex--;
	}
	const line = path[hiddenIndex - 1] as ISerializedBranchNode | undefined;
	const hiddenNode = path[hiddenIndex];
	if (!line) {
		return undefined;
	}
	const orientation = (hiddenIndex - 1) % 2 === 0 ? shown.orientation : orthogonal(shown.orientation);
	// The cells that share the room as both show: the hidden one, and those that show with a cell the arrangement keeps.
	// Another hidden cell, chrome, and cells without any such cell, such as the terminals, keep their size.
	const partsOf = (node: ISerializedNode) => collectCellIds(node).filter(persistent);
	const sharing = (child: ISerializedNode) => child === hiddenNode || (child.visible !== false && !isChrome(child) && partsOf(child).length > 0);
	// Alone among them, such as above the terminals, the hidden cell takes all of it: its row or column may be new
	const alone = line.data.filter(sharing).length === 1;
	const previousLine = alone ? undefined : findLineWith(before.root, before.orientation, orientation, line.data.filter(sharing).map(partsOf).filter(parts => parts.length > 0));
	if (!alone && !previousLine) {
		return undefined;
	}
	// The cells that keep their size, the terminals in a column their height, as they took the hidden cell's room meanwhile
	const kept = line.data.map(child => child.visible === false || sharing(child) ? undefined
		: orientation === Orientation.VERTICAL && terminalsHeight !== undefined && collectCellIds(child).every(cell => cell === ChatWindowGridCell.Terminals) ? terminalsHeight : child.size);
	const extent = line.data.reduce((sum, child) => child.visible === false ? sum : sum + child.size, 0);
	let room = extent - kept.reduce<number>((sum, size) => sum + (size ?? 0), 0);
	const previous = line.data.map(child => {
		if (!sharing(child)) {
			return 0;
		}
		const parts = partsOf(child);
		return alone ? (child.size || 1) : previousLine?.find(candidate => collectCellIds(candidate).some(cell => parts.includes(cell)))?.size;
	});
	const total = previous.reduce<number>((sum, size) => sum + (size ?? 0), 0);
	if (!total || previous.some(size => size === undefined)) {
		return undefined;
	}
	// Where the cells that keep their size do not fit, such as terminals taller than the window now is, they all share it
	// as they would be: their sizes stay what they are, and how they show as both show is still known
	const dimension = orientation === Orientation.VERTICAL ? 'height' : 'width';
	const scaled = room <= 0;
	if (scaled) {
		// Chrome keeps its size, which its view holds it to
		const chrome = line.data.reduce((sum, child, index) => kept[index] !== undefined && isChrome(child) ? sum + kept[index]! : sum, 0);
		const keptTotal = kept.reduce<number>((sum, size, index) => size === undefined || isChrome(line.data[index]) ? sum : sum + size, 0);
		const scale = (extent - chrome) / (keptTotal + total);
		kept.forEach((size, index) => kept[index] = size === undefined || isChrome(line.data[index]) ? size : Math.round(size * scale));
		room = extent - kept.reduce<number>((sum, size) => sum + (size ?? 0), 0);
		if (room <= 0) {
			return undefined;
		}
	}
	const showCell = (node: ISerializedNode): ISerializedNode => node.type === 'leaf'
		? ((node.data as { id: string }).id === id ? { ...node, visible: undefined } : node)
		: { ...node, data: node.data.map(showCell) };
	const cells = line.data.map((child, index) => sharing(child) ? { ...(child === hiddenNode ? showCell(child) : child), size: Math.round(previous[index]! * room / total), visible: undefined }
		: kept[index] !== undefined ? { ...child, size: kept[index]! } : child);
	// The least room a cell of the row or column needs along it: of a row or column across it, that of its largest cell
	const minimumOf = (node: ISerializedNode, nodeOrientation: Orientation): number => {
		if (node.visible === false) {
			return 0;
		}
		if (node.type === 'leaf') {
			return minimum((node.data as { id: string }).id)[dimension];
		}
		const minimums = node.data.map(child => minimumOf(child, orthogonal(nodeOrientation)));
		return nodeOrientation === orientation ? minimums.reduce((sum, size) => sum + size, 0) : Math.max(0, ...minimums);
	};
	const constrained = scaled || cells.some((cell, index) => sharing(line.data[index]) && cell.size < minimumOf(cell, orthogonal(orientation))) ? dimension : undefined;
	const replaceLine = (node: ISerializedNode): ISerializedNode => node.type === 'leaf' ? node
		: node === line ? { ...node, data: cells }
			: { ...node, data: node.data.map(replaceLine) };
	return { grid: { ...shown, root: replaceLine(shown.root) }, constrained };
}

/** Whether `node` is only chrome, such as the strip, which keeps its size rather than sharing the room of its row. */
function isChrome(node: ISerializedNode): boolean {
	return collectCellIds(node).every(id => id === ChatWindowGridCell.Strip || id === ChatWindowGridCell.TitleRow);
}

/** The nodes from `node` down to the cell `id`, or undefined without it. */
function pathTo(node: ISerializedNode, id: string): ISerializedNode[] | undefined {
	if (node.type === 'leaf') {
		return (node.data as { id: string }).id === id ? [node] : undefined;
	}
	for (const child of node.data) {
		const path = pathTo(child, id);
		if (path) {
			return [node, ...path];
		}
	}
	return undefined;
}

/**
 * The cells of the deepest row or column along `orientation` under `node`, a branch along `nodeOrientation`, in which each
 * of `parts`, the cells of a row or column, is in a cell of its own.
 */
function findLineWith(node: ISerializedNode, nodeOrientation: Orientation, orientation: Orientation, parts: readonly (readonly string[])[]): readonly ISerializedNode[] | undefined {
	if (node.type === 'leaf') {
		return undefined;
	}
	for (const child of node.data) {
		const deeper = findLineWith(child, orthogonal(nodeOrientation), orientation, parts);
		if (deeper) {
			return deeper;
		}
	}
	const holders = parts.map(cells => node.data.findIndex(child => collectCellIds(child).some(cell => cells.includes(cell))));
	return nodeOrientation === orientation && holders.every(holder => holder >= 0) && new Set(holders).size === holders.length ? node.data : undefined;
}

/** The size of each cell of `grid`, as its rows and columns divide its room. */
function cellSizesOf(grid: ISerializedGrid): Map<string, IViewSize> {
	const sizes = new Map<string, IViewSize>();
	const visit = (node: ISerializedNode, orientation: Orientation, width: number, height: number) => {
		if (node.type === 'leaf') {
			sizes.set((node.data as { id: string }).id, { width, height });
			return;
		}
		for (const child of node.data) {
			visit(child, orthogonal(orientation), orientation === Orientation.HORIZONTAL ? child.size : width, orientation === Orientation.HORIZONTAL ? height : child.size);
		}
	};
	visit(grid.root, grid.orientation, grid.width, grid.height);
	return sizes;
}

/** The row or column the cell `id` is in, under `node`, a branch along `orientation`. */
function findLineOf(node: ISerializedNode, orientation: Orientation, id: string): { readonly children: readonly ISerializedNode[]; readonly orientation: Orientation } | undefined {
	if (node.type === 'leaf') {
		return undefined;
	}
	if (node.data.some(child => child.type === 'leaf' && (child.data as { id: string }).id === id)) {
		return { children: node.data, orientation };
	}
	for (const child of node.data) {
		const line = findLineOf(child, orthogonal(orientation), id);
		if (line) {
			return line;
		}
	}
	return undefined;
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
 * part that holds its terminals, arranged for how the chat and the main part show together, side by side or stacked. A
 * layout mode that shows only one of them hides the other in that arrangement, so that the parts the user moved, such
 * as the main part to the left of the chat, stay where they are as either hides and shows again; only arranging them
 * together the other way, or a reset, arranges them anew. The sizes the user gives its cells are kept per arrangement,
 * so that an arrangement shows with the sizes it had, and those and the arrangement the user gave the parts can be
 * exported to come back for the chat after a reload.
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
	/**
	 * The key the sizes of the arrangement are remembered under: as the chat and the main part show together, also while
	 * one of them hides, which leaves the other its room.
	 */
	private _sizesKey: string | undefined;
	/** The key the sizes of the chat and the main part are also remembered under, without the terminals: they come back to it after a restart, for example, until the terminals are restored. */
	private _baseSizesKey: string | undefined;
	/** The height the terminals take when they first show: they join the grid empty, until their first terminal shows in them. */
	private _terminalsFirstShowHeight: number | undefined;
	/**
	 * The grid restored from the arrangement the user gave the parts, as it shows until the terminals first show in it:
	 * the parts beside them then keep the shares they have in it, rather than the last of them giving the terminals its
	 * room. Only once: later, the terminals show among the sizes the parts have then.
	 */
	private _beforeTerminalsShow: ISerializedGrid | undefined;
	/** The key of the arrangement without the terminals: while it stays, the terminals join or move rather than rebuild. */
	private _baseTopologyKey: string | undefined;
	private _terminalsInGrid = false;
	private _dimension: IViewSize | undefined;
	/** The height the terminals had by default in the window as it was, which they take back as it grows again, if squeezed. */
	private _lastTerminalsHeight: number | undefined;
	private _outerInsets: IGridEdgeInsets = NO_GRID_EDGE_INSETS;
	private _sizes: ChatWindowPartSizes = {};
	/** The arrangement of the part grid as the window arranged it: sizes are remembered for it only while the grid still shows it. */
	private _arranged: string | undefined;
	/** The layout mode the grid was last arranged for. */
	private _arrangedMode: ChatWindowLayoutMode | undefined;
	/** How the chat and the main part were arranged together when the grid was last arranged, which they hide in. */
	private _arrangedSplitLayout: ChatWindowSplitLayout | undefined;
	/** The arrangement the user gave the parts before, which the grid shows first for its split layout; see {@link exportArrangement}. */
	private _restoredArrangement: IChatWindowArrangement | undefined;
	/** The arrangement the grid last exported, or restored: see {@link exportArrangement}. */
	private _exportedArrangement: IChatWindowArrangement | undefined;
	/**
	 * What the grid showed, and its sizes, before the layout mode hid the chat or the main part, until it shows both again:
	 * its shape without the terminals, which may join or leave meanwhile, and the height the terminals take as it does.
	 */
	private _beforeHide: { grid: ISerializedGrid | undefined; created: ReadonlySet<string>; terminalsHeight: number | undefined } | undefined;
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
		this._restoredArrangement = _cells.arrangement;
		this._exportedArrangement = _cells.arrangement;
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
			_cells.splitLayout?.read(reader);
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
				this._updateBeforeTerminalsShow();
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
		// A sash reset, by a double click, is remembered as a drag is: the sizes before it are read as the sash takes it
		let beforeReset: Map<string, IViewSize> | undefined;
		this._register(addDisposableListener(_container, EventType.DBLCLICK, e => {
			beforeReset = this._sashOf(e) ? this._cellSizes() : undefined;
		}, true));
		this._register(addDisposableListener(_container, EventType.DBLCLICK, e => {
			if (this._sashOf(e) && beforeReset) {
				this._rememberUserSizes(beforeReset);
				this._updateBeforeTerminalsShow();
			}
			beforeReset = undefined;
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
		if (closing) {
			// What the user arranged, while the parts are still in the grid: they leave it as the window closes
			this.exportArrangement();
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
		const previous = this._dimension;
		const first = !previous;
		this._rememberTerminalsHeight(previous);
		this._dimension = { width, height };
		if (first) {
			// Arranged once the window has its size, so that the parts take their shares of it.
			this._update();
		} else {
			// The parts keep their shares of the window as it is resized, and the terminals their height (see `_contentOf`)
			const grid = this._grid.value;
			grid?.layout(width, height);
			// Squeezed where the window had too little room, such as as a part showed in a short one: they take the height the
			// user gave them, else the one they had in the larger window, back as it grows taller, as far as the others leave
			// room. Not otherwise, as a part dropped at an edge of the window shrinks them on purpose, nor mid-drag, which
			// saves the height it ends at.
			const given = this._sizes[TERMINALS_SIZE_KEY]?.[ChatWindowGridCell.Terminals]?.height;
			const preferred = given ?? this._lastTerminalsHeight;
			if (grid && preferred !== undefined && !this._resizing.get()) {
				if (height > previous.height && grid.isCellVisible(ChatWindowGridCell.Terminals) && grid.getCellSize(ChatWindowGridCell.Terminals).height < preferred && this._isInColumn(grid, ChatWindowGridCell.Terminals)) {
					this._recoverTerminalsHeight(grid, preferred);
				}
				// The height a hidden part restores them to was squeezed too, if the window had too little room when it hid
				if (this._beforeHide?.terminalsHeight !== undefined && this._beforeHide.terminalsHeight < preferred) {
					this._beforeHide.terminalsHeight = preferred;
				}
			}
		}
	}

	/**
	 * Remembers the height the terminals have by default in the window as it was, as far as they have it: a window too
	 * short for it squeezes them, and they take it back as the window grows (see `layout`). Forgotten while they are hidden.
	 */
	private _rememberTerminalsHeight(dimension: IViewSize | undefined): void {
		const grid = this._grid.value;
		if (!grid || !dimension || !grid.isCellVisible(ChatWindowGridCell.Terminals)) {
			this._lastTerminalsHeight = undefined;
		} else if (this._sizes[TERMINALS_SIZE_KEY]?.[ChatWindowGridCell.Terminals]?.height === undefined && !this._resizing.get()) {
			this._lastTerminalsHeight = Math.max(this._lastTerminalsHeight ?? 0, Math.min(grid.getCellSize(ChatWindowGridCell.Terminals).height, this._defaultTerminalsHeight(dimension)));
		}
	}

	/** Whether `cell` is in a column, so that its height is its own, not that of a row it is in. */
	private _isInColumn(grid: PartGrid, cell: string): boolean {
		const current = grid.serializeGrid();
		return !!current && findLineOf(current.root, current.orientation, cell)?.orientation === Orientation.VERTICAL;
	}

	/** Gives the terminals `height`, taking it from the parts above them in proportion to their heights, not from the last. */
	private _recoverTerminalsHeight(grid: PartGrid, height: number): void {
		const current = grid.serializeGrid();
		const line = current && findLineOf(current.root, current.orientation, ChatWindowGridCell.Terminals);
		// A row of parts beside them is one sibling, sized by any part it has: its height is the row's. Where a sibling
		// has deeper rows or columns, no part tells its height, so the room is taken as the grid takes it
		const visibleChildren = (line?.children ?? [])
			.filter(child => child.visible !== false && !(child.type === 'leaf' && (child.data as { id: string }).id === ChatWindowGridCell.Terminals));
		const isFlat = (child: ISerializedNode) => child.type === 'leaf' || (child.data as readonly ISerializedNode[]).every(part => part.type === 'leaf');
		const representatives = visibleChildren.map(child => isFlat(child) ? collectCellIds(child).find(id => grid.isCellVisible(id)) : undefined);
		const siblings = representatives.every(id => id !== undefined)
			? representatives.map(id => ({ id: id!, height: grid.getCellSize(id!).height }))
			: [];
		const total = siblings.reduce((sum, sibling) => sum + sibling.height, 0);
		const taken = height - grid.getCellSize(ChatWindowGridCell.Terminals).height;
		this._resizeTerminals(grid, height);
		if (total > taken) {
			for (const sibling of siblings.slice(0, -1)) {
				grid.resizeCell(sibling.id, { height: sibling.height - Math.round(taken * sibling.height / total) });
			}
			// Shrinking a part hands its room to the next one, which may be the terminals.
			this._resizeTerminals(grid, height);
		}
	}

	private _resizeTerminals(grid: PartGrid, height: number): void {
		// Only the height: resizing the width too would save the shares of the parts beside the terminals again, rounded
		grid.resizeCell(ChatWindowGridCell.Terminals, { height });
	}

	/**
	 * Whether `id` is a cell of the arrangement the user gives the parts: not the terminals, nor a part the grid created
	 * now or as a part hid, which come and go meanwhile.
	 */
	private _isPersistentCell(id: string): boolean {
		return id !== ChatWindowGridCell.Terminals && !this._created.has(id) && !this._beforeHide?.created.has(id);
	}

	/** Whether `shown` arranges the cells of the arrangement the user gives the parts as they were before a part hid. */
	private _showsPartsAsBeforeHide(shown: ISerializedGrid | undefined): boolean {
		const persistent = (id: string) => this._isPersistentCell(id);
		const before = describeParts(this._beforeHide?.grid, persistent);
		return before !== undefined && before === describeParts(shown, persistent);
	}

	/**
	 * Gives the cells of the row or column of `cell` the shares they had in `before`, in the room they have now, the
	 * terminals among them keeping `terminalsHeight` in a column, else their own height: they may have joined since. Each
	 * cell takes its size from the last of them, so sizing all but the last, in order, gives each its own.
	 */
	private _restoreLineSizes(grid: PartGrid, cell: string, before: ISerializedGrid, terminalsHeight: number | undefined): void {
		const current = grid.serializeGrid();
		const line = current && findLineOf(current.root, current.orientation, cell);
		if (!line) {
			return;
		}
		const dimension = line.orientation === Orientation.VERTICAL ? 'height' : 'width';
		const children = line.children.filter(child => child.visible !== false);
		const ids = children.map(child => collectCellIds(child).find(id => grid.isCellVisible(id)));
		if (ids.some(id => id === undefined)) {
			return;
		}
		const persistent = (id: string) => this._isPersistentCell(id);
		const partsOf = (node: ISerializedNode) => collectCellIds(node).filter(persistent);
		// The terminals keep their height; a part that came or goes as the grid created it, such as for dropped editors, its size
		const fixed = children.map((child, index) => partsOf(child).length && !isChrome(child) ? undefined
			: child.type === 'leaf' && ids[index] === ChatWindowGridCell.Terminals && dimension === 'height' ? terminalsHeight ?? this._terminalsHeight()
				: grid.getCellSize(ids[index]!)[dimension]);
		// Alone beside the terminals, such as the main part with the terminals under it, the cell takes the rest. Else the
		// cells share it as they did, also when the terminals joined or left the row or column meanwhile.
		const sharesIn = (grid: ISerializedGrid | undefined) => {
			const previousLine = grid && findLineOf(grid.root, grid.orientation, cell);
			return children.map((child, index) => {
				const parts = partsOf(child);
				return fixed[index] !== undefined || previousLine?.orientation !== line.orientation ? undefined
					: previousLine.children.find(candidate => candidate.visible !== false && collectCellIds(candidate).some(id => parts.includes(id)))?.size;
			});
		};
		const isComplete = (shares: (number | undefined)[]) => shares.every((size, index) => size !== undefined || fixed[index] !== undefined);
		const previous = fixed.filter(size => size === undefined).length === 1 ? fixed.map(size => size === undefined ? 1 : undefined)
			: [sharesIn(before), sharesIn(withCellsOf(before, persistent))].find(isComplete);
		if (!previous) {
			return;
		}
		const room = ids.reduce((sum, id) => sum + grid.getCellSize(id!)[dimension], 0);
		const fixedTotal = fixed.reduce<number>((sum, size) => sum + (size ?? 0), 0);
		const total = previous.reduce<number>((sum, size) => sum + (size ?? 0), 0);
		if (!total || fixedTotal >= room) {
			return;
		}
		children.slice(0, -1).forEach((_child, index) => {
			const size = fixed[index] ?? Math.round(previous[index]! * (room - fixedTotal) / total);
			grid.resizeCell(ids[index]!, dimension === 'height' ? { height: size } : { width: size });
		});
	}

	/**
	 * A part the grid creates or closes, such as for an editor dropped on an edge of the window, is part of the window's
	 * arrangement, which the window then still arranged, unless something else changed it, such as a part the user moved.
	 */
	private _willChangeCreatedParts(): void {
		const shown = this._grid.value?.describe();
		this._createdPartsChanging ||= shown !== undefined && shown === this._arranged;
	}

	private _updateFromGrid(): void {
		if (this._createdPartsChanging) {
			this._createdPartsChanging = false;
			this._arranged = this._grid.value?.describe();
		}
		const terminalsVisible = !!this._grid.value?.isCellVisible(ChatWindowGridCell.Terminals);
		this._terminalsVisible.set(terminalsVisible, undefined);
		if (!terminalsVisible) {
			this._lastTerminalsHeight = undefined;
		} else if (this._lastTerminalsHeight === undefined) {
			// As they show, at the height they have by default, before a part dropped at an edge of the window shrinks them
			this._rememberTerminalsHeight(this._dimension);
		}
		this._adoptTerminalPosition();
		this._updateBeforeTerminalsShow();
	}

	/** Until the terminals first show, the parts keep the sizes they have, such as those the user gives them meanwhile. */
	private _updateBeforeTerminalsShow(): void {
		const grid = this._grid.value;
		if (this._beforeTerminalsShow && grid && !grid.isCellVisible(ChatWindowGridCell.Terminals)) {
			this._beforeTerminalsShow = grid.serializeGrid();
		}
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
		const splitLayout = this._arrangedSplitLayout;
		if (!grid || !setTerminalPosition || mode === undefined || splitLayout === undefined || this._closing || !this._terminalsInGrid) {
			return;
		}
		const shown = grid.describe();
		const current = this._terminalPosition.get();
		if (shown === this._describeArrangement(splitLayout, current)) {
			return;
		}
		const adopted = [ChatWindowTerminalPosition.FullWidth, ChatWindowTerminalPosition.UnderChat, ChatWindowTerminalPosition.UnderEditor].find(position => shown === this._describeArrangement(splitLayout, position));
		if (adopted === undefined) {
			return;
		}
		this._topologyKey = this._topology(splitLayout, adopted).key;
		this._sizesKey = this._topologyKey;
		this._arranged = shown;
		setTerminalPosition(adopted);
	}

	/** What {@link PartGrid.describe} says for the arrangement of `splitLayout` with the terminals at `position`, as {@link _arrange} builds it. */
	private _describeArrangement(splitLayout: ChatWindowSplitLayout, position: ChatWindowTerminalPosition): string {
		const { topology } = this._topology(splitLayout, position);
		const orientation = isBranch(topology) ? topology.orientation : Orientation.HORIZONTAL;
		const root = serializeTopology(topology);
		return describeSerialized(this._withCreatedParts(root.type === 'branch' ? root.data : [root], orientation, 0, 0), orientation);
	}

	/** How the chat and the main part show together in `mode`, or, in a mode that hides one, as they last did. */
	private _splitLayoutOf(mode: ChatWindowLayoutMode): ChatWindowSplitLayout {
		return this._cells.splitLayout?.get() ?? (isChatWindowSplitLayout(mode) ? mode : this._arrangedSplitLayout ?? ChatWindowLayoutMode.SideBySide);
	}

	private _update(): void {
		if (!this._dimension) {
			return;
		}
		const mode = this._layoutMode.get();
		const splitLayout = this._splitLayoutOf(mode);
		// Only arranging the chat and the main part together another way arranges the parts again, from that arrangement.
		// Showing or hiding either keeps the arrangement the grid shows, with the parts the user moved where they are.
		if (this._arrangedSplitLayout !== undefined && splitLayout !== this._arrangedSplitLayout) {
			this._topologyKey = undefined;
			this._baseTopologyKey = undefined;
			this._restoredArrangement = undefined;
			this._beforeHide = undefined;
		}
		const previousMode = this._arrangedMode;
		this._arrangedMode = mode;
		this._arrangedSplitLayout = splitLayout;
		// Arranged by the user, such as a part they moved: its sizes are not those of the window's arrangement
		const userArranged = !!this._grid.value && this._grid.value.describe() !== this._arranged;
		const arranged = this._arrange(splitLayout, this._dimension);
		const grid = this._grid.value!;
		// The terminals keep the height they have, or move with, as cells show and hide: a hidden cell, such as the title
		// row, would otherwise give them its room.
		const terminalsHeight = this._pendingTerminalsHeight ?? (grid.isCellVisible(ChatWindowGridCell.Terminals) ? grid.getCellSize(ChatWindowGridCell.Terminals).height : undefined);
		const hidden = getHiddenCell(mode);
		// The part that shows again, also as the other one hides instead, such as from Chat Only to Editor Only
		const previousHidden = previousMode !== undefined ? getHiddenCell(previousMode) : undefined;
		const shown = previousHidden !== hidden ? previousHidden : undefined;
		this._pendingTerminalsHeight = undefined;
		// The chrome first: the room it leaves is the parts', also as both show before one hides
		if (this._titleRow) {
			grid.setCellVisible(ChatWindowGridCell.TitleRow, !!this._cells.titleRow?.visible.get());
		}
		if (this._strip) {
			grid.setCellVisible(ChatWindowGridCell.Strip, !!this._cells.strip?.visible.get());
		}
		// Before the part hides, as both show: also in the grid arranged anew while it stays hidden, such as stacked. The
		// terminals take their height first, which the chrome that showed or hid changed as it gave or took their room.
		if (hidden && (!previousHidden || arranged === 'rebuilt')) {
			if (terminalsHeight !== undefined && grid.isCellVisible(ChatWindowGridCell.Terminals) && grid.getCellSize(ChatWindowGridCell.Terminals).height !== terminalsHeight) {
				this._resizeTerminals(grid, terminalsHeight);
			}
			const before = grid.serializeGrid();
			this._beforeHide = { grid: before, created: new Set(this._created.keys()), terminalsHeight: grid.isCellVisible(ChatWindowGridCell.Terminals) ? grid.getCellSize(ChatWindowGridCell.Terminals).height : undefined };
		}
		grid.setCellVisible(ChatWindowGridCell.Chat, mode !== ChatWindowLayoutMode.EditorOnly);
		grid.setCellVisible(ChatWindowGridCell.Main, mode !== ChatWindowLayoutMode.ChatOnly);
		// Sized once the cells beside them show, which would otherwise take a share of their height.
		if (terminalsHeight !== undefined && grid.isCellVisible(ChatWindowGridCell.Terminals) && grid.getCellSize(ChatWindowGridCell.Terminals).height !== terminalsHeight) {
			this._resizeTerminals(grid, terminalsHeight);
		}
		// The part that shows again takes the room it had back from the cells beside it, unless the arrangement changed
		// meanwhile: rather than from the last of them, such as the terminals below it, which took its room as it hid.
		const beforeHide = this._beforeHide;
		if (shown && beforeHide?.grid && this._showsPartsAsBeforeHide(grid.serializeGrid())) {
			this._restoreLineSizes(grid, shown, beforeHide.grid, beforeHide.terminalsHeight);
		}
		if (!hidden) {
			this._beforeHide = undefined;
		}
		if (arranged === 'changed') {
			// The terminals joined, moved or left: the window's arrangement is the one with them as they are now, also
			// while the user's differs, so that sizes count again once the user arranges the parts as the window does
			this._arranged = userArranged ? this._describeArrangement(splitLayout, this._terminalPosition.get()) : grid.describe();
		}
		this._sizesKey = this._topologyKey;
		this._baseSizesKey = this._baseTopologyKey;
		this._updateFromGrid();
	}

	/**
	 * Forgets the sizes the user gave the cells and how they arranged them, and arranges them again as the mode arranges
	 * them, as in a new window: parts moved elsewhere go back to their places, the parts it created close, their editors
	 * moving into the main part, and the cells take their default shares.
	 */
	reset(): void {
		this._closeCreatedParts();
		this._sizes = {};
		this._restoredArrangement = undefined;
		this._exportedArrangement = undefined;
		this._beforeHide = undefined;
		this._beforeTerminalsShow = undefined;
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
	 * Remembers the sizes of the cells a sash the user dragged or reset changed. The height of the terminals is theirs in
	 * every arrangement; the sizes of the chat and the main part are those of the arrangement as both show, while the grid
	 * still shows it as the window arranged it. While one of them hides, the other took its room: the sizes are those both
	 * take as they show again, as the hidden one hid with, which the grid then also shows them with.
	 */
	private _rememberUserSizes(before: Map<string, IViewSize>): void {
		const grid = this._grid.value;
		if (!grid || !this._sizesKey) {
			return;
		}
		const changed: Record<string, IViewSize> = {};
		for (const [cell, size] of this._cellSizes()) {
			const previous = before.get(cell);
			if (!previous || previous.width !== size.width || previous.height !== size.height) {
				changed[cell] = size;
			}
		}
		// Only a height the user gives the terminals is theirs: a width they take, such as beside the chat while the main part
		// above them hides, leaves the height they fill there, which is not one the user chose.
		const terminals = changed[ChatWindowGridCell.Terminals];
		if (terminals && before.get(ChatWindowGridCell.Terminals)?.height !== terminals.height) {
			this._sizes[TERMINALS_SIZE_KEY] = { [ChatWindowGridCell.Terminals]: terminals };
			// As it shows again too, while a part hides
			if (this._beforeHide) {
				this._beforeHide.terminalsHeight = terminals.height;
			}
		}
		const { [ChatWindowGridCell.Terminals]: _terminals, ...changedParts } = changed;
		let parts: Record<string, IViewSize> = changedParts;
		const hidden = this._arrangedMode !== undefined ? getHiddenCell(this._arrangedMode) : undefined;
		if (hidden) {
			const shown = grid.serializeGrid();
			const beforeHide = this._beforeHide;
			const previousGrid = beforeHide?.grid;
			if (!shown || !beforeHide || !previousGrid || !this._showsPartsAsBeforeHide(shown)) {
				return;
			}
			const asBothShow = withLineSharesOf(shown, hidden, previousGrid, id => this._isPersistentCell(id), beforeHide.terminalsHeight ?? this._terminalsHeight(), id => grid.getCellMinimumSize(id));
			if (!asBothShow) {
				return;
			}
			// Sizes the parts only take as they fit the window, such as beside terminals taller than it, are not taken in
			if (!asBothShow.constrained) {
				// The parts the grid created that it shows now are in it too, also once they close
				beforeHide.grid = asBothShow.grid;
				beforeHide.created = new Set([...beforeHide.created, ...this._created.keys()]);
			}
			if (!Object.keys(changed).length) {
				return;
			}
			// The dimension the user did not change stays as it was where the parts only take their sizes in it as they fit,
			// such as the heights beside terminals taller than the window as a width changes. Else, as both show, the parts
			// take the sizes they have now in it, such as the widths the window gives them as it is resized.
			const touched = (dimension: 'width' | 'height') => Object.entries(changed).some(([cell, size]) => before.get(cell)?.[dimension] !== size[dimension]);
			const [width, height] = [asBothShow.constrained !== 'width' || touched('width'), asBothShow.constrained !== 'height' || touched('height')];
			const sizes = cellSizesOf(asBothShow.grid);
			const previousSizes = cellSizesOf(previousGrid);
			const remembered = this._sizes[this._sizesKey];
			parts = Object.fromEntries([ChatWindowGridCell.Chat, ChatWindowGridCell.Main].flatMap(cell => {
				const size = sizes.get(cell);
				const kept = remembered?.[cell] ?? previousSizes.get(cell) ?? size;
				return size && kept ? [[cell, { width: width ? size.width : kept.width, height: height ? size.height : kept.height }]] : [];
			}));
		}
		if (!Object.keys(parts).length || grid.describe() !== this._arranged) {
			return;
		}
		this._sizes[this._sizesKey] = { ...this._sizes[this._sizesKey], ...parts };
		if (this._baseSizesKey && this._baseSizesKey !== this._sizesKey) {
			this._sizes[this._baseSizesKey] = { ...this._sizes[this._baseSizesKey], ...parts };
		}
	}

	/** The arrangement of `splitLayout`, with the terminals where they show, or at `position`, and its key. */
	private _topology(splitLayout: ChatWindowSplitLayout, position = this._terminalPosition.get()) {
		const terminals = this._cells.terminals?.get();
		const chrome = { titleRow: !!this._titleRow, strip: !!this._strip };
		const topology = getChatWindowTopology(splitLayout, { ...chrome, terminals: terminals ? position : undefined });
		return { terminals, position, chrome, topology, key: describeTopology(topology) };
	}

	/**
	 * The arrangement the user gave the parts before, for the grid of `splitLayout` to show first: only one of that split
	 * layout, of the cells the grid has, such as without a strip, and before the grid created parts of its own.
	 */
	private _takeRestoredArrangement(splitLayout: ChatWindowSplitLayout): ISerializedGrid | undefined {
		const arrangement = this._restoredArrangement;
		this._restoredArrangement = undefined;
		if (!arrangement || arrangement.splitLayout !== splitLayout || this._created.size) {
			return undefined;
		}
		if (!this._isOfWindowCells(collectCellIds(arrangement.root))) {
			return undefined;
		}
		return {
			root: arrangement.root as ISerializedNode,
			orientation: arrangement.orientation === 1 ? Orientation.HORIZONTAL : Orientation.VERTICAL,
			width: arrangement.width,
			height: arrangement.height,
		};
	}

	/**
	 * Arranges the parts as `splitLayout` does, unless the grid already shows its arrangement: anew (`rebuilt`), or only the
	 * terminals joining, moving or leaving it (`changed`).
	 */
	private _arrange(splitLayout: ChatWindowSplitLayout, dimension: IViewSize): 'rebuilt' | 'changed' | undefined {
		const { terminals, position, chrome, topology, key } = this._topology(splitLayout);
		if (key === this._topologyKey) {
			return undefined;
		}
		this._topologyKey = key;

		// While the rest of the arrangement stays, the terminals join it, move in it or leave it, as the part grid does.
		const baseKey = describeTopology(getChatWindowTopology(splitLayout, chrome));
		const grid = this._grid.value;
		if (grid && baseKey === this._baseTopologyKey) {
			// The part grid may rebuild its grid for them, such as across the chat and the main part with the strip running past
			// them, which takes the focus from what had it, such as the chat input
			const focused = this._container.ownerDocument.activeElement;
			if (!terminals) {
				grid.removeCell(ChatWindowGridCell.Terminals);
				this._terminalsInGrid = false;
			} else if (this._terminalsInGrid) {
				grid.moveCell(ChatWindowGridCell.Terminals, getTerminalsLocation(splitLayout, position));
				this._pendingTerminalsHeight = this._terminalsHeight();
			} else {
				this._addTerminals(grid, terminals, splitLayout, position);
			}
			this._restoreFocus(focused);
			return 'changed';
		}
		this._baseTopologyKey = baseKey;
		this._terminalsInGrid = !!terminals;

		// The grid keeps the outer insets to the edges of the window: its cells share what is inside them.
		const insets = this._outerInsets;
		const width = Math.max(0, dimension.width - insets.left - insets.right);
		const height = Math.max(0, dimension.height - insets.top - insets.bottom);
		// Applied once the cells of the arrangement show or hide, such as the title row, whose room would otherwise go to them.
		this._pendingTerminalsHeight = terminals ? Math.min(height, this._terminalsHeight()) : undefined;
		// The terminals join the arrangement the user gave the parts, which is without them, where their position says
		const restored = this._takeRestoredArrangement(splitLayout);
		const serializedGrid = restored ?? this._serializeArrangement(splitLayout, topology, key, baseKey, terminals ? position : undefined, { width, height });
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
		this._beforeTerminalsShow = undefined;
		this._gridListener.value = combinedDisposable(partGrid.onDidChangeArrangement(() => this._updateFromGrid()), partGrid.onDidChangePartEmpty(e => {
			if (e.id === ChatWindowGridCell.Terminals && !e.empty && partGrid.isCellVisible(ChatWindowGridCell.Terminals)) {
				const height = this._terminalsFirstShowHeight;
				if (height !== undefined) {
					this._terminalsFirstShowHeight = undefined;
					this._resizeTerminals(partGrid, height);
				}
				this._keepSharesBesideTerminals(partGrid);
			}
			this._updateFromGrid();
		}));
		partGrid.setGap(this._gap.get());
		partGrid.setOuterInsets(insets);
		partGrid.layout(dimension.width, dimension.height);
		// Once laid out: until then, a restored grid does not know the sizes of its rows and columns, such as the width of
		// a row of the chat and the main part without the chrome, which the terminals would take their room in.
		if (restored) {
			this._beforeTerminalsShow = partGrid.serializeGrid();
			if (terminals) {
				this._addTerminals(partGrid, terminals, splitLayout, position);
			}
		}
		this._restoreFocus(focused);
		// The window's arrangement, which the user's is not: its sizes are not remembered for it
		this._arranged = restored ? this._describeArrangement(splitLayout, position) : partGrid.describe();
		return 'rebuilt';
	}

	private _addTerminals(grid: PartGrid, terminals: IContentPart, splitLayout: ChatWindowSplitLayout, position: ChatWindowTerminalPosition): void {
		const height = this._terminalsHeight();
		grid.addPart(ChatWindowGridCell.Terminals, terminals, getTerminalsLocation(splitLayout, position), height, TERMINALS_OPTIONS);
		this._terminalsInGrid = true;
		this._terminalsFirstShowHeight = grid.isCellVisible(ChatWindowGridCell.Terminals) ? undefined : height;
		this._keepSharesBesideTerminals(grid);
	}

	/**
	 * As the terminals first show in a grid restored from the arrangement the user gave the parts, also as they join it
	 * or fill, the parts beside them keep the shares they had, such as the chat and the main part in a column without the
	 * chrome, rather than the last of them giving the terminals its room.
	 */
	private _keepSharesBesideTerminals(grid: PartGrid): void {
		const before = this._beforeTerminalsShow;
		if (!before || !grid.isCellVisible(ChatWindowGridCell.Terminals)) {
			return;
		}
		this._beforeTerminalsShow = undefined;
		const current = grid.serializeGrid();
		const line = current && findLineOf(current.root, current.orientation, ChatWindowGridCell.Terminals);
		const beside = line?.children.map(child => child.type === 'leaf' && child.visible !== false ? (child.data as { id: string }).id : undefined).find(id => id === ChatWindowGridCell.Chat || id === ChatWindowGridCell.Main);
		if (beside) {
			this._restoreLineSizes(grid, beside, before, undefined);
		}
	}

	/** The grid of `topology` in `box`, its cells at the sizes the user gave them, else at their shares, with the parts the grid created. */
	private _serializeArrangement(splitLayout: ChatWindowSplitLayout, topology: TopologyNode, sizesKey: string, baseKey: string, terminals: ChatWindowTerminalPosition | undefined, box: IViewSize): ISerializedGrid {
		// The sizes of the arrangement, else those of the chat and the main part as they showed without the terminals, else
		// as they showed before the strip had a column of its own in every mode, which a version without it still reads.
		const withoutStrip = { titleRow: !!this._titleRow, strip: false };
		const legacyKeys = this._strip ? [describeTopology(getChatWindowTopology(splitLayout, withoutStrip)), describeTopology(getChatWindowTopology(splitLayout, { ...withoutStrip, terminals }))] : [];
		const remembered: ChatWindowPartSizes[string] = {};
		for (const rememberedKey of [...legacyKeys, baseKey, sizesKey]) {
			Object.assign(remembered, this._sizes[rememberedKey]);
		}
		const orientation = isBranch(topology) ? topology.orientation : Orientation.HORIZONTAL;
		const { width, height } = box;
		const root = this._serialize(topology, orientation === Orientation.HORIZONTAL ? width : height, orientation, remembered, box);
		const serializedRoot: ISerializedNode = { type: 'branch', data: this._withCreatedParts(root.type === 'branch' ? root.data : [root], orientation, width, height), size: orientation === Orientation.HORIZONTAL ? height : width };
		return { root: serializedRoot, orientation, width, height };
	}

	/**
	 * How the user arranged the parts, such as the main part moved to the left of the chat, for the grid to show again,
	 * such as after a reload: undefined while the grid shows the parts as the window arranges them, apart from the
	 * terminals and the parts it created, which show where they always do.
	 */
	exportArrangement(): IChatWindowArrangement | undefined {
		const shown = this._grid.value?.serializeGrid();
		const hidden = this._arrangedMode !== undefined ? getHiddenCell(this._arrangedMode) : undefined;
		const beforeHide = this._beforeHide;
		const partGrid = this._grid.value;
		const grid = (shown && partGrid && hidden && beforeHide?.grid && this._showsPartsAsBeforeHide(shown) ? withLineSharesOf(shown, hidden, beforeHide.grid, id => this._isPersistentCell(id), beforeHide.terminalsHeight ?? this._terminalsHeight(), id => partGrid.getCellMinimumSize(id))?.grid : undefined) ?? shown;
		const splitLayout = this._arrangedSplitLayout;
		// While the window closes, its chat and main part leave the grid: what it showed before is what the user arranged
		if (this._closing || !grid || splitLayout === undefined) {
			return this._exportedArrangement;
		}
		const arrangement = withCellsOf(grid, id => id !== ChatWindowGridCell.Terminals && !this._created.has(id));
		if (!arrangement || arrangement.root.type !== 'branch' || !this._isOfWindowCells(collectCellIds(arrangement.root))) {
			return this._exportedArrangement;
		}
		const windowTopology = getChatWindowTopology(splitLayout, { titleRow: !!this._titleRow, strip: !!this._strip });
		const windowArrangement = serializeTopology(windowTopology);
		if (describeSerialized(arrangement.root.data, arrangement.orientation) === describeSerialized(windowArrangement.type === 'branch' ? windowArrangement.data : [windowArrangement], isBranch(windowTopology) ? windowTopology.orientation : Orientation.HORIZONTAL)) {
			return this._exportedArrangement = undefined;
		}
		return this._exportedArrangement = {
			version: 1,
			splitLayout,
			orientation: arrangement.orientation === Orientation.HORIZONTAL ? 1 : 0,
			width: arrangement.width,
			height: arrangement.height,
			root: arrangement.root as ChatWindowArrangementNode,
		};
	}

	/** Whether `ids` are those of the cells an arrangement the user gave the parts is of: the chat, the main part and the window's chrome, each once. */
	private _isOfWindowCells(ids: readonly string[]): boolean {
		const expected = [ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ...(this._titleRow ? [ChatWindowGridCell.TitleRow] : []), ...(this._strip ? [ChatWindowGridCell.Strip] : [])];
		return ids.length === expected.length && expected.every(id => ids.includes(id));
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
		return this._sizes[TERMINALS_SIZE_KEY]?.[ChatWindowGridCell.Terminals]?.height ?? this._defaultTerminalsHeight(this._dimension);
	}

	private _defaultTerminalsHeight(dimension: IViewSize | undefined): number {
		const insets = this._outerInsets;
		const total = Math.max(0, (dimension?.height ?? 0) - insets.top - insets.bottom);
		return Math.round(total * TERMINALS_SHARE);
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
