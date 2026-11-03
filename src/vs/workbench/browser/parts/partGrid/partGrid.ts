/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getActiveElement, getWindow, isActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Direction, GridNode, isGridBranchNode, ISerializableView, ISerializedGrid, ISerializedNode, IViewSize, Orientation, orthogonal, SerializableGrid, Sizing } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { GroupDirection, IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorGroupView } from '../editor/editor.js';
import { PART_GRID_CLASS } from '../editor/partGridClass.js';
import { IEditorIdentifier } from '../../../common/editor.js';
import { getPartName } from '../editor/editorPartActions.js';
import { PartGridDropTarget, registerPartDragHandle } from './partGridDnd.js';
import { getGridEdgeInsets, IGridEdgeInsets, NO_GRID_EDGE_INSETS, updateGridGapSashes } from './partGridGap.js';

/**
 * The class of a cell at the top edge of its grid, with no visible cell above it, for what its owner shows there, such
 * as the top row of a window, which moves the window.
 */
export const PART_GRID_TOP_EDGE_CLASS = 'part-grid-cell-top-edge';

/**
 * The class of an editor group whose title is at the top edge of its grid: a group at the top of a part in a cell at the
 * top edge.
 */
export const PART_GRID_TOP_EDGE_GROUP_CLASS = 'part-grid-top-edge-group';

/**
 * The class of a cell at the right edge of its grid, with no visible cell to the right of it, for what its owner shows
 * there, such as what the window shows at its right edge.
 */
export const PART_GRID_RIGHT_EDGE_CLASS = 'part-grid-cell-right-edge';

/**
 * The class of an editor group whose title is at the top right corner of its grid: a group at the top right of a part
 * in a cell at the top and right edges, such as below the window controls at the top right of a window.
 */
export const PART_GRID_TOP_RIGHT_GROUP_CLASS = 'part-grid-top-right-group';

/**
 * What a cell of a {@link PartGrid} shows that is not an editor part, such as
 * a title row of the window.
 */
export interface IPartGridView {
	readonly element: HTMLElement;

	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;

	readonly onDidChange: Event<IViewSize | undefined>;

	layout(width: number, height: number, top: number, left: number): void;
	setVisible?(visible: boolean): void;
}

/**
 * Where a cell goes: beside another cell, or at an edge of the window.
 */
export type PartGridLocation =
	{ readonly reference: string; readonly direction: Direction } |
	{ readonly edge: Direction };

/**
 * The state of a {@link PartGrid}: its topology and sizes, the cells hidden
 * on purpose, and the state of each part in it.
 */
export interface IPartGridState {
	readonly grid: ISerializedGrid | undefined;
	readonly hidden: readonly string[];
	readonly parts: { readonly [id: string]: unknown };

	/**
	 * The parts the grid created through its {@link IPartGridPartFactory}.
	 */
	readonly created?: readonly string[];
}

/**
 * Creates the parts that a {@link PartGrid} adds when an editor goes into a
 * new part, such as one dropped on an edge of the window. The grid closes
 * such a part once its last editor closes.
 */
export interface IPartGridPartFactory {
	createPart(): { readonly id: string; readonly part: IContentPart };
}

/**
 * What {@link PartGrid.restore} needs for a cell: the part, created from its
 * state, the view, or a part that shows through a view of its owner, such as
 * one that adds a title row above it. A part is a part of the grid either way:
 * it shows while it has editors, and it drags and moves.
 */
export type PartGridCellContent =
	{ readonly part: IContentPart; readonly view?: IPartGridView; readonly options?: IPartGridPartOptions } |
	{ readonly view: IPartGridView; readonly options?: IPartGridViewOptions };

/**
 * How a cell shows its view.
 */
export interface IPartGridViewOptions {
	/**
	 * Whether the cell keeps no gap to the cells beside it, and they none to
	 * it, such as a title row of the window above the cards.
	 */
	readonly keepsNoGap?: boolean;
}

/**
 * How a cell shows its part.
 */
export interface IPartGridPartOptions {
	/**
	 * Whether the part shows while it has no editors, such as the main part
	 * of a window. By default it hides then.
	 */
	readonly showWhileEmpty?: boolean;
}

interface ICardFrame {
	readonly border: IGridEdgeInsets;
	readonly contentOwnsFrame: boolean;
}

class PartGridCell implements ISerializableView {

	readonly element: HTMLElement;
	private readonly card: HTMLElement;

	private insets: IGridEdgeInsets = NO_GRID_EDGE_INSETS;
	private lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	get minimumWidth(): number { return this.view.minimumWidth + this.horizontalFrame; }
	get maximumWidth(): number { return this.view.maximumWidth + this.horizontalFrame; }
	get minimumHeight(): number { return this.view.minimumHeight + this.verticalFrame; }
	get maximumHeight(): number { return this.view.maximumHeight + this.verticalFrame; }

	private get horizontalFrame(): number { const insets = this.cardInsets; return insets.left + insets.right + this.border.left + this.border.right; }
	private get verticalFrame(): number { const insets = this.cardInsets; return insets.top + insets.bottom + this.border.top + this.border.bottom; }

	/**
	 * The insets of the card. Where its content draws its own frame
	 * (`--part-grid-card-frame-owner: content`), the border of the card is
	 * only room for that frame and takes from the gap beside it, so that the
	 * frames are as far apart as those of cards.
	 */
	private get cardInsets(): IGridEdgeInsets {
		if (!this.contentOwnsFrame) {
			return this.insets;
		}

		const inset = (gap: number, frame: number) => gap > 0 ? Math.max(0, gap - frame) : gap;
		return { top: inset(this.insets.top, this.border.top), right: inset(this.insets.right, this.border.right), bottom: inset(this.insets.bottom, this.border.bottom), left: inset(this.insets.left, this.border.left) };
	}

	private border: IGridEdgeInsets = NO_GRID_EDGE_INSETS;
	private contentOwnsFrame = false;

	readonly onDidChange: Event<IViewSize | undefined>;

	/**
	 * For a part, the grabber on the frame of its card that drags it.
	 */
	readonly dragHandle: HTMLElement | undefined;

	constructor(readonly id: string, readonly view: IPartGridView, readonly part: IContentPart | undefined, readonly options: IPartGridPartOptions & IPartGridViewOptions = {}) {
		this.element = $('.part-grid-cell');
		this.element.dataset.partGridCell = id;
		this.card = append(this.element, $('.part-grid-card'));
		this.card.appendChild(view.element);
		if (part) {
			this.dragHandle = append(this.card, $('.part-grid-drag-handle', { 'aria-hidden': 'true' }));
		}
		this.onDidChange = view.onDidChange;
	}

	/**
	 * Reads the frame of the card that the owner's look may draw: its border,
	 * which its content is inside of, and whether the content draws its own
	 * frame. Only reads, so that the frames of all cards are read before any
	 * of them is written.
	 */
	readFrame(): ICardFrame | undefined {
		if (!this.card.isConnected) {
			return undefined;
		}

		const style = getWindow(this.card).getComputedStyle(this.card);
		const width = (value: string) => parseFloat(value) || 0;
		return {
			border: { top: width(style.borderTopWidth), right: width(style.borderRightWidth), bottom: width(style.borderBottomWidth), left: width(style.borderLeftWidth) },
			contentOwnsFrame: style.getPropertyValue('--part-grid-card-frame-owner').trim() === 'content'
		};
	}

	/**
	 * The gap the card keeps to the cells beside it, and its frame as read
	 * with {@link readFrame}. Returns whether the size constraints changed.
	 */
	setLook(insets: IGridEdgeInsets, frame: ICardFrame | undefined): boolean {
		const border = frame?.border ?? this.border;
		const contentOwnsFrame = frame?.contentOwnsFrame ?? this.contentOwnsFrame;
		if (sameInsets(this.insets, insets) && sameInsets(this.border, border) && this.contentOwnsFrame === contentOwnsFrame) {
			return false;
		}

		this.insets = insets;
		this.border = border;
		this.contentOwnsFrame = contentOwnsFrame;
		this.layoutCard();

		return true;
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.lastLayout = { width, height, top, left };
		this.layoutCard();
	}

	private layoutCard(): void {
		const insets = this.cardInsets;
		this.card.style.inset = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
		// For the content, such as a row that reaches over the gap beside the card.
		this.card.style.setProperty('--part-grid-card-inset-right', `${insets.right}px`);
		this.card.style.setProperty('--part-grid-card-inset-left', `${insets.left}px`);

		const layout = this.lastLayout;
		if (!layout) {
			return;
		}

		const border = this.border;
		this.view.layout(
			Math.max(0, layout.width - this.horizontalFrame),
			Math.max(0, layout.height - this.verticalFrame),
			layout.top + insets.top + border.top,
			layout.left + insets.left + border.left
		);
	}

	setVisible(visible: boolean): void {
		this.view.setVisible?.(visible);
	}

	toJSON(): object {
		return { id: this.id };
	}
}

function sameInsets(a: IGridEdgeInsets, b: IGridEdgeInsets): boolean {
	return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function createCell(id: string, content: PartGridCellContent): PartGridCell {
	if (!hasKey(content, { part: true })) {
		return new PartGridCell(id, content.view, undefined, content.options);
	}

	const part = content.part;
	if (content.view) {
		return new PartGridCell(id, content.view, part, content.options);
	}

	return new PartGridCell(id, {
		element: part.element as HTMLElement,
		get minimumWidth() { return part.minimumWidth; },
		get maximumWidth() { return part.maximumWidth; },
		get minimumHeight() { return part.minimumHeight; },
		get maximumHeight() { return part.maximumHeight; },
		onDidChange: part.onDidChange,
		layout: (width, height, top, left) => part.layout(width, height, top, left),
		setVisible: visible => part.setVisible(visible)
	}, part, content.options);
}

function hasEditors(part: IContentPart): boolean {
	return part.groups.some(group => !group.isEmpty);
}

function collectLeaves(node: ISerializedNode, into: ISerializedNode[] = []): ISerializedNode[] {
	if (node.type === 'leaf') {
		into.push(node);
	} else {
		node.data.forEach(child => collectLeaves(child, into));
	}

	return into;
}

/**
 * The grid of the parts of a window. Its cells are editor parts and other
 * views, such as a title row.
 *
 * A part shows while it has editors: it hides when its last editor closes
 * and shows again when an editor opens in it. Once no part has editors,
 * {@link onDidBecomeEmpty} fires, so that the owner can close the window.
 */
export class PartGrid extends Disposable {

	private readonly gridDisposables = this._register(new MutableDisposable<DisposableStore>());
	private grid: SerializableGrid<PartGridCell> | undefined;

	private readonly cells = new Map<string, PartGridCell>();
	private readonly cellDisposables = this._register(new DisposableMap<string>());

	private readonly hidden = new Set<string>();
	private readonly empty = new Set<string>();

	private dimension: IViewSize | undefined;

	private gap = 0;
	private outerInsets: IGridEdgeInsets = NO_GRID_EDGE_INSETS;

	private readonly _onDidChangePartEmpty = this._register(new Emitter<{ readonly id: string; readonly empty: boolean }>());
	/**
	 * Fires when a part gets its first editor or loses its last one.
	 */
	readonly onDidChangePartEmpty = this._onDidChangePartEmpty.event;

	private readonly _onDidBecomeEmpty = this._register(new Emitter<void>());
	/**
	 * Fires when the last editor of the last part with editors closes.
	 */
	readonly onDidBecomeEmpty = this._onDidBecomeEmpty.event;

	private readonly _onDidChangeArrangement = this._register(new Emitter<void>());
	/**
	 * Fires when cells are added, moved, removed, shown or hidden.
	 */
	readonly onDidChangeArrangement = this._onDidChangeArrangement.event;

	private static readonly grids = new Set<PartGrid>();

	/**
	 * The grid a part shows in, and the id of its cell.
	 */
	static findPart(part: IEditorPart): { readonly grid: PartGrid; readonly id: string } | undefined {
		for (const grid of PartGrid.grids) {
			for (const cell of grid.cells.values()) {
				if (cell.part && (cell.part as IEditorPart) === part) {
					return { grid, id: cell.id };
				}
			}
		}

		return undefined;
	}

	private partFactory: IPartGridPartFactory | undefined;
	private readonly created = new Set<string>();

	constructor(
		private readonly container: HTMLElement,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService
	) {
		super();

		PartGrid.grids.add(this);
		this._register(toDisposable(() => PartGrid.grids.delete(this)));

		this._register(new PartGridDropTarget({
			grid: this,
			container,
			getVisibleCells: () => Array.from(this.cells.values()).filter(cell => cell.part && this.isCellVisible(cell.id)),
			moveCell: (id, location) => {
				this.moveCell(id, location);
				const part = this.cells.get(id)?.part;
				if (part) {
					status(localize('movedPart', "Moved {0}", getPartName(part)));
				}
			},
			canCreateParts: () => !!this.partFactory,
			moveEditorsIntoNewPart: (editors, edge) => this.moveEditorsIntoNewPart(editors, { edge })
		}));
	}

	/**
	 * Sets what creates the parts the grid adds for editors that go into a
	 * new part. Without it, editors do not go into new parts.
	 */
	setPartFactory(factory: IPartGridPartFactory): IDisposable {
		this.partFactory = factory;

		return toDisposable(() => {
			if (this.partFactory === factory) {
				this.partFactory = undefined;
			}
		});
	}

	/**
	 * Moves editors into a new part at a location, created by the part
	 * factory. Returns the id of the new part's cell, if it got the editors.
	 */
	moveEditorsIntoNewPart(editors: readonly IEditorIdentifier[], location: PartGridLocation): string | undefined {
		const sourceGroup = editors.length ? this.editorGroupsService.getGroup(editors[0].groupId) : undefined;
		if (!this.partFactory || !sourceGroup) {
			return undefined;
		}

		const { id, part } = this.partFactory.createPart();
		this.created.add(id);
		this.addPart(id, part, location);

		const targetGroup = part.activeGroup;
		sourceGroup.moveEditors(editors.map(({ editor }) => ({ editor, options: { pinned: true } })), targetGroup);
		if (!hasEditors(part)) {
			part.close();
			return undefined;
		}

		targetGroup.focus();
		status(localize('movedEditorsIntoNewPart', "Moved {0} into a new part", editors[0].editor.getName()));

		return id;
	}

	/**
	 * Adds an editor part beside another cell or at an edge of the window
	 * (by default, the right edge). It leaves the grid when it closes.
	 */
	addPart(id: string, part: IContentPart, location?: PartGridLocation, size?: number, options?: IPartGridPartOptions): void {
		this.addCell(this.register(id, { part, options }), location ?? { edge: Direction.Right }, size);
	}

	/**
	 * Adds a view that is not an editor part, such as a title row.
	 */
	addView(id: string, view: IPartGridView, location?: PartGridLocation, size?: number, options?: IPartGridViewOptions): void {
		this.addCell(this.register(id, { view, options }), location ?? { edge: Direction.Right }, size);
	}

	private register(id: string, content: PartGridCellContent): PartGridCell {
		if (this.cells.has(id)) {
			throw new Error(`The part grid already has a cell '${id}'.`);
		}

		const cell = createCell(id, content);
		this.cells.set(id, cell);
		const disposables = new DisposableStore();
		this.cellDisposables.set(id, disposables);

		if (cell.part) {
			this.trackEditors(id, cell.part, disposables);
		}

		if (cell.part && cell.dragHandle) {
			const part = cell.part;
			disposables.add(registerPartDragHandle(cell.dragHandle, this, id, () => getPartName(part)));
		}

		return cell;
	}

	private addCell(cell: PartGridCell, location: PartGridLocation, size: number | undefined): void {
		if (!this.grid) {
			this.setGrid(new SerializableGrid<PartGridCell>(cell, { proportionalLayout: false }));
		} else if (hasKey(location, { reference: true })) {
			this.grid.addView(cell, size ?? Sizing.Split, this.getCell(location.reference), location.direction);
		} else {
			this.addAtEdge(cell, location.edge, size);
		}

		this.updateAllVisibility();
	}

	private trackEditors(id: string, part: IContentPart, disposables: DisposableStore): void {
		const groupListeners = disposables.add(new DisposableMap<IEditorGroup>());
		const update = () => this.updateEmpty(id, part);
		const trackGroup = (group: IEditorGroup) => groupListeners.set(group, group.onDidModelChange(() => update()));

		part.groups.forEach(trackGroup);
		disposables.add(part.onDidAddGroup(group => { trackGroup(group); update(); }));
		disposables.add(part.onDidRemoveGroup(group => { groupListeners.deleteAndDispose(group); update(); }));
		// Which of its groups are at its top changes with its groups.
		const markTopEdgeGroups = () => this.markTopEdgeGroups(this.getCell(id));
		disposables.add(Event.any(part.onDidAddGroup, part.onDidRemoveGroup, part.onDidMoveGroup)(markTopEdgeGroups));
		disposables.add(part.onWillClose(() => this.removeCell(id)));

		if (!hasEditors(part)) {
			this.empty.add(id);
		}
	}

	/**
	 * Marks the groups of the part of `cell` at its top, while the cell is at the top edge of the grid, and of those the
	 * one at its right, while the cell is at the right edge too.
	 */
	private markTopEdgeGroups(cell: PartGridCell): void {
		const part = cell.part;
		if (!part) {
			return;
		}
		const atTopEdge = cell.element.classList.contains(PART_GRID_TOP_EDGE_CLASS);
		const atRightEdge = cell.element.classList.contains(PART_GRID_RIGHT_EDGE_CLASS);
		for (const group of part.groups) {
			const element = (group as Partial<IEditorGroupView>).element;
			if (!element) {
				continue;
			}
			const atTop = atTopEdge && !part.findGroup({ direction: GroupDirection.UP }, group);
			element.classList.toggle(PART_GRID_TOP_EDGE_GROUP_CLASS, atTop);
			element.classList.toggle(PART_GRID_TOP_RIGHT_GROUP_CLASS, atTop && atRightEdge && !part.findGroup({ direction: GroupDirection.RIGHT }, group));
		}
	}

	private updateEmpty(id: string, part: IContentPart): void {
		const empty = !hasEditors(part);
		if (empty === this.empty.has(id)) {
			return;
		}

		if (empty) {
			this.empty.add(id);
		} else {
			this.empty.delete(id);
		}

		this.updateAllVisibility();
		this._onDidChangePartEmpty.fire({ id, empty });

		if (empty && this.isEmpty) {
			this._onDidBecomeEmpty.fire();
		}

		// A part the grid created goes once its last editor closes, after
		// the change that closed it, such as a move out of it, is done
		if (empty && this.created.has(id)) {
			queueMicrotask(() => {
				if (this.cells.get(id)?.part === part && this.created.has(id) && !hasEditors(part)) {
					part.close();
				}
			});
		}
	}

	/**
	 * Whether no part of the grid has editors.
	 */
	get isEmpty(): boolean {
		for (const cell of this.cells.values()) {
			if (cell.part && !this.empty.has(cell.id)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Whether the part has no editors.
	 */
	isPartEmpty(id: string): boolean {
		return this.empty.has(id);
	}

	private addAtEdge(cell: PartGridCell, edge: Direction, size: number | undefined): void {
		const grid = this.grid!;
		const orientation = edge === Direction.Up || edge === Direction.Down ? Orientation.VERTICAL : Orientation.HORIZONTAL;
		const atEnd = edge === Direction.Right || edge === Direction.Down;
		if (this.addAtEdgeOfParts(cell, orientation, atEnd, size)) {
			return;
		}

		const root = grid.getViews();
		const edgeChild = root.children[atEnd ? root.children.length - 1 : 0];

		// Beside the only cell, or beside a cell at that edge of the root
		// along the grid's orientation, the grid adds it in place
		if (!isGridBranchNode(edgeChild) && (root.children.length === 1 || grid.orientation === orientation)) {
			grid.addView(cell, size ?? Sizing.Distribute, edgeChild.view, edge);
			return;
		}

		// Otherwise the grid is rebuilt with the cell at the edge of its root
		const state = grid.serialize();
		const extent = orientation === Orientation.VERTICAL ? state.height : state.width;
		const cellSize = Math.min(size ?? Math.round(extent / (grid.orientation === orientation ? root.children.length + 1 : 2)), extent);
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize };
		const children = state.root.type === 'branch' ? state.root.data : [state.root];
		let newRoot: ISerializedNode;
		if (grid.orientation === orientation) {
			newRoot = { ...state.root, type: 'branch', data: atEnd ? [...children, added] : [added, ...children] };
		} else {
			const rest: ISerializedNode = { type: 'branch', data: children, size: Math.max(0, extent - cellSize) };
			newRoot = { type: 'branch', data: atEnd ? [rest, added] : [added, rest], size: orientation === Orientation.VERTICAL ? state.width : state.height };
		}
		this.setGrid(this.deserialize({ root: newRoot, orientation, width: state.width, height: state.height }));
	}

	/**
	 * Views that are not parts, such as a title row, can span the window
	 * beside the parts. The edges of the window are then the edges of what
	 * holds the parts: a cell added there goes beside the parts, and the
	 * views keep spanning the window. Returns whether it added the cell.
	 */
	private addAtEdgeOfParts(cell: PartGridCell, orientation: Orientation, atEnd: boolean, size: number | undefined): boolean {
		const state = this.grid!.serialize();
		const isView = (child: ISerializedNode) => child.type === 'leaf' && !this.cells.get((child.data as { id: string }).id)?.part;
		const path: number[] = [];
		let node = state.root;
		let nodeOrientation = state.orientation;
		while (node.type === 'branch' && nodeOrientation !== orientation) {
			const parts = node.data.filter(child => !isView(child));
			if (parts.length !== 1 || parts[0].type !== 'branch' || parts.length === node.data.length) {
				break;
			}
			path.push(node.data.indexOf(parts[0]));
			node = parts[0];
			nodeOrientation = orthogonal(nodeOrientation);
		}
		if (node.type !== 'branch') {
			return false;
		}

		// Along the edge's orientation, the cell goes past the parts but not past the views at that edge
		let index = atEnd ? node.data.length : 0;
		if (nodeOrientation === orientation && node.data.some(child => !isView(child))) {
			while (atEnd ? isView(node.data[index - 1]) : isView(node.data[index])) {
				index += atEnd ? -1 : 1;
			}
		}
		if (!path.length && index === (atEnd ? node.data.length : 0)) {
			return false;
		}

		const extent = orientation === Orientation.VERTICAL ? state.height : state.width;
		const cellSize = Math.min(size ?? Math.round(extent / (nodeOrientation === orientation ? node.data.length + 1 : 2)), extent);
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize };
		let replacement: ISerializedNode;
		if (nodeOrientation === orientation) {
			replacement = { ...node, data: [...node.data.slice(0, index), added, ...node.data.slice(index)] };
		} else {
			const rest: ISerializedNode = { type: 'branch', data: node.data, size: Math.max(0, (node.size ?? extent) - cellSize) };
			replacement = { type: 'branch', data: atEnd ? [rest, added] : [added, rest], size: node.size };
		}

		const replace = (current: ISerializedNode, depth: number): ISerializedNode => depth === path.length || current.type !== 'branch'
			? replacement
			: { ...current, data: current.data.map((child, childIndex) => childIndex === path[depth] ? replace(child, depth + 1) : child) };
		this.setGrid(this.deserialize({ ...state, root: replace(state.root, 0) }));

		return true;
	}

	private getCellsInGrid(node: GridNode<PartGridCell>, into: PartGridCell[] = []): PartGridCell[] {
		if (isGridBranchNode(node)) {
			node.children.forEach(child => this.getCellsInGrid(child, into));
		} else {
			into.push(node.view);
		}

		return into;
	}

	private getCell(id: string): PartGridCell {
		const cell = this.cells.get(id);
		if (!cell) {
			throw new Error(`The part grid has no cell '${id}'.`);
		}

		return cell;
	}

	private deserialize(state: ISerializedGrid): SerializableGrid<PartGridCell> {
		return SerializableGrid.deserialize<PartGridCell>(state, { fromJSON: (data: { id: string }) => this.getCell(data.id) }, { proportionalLayout: false });
	}

	private setGrid(grid: SerializableGrid<PartGridCell>): void {
		this.laidOut = false; // a new grid knows its neighbors once laid out
		const disposables = new DisposableStore();
		disposables.add(grid);
		disposables.add({ dispose: () => grid.element.remove() });
		this.gridDisposables.value = disposables;
		this.grid = grid;

		grid.element.classList.add(PART_GRID_CLASS);
		this.container.appendChild(grid.element);

		this.layoutGrid();
	}

	/**
	 * Removes a cell from the grid. A part is removed when it closes.
	 */
	removeCell(id: string): void {
		const cell = this.cells.get(id);
		if (!cell) {
			return;
		}

		if (this.grid && this.cells.size > 1) {
			this.grid.removeView(cell);
		} else {
			this.gridDisposables.clear();
			this.grid = undefined;
		}

		cell.element.remove();
		this.cells.delete(id);
		this.created.delete(id);
		this.hidden.delete(id);
		this.empty.delete(id);
		this.cellDisposables.deleteAndDispose(id);

		this.updateAllVisibility();
	}

	/**
	 * Moves a cell beside another cell or to an edge of the window.
	 */
	moveCell(id: string, location: PartGridLocation): void {
		const cell = this.getCell(id);
		if (!this.grid || this.cells.size < 2) {
			return;
		}

		if (hasKey(location, { reference: true })) {
			this.grid.moveView(cell, Sizing.Distribute, this.getCell(location.reference), location.direction);
		} else {
			this.grid.removeView(cell);
			this.addAtEdge(cell, location.edge, undefined);
		}

		this.updateAllVisibility();
	}

	/**
	 * Moves a cell past the part beside it in a direction, or, with no part
	 * there, to that edge of the window. Views that are not parts, such as a
	 * title row, are not moved past. Returns whether it moved.
	 */
	moveCellInDirection(id: string, direction: Direction): boolean {
		const cell = this.getCell(id);
		if (!this.grid || this.cells.size < 2) {
			return false;
		}

		const before = this.describe();
		const neighbor = this.dimension ? this.grid.getNeighborViews(cell, direction).find(candidate => candidate.part && this.isCellVisible(candidate.id)) : undefined;
		if (neighbor) {
			this.grid.moveView(cell, Sizing.Distribute, neighbor, direction);
			this.updateAllVisibility();
		} else {
			// At that edge already, the cells keep their places, sizes and focus
			const state = this.grid.serialize();
			const focused = getActiveElement();
			this.moveCell(id, { edge: direction });
			if (this.describe() === before) {
				this.setGrid(this.deserialize(state));
				this.updateAllVisibility();
				if (isHTMLElement(focused) && focused.isConnected && !isActiveElement(focused)) {
					focused.focus();
				}
				return false;
			}
		}

		return this.describe() !== before;
	}

	/**
	 * Swaps the places of two cells.
	 */
	swapCells(id: string, otherId: string): void {
		this.grid?.swapViews(this.getCell(id), this.getCell(otherId));

		// Swapping shows both cells again
		this.updateAllVisibility();
	}

	/**
	 * Shows or hides a cell. A part also hides while it has no editors, unless
	 * it shows while empty.
	 */
	setCellVisible(id: string, visible: boolean): void {
		this.getCell(id);
		if (visible) {
			this.hidden.delete(id);
		} else {
			this.hidden.add(id);
		}

		this.updateAllVisibility();
	}

	/**
	 * Whether a cell shows: it is not hidden and, for a part, it has editors
	 * or shows while it has none.
	 */
	isCellVisible(id: string): boolean {
		const cell = this.cells.get(id);
		return !!cell && !this.hidden.has(id) && (!this.empty.has(id) || !!cell.options.showWhileEmpty);
	}

	private updateVisibility(id: string): void {
		const cell = this.cells.get(id);
		if (!cell || !this.grid) {
			return;
		}

		// A grid does not hide its only cell, so that cell hides itself
		const visible = this.isCellVisible(id);
		const alone = this.cells.size === 1;
		const visibleInGrid = alone || visible;
		if (this.grid.isViewVisible(cell) !== visibleInGrid) {
			this.grid.setViewVisible(cell, visibleInGrid);
		}

		cell.element.style.display = alone && !visible ? 'none' : '';
		if (alone) {
			cell.setVisible(visible);
		}
	}

	private updateAllVisibility(): void {
		for (const id of this.cells.keys()) {
			this.updateVisibility(id);
		}

		this.applyLook();
		this._onDidChangeArrangement.fire();
	}

	/**
	 * Whether a part leads the window: it shows, and no other part shows
	 * before it, to its left or above it. Views that are not parts, such as
	 * a title row, do not count.
	 */
	leadsWindow(id: string): boolean {
		if (!this.grid || !this.isCellVisible(id)) {
			return false;
		}

		const showsPart = (node: GridNode<PartGridCell>): boolean => this.getCellsInGrid(node).some(cell => !!cell.part && this.isCellVisible(cell.id));
		let node: GridNode<PartGridCell> = this.grid.getViews();
		while (isGridBranchNode(node)) {
			const first: GridNode<PartGridCell> | undefined = node.children.find(showsPart);
			if (!first) {
				return false;
			}
			node = first;
		}

		return node.view.id === id;
	}

	getCellSize(id: string): IViewSize {
		return this.grid ? this.grid.getViewSize(this.getCell(id)) : { width: 0, height: 0 };
	}

	resizeCell(id: string, size: IViewSize): void {
		this.grid?.resizeView(this.getCell(id), size);
	}

	/**
	 * The ids of the cells in the order of the grid, with the orientation of
	 * each branch, such as `row(a, column(b, c))`.
	 */
	describe(): string {
		if (!this.grid) {
			return '';
		}

		const describe = (node: GridNode<PartGridCell>, orientation: Orientation): string => {
			if (!isGridBranchNode(node)) {
				return node.view.id;
			}

			const children = node.children.map(child => describe(child, orientation === Orientation.HORIZONTAL ? Orientation.VERTICAL : Orientation.HORIZONTAL));
			return `${orientation === Orientation.HORIZONTAL ? 'row' : 'column'}(${children.join(', ')})`;
		};

		const root = this.grid.getViews();
		return root.children.length === 1 ? describe(root.children[0], this.grid.orientation) : describe(root, this.grid.orientation);
	}

	layout(width: number, height: number): void {
		this.dimension = { width, height };
		this.layoutGrid();
	}

	/**
	 * The gap between the cards of the cells; 0 keeps them flush.
	 */
	setGap(gap: number): void {
		if (this.gap === gap) {
			return;
		}

		this.gap = gap;
		this.applyLook();
	}

	/**
	 * The room the grid keeps to the edges of the window.
	 */
	setOuterInsets(insets: IGridEdgeInsets): void {
		this.outerInsets = insets;
		this.layoutGrid();
	}

	private laidOut = false;

	private layoutGrid(): void {
		const grid = this.grid;
		if (!grid || !this.dimension) {
			return;
		}

		const insets = this.outerInsets;
		const width = Math.max(0, this.dimension.width - insets.left - insets.right);
		const height = Math.max(0, this.dimension.height - insets.top - insets.bottom);
		grid.element.style.margin = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
		// Sized inside the insets, as the cells that span it, such as a row across the window, take its size.
		grid.element.style.width = `${width}px`;
		grid.element.style.height = `${height}px`;

		// Once the grid knows its neighbors, the look applies before the layout, so that it lays out once
		if (this.laidOut) {
			this.applyLook(false);
			grid.layout(width, height);
		} else {
			grid.layout(width, height);
			this.laidOut = true;
			this.applyLook();
		}
	}

	/**
	 * Reads the frames of the cards again and lays out what changed, such as
	 * once the styles of a window have loaded or its theme or density
	 * changed. The frames are not read as the grid lays out.
	 */
	updateLook(): void {
		this.applyLook();
	}

	/**
	 * Insets each card by its share of the gap to the visible cells beside
	 * it, and shows the gripper on the sashes in the gaps. With `relayout`,
	 * lays the grid out again when the size constraints of a cell changed.
	 */
	private applyLook(relayout = true): void {
		const grid = this.grid;
		if (!grid || !this.dimension || !this.laidOut) {
			return; // the grid knows its neighbors once laid out
		}

		const allCells = this.getCellsInGrid(grid.getViews());
		const cells = allCells.filter((cell, _index, all) => all.length === 1 || grid.isViewVisible(cell));
		for (const cell of allCells) {
			if (!cells.includes(cell)) {
				// Hidden, it is at no edge.
				cell.element.classList.remove(PART_GRID_TOP_EDGE_CLASS, PART_GRID_RIGHT_EDGE_CLASS);
				this.markTopEdgeGroups(cell);
			}
		}

		// Read all frames before writing to any card
		const frames = cells.map(cell => cell.readFrame());

		let changed = false;
		cells.forEach((cell, index) => {
			const insets = cell.options.keepsNoGap ? NO_GRID_EDGE_INSETS : getGridEdgeInsets(grid, cell, this.gap, neighbor => grid.isViewVisible(neighbor) && !neighbor.options.keepsNoGap);
			changed = cell.setLook(insets, frames[index]) || changed;
			// At the top edge of the grid: no visible cell above it, such as a row of the window's chrome.
			cell.element.classList.toggle(PART_GRID_TOP_EDGE_CLASS, !grid.getNeighborViews(cell, Direction.Up, false).some(neighbor => grid.isViewVisible(neighbor)));
			cell.element.classList.toggle(PART_GRID_RIGHT_EDGE_CLASS, !grid.getNeighborViews(cell, Direction.Right, false).some(neighbor => grid.isViewVisible(neighbor)));
			this.markTopEdgeGroups(cell);
		});

		updateGridGapSashes(grid, true);

		// Insets change the size constraints of the cells
		if (changed && relayout) {
			grid.layout(grid.width, grid.height);
		}
	}

	/**
	 * Returns the topology, sizes and visibility of the grid and the state of
	 * each part in it, to restore it with {@link restore}.
	 */
	createState(): IPartGridState {
		const parts: { [id: string]: unknown } = {};
		for (const cell of this.cells.values()) {
			if (cell.part) {
				parts[cell.id] = cell.part.createState();
			}
		}

		return { grid: this.grid?.serialize(), hidden: Array.from(this.hidden), parts, created: Array.from(this.created) };
	}

	/**
	 * Restores a grid from {@link createState}. `createContent` creates the
	 * part (from its state) or the view of each cell.
	 */
	static restore(container: HTMLElement, state: IPartGridState, createContent: (id: string, partState: unknown | undefined) => PartGridCellContent, editorGroupsService: IEditorGroupsService): PartGrid {
		const partGrid = new PartGrid(container, editorGroupsService);
		if (!state.grid) {
			return partGrid;
		}

		const ids = collectLeaves(state.grid.root).map(leaf => (leaf.data as { id: string }).id);
		for (const id of ids) {
			partGrid.register(id, createContent(id, state.parts[id]));
		}

		for (const id of state.created ?? []) {
			if (partGrid.cells.has(id)) {
				partGrid.created.add(id);
			}
		}

		for (const id of state.hidden) {
			if (partGrid.cells.has(id)) {
				partGrid.hidden.add(id);
			}
		}

		partGrid.setGrid(partGrid.deserialize(state.grid));
		partGrid.updateAllVisibility();

		return partGrid;
	}

	override dispose(): void {
		this.cells.clear();

		super.dispose();
	}
}
