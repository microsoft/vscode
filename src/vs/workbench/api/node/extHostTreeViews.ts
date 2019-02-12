/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as vscode from 'vscode';
import { basename } from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ExtHostTreeViewsShape, MainThreadTreeViewsShape } from './extHost.protocol';
import { ITreeItem, TreeViewItemHandleArg, ITreeItemLabel, IRevealOptions } from 'vs/workbench/common/views';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/node/extHostCommands';
import { asPromise } from 'vs/base/common/async';
import { TreeItemCollapsibleState, ThemeIcon, MarkdownString } from 'vs/workbench/api/node/extHostTypes';
import { isUndefinedOrNull, isString } from 'vs/base/common/types';
import { equals, coalesce } from 'vs/base/common/arrays';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtensionDescription, checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import * as typeConvert from 'vs/workbench/api/node/extHostTypeConverters';

type TreeItemHandle = string;

function toTreeItemLabel(label: any, extension: IExtensionDescription): ITreeItemLabel {
	if (isString(label)) {
		return { label };
	}

	if (label
		&& typeof label === 'object'
		&& typeof label.label === 'string') {
		checkProposedApiEnabled(extension);
		let highlights: [number, number][] = undefined;
		if (Array.isArray(label.highlights)) {
			highlights = (<[number, number][]>label.highlights).filter((highlight => highlight.length === 2 && typeof highlight[0] === 'number' && typeof highlight[1] === 'number'));
			highlights = highlights.length ? highlights : undefined;
		}
		return { label: label.label, highlights };
	}

	return undefined;
}


export class ExtHostTreeViews implements ExtHostTreeViewsShape {

	private treeViews: Map<string, ExtHostTreeView<any>> = new Map<string, ExtHostTreeView<any>>();

	constructor(
		private _proxy: MainThreadTreeViewsShape,
		private commands: ExtHostCommands,
		private logService: ILogService
	) {
		commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$treeViewId && arg.$treeItemHandle) {
					return this.convertArgument(arg);
				}
				return arg;
			}
		});
	}

	registerTreeDataProvider<T>(id: string, treeDataProvider: vscode.TreeDataProvider<T>, extension: IExtensionDescription): vscode.Disposable {
		const treeView = this.createTreeView(id, { treeDataProvider }, extension);
		return { dispose: () => treeView.dispose() };
	}

	createTreeView<T>(viewId: string, options: vscode.TreeViewOptions<T>, extension: IExtensionDescription): vscode.TreeView<T> {
		if (!options || !options.treeDataProvider) {
			throw new Error('Options with treeDataProvider is mandatory');
		}

		const treeView = this.createExtHostTreeView(viewId, options, extension);
		return {
			get onDidCollapseElement() { return treeView.onDidCollapseElement; },
			get onDidExpandElement() { return treeView.onDidExpandElement; },
			get selection() { return treeView.selectedElements; },
			get onDidChangeSelection() { return treeView.onDidChangeSelection; },
			get visible() { return treeView.visible; },
			get onDidChangeVisibility() { return treeView.onDidChangeVisibility; },
			get message() { return treeView.message; },
			set message(message: string | MarkdownString) { checkProposedApiEnabled(extension); treeView.message = message; },
			reveal: (element: T, options?: IRevealOptions): Promise<void> => {
				return treeView.reveal(element, options);
			},
			dispose: () => {
				this.treeViews.delete(viewId);
				treeView.dispose();
			}
		};
	}

	$getChildren(treeViewId: string, treeItemHandle?: string): Promise<ITreeItem[]> {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			return Promise.reject(new Error(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId)));
		}
		return treeView.getChildren(treeItemHandle);
	}

	$setExpanded(treeViewId: string, treeItemHandle: string, expanded: boolean): void {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			throw new Error(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId));
		}
		treeView.setExpanded(treeItemHandle, expanded);
	}

	$setSelection(treeViewId: string, treeItemHandles: string[]): void {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			throw new Error(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId));
		}
		treeView.setSelection(treeItemHandles);
	}

	$setVisible(treeViewId: string, isVisible: boolean): void {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			throw new Error(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId));
		}
		treeView.setVisible(isVisible);
	}

	private createExtHostTreeView<T>(id: string, options: vscode.TreeViewOptions<T>, extension: IExtensionDescription): ExtHostTreeView<T> {
		const treeView = new ExtHostTreeView<T>(id, options, this._proxy, this.commands.converter, this.logService, extension);
		this.treeViews.set(id, treeView);
		return treeView;
	}

	private convertArgument(arg: TreeViewItemHandleArg): any {
		const treeView = this.treeViews.get(arg.$treeViewId);
		return treeView ? treeView.getExtensionElement(arg.$treeItemHandle) : null;
	}
}

interface TreeNode {
	item: ITreeItem;
	parent: TreeNode;
	children: TreeNode[];
}

class ExtHostTreeView<T> extends Disposable {

	private static LABEL_HANDLE_PREFIX = '0';
	private static ID_HANDLE_PREFIX = '1';

	private readonly dataProvider: vscode.TreeDataProvider<T>;

	private roots: TreeNode[] | null = null;
	private elements: Map<TreeItemHandle, T> = new Map<TreeItemHandle, T>();
	private nodes: Map<T, TreeNode> = new Map<T, TreeNode>();

	private _visible: boolean = false;
	get visible(): boolean { return this._visible; }

	private _selectedHandles: TreeItemHandle[] = [];
	get selectedElements(): T[] { return this._selectedHandles.map(handle => this.getExtensionElement(handle)).filter(element => !isUndefinedOrNull(element)); }

	private _onDidExpandElement: Emitter<vscode.TreeViewExpansionEvent<T>> = this._register(new Emitter<vscode.TreeViewExpansionEvent<T>>());
	readonly onDidExpandElement: Event<vscode.TreeViewExpansionEvent<T>> = this._onDidExpandElement.event;

	private _onDidCollapseElement: Emitter<vscode.TreeViewExpansionEvent<T>> = this._register(new Emitter<vscode.TreeViewExpansionEvent<T>>());
	readonly onDidCollapseElement: Event<vscode.TreeViewExpansionEvent<T>> = this._onDidCollapseElement.event;

	private _onDidChangeSelection: Emitter<vscode.TreeViewSelectionChangeEvent<T>> = this._register(new Emitter<vscode.TreeViewSelectionChangeEvent<T>>());
	readonly onDidChangeSelection: Event<vscode.TreeViewSelectionChangeEvent<T>> = this._onDidChangeSelection.event;

	private _onDidChangeVisibility: Emitter<vscode.TreeViewVisibilityChangeEvent> = this._register(new Emitter<vscode.TreeViewVisibilityChangeEvent>());
	readonly onDidChangeVisibility: Event<vscode.TreeViewVisibilityChangeEvent> = this._onDidChangeVisibility.event;

	private refreshPromise: Promise<void> = Promise.resolve(null);

	constructor(private viewId: string, options: vscode.TreeViewOptions<T>, private proxy: MainThreadTreeViewsShape, private commands: CommandsConverter, private logService: ILogService, private extension: IExtensionDescription) {
		super();
		this.dataProvider = options.treeDataProvider;
		this.proxy.$registerTreeViewDataProvider(viewId, { showCollapseAll: !!options.showCollapseAll });
		if (this.dataProvider.onDidChangeTreeData) {
			let refreshingPromise, promiseCallback;
			this._register(Event.debounce<T, T[]>(this.dataProvider.onDidChangeTreeData, (last, current) => {
				if (!refreshingPromise) {
					// New refresh has started
					refreshingPromise = new Promise(c => promiseCallback = c);
					this.refreshPromise = this.refreshPromise.then(() => refreshingPromise);
				}
				return last ? [...last, current] : [current];
			}, 200)(elements => {
				const _promiseCallback = promiseCallback;
				refreshingPromise = null;
				this.refresh(elements).then(() => _promiseCallback());
			}));
		}
	}

	getChildren(parentHandle?: TreeItemHandle): Promise<ITreeItem[]> {
		const parentElement = parentHandle ? this.getExtensionElement(parentHandle) : undefined;
		if (parentHandle && !parentElement) {
			console.error(`No tree item with id \'${parentHandle}\' found.`);
			return Promise.resolve([]);
		}

		const childrenNodes = this.getChildrenNodes(parentHandle); // Get it from cache
		return (childrenNodes ? Promise.resolve(childrenNodes) : this.fetchChildrenNodes(parentElement))
			.then(nodes => nodes.map(n => n.item));
	}

	getExtensionElement(treeItemHandle: TreeItemHandle): T {
		return this.elements.get(treeItemHandle);
	}

	reveal(element: T, options?: IRevealOptions): Promise<void> {
		options = options ? options : { select: true, focus: false };
		const select = isUndefinedOrNull(options.select) ? true : options.select;
		const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
		const expand = isUndefinedOrNull(options.expand) ? false : options.expand;

		if (typeof this.dataProvider.getParent !== 'function') {
			return Promise.reject(new Error(`Required registered TreeDataProvider to implement 'getParent' method to access 'reveal' method`));
		}
		return this.refreshPromise
			.then(() => this.resolveUnknownParentChain(element))
			.then(parentChain => this.resolveTreeNode(element, parentChain[parentChain.length - 1])
				.then(treeNode => this.proxy.$reveal(this.viewId, treeNode.item, parentChain.map(p => p.item), { select, focus, expand })), error => this.logService.error(error));
	}

	private _message: string | MarkdownString;
	get message(): string | MarkdownString {
		return this._message;
	}

	set message(message: string | MarkdownString) {
		this._message = message;
		this.proxy.$setMessage(this.viewId, typeConvert.MarkdownString.fromStrict(this._message));
	}

	setExpanded(treeItemHandle: TreeItemHandle, expanded: boolean): void {
		const element = this.getExtensionElement(treeItemHandle);
		if (element) {
			if (expanded) {
				this._onDidExpandElement.fire(Object.freeze({ element }));
			} else {
				this._onDidCollapseElement.fire(Object.freeze({ element }));
			}
		}
	}

	setSelection(treeItemHandles: TreeItemHandle[]): void {
		if (!equals(this._selectedHandles, treeItemHandles)) {
			this._selectedHandles = treeItemHandles;
			this._onDidChangeSelection.fire(Object.freeze({ selection: this.selectedElements }));
		}
	}

	setVisible(visible: boolean): void {
		if (visible !== this._visible) {
			this._visible = visible;
			this._onDidChangeVisibility.fire(Object.freeze({ visible: this._visible }));
		}
	}

	private resolveUnknownParentChain(element: T): Promise<TreeNode[]> {
		return this.resolveParent(element)
			.then((parent) => {
				if (!parent) {
					return Promise.resolve([]);
				}
				return this.resolveUnknownParentChain(parent)
					.then(result => this.resolveTreeNode(parent, result[result.length - 1])
						.then(parentNode => {
							result.push(parentNode);
							return result;
						}));
			});
	}

	private resolveParent(element: T): Promise<T> {
		const node = this.nodes.get(element);
		if (node) {
			return Promise.resolve(node.parent ? this.elements.get(node.parent.item.handle) : null);
		}
		return asPromise(() => this.dataProvider.getParent(element));
	}

	private resolveTreeNode(element: T, parent?: TreeNode): Promise<TreeNode> {
		const node = this.nodes.get(element);
		if (node) {
			return Promise.resolve(node);
		}
		return asPromise(() => this.dataProvider.getTreeItem(element))
			.then(extTreeItem => this.createHandle(element, extTreeItem, parent, true))
			.then(handle => this.getChildren(parent ? parent.item.handle : null)
				.then(() => {
					const cachedElement = this.getExtensionElement(handle);
					if (cachedElement) {
						const node = this.nodes.get(cachedElement);
						if (node) {
							return Promise.resolve(node);
						}
					}
					throw new Error(`Cannot resolve tree item for element ${handle}`);
				}));
	}

	private getChildrenNodes(parentNodeOrHandle?: TreeNode | TreeItemHandle): TreeNode[] {
		if (parentNodeOrHandle) {
			let parentNode: TreeNode;
			if (typeof parentNodeOrHandle === 'string') {
				const parentElement = this.getExtensionElement(parentNodeOrHandle);
				parentNode = parentElement ? this.nodes.get(parentElement) : null;
			} else {
				parentNode = parentNodeOrHandle;
			}
			return parentNode ? parentNode.children : null;
		}
		return this.roots;
	}

	private fetchChildrenNodes(parentElement?: T): Promise<TreeNode[]> {
		// clear children cache
		this.clearChildren(parentElement);

		const parentNode = parentElement ? this.nodes.get(parentElement) : undefined;
		return asPromise(() => this.dataProvider.getChildren(parentElement))
			.then(elements => Promise.all(
				coalesce(elements || [])
					.map(element => asPromise(() => this.dataProvider.getTreeItem(element))
						.then(extTreeItem => extTreeItem ? this.createAndRegisterTreeNode(element, extTreeItem, parentNode) : null))))
			.then(coalesce);
	}

	private refresh(elements: T[]): Promise<void> {
		const hasRoot = elements.some(element => !element);
		if (hasRoot) {
			this.clearAll(); // clear cache
			return this.proxy.$refresh(this.viewId);
		} else {
			const handlesToRefresh = this.getHandlesToRefresh(elements);
			if (handlesToRefresh.length) {
				return this.refreshHandles(handlesToRefresh);
			}
		}
		return Promise.resolve(undefined);
	}

	private getHandlesToRefresh(elements: T[]): TreeItemHandle[] {
		const elementsToUpdate = new Set<TreeItemHandle>();
		for (const element of elements) {
			let elementNode = this.nodes.get(element);
			if (elementNode && !elementsToUpdate.has(elementNode.item.handle)) {
				// check if an ancestor of extElement is already in the elements to update list
				let currentNode = elementNode;
				while (currentNode && currentNode.parent && !elementsToUpdate.has(currentNode.parent.item.handle)) {
					const parentElement = this.elements.get(currentNode.parent.item.handle);
					currentNode = this.nodes.get(parentElement);
				}
				if (!currentNode.parent) {
					elementsToUpdate.add(elementNode.item.handle);
				}
			}
		}

		const handlesToUpdate: TreeItemHandle[] = [];
		// Take only top level elements
		elementsToUpdate.forEach((handle) => {
			const element = this.elements.get(handle);
			let node = this.nodes.get(element);
			if (node && (!node.parent || !elementsToUpdate.has(node.parent.item.handle))) {
				handlesToUpdate.push(handle);
			}
		});

		return handlesToUpdate;
	}

	private refreshHandles(itemHandles: TreeItemHandle[]): Promise<void> {
		const itemsToRefresh: { [treeItemHandle: string]: ITreeItem } = {};
		return Promise.all(itemHandles.map(treeItemHandle =>
			this.refreshNode(treeItemHandle)
				.then(node => {
					if (node) {
						itemsToRefresh[treeItemHandle] = node.item;
					}
				})))
			.then(() => Object.keys(itemsToRefresh).length ? this.proxy.$refresh(this.viewId, itemsToRefresh) : null);
	}

	private refreshNode(treeItemHandle: TreeItemHandle): Promise<TreeNode> {
		const extElement = this.getExtensionElement(treeItemHandle);
		const existing = this.nodes.get(extElement);
		this.clearChildren(extElement); // clear children cache
		return asPromise(() => this.dataProvider.getTreeItem(extElement))
			.then(extTreeItem => {
				if (extTreeItem) {
					const newNode = this.createTreeNode(extElement, extTreeItem, existing.parent);
					this.updateNodeCache(extElement, newNode, existing, existing.parent);
					return newNode;
				}
				return null;
			});
	}

	private createAndRegisterTreeNode(element: T, extTreeItem: vscode.TreeItem, parentNode: TreeNode): TreeNode {
		const node = this.createTreeNode(element, extTreeItem, parentNode);
		if (extTreeItem.id && this.elements.has(node.item.handle)) {
			throw new Error(localize('treeView.duplicateElement', 'Element with id {0} is already registered', extTreeItem.id));
		}
		this.addNodeToCache(element, node);
		this.addNodeToParentCache(node, parentNode);
		return node;
	}

	private createTreeNode(element: T, extensionTreeItem: vscode.TreeItem, parent: TreeNode): TreeNode {
		return {
			item: this.createTreeItem(element, extensionTreeItem, parent),
			parent,
			children: undefined
		};
	}

	private createTreeItem(element: T, extensionTreeItem: vscode.TreeItem, parent?: TreeNode): ITreeItem {

		const handle = this.createHandle(element, extensionTreeItem, parent);
		const icon = this.getLightIconPath(extensionTreeItem);
		const item = {
			handle,
			parentHandle: parent ? parent.item.handle : undefined,
			label: toTreeItemLabel(extensionTreeItem.label, this.extension),
			description: extensionTreeItem.description,
			resourceUri: extensionTreeItem.resourceUri,
			tooltip: typeof extensionTreeItem.tooltip === 'string' ? extensionTreeItem.tooltip : undefined,
			command: extensionTreeItem.command ? this.commands.toInternal(extensionTreeItem.command) : undefined,
			contextValue: extensionTreeItem.contextValue,
			icon,
			iconDark: this.getDarkIconPath(extensionTreeItem) || icon,
			themeIcon: extensionTreeItem.iconPath instanceof ThemeIcon ? { id: extensionTreeItem.iconPath.id } : undefined,
			collapsibleState: isUndefinedOrNull(extensionTreeItem.collapsibleState) ? TreeItemCollapsibleState.None : extensionTreeItem.collapsibleState
		};

		return item;
	}

	private createHandle(element: T, { id, label, resourceUri }: vscode.TreeItem, parent: TreeNode, returnFirst?: boolean): TreeItemHandle {
		if (id) {
			return `${ExtHostTreeView.ID_HANDLE_PREFIX}/${id}`;
		}

		const treeItemLabel = toTreeItemLabel(label, this.extension);
		const prefix: string = parent ? parent.item.handle : ExtHostTreeView.LABEL_HANDLE_PREFIX;
		let elementId = treeItemLabel ? treeItemLabel.label : resourceUri ? basename(resourceUri.path) : '';
		elementId = elementId.indexOf('/') !== -1 ? elementId.replace('/', '//') : elementId;
		const existingHandle = this.nodes.has(element) ? this.nodes.get(element).item.handle : undefined;
		const childrenNodes = (this.getChildrenNodes(parent) || []);

		let handle: TreeItemHandle;
		let counter = 0;
		do {
			handle = `${prefix}/${counter}:${elementId}`;
			if (returnFirst || !this.elements.has(handle) || existingHandle === handle) {
				// Return first if asked for or
				// Return if handle does not exist or
				// Return if handle is being reused
				break;
			}
			counter++;
		} while (counter <= childrenNodes.length);

		return handle;
	}

	private getLightIconPath(extensionTreeItem: vscode.TreeItem): URI {
		if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof ThemeIcon)) {
			if (typeof extensionTreeItem.iconPath === 'string'
				|| extensionTreeItem.iconPath instanceof URI) {
				return this.getIconPath(extensionTreeItem.iconPath);
			}
			return this.getIconPath(extensionTreeItem.iconPath['light']);
		}
		return undefined;
	}

	private getDarkIconPath(extensionTreeItem: vscode.TreeItem): URI {
		if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof ThemeIcon) && extensionTreeItem.iconPath['dark']) {
			return this.getIconPath(extensionTreeItem.iconPath['dark']);
		}
		return undefined;
	}

	private getIconPath(iconPath: string | URI): URI {
		if (iconPath instanceof URI) {
			return iconPath;
		}
		return URI.file(iconPath);
	}

	private addNodeToCache(element: T, node: TreeNode): void {
		this.elements.set(node.item.handle, element);
		this.nodes.set(element, node);
	}

	private updateNodeCache(element: T, newNode: TreeNode, existing: TreeNode, parentNode: TreeNode): void {
		// Remove from the cache
		this.elements.delete(newNode.item.handle);
		this.nodes.delete(element);
		if (newNode.item.handle !== existing.item.handle) {
			this.elements.delete(existing.item.handle);
		}

		// Add the new node to the cache
		this.addNodeToCache(element, newNode);

		// Replace the node in parent's children nodes
		const childrenNodes = (this.getChildrenNodes(parentNode) || []);
		const childNode = childrenNodes.filter(c => c.item.handle === existing.item.handle)[0];
		if (childNode) {
			childrenNodes.splice(childrenNodes.indexOf(childNode), 1, newNode);
		}
	}

	private addNodeToParentCache(node: TreeNode, parentNode: TreeNode): void {
		if (parentNode) {
			if (!parentNode.children) {
				parentNode.children = [];
			}
			parentNode.children.push(node);
		} else {
			if (!this.roots) {
				this.roots = [];
			}
			this.roots.push(node);
		}
	}

	private clearChildren(parentElement?: T): void {
		if (parentElement) {
			let node = this.nodes.get(parentElement);
			if (node.children) {
				for (const child of node.children) {
					const childEleement = this.elements.get(child.item.handle);
					if (childEleement) {
						this.clear(childEleement);
					}
				}
			}
			node.children = undefined;
		} else {
			this.clearAll();
		}
	}

	private clear(element: T): void {
		let node = this.nodes.get(element);
		if (node.children) {
			for (const child of node.children) {
				const childEleement = this.elements.get(child.item.handle);
				if (childEleement) {
					this.clear(childEleement);
				}
			}
		}
		this.nodes.delete(element);
		this.elements.delete(node.item.handle);
	}

	private clearAll(): void {
		this.roots = null;
		this.elements.clear();
		this.nodes.clear();
	}

	dispose() {
		this.clearAll();
	}
}
