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
import { MainContext, ExtHostTreeViewsShape, MainThreadTreeViewsShape, TreeItem, TreeViewCommandArg } from './extHost.protocol';
import { TreeItemCollapsibleState } from './extHostTypes';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { asWinJsPromise } from 'vs/base/common/async';
import * as modes from 'vs/editor/common/modes';

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
				if (arg && arg.treeViewId && arg.treeItemHandle) {
					return this.convertArgument(arg);
				}
				return arg;
			}
		});
	}

	registerTreeDataProvider<T>(id: string, treeDataProvider: vscode.TreeDataProvider<T>): vscode.Disposable {
		const treeView = new ExtHostTreeView<T>(id, treeDataProvider, this._proxy);
		this.treeViews.set(id, treeView);
		return {
			dispose: () => {
				this.treeViews.delete(id);
				treeView.dispose();
			}
		};
	}

	$getElements(treeViewId: string): TPromise<TreeItem[]> {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			return TPromise.wrapError<TreeItem[]>(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId));
		}
		return treeView.getTreeItems();
	}

	$getChildren(treeViewId: string, treeItemHandle?: number): TPromise<TreeItem[]> {
		const treeView = this.treeViews.get(treeViewId);
		if (!treeView) {
			return TPromise.wrapError<TreeItem[]>(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId));
		}
		return treeView.getChildren(treeItemHandle);
	}

	private convertArgument(arg: TreeViewCommandArg): any {
		const treeView = this.treeViews.get(arg.treeViewId);
		if (!treeView) {
			return TPromise.wrapError<modes.Command>(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', arg.treeViewId));
		}
		return treeView.getExtensionElement(arg.treeItemHandle);
	}
}

class ExtHostTreeView<T> extends Disposable {

	private _itemHandlePool = 0;

	private extElementsMap: Map<TreeItemHandle, T> = new Map<TreeItemHandle, T>();
	private itemHandlesMap: Map<T, TreeItemHandle> = new Map<T, TreeItemHandle>();
	private extChildrenElementsMap: Map<T, T[]> = new Map<T, T[]>();

	constructor(private viewId: string, private dataProvider: vscode.TreeDataProvider<T>, private proxy: MainThreadTreeViewsShape) {
		super();
		this.proxy.$registerView(viewId);
		if (dataProvider.onDidChange) {
			this._register(dataProvider.onDidChange(element => this._refresh(element)));
		}
	}

	getTreeItems(): TPromise<TreeItem[]> {
		this.extChildrenElementsMap.clear();
		this.extElementsMap.clear();
		this.itemHandlesMap.clear();

		return asWinJsPromise(() => this.dataProvider.getChildren())
			.then(elements => this.processAndMapElements(elements));
	}

	getChildren(treeItemHandle: TreeItemHandle): TPromise<TreeItem[]> {
		let extElement = this.getExtensionElement(treeItemHandle);
		if (extElement) {
			this.clearChildren(extElement);
		} else {
			return TPromise.wrapError<TreeItem[]>(localize('treeItem.notFound', 'No tree item with id \'{0}\' found.', treeItemHandle));
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

	private processAndMapElements(elements: T[]): TPromise<TreeItem[]> {
		const treeItemsPromises: TPromise<TreeItem>[] = [];
		for (const element of elements) {
			if (this.extChildrenElementsMap.has(element)) {
				return TPromise.wrapError<TreeItem[]>(localize('treeView.duplicateElement', 'Element {0} is already registered', element));
			}
			const treeItem = this.massageTreeItem(this.dataProvider.getTreeItem(element));
			this.itemHandlesMap.set(element, treeItem.handle);
			this.extElementsMap.set(treeItem.handle, element);
			if (treeItem.collapsibleState === TreeItemCollapsibleState.Expanded) {
				treeItemsPromises.push(this.getChildren(treeItem.handle).then(children => {
					treeItem.children = children;
					return treeItem;
				}));
			} else {
				treeItemsPromises.push(TPromise.as(treeItem));
			}
		}
		return TPromise.join(treeItemsPromises);
	}

	private massageTreeItem(extensionTreeItem: vscode.TreeItem): TreeItem {
		const icon = this.getLightIconPath(extensionTreeItem);
		return {
			handle: ++this._itemHandlePool,
			label: extensionTreeItem.label,
			commandId: extensionTreeItem.command ? extensionTreeItem.command.command : void 0,
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