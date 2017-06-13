/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, MainThreadTreeViewsShape, ExtHostTreeViewsShape } from '../node/extHost.protocol';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ViewsRegistry } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { ITreeViewDataProvider, ITreeItem, TreeItemCollapsibleState } from 'vs/workbench/parts/views/common/views';

export class MainThreadTreeViews extends MainThreadTreeViewsShape {

	private _proxy: ExtHostTreeViewsShape;

	constructor(
		@IThreadService threadService: IThreadService,
		@IMessageService private messageService: IMessageService
	) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostTreeViews);
	}

	$registerView(treeViewId: string): void {
		ViewsRegistry.registerTreeViewDataProvider(treeViewId, new TreeViewDataProvider(treeViewId, this._proxy, this.messageService));
	}

	$refresh(treeViewId: string, treeItemHandle?: number): void {
		const treeViewDataProvider: TreeViewDataProvider = <TreeViewDataProvider>ViewsRegistry.getTreeViewDataProvider(treeViewId);
		if (treeViewDataProvider) {
			treeViewDataProvider.refresh(treeItemHandle);
		}
	}
}

type TreeItemHandle = number;

class TreeViewDataProvider implements ITreeViewDataProvider {

	private _onDidChange: Emitter<ITreeItem | undefined | null> = new Emitter<ITreeItem | undefined | null>();
	readonly onDidChange: Event<ITreeItem | undefined | null> = this._onDidChange.event;

	private childrenMap: Map<TreeItemHandle, TreeItemHandle[]> = new Map<TreeItemHandle, TreeItemHandle[]>();
	private itemsMap: Map<TreeItemHandle, ITreeItem> = new Map<TreeItemHandle, ITreeItem>();

	constructor(private treeViewId: string,
		private _proxy: ExtHostTreeViewsShape,
		private messageService: IMessageService
	) {
	}

	getElements(): TPromise<ITreeItem[]> {
		return this._proxy.$getElements(this.treeViewId)
			.then(elements => {
				this.postGetElements(null, elements);
				return elements;
			}, err => this.messageService.show(Severity.Error, err));
	}

	getChildren(treeItem: ITreeItem): TPromise<ITreeItem[]> {
		if (treeItem.children) {
			return TPromise.as(treeItem.children);
		}
		return this._proxy.$getChildren(this.treeViewId, treeItem.handle)
			.then(children => {
				this.postGetElements(treeItem.handle, children);
				return children;
			}, err => this.messageService.show(Severity.Error, err));
	}

	refresh(treeItemHandle?: number) {
		if (treeItemHandle) {
			let treeItem = this.itemsMap.get(treeItemHandle);
			if (treeItem) {
				this._onDidChange.fire(treeItem);
			}
		} else {
			this._onDidChange.fire();
		}
	}

	private clearChildren(treeItemHandle: TreeItemHandle): void {
		const children = this.childrenMap.get(treeItemHandle);
		if (children) {
			for (const child of children) {
				this.clearChildren(child);
				this.itemsMap.delete(child);
			}
			this.childrenMap.delete(treeItemHandle);
		}
	}

	private postGetElements(parent: TreeItemHandle, children: ITreeItem[]) {
		this.setElements(parent, children);
	}

	private setElements(parent: TreeItemHandle, children: ITreeItem[]) {
		if (children && children.length) {
			for (const child of children) {
				this.itemsMap.set(child.handle, child);
				if (child.children && child.children.length) {
					this.setElements(child.handle, child.children);
				}
			}
			if (parent) {
				this.childrenMap.set(parent, children.map(child => child.handle));
			}
		}
	}

	private populateElementsToExpand(elements: ITreeItem[], toExpand: ITreeItem[]) {
		for (const element of elements) {
			if (element.collapsibleState === TreeItemCollapsibleState.Expanded) {
				toExpand.push(element);
				if (element.children && element.children.length) {
					this.populateElementsToExpand(element.children, toExpand);
				}
			}
		}
	}
}