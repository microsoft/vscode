/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { IViewletView, Viewlet } from 'vs/workbench/browser/viewlet';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TreeExplorerView } from 'vs/workbench/parts/explorers/browser/views/treeExplorerView';
import { TreeExplorerViewletState } from 'vs/workbench/parts/explorers/browser/views/treeExplorerViewer';

const TREE_NAME = 'pineTree'; // For now

export const CUSTOM_VIEWLET_ID_ROOT = 'workbench.view.treeExplorerViewlet.';
const ID = 'workbench.view.customTreeExplorerViewlet.' + TREE_NAME;

export class TreeExplorerViewlet extends Viewlet {
	private static _idCounter = 1;

	private viewletContainer: Builder;
	private view: IViewletView;

	private viewletState: TreeExplorerViewletState;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(ID, telemetryService);

		this.viewletState = new TreeExplorerViewletState();

		TreeExplorerViewlet._idCounter++;
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = parent.div().addClass('custom-tree-explorer-viewlet');
		this.addTreeView(TREE_NAME);

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

	private addTreeView(treeName: string): void {
		// Hide header (root node) by default
		const headerSize = 0;

		this.view = this.instantiationService.createInstance(TreeExplorerView, this.viewletState, treeName, this.getActionRunner(), headerSize);
		this.view.render(this.viewletContainer.getHTMLElement(), Orientation.VERTICAL);
	}

	dispose(): void {
		this.view = null;
	}
}