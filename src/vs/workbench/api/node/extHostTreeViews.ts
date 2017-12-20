/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import * as vscode from 'vscode';
import URI from 'vs/base/common/uri';
import { debounceEvent } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/base/common/lifecycle';
import { ExtHostTreeViewsShape, MainThreadTreeViewsShape } from './extHost.protocol';
import { ITreeItem, TreeViewItemHandleArg } from 'vs/workbench/common/views';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';

type TreeItemHandle = string;

export class ExtHostTreeViews implements ExtHostTreeViewsShape {

	private treeViews: Map<string, ExtHostTreeView<any>> = new Map<string, ExtHostTreeView<any>>();

	constructor(
		private _proxy: MainThreadTreeViewsShape,
		private commands: ExtHostCommands
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
		const treeView = new ExtHostTreeView<T>(id, treeDataProvider, this._proxy, this.commands.converter);
		this.treeViews.set(id, treeView);
		return {
			dispose: () => {
				this.treeViews.delete(id);
				treeView.dispose();
			}
		};
	}

	$getElements(treeViewId: string): TPromise<ITreeItem[]> {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			return TPromise.wrapError<ITreeItem[]>(new Error(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId)));
		}
		return treeView.getTreeItems();
	}

	$getChildren(treeViewId: string, treeItemHandle?: string): TPromise<ITreeItem[]> {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			return TPromise.wrapError<ITreeItem[]>(new Error(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId)));
		}
		return treeView.getChildren(treeItemHandle);
	}

	private convertArgument(arg: TreeViewItemHandleArg): any {
		const treeView = this.treeViews.get(arg.$treeViewId);
		return treeView ? treeView.getExtensionElement(arg.$treeItemHandle) : null;
	}
}

interface TreeNode {
	index: number;
	handle: TreeItemHandle;
	parent: TreeItemHandle;
	children: TreeItemHandle[];
}

class ExtHostTreeView<T> extends Disposable {

	private static ROOT_HANDLE = '0';
	private elements: Map<TreeItemHandle, T> = new Map<TreeItemHandle, T>();
	private nodes: Map<T, TreeNode> = new Map<T, TreeNode>();

	constructor(private viewId: string, private dataProvider: vscode.TreeDataProvider<T>, private proxy: MainThreadTreeViewsShape, private commands: CommandsConverter) {
		super();
		this.proxy.$registerView(viewId);
		if (dataProvider.onDidChangeTreeData) {
			this._register(debounceEvent<T, T[]>(dataProvider.onDidChangeTreeData, (last, current) => last ? [...last, current] : [current], 200)(elements => this._refresh(elements)));
		}
	}

	getTreeItems(): TPromise<ITreeItem[]> {
		this.clearAll();
		return asWinJsPromise(() => this.dataProvider.getChildren())
			.then(elements => this.resolveElements(elements));
	}

	getChildren(treeItemHandle: TreeItemHandle): TPromise<ITreeItem[]> {
		let extElement = this.getExtensionElement(treeItemHandle);
		if (extElement) {
			this.clearChildren(extElement);
		} else {
			return TPromise.wrapError<ITreeItem[]>(new Error(localize('treeItem.notFound', 'No tree item with id \'{0}\' found.', treeItemHandle)));
		}

		return asWinJsPromise(() => this.dataProvider.getChildren(extElement))
			.then(childrenElements => this.resolveElements(childrenElements, treeItemHandle))
			.then(childrenItems => {
				this.nodes.get(extElement).children = childrenItems.map(c => c.handle);
				return childrenItems;
			});
	}

	getExtensionElement(treeItemHandle: TreeItemHandle): T {
		return this.elements.get(treeItemHandle);
	}

	private _refresh(elements: T[]): void {
		const hasRoot = elements.some(element => !element);
		if (hasRoot) {
			this.proxy.$refresh(this.viewId);
		} else {
			const handlesToUpdate = this.getHandlesToUpdate(elements);
			if (handlesToUpdate.length) {
				this._refreshHandles(handlesToUpdate);
			}
		}
	}

	private resolveElements(elements: T[], parentHandle?: TreeItemHandle): TPromise<ITreeItem[]> {
		if (elements && elements.length) {
			return TPromise.join(
				elements.filter(element => !!element)
					.map((element, index) => {
						return this.resolveElement(element, index, parentHandle)
							.then(treeItem => {
								if (treeItem) {
									this.nodes.set(element, {
										index,
										handle: treeItem.handle,
										parent: parentHandle,
										children: void 0
									});
									if (this.elements.has(treeItem.handle)) {
										return TPromise.wrapError<ITreeItem>(new Error(localize('treeView.duplicateElement', 'Element {0} is already registered', element)));
									}
									this.elements.set(treeItem.handle, element);
								}
								return treeItem;
							});
					}))
				.then(treeItems => treeItems.filter(treeItem => !!treeItem));
		}
		return TPromise.as([]);
	}

	private resolveElement(element: T, index: number, parentHandle?: TreeItemHandle): TPromise<ITreeItem> {
		return asWinJsPromise(() => this.dataProvider.getTreeItem(element))
			.then(extTreeItem => this.massageTreeItem(element, extTreeItem, index, parentHandle));
	}

	private massageTreeItem(element: T, extensionTreeItem: vscode.TreeItem, index: number, parentHandle: TreeItemHandle): ITreeItem {
		if (!extensionTreeItem) {
			return null;
		}
		const icon = this.getLightIconPath(extensionTreeItem);
		const label = extensionTreeItem.label;
		const handle = typeof element === 'string' ? element : this.generateHandle(label, index, parentHandle);
		return {
			handle,
			parentHandle,
			label,
			command: extensionTreeItem.command ? this.commands.toInternal(extensionTreeItem.command) : void 0,
			contextValue: extensionTreeItem.contextValue,
			icon,
			iconDark: this.getDarkIconPath(extensionTreeItem) || icon,
			collapsibleState: extensionTreeItem.collapsibleState
		};
	}

	private generateHandle(label: string, index: number, parentHandle: TreeItemHandle): TreeItemHandle {
		parentHandle = parentHandle ? parentHandle : ExtHostTreeView.ROOT_HANDLE;
		label = label.indexOf('/') !== -1 ? label.replace('/', '//') : label;
		return `${parentHandle}/${index}:${label}`;
	}

	private getLightIconPath(extensionTreeItem: vscode.TreeItem): string {
		if (extensionTreeItem.iconPath) {
			if (typeof extensionTreeItem.iconPath === 'string' || extensionTreeItem.iconPath instanceof URI) {
				return this.getIconPath(extensionTreeItem.iconPath);
			}
			return this.getIconPath(extensionTreeItem.iconPath['light']);
		}
		return void 0;
	}

	private getDarkIconPath(extensionTreeItem: vscode.TreeItem): string {
		if (extensionTreeItem.iconPath && extensionTreeItem.iconPath['dark']) {
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

	private getHandlesToUpdate(elements: T[]): TreeItemHandle[] {
		const elementsToUpdate = new Set<TreeItemHandle>();
		for (const element of elements) {
			let elementNode = this.nodes.get(element);
			if (elementNode && !elementsToUpdate.has(elementNode.handle)) {
				// check if an ancestor of extElement is already in the elements to update list
				let currentNode = elementNode;
				while (currentNode && currentNode.parent && !elementsToUpdate.has(currentNode.parent)) {
					const parentElement = this.elements.get(currentNode.parent);
					currentNode = this.nodes.get(parentElement);
				}
				if (!currentNode.parent) {
					elementsToUpdate.add(elementNode.handle);
				}
			}
		}

		const handlesToUpdate: TreeItemHandle[] = [];
		// Take only top level elements
		elementsToUpdate.forEach((handle) => {
			const element = this.elements.get(handle);
			let node = this.nodes.get(element);
			if (node && !elementsToUpdate.has(node.parent)) {
				handlesToUpdate.push(handle);
			}
		});

		return handlesToUpdate;
	}

	private _refreshHandles(itemHandles: TreeItemHandle[]): TPromise<void> {
		const itemsToRefresh: { [handle: string]: ITreeItem } = {};
		const promises: TPromise<void>[] = [];
		itemHandles.forEach(treeItemHandle => {
			const extElement = this.getExtensionElement(treeItemHandle);
			const node = this.nodes.get(extElement);
			const promise = this.resolveElement(extElement, node.index, node.parent)
				.then(treeItem => {
					if (treeItemHandle !== treeItem.handle) {
						// Update caches if handle changes
						this.updateCaches(node, treeItem, extElement);
					}
					itemsToRefresh[treeItemHandle] = treeItem;
				});
			promises.push(promise);
		});
		return TPromise.join(promises)
			.then(treeItems => {
				this.proxy.$refresh(this.viewId, itemsToRefresh);
			});
	}

	private updateCaches(node: TreeNode, treeItem: ITreeItem, element: T): void {
		if (node.parent) {
			// Update parent's children handles
			const parentElement = this.getExtensionElement(node.parent);
			const parentNode = this.nodes.get(parentElement);
			parentNode.children[node.index] = treeItem.handle;
		}

		// Update elements map
		this.elements.delete(node.handle);
		this.elements.set(treeItem.handle, element);

		// Update node
		node.handle = treeItem.handle;
	}

	private clearChildren(element: T): void {
		let node = this.nodes.get(element);
		if (node.children) {
			for (const childHandle of node.children) {
				const childEleement = this.elements.get(childHandle);
				if (childEleement) {
					this.clear(childEleement);
				}
			}
		}
		node.children = void 0;
	}

	private clear(element: T): void {
		let node = this.nodes.get(element);
		if (node.children) {
			for (const childHandle of node.children) {
				const childEleement = this.elements.get(childHandle);
				if (childEleement) {
					this.clear(childEleement);
				}
			}
		}
		this.nodes.delete(element);
		this.elements.delete(node.handle);
	}

	private clearAll(): void {
		this.elements.clear();
		this.nodes.clear();
	}

	dispose() {
		this.clearAll();
	}
}