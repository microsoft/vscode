/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';

export const PANEL_MARGIN_SIZE = 8;

export class PanelMarginsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.panelMargins';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super();

		this.updatePanelMargins();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.panel.margins.enabled')) {
				this.updatePanelMargins();
			}
		}));
	}

	private updatePanelMargins(): void {
		const enabled = this.configurationService.getValue<boolean>('workbench.panel.margins.enabled') ?? false;
		const mainContainer = this.layoutService.mainContainer;

		console.log('[PanelMargins] Setting changed - enabled:', enabled);
		console.log('[PanelMargins] Main container classes before:', Array.from(mainContainer.classList).join(' '));

		mainContainer.classList.toggle('panel-margins-enabled', enabled);

		console.log('[PanelMargins] Main container classes after:', Array.from(mainContainer.classList).join(' '));

		// Trigger layout recalculation
		mainWindow.dispatchEvent(new Event('resize'));
	}
}

export function isPanelMarginsEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>('workbench.panel.margins.enabled') ?? false;
}
