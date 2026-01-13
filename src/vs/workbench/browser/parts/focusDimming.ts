/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../common/contributions.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';

export class FocusDimmingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.focusDimming';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService
	) {
		super();

		this.updateFocusDimmingClass();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.experimental.focusDimming.enabled')) {
				this.updateFocusDimmingClass();
			}
		}));
	}

	private updateFocusDimmingClass(): void {
		const enabled = this.configurationService.getValue<boolean>('workbench.experimental.focusDimming.enabled');
		this.layoutService.mainContainer.classList.toggle('focus-dimming-enabled', enabled);
	}
}

registerWorkbenchContribution2(FocusDimmingContribution.ID, FocusDimmingContribution, WorkbenchPhase.AfterRestored);
