/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getVisibleState, isFilterResult } from './indexTreeModel.js';
import { ObjectTreeModel } from './objectTreeModel.js';
import { TreeError, WeakMapper } from './tree.js';
import { equals } from '../../../common/arrays.js';
import { Event } from '../../../common/event.js';
import { Iterable } from '../../../common/iterator.js';
function noCompress(element) {
    const elements = [element.element];
    const incompressible = element.incompressible || false;
    return {
        element: { elements, incompressible },
        children: Iterable.map(Iterable.from(element.children), noCompress),
        collapsible: element.collapsible,
        collapsed: element.collapsed
    };
}
// Exported only for test reasons, do not use directly
export function compress(element) {
    const elements = [element.element];
    const incompressible = element.incompressible || false;
    let childrenIterator;
    let children;
    while (true) {
        [children, childrenIterator] = Iterable.consume(Iterable.from(element.children), 2);
        if (children.length !== 1) {
            break;
        }
        if (children[0].incompressible) {
            break;
        }
        element = children[0];
        elements.push(element.element);
    }
    return {
        element: { elements, incompressible },
        children: Iterable.map(Iterable.concat(children, childrenIterator), compress),
        collapsible: element.collapsible,
        collapsed: element.collapsed
    };
}
function _decompress(element, index = 0) {
    let children;
    if (index < element.element.elements.length - 1) {
        children = [_decompress(element, index + 1)];
    }
    else {
        children = Iterable.map(Iterable.from(element.children), el => _decompress(el, 0));
    }
    if (index === 0 && element.element.incompressible) {
        return {
            element: element.element.elements[index],
            children,
            incompressible: true,
            collapsible: element.collapsible,
            collapsed: element.collapsed
        };
    }
    return {
        element: element.element.elements[index],
        children,
        collapsible: element.collapsible,
        collapsed: element.collapsed
    };
}
// Exported only for test reasons, do not use directly
export function decompress(element) {
    return _decompress(element, 0);
}
function splice(treeElement, element, children) {
    if (treeElement.element === element) {
        return { ...treeElement, children };
    }
    return { ...treeElement, children: Iterable.map(Iterable.from(treeElement.children), e => splice(e, element, children)) };
}
const wrapIdentityProvider = (base) => ({
    getId(node) {
        return node.elements.map(e => base.getId(e).toString()).join('\0');
    },
    getGroupId: base.getGroupId ? (node) => {
        return base.getGroupId(node.elements[node.elements.length - 1]);
    } : undefined
});
// Exported only for test reasons, do not use directly
export class CompressedObjectTreeModel {
    get onDidSpliceRenderedNodes() { return this.model.onDidSpliceRenderedNodes; }
    get onDidSpliceModel() { return this.model.onDidSpliceModel; }
    get onDidChangeCollapseState() { return this.model.onDidChangeCollapseState; }
    get onDidChangeRenderNodeCount() { return this.model.onDidChangeRenderNodeCount; }
    get size() { return this.nodes.size; }
    constructor(user, options = {}) {
        this.user = user;
        this.rootRef = null;
        this.nodes = new Map();
        this.model = new ObjectTreeModel(user, options);
        this.enabled = typeof options.compressionEnabled === 'undefined' ? true : options.compressionEnabled;
        this.identityProvider = options.identityProvider;
    }
    setChildren(element, children = Iterable.empty(), options) {
        // Diffs must be deep, since the compression can affect nested elements.
        // @see https://github.com/microsoft/vscode/pull/114237#issuecomment-759425034
        const diffIdentityProvider = options.diffIdentityProvider && wrapIdentityProvider(options.diffIdentityProvider);
        if (element === null) {
            const compressedChildren = Iterable.map(children, this.enabled ? compress : noCompress);
            this._setChildren(null, compressedChildren, { diffIdentityProvider, diffDepth: Infinity });
            return;
        }
        const compressedNode = this.nodes.get(element);
        if (!compressedNode) {
            throw new TreeError(this.user, 'Unknown compressed tree node');
        }
        const node = this.model.getNode(compressedNode);
        const compressedParentNode = this.model.getParentNodeLocation(compressedNode);
        const parent = this.model.getNode(compressedParentNode);
        const decompressedElement = decompress(node);
        const splicedElement = splice(decompressedElement, element, children);
        const recompressedElement = (this.enabled ? compress : noCompress)(splicedElement);
        // If the recompressed node is identical to the original, just set its children.
        // Saves work and churn diffing the parent element.
        const elementComparator = options.diffIdentityProvider
            ? ((a, b) => options.diffIdentityProvider.getId(a) === options.diffIdentityProvider.getId(b))
            : undefined;
        if (equals(recompressedElement.element.elements, node.element.elements, elementComparator)) {
            this._setChildren(compressedNode, recompressedElement.children || Iterable.empty(), { diffIdentityProvider, diffDepth: 1 });
            return;
        }
        const parentChildren = parent.children
            .map(child => child === node ? recompressedElement : child);
        this._setChildren(parent.element, parentChildren, {
            diffIdentityProvider,
            diffDepth: node.depth - parent.depth,
        });
    }
    isCompressionEnabled() {
        return this.enabled;
    }
    setCompressionEnabled(enabled) {
        if (enabled === this.enabled) {
            return;
        }
        this.enabled = enabled;
        const root = this.model.getNode();
        const rootChildren = root.children;
        const decompressedRootChildren = Iterable.map(rootChildren, decompress);
        const recompressedRootChildren = Iterable.map(decompressedRootChildren, enabled ? compress : noCompress);
        // it should be safe to always use deep diff mode here if an identity
        // provider is available, since we know the raw nodes are unchanged.
        this._setChildren(null, recompressedRootChildren, {
            diffIdentityProvider: this.identityProvider,
            diffDepth: Infinity,
        });
    }
    _setChildren(node, children, options) {
        const insertedElements = new Set();
        const onDidCreateNode = (node) => {
            for (const element of node.element.elements) {
                insertedElements.add(element);
                this.nodes.set(element, node.element);
            }
        };
        const onDidDeleteNode = (node) => {
            for (const element of node.element.elements) {
                if (!insertedElements.has(element)) {
                    this.nodes.delete(element);
                }
            }
        };
        this.model.setChildren(node, children, { ...options, onDidCreateNode, onDidDeleteNode });
    }
    has(element) {
        return this.nodes.has(element);
    }
    getListIndex(location) {
        const node = this.getCompressedNode(location);
        return this.model.getListIndex(node);
    }
    getListRenderCount(location) {
        const node = this.getCompressedNode(location);
        return this.model.getListRenderCount(node);
    }
    getNode(location) {
        if (typeof location === 'undefined') {
            return this.model.getNode();
        }
        const node = this.getCompressedNode(location);
        return this.model.getNode(node);
    }
    // TODO: review this
    getNodeLocation(node) {
        const compressedNode = this.model.getNodeLocation(node);
        if (compressedNode === null) {
            return null;
        }
        return compressedNode.elements[compressedNode.elements.length - 1];
    }
    // TODO: review this
    getParentNodeLocation(location) {
        const compressedNode = this.getCompressedNode(location);
        const parentNode = this.model.getParentNodeLocation(compressedNode);
        if (parentNode === null) {
            return null;
        }
        return parentNode.elements[parentNode.elements.length - 1];
    }
    getFirstElementChild(location) {
        const compressedNode = this.getCompressedNode(location);
        return this.model.getFirstElementChild(compressedNode);
    }
    getLastElementAncestor(location) {
        const compressedNode = typeof location === 'undefined' ? undefined : this.getCompressedNode(location);
        return this.model.getLastElementAncestor(compressedNode);
    }
    isCollapsible(location) {
        const compressedNode = this.getCompressedNode(location);
        return this.model.isCollapsible(compressedNode);
    }
    setCollapsible(location, collapsible) {
        const compressedNode = this.getCompressedNode(location);
        return this.model.setCollapsible(compressedNode, collapsible);
    }
    isCollapsed(location) {
        const compressedNode = this.getCompressedNode(location);
        return this.model.isCollapsed(compressedNode);
    }
    setCollapsed(location, collapsed, recursive) {
        const compressedNode = this.getCompressedNode(location);
        return this.model.setCollapsed(compressedNode, collapsed, recursive);
    }
    expandTo(location) {
        const compressedNode = this.getCompressedNode(location);
        this.model.expandTo(compressedNode);
    }
    rerender(location) {
        const compressedNode = this.getCompressedNode(location);
        this.model.rerender(compressedNode);
    }
    refilter() {
        this.model.refilter();
    }
    resort(location = null, recursive = true) {
        const compressedNode = this.getCompressedNode(location);
        this.model.resort(compressedNode, recursive);
    }
    getCompressedNode(element) {
        if (element === null) {
            return null;
        }
        const node = this.nodes.get(element);
        if (!node) {
            throw new TreeError(this.user, `Tree element not found: ${element}`);
        }
        return node;
    }
}
export const DefaultElementMapper = elements => elements[elements.length - 1];
class CompressedTreeNodeWrapper {
    get element() { return this.node.element === null ? null : this.unwrapper(this.node.element); }
    get children() { return this.node.children.map(node => new CompressedTreeNodeWrapper(this.unwrapper, node)); }
    get depth() { return this.node.depth; }
    get visibleChildrenCount() { return this.node.visibleChildrenCount; }
    get visibleChildIndex() { return this.node.visibleChildIndex; }
    get collapsible() { return this.node.collapsible; }
    get collapsed() { return this.node.collapsed; }
    get visible() { return this.node.visible; }
    get filterData() { return this.node.filterData; }
    constructor(unwrapper, node) {
        this.unwrapper = unwrapper;
        this.node = node;
    }
}
function mapOptions(compressedNodeUnwrapper, options) {
    return {
        ...options,
        identityProvider: options.identityProvider && {
            getId(node) {
                return options.identityProvider.getId(compressedNodeUnwrapper(node));
            },
            getGroupId: options.identityProvider.getGroupId ? (node) => {
                return options.identityProvider.getGroupId(compressedNodeUnwrapper(node));
            } : undefined
        },
        sorter: options.sorter && {
            compare(node, otherNode) {
                return options.sorter.compare(node.elements[0], otherNode.elements[0]);
            }
        },
        filter: options.filter && {
            filter(node, parentVisibility) {
                const elements = node.elements;
                for (let i = 0; i < elements.length - 1; i++) {
                    const result = options.filter.filter(elements[i], parentVisibility);
                    parentVisibility = getVisibleState(isFilterResult(result) ? result.visibility : result);
                }
                return options.filter.filter(elements[elements.length - 1], parentVisibility);
            }
        }
    };
}
export class CompressibleObjectTreeModel {
    get onDidSpliceModel() {
        return Event.map(this.model.onDidSpliceModel, ({ insertedNodes, deletedNodes }) => ({
            insertedNodes: insertedNodes.map(node => this.nodeMapper.map(node)),
            deletedNodes: deletedNodes.map(node => this.nodeMapper.map(node)),
        }));
    }
    get onDidSpliceRenderedNodes() {
        return Event.map(this.model.onDidSpliceRenderedNodes, ({ start, deleteCount, elements }) => ({
            start,
            deleteCount,
            elements: elements.map(node => this.nodeMapper.map(node))
        }));
    }
    get onDidChangeCollapseState() {
        return Event.map(this.model.onDidChangeCollapseState, ({ node, deep }) => ({
            node: this.nodeMapper.map(node),
            deep
        }));
    }
    get onDidChangeRenderNodeCount() {
        return Event.map(this.model.onDidChangeRenderNodeCount, node => this.nodeMapper.map(node));
    }
    constructor(user, options = {}) {
        this.rootRef = null;
        this.elementMapper = options.elementMapper || DefaultElementMapper;
        const compressedNodeUnwrapper = node => this.elementMapper(node.elements);
        this.nodeMapper = new WeakMapper(node => new CompressedTreeNodeWrapper(compressedNodeUnwrapper, node));
        this.model = new CompressedObjectTreeModel(user, mapOptions(compressedNodeUnwrapper, options));
    }
    setChildren(element, children = Iterable.empty(), options = {}) {
        this.model.setChildren(element, children, options);
    }
    isCompressionEnabled() {
        return this.model.isCompressionEnabled();
    }
    setCompressionEnabled(enabled) {
        this.model.setCompressionEnabled(enabled);
    }
    has(location) {
        return this.model.has(location);
    }
    getListIndex(location) {
        return this.model.getListIndex(location);
    }
    getListRenderCount(location) {
        return this.model.getListRenderCount(location);
    }
    getNode(location) {
        return this.nodeMapper.map(this.model.getNode(location));
    }
    getNodeLocation(node) {
        return node.element;
    }
    getParentNodeLocation(location) {
        return this.model.getParentNodeLocation(location);
    }
    getFirstElementChild(location) {
        const result = this.model.getFirstElementChild(location);
        if (result === null || typeof result === 'undefined') {
            return result;
        }
        return this.elementMapper(result.elements);
    }
    getLastElementAncestor(location) {
        const result = this.model.getLastElementAncestor(location);
        if (result === null || typeof result === 'undefined') {
            return result;
        }
        return this.elementMapper(result.elements);
    }
    isCollapsible(location) {
        return this.model.isCollapsible(location);
    }
    setCollapsible(location, collapsed) {
        return this.model.setCollapsible(location, collapsed);
    }
    isCollapsed(location) {
        return this.model.isCollapsed(location);
    }
    setCollapsed(location, collapsed, recursive) {
        return this.model.setCollapsed(location, collapsed, recursive);
    }
    expandTo(location) {
        return this.model.expandTo(location);
    }
    rerender(location) {
        return this.model.rerender(location);
    }
    refilter() {
        return this.model.refilter();
    }
    resort(element = null, recursive = true) {
        return this.model.resort(element, recursive);
    }
    getCompressedTreeNode(location = null) {
        return this.model.getNode(location);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS90cmVlL2NvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBZ0MsY0FBYyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDcEcsT0FBTyxFQUFpRixlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN0SSxPQUFPLEVBQW9ILFNBQVMsRUFBb0MsVUFBVSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ3RNLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDakQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBY3ZELFNBQVMsVUFBVSxDQUFJLE9BQWtDO0lBQ3hELE1BQU0sUUFBUSxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ25DLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxjQUFjLElBQUksS0FBSyxDQUFDO0lBRXZELE9BQU87UUFDTixPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFO1FBQ3JDLFFBQVEsRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsQ0FBQztRQUNuRSxXQUFXLEVBQUUsT0FBTyxDQUFDLFdBQVc7UUFDaEMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO0tBQzVCLENBQUM7QUFDSCxDQUFDO0FBRUQsc0RBQXNEO0FBQ3RELE1BQU0sVUFBVSxRQUFRLENBQUksT0FBa0M7SUFDN0QsTUFBTSxR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