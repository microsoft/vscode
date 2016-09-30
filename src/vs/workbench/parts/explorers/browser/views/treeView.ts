import nls = require('vs/nls');
import labels = require('vs/base/common/labels');

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { CollapsibleViewletView } from 'vs/workbench/browser/viewlet';

import { IActionRunner, IAction } from 'vs/base/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';

import { ITree, IDataSource, IRenderer } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { TreeExplorerViewletState, TreeDataSource, TreeRenderer, TreeController } from 'vs/workbench/parts/explorers/browser/views/treeViewer';

import { FileEditorInput } from 'vs/workbench/parts/files/common/editors/fileEditorInput';

// import { documentSymbols } from '../../common/goOutline';
import { TreeViewNode } from 'vs/workbench/parts/explorers/common/treeViewModel';

function getTree(): TreeViewNode {
	const root   = new TreeViewNode(1, "foo");
  const node1  = new TreeViewNode(2, "bar");
  const node2  = new TreeViewNode(3, "baz");
  const node11 = new TreeViewNode(4, "qux");

  root.addChild(node1);
  root.addChild(node2);
  node1.addChild(node11);

	return root;
}

export class TreeView extends CollapsibleViewletView {
	private workspace: IWorkspace;
	private treeViewer: ITree;

	private viewletState: TreeExplorerViewletState;

	private _treeName: string = "TreeExplorer";

	get treeName(): string { return this._treeName; }

	constructor(
		viewletState: TreeExplorerViewletState,
		treeName: string,
		actionRunner: IActionRunner,
		headerSize: number,
		@IMessageService messageService: IMessageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(actionRunner, false, nls.localize('treeExplorerViewletTree', "Tree Explorer Tree Section"), messageService, keybindingService, contextMenuService, headerSize);

		this.workspace = contextService.getWorkspace();

		this.viewletState = viewletState;
		this.create();
	}

	renderHeader(container: HTMLElement): void {

	}

	renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		DOM.addClass(this.treeContainer, 'tree-explorer-viewlet-tree-view');

		this.tree = this.createViewer($(this.treeContainer));
		this.tree.setInput(getTree());
	}

	getActions(): IAction[] {
		return [];
	}

	createViewer(container: Builder): ITree {
		const dataSource = this.instantiationService.createInstance(TreeDataSource);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.viewletState, this.actionRunner, container.getHTMLElement());
		const controller = null;
		const sorter = null;
		const filter = null;
		const dnd = null;
		const accessibilityProvider = null;

		return new Tree(container.getHTMLElement(), {
			dataSource,
			renderer,
			controller,
			sorter,
			filter,
			dnd,
			accessibilityProvider
		});
	}

	create(): TPromise<void> {
		this.toDispose.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()))
		return TPromise.as(null);
	}

	private onEditorsChanged() {
		const activeInput = this.editorService.getActiveEditorInput();

		if (activeInput instanceof FileEditorInput) {
			const fileResource = activeInput.getResource();

			this.updateOutlineViewlet(fileResource);
		}
	}

	refresh(): TPromise<void> {
		const input = this.tree.getInput();
		return this.doRefresh();
	}

	private doRefresh(): TPromise<void> {
		return TPromise.as(null);
	}

	private updateOutlineViewlet(fileURI: URI): TPromise<void> {
		this.tree.setInput(getTree());
		/*
		documentSymbols(fileURI.path).then(nodes => {
			const root = nodes[0];
			this.tree.setInput(root);
		});
		*/

		return TPromise.as(null);
	}

	focus(): void {

	}

	public getOptimalWidth(): number {
		const parentNode = this.tree.getHTMLElement();
		const childNodes = [].slice.call(parentNode.querySelectorAll('.outline-item-label > a'));

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}
}