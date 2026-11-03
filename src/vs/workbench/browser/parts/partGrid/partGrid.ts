/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getActiveElement, getWindow, isActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Direction, Grid, GridNode, isGridBranchNode, ISerializableView, IView, ISerializedGrid, ISerializedNode, IViewSize, Orientation, orthogonal, SerializableGrid, Sizing } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { GroupDirection, GroupsOrder, IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorGroupView } from '../editor/editor.js';
import { PART_GRID_CLASS } from '../editor/partGridClass.js';
import { EditorsOrder, IEditorIdentifier } from '../../../common/editor.js';
import { getPartName } from '../editor/editorPartActions.js';
import { PartGridCardDrag, PartGridCardDrop } from './partGridCardDrag.js';
import { getPartTitleDragSource, PartGridDropTarget } from './partGridDnd.js';
import { PartGridMotion } from './partGridMotion.js';
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
 * state, or the view.
 */
export type PartGridCellContent = { readonly part: IContentPart; readonly options?: IPartGridPartOptions } | { readonly view: IPartGridView; readonly options?: IPartGridViewOptions };

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

	/**
	 * The card of the cell, whose look the preview of where it goes takes.
	 */
	get cardElement(): HTMLElement { return this.card; }

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
		return this.getCardInsets(this.insets);
	}

	/**
	 * The insets the card would have for given insets of the cell, such as
	 * in a preview of a move.
	 */
	getCardInsets(insets: IGridEdgeInsets): IGridEdgeInsets {
		if (!this.contentOwnsFrame) {
			return insets;
		}

		const inset = (gap: number, frame: number) => gap > 0 ? Math.max(0, gap - frame) : gap;
		return { top: inset(insets.top, this.border.top), right: inset(insets.right, this.border.right), bottom: inset(insets.bottom, this.border.bottom), left: inset(insets.left, this.border.left) };
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
	if (hasKey(content, { view: true })) {
		return new PartGridCell(id, content.view, undefined, content.options);
	}

	const part = content.part;
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
	private readonly motion: PartGridMotion;

	constructor(
		private readonly container: HTMLElement,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService
	) {
		super();

		PartGrid.grids.add(this);
		this._register(toDisposable(() => PartGrid.grids.delete(this)));

		this.motion = this._register(new PartGridMotion({
			container,
			getCellElement: id => this.cells.get(id)?.element,
			getCard: id => this.cells.get(id)?.cardElement
		}));

		this._register(new PartGridDropTarget({
			container,
			getVisibleCells: () => Array.from(this.cells.values()).filter(cell => cell.part && this.isCellVisible(cell.id)),
			canCreateParts: () => !!this.partFactory,
			moveEditorsIntoNewPart: (editors, edge) => this.moveEditorsIntoNewPart(editors, { edge })
		}));

		this.cardDrag = this._register(new PartGridCardDrag({
			container,
			isMotionEnabled: () => this.motion.isMotionEnabled(),
			getVisibleCells: () => Array.from(this.cells.values())
				.filter(cell => this.grid?.isViewVisible(cell) && this.isCellVisible(cell.id))
				.map(cell => ({ id: cell.id, element: cell.element, card: cell.cardElement, isPart: !!cell.part, setContentVisible: visible => cell.setVisible(visible) })),
			canMerge: (id, targetId) => this.canMergeCell(id, targetId),
			previewArrangement: (id, drop) => this.previewArrangement(id, drop),
			drop: (id, drop) => this.dropCell(id, drop)
		}));
	}

	private readonly cardDrag: PartGridCardDrag;

	/**
	 * Starts dragging the card of a part by the pointer, from a pointer down
	 * on it, such as on its grabber or on room of its own that drags it: the
	 * card lifts once the pointer moves, follows it, and the other cards make
	 * way for it; dropped, the part moves there. Escape cancels. Returns
	 * whether the drag started, for a part that shows.
	 */
	startPartDrag(id: string, e: PointerEvent): boolean {
		return this.cardDrag.start(id, e);
	}

	/**
	 * Moves or merges a part dragged by its card, as dropped: once, with no
	 * glide, as the drag settles the cards itself.
	 */
	private dropCell(id: string, drop: PartGridCardDrop): void {
		if (hasKey(drop, { merge: true })) {
			this.mergeCell(id, drop.merge);
			return;
		}

		const part = this.cells.get(id)?.part;
		if (!this.grid || this.cells.size < 2 || !part) {
			return;
		}

		moveInArrangement(this.arrangement(), this.getCell(id), cellId => this.getCell(cellId), drop.location);
		this.updateAllVisibility();
		status(localize('movedPart', "Moved {0}", getPartName(part)));
	}

	private mergeAllowed = true;

	/**
	 * Whether a part dropped on the center of another part merges into it,
	 * its editors joining that part. By default it does; a window can say
	 * that its parts do not merge, so that parts only move beside others.
	 */
	setMergeAllowed(allowed: boolean): void {
		this.mergeAllowed = allowed;
	}

	private canMergeCell(id: string, targetId: string): boolean {
		return this.mergeAllowed && id !== targetId && !!this.cells.get(id)?.part && !!this.cells.get(targetId)?.part;
	}

	/**
	 * Merges a part into another: its editors join the active group of the
	 * other part, and the part, without editors, goes away as such parts do.
	 * Returns whether it merged.
	 */
	mergeCell(id: string, targetId: string): boolean {
		const source = this.cells.get(id)?.part;
		const target = this.cells.get(targetId)?.part;
		if (!source || !target || !this.canMergeCell(id, targetId)) {
			return false;
		}

		const targetGroup = target.activeGroup;
		for (const group of source.getGroups(GroupsOrder.GRID_APPEARANCE)) {
			if (!group.isEmpty) {
				group.moveEditors(group.getEditors(EditorsOrder.SEQUENTIAL).map(editor => ({ editor, options: { pinned: true } })), targetGroup);
			}
		}

		targetGroup.focus();
		status(localize('mergedPart', "Merged {0} into {1}", getPartName(source), getPartName(target)));

		return true;
	}

	/**
	 * Where a cell would be, in client coordinates, if it moved to a
	 * location: the grid moves a copy of itself, with what stands in for its
	 * cells, and lays it out as it is laid out.
	 */
	previewMove(id: string, location: PartGridLocation): IPartGridRect | undefined {
		return this.previewArrangement(id, { location })?.get(id);
	}

	/**
	 * Where the cards of the cells that show would be, in client
	 * coordinates, after a part moved to a location or merged into another
	 * part: a dry run of the move on a copy of the grid, with what stands in
	 * for its cells, laid out as the grid is.
	 */
	previewArrangement(id: string, drop: PartGridCardDrop): Map<string, IPartGridRect> | undefined {
		const current = this.grid;
		if (!current || !this.dimension || !this.cells.has(id) || this.cells.size < 2) {
			return undefined;
		}

		const state = current.serialize();
		const stubs = new Map<string, PreviewView>();
		const stubOf = (cellId: string) => {
			let stub = stubs.get(cellId);
			if (!stub) {
				stub = new PreviewView(this.getCell(cellId));
				stubs.set(cellId, stub);
			}
			return stub;
		};
		// Laid out as the grid is, before the move, which moves the cells as the grid would
		const deserialize = (serialized: ISerializedGrid) => {
			const deserialized = SerializableGrid.deserialize<PreviewView>(serialized, { fromJSON: (data: { id: string }) => stubOf(data.id) }, { proportionalLayout: false });
			deserialized.layout(state.width, state.height);
			return deserialized;
		};

		let grid = deserialize(state);
		try {
			if (hasKey(drop, { merge: true })) {
				// A part that merges goes away, as a part without editors does
				grid.setViewVisible(stubOf(id), false);
			} else {
				const arrangement: IArrangement<PreviewView> = {
					get grid() { return grid; },
					isPart: cellId => !!this.cells.get(cellId)?.part,
					replace: serialized => {
						const next = deserialize(serialized);
						grid.dispose();
						grid = next;
					}
				};
				moveInArrangement(arrangement, stubOf(id), stubOf, drop.location);
			}
			this.previewAdjuster?.({
				leads: cellId => leads(grid, cellId, stub => !!stub.part && grid.isViewVisible(stub)),
				isCellVisible: cellId => stubs.has(cellId) || this.cells.has(cellId) ? grid.isViewVisible(stubOf(cellId)) : false,
				setCellVisible: (cellId, visible) => grid.setViewVisible(stubOf(cellId), visible)
			});
			grid.layout(state.width, state.height);

			const origin = current.element.getBoundingClientRect();
			const visibleStubs = Array.from(stubs.values()).filter(stub => grid.isViewVisible(stub));
			const rects = new Map<string, IPartGridRect>();
			for (const stub of visibleStubs) {
				const box = stub.box;
				if (!box) {
					continue;
				}

				// The card inside the cell, inset by its share of the gaps to the cells beside it, as the grid's look insets it
				const gapInsets = stub.keepsNoGap || visibleStubs.length < 2 ? NO_GRID_EDGE_INSETS : getGridEdgeInsets(grid, stub, this.gap, neighbor => grid.isViewVisible(neighbor) && !neighbor.keepsNoGap);
				const insets = this.getCell(stub.id).getCardInsets(gapInsets);
				rects.set(stub.id, {
					left: origin.left + box.left + insets.left,
					top: origin.top + box.top + insets.top,
					width: Math.max(0, box.width - insets.left - insets.right),
					height: Math.max(0, box.height - insets.top - insets.bottom)
				});
			}

			return rects;
		} finally {
			grid.dispose();
		}
	}

	/**
	 * Where the visible cells are, in client coordinates.
	 */
	private getCellRects(): Map<string, IPartGridRect> {
		const rects = new Map<string, IPartGridRect>();
		for (const cell of this.cells.values()) {
			if (this.grid?.isViewVisible(cell) && this.isCellVisible(cell.id)) {
				const { left, top, width, height } = cell.element.getBoundingClientRect();
				rects.set(cell.id, { left, top, width, height });
			}
		}

		return rects;
	}

	/**
	 * Changes the arrangement, the cells that move gliding from where they
	 * were to where they are.
	 */
	private arrange(change: () => void): void {
		if (!this.motion.isMotionEnabled()) {
			change();
			return;
		}

		const from = this.getCellRects();
		change();
		this.motion.glide(from, this.getCellRects());
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
		// The new part takes its room from the part the editors come from, not from the other parts
		const sourcePart = this.editorGroupsService.getPart(sourceGroup);
		const sourceCell = Array.from(this.cells.values()).find(cell => cell.part && (cell.part as IEditorPart) === sourcePart);
		const cell = this.register(id, { part });
		this.markCreated(id);
		this.addCell(cell, location, undefined, sourceCell?.id);

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

	/**
	 * Marks a part the grid created (`data-part-grid-created` on its cell),
	 * such as for the owner's look to style it as the parts it is like.
	 */
	private markCreated(id: string): void {
		this.created.add(id);
		this.getCell(id).element.dataset.partGridCreated = '';
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
			disposables.add(addDisposableListener(cell.dragHandle, EventType.POINTER_DOWN, e => this.startPartDrag(id, e)));
			// The empty space of the title of a group that is not at the top edge of the window, which moves the window, drags the part too
			disposables.add(addDisposableListener(cell.element, EventType.POINTER_DOWN, e => {
				if (getPartTitleDragSource(e.target, cell.element, group => !group.classList.contains(PART_GRID_TOP_EDGE_GROUP_CLASS))) {
					this.startPartDrag(id, e);
				}
			}, true));
			// While its card drags, the title does not start a drag of its group
			disposables.add(addDisposableListener(cell.element, EventType.DRAG_START, e => {
				if (this.cardDrag.isActive) {
					EventHelper.stop(e, true);
				}
			}, true));
		}

		return cell;
	}

	/**
	 * @param donorId At an edge of the window, the cell whose room the added
	 * cell takes, so that the other cells keep their sizes.
	 */
	private addCell(cell: PartGridCell, location: PartGridLocation, size: number | undefined, donorId?: string): void {
		if (!this.grid) {
			this.setGrid(new SerializableGrid<PartGridCell>(cell, { proportionalLayout: false }));
		} else if (hasKey(location, { reference: true })) {
			this.grid.addView(cell, size ?? Sizing.Split, this.getCell(location.reference), location.direction);
		} else {
			this.addAtEdge(cell, location.edge, size, donorId);
		}

		this.updateAllVisibility();
	}

	private trackEditors(id: string, part: IContentPart, disposables: DisposableStore): void {
		const groupListeners = disposables.add(new DisposableMap<IEditorGroup>());
		const update = () => this.updateEmpty(id, part);
		const trackGroup = (group: IEditorGroup) => groupListeners.set(group, group.onDidModelChange(() => update()));

		part.groups.forEach(trackGroup);
		disposables.add(part.onDidAddGroup(group => { trackGroup(group); update(); this.updateSplit(id, part); }));
		disposables.add(part.onDidRemoveGroup(group => { groupListeners.deleteAndDispose(group); update(); this.updateSplit(id, part); }));
		this.updateSplit(id, part);
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

	/**
	 * Marks the cell of a part split into more than one group
	 * (`data-part-grid-split`): the part is one card, which a look can frame
	 * once around its groups, as one part.
	 */
	private updateSplit(id: string, part: IContentPart): void {
		const element = this.cells.get(id)?.element;
		if (!element) {
			return;
		}

		const split = part.groups.length > 1;
		if (split === (element.dataset.partGridSplit !== undefined)) {
			return;
		}

		if (split) {
			element.dataset.partGridSplit = '';
		} else {
			delete element.dataset.partGridSplit;
		}

		// The look of the card, such as who draws its frame, may change with it
		this.applyLook();
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

	private addAtEdge(cell: PartGridCell, edge: Direction, size: number | undefined, donorId?: string): void {
		addAtEdge(this.arrangement(), cell, edge, size, donorId);
	}

	/**
	 * The grid of the cells, for what arranges it, such as a move and the
	 * preview of where a dragged cell goes.
	 */
	private arrangement(): IArrangement<PartGridCell> {
		return {
			grid: this.grid!,
			isPart: id => !!this.cells.get(id)?.part,
			replace: state => this.setGrid(this.deserialize(state))
		};
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

		this.arrange(() => {
			moveInArrangement(this.arrangement(), cell, cellId => this.getCell(cellId), location);
			this.updateAllVisibility();
		});
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
		const sizes = this.getVisibleCellSizes(id);
		const neighbor = this.dimension ? this.grid.getNeighborViews(cell, direction).find(candidate => candidate.part && this.isCellVisible(candidate.id)) : undefined;
		if (neighbor) {
			const grid = this.grid;
			this.arrange(() => {
				grid.moveView(cell, Sizing.Distribute, neighbor, direction);
				this.updateAllVisibility();
			});
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

		// The other cells keep their sizes, and the moved part takes the rest, so that moving it back restores them
		for (const [otherId, size] of sizes) {
			this.resizeCell(otherId, size);
		}

		return this.describe() !== before;
	}

	private getVisibleCellSizes(excludedId: string): [string, IViewSize][] {
		return Array.from(this.cells.keys())
			.filter(id => id !== excludedId && this.isCellVisible(id))
			.map(id => [id, this.getCellSize(id)]);
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

		return leads(this.grid, id, cell => !!cell.part && this.isCellVisible(cell.id));
	}

	private previewAdjuster: ((preview: IPartGridMovePreview) => void) | undefined;

	/**
	 * Sets what adjusts the preview of a move to what its owner does after
	 * a move, such as showing a row it shows once another part leads.
	 */
	setMovePreviewAdjuster(adjuster: (preview: IPartGridMovePreview) => void): IDisposable {
		this.previewAdjuster = adjuster;

		return toDisposable(() => {
			if (this.previewAdjuster === adjuster) {
				this.previewAdjuster = undefined;
			}
		});
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
				partGrid.markCreated(id);
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

/**
 * A view of an arrangement of cells: a cell of the grid, or what stands in
 * for it while previewing a move.
 */
interface IArrangedView extends ISerializableView {
	toJSON(): object;
}

/**
 * The grid of an arrangement of cells, and what changes it.
 */
interface IArrangement<T extends IArrangedView> {
	readonly grid: SerializableGrid<T>;
	isPart(id: string): boolean;
	replace(state: ISerializedGrid): void;
}

function addAtEdge<T extends IArrangedView>(arrangement: IArrangement<T>, cell: T, edge: Direction, size: number | undefined, donorId?: string): void {
	const grid = arrangement.grid;
	const orientation = edge === Direction.Up || edge === Direction.Down ? Orientation.VERTICAL : Orientation.HORIZONTAL;
	const atEnd = edge === Direction.Right || edge === Direction.Down;
	if (addAtEdgeOfParts(arrangement, cell, orientation, atEnd, size, donorId)) {
		return;
	}

	const root = grid.getViews();
	const edgeChild = root.children[atEnd ? root.children.length - 1 : 0];

	// Beside the only cell, or beside a cell at that edge of the root
	// along the grid's orientation, the grid adds it in place
	if (!isGridBranchNode(edgeChild) && (root.children.length === 1 || (grid.orientation === orientation && donorId === undefined))) {
		grid.addView(cell, size ?? Sizing.Distribute, edgeChild.view, edge);
		return;
	}

	// Otherwise the grid is rebuilt with the cell at the edge of its root
	const state = grid.serialize();
	const extent = orientation === Orientation.VERTICAL ? state.height : state.width;
	const children = state.root.type === 'branch' ? state.root.data : [state.root];
	let cellSize = Math.min(size ?? Math.round(extent / (grid.orientation === orientation ? root.children.length + 1 : 2)), extent);
	let newRoot: ISerializedNode;
	if (grid.orientation === orientation) {
		const donated = takeRoom(arrangement, children, cellSize, size, donorId);
		cellSize = donated.size;
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize };
		newRoot = { ...state.root, type: 'branch', data: atEnd ? [...donated.children, added] : [added, ...donated.children] };
	} else {
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize };
		const rest: ISerializedNode = { type: 'branch', data: children, size: Math.max(0, extent - cellSize) };
		newRoot = { type: 'branch', data: atEnd ? [rest, added] : [added, rest], size: orientation === Orientation.VERTICAL ? state.width : state.height };
	}
	arrangement.replace({ root: newRoot, orientation, width: state.width, height: state.height });
}

/**
 * Views that are not parts, such as a title row, can span the window
 * beside the parts. The edges of the window are then the edges of what
 * holds the parts: a cell added there goes beside the parts, and the
 * views keep spanning the window. Returns whether it added the cell.
 */
function addAtEdgeOfParts<T extends IArrangedView>(arrangement: IArrangement<T>, cell: T, orientation: Orientation, atEnd: boolean, size: number | undefined, donorId: string | undefined): boolean {
	const state = arrangement.grid.serialize();
	const isView = (child: ISerializedNode) => child.type === 'leaf' && !arrangement.isPart((child.data as { id: string }).id);
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
	let replacement: ISerializedNode;
	if (nodeOrientation === orientation) {
		const donated = takeRoom(arrangement, node.data, cellSize, size, donorId);
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: donated.size };
		replacement = { ...node, data: [...donated.children.slice(0, index), added, ...donated.children.slice(index)] };
	} else {
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize };
		const rest: ISerializedNode = { type: 'branch', data: node.data, size: Math.max(0, (node.size ?? extent) - cellSize) };
		replacement = { type: 'branch', data: atEnd ? [rest, added] : [added, rest], size: node.size };
	}

	const replace = (current: ISerializedNode, depth: number): ISerializedNode => depth === path.length || current.type !== 'branch'
		? replacement
		: { ...current, data: current.data.map((child, childIndex) => childIndex === path[depth] ? replace(child, depth + 1) : child) };
	arrangement.replace({ ...state, root: replace(state.root, 0) });

	return true;
}

/**
 * With a donor, the room of a cell added among `children`: the donor's
 * child, or the largest part's, gives it, by default half of its own,
 * and the other children keep their sizes. Without one, the children
 * share the room, as they make way for the given size.
 */
function takeRoom<T extends IArrangedView>(arrangement: IArrangement<T>, children: readonly ISerializedNode[], size: number, requested: number | undefined, donorId: string | undefined): { readonly children: readonly ISerializedNode[]; readonly size: number } {
	if (donorId === undefined) {
		return { children, size };
	}

	const contains = (node: ISerializedNode, id: string): boolean => node.type === 'leaf' ? (node.data as { id: string }).id === id : node.data.some(child => contains(child, id));
	const isPart = (node: ISerializedNode): boolean => node.type === 'branch' || arrangement.isPart((node.data as { id: string }).id);
	const sizeOf = (node: ISerializedNode) => node.size ?? 0;
	const donor = children.find(child => contains(child, donorId))
		?? children.filter(isPart).reduce<ISerializedNode | undefined>((largest, child) => !largest || sizeOf(child) > sizeOf(largest) ? child : largest, undefined);
	if (!donor) {
		return { children, size };
	}

	const room = Math.min(requested ?? Math.round(sizeOf(donor) / 2), sizeOf(donor));
	return { children: children.map(child => child === donor ? { ...child, size: sizeOf(child) - room } : child), size: room };
}

/**
 * Moves a view of an arrangement beside another view or to an edge of the
 * window, as {@link PartGrid.moveCell} moves a cell.
 */
function moveInArrangement<T extends IArrangedView>(arrangement: IArrangement<T>, view: T, getView: (id: string) => T, location: PartGridLocation): void {
	if (hasKey(location, { reference: true })) {
		arrangement.grid.moveView(view, Sizing.Distribute, getView(location.reference), location.direction);
	} else {
		arrangement.grid.removeView(view);
		addAtEdge(arrangement, view, location.edge, undefined);
	}
}

/**
 * A rectangle in client coordinates.
 */
export interface IPartGridRect {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/**
 * What stands in for a cell while previewing a move: it has the size
 * constraints of the cell, and remembers where it was laid out.
 */
class PreviewView implements IArrangedView {

	readonly element: HTMLElement;
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;
	readonly onDidChange = Event.None;
	readonly keepsNoGap: boolean;
	readonly id: string;
	readonly part: boolean;

	box: IPartGridRect | undefined;

	constructor(private readonly cell: PartGridCell) {
		this.id = cell.id;
		this.part = !!cell.part;
		this.element = $('.part-grid-preview-cell');
		this.minimumWidth = cell.minimumWidth;
		this.maximumWidth = cell.maximumWidth;
		this.minimumHeight = cell.minimumHeight;
		this.maximumHeight = cell.maximumHeight;
		this.keepsNoGap = !!cell.options.keepsNoGap;
	}

	layout(width: number, height: number, top: number, left: number): void {
		this.box = { left, top, width, height };
	}

	toJSON(): object {
		return this.cell.toJSON();
	}
}

/**
 * The preview of a move, which its owner adjusts to what it does after a
 * move (see {@link PartGrid.setMovePreviewAdjuster}).
 */
export interface IPartGridMovePreview {
	/** Whether a part leads the window after the move (see {@link PartGrid.leadsWindow}). */
	leads(id: string): boolean;
	isCellVisible(id: string): boolean;
	setCellVisible(id: string, visible: boolean): void;
}

/**
 * Whether a cell leads a grid: no cell that counts shows before it, to its
 * left or above it.
 */
function leads<T extends { readonly id: string } & IView>(grid: Grid<T>, id: string, counts: (view: T) => boolean): boolean {
	const showsCounted = (node: GridNode<T>): boolean => isGridBranchNode(node) ? node.children.some(showsCounted) : counts(node.view);
	let node: GridNode<T> = grid.getViews();
	while (isGridBranchNode(node)) {
		const first: GridNode<T> | undefined = node.children.find(showsCounted);
		if (!first) {
			return false;
		}
		node = first;
	}

	return node.view.id === id;
}
