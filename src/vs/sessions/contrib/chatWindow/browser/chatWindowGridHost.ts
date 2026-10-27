/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { ISerializableView, ISerializedGrid, ISerializedNode, IViewSize, Orientation, SerializableGrid } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IGridEdgeInsets, NO_GRID_EDGE_INSETS, updateGridGapSashes } from '../../../browser/parts/gridGap.js';
import { diffSessionGridLayout, ISessionGridLayout, ISessionGridLayoutBranch, SessionGridCell, SessionGridLayoutNode } from '../../../common/sessionGridLayout/sessionGridLayout.js';

/** What a cell of a chat window shows: the chat, the editor area, the terminals or the Session Activity Bar. */
export interface IChatWindowCellContent {
	readonly element: HTMLElement;
	layout(width: number, height: number, top: number, left: number): void;
	setVisible?(visible: boolean): void;
}

/** The size limits of a cell. The grid host sets them itself and never asks the content, which must not be measured while the grid changes. */
export interface IChatWindowCellConstraints {
	readonly minimumWidth: number;
	readonly maximumWidth: number;
	readonly minimumHeight: number;
	readonly maximumHeight: number;
}

/**
 * A cell of the grid of a chat window: a view of the grid that shows its content as a card, inset by the gap it shares
 * with the cells beside it.
 */
export class ChatWindowCellView extends Disposable implements ISerializableView {

	readonly element: HTMLElement;
	private readonly _card: HTMLElement;

	private _constraints: IChatWindowCellConstraints;
	get minimumWidth(): number { return this._constraints.minimumWidth; }
	get maximumWidth(): number { return this._constraints.maximumWidth; }
	get minimumHeight(): number { return this._constraints.minimumHeight; }
	get maximumHeight(): number { return this._constraints.maximumHeight; }

	private readonly _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	private _insets: IGridEdgeInsets = NO_GRID_EDGE_INSETS;
	private _content: IChatWindowCellContent | undefined;
	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	constructor(readonly cell: SessionGridCell, constraints: IChatWindowCellConstraints) {
		super();
		this._constraints = constraints;
		this.element = $(`.chat-window-cell.chat-window-cell-${cell}`);
		this._card = append(this.element, $('.chat-window-cell-card'));
	}

	/** The content of the card, which this cell lays out. */
	setContent(content: IChatWindowCellContent | undefined): void {
		if (this._content === content) {
			return;
		}
		this._content?.element.remove();
		this._content = content;
		if (content) {
			this._card.appendChild(content.element);
			this._layoutContent();
		}
	}

	get content(): IChatWindowCellContent | undefined {
		return this._content;
	}

	setConstraints(constraints: IChatWindowCellConstraints): void {
		const current = this._constraints;
		if (current.minimumWidth === constraints.minimumWidth && current.maximumWidth === constraints.maximumWidth && current.minimumHeight === constraints.minimumHeight && current.maximumHeight === constraints.maximumHeight) {
			return;
		}
		this._constraints = constraints;
		this._onDidChange.fire(undefined);
	}

	/** The gap to the cells beside it, which the card is inset by. */
	setInsets(insets: IGridEdgeInsets): void {
		if (this._insets.top === insets.top && this._insets.right === insets.right && this._insets.bottom === insets.bottom && this._insets.left === insets.left) {
			return;
		}
		this._insets = insets;
		this._card.style.inset = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
		this._layoutContent();
	}

	layout(width: number, height: number, top: number, left: number): void {
		this._lastLayout = { width, height, top, left };
		this._layoutContent();
	}

	private _layoutContent(): void {
		const layout = this._lastLayout;
		if (!layout || !this._content) {
			return;
		}
		const insets = this._insets;
		this._content.layout(Math.max(0, layout.width - insets.left - insets.right), Math.max(0, layout.height - insets.top - insets.bottom), layout.top + insets.top, layout.left + insets.left);
	}

	setVisible(visible: boolean): void {
		this.element.classList.toggle('hidden', !visible);
		this._content?.setVisible?.(visible);
	}

	toJSON(): object {
		return { type: this.cell };
	}
}

function isBranch(node: SessionGridLayoutNode): node is ISessionGridLayoutBranch {
	return 'children' in node;
}

function isVisible(node: SessionGridLayoutNode): boolean {
	return isBranch(node) ? node.children.some(isVisible) : node.visible;
}

/**
 * The gap each visible cell of `topology` keeps to the visible cells beside it, split between the two: the cells show as
 * cards with `gap` between them, and none at the edges of the window. Computed from the topology alone, so that the grid
 * is never measured while it changes.
 */
export function getChatWindowCellInsets(topology: ISessionGridLayoutBranch, gap: number): Map<SessionGridCell, IGridEdgeInsets> {
	const result = new Map<SessionGridCell, IGridEdgeInsets>();
	const before = Math.floor(gap / 2);
	const after = gap - before;
	const visit = (node: SessionGridLayoutNode, neighbors: { top: boolean; right: boolean; bottom: boolean; left: boolean }) => {
		if (!isBranch(node)) {
			if (node.visible) {
				result.set(node.cell, gap > 0 ? {
					top: neighbors.top ? before : 0,
					right: neighbors.right ? after : 0,
					bottom: neighbors.bottom ? after : 0,
					left: neighbors.left ? before : 0,
				} : NO_GRID_EDGE_INSETS);
			}
			return;
		}
		const visibleChildren = node.children.filter(isVisible);
		visibleChildren.forEach((child, index) => {
			const first = index === 0;
			const last = index === visibleChildren.length - 1;
			visit(child, node.orientation === 'row'
				? { ...neighbors, left: neighbors.left || !first, right: neighbors.right || !last }
				: { ...neighbors, top: neighbors.top || !first, bottom: neighbors.bottom || !last });
		});
	};
	visit(topology, { top: false, right: false, bottom: false, left: false });
	return result;
}

/** How a cell takes its share of a branch when it has no size of its own yet: a fixed size, or a share of the room left. */
export type ChatWindowCellSizing = { readonly kind: 'fixed'; readonly size: number } | { readonly kind: 'share'; readonly share: number };

/** The default sizing of `cell` along the width (`row`) or the height (`column`) of the window. */
export type ChatWindowDefaultSizing = (cell: SessionGridCell, axis: 'row' | 'column', total: number) => ChatWindowCellSizing;

interface IBox { readonly width: number; readonly height: number }

/**
 * Lays out the cells of a chat window in a grid, as {@link computeSessionGridLayout} computes for its state. A new topology
 * rebuilds the grid with the same cell views and their sizes; a change of visibility only shows or hides cells. The grid is
 * never read while it changes.
 */
export class ChatWindowGridHost extends Disposable {

	private readonly _gridDisposables = this._register(new DisposableStore());
	private _grid: SerializableGrid<ChatWindowCellView> | undefined;
	private _layout: ISessionGridLayout | undefined;
	private _dimension: IBox | undefined;
	private _gap = 0;

	/**
	 * The last size of each cell while it showed, per topology: a mode keeps the sizes it showed with when it is shown
	 * again, as the chat's width beside the editor area must not become the chat's full width alone. The terminals carry
	 * their size across topologies, as their height does not depend on what is beside them.
	 */
	private readonly _sizes = new Map<string, Map<SessionGridCell, IBox>>();
	private _terminalsSize: IBox | undefined;

	private _rebuilds = 0;
	/** How many times the grid was rebuilt; a change of visibility only does not rebuild it. */
	get rebuilds(): number { return this._rebuilds; }

	private readonly _onDidLayoutCells = this._register(new Emitter<void>());
	/** Fires when the cells were laid out again, such as after a rebuild or a sash drag. */
	readonly onDidLayoutCells: Event<void> = this._onDidLayoutCells.event;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _cells: ReadonlyMap<SessionGridCell, ChatWindowCellView>,
		private readonly _defaultSizing: ChatWindowDefaultSizing,
	) {
		super();
	}

	get layout(): ISessionGridLayout | undefined {
		return this._layout;
	}

	get grid(): SerializableGrid<ChatWindowCellView> | undefined {
		return this._grid;
	}

	/** The gap between the cards of the cells; 0 keeps them flush. */
	setGap(gap: number): void {
		if (this._gap === gap) {
			return;
		}
		this._gap = gap;
		this._applyInsets();
	}

	/** Shows `layout`: rebuilds the grid when its topology changes, else only shows or hides cells. */
	apply(layout: ISessionGridLayout): void {
		const change = diffSessionGridLayout(this._layout, layout);
		const previous = this._layout;
		if (change === 'rebuild' || !this._grid) {
			// What the cells showed as is read before the grid changes, never while it does.
			if (previous && this._grid) {
				for (const leaf of this._leaves(previous.topology)) {
					if (leaf.visible) {
						this._rememberSize(leaf.cell);
					}
				}
			}
			this._layout = layout;
			this._rebuild(layout);
			return;
		}
		this._layout = layout;
		if (change === 'visibility') {
			for (const leaf of this._leaves(layout.topology)) {
				const view = this._cells.get(leaf.cell);
				if (view && this._grid.isViewVisible(view) !== leaf.visible) {
					if (!leaf.visible) {
						this._rememberSize(leaf.cell);
					}
					this._grid.setViewVisible(view, leaf.visible);
				}
			}
			this._applyInsets();
		}
	}

	layoutGrid(width: number, height: number): void {
		this._dimension = { width, height };
		this._grid?.layout(width, height);
		this._onDidLayoutCells.fire();
	}

	/** The size of `cell` as it last showed, if it did. */
	getSize(cell: SessionGridCell): IBox | undefined {
		const view = this._cells.get(cell);
		if (view && this._grid && this._isInGrid(cell) && this._grid.isViewVisible(view)) {
			return this._grid.getViewSize(view);
		}
		return this._rememberedBox(cell);
	}

	private _rememberedBox(cell: SessionGridCell): IBox | undefined {
		const shapeKey = this._layout?.shapeKey;
		return (shapeKey ? this._sizes.get(shapeKey)?.get(cell) : undefined) ?? (cell === SessionGridCell.Terminals ? this._terminalsSize : undefined);
	}

	/** Sizes `cell` along `axis` without moving any other cell than its neighbor. */
	resizeCell(cell: SessionGridCell, size: { readonly width?: number; readonly height?: number }): void {
		const view = this._cells.get(cell);
		if (!view || !this._grid || !this._isInGrid(cell)) {
			return;
		}
		const current = this._grid.getViewSize(view);
		this._grid.resizeView(view, { width: size.width ?? current.width, height: size.height ?? current.height });
		this._rememberSize(cell);
	}

	private _isInGrid(cell: SessionGridCell): boolean {
		return !!this._layout && this._leaves(this._layout.topology).some(leaf => leaf.cell === cell);
	}

	private _leaves(node: SessionGridLayoutNode, into: { cell: SessionGridCell; visible: boolean }[] = []): { cell: SessionGridCell; visible: boolean }[] {
		if (isBranch(node)) {
			node.children.forEach(child => this._leaves(child, into));
		} else {
			into.push(node);
		}
		return into;
	}

	private _rememberSize(cell: SessionGridCell): void {
		const view = this._cells.get(cell);
		if (view && this._grid && this._grid.isViewVisible(view)) {
			const size = this._grid.getViewSize(view);
			if (size.width > 0 && size.height > 0) {
				const shapeKey = this._layout!.shapeKey;
				let sizes = this._sizes.get(shapeKey);
				if (!sizes) {
					sizes = new Map();
					this._sizes.set(shapeKey, sizes);
				}
				sizes.set(cell, { width: size.width, height: size.height });
				if (cell === SessionGridCell.Terminals) {
					this._terminalsSize = { width: size.width, height: size.height };
				}
			}
		}
	}

	private _rebuild(layout: ISessionGridLayout): void {
		this._rebuilds++;
		this._gridDisposables.clear();
		const previousElement = this._grid?.element;
		this._grid = undefined;

		const dimension = this._dimension ?? { width: 1000, height: 800 };
		const json = this._serialize(layout.topology, dimension);
		const grid = this._gridDisposables.add(SerializableGrid.deserialize<ChatWindowCellView>(json, {
			fromJSON: (data: { type: SessionGridCell }) => {
				const view = this._cells.get(data.type);
				if (!view) {
					throw new Error(`Unknown chat window cell: ${data.type}`);
				}
				return view;
			}
		}, { proportionalLayout: false }));
		grid.element.classList.add('chat-window-grid');
		previousElement?.remove();
		this._container.appendChild(grid.element);
		this._grid = grid;
		this._gridDisposables.add(grid.onDidChange(() => this._onDidLayoutCells.fire()));
		this._applyInsets();
		if (this._dimension) {
			grid.layout(this._dimension.width, this._dimension.height);
		}
		this._onDidLayoutCells.fire();
	}

	private _applyInsets(): void {
		if (!this._layout) {
			return;
		}
		const insets = getChatWindowCellInsets(this._layout.topology, this._gap);
		for (const [cell, view] of this._cells) {
			view.setInsets(insets.get(cell) ?? NO_GRID_EDGE_INSETS);
		}
		// The sashes in the gaps between the cards show the gripper of the main window's.
		if (this._grid) {
			updateGridGapSashes(this._grid, this._gap > 0);
		}
	}

	private _serialize(topology: ISessionGridLayoutBranch, dimension: IBox): ISerializedGrid {
		const orientation = topology.orientation === 'row' ? Orientation.HORIZONTAL : Orientation.VERTICAL;
		return {
			root: this._serializeNode(topology, dimension),
			orientation,
			width: dimension.width,
			height: dimension.height,
		};
	}

	/** Serializes `node`, laid out in `box`, as the grid deserializes it: the size of a node is along its parent's orientation. */
	private _serializeNode(node: SessionGridLayoutNode, box: IBox, parentAxis?: 'row' | 'column'): ISerializedNode {
		const size = parentAxis === 'row' ? box.width : parentAxis === 'column' ? box.height : (isBranch(node) && node.orientation === 'column' ? box.width : box.height);
		if (!isBranch(node)) {
			return { type: 'leaf', data: { type: node.cell }, size: Math.round(size), visible: node.visible };
		}
		const total = node.orientation === 'row' ? box.width : box.height;
		const sizes = this._distribute(node, total);
		return {
			type: 'branch',
			size: Math.round(size),
			data: node.children.map((child, index) => this._serializeNode(child, node.orientation === 'row' ? { width: sizes[index], height: box.height } : { width: box.width, height: sizes[index] }, node.orientation)),
		};
	}

	/**
	 * Splits `total` among the children of `node` along its orientation: fixed cells take their size, and the others share
	 * the room left in proportion to the sizes they last showed with, or else their default share of it. Hidden children
	 * keep their size for when they show, outside the total.
	 */
	private _distribute(node: ISessionGridLayoutBranch, total: number): number[] {
		const axis = node.orientation;
		let room = total;
		const provisional = node.children.map(child => {
			const sizing = this._sizingOf(child, axis, total);
			if (sizing.kind === 'fixed') {
				if (isVisible(child)) {
					room -= sizing.size;
				}
				return { fixed: true, size: sizing.size };
			}
			return { fixed: false, size: this._rememberedSize(child, axis) ?? sizing.share * total };
		});
		const flexibleTotal = provisional.reduce((sum, entry, index) => !entry.fixed && isVisible(node.children[index]) ? sum + entry.size : sum, 0);
		const scale = flexibleTotal > 0 ? Math.max(0, room) / flexibleTotal : 0;
		return provisional.map((entry, index) => Math.max(1, Math.round(entry.fixed || !isVisible(node.children[index]) ? entry.size : entry.size * scale)));
	}

	private _sizingOf(node: SessionGridLayoutNode, axis: 'row' | 'column', total: number): ChatWindowCellSizing {
		if (!isBranch(node)) {
			return this._defaultSizing(node.cell, axis, total);
		}
		// A branch is flexible unless all of its visible cells are fixed along `axis`.
		const children = node.children.filter(isVisible).map(child => this._sizingOf(child, axis, total));
		if (children.length && children.every(sizing => sizing.kind === 'fixed')) {
			const fixed = children.map(sizing => sizing.kind === 'fixed' ? sizing.size : 0);
			return { kind: 'fixed', size: node.orientation === axis ? fixed.reduce((sum, size) => sum + size, 0) : Math.max(...fixed) };
		}
		return { kind: 'share', share: children.reduce((sum, sizing) => sum + (sizing.kind === 'share' ? sizing.share : 0), 0) || 1 };
	}

	/** The size `node` last showed with along `axis`, when all its visible cells showed. */
	private _rememberedSize(node: SessionGridLayoutNode, axis: 'row' | 'column'): number | undefined {
		if (!isBranch(node)) {
			const size = this._rememberedBox(node.cell);
			return size ? (axis === 'row' ? size.width : size.height) : undefined;
		}
		const sizes = node.children.filter(isVisible).map(child => this._rememberedSize(child, axis));
		if (!sizes.length || sizes.some(size => size === undefined)) {
			return undefined;
		}
		return node.orientation === axis ? sizes.reduce((sum, size) => sum! + size!, 0) : Math.max(...sizes as number[]);
	}

	override dispose(): void {
		this._grid?.element.remove();
		super.dispose();
	}
}
