/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IView } from 'vs/workbench/common/views';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Composite } from 'vs/workbench/browser/composite';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ViewPaneContainer, ViewPane } from './parts/views/viewPaneContainer';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';

export class PaneComposite extends Composite implements IPaneComposite {
	constructor(id: string, private readonly viewPaneContainer: ViewPaneContainer,
		@ITelemetryService
		telemetryService: ITelemetryService,
		@IStorageService
		protected storageService: IStorageService,
		@IInstantiationService
		protected instantiationService: IInstantiationService,
		@IThemeService
		themeService: IThemeService,
		@IContextMenuService
		protected contextMenuService: IContextMenuService,
		@IExtensionService
		protected extensionService: IExtensionService,
		@IWorkspaceContextService
		protected contextService: IWorkspaceContextService) {
		super(id, telemetryService, themeService, storageService);
		// this.viewPaneContainer = this.instantiationService.createInstance(ViewPaneContainer, id, viewletStateStorageId,
		// 	{
		// 		showHeaderInTitleWhenSingleView,
		// 		mementoObject: this.getMemento(StorageScope.WORKSPACE),
		// 		contextMenuActionsProvider: () => { return this.getContextMenuActions(); },
		// 		actionRunnerProvider: () => { return this.getActionRunner(); }
		// 	}
		// );
	}
	create(parent: HTMLElement): void {
		this.viewPaneContainer.create(parent);
	}
	setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.viewPaneContainer.setVisible(visible);
	}
	layout(dimension: Dimension): void {
		this.viewPaneContainer.layout(dimension);
	}
	getOptimalWidth(): number {
		return this.viewPaneContainer.getOptimalWidth();
	}
	openView(id: string, focus?: boolean): IView {
		return this.viewPaneContainer.openView(id, focus);
	}
	getView(id: string): ViewPane | undefined {
		return this.viewPaneContainer.getView(id);
	}
	getViewPaneContainer(): ViewPaneContainer {
		return this.viewPaneContainer;
	}
}
