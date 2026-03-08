/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { TreeView, TreeViewPane } from '../../../browser/parts/views/treeView.js';
import {
	Extensions,
	ITreeItem,
	ITreeViewDataProvider,
	ITreeViewDescriptor,
	IViewContainersRegistry,
	IViewsRegistry,
	TreeItemCollapsibleState,
	ViewContainerLocation,
} from '../../../common/views.js';
import { ILiquidModuleRegistry } from '../common/liquidModule.js';
import type { ILiquidSidebarNode } from '../common/liquidModuleTypes.js';

export const LIQUID_VIEW_CONTAINER_ID = 'workbench.view.phonon.liquid';
export const LIQUID_TREE_VIEW_ID = 'workbench.view.phonon.liquid.tree';

const liquidViewIcon = registerIcon('liquid-sidebar-view-icon', Codicon.layers, localize('liquidSidebarViewIcon', 'View icon of the Phonon Liquid Modules sidebar.'));

/**
 * Data provider that projects ILiquidSidebarNode[] from the registry
 * into ITreeItem[] consumable by the VS Code TreeView infrastructure.
 */
export class LiquidSidebarDataProvider extends Disposable implements ITreeViewDataProvider {

	private _isEmpty = true;
	private readonly _onDidChangeEmpty = this._register(new Emitter<void>());
	readonly onDidChangeEmpty: Event<void> = this._onDidChangeEmpty.event;

	get isTreeEmpty(): boolean {
		return this._isEmpty;
	}

	constructor(
		private readonly registry: ILiquidModuleRegistry,
		private readonly logService: ILogService,
	) {
		super();
	}

	async getChildren(element?: ITreeItem): Promise<ITreeItem[] | undefined> {
		if (!element) {
			// Root level -- return top-level sidebar nodes
			const roots = this.registry.sidebarTree;
			const items = roots.map(n => this._toTreeItem(n));
			const wasEmpty = this._isEmpty;
			this._isEmpty = items.length === 0;
			if (wasEmpty !== this._isEmpty) {
				this._onDidChangeEmpty.fire();
			}
			return items;
		}

		// Child level -- find the matching sidebar node and return its children
		const node = this._findNode(element.handle, this.registry.sidebarTree);
		if (!node || node.children.length === 0) {
			return undefined;
		}
		return node.children.map(n => this._toTreeItem(n));
	}

	private _toTreeItem(node: ILiquidSidebarNode): ITreeItem {
		const hasChildren = node.children.length > 0;
		const item: ITreeItem = {
			handle: node.id,
			collapsibleState: hasChildren
				? TreeItemCollapsibleState.Collapsed
				: TreeItemCollapsibleState.None,
			label: { label: node.label },
			themeIcon: node.icon ? { id: node.icon } : undefined,
			tooltip: node.view
				? localize('liquidSidebarNodeTooltip', "{0} (view: {1})", node.label, node.view)
				: node.label,
		};
		return item;
	}

	private _findNode(id: string, nodes: ReadonlyArray<ILiquidSidebarNode>): ILiquidSidebarNode | undefined {
		for (const node of nodes) {
			if (node.id === id) {
				return node;
			}
			const found = this._findNode(id, node.children);
			if (found) {
				return found;
			}
		}
		return undefined;
	}

	/**
	 * Called when the user clicks a tree item.
	 * Task 7 will wire actual navigation; for now we log.
	 */
	handleClick(item: ITreeItem): void {
		const node = this._findNode(item.handle, this.registry.sidebarTree);
		if (node?.view) {
			this.logService.info(`[Phonon] Liquid sidebar click: node="${node.id}", view="${node.view}" -- navigation TBD (Task 7)`);
		} else {
			this.logService.info(`[Phonon] Liquid sidebar click: node="${item.handle}" -- no view bound`);
		}
	}
}

/**
 * Registers the Liquid Modules ViewContainer and TreeView.
 * Call once from phonon.contribution.ts.
 */
export function registerLiquidSidebarTreeView(
	instantiationService: IInstantiationService,
	registry: ILiquidModuleRegistry,
	logService: ILogService,
): void {
	// 1. Register ViewContainer in the activity bar (Sidebar location)
	const viewContainer = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({
		id: LIQUID_VIEW_CONTAINER_ID,
		title: localize2('phonon.liquidModules', "Liquid Modules"),
		icon: liquidViewIcon,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [LIQUID_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: LIQUID_VIEW_CONTAINER_ID,
		hideIfEmpty: false,
		order: 10,
	}, ViewContainerLocation.Sidebar);

	// 2. Create the TreeView instance
	const treeView = instantiationService.createInstance(
		TreeView,
		LIQUID_TREE_VIEW_ID,
		localize('phonon.liquidTree', "Modules"),
	);

	// 3. Create data provider and wire it
	const dataProvider = new LiquidSidebarDataProvider(registry, logService);
	treeView.dataProvider = dataProvider;

	// 4. Refresh when sidebar tree changes
	registry.onDidChangeSidebar(() => {
		treeView.refresh();
	});

	// 5. Handle item selection (click) -- logs for now, Task 7 wires navigation
	treeView.onDidChangeSelectionAndFocus(e => {
		if (e.selection.length > 0) {
			dataProvider.handleClick(e.selection[0]);
		}
	});

	// 6. Register the TreeView descriptor in the ViewContainer
	const viewDescriptor: ITreeViewDescriptor = {
		id: LIQUID_TREE_VIEW_ID,
		name: localize2('phonon.liquidTree', "Modules"),
		ctorDescriptor: new SyncDescriptor(TreeViewPane),
		treeView,
		canToggleVisibility: true,
		canMoveView: false,
		collapsed: false,
		order: 0,
	};

	Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);

	logService.info('[Phonon] Liquid sidebar TreeView registered');
}
