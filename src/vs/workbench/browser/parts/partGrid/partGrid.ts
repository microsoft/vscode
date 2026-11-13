/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getActiveElement, getWindow, isActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { findOverlayAnchorAt, findOverlayAnchorOf, findOverlayAnchorUnderPointer } from '../../../../base/browser/overlayLayoutElement.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Direction, Grid, GridBranchNode, GridNode, isGridBranchNode, ISerializableView, IView, ISerializedGrid, ISerializedNode, IViewSize, Orientation, orthogonal, SerializableGrid, Sizing } from '../../../../base/browser/ui/grid/grid.js';
import { GridLocation, GridView } from '../../../../base/browser/ui/grid/gridview.js';
import { equals } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { GroupsOrder, IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorGroupView } from '../editor/editor.js';
import { PART_GRID_CLASS, PART_GRID_TOP_STRIP_CLASS } from '../editor/partGridClass.js';
import { EditorPartInPartGridContext } from '../../../common/contextkeys.js';
import { EditorsOrder, IEditorIdentifier } from '../../../common/editor.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { getPartName } from '../editor/editorPartActions.js';
import { PartGridCardDrag, PartGridCardDrop } from './partGridCardDrag.js';
import { getPartTitleDragSource, PART_GRID_NEW_PART_ID, PartGridDropTarget } from './partGridDnd.js';
import { IPartGridReflowCell } from './partGridReflow.js';
import { PartGridMotion } from './partGridMotion.js';
import { getGridEdgeInsets, IGridEdgeInsets, NO_GRID_EDGE_INSETS, updateGridGapSashes } from './partGridGap.js';

/**
 * The class of the card of the part the pointer is over, also over what draws over the part, such as a webview, for its
 * grabber to show.
 */
const PART_GRID_POINTER_OVER_CLASS = 'part-grid-pointer-over';

/**
 * The classes of the card of the part the pointer is over, while it is over the part's top strip ({@link PART_GRID_TOP_STRIP_CLASS}),
 * or over the card's grabber: what shares the top edge of the card with the grabber can make way for it, and it for that.
 */
const PART_GRID_POINTER_OVER_TOP_STRIP_CLASS = 'part-grid-pointer-over-top-strip';
const PART_GRID_POINTER_OVER_GRABBER_CLASS = 'part-grid-pointer-over-grabber';

/**
 * How far, in pixels, from where the pointer heads as it leaves the window's elements, what draws over an element, such
 * as a webview, counts as where it went: the window has no event once the pointer is in it.
 */
const PART_GRID_OVERLAY_ENTRY_TOLERANCE = 4;

/** How long, in milliseconds, after the window's last pointer event the grid looks whether the pointer is over a webview. */
const PART_GRID_OVERLAY_POINTER_QUIET = 100;

/** How often, in milliseconds, the grid looks again while the pointer is over a webview, where the window has no events. */
const PART_GRID_OVERLAY_POINTER_POLL = 250;

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
 * Where a cell goes: beside another cell, or at an edge of the window. At an
 * edge, the chrome along the sides of that edge, such as a strip at the right
 * of the window, keeps spanning the window beside the parts and the cell (see
 * {@link IPartGridViewOptions.edgeChrome}).
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

	/**
	 * The edge of the window the cell is chrome along, such as a strip at its
	 * right: it keeps spanning the window along that edge as cells go to the
	 * edges beside it.
	 */
	readonly edgeChrome?: Direction;
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

	/**
	 * Whether the part keeps its size as the grid is resized, such as
	 * terminals below the other parts. By default parts keep their shares of
	 * the grid.
	 */
	readonly keepsSize?: boolean;
}

/**
 * The grid of the cells, which also resizes a row or column in a row or
 * column by where it is, such as one of rows only, which no view of it
 * resizes along its parent.
 */
class PartGridLayout extends SerializableGrid<PartGridCell> {

	static fromState(state: ISerializedGrid, deserializer: { fromJSON(data: { id: string }): PartGridCell }, options: { proportionalLayout: boolean }): PartGridLayout {
		return new PartGridLayout(GridView.deserialize(state, deserializer, options), options);
	}

	/**
	 * The size a restored grid was arranged at, which it is laid out at first: until then, the sizes of its rows and
	 * columns, which the sizes kept as it is laid out are read from, are not known.
	 */
	restoredSize: IViewSize | undefined;

	/**
	 * Resizes the node at `location` along the row or column it is in, of
	 * `orientation`.
	 */
	resizeNode(location: GridLocation, orientation: Orientation, size: number): void {
		this.gridview.resizeView(location, orientation === Orientation.VERTICAL ? { height: size } : { width: size });
	}
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

	/**
	 * Whether the cell keeps its size as the grid is resized: views that are
	 * not parts, such as a title row, and parts that say so. Every cell is
	 * laid out in proportion, and these get their sizes back once the grid
	 * is laid out (see `PartGrid.keepSizes`): opting out of the proportional
	 * layout would keep the size of the row or column around them too.
	 */
	get keepsSize(): boolean { return !this.part || !!this.options.keepsSize; }

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
		// Laid out by the grid, the cell is where the grid puts it
		this.previewLayout = undefined;
		this.element.style.width = this.element.style.height = '';
		this.layoutCard();
	}

	private previewLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	/**
	 * Lays the cell out at a size other than the grid gives it, moved by
	 * `dx`/`dy` from where the grid puts it, such as while cards make way
	 * for a dragged card; without a size, as the grid lays it out again.
	 * The grid laying it out ends it.
	 */
	layoutPreview(preview: { readonly width: number; readonly height: number; readonly dx: number; readonly dy: number } | undefined): void {
		const base = this.lastLayout;
		if (!base || (!preview && !this.previewLayout)) {
			return;
		}

		this.previewLayout = preview && { width: preview.width, height: preview.height, top: base.top + preview.dy, left: base.left + preview.dx };
		this.element.style.width = preview ? `${preview.width}px` : '';
		this.element.style.height = preview ? `${preview.height}px` : '';
		this.layoutCard();
	}

	private layoutCard(): void {
		const insets = this.cardInsets;
		this.card.style.inset = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
		// For the content, such as a row that reaches over the gap beside the card.
		this.card.style.setProperty('--part-grid-card-inset-right', `${insets.right}px`);
		this.card.style.setProperty('--part-grid-card-inset-left', `${insets.left}px`);

		const layout = this.previewLayout ?? this.lastLayout;
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

/**
 * The active editor of the group of a part an element is in.
 */
function describeEditorAt(part: IContentPart | undefined, element: HTMLElement): { readonly name: string; readonly icon: ThemeIcon | undefined } | undefined {
	const group = part?.groups.find(candidate => (candidate as Partial<IEditorGroupView>).element?.contains(element));
	const editor = group?.activeEditor;
	if (!editor) {
		return undefined;
	}

	const icon = editor.getIcon();
	return { name: editor.getName(), icon: ThemeIcon.isThemeIcon(icon) ? icon : undefined };
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
/**
 * The class of the cell of a part that does not move for now (see `PartGrid.setMovable`): it shows no grabber.
 */
const PART_GRID_IMMOVABLE_CLASS = 'part-grid-cell-immovable';

/**
 * The class of a grid whose cards are flush: the sash between two cards is on the top edge of the lower one, where its
 * grabber is, which then takes the pointer over the sash.
 */
const PART_GRID_GAPLESS_CLASS = 'part-grid-gapless';

export class PartGrid extends Disposable {

	private readonly gridDisposables = this._register(new MutableDisposable<DisposableStore>());
	private grid: PartGridLayout | undefined;

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
		container.classList.add(PART_GRID_GAPLESS_CLASS);
		this._register(toDisposable(() => PartGrid.grids.delete(this)));

		this.motion = this._register(new PartGridMotion({
			container,
			getCellElement: id => this.cells.get(id)?.element,
			getCard: id => this.cells.get(id)?.cardElement
		}));

		this._register(new PartGridDropTarget({
			container,
			isMotionEnabled: () => this.motion.isMotionEnabled(),
			getVisibleCells: () => this.getReflowCells(),
			canCreateParts: () => !!this.partFactory,
			getSourceCell: editors => this.getSourceCell(editors)?.id,
			previewNewPart: (editors, location) => {
				const source = this.getSourceCell(editors);
				const remaining = source?.part ? source.part.groups.reduce((count, group) => count + group.count, 0) - editors.length : 1;
				return this.previewNewPart(PART_GRID_NEW_PART_ID, location, source?.id, remaining <= 0, true);
			},
			moveEditorsIntoNewPart: (editors, location, copy) => this.moveEditorsIntoNewPart(editors, location, { copy, dropped: true }),
			splitsOnDragAndDrop: () => !!this.editorGroupsService.partOptions.splitOnDragAndDrop
		}));

		this.cardDrag = this._register(new PartGridCardDrag({
			container,
			isMotionEnabled: () => this.motion.isMotionEnabled(),
			getVisibleCells: () => this.getReflowCells(),
			canMerge: (id, targetId) => this.canMergeCell(id, targetId),
			previewArrangement: (id, drop) => this.previewArrangement(id, drop),
			drop: (id, drop) => this.dropCell(id, drop)
		}));

		// The grabber of a part shows while the pointer is over the part, also over what draws over it outside its card,
		// such as a webview, which the card's own hover does not see
		const targetWindow = getWindow(container);
		this._register(addDisposableListener(targetWindow.document, 'pointerover', e => {
			this.pointerInOverlay = false;
			this.overlayPointerCheck.schedule(PART_GRID_OVERLAY_POINTER_QUIET);
			const target = isHTMLElement(e.target) ? e.target : undefined;
			this.setPointerOverCellOrChrome(target ? this.findCellAt(target) : undefined);
			this.markPointerTarget(target);
		}, true));
		// Into the frame of a webview the window may have no event at all: once its events stop, the grid looks for what
		// draws over a part that the pointer is over
		this._register(addDisposableListener(targetWindow.document, 'pointermove', () => this.overlayPointerCheck.schedule(PART_GRID_OVERLAY_POINTER_QUIET), true));
		// Into what takes the pointer from the window while it is still over it, the window has a pointerout to nothing and
		// no event after it: into the frame of a webview, or into a region that moves the window, such as a title row. The
		// pointer is then where it was heading, unless that is outside the window
		this._register(addDisposableListener(targetWindow.document, 'pointerout', e => {
			this.overlayPointerCheck.schedule(PART_GRID_OVERLAY_POINTER_QUIET);
			if (isHTMLElement(e.relatedTarget)) {
				this.setPointerOverCellOrChrome(this.findCellAt(e.relatedTarget));
				this.markPointerTarget(e.relatedTarget);
				return;
			}
			this.setPointerOverCellAt(e.clientX + e.movementX, e.clientY + e.movementY);
		}, true));
		// Out of the window from inside a webview, whose frame keeps its pointer events, the window has no pointerout
		this._register(addDisposableListener(targetWindow.document.documentElement, EventType.MOUSE_LEAVE, e => this.setPointerOverCellAt(e.clientX, e.clientY)));
		// Without focus, the window does not look for the pointer over a webview, until it has focus or a pointer event again
		this._register(addDisposableListener(targetWindow, EventType.BLUR, () => {
			this.overlayPointerCheck.cancel();
			this.pointerInOverlay = false;
			this.setPointerOverCell(undefined);
		}));
		this._register(addDisposableListener(targetWindow, EventType.FOCUS, () => this.overlayPointerCheck.schedule(PART_GRID_OVERLAY_POINTER_QUIET)));
	}

	private pointerOverCard: HTMLElement | undefined;

	/**
	 * Marks the part of `cell`. Over a cell that is not a part, such as a title row across the window, the mark stays: the
	 * pointer goes from a part's title there to its grabber below it.
	 */
	private setPointerOverCellOrChrome(cell: PartGridCell | undefined): void {
		if (!cell || cell.part) {
			this.setPointerOverCell(cell);
		}
	}

	/**
	 * Marks the part that the pointer is over at `x`, `y`, as the window did not say: what draws over a part there, such as
	 * a webview, else the cell there. Outside the window, the pointer left it.
	 */
	private setPointerOverCellAt(x: number, y: number): void {
		const targetWindow = getWindow(this.container);
		if (x <= 0 || y <= 0 || x >= targetWindow.innerWidth - 1 || y >= targetWindow.innerHeight - 1) {
			this.setPointerOverCell(undefined);
			return;
		}

		const anchor = findOverlayAnchorAt(targetWindow.document, x, y, PART_GRID_OVERLAY_ENTRY_TOLERANCE);
		const cell = anchor ? this.findCellAt(anchor) : Array.from(this.cells.values()).find(candidate => {
			const rect = candidate.element.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
		});
		this.setPointerOverCellOrChrome(cell);
		this.markPointerTarget(undefined);
	}

	/** Whether the pointer is over what draws over a part, as {@link checkOverlayPointer} found, rather than over the window's elements. */
	private pointerInOverlay = false;
	private readonly overlayPointerCheck = this._register(new RunOnceScheduler(() => this.checkOverlayPointer(), PART_GRID_OVERLAY_POINTER_QUIET));

	/**
	 * Marks the part that the pointer is over what draws over it, such as a webview, and looks again while it is; once it
	 * is not, and no event of the window said where it went, the pointer left the window from there.
	 */
	private checkOverlayPointer(): void {
		const anchor = findOverlayAnchorUnderPointer(getWindow(this.container).document);
		if (anchor) {
			this.pointerInOverlay = true;
			this.setPointerOverCell(this.findCellAt(anchor));
			this.markPointerTarget(undefined);
			this.overlayPointerCheck.schedule(PART_GRID_OVERLAY_POINTER_POLL);
		} else if (this.pointerInOverlay) {
			this.pointerInOverlay = false;
			this.setPointerOverCell(undefined);
		}
	}

	private setPointerOverCell(cell: PartGridCell | undefined): void {
		const card = cell?.part ? cell.cardElement : undefined;
		if (card === this.pointerOverCard) {
			return;
		}

		this.pointerOverCard?.classList.remove(PART_GRID_POINTER_OVER_CLASS, PART_GRID_POINTER_OVER_TOP_STRIP_CLASS, PART_GRID_POINTER_OVER_GRABBER_CLASS);
		this.pointerOverCard = card;
		this.pointerOverDragHandle = cell?.part ? cell.dragHandle : undefined;
		card?.classList.add(PART_GRID_POINTER_OVER_CLASS);
	}

	private pointerOverDragHandle: HTMLElement | undefined;

	/**
	 * Marks the card the pointer is over while `target`, what the pointer is over, is the top strip of its part or its
	 * grabber; changing the classes only as the pointer moves between them.
	 */
	private markPointerTarget(target: HTMLElement | undefined): void {
		const card = this.pointerOverCard;
		if (!card) {
			return;
		}
		const topStrip = target?.closest(`.${PART_GRID_TOP_STRIP_CLASS}`);
		card.classList.toggle(PART_GRID_POINTER_OVER_TOP_STRIP_CLASS, !!topStrip && card.contains(topStrip));
		card.classList.toggle(PART_GRID_POINTER_OVER_GRABBER_CLASS, !!target && !!this.pointerOverDragHandle?.contains(target));
	}

	/**
	 * The cell that `target` is in, or that what `target` is in draws over.
	 */
	private findCellAt(target: HTMLElement): PartGridCell | undefined {
		const element = this.container.contains(target) ? target : findOverlayAnchorOf(target);
		if (!element) {
			return undefined;
		}

		for (const cell of this.cells.values()) {
			if (cell.element.contains(element)) {
				return cell;
			}
		}

		return undefined;
	}

	private readonly cardDrag: PartGridCardDrag;

	/**
	 * The cells that show, for what makes the cards make way.
	 */
	private getReflowCells(): IPartGridReflowCell[] {
		return Array.from(this.cells.values())
			.filter(cell => this.grid?.isViewVisible(cell) && this.isCellVisible(cell.id))
			.map(cell => ({
				id: cell.id, element: cell.element, card: cell.cardElement, isPart: !!cell.part, describeOverlay: anchor => describeEditorAt(cell.part, anchor),
				// A part that does not lay out in previews only shows clipped, laid out once the grid lays it out
				layoutPreview: preview => {
					if (!cell.part || this.previewLayoutAllowed(cell.id, cell.part)) {
						cell.layoutPreview(preview);
					}
				}
			}));
	}

	/**
	 * The cell of the part that editors are in.
	 */
	private getSourceCell(editors: readonly IEditorIdentifier[]): PartGridCell | undefined {
		const sourceGroup = editors.length ? this.editorGroupsService.getGroup(editors[0].groupId) : undefined;
		const sourcePart = sourceGroup ? this.editorGroupsService.getPart(sourceGroup) : undefined;
		return sourcePart ? Array.from(this.cells.values()).find(cell => cell.part && (cell.part as IEditorPart) === sourcePart) : undefined;
	}

	/**
	 * Starts dragging the card of a part by the pointer, from a pointer down
	 * on it, such as on its grabber or on room of its own that drags it: the
	 * card lifts once the pointer moves, follows it, and the other cards make
	 * way for it; dropped, the part moves there. Escape cancels. Returns
	 * whether the drag started, for a part that shows.
	 */
	startPartDrag(id: string, e: PointerEvent): boolean {
		return this.isCellMovable(id) && this.cardDrag.start(id, e);
	}

	/**
	 * Moves or merges a part dragged by its card, as dropped: once, with no
	 * glide, as the drag settles the cards itself.
	 */
	private dropCell(id: string, drop: PartGridCardDrop): void {
		if (hasKey(drop, { merge: true })) {
			// The part that merged goes away, and the cards glide to where that leaves them
			this.arrange(() => this.mergeCell(id, drop.merge));
			return;
		}

		const part = this.cells.get(id)?.part;
		if (!this.grid || this.cells.size < 2 || !part) {
			return;
		}

		placeInArrangement(this.arrangement(), this.getCell(id), cellId => this.getCell(cellId), drop.location, false, true);
		this.updateAllVisibility();
		status(localize('movedPart', "Moved {0}", getPartName(part)));
	}

	private mergeAllowed: (id: string, targetId: string) => boolean = () => true;
	private splitAllowed: (targetId: string, direction: Direction) => boolean = () => true;
	private previewLayoutAllowed: (id: string, part: IContentPart) => boolean = () => true;

	private movable: (id: string) => boolean = () => true;

	/**
	 * Whether a part moves: dragged by its card, or by a command such as
	 * Move Part. By default parts do; a window can say which do not, for as
	 * long as they do not, such as a part that shows only a little of itself.
	 * A part that does not move shows no grabber, so that what is on the edge
	 * of its card, such as a sash, takes the pointer there. Call
	 * {@link updateMovable} once what it says changes.
	 */
	setMovable(movable: (id: string) => boolean): IDisposable {
		this.movable = movable;
		this.updateMovable();

		return toDisposable(() => {
			if (this.movable === movable) {
				this.movable = () => true;
				this.updateMovable();
			}
		});
	}

	/**
	 * Whether the part of a cell moves, see {@link setMovable}.
	 */
	isCellMovable(id: string): boolean {
		return !!this.cells.get(id)?.part && this.movable(id);
	}

	/**
	 * Applies a change of which parts move, see {@link setMovable}.
	 */
	updateMovable(): void {
		for (const [id, cell] of this.cells) {
			cell.element.classList.toggle(PART_GRID_IMMOVABLE_CLASS, !!cell.part && !this.movable(id));
		}
	}

	/**
	 * Whether a part lays out at the sizes its card takes while cards make
	 * way, such as for a dragged card, so that what it shows fills the card.
	 * By default it does; a window can say which parts do not, such as those
	 * whose editors are costly to lay out, like terminals, whose processes
	 * resize: their cards only show clipped until the grid lays them out,
	 * such as once a drop moved them.
	 */
	setPreviewLayoutAllowed(allowed: (id: string, part: IContentPart) => boolean): void {
		this.previewLayoutAllowed = allowed;
	}

	/**
	 * Whether a part dropped on the center of another part merges into it,
	 * its editors joining that part. By default it does; a window can say
	 * that its parts do not merge, or which do not, such as one whose editor
	 * other editors cannot join. Where a part does not merge, the center of
	 * the part takes it beside, on the nearest side.
	 */
	setMergeAllowed(allowed: boolean | ((id: string, targetId: string) => boolean)): void {
		this.mergeAllowed = typeof allowed === 'boolean' ? () => allowed : allowed;
	}

	/**
	 * Whether a part dropped beside another part, on a side of it, splits the
	 * cell of that part there. By default it does; a window can say where it
	 * does not, such as beside a part that shows only a little of itself
	 * across the row it is in, which the row would hold the dropped part to:
	 * there, with no other part beyond that side, the dropped part goes to
	 * that edge of the window, as a drop at that edge does. Moves by command,
	 * such as Move Part, are not drops.
	 */
	setSplitAllowed(allowed: (targetId: string, direction: Direction) => boolean): void {
		this.splitAllowed = allowed;
	}

	private keepsSize(id: string): boolean {
		const cell = this.cells.get(id);
		return !!cell?.part && !!cell.options.keepsSize;
	}

	private canMergeCell(id: string, targetId: string): boolean {
		return id !== targetId && !!this.cells.get(id)?.part && !!this.cells.get(targetId)?.part && this.mergeAllowed(id, targetId);
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
		if (!this.cells.has(id)) {
			return undefined;
		}

		return this.preview((arrangement, stubOf) => {
			if (hasKey(drop, { merge: true })) {
				// A part that merges goes away, as a part without editors does
				arrangement.grid.setViewVisible(stubOf(id), false);
			} else {
				placeInArrangement(arrangement, stubOf(id), stubOf, drop.location, false, true);
			}
		});
	}

	/**
	 * Where the cards of the cells that show would be, in client
	 * coordinates, with a new part at a location, as
	 * {@link moveEditorsIntoNewPart} adds it for editors of the part of
	 * `sourceId`; under `newId`. `sourceEmpties`: the source part has no
	 * editors left, and hides.
	 */
	previewNewPart(newId: string, location: PartGridLocation, sourceId: string | undefined, sourceEmpties: boolean, dropped = false): Map<string, IPartGridRect> | undefined {
		const like = sourceId !== undefined ? this.cells.get(sourceId) : Array.from(this.cells.values()).find(cell => cell.part);
		if (!like || (hasKey(location, { reference: true }) && !this.cells.has(location.reference))) {
			return undefined;
		}

		return this.preview((arrangement, stubOf) => {
			placeInArrangement(arrangement, stubOf(newId), stubOf, location, true, dropped);
			if (sourceEmpties && sourceId !== undefined && this.cells.get(sourceId)?.part && !this.cells.get(sourceId)?.options.showWhileEmpty) {
				arrangement.grid.setViewVisible(stubOf(sourceId), false);
			}
		}, { id: newId, like });
	}

	/**
	 * A dry run of a change of the arrangement on a copy of the grid, with
	 * what stands in for its cells (and for a new cell, like another), laid
	 * out as the grid is: where the cards of the cells that show would be.
	 */
	private preview(change: (arrangement: IArrangement<PreviewView>, stubOf: (id: string) => PreviewView) => void, added?: { readonly id: string; readonly like: PartGridCell }): Map<string, IPartGridRect> | undefined {
		const current = this.grid;
		if (!current || !this.dimension || this.cells.size < (added ? 1 : 2)) {
			return undefined;
		}

		const state = current.serialize();
		const stubs = new Map<string, PreviewView>();
		const stubOf = (cellId: string) => {
			let stub = stubs.get(cellId);
			if (!stub) {
				stub = cellId === added?.id ? new PreviewView(added.like, cellId) : new PreviewView(this.getCell(cellId));
				stubs.set(cellId, stub);
			}
			return stub;
		};
		const cellOf = (stub: PreviewView) => stub.id === added?.id ? added.like : this.getCell(stub.id);
		// Laid out as the grid is, before the change, which changes the cells as the grid would
		const deserialize = (serialized: ISerializedGrid) => {
			const deserialized = SerializableGrid.deserialize<PreviewView>(serialized, { fromJSON: (data: { id: string }) => stubOf(data.id) }, { proportionalLayout: true });
			deserialized.layout(state.width, state.height);
			return deserialized;
		};

		let grid = deserialize(state);
		try {
			const arrangement: IArrangement<PreviewView> = {
				get grid() { return grid; },
				isPart: cellId => cellId === added?.id || !!this.cells.get(cellId)?.part,
				edgeChromeOf: cellId => this.cells.get(cellId)?.options.edgeChrome,
				keepsSize: cellId => cellId !== added?.id && this.keepsSize(cellId),
				splits: (cellId, direction) => this.splitAllowed(cellId, direction),
				replace: serialized => {
					const next = deserialize(serialized);
					grid.dispose();
					grid = next;
				}
			};
			change(arrangement, stubOf);
			// As the move will be: the pinned view spans the top of the grid
			if (this.pinnedTopView && stubs.has(this.pinnedTopView)) {
				pinViewToTop(arrangement, this.pinnedTopView);
			}
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
				const insets = cellOf(stub).getCardInsets(gapInsets);
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
	moveEditorsIntoNewPart(editors: readonly IEditorIdentifier[], location: PartGridLocation, options?: { readonly copy?: boolean; readonly dropped?: boolean }): string | undefined {
		const sourceGroup = editors.length ? this.editorGroupsService.getGroup(editors[0].groupId) : undefined;
		if (!this.partFactory || !sourceGroup) {
			return undefined;
		}

		const { id, part } = this.partFactory.createPart();
		const cell = this.register(id, { part });
		this.markCreated(id);
		if (this.grid) {
			// As every part put somewhere, with an even share of where it goes
			placeInArrangement(this.arrangement(), cell, cellId => this.getCell(cellId), location, true, !!options?.dropped);
			this.updateAllVisibility();
		} else {
			this.addCell(cell, location, undefined);
		}

		const targetGroup = part.activeGroup;
		const editorsWithOptions = editors.map(({ editor }) => ({ editor, options: { pinned: true } }));
		if (options?.copy) {
			sourceGroup.copyEditors(editorsWithOptions, targetGroup);
		} else {
			sourceGroup.moveEditors(editorsWithOptions, targetGroup);
		}
		if (!hasEditors(part)) {
			part.close();
			return undefined;
		}

		targetGroup.focus();
		status(options?.copy
			? localize('copiedEditorsIntoNewPart', "Copied {0} into a new part", editors[0].editor.getName())
			: localize('movedEditorsIntoNewPart', "Moved {0} into a new part", editors[0].editor.getName()));

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
		cell.element.classList.toggle(PART_GRID_IMMOVABLE_CLASS, !!cell.part && !this.movable(id));
		const disposables = new DisposableStore();
		this.cellDisposables.set(id, disposables);

		if (cell.part) {
			this.trackEditors(id, cell.part, disposables);

			// For what acts on the parts of the grid, such as Move Part
			const part = cell.part;
			const inPartGrid = this.editorGroupsService.getScopedInstantiationService(part).invokeFunction(accessor => EditorPartInPartGridContext.bindTo(accessor.get(IContextKeyService)));
			inPartGrid.set(true);
			disposables.add(toDisposable(() => inPartGrid.reset()));
		}

		if (cell.part && cell.dragHandle) {
			disposables.add(addDisposableListener(cell.dragHandle, EventType.POINTER_DOWN, e => this.startPartDrag(id, e)));
			// The empty space of the title of a group drags the part too
			disposables.add(addDisposableListener(cell.element, EventType.POINTER_DOWN, e => {
				if (getPartTitleDragSource(e.target, cell.element)) {
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
		// A cell that does not show, such as a part without editors, joins at its size without taking any room: the cells
		// beside it keep their sizes until it shows
		const invisible = !this.isCellVisible(cell.id);
		if (!this.grid) {
			this.setGrid(new PartGridLayout(cell, { proportionalLayout: true }));
		} else if (hasKey(location, { reference: true })) {
			const reference = this.getCell(location.reference);
			const referenceSize = this.grid.getViewSize(reference);
			const half = Math.round((location.direction === Direction.Up || location.direction === Direction.Down ? referenceSize.height : referenceSize.width) / 2);
			// Beside a cell that does not show either, it shows in the row or column they then share as before: that would
			// have nothing to show
			this.grid.addView(cell, invisible && this.grid.isViewVisible(reference) ? Sizing.Invisible(size ?? half) : size ?? Sizing.Split, reference, location.direction);
		} else {
			this.addAtEdge(cell, location.edge, size, donorId, invisible);
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
		disposables.add(part.onWillClose(() => this.removeCell(id)));

		if (!hasEditors(part)) {
			this.empty.add(id);
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

	private addAtEdge(cell: PartGridCell, edge: Direction, size: number | undefined, donorId?: string, invisible = false): void {
		addAtEdge(this.arrangement(), cell, edge, size, donorId, invisible);
	}

	/**
	 * The grid of the cells, for what arranges it, such as a move and the
	 * preview of where a dragged cell goes.
	 */
	private arrangement(): IArrangement<PartGridCell> {
		const partGrid = this;
		return {
			// The grid as it is now: a change can replace it
			get grid() { return partGrid.grid!; },
			isPart: id => !!this.cells.get(id)?.part,
			edgeChromeOf: id => this.cells.get(id)?.options.edgeChrome,
			keepsSize: id => this.keepsSize(id),
			splits: (id, direction) => this.splitAllowed(id, direction),
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

	private deserialize(state: ISerializedGrid): PartGridLayout {
		// The parts keep their shares of the grid as it is resized
		return PartGridLayout.fromState(state, { fromJSON: (data: { id: string }) => this.getCell(data.id) }, { proportionalLayout: true });
	}

	private setGrid(grid: PartGridLayout): void {
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

		if (cell.cardElement === this.pointerOverCard) {
			this.setPointerOverCell(undefined);
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
		if (!this.grid || this.cells.size < 2 || (cell.part && !this.movable(id))) {
			return false;
		}

		const before = this.describe();
		const neighbor = this.dimension ? this.grid.getNeighborViews(cell, direction).find(candidate => candidate.part && this.isCellVisible(candidate.id)) : undefined;
		const grid = this.grid;
		// At that edge already, the cells keep their places, sizes and focus
		const state = neighbor ? undefined : grid.serialize();
		const focused = getActiveElement();
		let moved = false;
		// The cells glide to where they end up, with their sizes
		this.arrange(() => {
			// Past the part beside it, or to the edge: as every part put somewhere, with an even share of where it goes
			placeInArrangement(this.arrangement(), cell, cellId => this.getCell(cellId), neighbor ? { reference: neighbor.id, direction } : { edge: direction }, false, false);
			this.updateAllVisibility();

			if (state && this.describe() === before) {
				this.setGrid(this.deserialize(state));
				this.updateAllVisibility();
				return;
			}

			moved = this.describe() !== before;
		});

		if (!moved && isHTMLElement(focused) && focused.isConnected && !isActiveElement(focused)) {
			focused.focus();
		}

		return moved;
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
		// Every change of the arrangement ends here: the view pinned to the top goes back there before the cells show
		this.keepPinnedViewOnTop();
		for (const id of this.cells.keys()) {
			this.updateVisibility(id);
		}

		this.applyLook();
		this._onDidChangeArrangement.fire();
	}

	/** The view that spans the top of the grid, whatever moves; see {@link setPinnedTopView}. */
	private pinnedTopView: string | undefined;

	/**
	 * Keeps the view `id`, such as the title row of a window, spanning the top of the grid: the first row of the grid,
	 * across all of it, with the rest of the grid below it. Every change of the arrangement keeps it there, such as a part
	 * moved or dropped at an edge of the grid, beside it, or a grid restored with it elsewhere, and so does the preview of
	 * a move. Without one, the arrangement is as the changes make it.
	 */
	setPinnedTopView(id: string | undefined): void {
		this.pinnedTopView = id;
		this.updateAllVisibility();
	}

	/** Moves the pinned view back to the top of the grid, unless it is there. */
	private keepPinnedViewOnTop(): void {
		if (!this.grid || !this.pinnedTopView) {
			return;
		}
		// Most changes leave it there, such as a cell that shows or hides: nothing to look at then
		const first = this.grid.getViews().children[0];
		if (this.grid.orientation === Orientation.VERTICAL && first && !isGridBranchNode(first) && first.view.id === this.pinnedTopView) {
			return;
		}
		pinViewToTop(this.arrangement(), this.pinnedTopView);
	}

	getCellSize(id: string): IViewSize {
		return this.grid ? this.grid.getViewSize(this.getCell(id)) : { width: 0, height: 0 };
	}

	/**
	 * The least size of a cell, with the frame of its card, which the grid
	 * holds it to.
	 */
	getCellMinimumSize(id: string): IViewSize {
		const cell = this.getCell(id);
		return { width: cell.minimumWidth, height: cell.minimumHeight };
	}

	/**
	 * Resizes a cell; a dimension left out keeps its size.
	 */
	resizeCell(id: string, size: Partial<IViewSize>): void {
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
		this.container.classList.toggle(PART_GRID_GAPLESS_CLASS, gap === 0);
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

		// Once the grid knows its neighbors, the look applies before the layout, so that it lays out once. A restored grid
		// knows the sizes of its rows and columns once laid out: first at the size it was arranged at, for the sizes kept below.
		if (!this.laidOut && grid.restoredSize) {
			grid.layout(grid.restoredSize.width, grid.restoredSize.height);
		}
		const kept = this.keptSizes(grid);
		if (this.laidOut) {
			this.applyLook(false);
			grid.layout(width, height);
		} else {
			grid.layout(width, height);
			this.laidOut = true;
			this.applyLook();
		}
		this.keepSizes(grid, kept);
	}

	/**
	 * Of each part that keeps its size, the shares that the others in its
	 * row or column had of what it left them, unrounded, and the sizes they
	 * got from them: as long as nothing else resized them since, such as
	 * the user dragging a sash or the grid arranged again, they keep these
	 * shares, so that resizing the grid back and forth gives the sizes back.
	 */
	private readonly keptShares = new WeakMap<PartGridCell, { readonly views: readonly (PartGridCell | undefined)[]; readonly sizes: readonly number[]; readonly shares: readonly number[] }>();

	/**
	 * The sizes of the cells that keep their sizes (see
	 * {@link PartGridCell.keepsSize}) along their rows or columns,
	 * and the shares the others in them have.
	 */
	private keptSizes(grid: PartGridLayout): Map<PartGridCell, { readonly size: number; readonly shares: readonly number[] }> {
		const kept = new Map<PartGridCell, { readonly size: number; readonly shares: readonly number[] }>();
		for (const cell of this.cells.values()) {
			const line = cell.keepsSize ? findLineOf(grid, cell) : undefined;
			if (!line || !grid.isViewVisible(cell)) {
				continue;
			}
			const others = othersInLine(line);
			const sizes = others.map(node => sizeAlong(node, line.orientation));
			const total = sizes.reduce((sum, size) => sum + size, 0);
			const remembered = this.keptShares.get(cell);
			const views = others.map(firstViewOf);
			const unchanged = remembered && equals(remembered.views, views) && equals(remembered.sizes, sizes);
			kept.set(cell, { size: sizeAlong(line.branch.children[line.index], line.orientation), shares: unchanged ? remembered.shares : sizes.map(size => total > 0 ? size / total : 1 / sizes.length) });
		}

		return kept;
	}

	/**
	 * Gives the parts that keep their sizes the sizes they had before the
	 * grid was laid out, the other parts in their rows or columns taking
	 * their shares of the rest, as they do as the grid is resized.
	 */
	private keepSizes(grid: PartGridLayout, kept: ReadonlyMap<PartGridCell, { readonly size: number; readonly shares: readonly number[] }>): void {
		for (const [cell, { size, shares }] of kept) {
			const line = findLineOf(grid, cell);
			if (!line) {
				continue;
			}
			// By index in the line, read again for each resize, as each resize changes the sizes of others in it
			const resize = (index: number, value: number) => {
				const current = findLineOf(grid, cell);
				const node = current?.branch.children[index];
				if (current && node && sizeAlong(node, line.orientation) !== value) {
					grid.resizeNode([...current.location, index], line.orientation, value);
				}
			};
			const others = othersInLine(line);
			const indexes = others.map(node => line.branch.children.indexOf(node));
			const keptSize = sizeAlong(line.branch.children[line.index], line.orientation);
			const total = others.reduce((sum, node) => sum + sizeAlong(node, line.orientation), 0) + keptSize - size;
			if (others.length < 2 || total <= 0 || shares.length !== others.length) {
				resize(line.index, size);
				continue;
			}

			// Rounded by where they end, so that the sizes add up to the total and each depends only on it and the shares
			let end = 0;
			const targets = shares.map(share => {
				const start = Math.round(end * total);
				end += share;
				return Math.round(end * total) - start;
			});

			// The last of the others takes what the rest leaves: each resize goes to the last flexible view of the line
			// that is not resized. The order keeps that view from going below the size it ends with: it grows first.
			const steps = others.slice(0, -1).map((node, index) => () => {
				const target = isGridBranchNode(node) ? targets[index] : Math.min(Math.max(targets[index], minimumAlong(node.view, line.orientation)), maximumAlong(node.view, line.orientation));
				resize(indexes[index], target);
			});
			const keep = () => resize(line.index, size);
			if (keptSize > size && line.index < indexes[indexes.length - 1]) {
				steps.unshift(keep);
			} else {
				steps.push(keep);
			}
			for (const step of steps) {
				step();
			}

			const after = findLineOf(grid, cell);
			if (after) {
				const othersAfter = othersInLine(after);
				this.keptShares.set(cell, { views: othersAfter.map(firstViewOf), sizes: othersAfter.map(node => sizeAlong(node, after.orientation)), shares });
			}
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

		const cells = this.getCellsInGrid(grid.getViews()).filter((cell, _index, all) => all.length === 1 || grid.isViewVisible(cell));

		// Read all frames before writing to any card
		const frames = cells.map(cell => cell.readFrame());

		let changed = false;
		cells.forEach((cell, index) => {
			const insets = cell.options.keepsNoGap ? NO_GRID_EDGE_INSETS : getGridEdgeInsets(grid, cell, this.gap, neighbor => grid.isViewVisible(neighbor) && !neighbor.options.keepsNoGap);
			changed = cell.setLook(insets, frames[index]) || changed;
		});

		updateGridGapSashes(grid, true, this.gap);

		// Insets change the size constraints of the cells
		if (changed && relayout) {
			grid.layout(grid.width, grid.height);
		}
	}

	/**
	 * The topology, sizes and visibility of the cells of the grid, without the
	 * state of the parts in them; see {@link createState}.
	 */
	serializeGrid(): ISerializedGrid | undefined {
		return this.grid?.serialize();
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

		const grid = partGrid.deserialize(state.grid);
		grid.restoredSize = { width: state.grid.width, height: state.grid.height };
		partGrid.setGrid(grid);
		partGrid.updateAllVisibility();

		return partGrid;
	}

	override dispose(): void {
		this.setPointerOverCell(undefined);
		this.cells.clear();

		super.dispose();
	}
}

/**
 * A view of an arrangement of cells: a cell of the grid, or what stands in
 * for it while previewing a move.
 */
interface IArrangedView extends ISerializableView {
	readonly id: string;
	toJSON(): object;
}

/**
 * The grid of an arrangement of cells, and what changes it.
 */
interface IArrangement<T extends IArrangedView> {
	readonly grid: SerializableGrid<T>;
	isPart(id: string): boolean;
	/** The edge of the window the view is chrome along, if it is; see {@link IPartGridViewOptions.edgeChrome}. */
	edgeChromeOf(id: string): Direction | undefined;
	/** Whether the view keeps its size; see {@link IPartGridPartOptions.keepsSize}. */
	keepsSize(id: string): boolean;
	/** Whether a part dropped beside the view `id` on the side `direction` splits its cell; see {@link PartGrid.setSplitAllowed}. */
	splits(id: string, direction: Direction): boolean;
	replace(state: ISerializedGrid): void;
}

/** Moves the view `id` of an arrangement back to the top of its grid, unless it is there; see {@link pinViewToTop}. */
function pinViewToTop<T extends IArrangedView>(arrangement: IArrangement<T>, id: string): void {
	const pinned = getGridWithViewOnTop(arrangement.grid.serialize(), id);
	if (pinned) {
		arrangement.replace(pinned);
	}
}

/**
 * The grid with the view `id` spanning its top: the first row of a column across the grid, with the rest of the grid
 * below it, as it was arranged, its rows taking the room the view leaves them in proportion. Undefined while the view
 * is there already, or not in the grid.
 */
export function getGridWithViewOnTop(state: ISerializedGrid, id: string): ISerializedGrid | undefined {
	const isPinned = (node: ISerializedNode) => node.type === 'leaf' && (node.data as { id: string }).id === id;
	if (state.root.type !== 'branch' || (state.orientation === Orientation.VERTICAL && isPinned(state.root.data[0]))) {
		return undefined;
	}

	// Takes the view out of where it is: the node beside it takes its room, and a row or column left with one node is
	// that node, in its parent, as the grid has it
	let pinned: ISerializedNode | undefined;
	const without = (children: readonly ISerializedNode[]): ISerializedNode[] => {
		const result: ISerializedNode[] = [];
		let removedAt: number | undefined;
		for (const child of children) {
			if (isPinned(child)) {
				pinned = child;
				removedAt = result.length;
			} else if (child.type === 'branch') {
				const inner = without(child.data);
				if (inner.length !== 1) {
					// A branch with nothing visible left is hidden, as the grid serializes it
					const visible = inner.some(node => node.visible !== false);
					result.push(visible ? { ...child, data: inner } : { ...child, data: inner, visible: false });
				} else if (inner[0].type === 'branch') {
					// Its row or column across this one: its nodes go into this one, as they are along it
					result.push(...inner[0].data);
				} else {
					result.push({ ...inner[0], size: child.size });
				}
			} else {
				result.push(child);
			}
		}
		if (removedAt !== undefined && pinned && pinned.visible !== false && result.length) {
			const neighbor = Math.min(removedAt, result.length - 1);
			result[neighbor] = scaleAlong(result[neighbor], result[neighbor].size + pinned.size);
		}
		return result;
	};
	let rest = without(state.root.data);
	if (!pinned) {
		return undefined;
	}
	let orientation = state.orientation;
	if (rest.length === 1 && rest[0].type === 'leaf') {
		// One cell left: right below the view
		orientation = Orientation.VERTICAL;
	} else if (rest.length === 1 && rest[0].type === 'branch') {
		// The root holds one row or column: that one is the root, across the other way
		orientation = orthogonal(orientation);
		rest = rest[0].data;
	}

	// The view at the top, with its height; what is below it takes the rest, in proportion to how it was arranged
	const height = Math.max(0, state.height - (pinned.visible === false ? 0 : Math.min(pinned.size, state.height)));
	let below: ISerializedNode[];
	if (orientation === Orientation.VERTICAL) {
		const total = rest.reduce((sum, node) => sum + (node.visible === false ? 0 : node.size), 0) || 1;
		below = rest.map(node => node.visible === false ? node : scaleAlong(node, Math.round(node.size * height / total)));
		const lastVisible = below.map(node => node.visible !== false).lastIndexOf(true);
		if (lastVisible >= 0) {
			const sum = below.reduce((value, node) => value + (node.visible === false ? 0 : node.size), 0);
			below[lastVisible] = scaleAlong(below[lastVisible], below[lastVisible].size + height - sum);
		}
	} else {
		below = [scaleAlong({ type: 'branch', data: rest, size: state.height }, height)];
	}
	return { root: { type: 'branch', data: [pinned, ...below], size: state.width }, orientation: Orientation.VERTICAL, width: state.width, height: state.height };
}

function addAtEdge<T extends IArrangedView>(arrangement: IArrangement<T>, cell: T, edge: Direction, size: number | undefined, donorId?: string, invisible = false): void {
	const grid = arrangement.grid;
	const orientation = edge === Direction.Up || edge === Direction.Down ? Orientation.VERTICAL : Orientation.HORIZONTAL;
	const atEnd = edge === Direction.Right || edge === Direction.Down;
	if (addBesideSpanningViews(arrangement, cell, orientation, atEnd, size, invisible)) {
		return;
	}
	if (addAtEdgeOfParts(arrangement, cell, orientation, atEnd, size, donorId, invisible)) {
		return;
	}

	const root = grid.getViews();
	const edgeChild = root.children[atEnd ? root.children.length - 1 : 0];
	const extent = orientation === Orientation.VERTICAL ? grid.height : grid.width;

	// Beside the only cell, or beside a cell at that edge of the root
	// along the grid's orientation, the grid adds it in place
	if (!isGridBranchNode(edgeChild) && (root.children.length === 1 || (grid.orientation === orientation && donorId === undefined))) {
		grid.addView(cell, invisible ? Sizing.Invisible(size ?? Math.round(extent / (root.children.length + 1))) : size ?? Sizing.Distribute, edgeChild.view, edge);
		return;
	}

	// Otherwise the grid is rebuilt with the cell at the edge of its root
	const state = grid.serialize();
	const children = state.root.type === 'branch' ? state.root.data : [state.root];
	let cellSize = Math.min(size ?? Math.round(extent / (grid.orientation === orientation ? root.children.length + 1 : 2)), extent);
	let newRoot: ISerializedNode;
	if (grid.orientation === orientation) {
		const donated = invisible ? { children, size: cellSize } : takeRoom(arrangement, children, cellSize, size, donorId);
		cellSize = donated.size;
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize, ...(invisible ? { visible: false } : {}) };
		newRoot = { ...state.root, type: 'branch', data: atEnd ? [...donated.children, added] : [added, ...donated.children] };
	} else {
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize, ...(invisible ? { visible: false } : {}) };
		const rest: ISerializedNode = { type: 'branch', data: children, size: invisible ? extent : Math.max(0, extent - cellSize) };
		newRoot = { type: 'branch', data: atEnd ? [rest, added] : [added, rest], size: orientation === Orientation.VERTICAL ? state.width : state.height };
	}
	arrangement.replace({ root: newRoot, orientation, width: state.width, height: state.height });
}

/**
 * Adds a cell at an edge of the window beside the parts, but not beside the
 * chrome along the edges beside it, such as a strip at the right of the
 * window, at the ends of the row or column across that edge: the chrome keeps
 * spanning past the cell. Returns whether it added the cell: not without such
 * chrome there.
 */
function addBesideSpanningViews<T extends IArrangedView>(arrangement: IArrangement<T>, cell: T, orientation: Orientation, atEnd: boolean, size: number | undefined, invisible: boolean): boolean {
	const state = arrangement.grid.serialize();
	// Chrome along the left or right edge spans the window from top to bottom, beside cells at its top or bottom edge
	const spansAlongEdge = (id: string) => {
		const edge = arrangement.edgeChromeOf(id);
		return edge !== undefined && (edge === Direction.Left || edge === Direction.Right) === (orientation === Orientation.VERTICAL);
	};
	const isSpanning = (node: ISerializedNode | undefined) => node?.type === 'leaf' && spansAlongEdge((node.data as { id: string }).id);
	const path: number[] = [];
	let node = state.root;
	let nodeOrientation = state.orientation;
	let extent = orientation === Orientation.VERTICAL ? state.height : state.width;
	// Along the edge's orientation, to what is at that edge: the row or column across the edge. Views that are not parts
	// there, such as a title row pinned at the top of the window, also while it hides, stay where they are, past the cell.
	const isView = (child: ISerializedNode) => child.type === 'leaf' && !arrangement.isPart((child.data as { id: string }).id);
	while (node.type === 'branch' && nodeOrientation === orientation && node.data.length) {
		let index = atEnd ? node.data.length - 1 : 0;
		while (isView(node.data[index]) && (atEnd ? index > 0 : index < node.data.length - 1)) {
			index += atEnd ? -1 : 1;
		}
		path.push(index);
		node = node.data[index];
		extent = node.size ?? extent;
		nodeOrientation = orthogonal(nodeOrientation);
	}
	if (node.type !== 'branch') {
		return false;
	}

	let start = 0;
	while (start < node.data.length && isSpanning(node.data[start])) {
		start++;
	}
	let end = node.data.length;
	while (end > start && isSpanning(node.data[end - 1])) {
		end--;
	}
	const parts = node.data.slice(start, end);
	if (!parts.length || (start === 0 && end === node.data.length)) {
		return false;
	}

	const [only] = parts;
	const shows = (child: ISerializedNode) => child.type !== 'leaf' || child.visible !== false;
	// Not where nothing else in that column (or row) shows, which would then have nothing to show
	const hides = invisible && (parts.length !== 1 || only.type !== 'branch' || only.data.some(shows));
	const cellSize = Math.min(size ?? Math.round(extent / 2), extent);
	const rest = hides ? extent : Math.max(0, extent - cellSize);
	const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize, ...(hides ? { visible: false } : {}) };
	let beside: ISerializedNode;
	if (parts.length === 1 && only.type === 'branch') {
		// A column (or row) along the edge already: the cell joins it at that end, and what shows in it makes room. Hidden
		// children take no room: they keep the size they had, to show at again.
		const total = only.data.reduce((sum, child) => sum + (shows(child) ? child.size ?? 0 : 0), 0);
		const factor = total ? rest / total : 1;
		const data = only.data.map(child => shows(child) ? { ...child, size: Math.round((child.size ?? 0) * factor) } : child);
		beside = { ...only, data: atEnd ? [...data, added] : [added, ...data] };
	} else {
		const inner: ISerializedNode = parts.length === 1 ? { ...only, size: rest } : { type: 'branch', data: parts, size: rest };
		beside = { type: 'branch', data: atEnd ? [inner, added] : [added, inner], size: parts.reduce((sum, child) => sum + (child.size ?? 0), 0) };
	}
	const replacement: ISerializedNode = { ...node, data: [...node.data.slice(0, start), beside, ...node.data.slice(end)] };

	const replace = (current: ISerializedNode, depth: number): ISerializedNode => depth === path.length || current.type !== 'branch'
		? replacement
		: { ...current, data: current.data.map((child, childIndex) => childIndex === path[depth] ? replace(child, depth + 1) : child) };
	arrangement.replace({ ...state, root: replace(state.root, 0) });

	return true;
}

/**
 * Views that are not parts, such as a title row, can span the window
 * beside the parts. The edges of the window are then the edges of what
 * holds the parts: a cell added there goes beside the parts, and the
 * views keep spanning the window. Returns whether it added the cell.
 */
function addAtEdgeOfParts<T extends IArrangedView>(arrangement: IArrangement<T>, cell: T, orientation: Orientation, atEnd: boolean, size: number | undefined, donorId: string | undefined, invisible: boolean): boolean {
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
	const hidden = invisible ? { visible: false } : {};
	if (nodeOrientation === orientation) {
		const donated = invisible ? { children: node.data, size: cellSize } : takeRoom(arrangement, node.data, cellSize, size, donorId);
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: donated.size, ...hidden };
		replacement = { ...node, data: [...donated.children.slice(0, index), added, ...donated.children.slice(index)] };
	} else {
		const added: ISerializedNode = { type: 'leaf', data: cell.toJSON(), size: cellSize, ...hidden };
		const rest: ISerializedNode = { type: 'branch', data: node.data, size: invisible ? node.size ?? extent : Math.max(0, (node.size ?? extent) - cellSize) };
		replacement = { type: 'branch', data: atEnd ? [rest, added] : [added, rest], size: node.size };
	}

	const replace = (current: ISerializedNode, depth: number): ISerializedNode => depth === path.length || current.type !== 'branch'
		? replacement
		: { ...current, data: current.data.map((child, childIndex) => childIndex === path[depth] ? replace(child, depth + 1) : child) };
	arrangement.replace({ ...state, root: replace(state.root, 0) });

	return true;
}

/**
 * A node of a grid at `size` along the orientation of its branch: what is
 * in it along that orientation, such as the cells of a row in a row in it,
 * takes its share in proportion too, rather than the last of them all of it.
 */
/**
 * The row or column that a cell is in, where it is in the grid, the index
 * of the cell in it, and whether it is a row or a column.
 */
function findLineOf(grid: Grid<PartGridCell>, cell: PartGridCell): { readonly branch: GridBranchNode<PartGridCell>; readonly location: GridLocation; readonly index: number; readonly orientation: Orientation } | undefined {
	const find = (branch: GridBranchNode<PartGridCell>, location: GridLocation, orientation: Orientation): ReturnType<typeof findLineOf> => {
		for (let index = 0; index < branch.children.length; index++) {
			const child = branch.children[index];
			const found = isGridBranchNode(child) ? find(child, [...location, index], orthogonal(orientation)) : child.view === cell ? { branch, location, index, orientation } : undefined;
			if (found) {
				return found;
			}
		}

		return undefined;
	};

	return find(grid.getViews(), [], grid.orientation);
}

/**
 * The others in the row or column of a cell that keeps its size, which
 * make room for it: rows or columns across it, and parts that show, can be
 * resized and do not keep their sizes either.
 */
function othersInLine(line: { readonly branch: GridBranchNode<PartGridCell>; readonly index: number; readonly orientation: Orientation }): GridNode<PartGridCell>[] {
	return line.branch.children.filter((node, index) => index !== line.index && (isGridBranchNode(node) || (!node.view.keepsSize && node.cachedVisibleSize === undefined && maximumAlong(node.view, line.orientation) > minimumAlong(node.view, line.orientation))));
}

/**
 * The first view in a node, which tells it from others: a row or column
 * across it by the first view in it, at any depth.
 */
function firstViewOf(node: GridNode<PartGridCell>): PartGridCell | undefined {
	return isGridBranchNode(node) ? (node.children.length ? firstViewOf(node.children[0]) : undefined) : node.view;
}

function sizeAlong(node: GridNode<PartGridCell>, orientation: Orientation): number {
	return orientation === Orientation.VERTICAL ? node.box.height : node.box.width;
}

function minimumAlong(view: IView, orientation: Orientation): number {
	return orientation === Orientation.VERTICAL ? view.minimumHeight : view.minimumWidth;
}

function maximumAlong(view: IView, orientation: Orientation): number {
	return orientation === Orientation.VERTICAL ? view.maximumHeight : view.maximumWidth;
}

function scaleAlong(node: ISerializedNode, size: number): ISerializedNode {
	const factor = node.size ? size / node.size : 1;
	const scale = (inner: ISerializedNode): ISerializedNode => {
		const scaled = Math.round(inner.size * factor);
		if (inner.type !== 'branch') {
			return { ...inner, size: scaled };
		}
		return { ...inner, size: scaled, data: inner.data.map(child => child.type === 'branch' ? { ...child, data: child.data.map(scale) } : child) };
	};
	if (node.type !== 'branch') {
		return { ...node, size };
	}

	return { ...node, size, data: node.data.map(child => child.type === 'branch' ? { ...child, data: child.data.map(scale) } : child) };
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
 * Puts a part where the user puts it, beside another view or at an edge of
 * the window, moved there (`adding` false) or added: the same way for every
 * gesture, a drop or a command, so that the same place gives the same size.
 * Dropped beside a part, it splits the cell of that part, unless the part
 * takes no part beside it on that side (see {@link IArrangement.splits}):
 * then, with no part beyond it on that side, it goes to that edge of the
 * window, as a drop there does. It then takes an even share of the row or
 * column it joins (see {@link giveEvenShare}), or, for a part that keeps its
 * size dropped into a row or column as the one it was in, that size.
 */
function placeInArrangement<T extends IArrangedView>(arrangement: IArrangement<T>, view: T, getView: (id: string) => T, location: PartGridLocation, adding: boolean, dropped: boolean): void {
	const resolved = dropped ? toEdgeIfNotSplit(arrangement, view, getView, location) : location;
	// The sizes before, which the other parts make room in proportion to
	const before = getViewSizes(arrangement.grid);
	const keptAlong = dropped && !adding && arrangement.keepsSize(view.id) ? findLineOfView(arrangement.grid.serialize(), view.id)?.orientation : undefined;
	if (hasKey(resolved, { reference: true })) {
		if (adding) {
			arrangement.grid.addView(view, Sizing.Split, getView(resolved.reference), resolved.direction);
		} else {
			arrangement.grid.moveView(view, Sizing.Distribute, getView(resolved.reference), resolved.direction);
		}
	} else {
		if (!adding) {
			arrangement.grid.removeView(view);
		}
		addAtEdge(arrangement, view, resolved.edge, undefined);
	}

	giveEvenShare(arrangement, view, before, getView, keptAlong);
}

function getViewSizes<T extends IArrangedView>(grid: SerializableGrid<T>): Map<string, IViewSize> {
	const sizes = new Map<string, IViewSize>();
	const collect = (node: GridNode<T>) => {
		if (isGridBranchNode(node)) {
			node.children.forEach(collect);
		} else if (grid.isViewVisible(node.view)) {
			sizes.set(node.view.id, grid.getViewSize(node.view));
		}
	};
	collect(grid.getViews());
	return sizes;
}

/**
 * Beside a part that takes no part beside it on that side, with no other
 * part beyond it on that side, the edge of the window on that side.
 */
function toEdgeIfNotSplit<T extends IArrangedView>(arrangement: IArrangement<T>, view: T, getView: (id: string) => T, location: PartGridLocation): PartGridLocation {
	if (!hasKey(location, { reference: true }) || arrangement.splits(location.reference, location.direction)) {
		return location;
	}

	const grid = arrangement.grid;
	const reference = getView(location.reference);
	const beyond = grid.getNeighborViews(reference, location.direction).filter(neighbor => neighbor !== view && arrangement.isPart(neighbor.id) && grid.isViewVisible(neighbor));
	return beyond.length ? location : { edge: location.direction };
}

/**
 * The row or column the view `id` is in, in a serialized grid: the path of
 * its branch and its orientation.
 */
function findLineOfView(state: ISerializedGrid, id: string): { readonly path: number[]; readonly orientation: Orientation } | undefined {
	const isView = (node: ISerializedNode) => node.type === 'leaf' && (node.data as { id: string }).id === id;
	const findLine = (node: ISerializedNode, orientation: Orientation, path: number[]): { readonly path: number[]; readonly orientation: Orientation } | undefined => {
		if (node.type !== 'branch') {
			return undefined;
		}
		if (node.data.some(isView)) {
			return { path, orientation };
		}
		for (let i = 0; i < node.data.length; i++) {
			const found = findLine(node.data[i], orthogonal(orientation), [...path, i]);
			if (found) {
				return found;
			}
		}
		return undefined;
	};
	return findLine(state.root, state.orientation, []);
}

/**
 * Gives a part an even share of the row or column it is in, of the parts
 * that show there: the other parts make room in proportion to their sizes,
 * and views that are not parts, such as a title row, keep theirs. A part that
 * keeps its size, in a row or column along `keptAlong`, the orientation of
 * the one it was in, keeps the size it had along it instead. Its least and
 * most sizes hold.
 */
function giveEvenShare<T extends IArrangedView>(arrangement: IArrangement<T>, view: T, before: ReadonlyMap<string, IViewSize>, getView: (id: string) => T, keptAlong?: Orientation): void {
	const state = arrangement.grid.serialize();
	const id = view.id;
	const isView = (node: ISerializedNode) => node.type === 'leaf' && (node.data as { id: string }).id === id;
	const line = findLineOfView(state, id);
	if (!line) {
		return;
	}

	const nodeAt = (path: number[]) => path.reduce<ISerializedNode>((node, index) => (node as Extract<ISerializedNode, { type: 'branch' }>).data[index], state.root);
	const branch = nodeAt(line.path) as Extract<ISerializedNode, { type: 'branch' }>;
	const shows = (node: ISerializedNode) => node.type === 'branch' || node.visible !== false;
	const isPart = (node: ISerializedNode) => node.type === 'branch' || arrangement.isPart((node.data as { id: string }).id);
	const shown = branch.data.filter(node => shows(node) && isPart(node));
	const sizeOf = (node: ISerializedNode) => node.size ?? 0;
	const total = shown.reduce((sum, node) => sum + sizeOf(node), 0);
	const placed = branch.data.find(isView)!;
	if (shown.length < 2 || !shows(placed) || total <= 0) {
		return;
	}

	const horizontal = line.orientation === Orientation.HORIZONTAL;
	const [minimum, maximum] = horizontal ? [view.minimumWidth, view.maximumWidth] : [view.minimumHeight, view.maximumHeight];

	// The least size of a node along the line: of what is along the line in it, the sum; of what is across it, the most
	const minimumOf = (node: ISerializedNode, orientation: Orientation): number => {
		if (node.type !== 'branch') {
			const leaf = getView((node.data as { id: string }).id);
			return horizontal ? leaf.minimumWidth : leaf.minimumHeight;
		}
		const minimums = node.data.filter(shows).map(child => minimumOf(child, orthogonal(orientation)));
		return orientation === line.orientation ? minimums.reduce((sum, value) => sum + value, 0) : Math.max(0, ...minimums);
	};

	// What a node took along the line before, from the sizes of its views then: the sum of what is along the line in it,
	// the most of what is across it
	const extentBefore = (node: ISerializedNode, orientation: Orientation): number => {
		if (node.type !== 'branch') {
			const size = before.get((node.data as { id: string }).id);
			return size ? (horizontal ? size.width : size.height) : sizeOf(node);
		}
		const extents = node.data.filter(shows).map(child => extentBefore(child, orthogonal(orientation)));
		return orientation === line.orientation ? extents.reduce((sum, extent) => sum + extent, 0) : Math.max(0, ...extents);
	};
	const others = shown.filter(node => node !== placed);
	const weights = others.map(node => extentBefore(node, orthogonal(line.orientation)));
	const minimums = others.map(node => minimumOf(node, orthogonal(line.orientation)));
	if (!others.length || weights.every(weight => weight <= 0)) {
		return;
	}

	// The share leaves the others room for their least sizes; a part that keeps its size along the line keeps it instead
	const kept = keptAlong === line.orientation ? before.get(id) : undefined;
	const requested = kept ? (horizontal ? kept.width : kept.height) : total / shown.length;
	const share = Math.round(Math.max(Math.min(requested, maximum, total - minimums.reduce((sum, value) => sum + value, 0)), minimum));

	// The others make room in proportion to their sizes, those that would get less than their least size keeping that,
	// the last taking what rounding leaves, and so do the parts in them
	const sizes = new Array<number>(others.length);
	const fixed = new Set<number>();
	for (let changed = true; changed;) {
		changed = false;
		const free = others.map((_, index) => index).filter(index => !fixed.has(index));
		const room = total - share - Array.from(fixed).reduce((sum, index) => sum + minimums[index], 0);
		const weightTotal = free.reduce((sum, index) => sum + weights[index], 0);
		for (const index of free) {
			sizes[index] = weightTotal > 0 ? weights[index] * room / weightTotal : room / free.length;
			if (sizes[index] < minimums[index]) {
				sizes[index] = minimums[index];
				fixed.add(index);
				changed = true;
			}
		}
	}
	let left = total - share;
	const resizedNodes = new Map<ISerializedNode, ISerializedNode>([[placed, { ...placed, size: share }]]);
	others.forEach((node, index) => {
		const size = index === others.length - 1 ? left : Math.round(sizes[index]);
		resizedNodes.set(node, scaleAlong(node, size));
		left -= size;
	});
	if (Array.from(resizedNodes).every(([node, resized]) => Math.abs(sizeOf(node) - sizeOf(resized)) <= 1)) {
		return;
	}
	const resized: ISerializedNode = { ...branch, data: branch.data.map(node => resizedNodes.get(node) ?? node) };

	const replace = (node: ISerializedNode, depth: number): ISerializedNode => depth === line.path.length || node.type !== 'branch'
		? resized
		: { ...node, data: node.data.map((child, index) => index === line.path[depth] ? replace(child, depth + 1) : child) };
	arrangement.replace({ ...state, root: replace(state.root, 0) });
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

	constructor(cell: PartGridCell, id = cell.id) {
		this.id = id;
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
		return { id: this.id };
	}
}
