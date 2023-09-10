/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { IBoundarySashes, Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { DistributeSizing, ISplitViewStyles, IView as ISplitView, LayoutPriority, Sizing, AutoSizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { equals as arrayEquals, tail2 as tail } from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { Emitter, Event, Relay } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { rot } from 'vs/base/common/numbers';
import { isUndefined } from 'vs/base/common/types';
import 'vs/css!./gridview';

export { Orientation } from 'vs/base/browser/ui/sash/sash';
export { LayoutPriority, Sizing } from 'vs/base/browser/ui/splitview/splitview';

export interface IGridViewStyles extends ISplitViewStyles { }

const defaultStyles: IGridViewStyles = {
	separatorBorder: Color.transparent
};

export interface IViewSize {
	readonly width: number;
	readonly height: number;
}

interface IRelativeBoundarySashes {
	readonly start?: Sash;
	readonly end?: Sash;
	readonly orthogonalStart?: Sash;
	readonly orthogonalEnd?: Sash;
}

/**
 * The interface to implement for views within a {@link GridView}.
 */
export interface IView {

	/**
	 * The DOM element for this view.
	 */
	readonly element: HTMLElement;

	/**
	 * A minimum width for this view.
	 *
	 * @remarks If none, set it to `0`.
	 */
	readonly minimumWidth: number;

	/**
	 * A minimum width for this view.
	 *
	 * @remarks If none, set it to `Number.POSITIVE_INFINITY`.
	 */
	readonly maximumWidth: number;

	/**
	 * A minimum height for this view.
	 *
	 * @remarks If none, set it to `0`.
	 */
	readonly minimumHeight: number;

	/**
	 * A minimum height for this view.
	 *
	 * @remarks If none, set it to `Number.POSITIVE_INFINITY`.
	 */
	readonly maximumHeight: number;

	/**
	 * The priority of the view when the {@link GridView} layout algorithm
	 * runs. Views with higher priority will be resized first.
	 *
	 * @remarks Only used when `proportionalLayout` is false.
	 */
	readonly priority?: LayoutPriority;

	/**
	 * If the {@link GridView} supports proportional layout,
	 * this property allows for finer control over the proportional layout algorithm, per view.
	 *
	 * @defaultValue `true`
	 */
	readonly proportionalLayout?: boolean;

	/**
	 * Whether the view will snap whenever the user reaches its minimum size or
	 * attempts to grow it beyond the minimum size.
	 *
	 * @defaultValue `false`
	 */
	readonly snap?: boolean;

	/**
	 * View instances are supposed to fire this event whenever any of the constraint
	 * properties have changed:
	 *
	 * - {@link IView.minimumWidth}
	 * - {@link IView.maximumWidth}
	 * - {@link IView.minimumHeight}
	 * - {@link IView.maximumHeight}
	 * - {@link IView.priority}
	 * - {@link IView.snap}
	 *
	 * The {@link GridView} will relayout whenever that happens. The event can
	 * optionally emit the view's preferred size for that relayout.
	 */
	readonly onDidChange: Event<IViewSize | undefined>;

	/**
	 * This will be called by the {@link GridView} during layout. A view meant to
	 * pass along the layout information down to its descendants.
	 */
	layout(width: number, height: number, top: number, left: number): void;

	/**
	 * This will be called by the {@link GridView} whenever this view is made
	 * visible or hidden.
	 *
	 * @param visible Whether the view becomes visible.
	 */
	setVisible?(visible: boolean): void;

	/**
	 * This will be called by the {@link GridView} whenever this view is on
	 * an edge of the grid and the grid's
	 * {@link GridView.boundarySashes boundary sashes} change.
	 */
	setBoundarySashes?(sashes: IBoundarySashes): void;
}

export interface ISerializableView extends IView {
	toJSON(): object;
}

export interface IViewDeserializer<T extends ISerializableView> {
	fromJSON(json: any): T;
}

export interface ISerializedLeafNode {
	type: 'leaf';
	data: any;
	size: number;
	visible?: boolean;
}

export interface ISerializedBranchNode {
	type: 'branch';
	data: ISerializedNode[];
	size: number;
}

export type ISerializedNode = ISerializedLeafNode | ISerializedBranchNode;

export interface ISerializedGridView {
	root: ISerializedNode;
	orientation: Orientation;
	width: number;
	height: number;
}

export function orthogonal(orientation: Orientation): Orientation {
	return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

export interface Box {
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
}

export interface GridLeafNode {
	readonly view: IView;
	readonly box: Box;
	readonly cachedVisibleSize: number | undefined;
}

export interface GridBranchNode {
	readonly children: GridNode[];
	readonly box: Box;
}

export type GridNode = GridLeafNode | GridBranchNode;

export function isGridBranchNode(node: GridNode): node is GridBranchNode {
	return !!(node as any).children;
}

class LayoutController {
	constructor(public isLayoutEnabled: boolean) { }
}

export interface IGridViewOptions {

	/**
	 * Styles overriding the {@link defaultStyles default ones}.
	 */
	readonly styles?: IGridViewStyles;

	/**
	 * Resize each view proportionally when resizing the {@link GridView}.
	 *
	 * @defaultValue `true`
	 */
	readonly proportionalLayout?: boolean; // default true
}

interface ILayoutContext {
	readonly orthogonalSize: number;
	readonly absoluteOffset: number;
	readonly absoluteOrthogonalOffset: number;
	readonly absoluteSize: number;
	readonly absoluteOrthogonalSize: number;
}

function toAbsoluteBoundarySashes(sashes: IRelativeBoundarySashes, orientation: Orientation): IBoundarySashes {
	if (orientation === Orientation.HORIZONTAL) {
		return { left: sashes.start, right: sashes.end, top: sashes.orthogonalStart, bottom: sashes.orthogonalEnd };
	} else {
		return { top: sashes.start, bottom: sashes.end, left: sashes.orthogonalStart, right: sashes.orthogonalEnd };
	}
}

function fromAbsoluteBoundarySashes(sashes: IBoundarySashes, orientation: Orientation): IRelativeBoundarySashes {
	if (orientation === Orientation.HORIZONTAL) {
		return { start: sashes.left, end: sashes.right, orthogonalStart: sashes.top, orthogonalEnd: sashes.bottom };
	} else {
		return { start: sashes.top, end: sashes.bottom, orthogonalStart: sashes.left, orthogonalEnd: sashes.right };
	}
}

function validateIndex(index: number, numChildren: number): number {
	if (Math.abs(index) > numChildren) {
		throw new Error('Invalid index');
	}

	return rot(index, numChildren + 1);
}

class BranchNode implements ISplitView<ILayoutContext>, IDisposable {

	readonly element: HTMLElement;
	readonly children: Node[] = [];
	private splitview: SplitView<ILayoutContext>;

	private _size: number;
	get size(): number { return this._size; }

	private _orthogonalSize: number;
	get orthogonalSize(): number { return this._orthogonalSize; }

	private _absoluteOffset: number = 0;
	get absoluteOffset(): number { return this._absoluteOffset; }

	private _absoluteOrthogonalOffset: number = 0;
	get absoluteOrthogonalOffset(): number { return this._absoluteOrthogonalOffset; }

	private absoluteOrthogonalSize: number = 0;

	private _styles: IGridViewStyles;
	get styles(): IGridViewStyles { return this._styles; }

	get width(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
	}

	get height(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
	}

	get top(): number {
		return this.orientation === Orientation.HORIZONTAL ? this._absoluteOffset : this._absoluteOrthogonalOffset;
	}

	get left(): number {
		return this.orientation === Orientation.HORIZONTAL ? this._absoluteOrthogonalOffset : this._absoluteOffset;
	}

	get minimumSize(): number {
		return this.children.length === 0 ? 0 : Math.max(...this.children.map(c => c.minimumOrthogonalSize));
	}

	get maximumSize(): number {
		return Math.min(...this.children.map(c => c.maximumOrthogonalSize));
	}

	get priority(): LayoutPriority {
		if (this.children.length === 0) {
			return LayoutPriority.Normal;
		}

		const priorities = this.children.map(c => typeof c.priority === 'undefined' ? LayoutPriority.Normal : c.priority);

		if (priorities.some(p => p === LayoutPriority.High)) {
			return LayoutPriority.High;
		} else if (priorities.some(p => p === LayoutPriority.Low)) {
			return LayoutPriority.Low;
		}

		return LayoutPriority.Normal;
	}

	get proportionalLayout(): boolean {
		if (this.children.length === 0) {
			return true;
		}

		return this.children.every(c => c.proportionalLayout);
	}

	get minimumOrthogonalSize(): number {
		return this.splitview.minimumSize;
	}

	get maximumOrthogonalSize(): number {
		return this.splitview.maximumSize;
	}

	get minimumWidth(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumOrthogonalSize : this.minimumSize;
	}

	get minimumHeight(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumSize : this.minimumOrthogonalSize;
	}

	get maximumWidth(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumOrthogonalSize : this.maximumSize;
	}

	get maximumHeight(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumSize : this.maximumOrthogonalSize;
	}

	private readonly _onDidChange = new Emitter<number | undefined>();
	readonly onDidChange: Event<number | undefined> = this._onDidChange.event;

	private _onDidScroll = new Emitter<void>();
	private onDidScrollDisposable: IDisposable = Disposable.None;
	readonly onDidScroll: Event<void> = this._onDidScroll.event;

	private childrenChangeDisposable: IDisposable = Disposable.None;

	private readonly _onDidSashReset = new Emitter<GridLocation>();
	readonly onDidSashReset: Event<GridLocation> = this._onDidSashReset.event;
	private splitviewSashResetDisposable: IDisposable = Disposable.None;
	private childrenSashResetDisposable: IDisposable = Disposable.None;

	private _boundarySashes: IRelativeBoundarySashes = {};
	get boundarySashes(): IRelativeBoundarySashes { return this._boundarySashes; }
	set boundarySashes(boundarySashes: IRelativeBoundarySashes) {
		if (this._boundarySashes.start === boundarySashes.start
			&& this._boundarySashes.end === boundarySashes.end
			&& this._boundarySashes.orthogonalStart === boundarySashes.orthogonalStart
			&& this._boundarySashes.orthogonalEnd === boundarySashes.orthogonalEnd) {
			return;
		}

		this._boundarySashes = boundarySashes;

		this.splitview.orthogonalStartSash = boundarySashes.orthogonalStart;
		this.splitview.orthogonalEndSash = boundarySashes.orthogonalEnd;

		for (let index = 0; index < this.children.length; index++) {
			const child = this.children[index];
			const first = index === 0;
			const last = index === this.children.length - 1;

			child.boundarySashes = {
				start: boundarySashes.orthogonalStart,
				end: boundarySashes.orthogonalEnd,
				orthogonalStart: first ? boundarySashes.start : child.boundarySashes.orthogonalStart,
				orthogonalEnd: last ? boundarySashes.end : child.boundarySashes.orthogonalEnd,
			};
		}
	}

	private _edgeSnapping = false;
	get edgeSnapping(): boolean { return this._edgeSnapping; }
	set edgeSnapping(edgeSnapping: boolean) {
		if (this._edgeSnapping === edgeSnapping) {
			return;
		}

		this._edgeSnapping = edgeSnapping;

		for (const child of this.children) {
			if (child instanceof BranchNode) {
				child.edgeSnapping = edgeSnapping;
			}
		}

		this.updateSplitviewEdgeSnappingEnablement();
	}

	constructor(
		readonly orientation: Orientation,
		readonly layoutController: LayoutController,
		styles: IGridViewStyles,
		readonly splitviewProportionalLayout: boolean,
		size: number = 0,
		orthogonalSize: number = 0,
		edgeSnapping: boolean = false,
		childDescriptors?: INodeDescriptor[]
	) {
		this._styles = styles;
		this._size = size;
		this._orthogonalSize = orthogonalSize;

		this.element = $('.monaco-grid-branch-node');

		if (!childDescriptors) {
			// Normal behavior, we have no children yet, just set up the splitview
			this.splitview = new SplitView(this.element, { orientation, styles, proportionalLayout: splitviewProportionalLayout });
			this.splitview.layout(size, { orthogonalSize, absoluteOffset: 0, absoluteOrthogonalOffset: 0, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
		} else {
			// Reconstruction behavior, we want to reconstruct a splitview
			const descriptor = {
				views: childDescriptors.map(childDescriptor => {
					return {
						view: childDescriptor.node,
						size: childDescriptor.node.size,
						visible: childDescriptor.node instanceof LeafNode && childDescriptor.visible !== undefined ? childDescriptor.visible : true
					};
				}),
				size: this.orthogonalSize
			};

			const options = { proportionalLayout: splitviewProportionalLayout, orientation, styles };

			this.children = childDescriptors.map(c => c.node);
			this.splitview = new SplitView(this.element, { ...options, descriptor });

			this.children.forEach((node, index) => {
				const first = index === 0;
				const last = index === this.children.length;

				node.boundarySashes = {
					start: this.boundarySashes.orthogonalStart,
					end: this.boundarySashes.orthogonalEnd,
					orthogonalStart: first ? this.boundarySashes.start : this.splitview.sashes[index - 1],
					orthogonalEnd: last ? this.boundarySashes.end : this.splitview.sashes[index],
				};
			});
		}

		const onDidSashReset = Event.map(this.splitview.onDidSashReset, i => [i]);
		this.splitviewSashResetDisposable = onDidSashReset(this._onDidSashReset.fire, this._onDidSashReset);

		this.updateChildrenEvents();
	}

	style(styles: IGridViewStyles): void {
		this._styles = styles;
		this.splitview.style(styles);

		for (const child of this.children) {
			if (child instanceof BranchNode) {
				child.style(styles);
			}
		}
	}

	layout(size: number, offset: number, ctx: ILayoutContext | undefined): void {
		if (!this.layoutController.isLayoutEnabled) {
			return;
		}

		if (typeof ctx === 'undefined') {
			throw new Error('Invalid state');
		}

		// branch nodes should flip the normal/orthogonal directions
		this._size = ctx.orthogonalSize;
		this._orthogonalSize = size;
		this._absoluteOffset = ctx.absoluteOffset + offset;
		this._absoluteOrthogonalOffset = ctx.absoluteOrthogonalOffset;
		this.absoluteOrthogonalSize = ctx.absoluteOrthogonalSize;

		this.splitview.layout(ctx.orthogonalSize, {
			orthogonalSize: size,
			absoluteOffset: this._absoluteOrthogonalOffset,
			absoluteOrthogonalOffset: this._absoluteOffset,
			absoluteSize: ctx.absoluteOrthogonalSize,
			absoluteOrthogonalSize: ctx.absoluteSize
		});

		this.updateSplitviewEdgeSnappingEnablement();
	}

	setVisible(visible: boolean): void {
		for (const child of this.children) {
			child.setVisible(visible);
		}
	}

	addChild(node: Node, size: number | Sizing, index: number, skipLayout?: boolean): void {
		index = validateIndex(index, this.children.length);

		this.splitview.addView(node, size, index, skipLayout);
		this.children.splice(index, 0, node);

		this.updateBoundarySashes();
		this.onDidChildrenChange();
	}

	removeChild(index: number, sizing?: Sizing): void {
		index = validateIndex(index, this.children.length);

		this.splitview.removeView(index, sizing);
		this.children.splice(index, 1);

		this.updateBoundarySashes();
		this.onDidChildrenChange();
	}

	moveChild(from: number, to: number): void {
		from = validateIndex(from, this.children.length);
		to = validateIndex(to, this.children.length);

		if (from === to) {
			return;
		}

		if (from < to) {
			to -= 1;
		}

		this.splitview.moveView(from, to);
		this.children.splice(to, 0, this.children.splice(from, 1)[0]);

		this.updateBoundarySashes();
		this.onDidChildrenChange();
	}

	swapChildren(from: number, to: number): void {
		from = validateIndex(from, this.children.length);
		to = validateIndex(to, this.children.length);

		if (from === to) {
			return;
		}

		this.splitview.swapViews(from, to);

		// swap boundary sashes
		[this.children[from].boundarySashes, this.children[to].boundarySashes]
			= [this.children[from].boundarySashes, this.children[to].boundarySashes];

		// swap children
		[this.children[from], this.children[to]] = [this.children[to], this.children[from]];

		this.onDidChildrenChange();
	}

	resizeChild(index: number, size: number): void {
		index = validateIndex(index, this.children.length);

		this.splitview.resizeView(index, size);
	}

	isChildSizeMaximized(index: number): boolean {
		return this.splitview.isViewSizeMaximized(index);
	}

	distributeViewSizes(recursive = false): void {
		this.splitview.distributeViewSizes();

		if (recursive) {
			for (const child of this.children) {
				if (child instanceof BranchNode) {
					child.distributeViewSizes(true);
				}
			}
		}
	}

	getChildSize(index: number): number {
		index = validateIndex(index, this.children.length);

		return this.splitview.getViewSize(index);
	}

	isChildVisible(index: number): boolean {
		index = validateIndex(index, this.children.length);

		return this.splitview.isViewVisible(index);
	}

	setChildVisible(index: number, visible: boolean): void {
		index = validateIndex(index, this.children.length);

		if (this.splitview.isViewVisible(index) === visible) {
			return;
		}

		this.splitview.setViewVisible(index, visible);
	}

	getChildCachedVisibleSize(index: number): number | undefined {
		index = validateIndex(index, this.children.length);

		return this.splitview.getViewCachedVisibleSize(index);
	}

	private updateBoundarySashes(): void {
		for (let i = 0; i < this.children.length; i++) {
			this.children[i].boundarySashes = {
				start: this.boundarySashes.orthogonalStart,
				end: this.boundarySashes.orthogonalEnd,
				orthogonalStart: i === 0 ? this.boundarySashes.start : this.splitview.sashes[i - 1],
				orthogonalEnd: i === this.children.length - 1 ? this.boundarySashes.end : this.splitview.sashes[i],
			};
		}
	}

	private onDidChildrenChange(): void {
		this.updateChildrenEvents();
		this._onDidChange.fire(undefined);
	}

	private updateChildrenEvents(): void {
		const onDidChildrenChange = Event.map(Event.any(...this.children.map(c => c.onDidChange)), () => undefined);
		this.childrenChangeDisposable.dispose();
		this.childrenChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);

		const onDidChildrenSashReset = Event.any(...this.children.map((c, i) => Event.map(c.onDidSashReset, location => [i, ...location])));
		this.childrenSashResetDisposable.dispose();
		this.childrenSashResetDisposable = onDidChildrenSashReset(this._onDidSashReset.fire, this._onDidSashReset);

		const onDidScroll = Event.any(Event.signal(this.splitview.onDidScroll), ...this.children.map(c => c.onDidScroll));
		this.onDidScrollDisposable.dispose();
		this.onDidScrollDisposable = onDidScroll(this._onDidScroll.fire, this._onDidScroll);
	}

	trySet2x2(other: BranchNode): IDisposable {
		if (this.children.length !== 2 || other.children.length !== 2) {
			return Disposable.None;
		}

		if (this.getChildSize(0) !== other.getChildSize(0)) {
			return Disposable.None;
		}

		const [firstChild, secondChild] = this.children;
		const [otherFirstChild, otherSecondChild] = other.children;

		if (!(firstChild instanceof LeafNode) || !(secondChild instanceof LeafNode)) {
			return Disposable.None;
		}

		if (!(otherFirstChild instanceof LeafNode) || !(otherSecondChild instanceof LeafNode)) {
			return Disposable.None;
		}

		if (this.orientation === Orientation.VERTICAL) {
			secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = firstChild;
			firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = secondChild;
			otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = otherFirstChild;
			otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = otherSecondChild;
		} else {
			otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = firstChild;
			otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = secondChild;
			firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = otherFirstChild;
			secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = otherSecondChild;
		}

		const mySash = this.splitview.sashes[0];
		const otherSash = other.splitview.sashes[0];
		mySash.linkedSash = otherSash;
		otherSash.linkedSash = mySash;

		this._onDidChange.fire(undefined);
		other._onDidChange.fire(undefined);

		return toDisposable(() => {
			mySash.linkedSash = otherSash.linkedSash = undefined;
			firstChild.linkedHeightNode = firstChild.linkedWidthNode = undefined;
			secondChild.linkedHeightNode = secondChild.linkedWidthNode = undefined;
			otherFirstChild.linkedHeightNode = otherFirstChild.linkedWidthNode = undefined;
			otherSecondChild.linkedHeightNode = otherSecondChild.linkedWidthNode = undefined;
		});
	}

	private updateSplitviewEdgeSnappingEnablement(): void {
		this.splitview.startSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset > 0;
		this.splitview.endSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset + this._size < this.absoluteOrthogonalSize;
	}

	dispose(): void {
		for (const child of this.children) {
			child.dispose();
		}

		this._onDidChange.dispose();
		this._onDidSashReset.dispose();

		this.splitviewSashResetDisposable.dispose();
		this.childrenSashResetDisposable.dispose();
		this.childrenChangeDisposable.dispose();
		this.splitview.dispose();
	}
}

/**
 * Creates a latched event that avoids being fired when the view
 * constraints do not change at all.
 */
function createLatchedOnDidChangeViewEvent(view: IView): Event<IViewSize | undefined> {
	const [onDidChangeViewConstraints, onDidSetViewSize] = Event.split<undefined, IViewSize>(view.onDidChange, isUndefined);

	return Event.any(
		onDidSetViewSize,
		Event.map(
			Event.latch(
				Event.map(onDidChangeViewConstraints, _ => ([view.minimumWidth, view.maximumWidth, view.minimumHeight, view.maximumHeight])),
				arrayEquals
			),
			_ => undefined
		)
	);
}

class LeafNode implements ISplitView<ILayoutContext>, IDisposable {

	private _size: number = 0;
	get size(): number { return this._size; }

	private _orthogonalSize: number;
	get orthogonalSize(): number { return this._orthogonalSize; }

	private absoluteOffset: number = 0;
	private absoluteOrthogonalOffset: number = 0;

	readonly onDidScroll: Event<void> = Event.None;
	readonly onDidSashReset: Event<GridLocation> = Event.None;

	private _onDidLinkedWidthNodeChange = new Relay<number | undefined>();
	private _linkedWidthNode: LeafNode | undefined = undefined;
	get linkedWidthNode(): LeafNode | undefined { return this._linkedWidthNode; }
	set linkedWidthNode(node: LeafNode | undefined) {
		this._onDidLinkedWidthNodeChange.input = node ? node._onDidViewChange : Event.None;
		this._linkedWidthNode = node;
		this._onDidSetLinkedNode.fire(undefined);
	}

	private _onDidLinkedHeightNodeChange = new Relay<number | undefined>();
	private _linkedHeightNode: LeafNode | undefined = undefined;
	get linkedHeightNode(): LeafNode | undefined { return this._linkedHeightNode; }
	set linkedHeightNode(node: LeafNode | undefined) {
		this._onDidLinkedHeightNodeChange.input = node ? node._onDidViewChange : Event.None;
		this._linkedHeightNode = node;
		this._onDidSetLinkedNode.fire(undefined);
	}

	private readonly _onDidSetLinkedNode = new Emitter<number | undefined>();
	private _onDidViewChange: Event<number | undefined>;
	readonly onDidChange: Event<number | undefined>;

	private disposables = new DisposableStore();

	constructor(
		readonly view: IView,
		readonly orientation: Orientation,
		readonly layoutController: LayoutController,
		orthogonalSize: number,
		size: number = 0
	) {
		this._orthogonalSize = orthogonalSize;
		this._size = size;

		const onDidChange = createLatchedOnDidChangeViewEvent(view);
		this._onDidViewChange = Event.map(onDidChange, e => e && (this.orientation === Orientation.VERTICAL ? e.width : e.height), this.disposables);
		this.onDidChange = Event.any(this._onDidViewChange, this._onDidSetLinkedNode.event, this._onDidLinkedWidthNodeChange.event, this._onDidLinkedHeightNodeChange.event);
	}

	get width(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
	}

	get height(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
	}

	get top(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.absoluteOffset : this.absoluteOrthogonalOffset;
	}

	get left(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.absoluteOrthogonalOffset : this.absoluteOffset;
	}

	get element(): HTMLElement {
		return this.view.element;
	}

	private get minimumWidth(): number {
		return this.linkedWidthNode ? Math.max(this.linkedWidthNode.view.minimumWidth, this.view.minimumWidth) : this.view.minimumWidth;
	}

	private get maximumWidth(): number {
		return this.linkedWidthNode ? Math.min(this.linkedWidthNode.view.maximumWidth, this.view.maximumWidth) : this.view.maximumWidth;
	}

	private get minimumHeight(): number {
		return this.linkedHeightNode ? Math.max(this.linkedHeightNode.view.minimumHeight, this.view.minimumHeight) : this.view.minimumHeight;
	}

	private get maximumHeight(): number {
		return this.linkedHeightNode ? Math.min(this.linkedHeightNode.view.maximumHeight, this.view.maximumHeight) : this.view.maximumHeight;
	}

	get minimumSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumHeight : this.minimumWidth;
	}

	get maximumSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumHeight : this.maximumWidth;
	}

	get priority(): LayoutPriority | undefined {
		return this.view.priority;
	}

	get proportionalLayout(): boolean {
		return this.view.proportionalLayout ?? true;
	}

	get snap(): boolean | undefined {
		return this.view.snap;
	}

	get minimumOrthogonalSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.minimumWidth : this.minimumHeight;
	}

	get maximumOrthogonalSize(): number {
		return this.orientation === Orientation.HORIZONTAL ? this.maximumWidth : this.maximumHeight;
	}

	private _boundarySashes: IRelativeBoundarySashes = {};
	get boundarySashes(): IRelativeBoundarySashes { return this._boundarySashes; }
	set boundarySashes(boundarySashes: IRelativeBoundarySashes) {
		this._boundarySashes = boundarySashes;

		this.view.setBoundarySashes?.(toAbsoluteBoundarySashes(boundarySashes, this.orientation));
	}

	layout(size: number, offset: number, ctx: ILayoutContext | undefined): void {
		if (!this.layoutController.isLayoutEnabled) {
			return;
		}

		if (typeof ctx === 'undefined') {
			throw new Error('Invalid state');
		}

		this._size = size;
		this._orthogonalSize = ctx.orthogonalSize;
		this.absoluteOffset = ctx.absoluteOffset + offset;
		this.absoluteOrthogonalOffset = ctx.absoluteOrthogonalOffset;

		this._layout(this.width, this.height, this.top, this.left);
	}

	private cachedWidth: number = 0;
	private cachedHeight: number = 0;
	private cachedTop: number = 0;
	private cachedLeft: number = 0;

	private _layout(width: number, height: number, top: number, left: number): void {
		if (this.cachedWidth === width && this.cachedHeight === height && this.cachedTop === top && this.cachedLeft === left) {
			return;
		}

		this.cachedWidth = width;
		this.cachedHeight = height;
		this.cachedTop = top;
		this.cachedLeft = left;
		this.view.layout(width, height, top, left);
	}

	setVisible(visible: boolean): void {
		this.view.setVisible?.(visible);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

type Node = BranchNode | LeafNode;

export interface INodeDescriptor {
	node: Node;
	visible?: boolean;
}

function flipNode<T extends Node>(node: T, size: number, orthogonalSize: number): T {
	if (node instanceof BranchNode) {
		const result = new BranchNode(orthogonal(node.orientation), node.layoutController, node.styles, node.splitviewProportionalLayout, size, orthogonalSize, node.edgeSnapping);

		let totalSize = 0;

		for (let i = node.children.length - 1; i >= 0; i--) {
			const child = node.children[i];
			const childSize = child instanceof BranchNode ? child.orthogonalSize : child.size;

			let newSize = node.size === 0 ? 0 : Math.round((size * childSize) / node.size);
			totalSize += newSize;

			// The last view to add should adjust to rounding errors
			if (i === 0) {
				newSize += size - totalSize;
			}

			result.addChild(flipNode(child, orthogonalSize, newSize), newSize, 0, true);
		}

		return result as T;
	} else {
		return new LeafNode((node as LeafNode).view, orthogonal(node.orientation), node.layoutController, orthogonalSize) as T;
	}
}

/**
 * The location of a {@link IView view} within a {@link GridView}.
 *
 * A GridView is a tree composition of multiple {@link SplitView} instances, orthogonal
 * between one another. Here's an example:
 *
 * ```
 *  +-----+---------------+
 *  |  A  |      B        |
 *  +-----+---------+-----+
 *  |        C      |     |
 *  +---------------+  D  |
 *  |        E      |     |
 *  +---------------+-----+
 * ```
 *
 * The above grid's tree structure is:
 *
 * ```
 *  Vertical SplitView
 *  +-Horizontal SplitView
 *  | +-A
 *  | +-B
 *  +- Horizontal SplitView
 *    +-Vertical SplitView
 *    | +-C
 *    | +-E
 *    +-D
 * ```
 *
 * So, {@link IView views} within a {@link GridView} can be referenced by
 * a sequence of indexes, each index referencing each SplitView. Here are
 * each view's locations, from the example above:
 *
 * - `A`: `[0,0]`
 * - `B`: `[0,1]`
 * - `C`: `[1,0,0]`
 * - `D`: `[1,1]`
 * - `E`: `[1,0,1]`
 */
export type GridLocation = number[];

/**
 * The {@link GridView} is the UI component which implements a two dimensional
 * flex-like layout algorithm for a collection of {@link IView} instances, which
 * are mostly HTMLElement instances with size constraints. A {@link GridView} is a
 * tree composition of multiple {@link SplitView} instances, orthogonal between
 * one another. It will respect view's size contraints, just like the SplitView.
 *
 * It has a low-level index based API, allowing for fine grain performant operations.
 * Look into the {@link Grid} widget for a higher-level API.
 *
 * Features:
 * - flex-like layout algorithm
 * - snap support
 * - corner sash support
 * - Alt key modifier behavior, macOS style
 * - layout (de)serialization
 */
export class GridView implements IDisposable {

	/**
	 * The DOM element for this view.
	 */
	readonly element: HTMLElement;

	private styles: IGridViewStyles;
	private proportionalLayout: boolean;
	private _root!: BranchNode;
	private onDidSashResetRelay = new Relay<GridLocation>();
	private _onDidScroll = new Relay<void>();
	private _onDidChange = new Relay<IViewSize | undefined>();
	private _boundarySashes: IBoundarySashes = {};

	/**
	 * The layout controller makes sure layout only propagates
	 * to the views after the very first call to {@link GridView.layout}.
	 */
	private layoutController: LayoutController;
	private disposable2x2: IDisposable = Disposable.None;

	private get root(): BranchNode { return this._root; }

	private set root(root: BranchNode) {
		const oldRoot = this._root;

		if (oldRoot) {
			this.element.removeChild(oldRoot.element);
			oldRoot.dispose();
		}

		this._root = root;
		this.element.appendChild(root.element);
		this.onDidSashResetRelay.input = root.onDidSashReset;
		this._onDidChange.input = Event.map(root.onDidChange, () => undefined); // TODO
		this._onDidScroll.input = root.onDidScroll;
	}

	/**
	 * Fires whenever the user double clicks a {@link Sash sash}.
	 */
	readonly onDidSashReset = this.onDidSashResetRelay.event;

	/**
	 * Fires whenever the user scrolls a {@link SplitView} within
	 * the grid.
	 */
	readonly onDidScroll = this._onDidScroll.event;

	/**
	 * Fires whenever a view within the grid changes its size constraints.
	 */
	readonly onDidChange = this._onDidChange.event;

	/**
	 * The width of the grid.
	 */
	get width(): number { return this.root.width; }

	/**
	 * The height of the grid.
	 */
	get height(): number { return this.root.height; }

	/**
	 * The minimum width of the grid.
	 */
	get minimumWidth(): number { return this.root.minimumWidth; }

	/**
	 * The minimum height of the grid.
	 */
	get minimumHeight(): number { return this.root.minimumHeight; }

	/**
	 * The maximum width of the grid.
	 */
	get maximumWidth(): number { return this.root.maximumHeight; }

	/**
	 * The maximum height of the grid.
	 */
	get maximumHeight(): number { return this.root.maximumHeight; }

	get orientation(): Orientation { return this._root.orientation; }
	get boundarySashes(): IBoundarySashes { return this._boundarySashes; }

	/**
	 * The orientation of the grid. Matches the orientation of the root
	 * {@link SplitView} in the grid's tree model.
	 */
	set orientation(orientation: Orientation) {
		if (this._root.orientation === orientation) {
			return;
		}

		const { size, orthogonalSize, absoluteOffset, absoluteOrthogonalOffset } = this._root;
		this.root = flipNode(this._root, orthogonalSize, size);
		this.root.layout(size, 0, { orthogonalSize, absoluteOffset: absoluteOrthogonalOffset, absoluteOrthogonalOffset: absoluteOffset, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
		this.boundarySashes = this.boundarySashes;
	}

	/**
	 * A collection of sashes perpendicular to each edge of the grid.
	 * Corner sashes will be created for each intersection.
	 */
	set boundarySashes(boundarySashes: IBoundarySashes) {
		this._boundarySashes = boundarySashes;
		this.root.boundarySashes = fromAbsoluteBoundarySashes(boundarySashes, this.orientation);
	}

	/**
	 * Enable/disable edge snapping across all grid views.
	 */
	set edgeSnapping(edgeSnapping: boolean) {
		this.root.edgeSnapping = edgeSnapping;
	}

	/**
	 * Create a new {@link GridView} instance.
	 *
	 * @remarks It's the caller's responsibility to append the
	 * {@link GridView.element} to the page's DOM.
	 */
	constructor(options: IGridViewOptions = {}) {
		this.element = $('.monaco-grid-view');
		this.styles = options.styles || defaultStyles;
		this.proportionalLayout = typeof options.proportionalLayout !== 'undefined' ? !!options.proportionalLayout : true;
		this.layoutController = new LayoutController(false);
		this.root = new BranchNode(Orientation.VERTICAL, this.layoutController, this.styles, this.proportionalLayout);
	}

	style(styles: IGridViewStyles): void {
		this.styles = styles;
		this.root.style(styles);
	}

	/**
	 * Layout the {@link GridView}.
	 *
	 * Optionally provide a `top` and `left` positions, those will propagate
	 * as an origin for positions passed to {@link IView.layout}.
	 *
	 * @param width The width of the {@link GridView}.
	 * @param height The height of the {@link GridView}.
	 * @param top Optional, the top location of the {@link GridView}.
	 * @param left Optional, the left location of the {@link GridView}.
	 */
	layout(width: number, height: number, top: number = 0, left: number = 0): void {
		this.layoutController.isLayoutEnabled = true;

		const [size, orthogonalSize, offset, orthogonalOffset] = this.root.orientation === Orientation.HORIZONTAL ? [height, width, top, left] : [width, height, left, top];
		this.root.layout(size, 0, { orthogonalSize, absoluteOffset: offset, absoluteOrthogonalOffset: orthogonalOffset, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
	}

	/**
	 * Add a {@link IView view} to this {@link GridView}.
	 *
	 * @param view The view to add.
	 * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
	 * @param location The {@link GridLocation location} to insert the view on.
	 */
	addView(view: IView, size: number | Sizing, location: GridLocation): void {
		this.disposable2x2.dispose();
		this.disposable2x2 = Disposable.None;

		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (parent instanceof BranchNode) {
			const node = new LeafNode(view, orthogonal(parent.orientation), this.layoutController, parent.orthogonalSize);
			parent.addChild(node, size, index);

		} else {
			const [, grandParent] = tail(pathToParent);
			const [, parentIndex] = tail(rest);

			let newSiblingSize: number | Sizing = 0;

			const newSiblingCachedVisibleSize = grandParent.getChildCachedVisibleSize(parentIndex);
			if (typeof newSiblingCachedVisibleSize === 'number') {
				newSiblingSize = Sizing.Invisible(newSiblingCachedVisibleSize);
			}

			grandParent.removeChild(parentIndex);

			const newParent = new BranchNode(parent.orientation, parent.layoutController, this.styles, this.proportionalLayout, parent.size, parent.orthogonalSize, grandParent.edgeSnapping);
			grandParent.addChild(newParent, parent.size, parentIndex);

			const newSibling = new LeafNode(parent.view, grandParent.orientation, this.layoutController, parent.size);
			newParent.addChild(newSibling, newSiblingSize, 0);

			if (typeof size !== 'number' && size.type === 'split') {
				size = Sizing.Split(0);
			}

			const node = new LeafNode(view, grandParent.orientation, this.layoutController, parent.size);
			newParent.addChild(node, size, index);
		}

		this.trySet2x2();
	}

	/**
	 * Remove a {@link IView view} from this {@link GridView}.
	 *
	 * @param location The {@link GridLocation location} of the {@link IView view}.
	 * @param sizing Whether to distribute other {@link IView view}'s sizes.
	 */
	removeView(location: GridLocation, sizing?: DistributeSizing | AutoSizing): IView {
		this.disposable2x2.dispose();
		this.disposable2x2 = Disposable.None;

		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		const node = parent.children[index];

		if (!(node instanceof LeafNode)) {
			throw new Error('Invalid location');
		}

		parent.removeChild(index, sizing);

		if (parent.children.length === 0) {
			throw new Error('Invalid grid state');
		}

		if (parent.children.length > 1) {
			this.trySet2x2();
			return node.view;
		}

		if (pathToParent.length === 0) { // parent is root
			const sibling = parent.children[0];

			if (sibling instanceof LeafNode) {
				return node.view;
			}

			// we must promote sibling to be the new root
			parent.removeChild(0);
			this.root = sibling;
			this.boundarySashes = this.boundarySashes;
			this.trySet2x2();
			return node.view;
		}

		const [, grandParent] = tail(pathToParent);
		const [, parentIndex] = tail(rest);

		const sibling = parent.children[0];
		const isSiblingVisible = parent.isChildVisible(0);
		parent.removeChild(0);

		const sizes = grandParent.children.map((_, i) => grandParent.getChildSize(i));
		grandParent.removeChild(parentIndex, sizing);

		if (sibling instanceof BranchNode) {
			sizes.splice(parentIndex, 1, ...sibling.children.map(c => c.size));

			for (let i = 0; i < sibling.children.length; i++) {
				const child = sibling.children[i];
				grandParent.addChild(child, child.size, parentIndex + i);
			}
		} else {
			const newSibling = new LeafNode(sibling.view, orthogonal(sibling.orientation), this.layoutController, sibling.size);
			const sizing = isSiblingVisible ? sibling.orthogonalSize : Sizing.Invisible(sibling.orthogonalSize);
			grandParent.addChild(newSibling, sizing, parentIndex);
		}

		for (let i = 0; i < sizes.length; i++) {
			grandParent.resizeChild(i, sizes[i]);
		}

		this.trySet2x2();
		return node.view;
	}

	/**
	 * Move a {@link IView view} within its parent.
	 *
	 * @param parentLocation The {@link GridLocation location} of the {@link IView view}'s parent.
	 * @param from The index of the {@link IView view} to move.
	 * @param to The index where the {@link IView view} should move to.
	 */
	moveView(parentLocation: GridLocation, from: number, to: number): void {
		const [, parent] = this.getNode(parentLocation);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		parent.moveChild(from, to);

		this.trySet2x2();
	}

	/**
	 * Swap two {@link IView views} within the {@link GridView}.
	 *
	 * @param from The {@link GridLocation location} of one view.
	 * @param to The {@link GridLocation location} of another view.
	 */
	swapViews(from: GridLocation, to: GridLocation): void {
		const [fromRest, fromIndex] = tail(from);
		const [, fromParent] = this.getNode(fromRest);

		if (!(fromParent instanceof BranchNode)) {
			throw new Error('Invalid from location');
		}

		const fromSize = fromParent.getChildSize(fromIndex);
		const fromNode = fromParent.children[fromIndex];

		if (!(fromNode instanceof LeafNode)) {
			throw new Error('Invalid from location');
		}

		const [toRest, toIndex] = tail(to);
		const [, toParent] = this.getNode(toRest);

		if (!(toParent instanceof BranchNode)) {
			throw new Error('Invalid to location');
		}

		const toSize = toParent.getChildSize(toIndex);
		const toNode = toParent.children[toIndex];

		if (!(toNode instanceof LeafNode)) {
			throw new Error('Invalid to location');
		}

		if (fromParent === toParent) {
			fromParent.swapChildren(fromIndex, toIndex);
		} else {
			fromParent.removeChild(fromIndex);
			toParent.removeChild(toIndex);

			fromParent.addChild(toNode, fromSize, fromIndex);
			toParent.addChild(fromNode, toSize, toIndex);
		}

		this.trySet2x2();
	}

	/**
	 * Resize a {@link IView view}.
	 *
	 * @param location The {@link GridLocation location} of the view.
	 * @param size The size the view should be. Optionally provide a single dimension.
	 */
	resizeView(location: GridLocation, size: Partial<IViewSize>): void {
		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		if (!size.width && !size.height) {
			return;
		}

		const [parentSize, grandParentSize] = parent.orientation === Orientation.HORIZONTAL ? [size.width, size.height] : [size.height, size.width];

		if (typeof grandParentSize === 'number' && pathToParent.length > 0) {
			const [, grandParent] = tail(pathToParent);
			const [, parentIndex] = tail(rest);

			grandParent.resizeChild(parentIndex, grandParentSize);
		}

		if (typeof parentSize === 'number') {
			parent.resizeChild(index, parentSize);
		}

		this.trySet2x2();
	}

	/**
	 * Get the size of a {@link IView view}.
	 *
	 * @param location The {@link GridLocation location} of the view. Provide `undefined` to get
	 * the size of the grid itself.
	 */
	getViewSize(location?: GridLocation): IViewSize {
		if (!location) {
			return { width: this.root.width, height: this.root.height };
		}

		const [, node] = this.getNode(location);
		return { width: node.width, height: node.height };
	}

	/**
	 * Get the cached visible size of a {@link IView view}. This was the size
	 * of the view at the moment it last became hidden.
	 *
	 * @param location The {@link GridLocation location} of the view.
	 */
	getViewCachedVisibleSize(location: GridLocation): number | undefined {
		const [rest, index] = tail(location);
		const [, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		return parent.getChildCachedVisibleSize(index);
	}

	/**
	 * Maximize the size of a {@link IView view} by collapsing all other views
	 * to their minimum sizes.
	 *
	 * @param location The {@link GridLocation location} of the view.
	 */
	maximizeViewSize(location: GridLocation): void {
		const [ancestors, node] = this.getNode(location);

		if (!(node instanceof LeafNode)) {
			throw new Error('Invalid location');
		}

		for (let i = 0; i < ancestors.length; i++) {
			ancestors[i].resizeChild(location[i], Number.POSITIVE_INFINITY);
		}
	}

	/**
	 * Returns whether all other {@link IView views} are at their minimum size.
	 *
	 * @param location The {@link GridLocation location} of the view.
	 */
	isViewSizeMaximized(location: GridLocation): boolean {
		const [ancestors, node] = this.getNode(location);

		if (!(node instanceof LeafNode)) {
			throw new Error('Invalid location');
		}

		for (let i = 0; i < ancestors.length; i++) {
			if (!ancestors[i].isChildSizeMaximized(location[i])) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Distribute the size among all {@link IView views} within the entire
	 * grid or within a single {@link SplitView}.
	 *
	 * @param location The {@link GridLocation location} of a view containing
	 * children views, which will have their sizes distributed within the parent
	 * view's size. Provide `undefined` to recursively distribute all views' sizes
	 * in the entire grid.
	 */
	distributeViewSizes(location?: GridLocation): void {
		if (!location) {
			this.root.distributeViewSizes(true);
			return;
		}

		const [, node] = this.getNode(location);

		if (!(node instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		node.distributeViewSizes();
		this.trySet2x2();
	}

	/**
	 * Returns whether a {@link IView view} is visible.
	 *
	 * @param location The {@link GridLocation location} of the view.
	 */
	isViewVisible(location: GridLocation): boolean {
		const [rest, index] = tail(location);
		const [, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid from location');
		}

		return parent.isChildVisible(index);
	}

	/**
	 * Set the visibility state of a {@link IView view}.
	 *
	 * @param location The {@link GridLocation location} of the view.
	 */
	setViewVisible(location: GridLocation, visible: boolean): void {
		const [rest, index] = tail(location);
		const [, parent] = this.getNode(rest);

		if (!(parent instanceof BranchNode)) {
			throw new Error('Invalid from location');
		}

		parent.setChildVisible(index, visible);
	}

	/**
	 * Returns a descriptor for the entire grid.
	 */
	getView(): GridBranchNode;

	/**
	 * Returns a descriptor for a {@link GridLocation subtree} within the
	 * {@link GridView}.
	 *
	 * @param location The {@link GridLocation location} of the root of
	 * the {@link GridLocation subtree}.
	 */
	getView(location: GridLocation): GridNode;
	getView(location?: GridLocation): GridNode {
		const node = location ? this.getNode(location)[1] : this._root;
		return this._getViews(node, this.orientation);
	}

	/**
	 * Construct a new {@link GridView} from a JSON object.
	 *
	 * @param json The JSON object.
	 * @param deserializer A deserializer which can revive each view.
	 * @returns A new {@link GridView} instance.
	 */
	static deserialize<T extends ISerializableView>(json: ISerializedGridView, deserializer: IViewDeserializer<T>, options: IGridViewOptions = {}): GridView {
		if (typeof json.orientation !== 'number') {
			throw new Error('Invalid JSON: \'orientation\' property must be a number.');
		} else if (typeof json.width !== 'number') {
			throw new Error('Invalid JSON: \'width\' property must be a number.');
		} else if (typeof json.height !== 'number') {
			throw new Error('Invalid JSON: \'height\' property must be a number.');
		} else if (json.root?.type !== 'branch') {
			throw new Error('Invalid JSON: \'root\' property must have \'type\' value of branch.');
		}

		const orientation = json.orientation;
		const height = json.height;

		const result = new GridView(options);
		result._deserialize(json.root as ISerializedBranchNode, orientation, deserializer, height);

		return result;
	}

	private _deserialize(root: ISerializedBranchNode, orientation: Orientation, deserializer: IViewDeserializer<ISerializableView>, orthogonalSize: number): void {
		this.root = this._deserializeNode(root, orientation, deserializer, orthogonalSize) as BranchNode;
	}

	private _deserializeNode(node: ISerializedNode, orientation: Orientation, deserializer: IViewDeserializer<ISerializableView>, orthogonalSize: number): Node {
		let result: Node;
		if (node.type === 'branch') {
			const serializedChildren = node.data as ISerializedNode[];
			const children = serializedChildren.map(serializedChild => {
				return {
					node: this._deserializeNode(serializedChild, orthogonal(orientation), deserializer, node.size),
					visible: (serializedChild as { visible?: boolean }).visible
				} as INodeDescriptor;
			});

			result = new BranchNode(orientation, this.layoutController, this.styles, this.proportionalLayout, node.size, orthogonalSize, undefined, children);
		} else {
			result = new LeafNode(deserializer.fromJSON(node.data), orientation, this.layoutController, orthogonalSize, node.size);
		}

		return result;
	}

	private _getViews(node: Node, orientation: Orientation, cachedVisibleSize?: number): GridNode {
		const box = { top: node.top, left: node.left, width: node.width, height: node.height };

		if (node instanceof LeafNode) {
			return { view: node.view, box, cachedVisibleSize };
		}

		const children: GridNode[] = [];

		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			const cachedVisibleSize = node.getChildCachedVisibleSize(i);

			children.push(this._getViews(child, orthogonal(orientation), cachedVisibleSize));
		}

		return { children, box };
	}

	private getNode(location: GridLocation, node: Node = this.root, path: BranchNode[] = []): [BranchNode[], Node] {
		if (location.length === 0) {
			return [path, node];
		}

		if (!(node instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		const [index, ...rest] = location;

		if (index < 0 || index >= node.children.length) {
			throw new Error('Invalid location');
		}

		const child = node.children[index];
		path.push(node);

		return this.getNode(rest, child, path);
	}

	/**
	 * Attempt to lock the {@link Sash sashes} in this {@link GridView} so
	 * the grid behaves as a 2x2 matrix, with a corner sash in the middle.
	 *
	 * In case the grid isn't a 2x2 grid _and_ all sashes are not aligned,
	 * this method is a no-op.
	 */
	trySet2x2(): void {
		this.disposable2x2.dispose();
		this.disposable2x2 = Disposable.None;

		if (this.root.children.length !== 2) {
			return;
		}

		const [first, second] = this.root.children;

		if (!(first instanceof BranchNode) || !(second instanceof BranchNode)) {
			return;
		}

		this.disposable2x2 = first.trySet2x2(second);
	}

	/**
	 * Populate a map with views to DOM nodes.
	 * @remarks To be used internally only.
	 */
	getViewMap(map: Map<IView, HTMLElement>, node?: Node): void {
		if (!node) {
			node = this.root;
		}

		if (node instanceof BranchNode) {
			node.children.forEach(child => this.getViewMap(map, child));
		} else {
			map.set(node.view, node.element);
		}
	}

	dispose(): void {
		this.onDidSashResetRelay.dispose();
		this.root.dispose();

		if (this.element && this.element.parentElement) {
			this.element.parentElement.removeChild(this.element);
		}
	}
}
