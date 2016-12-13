/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { $, Builder } from 'vs/base/browser/builder';
import { ITree, IDataSource, IRenderer, IElementCallback } from 'vs/base/parts/tree/browser/tree';
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IActionRunner } from 'vs/base/common/actions';
import { IActionProvider, ActionsRenderer } from 'vs/base/parts/tree/browser/actionsRenderer';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/common/treeExplorerService';
import { IProgressService } from 'vs/platform/progress/common/progress';

export class TreeDataSource implements IDataSource {

	constructor(
		private treeNodeProviderId: string,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService,
		@IProgressService private progressService: IProgressService
	) {

	}

	public getId(tree: ITree, node: InternalTreeExplorerNode): string {
		return node.id.toString();
	}

	public hasChildren(tree: ITree, node: InternalTreeExplorerNode): boolean {
		return node.hasChildren;
	}

	public getChildren(tree: ITree, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		const promise = this.treeExplorerService.resolveChildren(this.treeNodeProviderId, node);

		this.progressService.showWhile(promise, 800);

		return promise;
	}

	public getParent(tree: ITree, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode> {
		return TPromise.as(null);
	}
}

export class TreeRenderer extends ActionsRenderer implements IRenderer {

	constructor(
		state: TreeExplorerViewletState,
		actionRunner: IActionRunner
	) {
		super({
			actionProvider: state.actionProvider,
			actionRunner: actionRunner
		});
	}

	public getContentHeight(tree: ITree, element: any): number {
		return 22;
	}

	public renderContents(tree: ITree, node: InternalTreeExplorerNode, domElement: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		const el = $(domElement).clearChildren();
		const item = $('.custom-viewlet-tree-node-item');
		item.appendTo(el);
		return this.renderFileFolderLabel(item, node);
	}

	private renderFileFolderLabel(container: Builder, node: InternalTreeExplorerNode): IElementCallback {
		const label = $('.custom-viewlet-tree-node-item-label').appendTo(container);
		$('a.plain').text(node.label).title(node.label).appendTo(label);

		return null;
	}
}

export class TreeController extends DefaultController {

	constructor(
		private treeNodeProviderId: string,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */ });
	}

	public onLeftClick(tree: ITree, node: InternalTreeExplorerNode, event: IMouseEvent, origin: string = 'mouse'): boolean {
		super.onLeftClick(tree, node, event, origin);

		if (node.clickCommand) {
			this.treeExplorerService.executeCommand(this.treeNodeProviderId, node);
		}

		return true;
	}
}

export interface ITreeExplorerViewletState {
	actionProvider: IActionProvider;
}

export class TreeExplorerActionProvider extends ContributableActionProvider {
	private state: TreeExplorerViewletState;

	constructor(state: TreeExplorerViewletState) {
		super();

		this.state = state;
	}
}

export class TreeExplorerViewletState implements ITreeExplorerViewletState {
	private _actionProvider: TreeExplorerActionProvider;

	constructor() {
		this._actionProvider = new TreeExplorerActionProvider(this);
	}

	public get actionProvider() { return this._actionProvider; }
}
