/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ISearchConfiguration, VIEW_ID } from 'vs/platform/search/common/search';

export class SearchViewLocationUpdater implements IWorkbenchContribution {

	constructor(
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const updateSearchViewLocation = () => {
			const config = configurationService.getValue<ISearchConfiguration>();
			if (config.search.location === 'panel') {
				viewletService.setViewletEnablement(VIEW_ID, false);
				panelService.setPanelEnablement(VIEW_ID, true);
			} else {
				panelService.setPanelEnablement(VIEW_ID, false);
				viewletService.setViewletEnablement(VIEW_ID, true);
			}
		};

		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('search.location')) {
				updateSearchViewLocation();

			}
		});

		updateSearchViewLocation();
	}
}
