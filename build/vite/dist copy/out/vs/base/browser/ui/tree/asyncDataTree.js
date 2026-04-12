/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ElementsDragAndDropData } from '../list/listView.js';
import { ComposedTreeDelegate, TreeFindMode, FindFilter, FindController } from './abstractTree.js';
import { getVisibleState, isFilterResult } from './indexTreeModel.js';
import { CompressibleObjectTree, ObjectTree } from './objectTree.js';
import { ObjectTreeElementCollapseState, TreeError, WeakMapper } from './tree.js';
import { createCancelablePromise, Promises, ThrottledDelayer, timeout } from '../../../common/async.js';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import { isCancellationError, onUnexpectedError } from '../../../common/errors.js';
import { Emitter, Event } from '../../../common/event.js';
import { Iterable } from '../../../common/iterator.js';
import { DisposableStore, dispose, toDisposable } from '../../../common/lifecycle.js';
import { isIterable } from '../../../common/types.js';
import { CancellationTokenSource } from '../../../common/cancellation.js';
import { FuzzyScore } from '../../../common/filters.js';
import { insertInto, splice } from '../../../common/arrays.js';
import { localize } from '../../../../nls.js';
function createAsyncDataTreeNode(props) {
    return {
        ...props,
        children: [],
        refreshPromise: undefined,
        stale: true,
        slow: false,
        forceExpanded: false
    };
}
function isAncestor(ancestor, descendant) {
    if (!descendant.parent) {
        return false;
    }
    else if (descendant.parent === ancestor) {
        return true;
    }
    else {
        return isAncestor(ancestor, descendant.parent);
    }
}
function intersects(node, other) {
    return node === other || isAncestor(node, other) || isAncestor(other, node);
}
class AsyncDataTreeNodeWrapper {
    get element() { return this.node.element.element; }
    get children() { return this.node.children.map(node => new AsyncDataTreeNodeWrapper(node)); }
    get depth() { return this.node.depth; }
    get visibleChildrenCount() { return this.node.visibleChildrenCount; }
    get visibleChildIndex() { return this.node.visibleChildIndex; }
    get collapsible() { return this.node.collapsible; }
    get collapsed() { return this.node.collapsed; }
    get visible() { return this.node.visible; }
    get filterData() { return this.node.filterData; }
    constructor(node) {
        this.node = node;
    }
}
class AsyncDataTreeRenderer {
    constructor(renderer, nodeMapper, onDidChangeTwistieState) {
        this.renderer = renderer;
        this.nodeMapper = nodeMapper;
        this.onDidChangeTwistieState = onDidChangeTwistieState;
        this.renderedNodes = new Map();
        this.templateId = renderer.templateId;
    }
    renderTemplate(container) {
        const templateData = this.renderer.renderTemplate(container);
        return { templateData };
    }
    renderElement(node, index, templateData, details) {
        this.renderer.renderElement(this.nodeMapper.map(node), index, templateData.templateData, details);
    }
    renderTwistie(element, twistieElement) {
        if (element.slow) {
            twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
            return true;
        }
        else {
            twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
            return false;
        }
    }
    disposeElement(node, index, templateData, details) {
        this.renderer.disposeElement?.(this.nodeMapper.map(node), index, templateData.templateData, details);
    }
    disposeTemplate(templateData) {
        this.renderer.disposeTemplate(templateData.templateData);
    }
    dispose() {
        this.renderedNodes.clear();
    }
}
function asTreeEvent(e) {
    return {
        browserEvent: e.browserEvent,
        elements: e.elements.map(e => e.element)
    };
}
function asTreeMouseEvent(e) {
    return {
        browserEvent: e.browserEvent,
        element: e.element && e.element.element,
        target: e.target
    };
}
function asTreeContextMenuEvent(e) {
    return {
        browserEvent: e.browserEvent,
        element: e.element && e.element.element,
        anchor: e.anchor,
        isStickyScroll: e.isStickyScroll
    };
}
class AsyncDataTreeElementsDragAndDropData extends ElementsDragAndDropData {
    set context(context) {
        this.data.context = context;
    }
    get context() {
        return this.data.context;
    }
    constructor(data) {
        super(data.elements.map(node => node.element));
        this.data = data;
    }
}
function asAsyncDataTreeDragAndDropData(data) {
    if (data instanceof ElementsDragAndDropData) {
        return new AsyncDataTreeElementsDragAndDropData(data);
    }
    return data;
}
class AsyncDataTreeNodeListDragAndDrop {
    constructor(dnd) {
        this.dnd = dnd;
    }
    getDragURI(node) {
        return this.dnd.getDragURI(node.element);
    }
    getDragLabel(nodes, originalEvent) {
        if (this.dnd.getDragLabel) {
            return this.dnd.getDragLabel(nodes.map(node => node.element), originalEvent);
        }
        return undefined;
    }
    onDragStart(data, originalEvent) {
        this.dnd.onDragStart?.(asAsyncDataTreeDragAndDropData(data), originalEvent);
    }
    onDragOver(data, targetNode, targetIndex, targetSector, originalEvent, raw = true) {
        return this.dnd.onDragOver(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
    }
    drop(data, targetNode, targetIndex, targetSector, originalEvent) {
        this.dnd.drop(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
    }
    onDragEnd(originalEvent) {
        this.dnd.onDragEnd?.(originalEvent);
    }
    dispose() {
        this.dnd.dispose();
    }
}
class AsyncFindFilter extends FindFilter {
    constructor(findProvider, // remove public
    keyboardNavigationLabelProvider, filter) {
        super(keyboardNavigationLabelProvider, filter);
        this.findProvider = findProvider;
        this.isFindSessionActive = false;
    }
    filter(element, parentVisibility) {
        const filterResult = super.filter(element, parentVisibility);
        if (!this.isFindSessionActive || this.findMode === TreeFindMode.Highlight || !this.findProvider.isVisible) {
            return filterResult;
        }
        const visibility = isFilterResult(filterResult) ? filterResult.visibility : filterResult;
        if (getVisibleState(visibility) === 0 /* TreeVisibility.Hidden */) {
            return 0 /* TreeVisibility.Hidden */;
        }
        return this.findProvider.isVisible(element) ? filterResult : 0 /* TreeVisibility.Hidden */;
    }
}
// TODO Fix types
class AsyncFindController extends FindController {
    constructor(tree, findProvider, filter, contextViewProvider, options) {
        super(tree, filter, contextViewProvider, options);
        this.findProvider = findProvider;
        this.filter = filter;
        this.activeSession = false;
        this.asyncWorkInProgress = false;
        this.taskQueue = new ThrottledDelayer(250);
        // Always make sure to end the session before disposing
        this.disposables.add(toDisposable(async () => {
            if (this.activeSession) {
                await this.findProvider.endSession?.();
            }
        }));
    }
    applyPattern(_pattern) {
        this.renderMessage(false);
        this.activeTokenSource?.cancel();
        this.activeTokenSource = new CancellationTokenSource();
        this.taskQueue.trigger(() => this.applyPatternAsync());
    }
    async applyPatternAsync() {
        const token = this.activeTokenSource?.token;
        if (!token || token.isCancellationRequested) {
            return;
        }
        const pattern = this.pattern;
        if (pattern === '') {
            if (this.activeSession) {
                this.asyncWorkInProgress = true;
                await this.deactivateFindSession();
                this.asyncWorkInProgress = false;
                if (!token.isCancellationRequested) {
                    this.filter.reset();
                    super.applyPattern('');
                }
            }
            return;
        }
        if (!this.activeSession) {
            this.activateFindSession();
        }
        this.asyncWorkInProgress = true;
        this.activeFindMetadata = undefined;
        const findMetadata = await this.findProvider.find(pattern, { matchType: this.matchType, findMode: this.mode }, token);
        if (token.isCancellationRequested || findMetadata === undefined) {
            return;
        }
        this.asyncWorkInProgress = false;
        this.activeFindMetadata = findMetadata;
        this.filter.reset();
        super.applyPattern(pattern);
        if (findMetadata.warningMessage) {
            this.renderMessage(true, findMetadata.warningMessage);
        }
    }
    activateFindSession() {
        this.activeSession = true;
        this.filter.isFindSessionActive = true;
        this.findProvider.startSession?.();
    }
    async deactivateFindSession() {
        this.activeSession = false;
        this.filter.isFindSessionActive = false;
        await this.findProvider.endSession?.();
    }
    render() {
        if (this.asyncWorkInProgress || !this.activeFindMetadata) {
            return;
        }
        const showNotFound = this.activeFindMetadata.matchCount === 0 && this.pattern.length > 0;
        this.renderMessage(showNotFound);
        if (this.pattern.length) {
            this.alertResults(this.activeFindMetadata.matchCount);
        }
    }
    onDidToggleChange(e) {
        // TODO@benibenj handle toggles nicely across all controllers and between controller and filter
        this.toggles.set(e.id, e.isChecked);
        this.filter.findMode = this.mode;
        this.filter.findMatchType = this.matchType;
        this.placeholder = this.mode === TreeFindMode.Filter ? localize('type to filter', "Type to filter") : localize('type to search', "Type to search");
        this.applyPattern(this.pattern);
    }
    shouldAllowFocus(node) {
        return this.shouldFocusWhenNavigating(node);
    }
    shouldFocusWhenNavigating(node) {
        if (!this.activeSession || !this.activeFindMetadata) {
            return true;
        }
        const element = node.element?.element;
        if (element && this.activeFindMetadata.isMatch(element)) {
            return true;
        }
        return !FuzzyScore.isDefault(node.filterData);
    }
}
function asObjectTreeOptions(options) {
    return options && {
        ...options,
        collapseByDefault: true,
        identityProvider: options.identityProvider && {
            getId(el) {
                return options.identityProvider.getId(el.element);
            },
            getGroupId: options.identityProvider.getGroupId ? (el) => {
                return options.identityProvider.getGroupId(el.element);
            } : undefined
        },
        dnd: options.dnd && new AsyncDataTreeNodeListDragAndDrop(options.dnd),
        multipleSelectionController: options.multipleSelectionController && {
            isSelectionSingleChangeEvent(e) {
                // eslint-disable-next-line local/code-no-dangerous-type-assertions
                return options.multipleSelectionController.isSelectionSingleChangeEvent({ ...e, element: e.element });
            },
            isSelectionRangeChangeEvent(e) {
                // eslint-disable-next-line local/code-no-dangerous-type-assertions
                return options.multipleSelectionController.isSelectionRangeChangeEvent({ ...e, element: e.element });
            }
        },
        accessibilityProvider: options.accessibilityProvider && {
            ...options.accessibilityProvider,
            getPosInSet: undefined,
            getSetSize: undefined,
            getRole: options.accessibilityProvider.getRole ? (el) => {
                return options.accessibilityProvider.getRole(el.element);
            } : () => 'treeitem',
            isChecked: options.accessibilityProvider.isChecked ? (e) => {
                return !!(options.accessibilityProvider?.isChecked(e.element));
            } : undefined,
            getAriaLabel(e) {
                return options.accessibilityProvider.getAriaLabel(e.element);
            },
            getWidgetAriaLabel() {
                return options.accessibilityProvider.getWidgetAriaLabel();
            },
            getWidgetRole: options.accessibilityProvider.getWidgetRole ? () => options.accessibilityProvider.getWidgetRole() : () => 'tree',
            getAriaLevel: options.accessibilityProvider.getAriaLevel && (node => {
                return options.accessibilityProvider.getAriaLevel(node.element);
            }),
            getActiveDescendantId: options.accessibilityProvider.getActiveDescendantId && (node => {
                return options.accessibilityProvider.getActiveDescendantId(node.element);
            })
        },
        filter: options.filter && {
            filter(e, parentVisibility) {
                return options.filter.filter(e.element, parentVisibility);
            }
        },
        keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
            ...options.keyboardNavigationLabelProvider,
            getKeyboardNavigationLabel(e) {
                return options.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(e.element);
            }
        },
        sorter: undefined,
        expandOnlyOnTwistieClick: typeof options.expandOnlyOnTwistieClick === 'undefined' ? undefined : (typeof options.expandOnlyOnTwistieClick !== 'function' ? options.expandOnlyOnTwistieClick : ((e) => options.expandOnlyOnTwistieClick(e.element))),
        twistieAdditionalCssClass: typeof options.twistieAdditionalCssClass === 'undefined' ? undefined : ((e) => options.twistieAdditionalCssClass(e.element)),
        defaultFindVisibility: (e) => {
            if (e.hasChildren && e.stale) {
                return 1 /* TreeVisibility.Visible */;
            }
            else if (typeof options.defaultFindVisibility === 'number') {
                return options.defaultFindVisibility;
            }
            else if (typeof options.defaultFindVisibility === 'undefined') {
                return 2 /* TreeVisibility.Recurse */;
            }
            else {
                return options.defaultFindVisibility(e.element);
            }
        },
        stickyScrollDelegate: options.stickyScrollDelegate
    };
}
function dfs(node, fn) {
    fn(node);
    node.children.forEach(child => dfs(child, fn));
}
export class AsyncDataTree {
    get onDidScroll() { return this.tree.onDidScroll; }
    get onDidChangeFocus() { return Event.map(this.tree.onDidChangeFocus, asTreeEvent); }
    get onDidChangeSelection() { return Event.map(this.tree.onDidChangeSelection, asTreeEvent); }
    get onKeyDown() { return this.tree.onKeyDown; }
    get onMouseClick() { return Event.map(this.tree.onMouseClick, asTreeMouseEvent); }
    get onMouseDblClick() { return Event.map(this.tree.onMouseDblClick, asTreeMouseEvent); }
    get onContextMenu() { return Event.map(this.tree.onContextMenu, asTreeContextMenuEvent); }
    get onTap() { return Event.map(this.tree.onTap, asTreeMouseEvent); }
    get onPointer() { return Event.map(this.tree.onPointer, asTreeMouseEvent); }
    get onDidFocus() { return this.tree.onDidFocus; }
    get onDidBlur() { return this.tree.onDidBlur; }
    /**
     * To be used internally only!
     * @deprecated
     */
    get onDidChangeModel() { return this.tree.onDidChangeModel; }
    get onDidChangeCollapseState() { return this.tree.onDidChangeCollapseState; }
    get onDidUpdateOptions() { return this.tree.onDidUpdateOptions; }
    get onDidChangeStickyScrollFocused() { return this.tree.onDidChangeStickyScrollFocused; }
    get findMode() { return this.findController ? this.findController.mode : this.tree.findMode; }
    set findMode(mode) { this.findController ? this.findController.mode = mode : this.tree.findMode = mode; }
    get findMatchType() { return this.findController ? this.findController.matchType : this.tree.findMatchType; }
    set findMatchType(matchType) { this.findController ? this.findController.matchType = matchType : this.tree.findMatchType = matchType; }
    get expandOnlyOnTwistieClick() {
        if (typeof this.tree.expandOnlyOnTwistieClick === 'boolean') {
            return this.tree.expandOnlyOnTwistieClick;
        }
        const fn = this.tree.expandOnlyOnTwistieClick;
        return element => fn(this.nodes.get((element === this.root.element ? null : element)) || null);
    }
    get onDidDispose() { return this.tree.onDidDispose; }
    constructor(user, container, delegate, renderers, dataSource, options = {}) {
        this.user = user;
        this.dataSource = dataSource;
        this.nodes = new Map();
        this.subTreeRefreshPromises = new Map();
        this.refreshPromises = new Map();
        this._onDidRender = new Emitter();
        this._onDidChangeNodeSlowState = new Emitter();
        this.nodeMapper = new WeakMapper(node => new AsyncDataTreeNodeWrapper(node));
        this.disposables = new DisposableStore();
        this.identityProvider = options.identityProvider;
        this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === 'undefined' ? false : options.autoExpandSingleChildren;
        this.sorter = options.sorter;
        this.getDefaultCollapseState = e => options.collapseByDefault ? (options.collapseByDefault(e) ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded) : undefined;
        let asyncFindEnabled = false;
        let findFilter;
        if (options.findProvider && (options.findWidgetEnabled ?? true) && options.keyboardNavigationLabelProvider && options.contextViewProvider) {
            asyncFindEnabled = true;
            findFilter = new AsyncFindFilter(options.findProvider, options.keyboardNavigationLabelProvider, options.filter);
        }
        this.tree = this.createTree(user, container, delegate, renderers, { ...options, findWidgetEnabled: !asyncFindEnabled, filter: findFilter ?? options.filter });
        this.root = createAsyncDataTreeNode({
            element: undefined,
            parent: null,
            hasChildren: true,
            defaultCollapseState: undefined
        });
        if (this.identityProvider) {
            this.root = {
                ...this.root,
                id: null
            };
        }
        this.nodes.set(null, this.root);
        this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);
        if (asyncFindEnabled) {
            const findOptions = {
                styles: options.findWidgetStyles,
                showNotFoundMessage: options.showNotFoundMessage,
                defaultFindMatchType: options.defaultFindMatchType,
                defaultFindMode: options.defaultFindMode,
            };
            this.findController = this.disposables.add(new AsyncFindController(this.tree, options.findProvider, findFilter, this.tree.options.contextViewProvider, findOptions));
            this.focusNavigationFilter = node => this.findController.shouldFocusWhenNavigating(node);
            this.onDidChangeFindOpenState = this.findController.onDidChangeOpenState;
            this.onDidChangeFindMode = this.findController.onDidChangeMode;
            this.onDidChangeFindMatchType = this.findController.onDidChangeMatchType;
        }
        else {
            this.onDidChangeFindOpenState = this.tree.onDidChangeFindOpenState;
            this.onDidChangeFindMode = this.tree.onDidChangeFindMode;
            this.onDidChangeFindMatchType = this.tree.onDidChangeFindMatchType;
        }
    }
    createTree(user, container, delegate, renderers, options) {
        const objectTreeDelegate = new ComposedTreeDelegate(delegate);
        const objectTreeRenderers = renderers.map(r => new AsyncDataTreeRenderer(r, this.nodeMapper, this._onDidChangeNodeSlowState.event));
        const objectTreeOptions = asObjectTreeOptions(options) || {};
        return new ObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
    }
    updateOptions(optionsUpdate = {}) {
        if (this.findController) {
            if (optionsUpdate.defaultFindMode !== undefined) {
                this.findController.mode = optionsUpdate.defaultFindMode;
            }
            if (optionsUpdate.defaultFindMatchType !== undefined) {
                this.findController.matchType = optionsUpdate.defaultFindMatchType;
            }
        }
        this.tree.updateOptions(optionsUpdate);
    }
    get options() {
        return this.tree.options;
    }
    // Widget
    getHTMLElement() {
        return this.tree.getHTMLElement();
    }
    get contentHeight() {
        return this.tree.contentHeight;
    }
    get contentWidth() {
        return this.tree.contentWidth;
    }
    get onDidChangeContentHeight() {
        return this.tree.onDidChangeContentHeight;
    }
    get onDidChangeContentWidth() {
        return this.tree.onDidChangeContentWidth;
    }
    get scrollTop() {
        return this.tree.scrollTop;
    }
    set scrollTop(scrollTop) {
        this.tree.scrollTop = scrollTop;
    }
    get scrollLeft() {
        return this.tree.scrollLeft;
    }
    set scrollLeft(scrollLeft) {
        this.tree.scrollLeft = scrollLeft;
    }
    get scrollHeight() {
        return this.tree.scrollHeight;
    }
    get renderHeight() {
        return this.tree.renderHeight;
    }
    get lastVisibleElement() {
        return this.tree.lastVisibleElement.element;
    }
    get ariaLabel() {
        return this.tree.ariaLabel;
    }
    set ariaLabel(value) {
        this.tree.ariaLabel = value;
    }
    domFocus() {
        this.tree.domFocus();
    }
    isDOMFocused() {
        return this.tree.isDOMFocused();
    }
    navigate(start) {
        let startNode;
        if (start) {
            startNode = this.getDataNode(start);
        }
        return new AsyncDataTreeNavigator(this.tree.navigate(startNode));
    }
    layout(height, width) {
        this.tree.layout(height, width);
    }
    style(styles) {
        this.tree.style(styles);
    }
    // Model
    getInput() {
        return this.root.element;
    }
    async setInput(input, viewState) {
        this.cancelAllRefreshPromises();
        this.root.element = input;
        const viewStateContext = viewState && { viewState, focus: [], selection: [] };
        await this._updateChildren(input, true, false, viewStateContext);
        if (viewStateContext) {
            this.tree.setFocus(viewStateContext.focus);
            this.tree.setSelection(viewStateContext.selection);
        }
        if (viewState && typeof viewState.scrollTop === 'number') {
            this.scrollTop = viewState.scrollTop;
        }
    }
    async updateChildren(element = this.root.element, recursive = true, rerender = false, options) {
        await this._updateChildren(element, recursive, rerender, undefined, options);
    }
    cancelAllRefreshPromises(includeSubTrees = false) {
        this.refreshPromises.forEach(promise => promise.cancel());
        this.refreshPromises.clear();
        if (includeSubTrees) {
            this.subTreeRefreshPromises.forEach(promise => promise.cancel());
            this.subTreeRefreshPromises.clear();
        }
    }
    async _updateChildren(element = this.root.element, recursive = true, rerender = false, viewStateContext, options) {
        if (typeof this.root.element === 'undefined') {
            throw new TreeError(this.user, 'Tree input not set');
        }
        if (this.root.refreshPromise) {
            await this.root.refreshPromise;
            await Event.toPromise(this._onDidRender.event);
        }
        const node = this.getDataNode(element);
        await this.refreshAndRenderNode(node, recursive, viewStateContext, options);
        if (rerender) {
            try {
                this.tree.rerender(node);
            }
            catch {
                // missing nodes are fine, this could've resulted from
                // parallel refresh calls, removing `node` altogether
            }
        }
    }
    resort(element = this.root.element, recursive = true) {
        this.tree.resort(this.getDataNode(element), recursive);
    }
    hasNode(element) {
        return element === this.root.element || this.nodes.has(element);
    }
    // View
    rerender(element) {
        if (element === undefined || element === this.root.element) {
            this.tree.rerender();
            return;
        }
        const node = this.getDataNode(element);
        this.tree.rerender(node);
    }
    updateElementHeight(element, height) {
        const node = this.getDataNode(element);
        this.tree.updateElementHeight(node, height);
    }
    updateWidth(element) {
        const node = this.getDataNode(element);
        this.tree.updateWidth(node);
    }
    // Tree
    getNode(element = this.root.element) {
        const dataNode = this.getDataNode(element);
        const node = this.tree.getNode(dataNode === this.root ? null : dataNode);
        return this.nodeMapper.map(node);
    }
    collapse(element, recursive = false) {
        const node = this.getDataNode(element);
        return this.tree.collapse(node === this.root ? null : node, recursive);
    }
    async expand(element, recursive = false) {
        if (typeof this.root.element === 'undefined') {
            throw new TreeError(this.user, 'Tree input not set');
        }
        if (this.root.refreshPromise) {
            await this.root.refreshPromise;
            await Event.toPromise(this._onDidRender.event);
        }
        const node = this.getDataNode(element);
        if (this.tree.hasElement(node) && !this.tree.isCollapsible(node)) {
            return false;
        }
        if (node.refreshPromise) {
            await node.refreshPromise;
            await Event.toPromise(this._onDidRender.event);
        }
        if (node !== this.root && !node.refreshPromise && !this.tree.isCollapsed(node)) {
            return false;
        }
        const result = this.tree.expand(node === this.root ? null : node, recursive);
        if (node.refreshPromise) {
            await node.refreshPromise;
            await Event.toPromise(this._onDidRender.event);
        }
        return result;
    }
    toggleCollapsed(element, recursive = false) {
        return this.tree.toggleCollapsed(this.getDataNode(element), recursive);
    }
    expandAll() {
        this.tree.expandAll();
    }
    async expandTo(element) {
        if (!this.dataSource.getParent) {
            throw new Error('Can\'t expand to element without getParent method');
        }
        const elements = [];
        while (!this.hasNode(element)) {
            element = this.dataSource.getParent(element);
            if (element !== this.root.element) {
                elements.push(element);
            }
        }
        for (const element of Iterable.reverse(elements)) {
            await this.expand(element);
        }
        this.tree.expandTo(this.getDataNode(element));
    }
    collapseAll() {
        this.tree.collapseAll();
    }
    isCollapsible(element) {
        return this.tree.isCollapsible(this.getDataNode(element));
    }
    isCollapsed(element) {
        return this.tree.isCollapsed(this.getDataNode(element));
    }
    triggerTypeNavigation() {
        this.tree.triggerTypeNavigation();
    }
    openFind() {
        if (this.findController) {
            this.findController.open();
        }
        else {
            this.tree.openFind();
        }
    }
    closeFind() {
        if (this.findController) {
            this.findController.close();
        }
        else {
            this.tree.closeFind();
        }
    }
    refilter() {
        this.tree.refilter();
    }
    setAnchor(element) {
        this.tree.setAnchor(typeof element === 'undefined' ? undefined : this.getDataNode(element));
    }
    getAnchor() {
        const node = this.tree.getAnchor();
        return node?.element;
    }
    setSelection(elements, browserEvent) {
        const nodes = elements.map(e => this.getDataNode(e));
        this.tree.setSelection(nodes, browserEvent);
    }
    getSelection() {
        const nodes = this.tree.getSelection();
        return nodes.map(n => n.element);
    }
    setFocus(elements, browserEvent) {
        const nodes = elements.map(e => this.getDataNode(e));
        this.tree.setFocus(nodes, browserEvent);
    }
    focusNext(n = 1, loop = false, browserEvent) {
        this.tree.focusNext(n, loop, browserEvent, this.focusNavigationFilter);
    }
    focusPrevious(n = 1, loop = false, browserEvent) {
        this.tree.focusPrevious(n, loop, browserEvent, this.focusNavigationFilter);
    }
    focusNextPage(browserEvent) {
        return this.tree.focusNextPage(browserEvent, this.focusNavigationFilter);
    }
    focusPreviousPage(browserEvent) {
        return this.tree.focusPreviousPage(browserEvent, this.focusNavigationFilter);
    }
    focusLast(browserEvent) {
        this.tree.focusLast(browserEvent, this.focusNavigationFilter);
    }
    focusFirst(browserEvent) {
        this.tree.focusFirst(browserEvent, this.focusNavigationFilter);
    }
    getFocus() {
        const nodes = this.tree.getFocus();
        return nodes.map(n => n.element);
    }
    getStickyScrollFocus() {
        const nodes = this.tree.getStickyScrollFocus();
        return nodes.map(n => n.element);
    }
    getFocusedPart() {
        return this.tree.getFocusedPart();
    }
    reveal(element, relativeTop) {
        this.tree.reveal(this.getDataNode(element), relativeTop);
    }
    getRelativeTop(element) {
        return this.tree.getRelativeTop(this.getDataNode(element));
    }
    // Tree navigation
    getParentElement(element) {
        const node = this.tree.getParentElement(this.getDataNode(element));
        return (node && node.element);
    }
    getFirstElementChild(element = this.root.element) {
        const dataNode = this.getDataNode(element);
        const node = this.tree.getFirstElementChild(dataNode === this.root ? null : dataNode);
        return (node && node.element);
    }
    // Implementation
    getDataNode(element) {
        const node = this.nodes.get((element === this.root.element ? null : element));
        if (!node) {
            const nodeIdentity = this.identityProvider?.getId(element).toString();
            throw new TreeError(this.user, `Data tree node not found${nodeIdentity ? `: ${nodeIdentity}` : ''}`);
        }
        return node;
    }
    async refreshAndRenderNode(node, recursive, viewStateContext, options) {
        if (this.disposables.isDisposed) {
            return; // tree disposed during refresh, again (#228211)
        }
        await this.refreshNode(node, recursive, viewStateContext);
        if (this.disposables.isDisposed) {
            return; // tree disposed during refresh (#199264)
        }
        this.render(node, viewStateContext, options);
    }
    async refreshNode(node, recursive, viewStateContext) {
        let result;
        this.subTreeRefreshPromises.forEach((refreshPromise, refreshNode) => {
            if (!result && intersects(refreshNode, node)) {
                result = refreshPromise.then(() => this.refreshNode(node, recursive, viewStateContext));
            }
        });
        if (result) {
            return result;
        }
        if (node !== this.root) {
            const treeNode = this.tree.getNode(node);
            if (treeNode.collapsed) {
                node.hasChildren = !!this.dataSource.hasChildren(node.element);
                node.stale = true;
                this.setChildren(node, [], recursive, viewStateContext);
                return;
            }
        }
        return this.doRefreshSubTree(node, recursive, viewStateContext);
    }
    async doRefreshSubTree(node, recursive, viewStateContext) {
        const cancelablePromise = createCancelablePromise(async () => {
            const childrenToRefresh = await this.doRefreshNode(node, recursive, viewStateContext);
            node.stale = false;
            await Promises.settled(childrenToRefresh.map(child => this.doRefreshSubTree(child, recursive, viewStateContext)));
        });
        node.refreshPromise = cancelablePromise;
        this.subTreeRefreshPromises.set(node, cancelablePromise);
        cancelablePromise.finally(() => {
            node.refreshPromise = undefined;
            this.subTreeRefreshPromises.delete(node);
        });
        return cancelablePromise;
    }
    async doRefreshNode(node, recursive, viewStateContext) {
        node.hasChildren = !!this.dataSource.hasChildren(node.element);
        let childrenPromise;
        if (!node.hasChildren) {
            childrenPromise = Promise.resolve(Iterable.empty());
        }
        else {
            const children = this.doGetChildren(node);
            if (isIterable(children)) {
                childrenPromise = Promise.resolve(children);
            }
            else {
                const slowTimeout = timeout(800);
                slowTimeout.then(() => {
                    node.slow = true;
                    this._onDidChangeNodeSlowState.fire(node);
                }, _ => null);
                childrenPromise = children.finally(() => slowTimeout.cancel());
            }
        }
        try {
            const children = await childrenPromise;
            return this.setChildren(node, children, recursive, viewStateContext);
        }
        catch (err) {
            if (node !== this.root && this.tree.hasElement(node)) {
                this.tree.collapse(node);
            }
            if (isCancellationError(err)) {
                return [];
            }
            throw err;
        }
        finally {
            if (node.slow) {
                node.slow = false;
                this._onDidChangeNodeSlowState.fire(node);
            }
        }
    }
    doGetChildren(node) {
        let result = this.refreshPromises.get(node);
        if (result) {
            return result;
        }
        const children = this.dataSource.getChildren(node.element);
        if (isIterable(children)) {
            return this.processChildren(children);
        }
        else {
            result = createCancelablePromise(async () => this.processChildren(await children));
            this.refreshPromises.set(node, result);
            return result.finally(() => { this.refreshPromises.delete(node); });
        }
    }
    _onDidChangeCollapseState({ node, deep }) {
        if (node.element === null) {
            return;
        }
        if (!node.collapsed && node.element.stale) {
            if (deep) {
                this.collapse(node.element.element);
            }
            else {
                this.refreshAndRenderNode(node.element, false)
                    .catch(onUnexpectedError);
            }
        }
    }
    setChildren(node, childrenElementsIterable, recursive, viewStateContext) {
        const childrenElements = [...childrenElementsIterable];
        // perf: if the node was and still is a leaf, avoid all this hassle
        if (node.children.length === 0 && childrenElements.length === 0) {
            return [];
        }
        const nodesToForget = new Map();
        const childrenTreeNodesById = new Map();
        for (const child of node.children) {
            nodesToForget.set(child.element, child);
            if (this.identityProvider) {
                childrenTreeNodesById.set(child.id, { node: child, collapsed: this.tree.hasElement(child) && this.tree.isCollapsed(child) });
            }
        }
        const childrenToRefresh = [];
        const children = childrenElements.map(element => {
            const hasChildren = !!this.dataSource.hasChildren(element);
            if (!this.identityProvider) {
                const asyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });
                if (hasChildren && asyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
                    childrenToRefresh.push(asyncDataTreeNode);
                }
                return asyncDataTreeNode;
            }
            const id = this.identityProvider.getId(element).toString();
            const result = childrenTreeNodesById.get(id);
            if (result) {
                const asyncDataTreeNode = result.node;
                nodesToForget.delete(asyncDataTreeNode.element);
                this.nodes.delete(asyncDataTreeNode.element);
                this.nodes.set(element, asyncDataTreeNode);
                asyncDataTreeNode.element = element;
                asyncDataTreeNode.hasChildren = hasChildren;
                if (recursive) {
                    if (result.collapsed) {
                        asyncDataTreeNode.children.forEach(node => dfs(node, node => this.nodes.delete(node.element)));
                        asyncDataTreeNode.children.splice(0, asyncDataTreeNode.children.length);
                        asyncDataTreeNode.stale = true;
                    }
                    else {
                        childrenToRefresh.push(asyncDataTreeNode);
                    }
                }
                else if (hasChildren && !result.collapsed) {
                    childrenToRefresh.push(asyncDataTreeNode);
                }
                return asyncDataTreeNode;
            }
            const childAsyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, id, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });
            if (viewStateContext && viewStateContext.viewState.focus && viewStateContext.viewState.focus.indexOf(id) > -1) {
                viewStateContext.focus.push(childAsyncDataTreeNode);
            }
            if (viewStateContext && viewStateContext.viewState.selection && viewStateContext.viewState.selection.indexOf(id) > -1) {
                viewStateContext.selection.push(childAsyncDataTreeNode);
            }
            if (viewStateContext && viewStateContext.viewState.expanded && viewStateContext.viewState.expanded.indexOf(id) > -1) {
                childrenToRefresh.push(childAsyncDataTreeNode);
            }
            else if (hasChildren && childAsyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
                childrenToRefresh.push(childAsyncDataTreeNode);
            }
            return childAsyncDataTreeNode;
        });
        for (const node of nodesToForget.values()) {
            dfs(node, node => this.nodes.delete(node.element));
        }
        for (const child of children) {
            this.nodes.set(child.element, child);
        }
        splice(node.children, 0, node.children.length, children);
        // TODO@joao this doesn't take filter into account
        if (node !== this.root && this.autoExpandSingleChildren && children.length === 1 && childrenToRefresh.length === 0) {
            children[0].forceExpanded = true;
            childrenToRefresh.push(children[0]);
        }
        return childrenToRefresh;
    }
    render(node, viewStateContext, options) {
        const children = node.children.map(node => this.asTreeElement(node, viewStateContext));
        const objectTreeOptions = options && {
            ...options,
            diffIdentityProvider: options.diffIdentityProvider && {
                getId(node) {
                    return options.diffIdentityProvider.getId(node.element);
                },
                getGroupId: options.diffIdentityProvider.getGroupId ? (node) => {
                    return options.diffIdentityProvider.getGroupId(node.element);
                } : undefined
            }
        };
        this.tree.setChildren(node === this.root ? null : node, children, objectTreeOptions);
        if (node !== this.root) {
            this.tree.setCollapsible(node, node.hasChildren);
        }
        this._onDidRender.fire();
    }
    asTreeElement(node, viewStateContext) {
        if (node.stale) {
            return {
                element: node,
                collapsible: node.hasChildren,
                collapsed: true
            };
        }
        let collapsed;
        if (viewStateContext && viewStateContext.viewState.expanded && node.id && viewStateContext.viewState.expanded.indexOf(node.id) > -1) {
            collapsed = false;
        }
        else if (node.forceExpanded) {
            collapsed = false;
            node.forceExpanded = false;
        }
        else {
            collapsed = node.defaultCollapseState;
        }
        return {
            element: node,
            children: node.hasChildren ? Iterable.map(node.children, child => this.asTreeElement(child, viewStateContext)) : [],
            collapsible: node.hasChildren,
            collapsed
        };
    }
    processChildren(children) {
        if (this.sorter) {
            children = [...children].sort(this.sorter.compare.bind(this.sorter));
        }
        return children;
    }
    // view state
    getViewState() {
        if (!this.identityProvider) {
            throw new TreeError(this.user, 'Can\'t get tree view state without an identity provider');
        }
        const getId = (element) => this.identityProvider.getId(element).toString();
        const focus = this.getFocus().map(getId);
        const selection = this.getSelection().map(getId);
        const expanded = [];
        const root = this.tree.getNode();
        const stack = [root];
        while (stack.length > 0) {
            const node = stack.pop();
            if (node !== root && node.collapsible && !node.collapsed) {
                expanded.push(getId(node.element.element));
            }
            insertInto(stack, stack.length, node.children);
        }
        return { focus, selection, expanded, scrollTop: this.scrollTop };
    }
    dispose() {
        this._onDidRender.dispose();
        this._onDidChangeNodeSlowState.dispose();
        this.disposables.dispose();
        this.tree.dispose();
    }
}
class CompressibleAsyncDataTreeNodeWrapper {
    get element() {
        return {
            elements: this.node.element.elements.map(e => e.element),
            incompressible: this.node.element.incompressible
        };
    }
    get children() { return this.node.children.map(node => new CompressibleAsyncDataTreeNodeWrapper(node)); }
    get depth() { return this.node.depth; }
    get visibleChildrenCount() { return this.node.visibleChildrenCount; }
    get visibleChildIndex() { return this.node.visibleChildIndex; }
    get collapsible() { return this.node.collapsible; }
    get collapsed() { return this.node.collapsed; }
    get visible() { return this.node.visible; }
    get filterData() { return this.node.filterData; }
    constructor(node) {
        this.node = node;
    }
}
class CompressibleAsyncDataTreeRenderer {
    constructor(renderer, nodeMapper, compressibleNodeMapperProvider, onDidChangeTwistieState) {
        this.renderer = renderer;
        this.nodeMapper = nodeMapper;
        this.compressibleNodeMapperProvider = compressibleNodeMapperProvider;
        this.onDidChangeTwistieState = onDidChangeTwistieState;
        this.renderedNodes = new Map();
        this.disposables = [];
        this.templateId = renderer.templateId;
    }
    renderTemplate(container) {
        const templateData = this.renderer.renderTemplate(container);
        return { templateData };
    }
    renderElement(node, index, templateData, details) {
        this.renderer.renderElement(this.nodeMapper.map(node), index, templateData.templateData, details);
    }
    renderCompressedElements(node, index, templateData, details) {
        this.renderer.renderCompressedElements(this.compressibleNodeMapperProvider().map(node), index, templateData.templateData, details);
    }
    renderTwistie(element, twistieElement) {
        if (element.slow) {
            twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
            return true;
        }
        else {
            twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
            return false;
        }
    }
    disposeElement(node, index, templateData, details) {
        this.renderer.disposeElement?.(this.nodeMapper.map(node), index, templateData.templateData, details);
    }
    disposeCompressedElements(node, index, templateData, details) {
        this.renderer.disposeCompressedElements?.(this.compressibleNodeMapperProvider().map(node), index, templateData.templateData, details);
    }
    disposeTemplate(templateData) {
        this.renderer.disposeTemplate(templateData.templateData);
    }
    dispose() {
        this.renderedNodes.clear();
        this.disposables = dispose(this.disposables);
    }
}
function asCompressibleObjectTreeOptions(options) {
    const objectTreeOptions = options && asObjectTreeOptions(options);
    return objectTreeOptions && {
        ...objectTreeOptions,
        keyboardNavigationLabelProvider: objectTreeOptions.keyboardNavigationLabelProvider && {
            ...objectTreeOptions.keyboardNavigationLabelProvider,
            getCompressedNodeKeyboardNavigationLabel(els) {
                return options.keyboardNavigationLabelProvider.getCompressedNodeKeyboardNavigationLabel(els.map(e => e.element));
            }
        },
        stickyScrollDelegate: objectTreeOptions.stickyScrollDelegate
    };
}
export class CompressibleAsyncDataTree extends AsyncDataTree {
    constructor(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, options = {}) {
        super(user, container, virtualDelegate, renderers, dataSource, options);
        this.compressionDelegate = compressionDelegate;
        this.compressibleNodeMapper = new WeakMapper(node => new CompressibleAsyncDataTreeNodeWrapper(node));
        this.filter = options.filter;
    }
    getCompressedTreeNode(e) {
        const node = this.getDataNode(e);
        return this.tree.getCompressedTreeNode(node).element;
    }
    createTree(user, container, delegate, renderers, options) {
        const objectTreeDelegate = new ComposedTreeDelegate(delegate);
        const objectTreeRenderers = renderers.map(r => new CompressibleAsyncDataTreeRenderer(r, this.nodeMapper, () => this.compressibleNodeMapper, this._onDidChangeNodeSlowState.event));
        const objectTreeOptions = asCompressibleObjectTreeOptions(options) || {};
        return new CompressibleObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
    }
    asTreeElement(node, viewStateContext) {
        return {
            incompressible: this.compressionDelegate.isIncompressible(node.element),
            ...super.asTreeElement(node, viewStateContext)
        };
    }
    getViewState() {
        if (!this.identityProvider) {
            throw new TreeError(this.user, 'Can\'t get tree view state without an identity provider');
        }
        const getId = (element) => this.identityProvider.getId(element).toString();
        const focus = this.getFocus().map(getId);
        const selection = this.getSelection().map(getId);
        const expanded = [];
        const root = this.tree.getCompressedTreeNode();
        const stack = [root];
        while (stack.length > 0) {
            const node = stack.pop();
            if (node !== root && node.collapsible && !node.collapsed) {
                for (const asyncNode of node.element.elements) {
                    expanded.push(getId(asyncNode.element));
                }
            }
            stack.push(...node.children);
        }
        return { focus, selection, expanded, scrollTop: this.scrollTop };
    }
    render(node, viewStateContext, options) {
        if (!this.identityProvider) {
            return super.render(node, viewStateContext);
        }
        // Preserve traits across compressions. Hacky but does the trick.
        // This is hard to fix properly since it requires rewriting the traits
        // across trees and lists. Let's just keep it this way for now.
        const getId = (element) => this.identityProvider.getId(element).toString();
        const getUncompressedIds = (nodes) => {
            const result = new Set();
            for (const node of nodes) {
                const compressedNode = this.tree.getCompressedTreeNode(node === this.root ? null : node);
                if (!compressedNode.element) {
                    continue;
                }
                for (const node of compressedNode.element.elements) {
                    result.add(getId(node.element));
                }
            }
            return result;
        };
        const oldSelection = getUncompressedIds(this.tree.getSelection());
        const oldFocus = getUncompressedIds(this.tree.getFocus());
        super.render(node, viewStateContext, options);
        const selection = this.getSelection();
        let didChangeSelection = false;
        const focus = this.getFocus();
        let didChangeFocus = false;
        const visit = (node) => {
            const compressedNode = node.element;
            if (compressedNode) {
                for (let i = 0; i < compressedNode.elements.length; i++) {
                    const id = getId(compressedNode.elements[i].element);
                    const element = compressedNode.elements[compressedNode.elements.length - 1].element;
                    // github.com/microsoft/vscode/issues/85938
                    if (oldSelection.has(id) && selection.indexOf(element) === -1) {
                        selection.push(element);
                        didChangeSelection = true;
                    }
                    if (oldFocus.has(id) && focus.indexOf(element) === -1) {
                        focus.push(element);
                        didChangeFocus = true;
                    }
                }
            }
            node.children.forEach(visit);
        };
        visit(this.tree.getCompressedTreeNode(node === this.root ? null : node));
        if (didChangeSelection) {
            this.setSelection(selection);
        }
        if (didChangeFocus) {
            this.setFocus(focus);
        }
    }
    // For compressed async data trees, `TreeVisibility.Recurse` doesn't currently work
    // and we have to filter everything beforehand
    // Related to #85193 and #85835
    processChildren(children) {
        if (this.filter) {
            children = Iterable.filter(children, e => {
                const result = this.filter.filter(e, 1 /* TreeVisibility.Visible */);
                const visibility = getVisibility(result);
                if (visibility === 2 /* TreeVisibility.Recurse */) {
                    throw new Error('Recursive tree visibility not supported in async data compressed trees');
                }
                return visibility === 1 /* TreeVisibility.Visible */;
            });
        }
        return super.processChildren(children);
    }
    navigate(start) {
        // Assumptions are made about how tree navigation works in compressed trees
        // These assumptions may be wrong and we should revisit this when needed
        // Example:	[a, b/ba, ba.txt]
        // - previous(ba) => a
        // - previous(b) => a
        // - next(a) => ba
        // - next(b) => ba
        // - next(ba) => ba.txt
        return super.navigate(start);
    }
}
function getVisibility(filterResult) {
    if (typeof filterResult === 'boolean') {
        return filterResult ? 1 /* TreeVisibility.Visible */ : 0 /* TreeVisibility.Hidden */;
    }
    else if (isFilterResult(filterResult)) {
        return getVisibleState(filterResult.visibility);
    }
    else {
        return getVisibleState(filterResult);
    }
}
class AsyncDataTreeNavigator {
    constructor(navigator) {
        this.navigator = navigator;
    }
    current() {
        const current = this.navigator.current();
        if (current === null) {
            return null;
        }
        return current.element;
    }
    previous() {
        this.navigator.previous();
        return this.current();
    }
    first() {
        this.navigator.first();
        return this.current();
    }
    last() {
        this.navigator.last();
        return this.current();
    }
    next() {
        this.navigator.next();
        return this.current();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN5bmNEYXRhVHJlZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLHVCQUF1QixFQUF3QixNQUFNLHFCQUFxQixDQUFDO0FBRXBGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxZQUFZLEVBQTBHLFVBQVUsRUFBRSxjQUFjLEVBQTJGLE1BQU0sbUJBQW1CLENBQUM7QUFFcFMsT0FBTyxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsc0JBQXNCLEVBQThKLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2pPLE9BQU8sRUFBd08sOEJBQThCLEVBQUUsU0FBUyxFQUFvQyxVQUFVLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDMVYsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDM0gsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNuRixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVuRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sMEJBQTBC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RUFBd0U7UUFFeEUsNkJBQTZCO1FBQzdCLHNCQUFzQjtRQUN0QixxQkFBcUI7UUFDckIsa0JBQWtCO1FBQ2xCLGtCQUFrQjtRQUNsQix1QkFBdUI7UUFDdkIsT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzlCLENBQUM7Q0FDRDtBQUVELFNBQVMsYUFBYSxDQUFjLFlBQTJDO0lBQzlFLElBQUksT0FBTyxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDdkMsT0FBTyxZQUFZLENBQUMsQ0FBQyxnQ0FBd0IsQ0FBQyw4QkFBc0IsQ0FBQztJQUN0RSxDQUFDO1NBQU0sSUFBSSxjQUFjLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztRQUN6QyxPQUFPLGVBQWUsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDakQsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUN0QyxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sc0JBQXNCO0lBRTNCLFlBQW9CLFNBQStEO1FBQS9ELGNBQVMsR0FBVCxTQUFTLENBQXNEO0lBQUksQ0FBQztJQUV4RixPQUFPO1FBQ04sTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN6QyxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUN0QixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQyxPQUFZLENBQUM7SUFDN0IsQ0FBQztJQUVELFFBQVE7UUFDUCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzFCLE9BQU8sSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxLQUFLO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN2QixPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRUQsSUFBSTtRQUNILElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEIsT0FBTyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQztJQUVELElBQUk7UUFDSCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3ZCLENBQUM7Q0FDRCJ9