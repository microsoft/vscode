/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IndexTreeModel } from './indexTreeModel.js';
import { ObjectTreeElementCollapseState, TreeError } from './tree.js';
import { Iterable } from '../../../common/iterator.js';
export class ObjectTreeModel {
    get size() { return this.nodes.size; }
    constructor(user, options = {}) {
        this.user = user;
        this.rootRef = null;
        this.nodes = new Map();
        this.nodesByIdentity = new Map();
        this.model = new IndexTreeModel(user, null, options);
        this.onDidSpliceModel = this.model.onDidSpliceModel;
        this.onDidSpliceRenderedNodes = this.model.onDidSpliceRenderedNodes;
        this.onDidChangeCollapseState = this.model.onDidChangeCollapseState;
        this.onDidChangeRenderNodeCount = this.model.onDidChangeRenderNodeCount;
        if (options.sorter) {
            this.sorter = {
                compare(a, b) {
                    return options.sorter.compare(a.element, b.element);
                }
            };
        }
        this.identityProvider = options.identityProvider;
    }
    setChildren(element, children = Iterable.empty(), options = {}) {
        const location = this.getElementLocation(element);
        this._setChildren(location, this.preserveCollapseState(children), options);
    }
    _setChildren(location, children = Iterable.empty(), options) {
        const insertedElements = new Set();
        const insertedElementIds = new Set();
        const onDidCreateNode = (node) => {
            if (node.element === null) {
                return;
            }
            const tnode = node;
            insertedElements.add(tnode.element);
            this.nodes.set(tnode.element, tnode);
            if (this.identityProvider) {
                const id = this.identityProvider.getId(tnode.element).toString();
                insertedElementIds.add(id);
                this.nodesByIdentity.set(id, tnode);
            }
            options.onDidCreateNode?.(tnode);
        };
        const onDidDeleteNode = (node) => {
            if (node.element === null) {
                return;
            }
            const tnode = node;
            if (!insertedElements.has(tnode.element)) {
                this.nodes.delete(tnode.element);
            }
            if (this.identityProvider) {
                const id = this.identityProvider.getId(tnode.element).toString();
                if (!insertedElementIds.has(id)) {
                    this.nodesByIdentity.delete(id);
                }
            }
            options.onDidDeleteNode?.(tnode);
        };
        this.model.splice([...location, 0], Number.MAX_VALUE, children, { ...options, onDidCreateNode, onDidDeleteNode });
    }
    preserveCollapseState(elements = Iterable.empty()) {
        if (this.sorter) {
            elements = [...elements].sort(this.sorter.compare.bind(this.sorter));
        }
        return Iterable.map(elements, treeElement => {
            let node = this.nodes.get(treeElement.element);
            if (!node && this.identityProvider) {
                const id = this.identityProvider.getId(treeElement.element).toString();
                node = this.nodesByIdentity.get(id);
            }
            if (!node) {
                let collapsed;
                if (typeof treeElement.collapsed === 'undefined') {
                    collapsed = undefined;
                }
                else if (treeElement.collapsed === ObjectTreeElementCollapseState.Collapsed || treeElement.collapsed === ObjectTreeElementCollapseState.PreserveOrCollapsed) {
                    collapsed = true;
                }
                else if (treeElement.collapsed === ObjectTreeElementCollapseState.Expanded || treeElement.collapsed === ObjectTreeElementCollapseState.PreserveOrExpanded) {
                    collapsed = false;
                }
                else {
                    collapsed = Boolean(treeElement.collapsed);
                }
                return {
                    ...treeElement,
                    children: this.preserveCollapseState(treeElement.children),
                    collapsed
                };
            }
            const collapsible = typeof treeElement.collapsible === 'boolean' ? treeElement.collapsible : node.collapsible;
            let collapsed;
            if (typeof treeElement.collapsed === 'undefined' || treeElement.collapsed === ObjectTreeElementCollapseState.PreserveOrCollapsed || treeElement.collapsed === ObjectTreeElementCollapseState.PreserveOrExpanded) {
                collapsed = node.collapsed;
            }
            else if (treeElement.collapsed === ObjectTreeElementCollapseState.Collapsed) {
                collapsed = true;
            }
            else if (treeElement.collapsed === ObjectTreeElementCollapseState.Expanded) {
                collapsed = false;
            }
            else {
                collapsed = Boolean(treeElement.collapsed);
            }
            return {
                ...treeElement,
                collapsible,
                collapsed,
                children: this.preserveCollapseState(treeElement.children)
            };
        });
    }
    rerender(element) {
        const location = this.getElementLocation(element);
        this.model.rerender(location);
    }
    resort(element = null, recursive = true) {
        if (!this.sorter) {
            return;
        }
        const location = this.getElementLocation(element);
        const node = this.model.getNode(location);
        this._setChildren(location, this.resortChildren(node, recursive), {});
    }
    resortChildren(node, recursive, first = true) {
        let childrenNodes = [...node.children];
        if (recursive || first) {
            childrenNodes = childrenNodes.sort(this.sorter.compare.bind(this.sorter));
        }
        return Iterable.map(childrenNodes, node => ({
            element: node.element,
            collapsible: node.collapsible,
            collapsed: node.collapsed,
            children: this.resortChildren(node, recursive, false)
        }));
    }
    getFirstElementChild(ref = null) {
        const location = this.getElementLocation(ref);
        return this.model.getFirstElementChild(location);
    }
    getLastElementAncestor(ref = null) {
        const location = this.getElementLocation(ref);
        return this.model.getLastElementAncestor(location);
    }
    has(element) {
        return this.nodes.has(element);
    }
    getListIndex(element) {
        const location = this.getElementLocation(element);
        return this.model.getListIndex(location);
    }
    getListRenderCount(element) {
        const location = this.getElementLocation(element);
        return this.model.getListRenderCount(location);
    }
    isCollapsible(element) {
        const location = this.getElementLocation(element);
        return this.model.isCollapsible(location);
    }
    setCollapsible(element, collapsible) {
        const location = this.getElementLocation(element);
        return this.model.setCollapsible(location, collapsible);
    }
    isCollapsed(element) {
        const location = this.getElementLocation(element);
        return this.model.isCollapsed(location);
    }
    setCollapsed(element, collapsed, recursive) {
        const location = this.getElementLocation(element);
        return this.model.setCollapsed(location, collapsed, recursive);
    }
    expandTo(element) {
        const location = this.getElementLocation(element);
        this.model.expandTo(location);
    }
    refilter() {
        this.model.refilter();
    }
    getNode(element = null) {
        if (element === null) {
            return this.model.getNode(this.model.rootRef);
        }
        const node = this.nodes.get(element);
        if (!node) {
            throw new TreeError(this.user, `Tree element not found: ${element}`);
        }
        return node;
    }
    getNodeLocation(node) {
        return node.element;
    }
    getParentNodeLocation(element) {
        if (element === null) {
            throw new TreeError(this.user, `Invalid getParentNodeLocation call`);
        }
        const node = this.nodes.get(element);
        if (!node) {
            throw new TreeError(this.user, `Tree element not found: ${element}`);
        }
        const location = this.model.getNodeLocation(node);
        const parentLocation = this.model.getParentNodeLocation(location);
        const parent = this.model.getNode(parentLocation);
        return parent.element;
    }
    getElementLocation(element) {
        if (element === null) {
            return [];
        }
        const node = this.nodes.get(element);
        if (!node) {
            throw new TreeError(this.user, `Tree element not found: ${element}`);
        }
        return this.model.getNodeLocation(node);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JqZWN0VHJlZU1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZU1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBd0QsY0FBYyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDM0csT0FBTyxFQUErSSw4QkFBOEIsRUFBRSxTQUFTLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFFbk4sT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBaUJ2RCxNQUFNLE9BQU8sZUFBZTtJQWUzQixJQUFJLElBQUksS0FBYSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUU5QyxZQUNTLElBQVksRUFDcEIsVUFBbUQsRUFBRTtRQUQ3QyxTQUFJLEdBQUosSUFBSSxDQUFRO1FBaEJaLFlBQU8sR0FBRyxJQUFJLENBQUM7UUFHaEIsVUFBSyxHQUFHLElBQUksR0FBRyxFQUF1QyxDQUFDO1FBQzlDLG9CQUFlLEdBQUcsSUFBSSxHQUFHLEVBQXFDLENBQUM7UUFlL0UsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLGNBQWMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDO1FBQ3BELElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDO1FBQ3BFLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUE0RSxDQUFDO1FBQ3hILElBQUksQ0FBQywwQkFBMEIsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLDBCQUE4RCxDQUFDO1FBRTVH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