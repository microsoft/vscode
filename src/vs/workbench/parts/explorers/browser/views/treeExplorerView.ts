/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { CollapsibleViewletView } from 'vs/workbench/browser/viewlet';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ITreeExplorerViewletService } from 'vs/workbench/parts/explorers/browser/treeExplorerViewletService';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { TreeExplorerViewletState, TreeDataSource, TreeRenderer, TreeController } from 'vs/workbench/parts/explorers/browser/views/treeExplorerViewer';
import { RefreshViewExplorerAction } from 'vs/workbench/parts/explorers/browser/treeExplorerActions';

export class TreeExplorerView extends CollapsibleViewletView {
	private workspace: IWorkspace;

	constructor(
		private viewletState: TreeExplorerViewletState,
		private treeNodeProviderId: string,
		actionRunner: IActionRunner,
		headerSize: number,
		@IMessageService messageService: IMessageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@ITreeExplorerViewletService private treeExplorerViewletService: ITreeExplorerViewletService
	) {
		super(actionRunner, false, nls.localize('treeExplorerViewletTree', "Tree Explorer Section"), messageService, keybindingService, contextMenuService, headerSize);

		this.workspace = contextService.getWorkspace();

		this.create();
	}

	renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		DOM.addClass(this.treeContainer, 'tree-explorer-viewlet-tree-view');

		this.tree = this.createViewer($(this.treeContainer));
	}

	createViewer(container: Builder): ITree {
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this.treeNodeProviderId);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.viewletState, this.actionRunner, container.getHTMLElement());
		const controller = this.instantiationService.createInstance(TreeController, this.treeNodeProviderId);
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

	getActions(): IAction[] {
		const refresh = this.instantiationService.createInstance(RefreshViewExplorerAction, this);
		return [refresh];
	}

	create(): TPromise<void> {
		return this.updateInput();
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
	}

	updateInput(): TPromise<void> {
		if (this.treeExplorerViewletService.hasProvider(this.treeNodeProviderId)) {
			return this.treeExplorerViewletService.provideRootNode(this.treeNodeProviderId).then(tree => {
				this.tree.setInput(tree);
			});
		} else {
			this.treeExplorerViewletService.onTreeExplorerNodeProviderRegistered(providerId => {
				if (this.treeNodeProviderId === providerId) {
					return this.treeExplorerViewletService.provideRootNode(this.treeNodeProviderId).then(tree => {
						this.tree.setInput(tree);
					});
				}
			});

			return TPromise.as(null);
		}
	}

	public getOptimalWidth(): number {
		const parentNode = this.tree.getHTMLElement();
		const childNodes = [].slice.call(parentNode.querySelectorAll('.outline-item-label > a'));

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}
}
