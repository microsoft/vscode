/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, addDisposableListener, append, getWindow, scheduleAtNextAnimationFrame } from '../../dom.js';
import { DomEmitter } from '../../event.js';
import { Sash } from '../sash/sash.js';
import { SmoothScrollableElement } from '../scrollbar/scrollableElement.js';
import { pushToEnd, pushToStart, range } from '../../../common/arrays.js';
import { Color } from '../../../common/color.js';
import { Emitter, Event } from '../../../common/event.js';
import { combinedDisposable, Disposable, dispose, toDisposable } from '../../../common/lifecycle.js';
import { clamp } from '../../../common/numbers.js';
import { Scrollable } from '../../../common/scrollable.js';
import * as types from '../../../common/types.js';
import './splitview.css';
export { Orientation } from '../sash/sash.js';
const defaultStyles = {
    separatorBorder: Color.transparent
};
export var LayoutPriority;
(function (LayoutPriority) {
    LayoutPriority[LayoutPriority["Normal"] = 0] = "Normal";
    LayoutPriority[LayoutPriority["Low"] = 1] = "Low";
    LayoutPriority[LayoutPriority["High"] = 2] = "High";
})(LayoutPriority || (LayoutPriority = {}));
class ViewItem {
    set size(size) {
        this._size = size;
    }
    get size() {
        return this._size;
    }
    get cachedVisibleSize() { return this._cachedVisibleSize; }
    get visible() {
        return typeof this._cachedVisibleSize === 'undefined';
    }
    setVisible(visible, size) {
        if (visible === this.visible) {
            return;
        }
        if (visible) {
            this.size = clamp(this._cachedVisibleSize, this.viewMinimumSize, this.viewMaximumSize);
            this._cachedVisibleSize = undefined;
        }
        else {
            this._cachedVisibleSize = typeof size === 'number' ? size : this.size;
            this.size = 0;
        }
        this.container.classList.toggle('visible', visible);
        try {
            this.view.setVisible?.(visible);
        }
        catch (e) {
            console.error('Splitview: Failed to set visible view');
            console.error(e);
        }
    }
    get minimumSize() { return this.visible ? this.view.minimumSize : 0; }
    get viewMinimumSize() { return this.view.minimumSize; }
    get maximumSize() { return this.visible ? this.view.maximumSize : 0; }
    get viewMaximumSize() { return this.view.maximumSize; }
    get priority() { return this.view.priority; }
    get proportionalLayout() { return this.view.proportionalLayout ?? true; }
    get snap() { return !!this.view.snap; }
    set enabled(enabled) {
        this.container.style.pointerEvents = enabled ? '' : 'none';
    }
    constructor(container, view, size, disposable) {
        this.container = container;
        this.view = view;
        this.disposable = disposable;
        this._cachedVisibleSize = undefined;
        if (typeof size === 'number') {
            this._size = size;
            this._cachedVisibleSize = undefined;
            container.classList.add('visible');
        }
        else {
            this._size = 0;
            this._cachedVisibleSize = size.cachedVisibleSize;
        }
    }
    layout(offset, layoutContext) {
        this.layoutContainer(offset);
        try {
            this.view.layout(this.size, offset, layoutContext);
        }
        catch (e) {
            console.error('Splitview: Failed to layout view');
            console.error(e);
        }
    }
    dispose() {
        this.disposable.dispose();
    }
}
class VerticalViewItem extends ViewItem {
    layoutContainer(offset) {
        this.container.style.top = `${offset}px`;
        this.container.style.height = `${this.size}px`;
    }
}
class HorizontalViewItem extends ViewItem {
    layoutContainer(offset) {
        this.container.style.left = `${offset}px`;
        this.container.style.width = `${this.size}px`;
    }
}
var State;
(function (State) {
    State[State["Idle"] = 0] = "Idle";
    State[State["Busy"] = 1] = "Busy";
})(State || (State = {}));
export var Sizing;
(function (Sizing) {
    /**
     * When adding or removing views, distribute the delta space among
     * all other views.
     */
    Sizing.Distribute = { type: 'distribute' };
    /**
     * When adding or removing views, split the delta space with another
     * specific view, indexed by the provided `index`.
     */
    function Split(index) { return { type: 'split', index }; }
    Sizing.Split = Split;
    /**
     * When adding a view, use DistributeSizing when all pre-existing views are
     * distributed evenly, otherwise use SplitSizing.
     */
    function Auto(index) { return { type: 'auto', index }; }
    Sizing.Auto = Auto;
    /**
     * When adding or removing views, assume the view is invisible.
     */
    function Invisible(cachedVisibleSize) { return { type: 'invisible', cachedVisibleSize }; }
    Sizing.Invisible = Invisible;
})(Sizing || (Sizing = {}));
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
export class SplitView extends Disposable {
    /**
     * The sum of all views' sizes.
     */
    get contentSize() { return this._contentSize; }
    /**
     * The amount of views in this {@link SplitView}.
     */
    get length() {
        return this.viewItems.length;
    }
    /**
     * The minimum size of this {@link SplitView}.
     */
    get minimumSize() {
        return this.viewItems.reduce((r, item) => r + item.minimumSize, 0);
    }
    /**
     * The maximum size of this {@link SplitView}.
     */
    get maximumSize() {
        return this.length === 0 ? Number.POSITIVE_INFINITY : this.viewItems.reduce((r, item) => r + item.maximumSize, 0);
    }
    get orthogonalStartSash() { return this._orthogonalStartSash; }
    get orthogonalEndSash() { return this._orthogonalEndSash; }
    get startSnappingEnabled() { return this._startSnappingEnabled; }
    get endSnappingEnabled() { return this._endSnappingEnabled; }
    /**
     * A reference to a sash, perpendicular to all sashes in this {@link SplitView},
     * located at the left- or top-most side of the SplitView.
     * Corner sashes will be created automatically at the intersections.
     */
    set orthogonalStartSash(sash) {
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
    set orthogonalEndSash(sash) {
        for (const sashItem of this.sashItems) {
            sashItem.sash.orthogonalEndSash = sash;
        }
        this._orthogonalEndSash = sash;
    }
    /**
     * The internal sashes within this {@link SplitView}.
     */
    get sashes() {
        return this.sashItems.map(s => s.sash);
    }
    /**
     * Enable/disable snapping at the beginning of this {@link SplitView}.
     */
    set startSnappingEnabled(startSnappingEnabled) {
        if (this._startSnappingEnabled === startSnappingEnabled) {
            return;
        }
        this._startSnappingEnabled = startSnappingEnabled;
        this.updateSashEnablement();
    }
    /**
     * Enable/disable snapping at the end of this {@link SplitView}.
     */
    set endSnappingEnabled(endSnappingEnabled) {
        if (this._endSnappingEnabled === endSnappingEnabled) {
            return;
        }
        this._endSnappingEnabled = endSnappingEnabled;
        this.updateSashEnablement();
    }
    /**
     * Create a new {@link SplitView} instance.
     */
    constructor(container, options = {}) {
        super();
        this.size = 0;
        this._contentSize = 0;
        this.proportions = undefined;
        this.viewItems = [];
        this.sashItems = []; // used in tests
        this.state = State.Idle;
        this._onDidSashChange = this._register(new Emitter());
        this._onDidSashReset = this._register(new Emitter());
        this._startSnappingEnabled = true;
        this._endSnappingEnabled = true;
        /**
         * Fires whenever the user resizes a {@link Sash sash}.
         */
        this.onDidSashChange = this._onDidSashChange.event;
        /**
         * Fires whenever the user double clicks a {@link Sash sash}.
         */
        this.onDidSashReset = this._onDidSashReset.event;
        this.orientation = options.orientation ?? 0 /* Orientation.VERTICAL */;
        this.inverseAltBehavior = options.inverseAltBehavior ?? false;
        this.proportionalLayout = options.proportionalLayout ?? true;
        this.getSashOrthogonalSize = options.getSashOrthogonalSize;
        this.el = document.createElement('div');
        this.el.classList.add('monaco-split-view2');
        this.el.classList.add(this.orientation === 0 /* Orientation.VERTICAL */ ? 'vertical' : 'horizontal');
        container.appendChild(this.el);
        this.sashContainer = append(this.el, $('.sash-container'));
        this.viewContainer = $('.split-view-container');
        this.scrollable = this._register(new Scrollable({
            forceIntegerValues: true,
            smoothScrollDuration: 125,
            scheduleAtNextAnimationFrame: callback => scheduleAtNextAnimationFrame(getWindow(this.el), callback),
        }));
        this.scrollableElement = this._register(new SmoothScrollableElement(this.viewContainer, {
            vertical: this.orientation === 0 /* Orientation.VERTICAL */ ? (options.scrollbarVisibility ?? 1 /* ScrollbarVisibility.Auto */) : 2 /* ScrollbarVisibility.Hidden */,
            horizontal: this.orientation === 1 /* Orientation.HORIZONTAL */ ? (options.scrollbarVisibility ?? 1 /* ScrollbarVisibility.Auto */) : 2 /* ScrollbarVisibility.Hidden */
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
                const sizing = types.isUndefined(viewDescriptor.visible) || viewDescriptor.visible ? viewDescriptor.size : { type: 'invisible', cachedVisibleSize: viewDescriptor.size };
                const view = viewDescriptor.view;
                this.doAddView(view, sizing, index, true);
            });
            // Initialize content size and proportions for first layout
            this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
            this.saveProportions();
        }
    }
    style(styles) {
        if (styles.separatorBorder.isTransparent()) {
            this.el.classList.remove('separator-border');
            this.el.style.removeProperty('--separator-border');
        }
        else {
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
    addView(view, size, index = this.viewItems.length, skipLayout) {
        this.doAddView(view, size, index, skipLayout);
    }
    /**
     * Remove a {@link IView view} from this {@link SplitView}.
     *
     * @param index The index where the {@link IView view} is located.
     * @param sizing Whether to distribute other {@link IView view}'s sizes.
     */
    removeView(index, sizing) {
        if (index < 0 || index >= this.viewItems.length) {
            throw new Error('Index out of bounds');
        }
        if (this.state !== State.Idle) {
            throw new Error('Cant modify splitview');
        }
        this.state = State.Busy;
        try {
            if (sizing?.type === 'auto') {
                if (this.areViewsDistributed()) {
                    sizing = { type: 'distribute' };
                }
                else {
                    sizing = { type: 'split', index: sizing.index };
                }
            }
            // Save referene view, in case of `split` sizing
            const referenceViewItem = sizing?.type === 'split' ? this.viewItems[sizing.index] : undefined;
            // Remove view
            const viewItemToRemove = this.viewItems.splice(index, 1)[0];
            // Resize reference view, in case of `split` sizing
            if (referenceViewItem) {
                referenceViewItem.size += viewItemToRemove.size;
            }
            // Remove sash
            if (this.viewItems.length >= 1) {
                const sashIndex = Math.max(index - 1, 0);
                const sashItem = this.sashItems.splice(sashIndex, 1)[0];
                sashItem.disposable.dispose();
            }
            this.relayout();
            if (sizing?.type === 'distribute') {
                this.distributeViewSizes();
            }
            const result = viewItemToRemove.view;
            viewItemToRemove.dispose();
            return result;
        }
        finally {
            this.state = State.Idle;
        }
    }
    removeAllViews() {
        if (this.state !== State.Idle) {
            throw new Error('Cant modify splitview');
        }
        this.state = State.Busy;
        try {
            const viewItems = this.viewItems.splice(0, this.viewItems.length);
            for (const viewItem of viewItems) {
                viewItem.dispose();
            }
            const sashItems = this.sashItems.splice(0, this.sashItems.length);
            for (const sashItem of sashItems) {
                sashItem.disposable.dispose();
            }
            this.relayout();
            return viewItems.map(i => i.view);
        }
        finally {
            this.state = State.Idle;
        }
    }
    /**
     * Move a {@link IView view} to a different index.
     *
     * @param from The source index.
     * @param to The target index.
     */
    moveView(from, to) {
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
    swapViews(from, to) {
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
    isViewVisible(index) {
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
    setViewVisible(index, visible) {
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
    getViewCachedVisibleSize(index) {
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
    layout(size, layoutContext) {
        const previousSize = Math.max(this.size, this._contentSize);
        this.size = size;
        this.layoutContext = layoutContext;
        if (!this.proportions) {
            const indexes = range(this.viewItems.length);
            const lowPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === 1 /* LayoutPriority.Low */);
            const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === 2 /* LayoutPriority.High */);
            this.resize(this.viewItems.length - 1, size - previousSize, undefined, lowPriorityIndexes, highPriorityIndexes);
        }
        else {
            let total = 0;
            for (let i = 0; i < this.viewItems.length; i++) {
                const item = this.viewItems[i];
                const proportion = this.proportions[i];
                if (typeof proportion === 'number') {
                    total += proportion;
                }
                else {
                    size -= item.size;
                }
            }
            for (let i = 0; i < this.viewItems.length; i++) {
                const item = this.viewItems[i];
                const proportion = this.proportions[i];
                if (typeof proportion === 'number' && total > 0) {
                    item.size = clamp(Math.round(proportion * size / total), item.minimumSize, item.maximumSize);
                }
            }
        }
        this.distributeEmptySpace();
        this.layoutViews();
    }
    saveProportions() {
        if (this.proportionalLayout && this._contentSize > 0) {
            this.proportions = this.viewItems.map(v => v.proportionalLayout && v.visible ? v.size / this._contentSize : undefined);
        }
    }
    onSashStart({ sash, start, alt }) {
        for (const item of this.viewItems) {
            item.enabled = false;
        }
        const index = this.sashItems.findIndex(item => item.sash === sash);
        // This way, we can press Alt while we resize a sash, macOS style!
        const disposable = combinedDisposable(addDisposableListener(this.el.ownerDocument.body, 'keydown', e => resetSashDragState(this.sashDragState.current, e.altKey)), addDisposableListener(this.el.ownerDocument.body, 'keyup', () => resetSashDragState(this.sashDragState.current, false)));
        const resetSashDragState = (start, alt) => {
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
                }
                else {
                    const viewItem = this.viewItems[index + 1];
                    minDelta = (viewItem.size - viewItem.maximumSize) / 2;
                    maxDelta = (viewItem.size - viewItem.minimumSize) / 2;
                }
            }
            let snapBefore;
            let snapAfter;
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
    onSashChange({ current }) {
        const { index, start, sizes, alt, minDelta, maxDelta, snapBefore, snapAfter } = this.sashDragState;
        this.sashDragState.current = current;
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
    onSashEnd(index) {
        this._onDidSashChange.fire(index);
        this.sashDragState.disposable.dispose();
        this.saveProportions();
        for (const item of this.viewItems) {
            item.enabled = true;
        }
    }
    onViewChange(item, size) {
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
        }
        else {
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
    resizeView(index, size) {
        if (index < 0 || index >= this.viewItems.length) {
            return;
        }
        if (this.state !== State.Idle) {
            throw new Error('Cant modify splitview');
        }
        this.state = State.Busy;
        try {
            const indexes = range(this.viewItems.length).filter(i => i !== index);
            const lowPriorityIndexes = [...indexes.filter(i => this.viewItems[i].priority === 1 /* LayoutPriority.Low */), index];
            const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === 2 /* LayoutPriority.High */);
            const item = this.viewItems[index];
            size = Math.round(size);
            size = clamp(size, item.minimumSize, Math.min(item.maximumSize, this.size));
            item.size = size;
            this.relayout(lowPriorityIndexes, highPriorityIndexes);
        }
        finally {
            this.state = State.Idle;
        }
    }
    /**
     * Returns whether all other {@link IView views} are at their minimum size.
     */
    isViewExpanded(index) {
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
    distributeViewSizes() {
        const flexibleViewItems = [];
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
        const lowPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === 1 /* LayoutPriority.Low */);
        const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === 2 /* LayoutPriority.High */);
        this.relayout(lowPriorityIndexes, highPriorityIndexes);
    }
    /**
     * Returns the size of a {@link IView view}.
     */
    getViewSize(index) {
        if (index < 0 || index >= this.viewItems.length) {
            return -1;
        }
        return this.viewItems[index].size;
    }
    doAddView(view, size, index = this.viewItems.length, skipLayout) {
        if (this.state !== State.Idle) {
            throw new Error('Cant modify splitview');
        }
        this.state = State.Busy;
        try {
            // Add view
            const container = $('.split-view-view');
            if (index === this.viewItems.length) {
                this.viewContainer.appendChild(container);
            }
            else {
                this.viewContainer.insertBefore(container, this.viewContainer.children.item(index));
            }
            const onChangeDisposable = view.onDidChange(size => this.onViewChange(item, size));
            const containerDisposable = toDisposable(() => container.remove());
            const disposable = combinedDisposable(onChangeDisposable, containerDisposable);
            let viewSize;
            if (typeof size === 'number') {
                viewSize = size;
            }
            else {
                if (size.type === 'auto') {
                    if (this.areViewsDistributed()) {
                        size = { type: 'distribute' };
                    }
                    else {
                        size = { type: 'split', index: size.index };
                    }
                }
                if (size.type === 'split') {
                    viewSize = this.getViewSize(size.index) / 2;
                }
                else if (size.type === 'invisible') {
                    viewSize = { cachedVisibleSize: size.cachedVisibleSize };
                }
                else {
                    viewSize = view.minimumSize;
                }
            }
            const item = this.orientation === 0 /* Orientation.VERTICAL */
                ? new VerticalViewItem(container, view, viewSize, disposable)
                : new HorizontalViewItem(container, view, viewSize, disposable);
            this.viewItems.splice(index, 0, item);
            // Add sash
            if (this.viewItems.length > 1) {
                const opts = { orthogonalStartSash: this.orthogonalStartSash, orthogonalEndSash: this.orthogonalEndSash };
                const sash = this.orientation === 0 /* Orientation.VERTICAL */
                    ? new Sash(this.sashContainer, { getHorizontalSashTop: s => this.getSashPosition(s), getHorizontalSashWidth: this.getSashOrthogonalSize }, { ...opts, orientation: 1 /* Orientation.HORIZONTAL */ })
                    : new Sash(this.sashContainer, { getVerticalSashLeft: s => this.getSashPosition(s), getVerticalSashHeight: this.getSashOrthogonalSize }, { ...opts, orientation: 0 /* Orientation.VERTICAL */ });
                const sashEventMapper = this.orientation === 0 /* Orientation.VERTICAL */
                    ? (e) => ({ sash, start: e.startY, current: e.currentY, alt: e.altKey })
                    : (e) => ({ sash, start: e.startX, current: e.currentX, alt: e.altKey });
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
                const sashItem = { sash, disposable };
                this.sashItems.splice(index - 1, 0, sashItem);
            }
            container.appendChild(view.element);
            let highPriorityIndexes;
            if (typeof size !== 'number' && size.type === 'split') {
                highPriorityIndexes = [size.index];
            }
            if (!skipLayout) {
                this.relayout([index], highPriorityIndexes);
            }
            if (!skipLayout && typeof size !== 'number' && size.type === 'distribute') {
                this.distributeViewSizes();
            }
        }
        finally {
            this.state = State.Idle;
        }
    }
    relayout(lowPriorityIndexes, highPriorityIndexes) {
        const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
        this.resize(this.viewItems.length - 1, this.size - contentSize, undefined, lowPriorityIndexes, highPriorityIndexes);
        this.distributeEmptySpace();
        this.layoutViews();
        this.saveProportions();
    }
    resize(index, delta, sizes = this.viewItems.map(i => i.size), lowPriorityIndexes, highPriorityIndexes, overloadMinDelta = Number.NEGATIVE_INFINITY, overloadMaxDelta = Number.POSITIVE_INFINITY, snapBefore, snapAfter) {
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
    distributeEmptySpace(lowPriorityIndex) {
        const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
        let emptyDelta = this.size - contentSize;
        const indexes = range(this.viewItems.length - 1, -1);
        const lowPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === 1 /* LayoutPriority.Low */);
        const highPriorityIndexes = indexes.filter(i => this.viewItems[i].priority === 2 /* LayoutPriority.High */);
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
    layoutViews() {
        // Save new content size
        this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
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
    updateScrollableElement() {
        if (this.orientation === 0 /* Orientation.VERTICAL */) {
            this.scrollableElement.setScrollDimensions({
                height: this.size,
                scrollHeight: this._contentSize
            });
        }
        else {
            this.scrollableElement.setScrollDimensions({
                width: this.size,
                scrollWidth: this._contentSize
            });
        }
    }
    updateSashEnablement() {
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
                    sash.state = 1 /* SashState.AtMinimum */;
                }
                else if (snappedAfter && collapsesDown[index] && (position < this._contentSize || this.endSnappingEnabled)) {
                    sash.state = 2 /* SashState.AtMaximum */;
                }
                else {
                    sash.state = 0 /* SashState.Disabled */;
                }
            }
            else if (min && !max) {
                sash.state = 1 /* SashState.AtMinimum */;
            }
            else if (!min && max) {
                sash.state = 2 /* SashState.AtMaximum */;
            }
            else {
                sash.state = 3 /* SashState.Enabled */;
            }
        }
    }
    getSashPosition(sash) {
        let position = 0;
        for (let i = 0; i < this.sashItems.length; i++) {
            position += this.viewItems[i].size;
            if (this.sashItems[i].sash === sash) {
                return position;
            }
        }
        return 0;
    }
    findFirstSnapIndex(indexes) {
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
    areViewsDistributed() {
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
    dispose() {
        this.sashDragState?.disposable.dispose();
        dispose(this.viewItems);
        this.viewItems = [];
        this.sashItems.forEach(i => i.disposable.dispose());
        this.sashItems = [];
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BsaXR2aWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUM1QyxPQUFPLEVBQTZDLElBQUksRUFBYSxNQUFNLGlCQUFpQixDQUFDO0FBQzdGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2xILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsVUFBVSxFQUFvQyxNQUFNLCtCQUErQixDQUFDO0FBQzdGLE9BQU8sS0FBSyxLQUFLLE1BQU0sMEJBQTBCLENBQUM7QUFDbEQsT0FBTyxpQkFBaUIsQ0FBQztBQUN6QixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFNOUMsTUFBTSxhQUFhLEdBQXFCO0lBQ3ZDLGVBQWUsRUFBRSxLQUFLLENBQUMsV0FBVztDQUNsQyxDQUFDO0FBRUYsTUFBTSxD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Q0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3QyxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVqRCxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakcsTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzSixNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsTUFBTSxLQUFLLENB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