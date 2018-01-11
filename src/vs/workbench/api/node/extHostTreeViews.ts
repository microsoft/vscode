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

	getChildren(parentHandle?: TreeItemHandle): TPromise<ITreeItem[]> {
		let parentElement;
		if (parentHandle) {
			parentElement = this.getExtensionElement(parentHandle);
			if (!parentElement) {
				return TPromise.wrapError<ITreeItem[]>(new Error(localize('treeItem.notFound', 'No tree item with id \'{0}\' found.', parentHandle)));
			}
		}

		return asWinJsPromise(() => this.dataProvider.getChildren(parentElement))
			.then(elements => {
				elements = coalesce(elements || []);
				return TPromise.join(elements.map((element, index) => {
					const node = this.nodes.get(element);
					const currentHandle = node && node.parentHandle === parentHandle ? node.handle : void 0;
					return this.resolveElement(element, currentHandle ? currentHandle : index, parentHandle)
						.then(treeItem => {
							if (treeItem) {
								if (!currentHandle) {
									// update the caches if current handle is not used
									this.nodes.set(element, {
										handle: treeItem.handle,
										parentHandle,
										childrenHandles: void 0
									});
									this.elements.set(treeItem.handle, element);
								}
							}
							return treeItem;
						});
				})).then(treeItems => this.updateChildren(coalesce(treeItems), parentElement));
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
			const handlesToRefresh = this.getHandlesToRefresh(elements);
			if (handlesToRefresh.length) {
				this.refreshHandles(handlesToRefresh);
			}
		}
	}

	private resolveElement(element: T, handleOrIndex: TreeItemHandle | number, parentHandle: TreeItemHandle): TPromise<ITreeItem> {
		return asWinJsPromise(() => this.dataProvider.getTreeItem(element))
			.then(extTreeItem => this.massageTreeItem(element, extTreeItem, handleOrIndex, parentHandle));
	}

	private massageTreeItem(element: T, extensionTreeItem: vscode.TreeItem, handleOrIndex: TreeItemHandle | number, parentHandle: TreeItemHandle): ITreeItem {
		if (!extensionTreeItem) {
			return null;
		}

		const icon = this.getLightIconPath(extensionTreeItem);
		const label = extensionTreeItem.label;
		const handle = typeof handleOrIndex === 'number' ?
			this.generateHandle(label, handleOrIndex, parentHandle) // create the handle
			: handleOrIndex; // reuse the passed handle

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
			promises.push(this.resolveElement(extElement, treeItemHandle, node.parentHandle)
				.then(treeItem => {
					itemsToRefresh[treeItemHandle] = treeItem;
				}));
		});
		return TPromise.join(promises)
			.then(treeItems => {
				this.proxy.$refresh(this.viewId, itemsToRefresh);
			});
	}

	private updateChildren(newChildren: ITreeItem[], parentElement?: T): ITreeItem[] {
		let existingChildrenHandles: TreeItemHandle[] = [];
		if (parentElement) {
			const parentNode = this.nodes.get(parentElement);
			existingChildrenHandles = parentNode.childrenHandles || [];
			parentNode.childrenHandles = newChildren.map(c => c.handle);
		} else {
			this.nodes.forEach(node => {
				if (!node.parentHandle) {
					existingChildrenHandles.push(node.handle);
				}
			});
		}

		for (const existingChildHandle of existingChildrenHandles) {
			const existingChildElement = this.elements.get(existingChildHandle);
			if (existingChildElement && newChildren.every(c => c.handle !== existingChildHandle)) {
				this.clear(existingChildElement);
			}
		}

		return newChildren;
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

	dispose() {
		this.elements.clear();
		this.nodes.clear();
	}
}