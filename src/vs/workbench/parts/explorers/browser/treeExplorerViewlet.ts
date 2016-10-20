/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { IAction } from 'vs/base/common/actions';
import { IViewletView, Viewlet } from 'vs/workbench/browser/viewlet';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TreeExplorerView } from 'vs/workbench/parts/explorers/browser/views/treeExplorerView';
import { TreeExplorerViewletState } from 'vs/workbench/parts/explorers/browser/views/treeExplorerViewer';
import { IActivityService } from 'vs/workbench/services/activity/common/activityService';
import { VIEWLET_ID_ROOT } from 'vs/workbench/parts/explorers/common/treeExplorer';

export class TreeExplorerViewlet extends Viewlet {
	private static _idCounter = 1;

	private viewletContainer: Builder;
	private view: IViewletView;

	private viewletState: TreeExplorerViewletState;

	private externalViewletId: string;
	private treeNodeProviderId: string;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IActivityService private activityService: IActivityService
	) {
		super(VIEWLET_ID_ROOT + TreeExplorerViewlet._idCounter, telemetryService);

		this.viewletState = new TreeExplorerViewletState();

		this.externalViewletId = this.activityService.getExternalViewletIdToOpen();
		this.treeNodeProviderId = this.getTreeProviderName(this.externalViewletId);

		TreeExplorerViewlet._idCounter++;
	}

	getId(): string {
		return this.externalViewletId;
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = parent.div().addClass('custom-tree-explorer-viewlet');
		this.addTreeView(this.treeNodeProviderId);

		return TPromise.as(null);
	}

	layout(dimension: Dimension): void {
		this.view.layout(dimension.height, Orientation.VERTICAL);
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			this.view.setVisible(visible).done();
		});
	}

	getActions(): IAction[] {
		return this.view.getActions();
	}

	private addTreeView(treeNodeProviderId: string): void {
		// Hide header (root node) by default
		const headerSize = 0;

		this.view = this.instantiationService.createInstance(TreeExplorerView, this.viewletState, treeNodeProviderId, this.getActionRunner(), headerSize);
		this.view.render(this.viewletContainer.getHTMLElement(), Orientation.VERTICAL);
	}

	private getTreeProviderName(viewletId: string): string {
		const tokens = viewletId.split('.');
		return tokens[tokens.length - 1];
	}

	dispose(): void {
		this.view = null;
	}
}
