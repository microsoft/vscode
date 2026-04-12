/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import { NoTreeViewError } from '../../common/views.js';
import { asPromise } from '../../../base/common/async.js';
import * as extHostTypes from './extHostTypes.js';
import { isUndefinedOrNull, isString } from '../../../base/common/types.js';
import { equals, coalesce, distinct } from '../../../base/common/arrays.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { MarkdownString, ViewBadge, DataTransfer } from './extHostTypeConverters.js';
import { isMarkdownString } from '../../../base/common/htmlContent.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { TreeViewsDnDService } from '../../../editor/common/services/treeViewsDnd.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
function toTreeItemLabel(label, extension) {
    if (isString(label)) {
        return { label };
    }
    if (label && typeof label === 'object' && label.label) {
        let highlights = undefined;
        if (Array.isArray(label.highlights)) {
            highlights = label.highlights.filter((highlight => highlight.length === 2 && typeof highlight[0] === 'number' && typeof highlight[1] === 'number'));
            highlights = highlights.length ? highlights : undefined;
        }
        if (isString(label.label)) {
            return { label: label.label, highlights };
        }
        else if (extHostTypes.MarkdownString.isMarkdownString(label.label)) {
            checkProposedApiEnabled(extension, 'treeItemMarkdownLabel');
            return { label: MarkdownString.from(label.label), highlights };
        }
    }
    return undefined;
}
export class ExtHostTreeViews extends Disposable {
    constructor(_proxy, _commands, _logService) {
        super();
        this._proxy = _proxy;
        this._commands = _commands;
        this._logService = _logService;
        this._treeViews = new Map();
        this._treeDragAndDropService = new TreeViewsDnDService();
        function isTreeViewConvertableItem(arg) {
            return arg && arg.$treeViewId && (arg.$treeItemHandle || arg.$selectedTreeItems || arg.$focusedTreeItem);
        }
        _commands.registerArgumentProcessor({
            processArgument: arg => {
                if (isTreeViewConvertableItem(arg)) {
                    return this._convertArgument(arg);
                }
                else if (Array.isArray(arg) && (arg.length > 0)) {
                    return arg.map(item => {
                        if (isTreeViewConvertableItem(item)) {
                            return this._convertArgument(item);
                        }
                        return item;
                    });
                }
                return arg;
            }
        });
    }
    registerTreeDataProvider(id, treeDataProvider, extension) {
        const treeView = this.createTreeView(id, { treeDataProvider }, extension);
        return { dispose: () => treeView.dispose() };
    }
    createTreeView(viewId, options, extension) {
        if (!options || !options.treeDataProvider) {
            throw new Error('Options with treeDataProvider is mandatory');
        }
        const dropMimeTypes = options.dragAndDropController?.dropMimeTypes ?? [];
        const dragMimeTypes = options.dragAndDropController?.dragMimeTypes ?? [];
        const hasHandleDrag = !!options.dragAndDropController?.handleDrag;
        const hasHandleDrop = !!options.dragAndDropController?.handleDrop;
        const treeView = this._createExtHostTreeView(viewId, options, extension);
        const proxyOptions = { showCollapseAll: !!options.showCollapseAll, canSelectMany: !!options.canSelectMany, dropMimeTypes, dragMimeTypes, hasHandleDrag, hasHandleDrop, manuallyManageCheckboxes: !!options.manageCheckboxStateManually };
        const registerPromise = this._proxy.$registerTreeViewDataProvider(viewId, proxyOptions);
        const view = {
            get onDidCollapseElement() { return treeView.onDidCollapseElement; },
            get onDidExpandElement() { return treeView.onDidExpandElement; },
            get selection() { return treeView.selectedElements; },
            get onDidChangeSelection() { return treeView.onDidChangeSelection; },
            get activeItem() {
                checkProposedApiEnabled(extension, 'treeViewActiveItem');
                return treeView.focusedElement;
            },
            get onDidChangeActiveItem() {
                checkProposedApiEnabled(extension, 'treeViewActiveItem');
                return treeView.onDidChangeActiveItem;
            },
            get visible() { return treeView.visible; },
            get onDidChangeVisibility() { return treeView.onDidChangeVisibility; },
            get onDidChangeCheckboxState() {
                return treeView.onDidChangeCheckboxState;
            },
            get message() { return treeView.message; },
            set message(message) {
                if (isMarkdownString(message)) {
                    checkProposedApiEnabled(extension, 'treeViewMarkdownMessage');
                }
                treeView.message = message;
            },
            get title() { return treeView.title; },
            set title(title) {
                treeView.title = title;
            },
            get description() {
                return treeView.description;
            },
            set description(description) {
                treeView.description = description;
            },
            get badge() {
                return treeView.badge;
            },
            set badge(badge) {
                if ((badge !== undefined) && extHostTypes.ViewBadge.isViewBadge(badge)) {
                    treeView.badge = {
                        value: Math.floor(Math.abs(badge.value)),
                        tooltip: badge.tooltip
                    };
                }
                else if (badge === undefined) {
                    treeView.badge = undefined;
                }
            },
            reveal: (element, options) => {
                return treeView.reveal(element, options);
            },
            dispose: async () => {
                // Wait for the registration promise to finish before doing the dispose.
                await registerPromise;
                // Only notify the main thread if this view was not replaced by a new registration.
                // When an extension disposes a view and immediately re-registers it, the new
                // registration may have already updated _treeViews before this async dispose runs.
                if (this._treeViews.get(viewId) === treeView) {
                    this._treeViews.delete(viewId);
                    this._proxy.$disposeTree(viewId);
                }
                treeView.dispose();
            }
        };
        this._register(view);
        return view;
    }
    async $getChildren(treeViewId, treeItemHandles) {
        const treeView = this._treeViews.get(treeViewId);
        if (!treeView) {
            return Promise.reject(new NoTreeViewError(treeViewId));
        }
        if (!treeItemHandles) {
            const children = await treeView.getChildren();
            return children ? [[0, ...children]] : undefined;
        }
        // Keep order of treeItemHandles in case extension trees already depend on this
        const result = [];
        for (let i = 0; i < treeItemHandles.length; i++) {
            const treeItemHandle = treeItemHandles[i];
            const children = await treeView.getChildren(treeItemHandle);
            if (children) {
                result.push([i, ...children]);
            }
        }
        return result;
    }
    async $handleDrop(destinationViewId, requestId, treeDataTransferDTO, targetItemHandle, token, operationUuid, sourceViewId, sourceTreeItemHandles) {
        const treeView = this._treeViews.get(destinationViewId);
        if (!treeView) {
            return Promise.reject(new NoTreeViewError(destinationViewId));
        }
        const treeDataTransfer = DataTransfer.toDataTransfer(treeDataTransferDTO, async (dataItemIndex) => {
            return (await this._proxy.$resolveDropFileData(destinationViewId, requestId, dataItemIndex)).buffer;
        });
        if ((sourceViewId === destinationViewId) && sourceTreeItemHandles) {
            await this._addAdditionalTransferItems(treeDataTransfer, treeView, sourceTreeItemHandles, token, operationUuid);
        }
        return treeView.onDrop(treeDataTransfer, targetItemHandle, token);
    }
    async _addAdditionalTransferItems(treeDataTransfer, treeView, sourceTreeItemHandles, token, operationUuid) {
        const existingTransferOperation = this._treeDragAndDropService.removeDragOperationTransfer(operationUuid);
        if (existingTransferOperation) {
            (await existingTransferOperation)?.forEach((value, key) => {
                if (value) {
                    treeDataTransfer.set(key, value);
                }
            });
        }
        else if (operationUuid && treeView.handleDrag) {
            const willDropPromise = treeView.handleDrag(sourceTreeItemHandles, treeDataTransfer, token);
            this._treeDragAndDropService.addDragOperationTransfer(operationUuid, willDropPromise);
            await willDropPromise;
        }
        return treeDataTransfer;
    }
    async $handleDrag(sourceViewId, sourceTreeItemHandles, operationUuid, token) {
        const treeView = this._treeViews.get(sourceViewId);
        if (!treeView) {
            return Promise.reject(new NoTreeViewError(sourceViewId));
        }
        const treeDataTransfer = await this._addAdditionalTransferItems(new extHostTypes.DataTransfer(), treeView, sourceTreeItemHandles, token, operationUuid);
        if (!treeDataTransfer || token.isCancellationRequested) {
            return;
        }
        return DataTransfer.from(treeDataTransfer);
    }
    async $hasResolve(treeViewId) {
        const treeView = this._treeViews.get(treeViewId);
        if (!treeView) {
            throw new NoTreeViewError(treeViewId);
        }
        return treeView.hasResolve;
    }
    $resolve(treeViewId, treeItemHandle, token) {
        const treeView = this._treeViews.get(treeViewId);
        if (!treeView) {
            throw new NoTreeViewError(treeViewId);
        }
        return treeView.resolveTreeItem(treeItemHandle, token);
    }
    $setExpanded(treeViewId, treeItemHandle, expanded) {
        const treeView = this._treeViews.get(treeViewId);
        if (!treeView) {
            throw new NoTreeViewError(treeViewId);
        }
        treeView.setExpanded(treeItemHandle, expanded);
    }
    $setSelectionAndFocus(treeViewId, selectedHandles, focusedHandle) {
        const treeView = this._treeViews.get(treeViewId);
        if (!treeView) {
            throw new NoTreeViewError(treeViewId);
        }
        treeView.setSelectionAndFocus(selectedHandles, focusedHandle);
    }
    $setVisible(treeViewId, isVisible) {
        const treeView = this._treeViews.get(treeViewId);
        if (!treeView) {
            if (!isVisible) {
                return;
            }
            throw new NoTreeViewError(treeViewId);
        }
        treeView.setVisible(isVisible);
    }
    $changeCheckboxState(treeViewId, checkboxUpdate) {
        const treeView = this._treeViews.get(treeViewId);
        if (!treeView) {
            throw new NoTreeViewError(treeViewId);
        }
        treeView.setCheckboxState(checkboxUpdate);
    }
    _createExtHostTreeView(id, options, extension) {
        const treeView = this._register(new ExtHostTreeView(id, options, this._proxy, this._commands.converter, this._logService, extension));
        this._treeViews.set(id, treeView);
        return treeView;
    }
    _convertArgument(arg) {
        const treeView = this._treeViews.get(arg.$treeViewId);
        const asItemHandle = arg;
        if (treeView && asItemHandle.$treeItemHandle) {
            return treeView.getExtensionElement(asItemHandle.$treeItemHandle);
        }
        const asPaneHandle = arg;
        if (treeView && asPaneHandle.$focusedTreeItem) {
            return treeView.focusedElement;
        }
        return null;
    }
}
class ExtHostTreeView extends Disposable {
    static { this.LABEL_HANDLE_PREFIX = '0'; }
    static { this.ID_HANDLE_PREFIX = '1'; }
    static { this.ROOT_FETCH_KEY = Symbol('extHostTreeViewRoot'); }
    get visible() { return this._visible; }
    get selectedElements() { return this._selectedHandles.map(handle => this.getExtensionElement(handle)).filter(element => !isUndefinedOrNull(element)); }
    get focusedElement() { return (this._focusedHandle ? this.getExtensionElement(this._focusedHandle) : undefined); }
    constructor(_viewId, options, _proxy, _commands, _logService, _extension) {
        super();
        this._viewId = _viewId;
        this._proxy = _proxy;
        this._commands = _commands;
        this._logService = _logService;
        this._extension = _extension;
        this._roots = undefined;
        this._elements = new Map();
        this._nodes = new Map();
        // Track the latest child-fetch per element so that refresh-triggered cache clears ignore stale results.
        // Without these tokens, an earlier getChildren promise resolving after refresh would re-register handles and hit the duplicate-id guard.
        this._childrenFetchTokens = new Map();
        // Global counter for fetch tokens. Using a monotonically increasing counter ensures that even after
        // _childrenFetchTokens.clear() during a root refresh, old in-flight fetches will have requestIds that
        // can never match new fetches (e.g., old fetch has id=5, after clear new fetches get 6, 7, 8...).
        this._globalFetchTokenCounter = 0;
        this._visible = false;
        this._selectedHandles = [];
        this._focusedHandle = undefined;
        this._onDidExpandElement = this._register(new Emitter());
        this.onDidExpandElement = this._onDidExpandElement.event;
        this._onDidCollapseElement = this._register(new Emitter());
        this.onDidCollapseElement = this._onDidCollapseElement.event;
        this._onDidChangeSelection = this._register(new Emitter());
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this._onDidChangeActiveItem = this._register(new Emitter());
        this.onDidChangeActiveItem = this._onDidChangeActiveItem.event;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this._onDidChangeCheckboxState = this._register(new Emitter());
        this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
        this._onDidChangeData = this._register(new Emitter());
        this._refreshPromise = Promise.resolve();
        this._refreshQueue = Promise.resolve();
        this._nodesToClear = new Set();
        this._message = '';
        this._title = '';
        this._refreshCancellationSource = new CancellationTokenSource();
        if (_extension.contributes && _extension.contributes.views) {
            for (const location in _extension.contributes.views) {
                for (const view of _extension.contributes.views[location]) {
                    if (view.id === _viewId) {
                        this._title = view.name;
                    }
                }
            }
        }
        this._dataProvider = options.treeDataProvider;
        this._dndController = options.dragAndDropController;
        if (this._dataProvider.onDidChangeTreeData) {
            this._register(this._dataProvider.onDidChangeTreeData(elementOrElements => {
                if (Array.isArray(elementOrElements) && elementOrElements.length === 0) {
                    return;
                }
                this._onDidChangeData.fire({ message: false, element: elementOrElements });
            }));
        }
        let refreshingPromise;
        let promiseCallback;
        const onDidChangeData = Event.debounce(this._onDidChangeData.event, (result, current) => {
            if (!result) {
                result = { message: false, elements: [] };
            }
            if (current.element !== false) {
                if (!refreshingPromise) {
                    // New refresh has started
                    refreshingPromise = new Promise(c => promiseCallback = c);
                    this._refreshPromise = this._refreshPromise.then(() => refreshingPromise);
                }
                if (Array.isArray(current.element)) {
                    result.elements.push(...current.element);
                }
                else {
                    result.elements.push(current.element);
                }
            }
            if (current.message) {
                result.message = true;
            }
            return result;
        }, 200, true);
        this._register(onDidChangeData(({ message, elements }) => {
            if (elements.length) {
                elements = distinct(elements);
                this._refreshQueue = this._refreshQueue.then(() => {
                    const _promiseCallback = promiseCallback;
                    refreshingPromise = null;
                    const childrenToClear = Array.from(this._nodesToClear);
                    this._nodesToClear.clear();
                    this._debugLogRefresh('start', elements, childrenToClear);
                    return this._refresh(elements).then(() => {
                        this._debugLogRefresh('done', elements, childrenToClear);
                        this._clearNodes(childrenToClear);
                        return _promiseCallback();
                    }).catch(e => {
                        const message = e instanceof Error ? e.message : JSON.stringify(e);
                        this._debugLogRefresh('error', elements, childrenToClear);
                        this._clearNodes(childrenToClear);
                        this._logService.error(`Unable to refresh tree view ${this._viewId}: ${message}`);
                        return _promiseCallback();
                    });
                });
            }
            if (message) {
                this._proxy.$setMessage(this._viewId, MarkdownString.fromStrict(this._message) ?? '');
            }
        }));
    }
    _debugCollectHandles(elements) {
        const changed = [];
        for (const el of elements) {
            if (!el) {
                changed.push('<root>');
                continue;
            }
            const node = this._nodes.get(el);
            if (node) {
                changed.push(node.item.handle);
            }
        }
        const roots = this._roots?.map(r => r.item.handle) ?? [];
        return { changed, roots };
    }
    _debugLogRefresh(phase, elements, childrenToClear) {
        if (!this._isDebugLogging()) {
            return;
        }
        try {
            const snapshot = this._debugCollectHandles(elements);
            snapshot.clearing = childrenToClear.map(n => n.item.handle);
            const changedCount = snapshot.changed.length;
            const nodesToClearLen = childrenToClear.length;
            this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} changed=${changedCount} nodesToClear=${nodesToClearLen} elements.size=${this._elements.size} nodes.size=${this._nodes.size} handles=${JSON.stringify(snapshot)}`);
        }
        catch {
            this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} (snapshot failed)`);
        }
    }
    _isDebugLogging() {
        try {
            const level = this._logService.getLevel();
            return (level === LogLevel.Debug) || (level === LogLevel.Trace);
        }
        catch {
            return false;
        }
    }
    async getChildren(parentHandle) {
        const parentElement = parentHandle ? this.getExtensionElement(parentHandle) : undefined;
        if (parentHandle && !parentElement) {
            this._logService.error(`No tree item with id \'${parentHandle}\' found.`);
            return Promise.resolve([]);
        }
        let childrenNodes = this._getChildrenNodes(parentHandle); // Get it from cache
        if (!childrenNodes) {
            childrenNodes = await this._fetchChildrenNodes(parentElement);
        }
        return childrenNodes ? childrenNodes.map(n => n.item) : undefined;
    }
    getExtensionElement(treeItemHandle) {
        return this._elements.get(treeItemHandle);
    }
    reveal(element, options) {
        options = options ? options : { select: true, focus: false };
        const select = isUndefinedOrNull(options.select) ? true : options.select;
        const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
        const expand = isUndefinedOrNull(options.expand) ? false : options.expand;
        if (typeof this._dataProvider.getParent !== 'function') {
            return Promise.reject(new Error(`Required registered TreeDataProvider to implement 'getParent' method to access 'reveal' method`));
        }
        if (element) {
            return this._refreshPromise
                .then(() => this._resolveUnknownParentChain(element))
                .then(parentChain => this._resolveTreeNode(element, parentChain[parentChain.length - 1])
                .then(treeNode => this._proxy.$reveal(this._viewId, { item: treeNode.item, parentChain: parentChain.map(p => p.item) }, { select, focus, expand })), error => this._logService.error(error));
        }
        else {
            return this._proxy.$reveal(this._viewId, undefined, { select, focus, expand });
        }
    }
    get message() {
        return this._message;
    }
    set message(message) {
        this._message = message;
        this._onDidChangeData.fire({ message: true, element: false });
    }
    get title() {
        return this._title;
    }
    set title(title) {
        this._title = title;
        this._proxy.$setTitle(this._viewId, title, this._description);
    }
    get description() {
        return this._description;
    }
    set description(description) {
        this._description = description;
        this._proxy.$setTitle(this._viewId, this._title, description);
    }
    get badge() {
        return this._badge;
    }
    set badge(badge) {
        if (this._badge?.value === badge?.value &&
            this._badge?.tooltip === badge?.tooltip) {
            return;
        }
        this._badge = ViewBadge.from(badge);
        this._proxy.$setBadge(this._viewId, badge);
    }
    setExpanded(treeItemHandle, expanded) {
        const element = this.getExtensionElement(treeItemHandle);
        if (element) {
            if (expanded) {
                this._onDidExpandElement.fire(Object.freeze({ element }));
            }
            else {
                this._onDidCollapseElement.fire(Object.freeze({ element }));
            }
        }
    }
    setSelectionAndFocus(selectedHandles, focusedHandle) {
        const changedSelection = !equals(this._selectedHandles, selectedHandles);
        this._selectedHandles = selectedHandles;
        const changedFocus = this._focusedHandle !== focusedHandle;
        this._focusedHandle = focusedHandle;
        if (changedSelection) {
            this._onDidChangeSelection.fire(Object.freeze({ selection: this.selectedElements }));
        }
        if (changedFocus) {
            this._onDidChangeActiveItem.fire(Object.freeze({ activeItem: this.focusedElement }));
        }
    }
    setVisible(visible) {
        if (visible !== this._visible) {
            this._visible = visible;
            this._onDidChangeVisibility.fire(Object.freeze({ visible: this._visible }));
        }
    }
    async setCheckboxState(checkboxUpdates) {
        const items = (await Promise.all(checkboxUpdates.map(async (checkboxUpdate) => {
            const extensionItem = this.getExtensionElement(checkboxUpdate.treeItemHandle);
            if (extensionItem) {
                return {
                    extensionItem: extensionItem,
                    treeItem: await this._dataProvider.getTreeItem(extensionItem),
                    newState: checkboxUpdate.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked
                };
            }
            return Promise.resolve(undefined);
        }))).filter((item) => item !== undefined);
        items.forEach(item => {
            item.treeItem.checkboxState = item.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked;
        });
        this._onDidChangeCheckboxState.fire({ items: items.map(item => [item.extensionItem, item.newState]) });
    }
    async handleDrag(sourceTreeItemHandles, treeDataTransfer, token) {
        const extensionTreeItems = [];
        for (const sourceHandle of sourceTreeItemHandles) {
            const extensionItem = this.getExtensionElement(sourceHandle);
            if (extensionItem) {
                extensionTreeItems.push(extensionItem);
            }
        }
        if (!this._dndController?.handleDrag || (extensionTreeItems.length === 0)) {
            return;
        }
        await this._dndController.handleDrag(extensionTreeItems, treeDataTransfer, token);
        return treeDataTransfer;
    }
    get hasHandleDrag() {
        return !!this._dndController?.handleDrag;
    }
    async onDrop(treeDataTransfer, targetHandleOrNode, token) {
        const target = targetHandleOrNode ? this.getExtensionElement(targetHandleOrNode) : undefined;
        if ((!target && targetHandleOrNode) || !this._dndController?.handleDrop) {
            return;
        }
        return asPromise(() => this._dndController?.handleDrop
            ? this._dndController.handleDrop(target, treeDataTransfer, token)
            : undefined);
    }
    get hasResolve() {
        return !!this._dataProvider.resolveTreeItem;
    }
    async resolveTreeItem(treeItemHandle, token) {
        if (!this._dataProvider.resolveTreeItem) {
            return;
        }
        const element = this._elements.get(treeItemHandle);
        if (element) {
            const node = this._nodes.get(element);
            if (node) {
                const resolve = await this._dataProvider.resolveTreeItem(node.extensionItem, element, token) ?? node.extensionItem;
                this._validateTreeItem(resolve);
                // Resolvable elements. Currently only tooltip and command.
                node.item.tooltip = this._getTooltip(resolve.tooltip);
                node.item.command = this._getCommand(node.disposableStore, resolve.command);
                return node.item;
            }
        }
        return;
    }
    _resolveUnknownParentChain(element) {
        return this._resolveParent(element)
            .then((parent) => {
            if (!parent) {
                return Promise.resolve([]);
            }
            return this._resolveUnknownParentChain(parent)
                .then(result => this._resolveTreeNode(parent, result[result.length - 1])
                .then(parentNode => {
                result.push(parentNode);
                return result;
            }));
        });
    }
    _resolveParent(element) {
        const node = this._nodes.get(element);
        if (node) {
            return Promise.resolve(node.parent ? this._elements.get(node.parent.item.handle) : undefined);
        }
        return asPromise(() => this._dataProvider.getParent(element));
    }
    async _resolveTreeNode(element, parent) {
        const node = this._nodes.get(element);
        if (node) {
            return node;
        }
        const extTreeItem = await asPromise(() => this._dataProvider.getTreeItem(element));
        const handle = this._createHandle(element, extTreeItem, parent, true);
        await this.getChildren(parent ? parent.item.handle : undefined);
        const cachedElement = this.getExtensionElement(handle);
        if (cachedElement) {
            const node = this._nodes.get(cachedElement);
            if (node) {
                return node;
            }
        }
        this._logService.error(`[TreeView:${this._viewId}] Failed to resolve tree node for element ${handle}`);
        this._proxy.$logResolveTreeNodeFailure(this._extension.identifier.value);
        throw new Error(`Cannot resolve tree item for element ${handle} from extension ${this._extension.identifier.value}`);
    }
    _getChildrenNodes(parentNodeOrHandle) {
        if (parentNodeOrHandle) {
            let parentNode;
            if (typeof parentNodeOrHandle === 'string') {
                const parentElement = this.getExtensionElement(parentNodeOrHandle);
                parentNode = parentElement ? this._nodes.get(parentElement) : undefined;
            }
            else {
                parentNode = parentNodeOrHandle;
            }
            return parentNode ? parentNode.children || undefined : undefined;
        }
        return this._roots;
    }
    _getFetchKey(parentElement) {
        return parentElement ?? ExtHostTreeView.ROOT_FETCH_KEY;
    }
    async _fetchChildrenNodes(parentElement) {
        // clear children cache
        this._addChildrenToClear(parentElement);
        const fetchKey = this._getFetchKey(parentElement);
        const requestId = ++this._globalFetchTokenCounter;
        this._childrenFetchTokens.set(fetchKey, requestId);
        const cts = new CancellationTokenSource(this._refreshCancellationSource.token);
        try {
            const elements = await this._dataProvider.getChildren(parentElement);
            if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
                return undefined;
            }
            const parentNode = parentElement ? this._nodes.get(parentElement) : undefined;
            if (cts.token.isCancellationRequested) {
                return undefined;
            }
            const coalescedElements = coalesce(elements || []);
            const treeItems = await Promise.all(coalesce(coalescedElements).map(element => {
                return this._dataProvider.getTreeItem(element);
            }));
            if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
                return undefined;
            }
            if (cts.token.isCancellationRequested) {
                return undefined;
            }
            // createAndRegisterTreeNodes adds the nodes to a cache. This must be done sync so that they get added in the correct order.
            const items = treeItems.map((item, index) => item ? this._createAndRegisterTreeNode(coalescedElements[index], item, parentNode) : null);
            if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
                return undefined;
            }
            return coalesce(items);
        }
        finally {
            cts.dispose();
        }
    }
    _refresh(elements) {
        const hasRoot = elements.some(element => !element);
        if (hasRoot) {
            // Cancel any pending children fetches
            this._refreshCancellationSource.dispose(true);
            this._refreshCancellationSource = new CancellationTokenSource();
            this._addChildrenToClear();
            return this._proxy.$refresh(this._viewId);
        }
        else {
            const handlesToRefresh = this._getHandlesToRefresh(elements);
            if (handlesToRefresh.length) {
                return this._refreshHandles(handlesToRefresh);
            }
        }
        return Promise.resolve(undefined);
    }
    _getHandlesToRefresh(elements) {
        const elementsToUpdate = new Set();
        const elementNodes = elements.map(element => this._nodes.get(element));
        for (const elementNode of elementNodes) {
            if (elementNode && !elementsToUpdate.has(elementNode.item.handle)) {
                // check if an ancestor of extElement is already in the elements list
                let currentNode = elementNode;
                while (currentNode && currentNode.parent && elementNodes.findIndex(node => currentNode && currentNode.parent && node && node.item.handle === currentNode.parent.item.handle) === -1) {
                    const parentElement = this._elements.get(currentNode.parent.item.handle);
                    currentNode = parentElement ? this._nodes.get(parentElement) : undefined;
                }
                if (currentNode && !currentNode.parent) {
                    elementsToUpdate.add(elementNode.item.handle);
                }
            }
        }
        const handlesToUpdate = [];
        // Take only top level elements
        elementsToUpdate.forEach((handle) => {
            const element = this._elements.get(handle);
            if (element) {
                const node = this._nodes.get(element);
                if (node && (!node.parent || !elementsToUpdate.has(node.parent.item.handle))) {
                    handlesToUpdate.push(handle);
                }
            }
        });
        return handlesToUpdate;
    }
    _refreshHandles(itemHandles) {
        const itemsToRefresh = {};
        return Promise.all(itemHandles.map(treeItemHandle => this._refreshNode(treeItemHandle)
            .then(node => {
            if (node) {
                itemsToRefresh[treeItemHandle] = node.item;
            }
        })))
            .then(() => Object.keys(itemsToRefresh).length ? this._proxy.$refresh(this._viewId, itemsToRefresh) : undefined);
    }
    _refreshNode(treeItemHandle) {
        const extElement = this.getExtensionElement(treeItemHandle);
        if (extElement) {
            const existing = this._nodes.get(extElement);
            if (existing) {
                this._addChildrenToClear(extElement); // clear children cache
                return asPromise(() => this._dataProvider.getTreeItem(extElement))
                    .then(extTreeItem => {
                    if (extTreeItem) {
                        const newNode = this._createTreeNode(extElement, extTreeItem, existing.parent);
                        this._updateNodeCache(extElement, newNode, existing, existing.parent);
                        existing.dispose();
                        return newNode;
                    }
                    return null;
                });
            }
        }
        return Promise.resolve(null);
    }
    _createAndRegisterTreeNode(element, extTreeItem, parentNode) {
        const duplicateHandle = extTreeItem.id ? `${ExtHostTreeView.ID_HANDLE_PREFIX}/${extTreeItem.id}` : undefined;
        if (duplicateHandle) {
            const existingElement = this._elements.get(duplicateHandle);
            if (existingElement) {
                const existingNode = this._nodes.get(existingElement);
                if (existingElement !== element) {
                    // A different element object was registered with the same ID.
                    // This can happen during concurrent tree operations (e.g., tree
                    // being switched to while data is updated). Clean up the stale
                    // element reference before re-registering with the new one.
                    this._nodes.delete(existingElement);
                }
                if (existingNode) {
                    const newNode = this._createTreeNode(element, extTreeItem, parentNode);
                    this._updateNodeCache(element, newNode, existingNode, parentNode);
                    existingNode.dispose();
                    return newNode;
                }
            }
        }
        const node = this._createTreeNode(element, extTreeItem, parentNode);
        this._addNodeToCache(element, node);
        this._addNodeToParentCache(node, parentNode);
        return node;
    }
    _getTooltip(tooltip) {
        if (extHostTypes.MarkdownString.isMarkdownString(tooltip)) {
            return MarkdownString.from(tooltip);
        }
        return tooltip;
    }
    _getCommand(disposable, command) {
        return command ? { ...this._commands.toInternal(command, disposable), originalId: command.command } : undefined;
    }
    _getCheckbox(extensionTreeItem) {
        if (extensionTreeItem.checkboxState === undefined) {
            return undefined;
        }
        let checkboxState;
        let tooltip = undefined;
        let accessibilityInformation = undefined;
        if (typeof extensionTreeItem.checkboxState === 'number') {
            checkboxState = extensionTreeItem.checkboxState;
        }
        else {
            checkboxState = extensionTreeItem.checkboxState.state;
            tooltip = extensionTreeItem.checkboxState.tooltip;
            accessibilityInformation = extensionTreeItem.checkboxState.accessibilityInformation;
        }
        return { isChecked: checkboxState === extHostTypes.TreeItemCheckboxState.Checked, tooltip, accessibilityInformation };
    }
    _validateTreeItem(extensionTreeItem) {
        if (!extHostTypes.TreeItem.isTreeItem(extensionTreeItem, this._extension)) {
            throw new Error(`Extension ${this._extension.identifier.value} has provided an invalid tree item.`);
        }
    }
    _createTreeNode(element, extensionTreeItem, parent) {
        this._validateTreeItem(extensionTreeItem);
        const disposableStore = this._register(new DisposableStore());
        const handle = this._createHandle(element, extensionTreeItem, parent);
        const icon = this._getLightIconPath(extensionTreeItem);
        const item = {
            handle,
            parentHandle: parent ? parent.item.handle : undefined,
            label: toTreeItemLabel(extensionTreeItem.label, this._extension),
            description: extensionTreeItem.description,
            resourceUri: extensionTreeItem.resourceUri,
            tooltip: this._getTooltip(extensionTreeItem.tooltip),
            command: this._getCommand(disposableStore, extensionTreeItem.command),
            contextValue: extensionTreeItem.contextValue,
            icon,
            iconDark: this._getDarkIconPath(extensionTreeItem) || icon,
            themeIcon: this._getThemeIcon(extensionTreeItem),
            collapsibleState: isUndefinedOrNull(extensionTreeItem.collapsibleState) ? extHostTypes.TreeItemCollapsibleState.None : extensionTreeItem.collapsibleState,
            accessibilityInformation: extensionTreeItem.accessibilityInformation,
            checkbox: this._getCheckbox(extensionTreeItem),
        };
        return {
            item,
            extensionItem: extensionTreeItem,
            parent,
            children: undefined,
            disposableStore,
            dispose() { disposableStore.dispose(); }
        };
    }
    _getThemeIcon(extensionTreeItem) {
        return extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon ? extensionTreeItem.iconPath : undefined;
    }
    _createHandle(element, { id, label, resourceUri }, parent, returnFirst) {
        if (id) {
            return `${ExtHostTreeView.ID_HANDLE_PREFIX}/${id}`;
        }
        const treeItemLabel = toTreeItemLabel(label, this._extension);
        const prefix = parent ? parent.item.handle : ExtHostTreeView.LABEL_HANDLE_PREFIX;
        let labelValue = '';
        if (treeItemLabel) {
            if (isMarkdownString(treeItemLabel.label)) {
                labelValue = treeItemLabel.label.value;
            }
            else {
                labelValue = treeItemLabel.label;
            }
        }
        let elementId = labelValue || (resourceUri ? basename(resourceUri) : '');
        elementId = elementId.indexOf('/') !== -1 ? elementId.replace('/', '//') : elementId;
        const existingHandle = this._nodes.has(element) ? this._nodes.get(element).item.handle : undefined;
        const childrenNodes = (this._getChildrenNodes(parent) || []);
        let handle;
        let counter = 0;
        do {
            handle = `${prefix}/${counter}:${elementId}`;
            if (returnFirst || !this._elements.has(handle) || existingHandle === handle) {
                // Return first if asked for or
                // Return if handle does not exist or
                // Return if handle is being reused
                break;
            }
            counter++;
        } while (counter <= childrenNodes.length);
        return handle;
    }
    _getLightIconPath(extensionTreeItem) {
        if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon)) {
            if (typeof extensionTreeItem.iconPath === 'string'
                || URI.isUri(extensionTreeItem.iconPath)) {
                return this._getIconPath(extensionTreeItem.iconPath);
            }
            return this._getIconPath(extensionTreeItem.iconPath.light);
        }
        return undefined;
    }
    _getDarkIconPath(extensionTreeItem) {
        if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon) && extensionTreeItem.iconPath.dark) {
            return this._getIconPath(extensionTreeItem.iconPath.dark);
        }
        return undefined;
    }
    _getIconPath(iconPath) {
        if (URI.isUri(iconPath)) {
            return iconPath;
        }
        return URI.file(iconPath);
    }
    _addNodeToCache(element, node) {
        this._elements.set(node.item.handle, element);
        this._nodes.set(element, node);
    }
    _updateNodeCache(element, newNode, existing, parentNode) {
        // Remove from the cache
        this._elements.delete(newNode.item.handle);
        this._nodes.delete(element);
        if (newNode.item.handle !== existing.item.handle) {
            this._elements.delete(existing.item.handle);
        }
        // Add the new node to the cache
        this._addNodeToCache(element, newNode);
        // Replace the node in parent's children nodes
        const childrenNodes = (this._getChildrenNodes(parentNode) || []);
        const childNode = childrenNodes.filter(c => c.item.handle === existing.item.handle)[0];
        if (childNode) {
            childrenNodes.splice(childrenNodes.indexOf(childNode), 1, newNode);
        }
    }
    _addNodeToParentCache(node, parentNode) {
        if (parentNode) {
            if (!parentNode.children) {
                parentNode.children = [];
            }
            parentNode.children.push(node);
        }
        else {
            if (!this._roots) {
                this._roots = [];
            }
            this._roots.push(node);
        }
    }
    _addChildrenToClear(parentElement) {
        if (parentElement) {
            const node = this._nodes.get(parentElement);
            if (node) {
                if (node.children) {
                    for (const child of node.children) {
                        this._nodesToClear.add(child);
                        const childElement = this._elements.get(child.item.handle);
                        if (childElement) {
                            this._addChildrenToClear(childElement);
                            this._nodes.delete(childElement);
                            this._elements.delete(child.item.handle);
                        }
                    }
                }
                node.children = undefined;
            }
        }
        else {
            this._addAllToClear();
        }
    }
    _addAllToClear() {
        this._roots = undefined;
        this._nodes.forEach(node => {
            this._nodesToClear.add(node);
        });
        this._nodes.clear();
        this._elements.clear();
        this._childrenFetchTokens.clear();
    }
    _clearNodes(nodes) {
        dispose(nodes);
    }
    _clearAll() {
        this._roots = undefined;
        this._elements.clear();
        dispose(this._nodes.values());
        this._nodes.clear();
        dispose(this._nodesToClear);
        this._nodesToClear.clear();
        this._childrenFetchTokens.clear();
    }
    dispose() {
        super.dispose();
        this._refreshCancellationSource.dispose();
        this._clearAll();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRyZWVWaWV3cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUcmVlVmlld3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBRXRHLE9BQU8sRUFBZ0ksZUFBZSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFdEwsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzFELE9BQU8sS0FBSyxZQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDbEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVFLE9BQU8sRUFBZSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNyRixPQUFPLEVBQW1CLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDeEYsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sRUFBd0IsbUJBQW1CLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUU1RyxPQUFPLEVBQUUsdUJB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