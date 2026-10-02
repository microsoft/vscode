/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveElement, isAncestor, isHTMLElement } from '../../../base/browser/dom.js';
import { Direction, GridNode, IGridStyles, ISerializableView, ISerializedGrid, ISerializedNode, IView, SerializableGrid, Sizing, isGridBranchNode } from '../../../base/browser/ui/grid/grid.js';
import { Orientation } from '../../../base/browser/ui/sash/sash.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ISessionGridPlacement } from '../../services/sessions/browser/sessionsPartService.js';
import { isSessionGridLeafData, projectSessionGrid } from '../../services/sessions/browser/sessionGridState.js';
import { Color } from '../../../base/common/color.js';

export interface ISessionGridEntry {
	readonly id: string;
	readonly view: IView;
	readonly placement?: ISessionGridPlacement;
}

/** A host keeps grid identity stable while its content is projected onto the desktop surface. */
class SessionGridLeaf implements ISerializableView {
	readonly element = $('.session-grid-leaf');
	private projected = false;
	private visible = true;
	private lastLayout: { width: number; height: number; top: number; left: number } | undefined;

	constructor(readonly id: string, readonly view: IView) {
		this.element.appendChild(view.element);
	}

	get minimumWidth() { return this.view.minimumWidth; }
	get maximumWidth() { return this.view.maximumWidth; }
	get minimumHeight() { return this.view.minimumHeight; }
	get maximumHeight() { return this.view.maximumHeight; }
	get onDidChange() { return this.view.onDidChange; }

	layout(width: number, height: number, top: number, left: number): void {
		this.lastLayout = { width, height, top, left };
		if (!this.projected) {
			this.view.layout(width, height, top, left);
		}
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (!this.projected) {
			this.view.setVisible?.(visible);
		}
	}

	project(host: HTMLElement | undefined, active: boolean): void {
		const wasProjected = this.projected;
		this.projected = !!host;
		const parent = host && active ? host : this.element;
		if (this.view.element.parentElement !== parent) {
			parent.appendChild(this.view.element);
		}
		this.view.setVisible?.(host ? active : this.visible);
		if (wasProjected && !this.projected && this.lastLayout) {
			const { width, height, top, left } = this.lastLayout;
			this.view.layout(width, height, top, left);
		}
	}

	toJSON(): object { return { id: this.id }; }
}

/** Sessions geometry only; the caller owns membership, bindings, and view lifetime. */
export class SessionGridLayout extends Disposable {
	readonly element = $('.session-grid');
	private readonly projectionHost = $('.session-grid-projection');
	private readonly grid = this._register(new MutableDisposable<SerializableGrid<SessionGridLeaf>>());
	private readonly leaves = new Map<string, SessionGridLeaf>();
	private readonly placements = new Map<string, ISessionGridPlacement | undefined>();
	private readonly _onDidChangeMaximized = this._register(new Emitter<void>());
	readonly onDidChangeMaximized = this._onDidChangeMaximized.event;
	private dimensions: { width: number; height: number; top: number; left: number } | undefined;
	private phoneDimensions: { width: number; height: number; top: number; left: number } | undefined;
	private phone = false;
	private active: string | undefined;
	private styles: IGridStyles = { separatorBorder: Color.transparent };
	private maximizedId: string | undefined;
	private updatingLayout = false;

	constructor() {
		super();
		this.element.appendChild(this.projectionHost);
		this.projectionHost.style.display = 'none';
	}

	reconcile(entries: readonly ISessionGridEntry[], active: string): void {
		if (!entries.length) {
			throw new Error('A Sessions grid must have at least one leaf');
		}
		this.preserveFocus(() => {
			const order = this.order;
			const structureChanged = order.length !== entries.length || entries.some((entry, index) =>
				entry.id !== order[index] || (entry.placement && entry.placement !== this.placements.get(entry.id)));
			if (structureChanged || (this.active !== active && this.maximized !== active)) {
				this.setMaximized(undefined);
			}
			const desired = new Set(entries.map(entry => entry.id));
			for (const entry of entries) {
				if (!this.leaves.has(entry.id)) {
					const leaf = new SessionGridLeaf(entry.id, entry.view);
					this.leaves.set(entry.id, leaf);
					leaf.project(this.phone ? this.projectionHost : undefined, entry.id === active);
					if (!this.grid.value) {
						this.setGrid(new SerializableGrid(leaf));
					} else {
						const reference = entry.placement && this.leaves.get(entry.placement.reference);
						this.grid.value.addView(leaf, Sizing.Split, reference ?? this.orderedLeaves().at(-1)!, entry.placement?.direction ?? Direction.Right);
					}
					this.placements.set(entry.id, entry.placement && this.leaves.has(entry.placement.reference) ? entry.placement : undefined);
				}
			}
			for (const [id, leaf] of this.leaves) {
				if (!desired.has(id)) {
					leaf.project(undefined, false);
					this.grid.value!.removeView(leaf);
					this.leaves.delete(id);
					this.placements.delete(id);
				}
			}
			for (const entry of entries) {
				if (entry.placement && this.placements.get(entry.id) !== entry.placement) {
					const reference = this.leaves.get(entry.placement.reference);
					if (reference && reference.id !== entry.id) {
						this.grid.value!.moveView(this.leaves.get(entry.id)!, Sizing.Split, reference, entry.placement.direction);
					}
				}
				this.placements.set(entry.id, entry.placement);
			}
			// A pure order change swaps leaves, not their live session bindings.
			for (let i = 0; i < entries.length; i++) {
				const current = this.orderedLeaves()[i];
				if (current.id !== entries[i].id) {
					this.grid.value!.swapViews(current, this.leaves.get(entries[i].id)!);
				}
			}
			this.active = active;
			this.layoutViews();
		});
	}

	private orderedLeaves(): SessionGridLeaf[] {
		const collect = (node: GridNode<SessionGridLeaf>): SessionGridLeaf[] => isGridBranchNode(node) ? node.children.flatMap(collect) : [node.view];
		return this.grid.value ? collect(this.grid.value.getViews()) : [];
	}

	get order(): readonly string[] { return this.orderedLeaves().map(leaf => leaf.id); }
	get maximized(): string | undefined { return this.maximizedId; }

	toggleMaximized(id: string): boolean | undefined {
		const leaf = this.leaves.get(id);
		if (!leaf || this.leaves.size < 2 || this.phone) {
			return undefined;
		}
		this.setMaximized(this.maximized === id ? undefined : id);
		return this.maximized === id;
	}

	private setMaximized(id: string | undefined): void {
		if (this.maximizedId !== id) {
			this.preserveFocus(() => {
				this.maximizedId = id;
				this.layoutViews();
			});
			this._onDidChangeMaximized.fire();
		}
	}

	neighbor(id: string, direction: Direction): string | undefined {
		const leaf = this.leaves.get(id);
		if (!leaf || !this.dimensions || this.phone) {
			return undefined;
		}
		return this.grid.value!.getNeighborViews(leaf, direction, false)[0]?.id;
	}

	placement(id: string): ISessionGridPlacement | undefined {
		const edgeLeaf = (node: GridNode<SessionGridLeaf>, last: boolean): SessionGridLeaf => isGridBranchNode(node)
			? edgeLeaf(last ? node.children[node.children.length - 1] : node.children[0], last) : node.view;
		const find = (node: GridNode<SessionGridLeaf>, orientation: Orientation): ISessionGridPlacement | undefined => {
			if (!isGridBranchNode(node)) {
				return undefined;
			}
			const index = node.children.findIndex(child => !isGridBranchNode(child) && child.view.id === id);
			if (index >= 0 && node.children.length > 1) {
				const previous = index > 0;
				const sibling = node.children[previous ? index - 1 : index + 1];
				return {
					reference: edgeLeaf(sibling, previous).id,
					direction: orientation === Orientation.HORIZONTAL
						? previous ? Direction.Right : Direction.Left
						: previous ? Direction.Down : Direction.Up,
				};
			}
			for (const child of node.children) {
				const result = find(child, orientation === Orientation.HORIZONTAL ? Orientation.VERTICAL : Orientation.HORIZONTAL);
				if (result) {
					return result;
				}
			}
			return undefined;
		};
		return this.grid.value && find(this.grid.value.getViews(), this.grid.value.orientation);
	}

	resize(id: string, width: number, height: number): void {
		const leaf = this.leaves.get(id);
		if (leaf && !this.phone) {
			this.setMaximized(undefined);
			this.grid.value!.resizeView(leaf, { width, height });
		}
	}

	getSize(id: string): { width: number; height: number } | undefined {
		const leaf = this.leaves.get(id);
		return leaf && this.grid.value!.getViewSize(leaf);
	}

	expand(id: string): void {
		const leaf = this.leaves.get(id);
		const size = leaf && this.grid.value!.getViewSize(leaf);
		if (leaf && size && !this.phone && !this.maximized && !this.updatingLayout && size.width === leaf.minimumWidth) {
			this.grid.value!.expandView(leaf);
		}
	}

	arrange(): void {
		const leaves = this.orderedLeaves();
		if (!leaves.length) {
			return;
		}
		const columns = Math.ceil(Math.sqrt(leaves.length));
		const rows = Math.ceil(leaves.length / columns);
		this.setMaximized(undefined);
		this.preserveFocus(() => this.setGrid(SerializableGrid.from({
			orientation: Orientation.VERTICAL,
			groups: Array.from({ length: rows }, (_, row) => {
				const items = leaves.slice(row * columns, (row + 1) * columns);
				return items.length === 1
					? { data: items[0], size: 1 }
					: { groups: items.map(data => ({ data, size: 1 })), size: 1 };
			})
		})));
	}

	serialize(): ISerializedGrid | undefined {
		const state = this.grid.value?.serialize();
		if (state && this.maximized) {
			const mark = (node: ISerializedNode): void => {
				if (node.type === 'branch') {
					node.data.forEach(mark);
				} else if (isSessionGridLeafData(node.data) && node.data.id === this.maximized) {
					node.maximized = true;
				}
			};
			mark(state.root);
		}
		return state;
	}

	restore(state: ISerializedGrid): void {
		const projected = projectSessionGrid(state, id => this.leaves.has(id) ? id : undefined);
		if (!projected) {
			return;
		}
		if (this.phone || !this.dimensions) {
			this.dimensions = { width: Math.max(1, state.width), height: Math.max(1, state.height), top: 0, left: 0 };
		}
		let maximized: string | undefined;
		const unmaximize = (node: ISerializedNode): void => {
			if (node.type === 'branch') {
				node.data.forEach(unmaximize);
			} else if (node.maximized) {
				if (isSessionGridLeafData(node.data)) {
					maximized = node.data.id;
				}
				delete node.maximized;
			}
		};
		unmaximize(projected.root);
		this.preserveFocus(() => {
			this.setMaximized(undefined);
			this.setGrid(SerializableGrid.deserialize(projected, {
				fromJSON: (data: { id: string }) => this.leaves.get(data.id)!
			}));
			this.setMaximized(maximized);
		});
	}

	private setGrid(grid: SerializableGrid<SessionGridLeaf>): void {
		const previous = this.grid.value;
		previous?.element.remove();
		this.grid.value = grid;
		grid.style(this.styles);
		this.element.prepend(grid.element);
		this.layoutViews();
	}

	layout(width: number, height: number, top: number, left: number, phone: boolean): void {
		this.preserveFocus(() => {
			this.phone = phone;
			this.phoneDimensions = phone ? { width, height, top, left } : undefined;
			const initialLayout = !this.dimensions;
			if (!phone || initialLayout) {
				// A phone-born grid gets a desktop reference size, never phone-sized sash allocations.
				this.dimensions = { width: phone ? Math.max(1000, this.grid.value?.width ?? 0) : width, height: phone ? Math.max(800, this.grid.value?.height ?? 0) : height, top, left };
			}
			this.layoutViews();
		});
	}

	private get projectedId(): string | undefined {
		return this.phone ? this.active : this.maximized;
	}

	private layoutViews(): void {
		const projectedId = this.projectedId;
		const host = projectedId === undefined ? undefined : this.projectionHost;
		let bottomLeftId = projectedId;
		let bottomRightId = projectedId;
		if (projectedId === undefined && this.grid.value) {
			const cornerLeaf = (node: GridNode<SessionGridLeaf>, orientation: Orientation, right: boolean): string => {
				if (!isGridBranchNode(node)) {
					return node.view.id;
				}
				const index = orientation === Orientation.VERTICAL || right ? node.children.length - 1 : 0;
				return cornerLeaf(node.children[index], orientation === Orientation.HORIZONTAL ? Orientation.VERTICAL : Orientation.HORIZONTAL, right);
			};
			const root = this.grid.value.getViews();
			bottomLeftId = cornerLeaf(root, this.grid.value.orientation, false);
			bottomRightId = cornerLeaf(root, this.grid.value.orientation, true);
		}
		if (this.grid.value) {
			this.grid.value.element.style.display = host ? 'none' : '';
		}
		this.projectionHost.style.display = host ? '' : 'none';
		for (const leaf of this.leaves.values()) {
			leaf.project(host, leaf.id === projectedId);
			leaf.view.element.classList.toggle('session-grid-bottom-left', leaf.id === bottomLeftId);
			leaf.view.element.classList.toggle('session-grid-bottom-right', leaf.id === bottomRightId);
		}
		if (this.dimensions) {
			const { width, height, top, left } = this.dimensions;
			this.grid.value?.layout(width, height, top, left);
		}
		const projected = projectedId && this.leaves.get(projectedId);
		const dimensions = this.phone ? this.phoneDimensions : this.dimensions;
		if (projected && dimensions) {
			const { width, height, top, left } = dimensions;
			this.projectionHost.style.width = `${width}px`;
			this.projectionHost.style.height = `${height}px`;
			projected.view.layout(width, height, top, left);
		}
	}

	style(styles: IGridStyles): void {
		this.styles = styles;
		this.grid.value?.style(styles);
	}

	private preserveFocus(fn: () => void): void {
		const focused = getActiveElement();
		const owned = isHTMLElement(focused) && isAncestor(focused, this.element);
		const updatingLayout = this.updatingLayout;
		this.updatingLayout = true;
		try {
			fn();
			if (owned && focused.isConnected && (this.projectedId === undefined || isAncestor(focused, this.projectionHost)) && getActiveElement() !== focused) {
				focused.focus();
			}
		} finally {
			this.updatingLayout = updatingLayout;
		}
	}

	override dispose(): void {
		for (const leaf of this.leaves.values()) {
			leaf.view.element.remove();
		}
		this.leaves.clear();
		this.placements.clear();
		this.element.remove();
		super.dispose();
	}
}
