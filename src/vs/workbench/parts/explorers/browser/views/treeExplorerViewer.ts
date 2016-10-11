import { TPromise } from 'vs/base/common/winjs.base';
import { $, Builder } from 'vs/base/browser/builder';

import { ITree, IDataSource, IRenderer, IElementCallback } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { InternalTreeExplorerNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';

import { IActionRunner } from 'vs/base/common/actions';
import { IActionProvider, ActionsRenderer } from 'vs/base/parts/tree/browser/actionsRenderer';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';

import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/browser/treeExplorerService';

const providerId = 'pineTree'; // For now

export class TreeDataSource implements IDataSource {
	constructor(
		@ITreeExplorerService private treeExplorerViewletService: ITreeExplorerService
	) {

	}

	getId(tree: ITree, node: InternalTreeExplorerNode): string {
		return node.id.toString();
	}

	hasChildren(tree: ITree, node: InternalTreeExplorerNode): boolean {
		return true;
	}

	getChildren(tree: ITree, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode[]> {
		return this.treeExplorerViewletService.resolveChildren('pineTree', node);
	}

	getParent(tree: ITree, node: InternalTreeExplorerNode): TPromise<InternalTreeExplorerNode> {
		return TPromise.as(null);
	}
}

export class TreeRenderer extends ActionsRenderer implements IRenderer {

	constructor(
		state: TreeExplorerViewletState,
		actionRunner: IActionRunner,
		private container: HTMLElement,
		@IContextViewService private contextViewService: IContextViewService,
		@IExtensionService private extensionService: IExtensionService,
		@IModeService private modeService: IModeService
	) {
		super({
			actionProvider: state.actionProvider,
			actionRunner: actionRunner
		});
	}

	getContentHeight(tree: ITree, element: any): number {
		return 22;
	}

	renderContents(tree: ITree, node: InternalTreeExplorerNode, domElement: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
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
		@ITreeExplorerService private treeExplorerViewletService: ITreeExplorerService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */ });
	}

	onLeftClick(tree: ITree, node: InternalTreeExplorerNode, event: IMouseEvent, origin: string = 'mouse'): boolean {
		super.onLeftClick(tree, node, event, origin);

		if (node.onClickCommand) {
			this.treeExplorerViewletService.resolveCommand('pineTree', node);
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

	get actionProvider() { return this._actionProvider; }
}