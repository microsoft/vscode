import { TPromise } from 'vs/base/common/winjs.base';
import { $, Builder } from 'vs/base/browser/builder';

import { ITree, IDataSource, IRenderer, IElementCallback } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { TreeViewNode } from 'vs/workbench/parts/explorers/common/treeViewModel';
import { DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';

import { IActionRunner } from 'vs/base/common/actions';
import { ActionsRenderer } from 'vs/base/parts/tree/browser/actionsRenderer';

import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IModeService } from 'vs/editor/common/services/modeService';

export class TreeDataSource implements IDataSource {

	constructor() {

	}

	public getId(tree: ITree, node: TreeViewNode): string {
		return node.label;
	}

	public hasChildren(tree: ITree, node: TreeViewNode): boolean {
		return node.children.length > 0;
	}

	public getChildren(tree: ITree, node: TreeViewNode): TPromise<TreeViewNode[]> {
		return TPromise.as(node.children);
	}

	public getParent(tree: ITree, node: TreeViewNode): TPromise<TreeViewNode> {
		return TPromise.as(null);
	}
}

export class TreeRenderer extends ActionsRenderer implements IRenderer {

	constructor(
		actionRunner: IActionRunner,
		private container: HTMLElement,
		@IContextViewService private contextViewService: IContextViewService,
		@IExtensionService private extensionService: IExtensionService,
		@IModeService private modeService: IModeService
	) {
		super({
			actionProvider: null,
			actionRunner: actionRunner
		});
	}

	public getContentHeight(tree: ITree, element: any): number {
		return 22;
	}

	public renderContents(tree: ITree, node: TreeViewNode, domElement: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		const el = $(domElement).clearChildren();
		const item = $('.custom-viewlet-tree-node-item');
		item.appendTo(el);
		return this.renderFileFolderLabel(item, node);
	}

	private renderFileFolderLabel(container: Builder, node: TreeViewNode): IElementCallback {
		const label = $('.custom-viewlet-tree-node-item-label').appendTo(container);
		$('a.plain').text(node.label).title(node.label).appendTo(label);

		return null;
	}
}

export class TreeController extends DefaultController {

}