/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { VIEWLET_ID, VIEW_ID } from 'vs/workbench/services/search/common/search';
import { SearchView } from 'vs/workbench/contrib/search/browser/searchView';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IViewDescriptorService } from 'vs/workbench/common/views';


export class SearchViewPaneContainer extends ViewPaneContainer {

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IStorageService protected storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService
	) {
		super(VIEWLET_ID, `${VIEWLET_ID}.state`, { mergeViewWithContainerWhenSingleView: true, donotShowContainerTitleWhenMergedWithContainer: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService);
	}

	getSearchView(): SearchView | undefined {
		const view = super.getView(VIEW_ID);
		return view ? view as SearchView : undefined;
	}
}
