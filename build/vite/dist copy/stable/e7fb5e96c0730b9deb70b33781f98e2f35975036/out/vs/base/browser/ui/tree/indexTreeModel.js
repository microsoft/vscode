/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TreeError } from './tree.js';
import { splice, tail } from '../../../common/arrays.js';
import { Delayer } from '../../../common/async.js';
import { MicrotaskDelay } from '../../../common/symbols.js';
import { LcsDiff } from '../../../common/diff/diff.js';
import { Emitter, EventBufferer } from '../../../common/event.js';
import { Iterable } from '../../../common/iterator.js';
export function isFilterResult(obj) {
    return !!obj && obj.visibility !== undefined;
}
export function getVisibleState(visibility) {
    switch (visibility) {
        case true: return 1 /* TreeVisibility.Visible */;
        case false: return 0 /* TreeVisibility.Hidden */;
        default: return visibility;
    }
}
function isCollapsibleStateUpdate(update) {
    return 'collapsible' in update;
}
export class IndexTreeModel {
    constructor(user, rootElement, options = {}) {
        this.user = user;
        this.rootRef = [];
        this.eventBufferer = new EventBufferer();
        this._onDidSpliceModel = new Emitter();
        this.onDidSpliceModel = this._onDidSpliceModel.event;
        this._onDidSpliceRenderedNodes = new Emitter();
        this.onDidSpliceRenderedNodes = this._onDidSpliceRenderedNodes.event;
        this._onDidChangeCollapseState = new Emitter();
        this.onDidChangeCollapseState = this.eventBufferer.wrapEvent(this._onDidChangeCollapseState.event);
        this._onDidChangeRenderNodeCount = new Emitter();
        this.onDidChangeRenderNodeCount = this.eventBufferer.wrapEvent(this._onDidChangeRenderNodeCount.event);
        this.refilterDelayer = new Delayer(MicrotaskDelay);
        this.collapseByDefault = typeof options.collapseByDefault === 'undefined' ? false : options.collapseByDefault;
        this.allowNonCollapsibleParents = options.allowNonCollapsibleParents ?? false;
        this.filter = options.filter;
        this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === 'undefined' ? false : options.autoExpandSingleChildren;
        this.root = {
            parent: undefined,
            element: rootElement,
            children: [],
            depth: 0,
            visibleChildrenCount: 0,
            visibleChildIndex: -1,
            collapsible: false,
            collapsed: false,
            renderNodeCount: 0,
            visibility: 1 /* TreeVisibility.Visible */,
            visible: true,
            filterData: undefined
        };
    }
    splice(location, deleteCount, toInsert = Iterable.empty(), options = {}) {
        if (location.length === 0) {
            throw new TreeError(this.user, 'Invalid tree location');
        }
        if (options.diffIdentityProvider) {
            this.spliceSmart(options.diffIdentityProvider, location, deleteCount, toInsert, options);
        }
        else {
            this.spliceSimple(location, deleteCount, toInsert, options);
        }
    }
    spliceSmart(identity, location, deleteCount, toInsertIterable = Iterable.empty(), options, recurseLevels = options.diffDepth ?? 0) {
        const { parentNode } = this.getParentNodeWithListIndex(location);
        if (!parentNode.lastDiffIds) {
            return this.spliceSimple(location, deleteCount, toInsertIterable, options);
        }
        const toInsert = [...toInsertIterable];
        const index = location[location.length - 1];
        const diff = new LcsDiff({ getElements: () => parentNode.lastDiffIds }, {
            getElements: () => [
                ...parentNode.children.slice(0, index),
                ...toInsert,
                ...parentNode.children.slice(index + deleteCount),
            ].map(e => identity.getId(e.element).toString())
        }).ComputeDiff(false);
        // if we were given a 'best effort' diff, use default behavior
        if (diff.quitEarly) {
            parentNode.lastDiffIds = undefined;
            return this.spliceSimple(location, deleteCount, toInsert, options);
        }
        const locationPrefix = location.slice(0, -1);
        const recurseSplice = (fromOriginal, fromModified, count) => {
            if (recurseLevels > 0) {
                for (let i = 0; i < count; i++) {
                    fromOriginal--;
                    fromModified--;
                    this.spliceSmart(identity, [...locationPrefix, fromOriginal, 0], Number.MAX_SAFE_INTEGER, toInsert[fromModified].children, options, recurseLevels - 1);
                }
            }
        };
        let lastStartO = Math.min(parentNode.children.length, index + deleteCount);
        let lastStartM = toInsert.length;
        for (const change of diff.changes.sort((a, b) => b.originalStart - a.originalStart)) {
            recurseSplice(lastStartO, lastStartM, lastStartO - (change.originalStart + change.originalLength));
            lastStartO = change.originalStart;
            lastStartM = change.modifiedStart - index;
            this.spliceSimple([...locationPrefix, lastStartO], change.originalLength, Iterable.slice(toInsert, lastStartM, lastStartM + change.modifiedLength), options);
        }
        // at this point, startO === startM === count since any remaining prefix should match
        recurseSplice(lastStartO, lastStartM, lastStartO);
    }
    spliceSimple(location, deleteCount, toInsert = Iterable.empty(), { onDidCreateNode, onDidDeleteNode, diffIdentityProvider }) {
        const { parentNode, listIndex, revealed, visible } = this.getParentNodeWithListIndex(location);
        const treeListElementsToInsert = [];
        const nodesToInsertIterator = Iterable.map(toInsert, el => this.createTreeNode(el, parentNode, parentNode.visible ? 1 /* TreeVisibility.Visible */ : 0 /* TreeVisibility.Hidden */, revealed, treeListElementsToInsert, onDidCreateNode));
        const lastIndex = location[location.length - 1];
        // figure out what's the visible child start index right before the
        // splice point
        let visibleChildStartIndex = 0;
        for (let i = lastIndex; i >= 0 && i < parentNode.children.length; i--) {
            const child = parentNode.children[i];
            if (child.visible) {
                visibleChildStartIndex = child.visibleChildIndex;
                break;
            }
        }
        const nodesToInsert = [];
        let insertedVisibleChildrenCount = 0;
        let renderNodeCount = 0;
        for (const child of nodesToInsertIterator) {
            nodesToInsert.push(child);
            renderNodeCount += child.renderNodeCount;
            if (child.visible) {
                child.visibleChildIndex = visibleChildStartIndex + insertedVisibleChildrenCount++;
            }
        }
        const deletedNodes = splice(parentNode.children, lastIndex, deleteCount, nodesToInsert);
        if (!diffIdentityProvider) {
            parentNode.lastDiffIds = undefined;
        }
        else if (parentNode.lastDiffIds) {
            splice(parentNode.lastDiffIds, lastIndex, deleteCount, nodesToInsert.map(n => diffIdentityProvider.getId(n.element).toString()));
        }
        else {
            parentNode.lastDiffIds = parentNode.children.map(n => diffIdentityProvider.getId(n.element).toString());
        }
        // figure out what is the count of deleted visible children
        let deletedVisibleChildrenCount = 0;
        for (const child of deletedNodes) {
            if (child.visible) {
                deletedVisibleChildrenCount++;
            }
        }
        // and adjust for all visible children after the splice point
        if (deletedVisibleChildrenCount !== 0) {
            for (let i = lastIndex + nodesToInsert.length; i < parentNode.children.length; i++) {
                const child = parentNode.children[i];
                if (child.visible) {
                    child.visibleChildIndex -= deletedVisibleChildrenCount;
                }
            }
        }
        // update parent's visible children count
        parentNode.visibleChildrenCount += insertedVisibleChildrenCount - deletedVisibleChildrenCount;
        if (deletedNodes.length > 0 && onDidDeleteNode) {
            const visit = (node) => {
                onDidDeleteNode(node);
                node.children.forEach(visit);
            };
            deletedNodes.forEach(visit);
        }
        if (revealed && visible) {
            const visibleDeleteCount = deletedNodes.reduce((r, node) => r + (node.visible ? node.renderNodeCount : 0), 0);
            this._updateAncestorsRenderNodeCount(parentNode, renderNodeCount - visibleDeleteCount);
            this._onDidSpliceRenderedNodes.fire({ start: listIndex, deleteCount: visibleDeleteCount, elements: treeListElementsToInsert });
        }
        this._onDidSpliceModel.fire({ insertedNodes: nodesToInsert, deletedNodes });
        let node = parentNode;
        while (node) {
            if (node.visibility === 2 /* TreeVisibility.Recurse */) {
                // delayed to avoid excessive refiltering, see #135941
                this.refilterDelayer.trigger(() => this.refilter());
                break;
            }
            node = node.parent;
        }
    }
    rerender(location) {
        if (location.length === 0) {
            throw new TreeError(this.user, 'Invalid tree location');
        }
        const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
        if (node.visible && revealed) {
            this._onDidSpliceRenderedNodes.fire({ start: listIndex, deleteCount: 1, elements: [node] });
        }
    }
    has(location) {
        return this.hasTreeNode(location);
    }
    getListIndex(location) {
        const { listIndex, visible, revealed } = this.getTreeNodeWithListIndex(location);
        return visible && revealed ? listIndex : -1;
    }
    getListRenderCount(location) {
        return this.getTreeNode(location).renderNodeCount;
    }
    isCollapsible(location) {
        return this.getTreeNode(location).collapsible;
    }
    setCollapsible(location, collapsible) {
        const node = this.getTreeNode(location);
        if (typeof collapsible === 'undefined') {
            collapsible = !node.collapsible;
        }
        const update = { collapsible };
        return this.eventBufferer.bufferEvents(() => this._setCollapseState(location, update));
    }
    isCollapsed(location) {
        return this.getTreeNode(location).collapsed;
    }
    setCollapsed(location, collapsed, recursive) {
        const node = this.getTreeNode(location);
        if (typeof collapsed === 'undefined') {
            collapsed = !node.collapsed;
        }
        const update = { collapsed, recursive: recursive || false };
        return this.eventBufferer.bufferEvents(() => this._setCollapseState(location, update));
    }
    _setCollapseState(location, update) {
        const { node, listIndex, revealed } = this.getTreeNodeWithListIndex(location);
        const result = this._setListNodeCollapseState(node, listIndex, revealed, update);
        if (node !== this.root && this.autoExpandSingleChildren && result && !isCollapsibleStateUpdate(update) && node.collapsible && !node.collapsed && !update.recursive) {
            let onlyVisibleChildIndex = -1;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.visible) {
                    if (onlyVisibleChildIndex > -1) {
                        onlyVisibleChildIndex = -1;
                        break;
                    }
                    else {
                        onlyVisibleChildIndex = i;
                    }
                }
            }
            if (onlyVisibleChildIndex > -1) {
                this._setCollapseState([...location, onlyVisibleChildIndex], update);
            }
        }
        return result;
    }
    _setListNodeCollapseState(node, listIndex, revealed, update) {
        const result = this._setNodeCollapseState(node, update, false);
        if (!revealed || !node.visible || !result) {
            return result;
        }
        const previousRenderNodeCount = node.renderNodeCount;
        const toInsert = this.updateNodeAfterCollapseChange(node);
        const deleteCount = previousRenderNodeCount - (listIndex === -1 ? 0 : 1);
        this._onDidSpliceRenderedNodes.fire({ start: listIndex + 1, deleteCount: deleteCount, elements: toInsert.slice(1) });
        return result;
    }
    _setNodeCollapseState(node, update, deep) {
        let result;
        if (node === this.root) {
            result = false;
        }
        else {
            if (isCollapsibleStateUpdate(update)) {
                result = node.collapsible !== update.collapsible;
                node.collapsible = update.collapsible;
            }
            else if (!node.collapsible) {
                result = false;
            }
            else {
                result = node.collapsed !== update.collapsed;
                node.collapsed = update.collapsed;
            }
            if (result) {
                this._onDidChangeCollapseState.fire({ node, deep });
            }
        }
        if (!isCollapsibleStateUpdate(update) && update.recursive) {
            for (const child of node.children) {
                result = this._setNodeCollapseState(child, update, true) || result;
            }
        }
        return result;
    }
    expandTo(location) {
        this.eventBufferer.bufferEvents(() => {
            let node = this.getTreeNode(location);
            while (node.parent) {
                node = node.parent;
                location = location.slice(0, location.length - 1);
                if (node.collapsed) {
                    this._setCollapseState(location, { collapsed: false, recursive: false });
                }
            }
        });
    }
    refilter() {
        const previousRenderNodeCount = this.root.renderNodeCount;
        const toInsert = this.updateNodeAfterFilterChange(this.root);
        this._onDidSpliceRenderedNodes.fire({ start: 0, deleteCount: previousRenderNodeCount, elements: toInsert });
        this.refilterDelayer.cancel();
    }
    createTreeNode(treeElement, parent, parentVisibility, revealed, treeListElements, onDidCreateNode) {
        const node = {
            parent,
            element: treeElement.element,
            children: [],
            depth: parent.depth + 1,
            visibleChildrenCount: 0,
            visibleChildIndex: -1,
            collapsible: typeof treeElement.collapsible === 'boolean' ? treeElement.collapsible : (typeof treeElement.collapsed !== 'undefined'),
            collapsed: typeof treeElement.collapsed === 'undefined' ? this.collapseByDefault : treeElement.collapsed,
            renderNodeCount: 1,
            visibility: 1 /* TreeVisibility.Visible */,
            visible: true,
            filterData: undefined
        };
        const visibility = this._filterNode(node, parentVisibility);
        node.visibility = visibility;
        if (revealed) {
            treeListElements.push(node);
        }
        const childElements = treeElement.children || Iterable.empty();
        const childRevealed = revealed && visibility !== 0 /* TreeVisibility.Hidden */ && !node.collapsed;
        let visibleChildrenCount = 0;
        let renderNodeCount = 1;
        for (const el of childElements) {
            const child = this.createTreeNode(el, node, visibility, childRevealed, treeListElements, onDidCreateNode);
            node.children.push(child);
            renderNodeCount += child.renderNodeCount;
            if (child.visible) {
                child.visibleChildIndex = visibleChildrenCount++;
            }
        }
        if (!this.allowNonCollapsibleParents) {
            node.collapsible = node.collapsible || node.children.length > 0;
        }
        node.visibleChildrenCount = visibleChildrenCount;
        node.visible = visibility === 2 /* TreeVisibility.Recurse */ ? visibleChildrenCount > 0 : (visibility === 1 /* TreeVisibility.Visible */);
        if (!node.visible) {
            node.renderNodeCount = 0;
            if (revealed) {
                treeListElements.pop();
            }
        }
        else if (!node.collapsed) {
            node.renderNodeCount = renderNodeCount;
        }
        onDidCreateNode?.(node);
        return node;
    }
    updateNodeAfterCollapseChange(node) {
        const previousRenderNodeCount = node.renderNodeCount;
        const result = [];
        this._updateNodeAfterCollapseChange(node, result);
        this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);
        return result;
    }
    _updateNodeAfterCollapseChange(node, result) {
        if (node.visible === false) {
            return 0;
        }
        result.push(node);
        node.renderNodeCount = 1;
        if (!node.collapsed) {
            for (const child of node.children) {
                node.renderNodeCount += this._updateNodeAfterCollapseChange(child, result);
            }
        }
        this._onDidChangeRenderNodeCount.fire(node);
        return node.renderNodeCount;
    }
    updateNodeAfterFilterChange(node) {
        const previousRenderNodeCount = node.renderNodeCount;
        const result = [];
        this._updateNodeAfterFilterChange(node, node.visible ? 1 /* TreeVisibility.Visible */ : 0 /* TreeVisibility.Hidden */, result);
        this._updateAncestorsRenderNodeCount(node.parent, result.length - previousRenderNodeCount);
        return result;
    }
    _updateNodeAfterFilterChange(node, parentVisibility, result, revealed = true) {
        let visibility;
        if (node !== this.root) {
            visibility = this._filterNode(node, parentVisibility);
            if (visibility === 0 /* TreeVisibility.Hidden */) {
                node.visible = false;
                node.renderNodeCount = 0;
                return false;
            }
            if (revealed) {
                result.push(node);
            }
        }
        const resultStartLength = result.length;
        node.renderNodeCount = node === this.root ? 0 : 1;
        let hasVisibleDescendants = false;
        if (!node.collapsed || visibility !== 0 /* TreeVisibility.Hidden */) {
            let visibleChildIndex = 0;
            for (const child of node.children) {
                hasVisibleDescendants = this._updateNodeAfterFilterChange(child, visibility, result, revealed && !node.collapsed) || hasVisibleDescendants;
                if (child.visible) {
                    child.visibleChildIndex = visibleChildIndex++;
                }
            }
            node.visibleChildrenCount = visibleChildIndex;
        }
        else {
            node.visibleChildrenCount = 0;
        }
        if (node !== this.root) {
            node.visible = visibility === 2 /* TreeVisibility.Recurse */ ? hasVisibleDescendants : (visibility === 1 /* TreeVisibility.Visible */);
            node.visibility = visibility;
        }
        if (!node.visible) {
            node.renderNodeCount = 0;
            if (revealed) {
                result.pop();
            }
        }
        else if (!node.collapsed) {
            node.renderNodeCount += result.length - resultStartLength;
        }
        this._onDidChangeRenderNodeCount.fire(node);
        return node.visible;
    }
    _updateAncestorsRenderNodeCount(node, diff) {
        if (diff === 0) {
            return;
        }
        while (node) {
            node.renderNodeCount += diff;
            this._onDidChangeRenderNodeCount.fire(node);
            node = node.parent;
        }
    }
    _filterNode(node, parentVisibility) {
        const result = this.filter ? this.filter.filter(node.element, parentVisibility) : 1 /* TreeVisibility.Visible */;
        if (typeof result === 'boolean') {
            node.filterData = undefined;
            return result ? 1 /* TreeVisibility.Visible */ : 0 /* TreeVisibility.Hidden */;
        }
        else if (isFilterResult(result)) {
            node.filterData = result.data;
            return getVisibleState(result.visibility);
        }
        else {
            node.filterData = undefined;
            return getVisibleState(result);
        }
    }
    // cheap
    hasTreeNode(location, node = this.root) {
        if (!location || location.length === 0) {
            return true;
        }
        const [index, ...rest] = location;
        if (index < 0 || index > node.children.length) {
            return false;
        }
        return this.hasTreeNode(rest, node.children[index]);
    }
    // cheap
    getTreeNode(location, node = this.root) {
        if (!location || location.length === 0) {
            return node;
        }
        const [index, ...rest] = location;
        if (index < 0 || index > node.children.length) {
            throw new TreeError(this.user, 'Invalid tree location');
        }
        return this.getTreeNode(rest, node.children[index]);
    }
    // expensive
    getTreeNodeWithListIndex(location) {
        if (location.length === 0) {
            return { node: this.root, listIndex: -1, revealed: true, visible: false };
        }
        const { parentNode, listIndex, revealed, visible } = this.getParentNodeWithListIndex(location);
        const index = location[location.length - 1];
        if (index < 0 || index > parentNode.children.length) {
            throw new TreeError(this.user, 'Invalid tree location');
        }
        const node = parentNode.children[index];
        return { node, listIndex, revealed, visible: visible && node.visible };
    }
    getParentNodeWithListIndex(location, node = this.root, listIndex = 0, revealed = true, visible = true) {
        const [index, ...rest] = location;
        if (index < 0 || index > node.children.length) {
            throw new TreeError(this.user, 'Invalid tree location');
        }
        // TODO@joao perf!
        for (let i = 0; i < index; i++) {
            listIndex += node.children[i].renderNodeCount;
        }
        revealed = revealed && !node.collapsed;
        visible = visible && node.visible;
        if (rest.length === 0) {
            return { parentNode: node, listIndex, revealed, visible };
        }
        return this.getParentNodeWithListIndex(rest, node.children[index], listIndex + 1, revealed, visible);
    }
    getNode(location = []) {
        return this.getTreeNode(location);
    }
    // TODO@joao perf!
    getNodeLocation(node) {
        const location = [];
        let indexTreeNode = node; // typing woes
        while (indexTreeNode.parent) {
            location.push(indexTreeNode.parent.children.indexOf(indexTreeNode));
            indexTreeNode = indexTreeNode.parent;
        }
        return location.reverse();
    }
    getParentNodeLocation(location) {
        if (location.length === 0) {
            return undefined;
        }
        else if (location.length === 1) {
            return [];
        }
        else {
            return tail(location)[0];
        }
    }
    getFirstElementChild(location) {
        const node = this.getTreeNode(location);
        if (node.children.length === 0) {
            return undefined;
        }
        return node.children[0].element;
    }
    getLastElementAncestor(location = []) {
        const node = this.getTreeNode(location);
        if (node.children.length === 0) {
            return undefined;
        }
        return this._getLastElementAncestor(node);
    }
    _getLastElementAncestor(node) {
        if (node.children.length === 0) {
            return node.element;
        }
        return this._getLastElementAncestor(node.children[node.children.length - 1]);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhUcmVlTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9pbmRleFRyZWVNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQWtKLFNBQVMsRUFBa0IsTUFBTSxXQUFXLENBQUM7QUFDdE0sT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbkQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFTLGFBQWEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQWlCdkQsTUFBTSxVQUFVLGNBQWMsQ0FBSSxHQUFZO0lBQzdDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsSUFBK0IsR0FBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLENBQUM7QUFDMUUsQ0FBQztBQUVELE1BQU0sVUFBVSxlQUFlLENBQUMsVUFBb0M7SUFDbkUsUUFBUSxVQUFVLEVBQUUsQ0FBQztRQUNwQixLQUFLLElBQUksQ0FBQyxDQUFDLHNDQUE4QjtRQUN6QyxLQUFLLEtBQUssQ0FBQyxDQUFDLHFDQUE2QjtRQUN6QyxPQUFPLENBQUMsQ0FBQyxPQUFPLFVBQVUsQ0FBQztJQUM1QixDQUFDO0FBQ0YsQ0FBQztBQWdERCxTQUFTLHdCQUF3QixDQUFDLE1BQTJCO0lBQzVELE9BQU8sYUFBYSxJQUFJLE1BQU0sQ0FBQztBQUNoQyxDQUFDO0FBRUQsTUFBTSxPQUFPLGNBQWM7SUEwQjFCLFlBQ1MsSUFB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