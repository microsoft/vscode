/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { $, Builder } from 'vs/base/browser/builder';
import { ITree, IDataSource, IRenderer, IActionProvider, ContextMenuEvent } from 'vs/base/parts/tree/browser/tree';
import { InternalTreeNode } from 'vs/workbench/parts/explorers/common/treeExplorerViewModel';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IActionRunner, IAction, ActionRunner } from 'vs/base/common/actions';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/common/treeExplorerService';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { TreeExplorerMenus } from 'vs/workbench/parts/explorers/browser/treeExplorerMenus';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MenuItemAction } from 'vs/platform/actions/common/actions';

export class TreeDataSource implements IDataSource {

	constructor(
		private treeNodeProviderId: string,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService,
		@IProgressService private progressService: IProgressService
	) {

	}

	public getId(tree: ITree, node: InternalTreeNode): string {
		return node.id.toString();
	}

	public hasChildren(tree: ITree, node: InternalTreeNode): boolean {
		return node.hasChildren;
	}

	public getChildren(tree: ITree, node: InternalTreeNode): TPromise<InternalTreeNode[]> {
		const promise = this.treeExplorerService.resolveChildren(this.treeNodeProviderId, node);

		this.progressService.showWhile(promise, 800);

		return promise;
	}

	public getParent(tree: ITree, node: InternalTreeNode): TPromise<InternalTreeNode> {
		return TPromise.as(null);
	}
}

export interface ITreeExplorerTemplateData {
	label: Builder;
}

export class TreeRenderer implements IRenderer {

	private static ITEM_HEIGHT = 22;
	private static TREE_TEMPLATE_ID = 'treeExplorer';

	constructor(
		state: TreeExplorerViewletState,
		actionRunner: IActionRunner
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return TreeRenderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: ITree, element: any): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITreeExplorerTemplateData {
		const el = $(container);
		const item = $('.custom-viewlet-tree-node-item');
		item.appendTo(el);

		const label = $('.custom-viewlet-tree-node-item-label').appendTo(item);
		const link = $('a.plain').appendTo(label);

		return { label: link };
	}

	public renderElement(tree: ITree, node: InternalTreeNode, templateId: string, templateData: ITreeExplorerTemplateData): void {
		templateData.label.text(node.label).title(node.label);
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: ITreeExplorerTemplateData): void {
	}
}

export class TreeController extends DefaultController {

	constructor(
		private treeNodeProviderId: string,
		private menus: TreeExplorerMenus,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */, keyboardSupport: false });
	}

	public onLeftClick(tree: ITree, node: InternalTreeNode, event: IMouseEvent, origin: string = 'mouse'): boolean {
		super.onLeftClick(tree, node, event, origin);

		if (node.clickCommand) {
			this.treeExplorerService.executeCommand(this.treeNodeProviderId, node);
		}

		return true;
	}

	public onContextMenu(tree: ITree, node: InternalTreeNode, event: ContextMenuEvent): boolean {
		tree.setFocus(node);
		const actions = this.menus.getResourceContextActions();
		if (!actions.length) {
			return true;
		}
		const anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,

			getActions: () => {
				return TPromise.as(actions);
			},

			getActionItem: (action) => {
				const keybinding = this._keybindingFor(action);
				if (keybinding) {
					return new ActionItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return null;
			},

			getKeyBinding: (action): ResolvedKeybinding => {
				return this._keybindingFor(action);
			},

			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			},

			getActionsContext: () => node,

			actionRunner: new MultipleSelectionActionRunner(() => tree.getSelection())
		});

		return true;
	}

	private _keybindingFor(action: IAction): ResolvedKeybinding {
		return this._keybindingService.lookupKeybinding(action.id);
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

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => InternalTreeNode[]) {
		super();
	}

	runAction(action: IAction, context: InternalTreeNode): TPromise<any> {
		if (action instanceof MenuItemAction) {
			const selection = this.getSelectedResources();
			const filteredSelection = selection.filter(s => s !== context);

			if (selection.length === filteredSelection.length || selection.length === 1) {
				return action.run(context);
			}

			return action.run(context, ...filteredSelection);
		}

		return super.runAction(action, context);
	}
}
