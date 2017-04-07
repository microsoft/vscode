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
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class TreeExplorerViewlet extends Viewlet {

	private viewletContainer: Builder;
	private view: IViewletView;

	private viewletState: TreeExplorerViewletState;
	private viewletId: string;
	private treeNodeProviderId: string;

	constructor(
		viewletId: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(viewletId, telemetryService, themeService);

		this.viewletState = new TreeExplorerViewletState();
		this.viewletId = viewletId;

		const tokens = viewletId.split('.');
		this.treeNodeProviderId = tokens[tokens.length - 1];
	}

	public getId(): string {
		return this.viewletId;
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = parent.div();
		this.addTreeView();

		return TPromise.as(null);
	}

	public layout(dimension: Dimension): void {
		this.view.layout(dimension.height, Orientation.VERTICAL);
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			this.view.setVisible(visible).done();
		});
	}

	public getActions(): IAction[] {
		return this.view.getActions();
	}

	private addTreeView(): void {
		const headerSize = 0; // Hide header (root node) by default

		this.view = this.instantiationService.createInstance(TreeExplorerView, this.viewletState, this.treeNodeProviderId, this.getActionRunner(), headerSize);
		this.view.render(this.viewletContainer.getHTMLElement(), Orientation.VERTICAL);
	}

	public focus(): void {
		super.focus();

		if (this.view) {
			this.view.focusBody();
		}
	}

	public shutdown(): void {
		if (this.view) {
			this.view.shutdown();
		}

		super.shutdown();
	}

	public dispose(): void {
		if (this.view) {
			this.view = null;
			this.view.dispose();
		}

		super.dispose();
	}
}
