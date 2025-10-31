/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { VIEWLET_ID, VIEW_ID } from '../common/sampleExplorer.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { SampleExplorerView } from './views/sampleExplorerView.js';
import { IViewsRegistry, IViewDescriptor, Extensions, ViewContainer, IViewContainersRegistry, ViewContainerLocation } from '../../../common/views.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const sampleExplorerViewIcon = registerIcon('sample-explorer-view-icon', Codicon.fileCode, localize('sampleExplorerViewIcon', 'View icon of the sample explorer view.'));

export class SampleExplorerViewsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sampleExplorerViews';

	constructor() {
		super();
		this.registerViews();
	}

	private registerViews(): void {
		const viewDescriptor = this.createSampleExplorerViewDescriptor();
		viewsRegistry.registerViews([viewDescriptor], VIEW_CONTAINER);
	}

	private createSampleExplorerViewDescriptor(): IViewDescriptor {
		return {
			id: VIEW_ID,
			name: localize2('sampleExplorerViewName', "Sample Explorer"),
			containerIcon: sampleExplorerViewIcon,
			ctorDescriptor: new SyncDescriptor(SampleExplorerView),
			order: 1,
			canToggleVisibility: true
		};
	}
}

export class SampleExplorerViewPaneContainer extends ViewPaneContainer {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService
	) {
		super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('sample-explorer-viewlet');
	}
}

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry);

/**
 * Sample Explorer viewlet container.
 */
export const VIEW_CONTAINER: ViewContainer = viewContainerRegistry.registerViewContainer({
	id: VIEWLET_ID,
	title: localize2('sampleExplorer', "Sample Explorer"),
	ctorDescriptor: new SyncDescriptor(SampleExplorerViewPaneContainer),
	storageId: 'workbench.sampleExplorer.views.state',
	icon: sampleExplorerViewIcon,
	alwaysUseContainerInfo: true,
	order: 10
}, ViewContainerLocation.Sidebar);

const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
