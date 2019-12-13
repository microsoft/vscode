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
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewletRegistry, Extensions, Viewlet } from 'vs/workbench/browser/viewlet';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';


export class SearchViewlet extends Viewlet {
	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService protected storageService: IStorageService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IExtensionService protected extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IWorkbenchLayoutService protected layoutService: IWorkbenchLayoutService,
		@IConfigurationService protected configurationService: IConfigurationService
	) {
		super(VIEWLET_ID, instantiationService.createInstance(SearchViewPaneContainer), telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService, layoutService, configurationService);
	}
}

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
	) {
		super(VIEWLET_ID, `${VIEWLET_ID}.state`, { showHeaderInTitleWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService);
	}

	getTitle(): string {
		return Registry.as<ViewletRegistry>(Extensions.Viewlets).getViewlet(this.getId()).name;
	}

	getSearchView(): SearchView | undefined {
		const view = super.getView(VIEW_ID);
		return view ? view as SearchView : undefined;
	}
}
