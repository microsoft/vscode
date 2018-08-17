/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IReferenceSearchConfiguration, VIEW_ID } from 'vs/workbench/parts/referenceSearch/common/referenceSearch';

export class ReferenceSearchViewLocationUpdater implements IWorkbenchContribution {

	constructor(
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const updateReferenceSearchViewLocation = (open: boolean) => {
			const config = configurationService.getValue<IReferenceSearchConfiguration>();
			if (config.referenceSearch.location === 'panel') {
				viewletService.setViewletEnablement(VIEW_ID, false);
				panelService.setPanelEnablement(VIEW_ID, true);
				if (open) {
					panelService.openPanel(VIEW_ID);
				}
			} else {
				panelService.setPanelEnablement(VIEW_ID, false);
				viewletService.setViewletEnablement(VIEW_ID, true);
				if (open) {
					viewletService.openViewlet(VIEW_ID);
				}
			}
		};

		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('referenceSearch.location')) {
				updateReferenceSearchViewLocation(true);
			}
		});

		updateReferenceSearchViewLocation(false);
	}
}
