/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/roboagent.css';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { Ros2WorkspaceGraph } from '../common/ros2WorkspaceModel.js';
import { IRos2WorkspaceService } from '../common/ros2WorkspaceService.js';
import {
	Ros2PackageExplorerAccessibilityProvider, Ros2PackageExplorerDataSource, Ros2PackageExplorerDelegate,
	Ros2PackageExplorerRenderer, Ros2TreeElement, treeIdentityProvider
} from './ros2PackageExplorerTree.js';

export class Ros2PackageExplorerView extends ViewPane {

	static readonly ID = 'roboagent.ros2PackageExplorer';

	private tree: WorkbenchAsyncDataTree<Ros2WorkspaceGraph, Ros2TreeElement> | undefined;
	private readonly refreshScheduler: RunOnceScheduler;

	constructor(
		options: IViewPaneOptions,
		@IRos2WorkspaceService private readonly ros2WorkspaceService: IRos2WorkspaceService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.refreshScheduler = this._register(new RunOnceScheduler(() => this.refreshTree(), 100));
		this._register(this.ros2WorkspaceService.onDidChangeGraph(() => {
			this._updateWelcomeVisibility();
			this.refreshScheduler.schedule();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.tree = this._register(this.instantiationService.createInstance(
			WorkbenchAsyncDataTree<Ros2WorkspaceGraph, Ros2TreeElement>,
			'Ros2PackageExplorer',
			container,
			new Ros2PackageExplorerDelegate(),
			[this.instantiationService.createInstance(Ros2PackageExplorerRenderer)],
			new Ros2PackageExplorerDataSource(() => this.ros2WorkspaceService.getGraph()),
			{
				accessibilityProvider: new Ros2PackageExplorerAccessibilityProvider(),
				identityProvider: treeIdentityProvider(),
			}
		));

		this.tree.setInput(this.ros2WorkspaceService.getGraph());
	}

	private refreshTree(): void {
		if (!this.tree) {
			return;
		}
		this.tree.setInput(this.ros2WorkspaceService.getGraph());
	}

	private _updateWelcomeVisibility(): void {
		// ViewPane consults shouldShowWelcome(); trigger a re-evaluation when the graph changes.
		this._onDidChangeViewWelcomeState.fire();
	}

	override shouldShowWelcome(): boolean {
		return this.ros2WorkspaceService.getGraph().packages.length === 0;
	}

	override focus(): void {
		super.focus();
		this.tree?.domFocus();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree?.layout(height, width);
	}
}
