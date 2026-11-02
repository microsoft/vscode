/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISerializedGrid, ISerializedNode, IViewSize, Orientation } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { IPartGridView, PartGrid, PartGridCellContent } from '../../../browser/parts/partGrid/partGrid.js';
import { IContentPart } from '../../../services/editor/common/editorGroupsService.js';
import { ChatWindowLayoutMode } from '../common/chatWindowLayout.js';
import { ChatWindowPartSizes } from '../common/chatWindowState.js';

/** The cells of a chat window's grid. */
export const enum ChatWindowGridCell {
	TitleRow = 'titleRow',
	Chat = 'chat',
	Main = 'main',
	Strip = 'strip',
}

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
}

type TopologyNode = { readonly cell: ChatWindowGridCell } | { readonly orientation: Orientation; readonly children: readonly TopologyNode[] };

function isBranch(node: TopologyNode): node is { readonly orientation: Orientation; readonly children: readonly TopologyNode[] } {
	return (node as { children?: unknown }).children !== undefined;
}

/**
 * How a chat window arranges its cells for a layout mode, as chat windows always did:
 * - side by side (and chat only): the title row above the chat's column only, the main part beside it running to the
 *   top of the window, and no strip: it shows inside the chat;
 * - stacked (and editor only): the title row across the window, the main part above the chat, and the strip in a
 *   column of its own at the right.
 * The cells a mode hides, the chat or the main part, stay in the grid, so that showing them is not a move.
 */
export function getChatWindowTopology(mode: ChatWindowLayoutMode, cells: { readonly titleRow: boolean; readonly strip: boolean }): TopologyNode {
	const titleRow: TopologyNode[] = cells.titleRow ? [{ cell: ChatWindowGridCell.TitleRow }] : [];
	const strip: TopologyNode[] = cells.strip ? [{ cell: ChatWindowGridCell.Strip }] : [];
	const chat: TopologyNode = { cell: ChatWindowGridCell.Chat };
	const main: TopologyNode = { cell: ChatWindowGridCell.Main };
	if (mode === ChatWindowLayoutMode.SideBySide || mode === ChatWindowLayoutMode.ChatOnly) {
		return { orientation: Orientation.HORIZONTAL, children: [titleRow.length ? { orientation: Orientation.VERTICAL, children: [...titleRow, chat] } : chat, main] };
	}
	const parts: TopologyNode = { orientation: Orientation.VERTICAL, children: [main, chat] };
	const row: TopologyNode = strip.length ? { orientation: Orientation.HORIZONTAL, children: [parts, ...strip] } : parts;
	return titleRow.length ? { orientation: Orientation.VERTICAL, children: [...titleRow, row] } : row;
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

/** A row or column of chrome as a cell: as tall (row) or wide (column) as it says, and no room while hidden. */
class ChromeView implements IPartGridView {

	private readonly _onDidChange = new Emitter<IViewSize | undefined>();
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	private readonly _listener: { dispose(): void };

	constructor(private readonly _chrome: IChatWindowGridChrome, private readonly _orientation: 'row' | 'column') {
		this._listener = autorun(reader => {
			_chrome.size.read(reader);
			_chrome.visible.read(reader);
			this._onDidChange.fire(undefined);
		});
	}

	get element(): HTMLElement { return this._chrome.element; }
	private get _size(): number { return this._chrome.visible.get() ? this._chrome.size.get() : 0; }
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
 * The grid of a chat window, on the workbench's part grid: its title row, its chat part, its main part and its strip,
 * arranged for its layout mode. The sizes the user gives its cells are kept per arrangement, so that a mode shows with
 * the sizes it had, and can be exported to come back for the chat after a reload.
 */
export class ChatWindowGrid extends Disposable {

	private readonly _grid = this._register(new MutableDisposable<PartGrid>());
	private _topologyKey: string | undefined;
	private _dimension: IViewSize | undefined;
	private _sizes: ChatWindowPartSizes = {};

	private readonly _titleRow: ChromeView | undefined;
	private readonly _strip: ChromeView | undefined;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _cells: IChatWindowGridCells,
		private readonly _layoutMode: IObservable<ChatWindowLayoutMode>,
		private readonly _gap: IObservable<number>,
		sizes: ChatWindowPartSizes | undefined,
	) {
		super();
		this._sizes = { ...sizes };
		this._titleRow = _cells.titleRow && this._register(new ChromeView(_cells.titleRow, 'row'));
		this._strip = _cells.strip && this._register(new ChromeView(_cells.strip, 'column'));

		this._register(autorun(reader => {
			this._layoutMode.read(reader);
			_cells.strip?.visible.read(reader);
			_cells.titleRow?.visible.read(reader);
			this._update();
		}));
		this._register(autorun(reader => this._grid.value?.setGap(this._gap.read(reader))));
	}

	/** The part grid of the window, for what acts on its cells, such as moving a part. */
	get partGrid(): PartGrid | undefined {
		return this._grid.value;
	}

	/** The arrangement shown, such as `row(column(titleRow,chat),main)`. */
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
			this._grid.value?.layout(width, height);
		}
	}

	private _update(): void {
		if (!this._dimension) {
			return;
		}
		const mode = this._layoutMode.get();
		this._arrange(mode, this._dimension);
		const grid = this._grid.value!;
		grid.setCellVisible(ChatWindowGridCell.Chat, mode !== ChatWindowLayoutMode.EditorOnly);
		grid.setCellVisible(ChatWindowGridCell.Main, mode !== ChatWindowLayoutMode.ChatOnly);
		if (this._titleRow) {
			grid.setCellVisible(ChatWindowGridCell.TitleRow, !!this._cells.titleRow?.visible.get());
		}
		if (this._strip && (mode === ChatWindowLayoutMode.Stacked || mode === ChatWindowLayoutMode.EditorOnly)) {
			grid.setCellVisible(ChatWindowGridCell.Strip, !!this._cells.strip?.visible.get());
		}
	}

	/** The sizes of the cells per arrangement, including the one shown. */
	exportSizes(): ChatWindowPartSizes {
		this._rememberSizes();
		return { ...this._sizes };
	}

	private _rememberSizes(): void {
		const grid = this._grid.value;
		if (!grid || !this._topologyKey) {
			return;
		}
		const sizes: Record<string, { width: number; height: number }> = {};
		for (const cell of [ChatWindowGridCell.Chat, ChatWindowGridCell.Main]) {
			if (grid.isCellVisible(cell)) {
				const { width, height } = grid.getCellSize(cell);
				sizes[cell] = { width, height };
			}
		}
		this._sizes[this._topologyKey] = { ...this._sizes[this._topologyKey], ...sizes };
	}

	private _arrange(mode: ChatWindowLayoutMode, dimension: IViewSize): void {
		const topology = getChatWindowTopology(mode, { titleRow: !!this._titleRow, strip: !!this._strip });
		const key = describeTopology(topology);
		if (key === this._topologyKey) {
			return;
		}
		this._rememberSizes();
		this._topologyKey = key;

		const remembered = this._sizes[key] ?? {};
		const orientation = isBranch(topology) ? topology.orientation : Orientation.HORIZONTAL;
		const { width, height } = dimension;
		const root = this._serialize(topology, orientation === Orientation.HORIZONTAL ? width : height, orientation, remembered, { width, height });
		const serializedRoot: ISerializedNode = { type: 'branch', data: root.type === 'branch' ? root.data : [root], size: orientation === Orientation.HORIZONTAL ? height : width };
		const serializedGrid: ISerializedGrid = { root: serializedRoot, orientation, width, height };
		const state = { grid: serializedGrid, hidden: [], parts: {} };
		this._grid.value = PartGrid.restore(this._container, state, id => this._contentOf(id));
		this._grid.value.setGap(this._gap.get());
		this._grid.value.layout(width, height);
	}

	private _contentOf(id: string): PartGridCellContent {
		switch (id) {
			case ChatWindowGridCell.Main: return { part: this._cells.main };
			case ChatWindowGridCell.Chat: return { part: this._cells.chat };
			case ChatWindowGridCell.TitleRow: return { view: this._titleRow! };
			default: return { view: this._strip! };
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
			return undefined;
		});
		// The size the user gave a part is kept; the last flexible child along the branch takes what is left.
		const flexible = children.map((_, index) => index).filter(index => fixed[index] === undefined);
		const lastFlexible = flexible.at(-1);
		const sizes = children.map((child, index) => {
			if (fixed[index] !== undefined || index === lastFlexible) {
				return fixed[index];
			}
			const size = this._rememberedOf(child, remembered);
			return size ? (horizontal ? size.width : size.height) : undefined;
		});
		const room = total - sizes.reduce<number>((sum, value) => sum + (value ?? 0), 0);
		const open = children.map((child, index) => ({ child, index })).filter(({ index }) => sizes[index] === undefined);
		const shares = open.reduce((sum, { child }) => sum + getShare(child, orientation), 0);
		for (const { child, index } of open) {
			const share = shares ? getShare(child, orientation) / shares : 1 / open.length;
			sizes[index] = Math.max(0, Math.round(room * share));
		}
		if (lastFlexible !== undefined) {
			const leftover = total - sizes.reduce<number>((sum, value) => sum + (value ?? 0), 0);
			sizes[lastFlexible] = Math.max(0, (sizes[lastFlexible] ?? 0) + leftover);
		}
		return sizes.map(value => value ?? 0);
	}
}
