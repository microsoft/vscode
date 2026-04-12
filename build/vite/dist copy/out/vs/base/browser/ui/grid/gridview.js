/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $ } from '../../dom.js';
import { Sizing, SplitView } from '../splitview/splitview.js';
import { equals as arrayEquals, tail } from '../../../common/arrays.js';
import { Color } from '../../../common/color.js';
import { Emitter, Event, Relay } from '../../../common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../common/lifecycle.js';
import { rot } from '../../../common/numbers.js';
import { isUndefined } from '../../../common/types.js';
import './gridview.css';
export { Orientation } from '../sash/sash.js';
export { LayoutPriority, Sizing } from '../splitview/splitview.js';
const defaultStyles = {
    separatorBorder: Color.transparent
};
export function orthogonal(orientation) {
    return orientation === 0 /* Orientation.VERTICAL */ ? 1 /* Orientation.HORIZONTAL */ : 0 /* Orientation.VERTICAL */;
}
export function isGridBranchNode(node) {
    // eslint-disable-next-line local/code-no-any-casts
    return !!node.children;
}
class LayoutController {
    constructor(isLayoutEnabled) {
        this.isLayoutEnabled = isLayoutEnabled;
    }
}
function toAbsoluteBoundarySashes(sashes, orientation) {
    if (orientation === 1 /* Orientation.HORIZONTAL */) {
        return { left: sashes.start, right: sashes.end, top: sashes.orthogonalStart, bottom: sashes.orthogonalEnd };
    }
    else {
        return { top: sashes.start, bottom: sashes.end, left: sashes.orthogonalStart, right: sashes.orthogonalEnd };
    }
}
function fromAbsoluteBoundarySashes(sashes, orientation) {
    if (orientation === 1 /* Orientation.HORIZONTAL */) {
        return { start: sashes.left, end: sashes.right, orthogonalStart: sashes.top, orthogonalEnd: sashes.bottom };
    }
    else {
        return { start: sashes.top, end: sashes.bottom, orthogonalStart: sashes.left, orthogonalEnd: sashes.right };
    }
}
function validateIndex(index, numChildren) {
    if (Math.abs(index) > numChildren) {
        throw new Error('Invalid index');
    }
    return rot(index, numChildren + 1);
}
class BranchNode {
    get size() { return this._size; }
    get orthogonalSize() { return this._orthogonalSize; }
    get absoluteOffset() { return this._absoluteOffset; }
    get absoluteOrthogonalOffset() { return this._absoluteOrthogonalOffset; }
    get styles() { return this._styles; }
    get width() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.size : this.orthogonalSize;
    }
    get height() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.orthogonalSize : this.size;
    }
    get top() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this._absoluteOffset : this._absoluteOrthogonalOffset;
    }
    get left() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this._absoluteOrthogonalOffset : this._absoluteOffset;
    }
    get minimumSize() {
        return this.children.length === 0 ? 0 : Math.max(...this.children.map((c, index) => this.splitview.isViewVisible(index) ? c.minimumOrthogonalSize : 0));
    }
    get maximumSize() {
        return Math.min(...this.children.map((c, index) => this.splitview.isViewVisible(index) ? c.maximumOrthogonalSize : Number.POSITIVE_INFINITY));
    }
    get priority() {
        if (this.children.length === 0) {
            return 0 /* LayoutPriority.Normal */;
        }
        const priorities = this.children.map(c => typeof c.priority === 'undefined' ? 0 /* LayoutPriority.Normal */ : c.priority);
        if (priorities.some(p => p === 2 /* LayoutPriority.High */)) {
            return 2 /* LayoutPriority.High */;
        }
        else if (priorities.some(p => p === 1 /* LayoutPriority.Low */)) {
            return 1 /* LayoutPriority.Low */;
        }
        return 0 /* LayoutPriority.Normal */;
    }
    get proportionalLayout() {
        if (this.children.length === 0) {
            return true;
        }
        return this.children.every(c => c.proportionalLayout);
    }
    get minimumOrthogonalSize() {
        return this.splitview.minimumSize;
    }
    get maximumOrthogonalSize() {
        return this.splitview.maximumSize;
    }
    get minimumWidth() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.minimumOrthogonalSize : this.minimumSize;
    }
    get minimumHeight() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.minimumSize : this.minimumOrthogonalSize;
    }
    get maximumWidth() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.maximumOrthogonalSize : this.maximumSize;
    }
    get maximumHeight() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.maximumSize : this.maximumOrthogonalSize;
    }
    get boundarySashes() { return this._boundarySashes; }
    set boundarySashes(boundarySashes) {
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
    get edgeSnapping() { return this._edgeSnapping; }
    set edgeSnapping(edgeSnapping) {
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
    constructor(orientation, layoutController, styles, splitviewProportionalLayout, size = 0, orthogonalSize = 0, edgeSnapping = false, childDescriptors) {
        this.orientation = orientation;
        this.layoutController = layoutController;
        this.splitviewProportionalLayout = splitviewProportionalLayout;
        this.children = [];
        this._absoluteOffset = 0;
        this._absoluteOrthogonalOffset = 0;
        this.absoluteOrthogonalSize = 0;
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this._onDidVisibilityChange = new Emitter();
        this.onDidVisibilityChange = this._onDidVisibilityChange.event;
        this.childrenVisibilityChangeDisposable = new DisposableStore();
        this._onDidScroll = new Emitter();
        this.onDidScrollDisposable = Disposable.None;
        this.onDidScroll = this._onDidScroll.event;
        this.childrenChangeDisposable = Disposable.None;
        this._onDidSashReset = new Emitter();
        this.onDidSashReset = this._onDidSashReset.event;
        this.splitviewSashResetDisposable = Disposable.None;
        this.childrenSashResetDisposable = Disposable.None;
        this._boundarySashes = {};
        this._edgeSnapping = false;
        this._styles = styles;
        this._size = size;
        this._orthogonalSize = orthogonalSize;
        this.element = $('.monaco-grid-branch-node');
        if (!childDescriptors) {
            // Normal behavior, we have no children yet, just set up the splitview
            this.splitview = new SplitView(this.element, { orientation, styles, proportionalLayout: splitviewProportionalLayout });
            this.splitview.layout(size, { orthogonalSize, absoluteOffset: 0, absoluteOrthogonalOffset: 0, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
        }
        else {
            // Reconstruction behavior, we want to reconstruct a splitview
            const descriptor = {
                views: childDescriptors.map(childDescriptor => {
                    return {
                        view: childDescriptor.node,
                        size: childDescriptor.node.size,
                        visible: childDescriptor.visible !== false
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
    style(styles) {
        this._styles = styles;
        this.splitview.style(styles);
        for (const child of this.children) {
            if (child instanceof BranchNode) {
                child.style(styles);
            }
        }
    }
    layout(size, offset, ctx) {
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
    setVisible(visible) {
        for (const child of this.children) {
            child.setVisible(visible);
        }
    }
    addChild(node, size, index, skipLayout) {
        index = validateIndex(index, this.children.length);
        this.splitview.addView(node, size, index, skipLayout);
        this.children.splice(index, 0, node);
        this.updateBoundarySashes();
        this.onDidChildrenChange();
    }
    removeChild(index, sizing) {
        index = validateIndex(index, this.children.length);
        const result = this.splitview.removeView(index, sizing);
        this.children.splice(index, 1);
        this.updateBoundarySashes();
        this.onDidChildrenChange();
        return result;
    }
    removeAllChildren() {
        const result = this.splitview.removeAllViews();
        this.children.splice(0, this.children.length);
        this.updateBoundarySashes();
        this.onDidChildrenChange();
        return result;
    }
    moveChild(from, to) {
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
    swapChildren(from, to) {
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
    resizeChild(index, size) {
        index = validateIndex(index, this.children.length);
        this.splitview.resizeView(index, size);
    }
    isChildExpanded(index) {
        return this.splitview.isViewExpanded(index);
    }
    distributeViewSizes(recursive = false) {
        this.splitview.distributeViewSizes();
        if (recursive) {
            for (const child of this.children) {
                if (child instanceof BranchNode) {
                    child.distributeViewSizes(true);
                }
            }
        }
    }
    getChildSize(index) {
        index = validateIndex(index, this.children.length);
        return this.splitview.getViewSize(index);
    }
    isChildVisible(index) {
        index = validateIndex(index, this.children.length);
        return this.splitview.isViewVisible(index);
    }
    setChildVisible(index, visible) {
        index = validateIndex(index, this.children.length);
        if (this.splitview.isViewVisible(index) === visible) {
            return;
        }
        const wereAllChildrenHidden = this.splitview.contentSize === 0;
        this.splitview.setViewVisible(index, visible);
        const areAllChildrenHidden = this.splitview.contentSize === 0;
        // If all children are hidden then the parent should hide the entire splitview
        // If the entire splitview is hidden then the parent should show the splitview when a child is shown
        if ((visible && wereAllChildrenHidden) || (!visible && areAllChildrenHidden)) {
            this._onDidVisibilityChange.fire(visible);
        }
    }
    getChildCachedVisibleSize(index) {
        index = validateIndex(index, this.children.length);
        return this.splitview.getViewCachedVisibleSize(index);
    }
    updateBoundarySashes() {
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].boundarySashes = {
                start: this.boundarySashes.orthogonalStart,
                end: this.boundarySashes.orthogonalEnd,
                orthogonalStart: i === 0 ? this.boundarySashes.start : this.splitview.sashes[i - 1],
                orthogonalEnd: i === this.children.length - 1 ? this.boundarySashes.end : this.splitview.sashes[i],
            };
        }
    }
    onDidChildrenChange() {
        this.updateChildrenEvents();
        this._onDidChange.fire(undefined);
    }
    updateChildrenEvents() {
        const onDidChildrenChange = Event.map(Event.any(...this.children.map(c => c.onDidChange)), () => undefined);
        this.childrenChangeDisposable.dispose();
        this.childrenChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);
        const onDidChildrenSashReset = Event.any(...this.children.map((c, i) => Event.map(c.onDidSashReset, location => [i, ...location])));
        this.childrenSashResetDisposable.dispose();
        this.childrenSashResetDisposable = onDidChildrenSashReset(this._onDidSashReset.fire, this._onDidSashReset);
        const onDidScroll = Event.any(Event.signal(this.splitview.onDidScroll), ...this.children.map(c => c.onDidScroll));
        this.onDidScrollDisposable.dispose();
        this.onDidScrollDisposable = onDidScroll(this._onDidScroll.fire, this._onDidScroll);
        this.childrenVisibilityChangeDisposable.clear();
        this.children.forEach((child, index) => {
            if (child instanceof BranchNode) {
                this.childrenVisibilityChangeDisposable.add(child.onDidVisibilityChange((visible) => {
                    this.setChildVisible(index, visible);
                }));
            }
        });
    }
    trySet2x2(other) {
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
        if (this.orientation === 0 /* Orientation.VERTICAL */) {
            secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = firstChild;
            firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = secondChild;
            otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = otherFirstChild;
            otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = otherSecondChild;
        }
        else {
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
    updateSplitviewEdgeSnappingEnablement() {
        this.splitview.startSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset > 0;
        this.splitview.endSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset + this._size < this.absoluteOrthogonalSize;
    }
    dispose() {
        for (const child of this.children) {
            child.dispose();
        }
        this._onDidChange.dispose();
        this._onDidScroll.dispose();
        this._onDidSashReset.dispose();
        this._onDidVisibilityChange.dispose();
        this.childrenVisibilityChangeDisposable.dispose();
        this.splitviewSashResetDisposable.dispose();
        this.childrenSashResetDisposable.dispose();
        this.childrenChangeDisposable.dispose();
        this.onDidScrollDisposable.dispose();
        this.splitview.dispose();
    }
}
/**
 * Creates a latched event that avoids being fired when the view
 * constraints do not change at all.
 */
function createLatchedOnDidChangeViewEvent(view) {
    const [onDidChangeViewConstraints, onDidSetViewSize] = Event.split(view.onDidChange, isUndefined);
    return Event.any(onDidSetViewSize, Event.map(Event.latch(Event.map(onDidChangeViewConstraints, _ => ([view.minimumWidth, view.maximumWidth, view.minimumHeight, view.maximumHeight])), arrayEquals), _ => undefined));
}
class LeafNode {
    get size() { return this._size; }
    get orthogonalSize() { return this._orthogonalSize; }
    get linkedWidthNode() { return this._linkedWidthNode; }
    set linkedWidthNode(node) {
        this._onDidLinkedWidthNodeChange.input = node ? node._onDidViewChange : Event.None;
        this._linkedWidthNode = node;
        this._onDidSetLinkedNode.fire(undefined);
    }
    get linkedHeightNode() { return this._linkedHeightNode; }
    set linkedHeightNode(node) {
        this._onDidLinkedHeightNodeChange.input = node ? node._onDidViewChange : Event.None;
        this._linkedHeightNode = node;
        this._onDidSetLinkedNode.fire(undefined);
    }
    constructor(view, orientation, layoutController, orthogonalSize, size = 0) {
        this.view = view;
        this.orientation = orientation;
        this.layoutController = layoutController;
        this._size = 0;
        this.absoluteOffset = 0;
        this.absoluteOrthogonalOffset = 0;
        this.onDidScroll = Event.None;
        this.onDidSashReset = Event.None;
        this._onDidLinkedWidthNodeChange = new Relay();
        this._linkedWidthNode = undefined;
        this._onDidLinkedHeightNodeChange = new Relay();
        this._linkedHeightNode = undefined;
        this._onDidSetLinkedNode = new Emitter();
        this.disposables = new DisposableStore();
        this._boundarySashes = {};
        this.cachedWidth = 0;
        this.cachedHeight = 0;
        this.cachedTop = 0;
        this.cachedLeft = 0;
        this._orthogonalSize = orthogonalSize;
        this._size = size;
        const onDidChange = createLatchedOnDidChangeViewEvent(view);
        this._onDidViewChange = Event.map(onDidChange, e => e && (this.orientation === 0 /* Orientation.VERTICAL */ ? e.width : e.height), this.disposables);
        this.onDidChange = Event.any(this._onDidViewChange, this._onDidSetLinkedNode.event, this._onDidLinkedWidthNodeChange.event, this._onDidLinkedHeightNodeChange.event);
    }
    get width() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.orthogonalSize : this.size;
    }
    get height() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.size : this.orthogonalSize;
    }
    get top() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.absoluteOffset : this.absoluteOrthogonalOffset;
    }
    get left() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.absoluteOrthogonalOffset : this.absoluteOffset;
    }
    get element() {
        return this.view.element;
    }
    get minimumWidth() {
        return this.linkedWidthNode ? Math.max(this.linkedWidthNode.view.minimumWidth, this.view.minimumWidth) : this.view.minimumWidth;
    }
    get maximumWidth() {
        return this.linkedWidthNode ? Math.min(this.linkedWidthNode.view.maximumWidth, this.view.maximumWidth) : this.view.maximumWidth;
    }
    get minimumHeight() {
        return this.linkedHeightNode ? Math.max(this.linkedHeightNode.view.minimumHeight, this.view.minimumHeight) : this.view.minimumHeight;
    }
    get maximumHeight() {
        return this.linkedHeightNode ? Math.min(this.linkedHeightNode.view.maximumHeight, this.view.maximumHeight) : this.view.maximumHeight;
    }
    get minimumSize() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.minimumHeight : this.minimumWidth;
    }
    get maximumSize() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.maximumHeight : this.maximumWidth;
    }
    get priority() {
        return this.view.priority;
    }
    get proportionalLayout() {
        return this.view.proportionalLayout ?? true;
    }
    get snap() {
        return this.view.snap;
    }
    get minimumOrthogonalSize() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.minimumWidth : this.minimumHeight;
    }
    get maximumOrthogonalSize() {
        return this.orientation === 1 /* Orientation.HORIZONTAL */ ? this.maximumWidth : this.maximumHeight;
    }
    get boundarySashes() { return this._boundarySashes; }
    set boundarySashes(boundarySashes) {
        this._boundarySashes = boundarySashes;
        this.view.setBoundarySashes?.(toAbsoluteBoundarySashes(boundarySashes, this.orientation));
    }
    layout(size, offset, ctx) {
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
    _layout(width, height, top, left) {
        if (this.cachedWidth === width && this.cachedHeight === height && this.cachedTop === top && this.cachedLeft === left) {
            return;
        }
        this.cachedWidth = width;
        this.cachedHeight = height;
        this.cachedTop = top;
        this.cachedLeft = left;
        this.view.layout(width, height, top, left);
    }
    setVisible(visible) {
        this.view.setVisible?.(visible);
    }
    dispose() {
        this._onDidSetLinkedNode.dispose();
        this.disposables.dispose();
    }
}
function flipNode(node, size, orthogonalSize) {
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
        node.dispose();
        return result;
    }
    else {
        const result = new LeafNode(node.view, orthogonal(node.orientation), node.layoutController, orthogonalSize);
        node.dispose();
        return result;
    }
}
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
export class GridView {
    get root() { return this._root; }
    set root(root) {
        const oldRoot = this._root;
        if (oldRoot) {
            oldRoot.element.remove();
            oldRoot.dispose();
        }
        this._root = root;
        this.element.appendChild(root.element);
        this.onDidSashResetRelay.input = root.onDidSashReset;
        this._onDidChange.input = Event.map(root.onDidChange, () => undefined); // TODO
        this._onDidScroll.input = root.onDidScroll;
    }
    /**
     * The width of the grid.
     */
    get width() { return this.root.width; }
    /**
     * The height of the grid.
     */
    get height() { return this.root.height; }
    /**
     * The minimum width of the grid.
     */
    get minimumWidth() { return this.root.minimumWidth; }
    /**
     * The minimum height of the grid.
     */
    get minimumHeight() { return this.root.minimumHeight; }
    /**
     * The maximum width of the grid.
     */
    get maximumWidth() { return this.root.maximumHeight; }
    /**
     * The maximum height of the grid.
     */
    get maximumHeight() { return this.root.maximumHeight; }
    get orientation() { return this._root.orientation; }
    get boundarySashes() { return this._boundarySashes; }
    /**
     * The orientation of the grid. Matches the orientation of the root
     * {@link SplitView} in the grid's tree model.
     */
    set orientation(orientation) {
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
    set boundarySashes(boundarySashes) {
        this._boundarySashes = boundarySashes;
        this.root.boundarySashes = fromAbsoluteBoundarySashes(boundarySashes, this.orientation);
    }
    /**
     * Enable/disable edge snapping across all grid views.
     */
    set edgeSnapping(edgeSnapping) {
        this.root.edgeSnapping = edgeSnapping;
    }
    /**
     * Create a new {@link GridView} instance.
     *
     * @remarks It's the caller's responsibility to append the
     * {@link GridView.element} to the page's DOM.
     */
    constructor(options = {}) {
        this.onDidSashResetRelay = new Relay();
        this._onDidScroll = new Relay();
        this._onDidChange = new Relay();
        this._boundarySashes = {};
        this.disposable2x2 = Disposable.None;
        /**
         * Fires whenever the user double clicks a {@link Sash sash}.
         */
        this.onDidSashReset = this.onDidSashResetRelay.event;
        /**
         * Fires whenever the user scrolls a {@link SplitView} within
         * the grid.
         */
        this.onDidScroll = this._onDidScroll.event;
        /**
         * Fires whenever a view within the grid changes its size constraints.
         */
        this.onDidChange = this._onDidChange.event;
        this.maximizedNode = undefined;
        this._onDidChangeViewMaximized = new Emitter();
        this.onDidChangeViewMaximized = this._onDidChangeViewMaximized.event;
        this.element = $('.monaco-grid-view');
        this.styles = options.styles || defaultStyles;
        this.proportionalLayout = typeof options.proportionalLayout !== 'undefined' ? !!options.proportionalLayout : true;
        this.layoutController = new LayoutController(false);
        this.root = new BranchNode(0 /* Orientation.VERTICAL */, this.layoutController, this.styles, this.proportionalLayout);
    }
    style(styles) {
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
    layout(width, height, top = 0, left = 0) {
        this.layoutController.isLayoutEnabled = true;
        const [size, orthogonalSize, offset, orthogonalOffset] = this.root.orientation === 1 /* Orientation.HORIZONTAL */ ? [height, width, top, left] : [width, height, left, top];
        this.root.layout(size, 0, { orthogonalSize, absoluteOffset: offset, absoluteOrthogonalOffset: orthogonalOffset, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
    }
    /**
     * Add a {@link IView view} to this {@link GridView}.
     *
     * @param view The view to add.
     * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
     * @param location The {@link GridLocation location} to insert the view on.
     */
    addView(view, size, location) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
        this.disposable2x2.dispose();
        this.disposable2x2 = Disposable.None;
        const [rest, index] = tail(location);
        const [pathToParent, parent] = this.getNode(rest);
        if (parent instanceof BranchNode) {
            const node = new LeafNode(view, orthogonal(parent.orientation), this.layoutController, parent.orthogonalSize);
            try {
                parent.addChild(node, size, index);
            }
            catch (err) {
                node.dispose();
                throw err;
            }
        }
        else {
            const [, grandParent] = tail(pathToParent);
            const [, parentIndex] = tail(rest);
            let newSiblingSize = 0;
            const newSiblingCachedVisibleSize = grandParent.getChildCachedVisibleSize(parentIndex);
            if (typeof newSiblingCachedVisibleSize === 'number') {
                newSiblingSize = Sizing.Invisible(newSiblingCachedVisibleSize);
            }
            const oldChild = grandParent.removeChild(parentIndex);
            oldChild.dispose();
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
    removeView(location, sizing) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
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
        node.dispose();
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
            parent.dispose();
            this.root = sibling;
            this.boundarySashes = this.boundarySashes;
            this.trySet2x2();
            return node.view;
        }
        const [, grandParent] = tail(pathToParent);
        const [, parentIndex] = tail(rest);
        const isSiblingVisible = parent.isChildVisible(0);
        const sibling = parent.removeChild(0);
        const sizes = grandParent.children.map((_, i) => grandParent.getChildSize(i));
        grandParent.removeChild(parentIndex, sizing);
        parent.dispose();
        if (sibling instanceof BranchNode) {
            sizes.splice(parentIndex, 1, ...sibling.children.map(c => c.size));
            const siblingChildren = sibling.removeAllChildren();
            for (let i = 0; i < siblingChildren.length; i++) {
                grandParent.addChild(siblingChildren[i], siblingChildren[i].size, parentIndex + i);
            }
        }
        else {
            const newSibling = new LeafNode(sibling.view, orthogonal(sibling.orientation), this.layoutController, sibling.size);
            const sizing = isSiblingVisible ? sibling.orthogonalSize : Sizing.Invisible(sibling.orthogonalSize);
            grandParent.addChild(newSibling, sizing, parentIndex);
        }
        sibling.dispose();
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
    moveView(parentLocation, from, to) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
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
    swapViews(from, to) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
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
        }
        else {
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
    resizeView(location, size) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
        const [rest, index] = tail(location);
        const [pathToParent, parent] = this.getNode(rest);
        if (!(parent instanceof BranchNode)) {
            throw new Error('Invalid location');
        }
        if (!size.width && !size.height) {
            return;
        }
        const [parentSize, grandParentSize] = parent.orientation === 1 /* Orientation.HORIZONTAL */ ? [size.width, size.height] : [size.height, size.width];
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
    getViewSize(location) {
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
    getViewCachedVisibleSize(location) {
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
    expandView(location) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
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
    isViewExpanded(location) {
        if (this.hasMaximizedView()) {
            // No view can be expanded when a view is maximized
            return false;
        }
        const [ancestors, node] = this.getNode(location);
        if (!(node instanceof LeafNode)) {
            throw new Error('Invalid location');
        }
        for (let i = 0; i < ancestors.length; i++) {
            if (!ancestors[i].isChildExpanded(location[i])) {
                return false;
            }
        }
        return true;
    }
    maximizeView(location, excludeViews = []) {
        const [, nodeToMaximize] = this.getNode(location);
        if (!(nodeToMaximize instanceof LeafNode)) {
            throw new Error('Location is not a LeafNode');
        }
        if (this.maximizedNode === nodeToMaximize) {
            return;
        }
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
        const excludeViewSet = new Set(excludeViews);
        function hideAllViewsBut(parent, exclude) {
            for (let i = 0; i < parent.children.length; i++) {
                const child = parent.children[i];
                if (child instanceof LeafNode) {
                    if (child !== exclude && !excludeViewSet.has(child.view)) {
                        parent.setChildVisible(i, false);
                    }
                }
                else {
                    hideAllViewsBut(child, exclude);
                }
            }
        }
        hideAllViewsBut(this.root, nodeToMaximize);
        this.maximizedNode = nodeToMaximize;
        this._onDidChangeViewMaximized.fire(true);
    }
    exitMaximizedView() {
        if (!this.maximizedNode) {
            return;
        }
        this.maximizedNode = undefined;
        // When hiding a view, it's previous size is cached.
        // To restore the sizes of all views, they need to be made visible in reverse order.
        function showViewsInReverseOrder(parent) {
            for (let index = parent.children.length - 1; index >= 0; index--) {
                const child = parent.children[index];
                if (child instanceof LeafNode) {
                    parent.setChildVisible(index, true);
                }
                else {
                    showViewsInReverseOrder(child);
                }
            }
        }
        showViewsInReverseOrder(this.root);
        this._onDidChangeViewMaximized.fire(false);
    }
    hasMaximizedView() {
        return this.maximizedNode !== undefined;
    }
    /**
     * Returns whether the {@link IView view} is maximized.
     *
     * @param location The {@link GridLocation location} of the view.
     */
    isViewMaximized(location) {
        const [, node] = this.getNode(location);
        if (!(node instanceof LeafNode)) {
            throw new Error('Location is not a LeafNode');
        }
        return node === this.maximizedNode;
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
    distributeViewSizes(location) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }
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
    isViewVisible(location) {
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
    setViewVisible(location, visible) {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
            return;
        }
        const [rest, index] = tail(location);
        const [, parent] = this.getNode(rest);
        if (!(parent instanceof BranchNode)) {
            throw new Error('Invalid from location');
        }
        parent.setChildVisible(index, visible);
    }
    getView(location) {
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
    static deserialize(json, deserializer, options = {}) {
        if (typeof json.orientation !== 'number') {
            throw new Error('Invalid JSON: \'orientation\' property must be a number.');
        }
        else if (typeof json.width !== 'number') {
            throw new Error('Invalid JSON: \'width\' property must be a number.');
        }
        else if (typeof json.height !== 'number') {
            throw new Error('Invalid JSON: \'height\' property must be a number.');
        }
        else if (json.root?.type !== 'branch') {
            throw new Error('Invalid JSON: \'root\' property must have \'type\' value of branch.');
        }
        const orientation = json.orientation;
        const height = json.height;
        const result = new GridView(options);
        result._deserialize(json.root, orientation, deserializer, height);
        return result;
    }
    _deserialize(root, orientation, deserializer, orthogonalSize) {
        this.root = this._deserializeNode(root, orientation, deserializer, orthogonalSize);
    }
    _deserializeNode(node, orientation, deserializer, orthogonalSize) {
        let result;
        if (node.type === 'branch') {
            const serializedChildren = node.data;
            const children = serializedChildren.map(serializedChild => {
                return {
                    node: this._deserializeNode(serializedChild, orthogonal(orientation), deserializer, node.size),
                    visible: serializedChild.visible
                };
            });
            result = new BranchNode(orientation, this.layoutController, this.styles, this.proportionalLayout, node.size, orthogonalSize, undefined, children);
        }
        else {
            result = new LeafNode(deserializer.fromJSON(node.data), orientation, this.layoutController, orthogonalSize, node.size);
            if (node.maximized && !this.maximizedNode) {
                this.maximizedNode = result;
                this._onDidChangeViewMaximized.fire(true);
            }
        }
        return result;
    }
    _getViews(node, orientation, cachedVisibleSize) {
        const box = { top: node.top, left: node.left, width: node.width, height: node.height };
        if (node instanceof LeafNode) {
            return { view: node.view, box, cachedVisibleSize, maximized: this.maximizedNode === node };
        }
        const children = [];
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const cachedVisibleSize = node.getChildCachedVisibleSize(i);
            children.push(this._getViews(child, orthogonal(orientation), cachedVisibleSize));
        }
        return { children, box };
    }
    getNode(location, node = this.root, path = []) {
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
    trySet2x2() {
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
    getViewMap(map, node) {
        if (!node) {
            node = this.root;
        }
        if (node instanceof BranchNode) {
            node.children.forEach(child => this.getViewMap(map, child));
        }
        else {
            map.set(node.view, node.element);
        }
    }
    dispose() {
        this._onDidChangeViewMaximized.dispose();
        this.onDidSashResetRelay.dispose();
        this.root.dispose();
        this.element.remove();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JpZHZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkdmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRWpDLE9BQU8sRUFBMkUsTUFBTSxFQUFjLFNBQVMsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ25KLE9BQU8sRUFBRSxNQUFNLElBQUksV0FBVyxFQUFFLElBQUksRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDakQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3ZELE9BQU8sZ0JBQWdCLENBQUM7QUFFeEIsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFJbkUsTUFBTSxhQUFhLEdBQW9CO0lBQ3RDLGVBQWUsRUFBRSxLQUFLLENBQUMsV0FBVztDQUNsQyxDQUFDO0FBa0pGLE1BQU0sVUFBVSxVQUFVLENBQUMsV0FBd0I7SUFDbEQsT0FBTyxXQUFXLGlDQUF5QixDQUFDLENBQUMsZ0NBQXdCLENBQUMsNkJBQXFCLENBQUM7QUFDN0YsQ0FBQztBQXVCRCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMs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