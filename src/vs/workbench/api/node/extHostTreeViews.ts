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
import { coalesce } from 'vs/base/common/arrays';

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
		return treeView.getChildren();
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
	handle: TreeItemHandle;
	parentHandle: TreeItemHandle;
	childrenHandles: TreeItemHandle[];
}

class ExtHostTreeView<T> extends Disposable {

	private static LABEL_HANDLE_PREFIX = '0';
	private static ID_HANDLE_PREFIX = '1';

	private rootHandles: TreeItemHandle[] = [];
	private elements: Map<TreeItemHandle, T> = new Map<TreeItemHandle, T>();
	private nodes: Map<T, TreeNode> = new Map<T, TreeNode>();

	constructor(private viewId: string, private dataProvider: vscode.TreeDataProvider<T>, private proxy: MainThreadTreeViewsShape, private commands: CommandsConverter) {
		super();
		this.proxy.$registerView(viewId);
		if (dataProvider.onDidChangeTreeData) {
			this._register(debounceEvent<T, T[]>(dataProvider.onDidChangeTreeData, (last, current) => last ? [...last, current] : [current], 200)(elements => this.refresh(elements)));
		}
	}

	getChildren(parentHandle?: TreeItemHandle): TPromise<ITreeItem[]> {
		const parentElement = parentHandle ? this.getExtensionElement(parentHandle) : void 0;
		if (parentHandle && !parentElement) {
			console.error(`No tree item with id \'${parentHandle}\' found.`);
			return TPromise.as([]);
		}

		this.clearChildren(parentElement);
		return asWinJsPromise(() => this.dataProvider.getChildren(parentElement))
			.then(elements => TPromise.join(
				coalesce(elements || []).map(element =>
					asWinJsPromise(() => this.dataProvider.getTreeItem(element))
						.then(extTreeItem => {
							if (extTreeItem) {
								if (typeof element === 'string' && this.elements.has(this.createHandle(element, extTreeItem))) {
									throw new Error(localize('treeView.duplicateElement', 'Element {0} is already registered', element));
								}
								return { element, extTreeItem };
							}
							return null;
						})
				))).then(extTreeItems => extTreeItems.map((({ element, extTreeItem }) => this.createTreeItem(element, extTreeItem, parentHandle))));
	}

	getExtensionElement(treeItemHandle: TreeItemHandle): T {
		return this.elements.get(treeItemHandle);
	}

	private refresh(elements: T[]): void {
		const hasRoot = elements.some(element => !element);
		if (hasRoot) {
			this.proxy.$refresh(this.viewId);
		} else {
			const handlesToRefresh = this.getHandlesToRefresh(elements);
			if (handlesToRefresh.length) {
				this.refreshHandles(handlesToRefresh);
			}
		}
	}

	private getHandlesToRefresh(elements: T[]): TreeItemHandle[] {
		const elementsToUpdate = new Set<TreeItemHandle>();
		for (const element of elements) {
			let elementNode = this.nodes.get(element);
			if (elementNode && !elementsToUpdate.has(elementNode.handle)) {
				// check if an ancestor of extElement is already in the elements to update list
				let currentNode = elementNode;
				while (currentNode && currentNode.parentHandle && !elementsToUpdate.has(currentNode.parentHandle)) {
					const parentElement = this.elements.get(currentNode.parentHandle);
					currentNode = this.nodes.get(parentElement);
				}
				if (!currentNode.parentHandle) {
					elementsToUpdate.add(elementNode.handle);
				}
			}
		}

		const handlesToUpdate: TreeItemHandle[] = [];
		// Take only top level elements
		elementsToUpdate.forEach((handle) => {
			const element = this.elements.get(handle);
			let node = this.nodes.get(element);
			if (node && !elementsToUpdate.has(node.parentHandle)) {
				handlesToUpdate.push(handle);
			}
		});

		return handlesToUpdate;
	}

	private refreshHandles(itemHandles: TreeItemHandle[]): TPromise<void> {
		const itemsToRefresh: { [handle: string]: ITreeItem } = {};
		const promises: TPromise<void>[] = [];
		itemHandles.forEach(treeItemHandle => {
			const extElement = this.getExtensionElement(treeItemHandle);
			const node = this.nodes.get(extElement);
			promises.push(asWinJsPromise(() => this.dataProvider.getTreeItem(extElement))
				.then(extTreeItem => {
					if (extTreeItem) {
						itemsToRefresh[treeItemHandle] = this.createTreeItem(extElement, extTreeItem, node.parentHandle);
					}
				}));
		});
		return TPromise.join(promises)
			.then(treeItems => this.proxy.$refresh(this.viewId, itemsToRefresh));
	}

	private createTreeItem(element: T, extensionTreeItem: vscode.TreeItem, parentHandle: TreeItemHandle): ITreeItem {

		const handle = this.createHandle(element, extensionTreeItem, parentHandle);
		const icon = this.getLightIconPath(extensionTreeItem);
		this.update(element, handle, parentHandle);

		return {
			handle,
			parentHandle,
			label: extensionTreeItem.label,
			command: extensionTreeItem.command ? this.commands.toInternal(extensionTreeItem.command) : void 0,
			contextValue: extensionTreeItem.contextValue,
			icon,
			iconDark: this.getDarkIconPath(extensionTreeItem) || icon,
			collapsibleState: extensionTreeItem.collapsibleState
		};
	}

	private createHandle(element: T, { label }: vscode.TreeItem, parentHandle?: TreeItemHandle): TreeItemHandle {
		if (typeof element === 'string') {
			return `${ExtHostTreeView.ID_HANDLE_PREFIX}/${element}`;
		}

		const prefix = parentHandle ? parentHandle : ExtHostTreeView.LABEL_HANDLE_PREFIX;
		label = label.indexOf('/') !== -1 ? label.replace('/', '//') : label;
		const existingHandle = this.nodes.has(element) ? this.nodes.get(element).handle : void 0;

		for (let labelCount = 0; labelCount <= this.getChildrenHandles(parentHandle).length; labelCount++) {
			const handle = `${prefix}/${labelCount}:${label}`;
			if (!this.elements.has(handle) || existingHandle === handle) {
				return handle;
			}
		}

		throw new Error('This should not be reached');
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

	private getChildrenHandles(parentHandle?: TreeItemHandle): TreeItemHandle[] {
		return parentHandle ? this.nodes.get(this.getExtensionElement(parentHandle)).childrenHandles : this.rootHandles;
	}

	private update(element: T, handle: TreeItemHandle, parentHandle: TreeItemHandle): void {
		const node = this.nodes.get(element);
		const childrenHandles = this.getChildrenHandles(parentHandle);

		// Update parent node
		if (node) {
			if (node.handle !== handle) {
				childrenHandles[childrenHandles.indexOf(node.handle)] = handle;
				this.clearChildren(element);
			}
		} else {
			childrenHandles.push(handle);
		}

		// Update element maps
		this.elements.set(handle, element);
		this.nodes.set(element, {
			handle,
			parentHandle,
			childrenHandles: node ? node.childrenHandles : []
		});
	}

	private clearChildren(parentElement?: T): void {
		if (parentElement) {
			let node = this.nodes.get(parentElement);
			if (node.childrenHandles) {
				for (const childHandle of node.childrenHandles) {
					const childEleement = this.elements.get(childHandle);
					if (childEleement) {
						this.clear(childEleement);
					}
				}
			}
			node.childrenHandles = [];
		} else {
			this.clearAll();
		}
	}

	private clear(element: T): void {
		let node = this.nodes.get(element);
		if (node.childrenHandles) {
			for (const childHandle of node.childrenHandles) {
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
		this.rootHandles = [];
		this.elements.clear();
		this.nodes.clear();
	}

	dispose() {
		this.clearAll();
	}
}