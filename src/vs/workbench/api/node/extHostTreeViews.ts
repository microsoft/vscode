/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import * as vscode from 'vscode';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/base/common/lifecycle';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, ExtHostTreeViewsShape, MainThreadTreeViewsShape } from './extHost.protocol';
import { ITreeItem, TreeViewItemHandleArg } from 'vs/workbench/parts/views/common/views';
import { TreeItemCollapsibleState } from './extHostTypes';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';

type TreeItemHandle = number;

export class ExtHostTreeViews extends ExtHostTreeViewsShape {

	private treeViews: Map<string, ExtHostTreeView<any>> = new Map<string, ExtHostTreeView<any>>();
	private _proxy: MainThreadTreeViewsShape;

	constructor(
		threadService: IThreadService,
		private commands: ExtHostCommands
	) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadTreeViews);
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

	$getChildren(treeViewId: string, treeItemHandle?: number): TPromise<ITreeItem[]> {
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

class ExtHostTreeView<T> extends Disposable {

	private _itemHandlePool = 0;

	private extElementsMap: Map<TreeItemHandle, T> = new Map<TreeItemHandle, T>();
	private itemHandlesMap: Map<T, TreeItemHandle> = new Map<T, TreeItemHandle>();
	private extChildrenElementsMap: Map<T, T[]> = new Map<T, T[]>();

	constructor(private viewId: string, private dataProvider: vscode.TreeDataProvider<T>, private proxy: MainThreadTreeViewsShape, private commands: CommandsConverter, ) {
		super();
		this.proxy.$registerView(viewId);
		if (dataProvider.onDidChangeTreeData) {
			this._register(dataProvider.onDidChangeTreeData(element => this._refresh(element)));
		}
	}

	getTreeItems(): TPromise<ITreeItem[]> {
		this.extChildrenElementsMap.clear();
		this.extElementsMap.clear();
		this.itemHandlesMap.clear();

		return asWinJsPromise(() => this.dataProvider.getChildren())
			.then(elements => this.processAndMapElements(elements));
	}

	getChildren(treeItemHandle: TreeItemHandle): TPromise<ITreeItem[]> {
		let extElement = this.getExtensionElement(treeItemHandle);
		if (extElement) {
			this.clearChildren(extElement);
		} else {
			return TPromise.wrapError<ITreeItem[]>(new Error(localize('treeItem.notFound', 'No tree item with id \'{0}\' found.', treeItemHandle)));
		}

		return asWinJsPromise(() => this.dataProvider.getChildren(extElement))
			.then(childrenElements => this.processAndMapElements(childrenElements));
	}

	getExtensionElement(treeItemHandle: TreeItemHandle): T {
		return this.extElementsMap.get(treeItemHandle);
	}

	private _refresh(element: T): void {
		if (element) {
			const itemHandle = this.itemHandlesMap.get(element);
			if (itemHandle) {
				this.proxy.$refresh(this.viewId, itemHandle);
			}
		} else {
			this.proxy.$refresh(this.viewId);
		}
	}

	private processAndMapElements(elements: T[]): TPromise<ITreeItem[]> {
		if (elements && elements.length) {
			return TPromise.join(
				elements.filter(element => !!element)
					.map(element => {
						if (this.extChildrenElementsMap.has(element)) {
							return TPromise.wrapError<ITreeItem>(new Error(localize('treeView.duplicateElement', 'Element {0} is already registered', element)));
						}
						return this.resolveElement(element);
					}))
				.then(treeItems => treeItems.filter(treeItem => !!treeItem));
		}
		return TPromise.as([]);
	}

	private resolveElement(element: T): TPromise<ITreeItem> {
		return asWinJsPromise(() => this.dataProvider.getTreeItem(element))
			.then(extTreeItem => {
				const treeItem = this.massageTreeItem(extTreeItem);
				if (treeItem) {
					this.itemHandlesMap.set(element, treeItem.handle);
					this.extElementsMap.set(treeItem.handle, element);
					if (treeItem.collapsibleState === TreeItemCollapsibleState.Expanded) {
						return this.getChildren(treeItem.handle).then(children => {
							treeItem.children = children;
							return treeItem;
						});
					} else {
						return treeItem;
					}
				}
				return null;
			});
	}

	private massageTreeItem(extensionTreeItem: vscode.TreeItem): ITreeItem {
		if (!extensionTreeItem) {
			return null;
		}
		const icon = this.getLightIconPath(extensionTreeItem);
		return {
			handle: ++this._itemHandlePool,
			label: extensionTreeItem.label,
			command: extensionTreeItem.command ? this.commands.toInternal(extensionTreeItem.command) : void 0,
			contextValue: extensionTreeItem.contextValue,
			icon,
			iconDark: this.getDarkIconPath(extensionTreeItem) || icon,
			collapsibleState: extensionTreeItem.collapsibleState,
		};
	}

	private getLightIconPath(extensionTreeItem: vscode.TreeItem) {
		if (extensionTreeItem.iconPath) {
			if (typeof extensionTreeItem.iconPath === 'string' || extensionTreeItem.iconPath instanceof URI) {
				return this.getIconPath(extensionTreeItem.iconPath);
			}
			return this.getIconPath(extensionTreeItem.iconPath['light']);
		}
		return void 0;
	}

	private getDarkIconPath(extensionTreeItem: vscode.TreeItem) {
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

	private clearChildren(extElement: T): void {
		const children = this.extChildrenElementsMap.get(extElement);
		if (children) {
			for (const child of children) {
				this.clearElement(child);
			}
			this.extChildrenElementsMap.delete(extElement);
		}
	}

	private clearElement(extElement: T): void {
		this.clearChildren(extElement);

		const treeItemhandle = this.itemHandlesMap.get(extElement);
		this.itemHandlesMap.delete(extElement);
		if (treeItemhandle) {
			this.extElementsMap.delete(treeItemhandle);
		}
	}

	dispose() {
		this.extElementsMap.clear();
		this.itemHandlesMap.clear();
		this.extChildrenElementsMap.clear();
	}
}