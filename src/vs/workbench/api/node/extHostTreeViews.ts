/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import * as vscode from 'vscode';
import { basename } from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { debounceEvent, Emitter, Event } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/base/common/lifecycle';
import { ExtHostTreeViewsShape, MainThreadTreeViewsShape } from './extHost.protocol';
import { ITreeItem, TreeViewItemHandleArg } from 'vs/workbench/common/views';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';
import { TreeItemCollapsibleState, ThemeIcon } from 'vs/workbench/api/node/extHostTypes';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { equals } from 'vs/base/common/arrays';
import { ILogService } from 'vs/platform/log/common/log';

type TreeItemHandle = string;

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

	registerTreeDataProvider<T>(id: string, treeDataProvider: vscode.TreeDataProvider<T>): vscode.Disposable {
		const treeView = this.createTreeView(id, { treeDataProvider });
		return { dispose: () => treeView.dispose() };
	}

	createTreeView<T>(viewId: string, options: { treeDataProvider: vscode.TreeDataProvider<T> }): vscode.TreeView<T> {
		if (!options || !options.treeDataProvider) {
			throw new Error('Options with treeDataProvider is mandatory');
		}
		const treeView = this.createExtHostTreeViewer(viewId, options.treeDataProvider);
		return {
			get onDidCollapseElement() { return treeView.onDidCollapseElement; },
			get onDidExpandElement() { return treeView.onDidExpandElement; },
			get selection() { return treeView.selectedElements; },
			get onDidChangeSelection() { return treeView.onDidChangeSelection; },
			get visible() { return treeView.visible; },
			get onDidChangeVisibility() { return treeView.onDidChangeVisibility; },
			reveal: (element: T, options?: { select?: boolean, focus?: boolean }): Thenable<void> => {
				return treeView.reveal(element, options);
			},
			dispose: () => {
				this.treeViews.delete(viewId);
				treeView.dispose();
			}
		};
	}

	$getChildren(treeViewId: string, treeItemHandle?: string): TPromise<ITreeItem[]> {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			return TPromise.wrapError<ITreeItem[]>(new Error(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId)));
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

	private createExtHostTreeViewer<T>(id: string, dataProvider: vscode.TreeDataProvider<T>): ExtHostTreeView<T> {
		const treeView = new ExtHostTreeView<T>(id, dataProvider, this._proxy, this.commands.converter, this.logService);
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

	private roots: TreeNode[] = null;
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

	private refreshPromise: TPromise<void> = TPromise.as(null);

	constructor(private viewId: string, private dataProvider: vscode.TreeDataProvider<T>, private proxy: MainThreadTreeViewsShape, private commands: CommandsConverter, private logService: ILogService) {
		super();
		this.proxy.$registerTreeViewDataProvider(viewId);
		if (this.dataProvider.onDidChangeTreeData) {
			let refreshingPromise, promiseCallback;
			this._register(debounceEvent<T, T[]>(this.dataProvider.onDidChangeTreeData, (last, current) => {
				if (!refreshingPromise) {
					// New refresh has started
					refreshingPromise = new TPromise((c, e) => promiseCallback = c);
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

	getChildren(parentHandle?: TreeItemHandle): TPromise<ITreeItem[]> {
		const parentElement = parentHandle ? this.getExtensionElement(parentHandle) : void 0;
		if (parentHandle && !parentElement) {
			console.error(`No tree item with id \'${parentHandle}\' found.`);
			return TPromise.as([]);
		}

		const childrenNodes = this.getChildrenNodes(parentHandle); // Get it from cache
		return (childrenNodes ? TPromise.as(childrenNodes) : this.fetchChildrenNodes(parentElement))
			.then(nodes => nodes.map(n => n.item));
	}

	getExtensionElement(treeItemHandle: TreeItemHandle): T {
		return this.elements.get(treeItemHandle);
	}

	reveal(element: T, options?: { select?: boolean, focus?: boolean }): TPromise<void> {
		options = options ? options : { select: true, focus: false };
		const select = isUndefinedOrNull(options.select) ? true : options.select;
		const focus = isUndefinedOrNull(options.focus) ? false : options.focus;

		if (typeof this.dataProvider.getParent !== 'function') {
			return TPromise.wrapError(new Error(`Required registered TreeDataProvider to implement 'getParent' method to access 'reveal' method`));
		}
		return this.refreshPromise
			.then(() => this.resolveUnknownParentChain(element))
			.then(parentChain => this.resolveTreeNode(element, parentChain[parentChain.length - 1])
				.then(treeNode => this.proxy.$reveal(this.viewId, treeNode.item, parentChain.map(p => p.item), { select, focus })), error => this.logService.error(error));
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

	private resolveUnknownParentChain(element: T): TPromise<TreeNode[]> {
		return this.resolveParent(element)
			.then((parent) => {
				if (!parent) {
					return TPromise.as([]);
				}
				return this.resolveUnknownParentChain(parent)
					.then(result => this.resolveTreeNode(parent, result[result.length - 1])
						.then(parentNode => {
							result.push(parentNode);
							return result;
						}));
			});
	}

	private resolveParent(element: T): TPromise<T> {
		const node = this.nodes.get(element);
		if (node) {
			return TPromise.as(node.parent ? this.elements.get(node.parent.item.handle) : null);
		}
		return asWinJsPromise(() => this.dataProvider.getParent(element));
	}

	private resolveTreeNode(element: T, parent?: TreeNode): TPromise<TreeNode> {
		return asWinJsPromise(() => this.dataProvider.getTreeItem(element))
			.then(extTreeItem => this.createHandle(element, extTreeItem, parent, true))
			.then(handle => this.getChildren(parent ? parent.item.handle : null)
				.then(() => {
					const cachedElement = this.getExtensionElement(handle);
					if (cachedElement) {
						const node = this.nodes.get(cachedElement);
						if (node) {
							return TPromise.as(node);
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

	private fetchChildrenNodes(parentElement?: T): TPromise<TreeNode[]> {
		// clear children cache
		this.clearChildren(parentElement);

		const parentNode = parentElement ? this.nodes.get(parentElement) : void 0;
		return asWinJsPromise(() => this.dataProvider.getChildren(parentElement))
			.then(elements => TPromise.join(
				(elements || [])
					.filter(element => !!element)
					.map(element => asWinJsPromise(() => this.dataProvider.getTreeItem(element))
						.then(extTreeItem => extTreeItem ? this.createAndRegisterTreeNode(element, extTreeItem, parentNode) : null))))
			.then(nodes => nodes.filter(n => !!n));
	}

	private refresh(elements: T[]): TPromise<void> {
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
		return TPromise.as(null);
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

	private refreshHandles(itemHandles: TreeItemHandle[]): TPromise<void> {
		const itemsToRefresh: { [treeItemHandle: string]: ITreeItem } = {};
		return TPromise.join(itemHandles.map(treeItemHandle =>
			this.refreshNode(treeItemHandle)
				.then(node => {
					if (node) {
						itemsToRefresh[treeItemHandle] = node.item;
					}
				})))
			.then(() => Object.keys(itemsToRefresh).length ? this.proxy.$refresh(this.viewId, itemsToRefresh) : null);
	}

	private refreshNode(treeItemHandle: TreeItemHandle): TPromise<TreeNode> {
		const extElement = this.getExtensionElement(treeItemHandle);
		const existing = this.nodes.get(extElement);
		this.clearChildren(extElement); // clear children cache
		return asWinJsPromise(() => this.dataProvider.getTreeItem(extElement))
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
			children: void 0
		};
	}

	private createTreeItem(element: T, extensionTreeItem: vscode.TreeItem, parent?: TreeNode): ITreeItem {

		const handle = this.createHandle(element, extensionTreeItem, parent);
		const icon = this.getLightIconPath(extensionTreeItem);
		const item = {
			handle,
			parentHandle: parent ? parent.item.handle : void 0,
			label: extensionTreeItem.label,
			resourceUri: extensionTreeItem.resourceUri,
			tooltip: typeof extensionTreeItem.tooltip === 'string' ? extensionTreeItem.tooltip : void 0,
			command: extensionTreeItem.command ? this.commands.toInternal(extensionTreeItem.command) : void 0,
			contextValue: extensionTreeItem.contextValue,
			icon,
			iconDark: this.getDarkIconPath(extensionTreeItem) || icon,
			themeIcon: extensionTreeItem.iconPath instanceof ThemeIcon ? { id: extensionTreeItem.iconPath.id } : void 0,
			collapsibleState: isUndefinedOrNull(extensionTreeItem.collapsibleState) ? TreeItemCollapsibleState.None : extensionTreeItem.collapsibleState
		};

		return item;
	}

	private createHandle(element: T, { id, label, resourceUri }: vscode.TreeItem, parent: TreeNode, returnFirst?: boolean): TreeItemHandle {
		if (id) {
			return `${ExtHostTreeView.ID_HANDLE_PREFIX}/${id}`;
		}

		const prefix: string = parent ? parent.item.handle : ExtHostTreeView.LABEL_HANDLE_PREFIX;
		let elementId = label ? label : resourceUri ? basename(resourceUri.path) : '';
		elementId = elementId.indexOf('/') !== -1 ? elementId.replace('/', '//') : elementId;
		const existingHandle = this.nodes.has(element) ? this.nodes.get(element).item.handle : void 0;
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

	private getLightIconPath(extensionTreeItem: vscode.TreeItem): string {
		if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof ThemeIcon)) {
			if (typeof extensionTreeItem.iconPath === 'string'
				|| extensionTreeItem.iconPath instanceof URI) {
				return this.getIconPath(extensionTreeItem.iconPath);
			}
			return this.getIconPath(extensionTreeItem.iconPath['light']);
		}
		return void 0;
	}

	private getDarkIconPath(extensionTreeItem: vscode.TreeItem): string {
		if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof ThemeIcon) && extensionTreeItem.iconPath['dark']) {
			return this.getIconPath(extensionTreeItem.iconPath['dark']);
		}
		return void 0;
	}

	private getIconPath(iconPath: string | URI): string {
		if (iconPath instanceof URI) {
			return iconPath.toString();
		}
		return URI.file(iconPath).toString();
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
			node.children = void 0;
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