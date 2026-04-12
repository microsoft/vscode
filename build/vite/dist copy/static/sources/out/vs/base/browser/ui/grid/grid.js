/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals, tail } from '../../../common/arrays.js';
import { Disposable } from '../../../common/lifecycle.js';
import './gridview.css';
import { GridView, orthogonal, Sizing as GridViewSizing } from './gridview.js';
export { LayoutPriority, Orientation, orthogonal } from './gridview.js';
export var Direction;
(function (Direction) {
    Direction[Direction["Up"] = 0] = "Up";
    Direction[Direction["Down"] = 1] = "Down";
    Direction[Direction["Left"] = 2] = "Left";
    Direction[Direction["Right"] = 3] = "Right";
})(Direction || (Direction = {}));
function oppositeDirection(direction) {
    switch (direction) {
        case 0 /* Direction.Up */: return 1 /* Direction.Down */;
        case 1 /* Direction.Down */: return 0 /* Direction.Up */;
        case 2 /* Direction.Left */: return 3 /* Direction.Right */;
        case 3 /* Direction.Right */: return 2 /* Direction.Left */;
    }
}
export function isGridBranchNode(node) {
    // eslint-disable-next-line local/code-no-any-casts
    return !!node.children;
}
function getGridNode(node, location) {
    if (location.length === 0) {
        return node;
    }
    if (!isGridBranchNode(node)) {
        throw new Error('Invalid location');
    }
    const [index, ...rest] = location;
    return getGridNode(node.children[index], rest);
}
function intersects(one, other) {
    return !(one.start >= other.end || other.start >= one.end);
}
function getBoxBoundary(box, direction) {
    const orientation = getDirectionOrientation(direction);
    const offset = direction === 0 /* Direction.Up */ ? box.top :
        direction === 3 /* Direction.Right */ ? box.left + box.width :
            direction === 1 /* Direction.Down */ ? box.top + box.height :
                box.left;
    const range = {
        start: orientation === 1 /* Orientation.HORIZONTAL */ ? box.top : box.left,
        end: orientation === 1 /* Orientation.HORIZONTAL */ ? box.top + box.height : box.left + box.width
    };
    return { offset, range };
}
function findAdjacentBoxLeafNodes(boxNode, direction, boundary) {
    const result = [];
    function _(boxNode, direction, boundary) {
        if (isGridBranchNode(boxNode)) {
            for (const child of boxNode.children) {
                _(child, direction, boundary);
            }
        }
        else {
            const { offset, range } = getBoxBoundary(boxNode.box, direction);
            if (offset === boundary.offset && intersects(range, boundary.range)) {
                result.push(boxNode);
            }
        }
    }
    _(boxNode, direction, boundary);
    return result;
}
function getLocationOrientation(rootOrientation, location) {
    return location.length % 2 === 0 ? orthogonal(rootOrientation) : rootOrientation;
}
function getDirectionOrientation(direction) {
    return direction === 0 /* Direction.Up */ || direction === 1 /* Direction.Down */ ? 0 /* Orientation.VERTICAL */ : 1 /* Orientation.HORIZONTAL */;
}
export function getRelativeLocation(rootOrientation, location, direction) {
    const orientation = getLocationOrientation(rootOrientation, location);
    const directionOrientation = getDirectionOrientation(direction);
    if (orientation === directionOrientation) {
        let [rest, index] = tail(location);
        if (direction === 3 /* Direction.Right */ || direction === 1 /* Direction.Down */) {
            index += 1;
        }
        return [...rest, index];
    }
    else {
        const index = (direction === 3 /* Direction.Right */ || direction === 1 /* Direction.Down */) ? 1 : 0;
        return [...location, index];
    }
}
function indexInParent(element) {
    const parentElement = element.parentElement;
    if (!parentElement) {
        throw new Error('Invalid grid element');
    }
    let el = parentElement.firstElementChild;
    let index = 0;
    while (el !== element && el !== parentElement.lastElementChild && el) {
        el = el.nextElementSibling;
        index++;
    }
    return index;
}
/**
 * Find the grid location of a specific DOM element by traversing the parent
 * chain and finding each child index on the way.
 *
 * This will break as soon as DOM structures of the Splitview or Gridview change.
 */
function getGridLocation(element) {
    const parentElement = element.parentElement;
    if (!parentElement) {
        throw new Error('Invalid grid element');
    }
    if (/\bmonaco-grid-view\b/.test(parentElement.className)) {
        return [];
    }
    const index = indexInParent(parentElement);
    const ancestor = parentElement.parentElement.parentElement.parentElement.parentElement;
    return [...getGridLocation(ancestor), index];
}
export var Sizing;
(function (Sizing) {
    Sizing.Distribute = { type: 'distribute' };
    Sizing.Split = { type: 'split' };
    Sizing.Auto = { type: 'auto' };
    function Invisible(cachedVisibleSize) { return { type: 'invisible', cachedVisibleSize }; }
    Sizing.Invisible = Invisible;
})(Sizing || (Sizing = {}));
/**
 * The {@link Grid} exposes a Grid widget in a friendlier API than the underlying
 * {@link GridView} widget. Namely, all mutation operations are addressed by the
 * model elements, rather than indexes.
 *
 * It support the same features as the {@link GridView}.
 */
export class Grid extends Disposable {
    /**
     * The orientation of the grid. Matches the orientation of the root
     * {@link SplitView} in the grid's {@link GridLocation} model.
     */
    get orientation() { return this.gridview.orientation; }
    set orientation(orientation) { this.gridview.orientation = orientation; }
    /**
     * The width of the grid.
     */
    get width() { return this.gridview.width; }
    /**
     * The height of the grid.
     */
    get height() { return this.gridview.height; }
    /**
     * The minimum width of the grid.
     */
    get minimumWidth() { return this.gridview.minimumWidth; }
    /**
     * The minimum height of the grid.
     */
    get minimumHeight() { return this.gridview.minimumHeight; }
    /**
     * The maximum width of the grid.
     */
    get maximumWidth() { return this.gridview.maximumWidth; }
    /**
     * The maximum height of the grid.
     */
    get maximumHeight() { return this.gridview.maximumHeight; }
    /**
     * A collection of sashes perpendicular to each edge of the grid.
     * Corner sashes will be created for each intersection.
     */
    get boundarySashes() { return this.gridview.boundarySashes; }
    set boundarySashes(boundarySashes) { this.gridview.boundarySashes = boundarySashes; }
    /**
     * Enable/disable edge snapping across all grid views.
     */
    set edgeSnapping(edgeSnapping) { this.gridview.edgeSnapping = edgeSnapping; }
    /**
     * The DOM element for this view.
     */
    get element() { return this.gridview.element; }
    /**
     * Create a new {@link Grid}. A grid must *always* have a view
     * inside.
     *
     * @param view An initial view for this Grid.
     */
    constructor(view, options = {}) {
        super();
        this.views = new Map();
        this.didLayout = false;
        if (view instanceof GridView) {
            this.gridview = view;
            this.gridview.getViewMap(this.views);
        }
        else {
            this.gridview = new GridView(options);
        }
        this._register(this.gridview);
        this._register(this.gridview.onDidSashReset(this.onDidSashReset, this));
        if (!(view instanceof GridView)) {
            this._addView(view, 0, [0]);
        }
        this.onDidChange = this.gridview.onDidChange;
        this.onDidScroll = this.gridview.onDidScroll;
        this.onDidChangeViewMaximized = this.gridview.onDidChangeViewMaximized;
    }
    style(styles) {
        this.gridview.style(styles);
    }
    /**
     * Layout the {@link Grid}.
     *
     * Optionally provide a `top` and `left` positions, those will propagate
     * as an origin for positions passed to {@link IView.layout}.
     *
     * @param width The width of the {@link Grid}.
     * @param height The height of the {@link Grid}.
     * @param top Optional, the top location of the {@link Grid}.
     * @param left Optional, the left location of the {@link Grid}.
     */
    layout(width, height, top = 0, left = 0) {
        this.gridview.layout(width, height, top, left);
        this.didLayout = true;
    }
    /**
     * Add a {@link IView view} to this {@link Grid}, based on another reference view.
     *
     * Take this grid as an example:
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
     * Calling `addView(X, Sizing.Distribute, C, Direction.Right)` will make the following
     * changes:
     *
     * ```
     *  +-----+---------------+
     *  |  A  |      B        |
     *  +-----+-+-------+-----+
     *  |   C   |   X   |     |
     *  +-------+-------+  D  |
     *  |        E      |     |
     *  +---------------+-----+
     * ```
     *
     * Or `addView(X, Sizing.Distribute, D, Direction.Down)`:
     *
     * ```
     *  +-----+---------------+
     *  |  A  |      B        |
     *  +-----+---------+-----+
     *  |        C      |  D  |
     *  +---------------+-----+
     *  |        E      |  X  |
     *  +---------------+-----+
     * ```
     *
     * @param newView The view to add.
     * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
     * @param referenceView Another view to place this new view next to.
     * @param direction The direction the new view should be placed next to the reference view.
     */
    addView(newView, size, referenceView, direction) {
        if (this.views.has(newView)) {
            throw new Error('Can\'t add same view twice');
        }
        const orientation = getDirectionOrientation(direction);
        if (this.views.size === 1 && this.orientation !== orientation) {
            this.orientation = orientation;
        }
        const referenceLocation = this.getViewLocation(referenceView);
        const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);
        let viewSize;
        if (typeof size === 'number') {
            viewSize = size;
        }
        else if (size.type === 'split') {
            const [, index] = tail(referenceLocation);
            viewSize = GridViewSizing.Split(index);
        }
        else if (size.type === 'distribute') {
            viewSize = GridViewSizing.Distribute;
        }
        else if (size.type === 'auto') {
            const [, index] = tail(referenceLocation);
            viewSize = GridViewSizing.Auto(index);
        }
        else {
            viewSize = size;
        }
        this._addView(newView, viewSize, location);
    }
    addViewAt(newView, size, location) {
        if (this.views.has(newView)) {
            throw new Error('Can\'t add same view twice');
        }
        let viewSize;
        if (typeof size === 'number') {
            viewSize = size;
        }
        else if (size.type === 'distribute') {
            viewSize = GridViewSizing.Distribute;
        }
        else {
            viewSize = size;
        }
        this._addView(newView, viewSize, location);
    }
    _addView(newView, size, location) {
        this.views.set(newView, newView.element);
        this.gridview.addView(newView, size, location);
    }
    /**
     * Remove a {@link IView view} from this {@link Grid}.
     *
     * @param view The {@link IView view} to remove.
     * @param sizing Whether to distribute other {@link IView view}'s sizes.
     */
    removeView(view, sizing) {
        if (this.views.size === 1) {
            throw new Error('Can\'t remove last view');
        }
        const location = this.getViewLocation(view);
        let gridViewSizing;
        if (sizing?.type === 'distribute') {
            gridViewSizing = GridViewSizing.Distribute;
        }
        else if (sizing?.type === 'auto') {
            const index = location[location.length - 1];
            gridViewSizing = GridViewSizing.Auto(index === 0 ? 1 : index - 1);
        }
        this.gridview.removeView(location, gridViewSizing);
        this.views.delete(view);
    }
    /**
     * Move a {@link IView view} to another location in the grid.
     *
     * @remarks See {@link Grid.addView}.
     *
     * @param view The {@link IView view} to move.
     * @param sizing Either a fixed size, or a dynamic {@link Sizing} strategy.
     * @param referenceView Another view to place the view next to.
     * @param direction The direction the view should be placed next to the reference view.
     */
    moveView(view, sizing, referenceView, direction) {
        const sourceLocation = this.getViewLocation(view);
        const [sourceParentLocation, from] = tail(sourceLocation);
        const referenceLocation = this.getViewLocation(referenceView);
        const targetLocation = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);
        const [targetParentLocation, to] = tail(targetLocation);
        if (equals(sourceParentLocation, targetParentLocation)) {
            this.gridview.moveView(sourceParentLocation, from, to);
        }
        else {
            this.removeView(view, typeof sizing === 'number' ? undefined : sizing);
            this.addView(view, sizing, referenceView, direction);
        }
    }
    /**
     * Move a {@link IView view} to another location in the grid.
     *
     * @remarks Internal method, do not use without knowing what you're doing.
     * @remarks See {@link GridView.moveView}.
     *
     * @param view The {@link IView view} to move.
     * @param location The {@link GridLocation location} to insert the view on.
     */
    moveViewTo(view, location) {
        const sourceLocation = this.getViewLocation(view);
        const [sourceParentLocation, from] = tail(sourceLocation);
        const [targetParentLocation, to] = tail(location);
        if (equals(sourceParentLocation, targetParentLocation)) {
            this.gridview.moveView(sourceParentLocation, from, to);
        }
        else {
            const size = this.getViewSize(view);
            const orientation = getLocationOrientation(this.gridview.orientation, sourceLocation);
            const cachedViewSize = this.getViewCachedVisibleSize(view);
            const sizing = typeof cachedViewSize === 'undefined'
                ? (orientation === 1 /* Orientation.HORIZONTAL */ ? size.width : size.height)
                : Sizing.Invisible(cachedViewSize);
            this.removeView(view);
            this.addViewAt(view, sizing, location);
        }
    }
    /**
     * Swap two {@link IView views} within the {@link Grid}.
     *
     * @param from One {@link IView view}.
     * @param to Another {@link IView view}.
     */
    swapViews(from, to) {
        const fromLocation = this.getViewLocation(from);
        const toLocation = this.getViewLocation(to);
        return this.gridview.swapViews(fromLocation, toLocation);
    }
    /**
     * Resize a {@link IView view}.
     *
     * @param view The {@link IView view} to resize.
     * @param size The size the view should be.
     */
    resizeView(view, size) {
        const location = this.getViewLocation(view);
        return this.gridview.resizeView(location, size);
    }
    /**
     * Returns whether all other {@link IView views} are at their minimum size.
     *
     * @param view The reference {@link IView view}.
     */
    isViewExpanded(view) {
        const location = this.getViewLocation(view);
        return this.gridview.isViewExpanded(location);
    }
    /**
     * Returns whether the {@link IView view} is maximized.
     *
     * @param view The reference {@link IView view}.
     */
    isViewMaximized(view) {
        const location = this.getViewLocation(view);
        return this.gridview.isViewMaximized(location);
    }
    /**
     * Returns whether the {@link IView view} is maximized.
     *
     * @param view The reference {@link IView view}.
     */
    hasMaximizedView() {
        return this.gridview.hasMaximizedView();
    }
    /**
     * Get the size of a {@link IView view}.
     *
     * @param view The {@link IView view}. Provide `undefined` to get the size
     * of the grid itself.
     */
    getViewSize(view) {
        if (!view) {
            return this.gridview.getViewSize();
        }
        const location = this.getViewLocation(view);
        return this.gridview.getViewSize(location);
    }
    /**
     * Get the cached visible size of a {@link IView view}. This was the size
     * of the view at the moment it last became hidden.
     *
     * @param view The {@link IView view}.
     */
    getViewCachedVisibleSize(view) {
        const location = this.getViewLocation(view);
        return this.gridview.getViewCachedVisibleSize(location);
    }
    /**
     * Maximizes the specified view and hides all other views.
     * @param view The view to maximize.
     * @param excludeViews Optional array of views to exclude from being hidden.
     */
    maximizeView(view, excludeViews = []) {
        if (this.views.size < 2) {
            throw new Error('At least two views are required to maximize a view');
        }
        const location = this.getViewLocation(view);
        this.gridview.maximizeView(location, excludeViews);
    }
    exitMaximizedView() {
        this.gridview.exitMaximizedView();
    }
    /**
     * Expand the size of a {@link IView view} by collapsing all other views
     * to their minimum sizes.
     *
     * @param view The {@link IView view}.
     */
    expandView(view) {
        const location = this.getViewLocation(view);
        this.gridview.expandView(location);
    }
    /**
     * Distribute the size among all {@link IView views} within the entire
     * grid or within a single {@link SplitView}.
     */
    distributeViewSizes() {
        this.gridview.distributeViewSizes();
    }
    /**
     * Returns whether a {@link IView view} is visible.
     *
     * @param view The {@link IView view}.
     */
    isViewVisible(view) {
        const location = this.getViewLocation(view);
        return this.gridview.isViewVisible(location);
    }
    /**
     * Set the visibility state of a {@link IView view}.
     *
     * @param view The {@link IView view}.
     */
    setViewVisible(view, visible) {
        const location = this.getViewLocation(view);
        this.gridview.setViewVisible(location, visible);
    }
    /**
     * Returns a descriptor for the entire grid.
     */
    getViews() {
        return this.gridview.getView();
    }
    /**
     * Utility method to return the collection all views which intersect
     * a view's edge.
     *
     * @param view The {@link IView view}.
     * @param direction Which direction edge to be considered.
     * @param wrap Whether the grid wraps around (from right to left, from bottom to top).
     */
    getNeighborViews(view, direction, wrap = false) {
        if (!this.didLayout) {
            throw new Error('Can\'t call getNeighborViews before first layout');
        }
        const location = this.getViewLocation(view);
        const root = this.getViews();
        const node = getGridNode(root, location);
        let boundary = getBoxBoundary(node.box, direction);
        if (wrap) {
            if (direction === 0 /* Direction.Up */ && node.box.top === 0) {
                boundary = { offset: root.box.top + root.box.height, range: boundary.range };
            }
            else if (direction === 3 /* Direction.Right */ && node.box.left + node.box.width === root.box.width) {
                boundary = { offset: 0, range: boundary.range };
            }
            else if (direction === 1 /* Direction.Down */ && node.box.top + node.box.height === root.box.height) {
                boundary = { offset: 0, range: boundary.range };
            }
            else if (direction === 2 /* Direction.Left */ && node.box.left === 0) {
                boundary = { offset: root.box.left + root.box.width, range: boundary.range };
            }
        }
        return findAdjacentBoxLeafNodes(root, oppositeDirection(direction), boundary)
            .map(node => node.view);
    }
    getViewLocation(view) {
        const element = this.views.get(view);
        if (!element) {
            throw new Error('View not found');
        }
        return getGridLocation(element);
    }
    onDidSashReset(location) {
        const resizeToPreferredSize = (location) => {
            const node = this.gridview.getView(location);
            if (isGridBranchNode(node)) {
                return false;
            }
            const direction = getLocationOrientation(this.orientation, location);
            const size = direction === 1 /* Orientation.HORIZONTAL */ ? node.view.preferredWidth : node.view.preferredHeight;
            if (typeof size !== 'number') {
                return false;
            }
            const viewSize = direction === 1 /* Orientation.HORIZONTAL */ ? { width: Math.round(size) } : { height: Math.round(size) };
            this.gridview.resizeView(location, viewSize);
            return true;
        };
        if (resizeToPreferredSize(location)) {
            return;
        }
        const [parentLocation, index] = tail(location);
        if (resizeToPreferredSize([...parentLocation, index + 1])) {
            return;
        }
        this.gridview.distributeViewSizes(parentLocation);
    }
}
/**
 * A {@link Grid} which can serialize itself.
 */
export class SerializableGrid extends Grid {
    constructor() {
        super(...arguments);
        /**
         * Useful information in order to proportionally restore view sizes
         * upon the very first layout call.
         */
        this.initialLayoutContext = true;
    }
    static serializeNode(node, orientation) {
        const size = orientation === 0 /* Orientation.VERTICAL */ ? node.box.width : node.box.height;
        if (!isGridBranchNode(node)) {
            const serializedLeafNode = { type: 'leaf', data: node.view.toJSON(), size };
            if (typeof node.cachedVisibleSize === 'number') {
                serializedLeafNode.size = node.cachedVisibleSize;
                serializedLeafNode.visible = false;
            }
            else if (node.maximized) {
                serializedLeafNode.maximized = true;
            }
            return serializedLeafNode;
        }
        const data = node.children.map(c => SerializableGrid.serializeNode(c, orthogonal(orientation)));
        if (data.some(c => c.visible !== false)) {
            return { type: 'branch', data: data, size };
        }
        return { type: 'branch', data: data, size, visible: false };
    }
    /**
     * Construct a new {@link SerializableGrid} from a JSON object.
     *
     * @param json The JSON object.
     * @param deserializer A deserializer which can revive each view.
     * @returns A new {@link SerializableGrid} instance.
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
        const gridview = GridView.deserialize(json, deserializer, options);
        const result = new SerializableGrid(gridview, options);
        return result;
    }
    /**
     * Construct a new {@link SerializableGrid} from a grid descriptor.
     *
     * @param gridDescriptor A grid descriptor in which leaf nodes point to actual views.
     * @returns A new {@link SerializableGrid} instance.
     */
    static from(gridDescriptor, options = {}) {
        return SerializableGrid.deserialize(createSerializedGrid(gridDescriptor), { fromJSON: view => view }, options);
    }
    /**
     * Serialize this grid into a JSON object.
     */
    serialize() {
        return {
            root: SerializableGrid.serializeNode(this.getViews(), this.orientation),
            orientation: this.orientation,
            width: this.width,
            height: this.height
        };
    }
    layout(width, height, top = 0, left = 0) {
        super.layout(width, height, top, left);
        if (this.initialLayoutContext) {
            this.initialLayoutContext = false;
            this.gridview.trySet2x2();
        }
    }
}
function isGridBranchNodeDescriptor(nodeDescriptor) {
    return !!nodeDescriptor.groups;
}
export function sanitizeGridNodeDescriptor(nodeDescriptor, rootNode) {
    // eslint-disable-next-line local/code-no-any-casts
    if (!rootNode && nodeDescriptor.groups && nodeDescriptor.groups.length <= 1) {
        // eslint-disable-next-line local/code-no-any-casts
        nodeDescriptor.groups = undefined;
    }
    if (!isGridBranchNodeDescriptor(nodeDescriptor)) {
        return;
    }
    let totalDefinedSize = 0;
    let totalDefinedSizeCount = 0;
    for (const child of nodeDescriptor.groups) {
        sanitizeGridNodeDescriptor(child, false);
        if (child.size) {
            totalDefinedSize += child.size;
            totalDefinedSizeCount++;
        }
    }
    const totalUndefinedSize = totalDefinedSizeCount > 0 ? totalDefinedSize : 1;
    const totalUndefinedSizeCount = nodeDescriptor.groups.length - totalDefinedSizeCount;
    const eachUndefinedSize = totalUndefinedSize / totalUndefinedSizeCount;
    for (const child of nodeDescriptor.groups) {
        if (!child.size) {
            child.size = eachUndefinedSize;
        }
    }
}
function createSerializedNode(nodeDescriptor) {
    if (isGridBranchNodeDescriptor(nodeDescriptor)) {
        return { type: 'branch', data: nodeDescriptor.groups.map(c => createSerializedNode(c)), size: nodeDescriptor.size };
    }
    else {
        return { type: 'leaf', data: nodeDescriptor.data, size: nodeDescriptor.size };
    }
}
function getDimensions(node, orientation) {
    if (node.type === 'branch') {
        const childrenDimensions = node.data.map(c => getDimensions(c, orthogonal(orientation)));
        if (orientation === 0 /* Orientation.VERTICAL */) {
            const width = node.size || (childrenDimensions.length === 0 ? undefined : Math.max(...childrenDimensions.map(d => d.width || 0)));
            const height = childrenDimensions.length === 0 ? undefined : childrenDimensions.reduce((r, d) => r + (d.height || 0), 0);
            return { width, height };
        }
        else {
            const width = childrenDimensions.length === 0 ? undefined : childrenDimensions.reduce((r, d) => r + (d.width || 0), 0);
            const height = node.size || (childrenDimensions.length === 0 ? undefined : Math.max(...childrenDimensions.map(d => d.height || 0)));
            return { width, height };
        }
    }
    else {
        const width = orientation === 0 /* Orientation.VERTICAL */ ? node.size : undefined;
        const height = orientation === 0 /* Orientation.VERTICAL */ ? undefined : node.size;
        return { width, height };
    }
}
/**
 * Creates a new JSON object from a {@link GridDescriptor}, which can
 * be deserialized by {@link SerializableGrid.deserialize}.
 */
export function createSerializedGrid(gridDescriptor) {
    sanitizeGridNodeDescriptor(gridDescriptor, true);
    const root = createSerializedNode(gridDescriptor);
    const { width, height } = getDimensions(root, gridDescriptor.orientation);
    return {
        root,
        orientation: gridDescriptor.orientation,
        width: width || 1,
        height: height || 1
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JpZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUV6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDMUQsT0FBTyxnQkFBZ0IsQ0FBQztBQUN4QixPQUFPLEVBQU8sUUFBUSxFQUF3RSxVQUFVLEVBQUUsTUFBTSxJQUFJLGNBQWMsRUFBZ0IsTUFBTSxlQUFlLENBQUM7QUFJeEssT0FBTyxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRXhFLE1BQU0sQ0FBTixJQUFrQixTQUtqQjtBQUxELFdBQWtCLFNBQVM7SUFDMUIscUNBQUUsQ0FBQTtJQUNGLHlDQUFJLENBQUE7SUFDSix5Q0FBSSxDQUFBO0lBQ0osMkNBQUssQ0FBQTtBQUNOLENBQUMsRUFMaUIsU0FBUyxLQUFULFNBQVMsUUFLMUI7QUFFRCxTQUFTLGlCQUFpQixDQUFDLFNBQW9CO0lBQzlDLFFBQVEsU0FBUyxFQUFFLENBQUM7UUFDbkIseUJBQWlCLENBQUMsQ0FBQyw4QkFBc0I7UUFDekMsMkJBQW1CLENBQUMsQ0FBQyw0QkFBb0I7UUFDekMsMkJBQW1CLENBQUMsQ0FBQywrQkFBdUI7UUFDNUMsNEJBQW9CLENBQUMsQ0FBQyw4QkFBc0I7SUFDN0MsQ0FBQztBQUNGLENBQUM7QUFrQ0QsTUFBTSxVQUFVLGdCQUFnQixDQUFrQixJQUFpQjtJQUNsRSxtREFBbUQ7SUFDbkQsT0FBTyxDQUFDLENBQUUsSUFBWSxDQUFDLFFBQVEsQ0FBQztBQUNqQyxDQUFDO0FBRUQsU0FBUyxXQUFXLENBQWtCLElBQWlCLEVBQUUsUUFBc0I7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LE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsSSxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDekgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUMxQixDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sS0FBSyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN2SCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEksT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztTQUFNLENBQUM7UUFDUCxNQUFNLEtBQUssR0FBRyxXQUFXLGlDQUF5QixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDM0UsTUFBTSxNQUFNLEdBQUcsV0FBVyxpQ0FBeUIsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQzVFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDMUIsQ0FBQztBQUNGLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsb0JBQW9CLENBQUksY0FBaUM7SUFDeEUsMEJBQTBCLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRWpELE1BQU0sSUFBSSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ2xELE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEdBQUcsYUFBYSxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFMUUsT0FBTztRQUNOLElBQUk7UUFDSixXQUFXLEVBQUUsY0FBYyxDQUFDLFdBQVc7UUFDdkMsS0FBSyxFQUFFLEtBQUssSUFBSSxDQUFDO1FBQ2pCLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztLQUNuQixDQUFDO0FBQ0gsQ0FBQyJ9