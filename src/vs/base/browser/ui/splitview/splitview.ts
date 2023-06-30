/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { ISashEvent as IBaseSashEvent, Orientation, Sash, SashState } from 'vs/base/browser/ui/sash/sash';
import { SmoothScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { pushToEnd, pushToStart, range } from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { Scrollable, ScrollbarVisibility, ScrollEvent } from 'vs/base/common/scrollable';
import * as types from 'vs/base/common/types';
import 'vs/css!./splitview';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

export interface ISplitViewStyles {
	readonly separatorBorder: Color;
}

const defaultStyles: ISplitViewStyles = {
	separatorBorder: Color.transparent
};

export const enum LayoutPriority {
	Normal,
	Low,
	High
}

/**
 * The interface to implement for views within a {@link SplitView}.
 *
 * An optional {@link TLayoutContext layout context type} may be used in order to
 * pass along layout contextual data from the {@link SplitView.layout} method down
 * to each view's {@link IView.layout} calls.
 */
export interface IView<TLayoutContext = undefined> {

	/**
	 * The DOM element for this view.
	 */
	readonly element: HTMLElement;

	/**
	 * A minimum size for this view.
	 *
	 * @remarks If none, set it to `0`.
	 */
	readonly minimumSize: number;

	/**
	 * A maximum size for this view.
	 *
	 * @remarks If none, set it to `Number.POSITIVE_INFINITY`.
	 */
	readonly maximumSize: number;

	/**
	 * The priority of the view when the {@link SplitView.resize layout} algorithm
	 * runs. Views with higher priority will be resized first.
	 *
	 * @remarks Only used when `proportionalLayout` is false.
	 */
	readonly priority?: LayoutPriority;

	/**
	 * If the {@link SplitView} supports {@link ISplitViewOptions.proportionalLayout proportional layout},
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
	 * View instances are supposed to fire the {@link IView.onDidChange} event whenever
	 * any of the constraint properties have changed:
	 *
	 * - {@link IView.minimumSize}
	 * - {@link IView.maximumSize}
	 * - {@link IView.priority}
	 * - {@link IView.snap}
	 *
	 * The SplitView will relayout whenever that happens. The event can optionally emit
	 * the view's preferred size for that relayout.
	 */
	readonly onDidChange: Event<number | undefined>;

	/**
	 * This will be called by the {@link SplitView} during layout. A view meant to
	 * pass along the layout information down to its descendants.
	 *
	 * @param size The size of this view, in pixels.
	 * @param offset The offset of this view, relative to the start of the {@link SplitView}.
	 * @param context The optional {@link IView layout context} passed to {@link SplitView.layout}.
	 */
	layout(size: number, offset: number, context: TLayoutContext | undefined): void;

	/**
	 * This will be called by the {@link SplitView} whenever this view is made
	 * visible or hidden.
	 *
	 * @param visible Whether the view becomes visible.
	 */
	setVisible?(visible: boolean): void;
}

/**
 * A descriptor for a {@link SplitView} instance.
 */
export interface ISplitViewDescriptor<TLayoutContext = undefined> {

	/**
	 * The layout size of the {@link SplitView}.
	 */
	readonly size: number;

	/**
	 * Descriptors for each {@link IView view}.
	 */
	readonly views: {

		/**
		 * Whether the {@link IView view} is visible.
		 *
		 * @defaultValue `true`
		 */
		readonly visible?: boolean;

		/**
		 * The size of the {@link IView view}.
		 *
		 * @defaultValue `true`
		 */
		readonly size: number;

		/**
		 * The size of the {@link IView view}.
		 *
		 * @defaultValue `true`
		 */
		readonly view: IView<TLayoutContext>;
	}[];
}

export interface ISplitViewOptions<TLayoutContext = undefined> {

	/**
	 * Which axis the views align on.
	 *
	 * @defaultValue `Orientation.VERTICAL`
	 */
	readonly orientation?: Orientation;

	/**
	 * Styles overriding the {@link defaultStyles default ones}.
	 */
	readonly styles?: ISplitViewStyles;

	/**
	 * Make Alt-drag the default drag operation.
	 */
	readonly inverseAltBehavior?: boolean;

	/**
	 * Resize each view proportionally when resizing the SplitView.
	 *
	 * @defaultValue `true`
	 */
	readonly proportionalLayout?: boolean;

	/**
	 * An initial description of this {@link SplitView} instance, allowing
	 * to initialze all views within the ctor.
	 */
	readonly descriptor?: ISplitViewDescriptor<TLayoutContext>;

	/**
	 * The scrollbar visibility setting for whenever the views within
	 * the {@link SplitView} overflow.
	 */
	readonly scrollbarVisibility?: ScrollbarVisibility;

	/**
	 * Override the orthogonal size of sashes.
	 */
	readonly getSashOrthogonalSize?: () => number;
}

interface ISashEvent {
	readonly sash: Sash;
	readonly start: number;
	readonly current: number;
	readonly alt: boolean;
}

type ViewItemSize = number | { cachedVisibleSize: number };

abstract class ViewItem<TLayoutContext> {

	private _size: number;
	set size(size: number) {
		this._size = size;
	}

	get size(): number {
		return this._size;
	}

	private _cachedVisibleSize: number | undefined = undefined;
	get cachedVisibleSize(): number | undefined { return this._cachedVisibleSize; }

	get visible(): boolean {
		return typeof this._cachedVisibleSize === 'undefined';
	}

	setVisible(visible: boolean, size?: number): void {
		if (visible === this.visible) {
			return;
		}

		if (visible) {
			this.size = clamp(this._cachedVisibleSize!, this.viewMinimumSize, this.viewMaximumSize);
			this._cachedVisibleSize = undefined;
		} else {
			this._cachedVisibleSize = typeof size === 'number' ? size : this.size;
			this.size = 0;
		}

		this.container.classList.toggle('visible', visible);

		this.view.setVisible?.(visible);
	}

	get minimumSize(): number { return this.visible ? this.view.minimumSize : 0; }
	get viewMinimumSize(): number { return this.view.minimumSize; }

	get maximumSize(): number { return this.visible ? this.view.maximumSize : 0; }
	get viewMaximumSize(): number { return this.view.maximumSize; }

	get priority(): LayoutPriority | undefined { return this.view.priority; }
	get proportionalLayout(): boolean { return this.view.proportionalLayout ?? true; }
	get snap(): boolean { return !!this.view.snap; }

	set enabled(enabled: boolean) {
		this.container.style.pointerEvents = enabled ? '' : 'none';
	}

	constructor(
		protected container: HTMLElement,
		private view: IView<TLayoutContext>,
		size: ViewItemSize,
		private disposable: IDisposable
	) {
		if (typeof size === 'number') {
			this._size = size;
			this._cachedVisibleSize = undefined;
			container.classList.add('visible');
		} else {
			this._size = 0;
			this._cachedVisibleSize = size.cachedVisibleSize;
		}
	}

	layout(offset: number, layoutContext: TLayoutContext | undefined): void {
		this.layoutContainer(offset);
		this.view.layout(this.size, offset, layoutContext);
	}

	abstract layoutContainer(offset: number): void;

	dispose(): IView<TLayoutContext> {
		this.disposable.dispose();
		return this.view;
	}
}

class VerticalViewItem<TLayoutContext> extends ViewItem<TLayoutContext> {

	layoutContainer(offset: number): void {
		this.container.style.top = `${offset}px`;
		this.container.style.height = `${this.size}px`;
	}
}

class HorizontalViewItem<TLayoutContext> extends ViewItem<TLayoutContext> {

	layoutContainer(offset: number): void {
		this.container.style.left = `${offset}px`;
		this.container.style.width = `${this.size}px`;
	}
}

interface ISashItem {
	sash: Sash;
	disposable: IDisposable;
}

interface ISashDragSnapState {
	readonly index: number;
	readonly limitDelta: number;
	readonly size: number;
}

interface ISashDragState {
	index: number;
	start: number;
	current: number;
	sizes: number[];
	minDelta: number;
	maxDelta: number;
	alt: boolean;
	snapBefore: ISashDragSnapState | undefined;
	snapAfter: ISashDragSnapState | undefined;
	disposable: IDisposable;
}

enum State {
	Idle,
	Busy
}

/**
 * When adding or removing views, uniformly distribute the entire split view space among
 * all views.
 */
export type DistributeSizing = { type: 'distribute' };

/**
 * When adding a view, make space for it by reducing the size of another view,
 * indexed by the provided `index`.
 */
export type SplitSizing = { type: 'split'; index: number };

/**
 * When adding a view, use DistributeSizing when all pre-existing views are
 * distributed evenly, otherwise use SplitSizing.
 */
export type AutoSizing = { type: 'auto'; index: number };

/**
 * When adding or removing views, assume the view is invisible.
 */
export type InvisibleSizing = { type: 'invisible'; cachedVisibleSize: number };

/**
 * When adding or removing views, the sizing provides fine grained
 * control over how other views get resized.
 */
export type Sizing = DistributeSizing | SplitSizing | AutoSizing | InvisibleSizing;

export namespace Sizing {

	/**
	 * When adding or removing views, distribute the delta space among
	 * all other views.
	 */
	export const Distribute: DistributeSizing = { type: 'distribute' };

	/**
	 * When adding or removing views, split the delta space with another
	 * specific view, indexed by the provided `index`.
	 */
	export function Split(index: number): SplitSizing { return { type: 'split', index }; }

	/**
	 * When adding a view, use DistributeSizing when all pre-existing views are
	 * distributed evenly, otherwise use SplitSizing.
	 */
	export function Auto(index: number): AutoSizing { return { type: 'auto', index }; }

	/**
	 * When adding or removing views, assume the view is invisible.
	 */
	export function Invisible(cachedVisibleSize: number): InvisibleSizing { return { type: 'invisible', cachedVisibleSize }; }
}

/**
 * The {@link SplitView} is the UI component which implements a one dimensional
 * flex-like layout algorithm for a collection of {@link IView} instances, which
 * are essentially HTMLElement instances with the following size constraints:
 *
 * - {@link IView.minimumSize}
 * - {@link IView.maximumSize}
 * - {@link IView.priority}
 * - {@link IView.snap}
 *
 * In case the SplitView doesn't have enough size to fit all views, it will overflow
 * its content with a scrollbar.
 *
 * In between each pair of views there will be a {@link Sash} allowing the user
 * to resize the views, making sure the constraints are respected.
 *
 * An optional {@link TLayoutContext layout context type} may be used in order to
 * pass along layout contextual data from the {@link SplitView.layout} method down
 * to each view's {@link IView.layout} calls.
 *
 * Features:
 * - Flex-like layout algorithm
 * - Snap support
 * - Orthogonal sash support, for corner sashes
 * - View hide/show support
 * - View swap/move support
 * - Alt key modifier behavior, macOS style
 */
export class SplitView<TLayoutContext = undefined> extends Disposable {

	/**
	 * This {@link SplitView}'s orientation.
	 */
	readonly orientation: Orientation;

	/**
	 * The DOM element representing this {@link SplitView}.
	 */
	readonly el: HTMLElement;

	private sashContainer: HTMLElement;
	private viewContainer: HTMLElement;
	private scrollable: Scrollable;
	private scrollableElement: SmoothScrollableElement;
	private size = 0;
	private layoutContext: TLayoutContext | undefined;
	private contentSize = 0;
	private proportions: (number | undefined)[] | undefined = undefined;
	private viewItems: ViewItem<TLayoutContext>[] = [];
	sashItems: ISashItem[] = []; // used in tests
	private sashDragState: ISashDragState | undefined;
	private state: State = State.Idle;
	private inverseAltBehavior: boolean;
	private proportionalLayout: boolean;
	private readonly getSashOrthogonalSize: { (): number } | undefined;

	private _onDidSashChange = this._register(new Emitter<number>());
	private _onDidSashReset = this._register(new Emitter<number>());
	private _orthogonalStartSash: Sash | undefined;
	private _orthogonalEndSash: Sash | undefined;
	private _startSnappingEnabled = true;
	private _endSnappingEnabled = true;

	/**
	 * Fires whenever the user resizes a {@link Sash sash}.
	 */
	readonly onDidSashChange = this._onDidSashChange.event;

	/**
	 * Fires whenever the user double clicks a {@link Sash sash}.
	 */
	readonly onDidSashReset = this._onDidSashReset.event;

	/**
	 * Fires whenever the split view is scrolled.
	 */
	readonly onDidScroll: Event<ScrollEvent>;

	/**
	 * The amount of views in this {@link SplitView}.
	 */
	get length(): number {
		return this.viewItems.length;
	}

	/**
	 * The minimum size of this {@link SplitView}.
	 */
	get minimumSize(): number {
		return this.viewItems.reduce((r, item) => r + item.minimumSize, 0);
	}

	/**
	 * The maximum size of this {@link SplitView}.
	 */
	get maximumSize(): number {
		return this.length === 0 ? Number.POSITIVE_INFINITY : this.viewItems.reduce((r, item) => r + item.maximumSize, 0);
	}

	get orthogonalStartSash(): Sash | undefined { return this._orthogonalStartSash; }
	get orthogonalEndSash(): Sash | undefined { return this._orthogonalEndSash; }
	get startSnappingEnabled(): boolean { return this._startSnappingEnabled; }
	get endSnappingEnabled(): boolean { return this._endSnappingEnabled; }

	/**
	 * A reference to a sash, perpendicular to all sashes in this {@link SplitView},
	 * located at the left- or top-most side of the SplitView.
	 * Corner sashes will be created automatically at the intersections.
	 */
	set orthogonalStartSash(sash: Sash | undefined) {
		for (const sashItem of this.sashItems) {
			sashItem.sash.orthogonalStartSash = sash;
		}

		this._orthogonalStartSash = sash;
	}

	/**
	 * A reference to a sash, perpendicular to all sashes in this {@link SplitView},
	 * located at the right- or bottom-most side of the SplitView.
	 * Corner sashes will be created automatically at the intersections.
	 */
	set orthogonalEndSash(sash: Sash | undefined) {
		for (const sashItem of this.sashItems) {
			sashItem.sash.orthogonalEndSash = sash;
		}

		this._orthogonalEndSash = sash;
	}

	/**
	 * The internal sashes within this {@link SplitView}.
	 */
	get sashes(): readonly Sash[] {
		return this.sashItems.map(s => s.sash);
	}

	/**
	 * Enable/disable snapping at the beginning of this {@link SplitView}.
	 */
	set startSnappingEnabled(startSnappingEnabled: boolean) {
		if (this._startSnappingEnabled === startSnappingEnabled) {
			return;
		}

		this._startSnappingEnabled = startSnappingEnabled;
		this.updateSashEnablement();
	}

	/**
	 * Enable/disable snapping at the end of this {@link SplitView}.
	 */
	set endSnappingEnabled(endSnappingEnabled: boolean) {
		if (this._endSnappingEnabled === endSnappingEnabled) {
			return;
		}

		this._endSnappingEnabled = endSnappingEnabled;
		this.updateSashEnablement();
	}

	/**
	 * Create a new {@link SplitView} instance.
	 */
	constructor(container: HTMLElement, options: ISplitViewOptions<TLayoutContext> = {}) {
		super();

		this.orientation = options.orientation ?? Orientation.VERTICAL;
		this.inverseAltBehavior = options.inverseAltBehavior ?? false;
		this.proportionalLayout = options.proportionalLayout ?? true;
		this.getSashOrthogonalSize = options.getSashOrthogonalSize;

		this.el = document.createElement('div');
		this.el.classList.add('monaco-split-view2');
		this.el.classList.add(this.orientation === Orientation.VERTICAL ? 'vertical' : 'horizontal');
		container.appendChild(this.el);

		this.sashContainer = append(this.el, $('.sash-container'));
		this.viewContainer = $('.split-view-container');

		this.scrollable = new Scrollable({
			forceIntegerValues: true,
			smoothScrollDuration: 125,
			scheduleAtNextAnimationFrame
		});
		this.scrollableElement = this._register(new SmoothScrollableElement(this.viewContainer, {
			vertical: this.orientation === Orientation.VERTICAL ? (options.scrollbarVisibility ?? ScrollbarVisibility.Auto) : ScrollbarVisibility.Hidden,
			horizontal: this.orientation === Orientation.HORIZONTAL ? (options.scrollbarVisibility ?? ScrollbarVisibility.Auto) : ScrollbarVisibility.Hidden
		}, this.scrollable));

		// https://github.com/microsoft/vscode/issues/157737
		const onDidScrollViewContainer = this._register(new DomEmitter(this.viewContainer, 'scroll')).event;
		this._register(onDidScrollViewContainer(_ => {
			const position = this.scrollableElement.getScrollPosition();
			const scrollLeft = Math.abs(this.viewContainer.scrollLeft - position.scrollLeft) <= 1 ? undefined : this.viewContainer.scrollLeft;
			const scrollTop = Math.abs(this.viewContainer.scrollTop - position.scrollTop) <= 1 ? undefined : this.viewContainer.scrollTop;

			if (scrollLeft !== undefined || scrollTop !== undefined) {
				this.scrollableElement.setScrollPosition({ scrollLeft, scrollTop });
			}
		}));

		this.onDidScroll = this.scrollableElement.onScroll;
		this._register(this.onDidScroll(e => {
			if (e.scrollTopChanged) {
				this.viewContainer.scrollTop = e.scrollTop;
			}

			if (e.scrollLeftChanged) {
				this.viewContainer.scrollLeft = e.scrollLeft;
			}
		}));

		append(this.el, this.scrollableElement.getDomNode());

		this.style(options.styles || defaultStyles);

		// We have an existing set of view, add them now
		if (options.descriptor) {
			this.size = options.descriptor.size;
			options.descriptor.views.forEach((viewDescriptor, index) => {
				const sizing = types.isUndefined(viewDescriptor.visible) || viewDescriptor.visible ? viewDescriptor.size : { type: 'invisible', cachedVisibleSize: viewDescriptor.size } as InvisibleSizing;

				const view = viewDescriptor.view;
				this.doAddView(view, sizing, index, true);
			});

			// Initialize content size and proportions for first layout
			this.contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
			this.saveProportions();
		}
	}

	style(styles: ISplitViewStyles): void {
		if (styles.separatorBorder.isTransparent()) {
			this.el.classList.remove('separator-border');
			this.el.style.removeProperty('--separator-border');
		} else {
			this.el.classList.add('separator-border');
			this.el.style.setProperty('--separator-border', styles.separatorBorder.toString());
		}
	}

	/**
	 * Add a {@link IView view} to this {@link SplitView}.
	 *
	 * @param view The view to add.
	 * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
	 * @param index The index to insert the view on.
	 * @param skipLayout Whether layout should be skipped.
	 */
	addView(view: IView<TLayoutContext>, size: number | Sizing, index = this.viewItems.length, skipLayout?: boolean): void {
		this.doAddView(view, size, index, skipLayout);
	}

	/**
	 * Remove a {@link IView view} from this {@link SplitView}.
	 *
	 * @param index The index where the {@link IView view} is located.
	 * @param sizing Whether to distribute other {@link IView view}'s sizes.
	 */
	removeView(index: number, sizing?: Sizing): IView<TLayoutContext> {
		if (this.state !== State.Idle) {
			throw new Error('Cant modify splitview');
		}

		this.state = State.Busy;

		if (index < 0 || index >= this.viewItems.length) {
			throw new Error('Index out of bounds');
		}

		if (sizing?.type === 'auto') {
			if (this.areViewsDistributed()) {
				sizing = { type: 'distribute' };
			} else {
				sizing = undefined;
			}
		}

		// Remove view
		const viewItem = this.viewItems.splice(index, 1)[0];
		const view = viewItem.dispose();

		// Remove sash
		if (this.viewItems.length >= 1) {
			const sashIndex = Math.max(index - 1, 0);
			const sashItem = this.sashItems.splice(sashIndex, 1)[0];
			sashItem.disposable.dispose();
		}

		this.relayout();
		this.state = State.Idle;

		if (sizing?.type === 'distribute') {
			this.distributeViewSizes();
		}

		return view;
	}

	/**
	 * Move a {@link IView view} to a different index.
	 *
	 * @param from The source index.
	 * @param to The target index.
	 */
	moveView(from: number, to: number): void {
		if (this.state !== State.Idle) {
			throw new Error('Cant modify splitview');
		}

		const cachedVisibleSize = this.getViewCachedVisibleSize(from);
		const sizing = typeof cachedVisibleSize === 'undefined' ? this.getViewSize(from) : Sizing.Invisible(cachedVisibleSize);
		const view = this.removeView(from);
		this.addView(view, sizing, to);
	}


	/**
	 * Swap two {@link IView views}.
	 *
	 * @param from The source index.
	 * @param to The target index.
	 */
	swapViews(from: number, to: number): void {
		if (this.state !== State.Idle) {
			throw new Error('Cant modify splitview');
		}

		if (from > to) {
			return this.swapViews(to, from);
		}

		const fromSize = this.getViewSize(from);
		const toSize = this.getViewSize(to);
		const toView = this.removeView(to);
		const fromView = this.removeView(from);

		this.addView(toView, fromSize, from);
		this.addView(fromView, toSize, to);
	}

	/**
	 * Returns whether the {@link IView view} is visible.
	 *
	 * @param index The {@link IView view} index.
	 */
	isViewVisible(index: number): boolean {
		if (index < 0 || index >= this.viewItems.length) {
			throw new Error('Index out of bounds');
		}

		const viewItem = this.viewItems[index];
		return viewItem.visible;
	}

	/**
	 * Set a {@link IView view}'s visibility.
	 *
	 * @param index The {@link IView view} index.
	 * @param visible Whether the {@link IView view} should be visible.
	 */
	setViewVisible(index: number, visible: boolean): void {
		if (index < 0 || index >= this.viewItems.length) {
			throw new Error('Index out of bounds');
		}

		const viewItem = this.viewItems[index];
		viewItem.setVisible(visible);

		this.distributeEmptySpace(index);
		this.layoutViews();
		this.saveProportions();
	}

	/**
	 * Returns the {@link IView view}'s size previously to being hidden.
	 *
	 * @param index The {@link IView view} index.
	 */
	getViewCachedVisibleSize(index: number): number | undefined {
		if (index < 0 || index >= this.viewItems.length) {
			throw new Error('Index out of bounds');
		}

		const viewItem = this.viewItems[index];
		return viewItem.cachedVisibleSize;
	}

	/**
	 * Layout the {@link SplitView}.
	 *
	 * @param size The entire size of the {@link SplitView}.
	 * @param layoutContext An optional layout context to pass along to {@link IView views}.
	 */
	layout(size: number, layoutContext?: TLayoutContext): void {
		const previousSize = Math.max(this.size, this.contentSize);
		this.size = size;
		this.layoutContext = layoutContext;

		if (!this.proportions) {
			const indexes = range(this.viewItems.length);
			const lowPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === LayoutPriority.Low);
			const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === LayoutPriority.High);

			this.resize(this.viewItems.length - 1, size - previousSize, undefined, lowPriorityIndexes, highPriorityIndexes);
		} else {
			let total = 0;

			for (let i = 0; i < this.viewItems.length; i++) {
				const item = this.viewItems[i];
				const proportion = this.proportions[i];

				if (typeof proportion === 'number') {
					total += proportion;
				} else {
					size -= item.size;
				}
			}

			for (let i = 0; i < this.viewItems.length; i++) {
				const item = this.viewItems[i];
				const proportion = this.proportions[i];

				if (typeof proportion === 'number') {
					item.size = clamp(Math.round(proportion * size / total), item.minimumSize, item.maximumSize);
				}
			}
		}

		this.distributeEmptySpace();
		this.layoutViews();
	}

	private saveProportions(): void {
		if (this.proportionalLayout && this.contentSize > 0) {
			this.proportions = this.viewItems.map(i => i.proportionalLayout ? i.size / this.contentSize : undefined);
		}
	}

	private onSashStart({ sash, start, alt }: ISashEvent): void {
		for (const item of this.viewItems) {
			item.enabled = false;
		}

		const index = this.sashItems.findIndex(item => item.sash === sash);

		// This way, we can press Alt while we resize a sash, macOS style!
		const disposable = combinedDisposable(
			addDisposableListener(document.body, 'keydown', e => resetSashDragState(this.sashDragState!.current, e.altKey)),
			addDisposableListener(document.body, 'keyup', () => resetSashDragState(this.sashDragState!.current, false))
		);

		const resetSashDragState = (start: number, alt: boolean) => {
			const sizes = this.viewItems.map(i => i.size);
			let minDelta = Number.NEGATIVE_INFINITY;
			let maxDelta = Number.POSITIVE_INFINITY;

			if (this.inverseAltBehavior) {
				alt = !alt;
			}

			if (alt) {
				// When we're using the last sash with Alt, we're resizing
				// the view to the left/up, instead of right/down as usual
				// Thus, we must do the inverse of the usual
				const isLastSash = index === this.sashItems.length - 1;

				if (isLastSash) {
					const viewItem = this.viewItems[index];
					minDelta = (viewItem.minimumSize - viewItem.size) / 2;
					maxDelta = (viewItem.maximumSize - viewItem.size) / 2;
				} else {
					const viewItem = this.viewItems[index + 1];
					minDelta = (viewItem.size - viewItem.maximumSize) / 2;
					maxDelta = (viewItem.size - viewItem.minimumSize) / 2;
				}
			}

			let snapBefore: ISashDragSnapState | undefined;
			let snapAfter: ISashDragSnapState | undefined;

			if (!alt) {
				const upIndexes = range(index, -1);
				const downIndexes = range(index + 1, this.viewItems.length);
				const minDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].minimumSize - sizes[i]), 0);
				const maxDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].viewMaximumSize - sizes[i]), 0);
				const maxDeltaDown = downIndexes.length === 0 ? Number.POSITIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].minimumSize), 0);
				const minDeltaDown = downIndexes.length === 0 ? Number.NEGATIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].viewMaximumSize), 0);
				const minDelta = Math.max(minDeltaUp, minDeltaDown);
				const maxDelta = Math.min(maxDeltaDown, maxDeltaUp);
				const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
				const snapAfterIndex = this.findFirstSnapIndex(downIndexes);

				if (typeof snapBeforeIndex === 'number') {
					const viewItem = this.viewItems[snapBeforeIndex];
					const halfSize = Math.floor(viewItem.viewMinimumSize / 2);

					snapBefore = {
						index: snapBeforeIndex,
						limitDelta: viewItem.visible ? minDelta - halfSize : minDelta + halfSize,
						size: viewItem.size
					};
				}

				if (typeof snapAfterIndex === 'number') {
					const viewItem = this.viewItems[snapAfterIndex];
					const halfSize = Math.floor(viewItem.viewMinimumSize / 2);

					snapAfter = {
						index: snapAfterIndex,
						limitDelta: viewItem.visible ? maxDelta + halfSize : maxDelta - halfSize,
						size: viewItem.size
					};
				}
			}

			this.sashDragState = { start, current: start, index, sizes, minDelta, maxDelta, alt, snapBefore, snapAfter, disposable };
		};

		resetSashDragState(start, alt);
	}

	private onSashChange({ current }: ISashEvent): void {
		const { index, start, sizes, alt, minDelta, maxDelta, snapBefore, snapAfter } = this.sashDragState!;
		this.sashDragState!.current = current;

		const delta = current - start;
		const newDelta = this.resize(index, delta, sizes, undefined, undefined, minDelta, maxDelta, snapBefore, snapAfter);

		if (alt) {
			const isLastSash = index === this.sashItems.length - 1;
			const newSizes = this.viewItems.map(i => i.size);
			const viewItemIndex = isLastSash ? index : index + 1;
			const viewItem = this.viewItems[viewItemIndex];
			const newMinDelta = viewItem.size - viewItem.maximumSize;
			const newMaxDelta = viewItem.size - viewItem.minimumSize;
			const resizeIndex = isLastSash ? index - 1 : index + 1;

			this.resize(resizeIndex, -newDelta, newSizes, undefined, undefined, newMinDelta, newMaxDelta);
		}

		this.distributeEmptySpace();
		this.layoutViews();
	}

	private onSashEnd(index: number): void {
		this._onDidSashChange.fire(index);
		this.sashDragState!.disposable.dispose();
		this.saveProportions();

		for (const item of this.viewItems) {
			item.enabled = true;
		}
	}

	private onViewChange(item: ViewItem<TLayoutContext>, size: number | undefined): void {
		const index = this.viewItems.indexOf(item);

		if (index < 0 || index >= this.viewItems.length) {
			return;
		}

		size = typeof size === 'number' ? size : item.size;
		size = clamp(size, item.minimumSize, item.maximumSize);

		if (this.inverseAltBehavior && index > 0) {
			// In this case, we want the view to grow or shrink both sides equally
			// so we just resize the "left" side by half and let `resize` do the clamping magic
			this.resize(index - 1, Math.floor((item.size - size) / 2));
			this.distributeEmptySpace();
			this.layoutViews();
		} else {
			item.size = size;
			this.relayout([index], undefined);
		}
	}

	/**
	 * Resize a {@link IView view} within the {@link SplitView}.
	 *
	 * @param index The {@link IView view} index.
	 * @param size The {@link IView view} size.
	 */
	resizeView(index: number, size: number): void {
		if (this.state !== State.Idle) {
			throw new Error('Cant modify splitview');
		}

		this.state = State.Busy;

		if (index < 0 || index >= this.viewItems.length) {
			return;
		}

		const indexes = range(this.viewItems.length).filter(i => i !== index);
		const lowPriorityIndexes = [...indexes.filter(i => this.viewItems[i].priority === LayoutPriority.Low), index];
		const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === LayoutPriority.High);

		const item = this.viewItems[index];
		size = Math.round(size);
		size = clamp(size, item.minimumSize, Math.min(item.maximumSize, this.size));

		item.size = size;
		this.relayout(lowPriorityIndexes, highPriorityIndexes);
		this.state = State.Idle;
	}

	/**
	 * Returns whether all other {@link IView views} are at their minimum size.
	 */
	isViewSizeMaximized(index: number): boolean {
		if (index < 0 || index >= this.viewItems.length) {
			return false;
		}

		for (const item of this.viewItems) {
			if (item !== this.viewItems[index] && item.size > item.minimumSize) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Distribute the entire {@link SplitView} size among all {@link IView views}.
	 */
	distributeViewSizes(): void {
		const flexibleViewItems: ViewItem<TLayoutContext>[] = [];
		let flexibleSize = 0;

		for (const item of this.viewItems) {
			if (item.maximumSize - item.minimumSize > 0) {
				flexibleViewItems.push(item);
				flexibleSize += item.size;
			}
		}

		const size = Math.floor(flexibleSize / flexibleViewItems.length);

		for (const item of flexibleViewItems) {
			item.size = clamp(size, item.minimumSize, item.maximumSize);
		}

		const indexes = range(this.viewItems.length);
		const lowPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === LayoutPriority.Low);
		const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === LayoutPriority.High);

		this.relayout(lowPriorityIndexes, highPriorityIndexes);
	}

	/**
	 * Returns the size of a {@link IView view}.
	 */
	getViewSize(index: number): number {
		if (index < 0 || index >= this.viewItems.length) {
			return -1;
		}

		return this.viewItems[index].size;
	}

	private doAddView(view: IView<TLayoutContext>, size: number | Sizing, index = this.viewItems.length, skipLayout?: boolean): void {
		if (this.state !== State.Idle) {
			throw new Error('Cant modify splitview');
		}

		this.state = State.Busy;

		// Add view
		const container = $('.split-view-view');

		if (index === this.viewItems.length) {
			this.viewContainer.appendChild(container);
		} else {
			this.viewContainer.insertBefore(container, this.viewContainer.children.item(index));
		}

		const onChangeDisposable = view.onDidChange(size => this.onViewChange(item, size));
		const containerDisposable = toDisposable(() => this.viewContainer.removeChild(container));
		const disposable = combinedDisposable(onChangeDisposable, containerDisposable);

		let viewSize: ViewItemSize;

		if (typeof size === 'number') {
			viewSize = size;
		} else {
			if (size.type === 'auto') {
				if (this.areViewsDistributed()) {
					size = { type: 'distribute' };
				} else {
					size = { type: 'split', index: size.index };
				}
			}

			if (size.type === 'split') {
				viewSize = this.getViewSize(size.index) / 2;
			} else if (size.type === 'invisible') {
				viewSize = { cachedVisibleSize: size.cachedVisibleSize };
			} else {
				viewSize = view.minimumSize;
			}
		}

		const item = this.orientation === Orientation.VERTICAL
			? new VerticalViewItem(container, view, viewSize, disposable)
			: new HorizontalViewItem(container, view, viewSize, disposable);

		this.viewItems.splice(index, 0, item);

		// Add sash
		if (this.viewItems.length > 1) {
			const opts = { orthogonalStartSash: this.orthogonalStartSash, orthogonalEndSash: this.orthogonalEndSash };

			const sash = this.orientation === Orientation.VERTICAL
				? new Sash(this.sashContainer, { getHorizontalSashTop: s => this.getSashPosition(s), getHorizontalSashWidth: this.getSashOrthogonalSize }, { ...opts, orientation: Orientation.HORIZONTAL })
				: new Sash(this.sashContainer, { getVerticalSashLeft: s => this.getSashPosition(s), getVerticalSashHeight: this.getSashOrthogonalSize }, { ...opts, orientation: Orientation.VERTICAL });

			const sashEventMapper = this.orientation === Orientation.VERTICAL
				? (e: IBaseSashEvent) => ({ sash, start: e.startY, current: e.currentY, alt: e.altKey })
				: (e: IBaseSashEvent) => ({ sash, start: e.startX, current: e.currentX, alt: e.altKey });

			const onStart = Event.map(sash.onDidStart, sashEventMapper);
			const onStartDisposable = onStart(this.onSashStart, this);
			const onChange = Event.map(sash.onDidChange, sashEventMapper);
			const onChangeDisposable = onChange(this.onSashChange, this);
			const onEnd = Event.map(sash.onDidEnd, () => this.sashItems.findIndex(item => item.sash === sash));
			const onEndDisposable = onEnd(this.onSashEnd, this);

			const onDidResetDisposable = sash.onDidReset(() => {
				const index = this.sashItems.findIndex(item => item.sash === sash);
				const upIndexes = range(index, -1);
				const downIndexes = range(index + 1, this.viewItems.length);
				const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
				const snapAfterIndex = this.findFirstSnapIndex(downIndexes);

				if (typeof snapBeforeIndex === 'number' && !this.viewItems[snapBeforeIndex].visible) {
					return;
				}

				if (typeof snapAfterIndex === 'number' && !this.viewItems[snapAfterIndex].visible) {
					return;
				}

				this._onDidSashReset.fire(index);
			});

			const disposable = combinedDisposable(onStartDisposable, onChangeDisposable, onEndDisposable, onDidResetDisposable, sash);
			const sashItem: ISashItem = { sash, disposable };

			this.sashItems.splice(index - 1, 0, sashItem);
		}

		container.appendChild(view.element);

		let highPriorityIndexes: number[] | undefined;

		if (typeof size !== 'number' && size.type === 'split') {
			highPriorityIndexes = [size.index];
		}

		if (!skipLayout) {
			this.relayout([index], highPriorityIndexes);
		}

		this.state = State.Idle;

		if (!skipLayout && typeof size !== 'number' && size.type === 'distribute') {
			this.distributeViewSizes();
		}
	}

	private relayout(lowPriorityIndexes?: number[], highPriorityIndexes?: number[]): void {
		const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);

		this.resize(this.viewItems.length - 1, this.size - contentSize, undefined, lowPriorityIndexes, highPriorityIndexes);
		this.distributeEmptySpace();
		this.layoutViews();
		this.saveProportions();
	}

	private resize(
		index: number,
		delta: number,
		sizes = this.viewItems.map(i => i.size),
		lowPriorityIndexes?: number[],
		highPriorityIndexes?: number[],
		overloadMinDelta: number = Number.NEGATIVE_INFINITY,
		overloadMaxDelta: number = Number.POSITIVE_INFINITY,
		snapBefore?: ISashDragSnapState,
		snapAfter?: ISashDragSnapState
	): number {
		if (index < 0 || index >= this.viewItems.length) {
			return 0;
		}

		const upIndexes = range(index, -1);
		const downIndexes = range(index + 1, this.viewItems.length);

		if (highPriorityIndexes) {
			for (const index of highPriorityIndexes) {
				pushToStart(upIndexes, index);
				pushToStart(downIndexes, index);
			}
		}

		if (lowPriorityIndexes) {
			for (const index of lowPriorityIndexes) {
				pushToEnd(upIndexes, index);
				pushToEnd(downIndexes, index);
			}
		}

		const upItems = upIndexes.map(i => this.viewItems[i]);
		const upSizes = upIndexes.map(i => sizes[i]);

		const downItems = downIndexes.map(i => this.viewItems[i]);
		const downSizes = downIndexes.map(i => sizes[i]);

		const minDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].minimumSize - sizes[i]), 0);
		const maxDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].maximumSize - sizes[i]), 0);
		const maxDeltaDown = downIndexes.length === 0 ? Number.POSITIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].minimumSize), 0);
		const minDeltaDown = downIndexes.length === 0 ? Number.NEGATIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].maximumSize), 0);
		const minDelta = Math.max(minDeltaUp, minDeltaDown, overloadMinDelta);
		const maxDelta = Math.min(maxDeltaDown, maxDeltaUp, overloadMaxDelta);

		let snapped = false;

		if (snapBefore) {
			const snapView = this.viewItems[snapBefore.index];
			const visible = delta >= snapBefore.limitDelta;
			snapped = visible !== snapView.visible;
			snapView.setVisible(visible, snapBefore.size);
		}

		if (!snapped && snapAfter) {
			const snapView = this.viewItems[snapAfter.index];
			const visible = delta < snapAfter.limitDelta;
			snapped = visible !== snapView.visible;
			snapView.setVisible(visible, snapAfter.size);
		}

		if (snapped) {
			return this.resize(index, delta, sizes, lowPriorityIndexes, highPriorityIndexes, overloadMinDelta, overloadMaxDelta);
		}

		delta = clamp(delta, minDelta, maxDelta);

		for (let i = 0, deltaUp = delta; i < upItems.length; i++) {
			const item = upItems[i];
			const size = clamp(upSizes[i] + deltaUp, item.minimumSize, item.maximumSize);
			const viewDelta = size - upSizes[i];

			deltaUp -= viewDelta;
			item.size = size;
		}

		for (let i = 0, deltaDown = delta; i < downItems.length; i++) {
			const item = downItems[i];
			const size = clamp(downSizes[i] - deltaDown, item.minimumSize, item.maximumSize);
			const viewDelta = size - downSizes[i];

			deltaDown += viewDelta;
			item.size = size;
		}

		return delta;
	}

	private distributeEmptySpace(lowPriorityIndex?: number): void {
		const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
		let emptyDelta = this.size - contentSize;

		const indexes = range(this.viewItems.length - 1, -1);
		const lowPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === LayoutPriority.Low);
		const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === LayoutPriority.High);

		for (const index of highPriorityIndexes) {
			pushToStart(indexes, index);
		}

		for (const index of lowPriorityIndexes) {
			pushToEnd(indexes, index);
		}

		if (typeof lowPriorityIndex === 'number') {
			pushToEnd(indexes, lowPriorityIndex);
		}

		for (let i = 0; emptyDelta !== 0 && i < indexes.length; i++) {
			const item = this.viewItems[indexes[i]];
			const size = clamp(item.size + emptyDelta, item.minimumSize, item.maximumSize);
			const viewDelta = size - item.size;

			emptyDelta -= viewDelta;
			item.size = size;
		}
	}

	private layoutViews(): void {
		// Save new content size
		this.contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);

		// Layout views
		let offset = 0;

		for (const viewItem of this.viewItems) {
			viewItem.layout(offset, this.layoutContext);
			offset += viewItem.size;
		}

		// Layout sashes
		this.sashItems.forEach(item => item.sash.layout());
		this.updateSashEnablement();
		this.updateScrollableElement();
	}

	private updateScrollableElement(): void {
		if (this.orientation === Orientation.VERTICAL) {
			this.scrollableElement.setScrollDimensions({
				height: this.size,
				scrollHeight: this.contentSize
			});
		} else {
			this.scrollableElement.setScrollDimensions({
				width: this.size,
				scrollWidth: this.contentSize
			});
		}
	}

	private updateSashEnablement(): void {
		let previous = false;
		const collapsesDown = this.viewItems.map(i => previous = (i.size - i.minimumSize > 0) || previous);

		previous = false;
		const expandsDown = this.viewItems.map(i => previous = (i.maximumSize - i.size > 0) || previous);

		const reverseViews = [...this.viewItems].reverse();
		previous = false;
		const collapsesUp = reverseViews.map(i => previous = (i.size - i.minimumSize > 0) || previous).reverse();

		previous = false;
		const expandsUp = reverseViews.map(i => previous = (i.maximumSize - i.size > 0) || previous).reverse();

		let position = 0;
		for (let index = 0; index < this.sashItems.length; index++) {
			const { sash } = this.sashItems[index];
			const viewItem = this.viewItems[index];
			position += viewItem.size;

			const min = !(collapsesDown[index] && expandsUp[index + 1]);
			const max = !(expandsDown[index] && collapsesUp[index + 1]);

			if (min && max) {
				const upIndexes = range(index, -1);
				const downIndexes = range(index + 1, this.viewItems.length);
				const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
				const snapAfterIndex = this.findFirstSnapIndex(downIndexes);

				const snappedBefore = typeof snapBeforeIndex === 'number' && !this.viewItems[snapBeforeIndex].visible;
				const snappedAfter = typeof snapAfterIndex === 'number' && !this.viewItems[snapAfterIndex].visible;

				if (snappedBefore && collapsesUp[index] && (position > 0 || this.startSnappingEnabled)) {
					sash.state = SashState.AtMinimum;
				} else if (snappedAfter && collapsesDown[index] && (position < this.contentSize || this.endSnappingEnabled)) {
					sash.state = SashState.AtMaximum;
				} else {
					sash.state = SashState.Disabled;
				}
			} else if (min && !max) {
				sash.state = SashState.AtMinimum;
			} else if (!min && max) {
				sash.state = SashState.AtMaximum;
			} else {
				sash.state = SashState.Enabled;
			}
		}
	}

	private getSashPosition(sash: Sash): number {
		let position = 0;

		for (let i = 0; i < this.sashItems.length; i++) {
			position += this.viewItems[i].size;

			if (this.sashItems[i].sash === sash) {
				return position;
			}
		}

		return 0;
	}

	private findFirstSnapIndex(indexes: number[]): number | undefined {
		// visible views first
		for (const index of indexes) {
			const viewItem = this.viewItems[index];

			if (!viewItem.visible) {
				continue;
			}

			if (viewItem.snap) {
				return index;
			}
		}

		// then, hidden views
		for (const index of indexes) {
			const viewItem = this.viewItems[index];

			if (viewItem.visible && viewItem.maximumSize - viewItem.minimumSize > 0) {
				return undefined;
			}

			if (!viewItem.visible && viewItem.snap) {
				return index;
			}
		}

		return undefined;
	}

	private areViewsDistributed() {
		let min = undefined, max = undefined;

		for (const view of this.viewItems) {
			min = min === undefined ? view.size : Math.min(min, view.size);
			max = max === undefined ? view.size : Math.max(max, view.size);

			if (max - min > 2) {
				return false;
			}
		}

		return true;
	}

	override dispose(): void {
		this.sashDragState?.disposable.dispose();

		dispose(this.viewItems);
		this.viewItems = [];

		this.sashItems.forEach(i => i.disposable.dispose());
		this.sashItems = [];

		super.dispose();
	}
}
