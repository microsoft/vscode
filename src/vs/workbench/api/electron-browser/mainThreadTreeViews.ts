/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/base/common/lifecycle';
import { ExtHostContext, MainThreadTreeViewsShape, ExtHostTreeViewsShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { ITreeViewDataProvider, ITreeItem, IViewsService, ITreeViewer, ViewsRegistry, ICustomViewDescriptor, IRevealOptions } from 'vs/workbench/common/views';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { distinct } from 'vs/base/common/arrays';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { isUndefinedOrNull, isNumber } from 'vs/base/common/types';

@extHostNamedCustomer(MainContext.MainThreadTreeViews)
export class MainThreadTreeViews extends Disposable implements MainThreadTreeViewsShape {

	private _proxy: ExtHostTreeViewsShape;
	private _dataProviders: Map<string, TreeViewDataProvider> = new Map<string, TreeViewDataProvider>();

	constructor(
		extHostContext: IExtHostContext,
		@IViewsService private viewsService: IViewsService,
		@INotificationService private notificationService: INotificationService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTreeViews);
	}

	$registerTreeViewDataProvider(treeViewId: string, options: { showCollapseAll: boolean }): void {
		const dataProvider = new TreeViewDataProvider(treeViewId, this._proxy, this.notificationService);
		this._dataProviders.set(treeViewId, dataProvider);
		const viewer = this.getTreeViewer(treeViewId);
		if (viewer) {
			viewer.dataProvider = dataProvider;
			viewer.showCollapseAllAction = !!options.showCollapseAll;
			this.registerListeners(treeViewId, viewer);
			this._proxy.$setVisible(treeViewId, viewer.visible);
		} else {
			this.notificationService.error('No view is registered with id: ' + treeViewId);
		}
	}

	$reveal(treeViewId: string, item: ITreeItem, parentChain: ITreeItem[], options: IRevealOptions): Thenable<void> {
		return this.viewsService.openView(treeViewId, options.focus)
			.then(() => {
				const viewer = this.getTreeViewer(treeViewId);
				return this.reveal(viewer, this._dataProviders.get(treeViewId), item, parentChain, options);
			});
	}

	$refresh(treeViewId: string, itemsToRefreshByHandle: { [treeItemHandle: string]: ITreeItem }): TPromise<void> {
		const viewer = this.getTreeViewer(treeViewId);
		const dataProvider = this._dataProviders.get(treeViewId);
		if (viewer && dataProvider) {
			const itemsToRefresh = dataProvider.getItemsToRefresh(itemsToRefreshByHandle);
			return viewer.refresh(itemsToRefresh.length ? itemsToRefresh : void 0);
		}
		return TPromise.as(null);
	}

	private async reveal(treeViewer: ITreeViewer, dataProvider: TreeViewDataProvider, item: ITreeItem, parentChain: ITreeItem[], options: IRevealOptions): TPromise<void> {
		options = options ? options : { select: false, focus: false };
		const select = isUndefinedOrNull(options.select) ? false : options.select;
		const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
		let expand = Math.min(isNumber(options.expand) ? options.expand : options.expand === true ? 1 : 0, 3);

		if (dataProvider.isEmpty()) {
			// Refresh if empty
			await treeViewer.refresh();
		}
		for (const parent of parentChain) {
			await treeViewer.expand(parent);
		}
		item = dataProvider.getItem(item.handle);
		if (item) {
			await treeViewer.reveal(item);
			if (select) {
				treeViewer.setSelection([item]);
			}
			if (focus) {
				treeViewer.setFocus(item);
			}
			let itemsToExpand = [item];
			for (; itemsToExpand.length > 0 && expand > 0; expand--) {
				await treeViewer.expand(itemsToExpand);
				itemsToExpand = itemsToExpand.reduce((result, item) => {
					item = dataProvider.getItem(item.handle);
					if (item && item.children && item.children.length) {
						result.push(...item.children);
					}
					return result;
				}, []);
			}
		}
	}

	private registerListeners(treeViewId: string, treeViewer: ITreeViewer): void {
		this._register(treeViewer.onDidExpandItem(item => this._proxy.$setExpanded(treeViewId, item.handle, true)));
		this._register(treeViewer.onDidCollapseItem(item => this._proxy.$setExpanded(treeViewId, item.handle, false)));
		this._register(treeViewer.onDidChangeSelection(items => this._proxy.$setSelection(treeViewId, items.map(({ handle }) => handle))));
		this._register(treeViewer.onDidChangeVisibility(isVisible => this._proxy.$setVisible(treeViewId, isVisible)));
	}

	private getTreeViewer(treeViewId: string): ITreeViewer {
		const viewDescriptor: ICustomViewDescriptor = <ICustomViewDescriptor>ViewsRegistry.getView(treeViewId);
		return viewDescriptor ? viewDescriptor.treeViewer : null;
	}

	dispose(): void {
		this._dataProviders.forEach((dataProvider, treeViewId) => {
			const treeViewer = this.getTreeViewer(treeViewId);
			if (treeViewer) {
				treeViewer.dataProvider = null;
			}
		});
		this._dataProviders.clear();
		super.dispose();
	}
}

type TreeItemHandle = string;

class TreeViewDataProvider implements ITreeViewDataProvider {

	private itemsMap: Map<TreeItemHandle, ITreeItem> = new Map<TreeItemHandle, ITreeItem>();

	constructor(private treeViewId: string,
		private _proxy: ExtHostTreeViewsShape,
		private notificationService: INotificationService
	) {
	}

	getChildren(treeItem?: ITreeItem): TPromise<ITreeItem[]> {
		if (treeItem && treeItem.children) {
			return TPromise.as(treeItem.children);
		}
		return TPromise.wrap(this._proxy.$getChildren(this.treeViewId, treeItem ? treeItem.handle : void 0)
			.then(children => {
				return this.postGetChildren(children);
			}, err => {
				this.notificationService.error(err);
				return [];
			}));
	}

	getItemsToRefresh(itemsToRefreshByHandle: { [treeItemHandle: string]: ITreeItem }): ITreeItem[] {
		const itemsToRefresh: ITreeItem[] = [];
		if (itemsToRefreshByHandle) {
			for (const treeItemHandle of Object.keys(itemsToRefreshByHandle)) {
				const currentTreeItem = this.getItem(treeItemHandle);
				if (currentTreeItem) { // Refresh only if the item exists
					const treeItem = itemsToRefreshByHandle[treeItemHandle];
					// Update the current item with refreshed item
					this.updateTreeItem(currentTreeItem, treeItem);
					if (treeItemHandle === treeItem.handle) {
						itemsToRefresh.push(currentTreeItem);
					} else {
						// Update maps when handle is changed and refresh parent
						this.itemsMap.delete(treeItemHandle);
						this.itemsMap.set(currentTreeItem.handle, currentTreeItem);
						const parent = treeItem.parentHandle ? this.itemsMap.get(treeItem.parentHandle) : null;
						if (parent) {
							itemsToRefresh.push(parent);
						}
					}
				}
			}
		}
		return itemsToRefresh;
	}

	getItem(treeItemHandle: string): ITreeItem {
		return this.itemsMap.get(treeItemHandle);
	}

	isEmpty(): boolean {
		return this.itemsMap.size === 0;
	}

	private postGetChildren(elements: ITreeItem[]): ITreeItem[] {
		const result: ITreeItem[] = [];
		if (elements) {
			for (const element of elements) {
				this.itemsMap.set(element.handle, element);
				result.push(element);
			}
		}
		return result;
	}

	private updateTreeItem(current: ITreeItem, treeItem: ITreeItem): void {
		treeItem.children = treeItem.children ? treeItem.children : null;
		if (current) {
			const properties = distinct([...Object.keys(current), ...Object.keys(treeItem)]);
			for (const property of properties) {
				current[property] = treeItem[property];
			}
		}
	}
}
