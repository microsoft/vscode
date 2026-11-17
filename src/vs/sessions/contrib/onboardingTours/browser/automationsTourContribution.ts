/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived } from '../../../../base/common/observable.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { ICustomViewService } from '../../../../workbench/contrib/sessions/browser/customView.js';
import { createAutomationsTour } from './tours/automationsTour.js';

export class AutomationsTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.automationsTour';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
	) {
		super();

		const visible = derived(this, reader => customViewService.activeCustomView.read(reader)?.id === AUTOMATIONS_CUSTOM_VIEW_ID);
		this._register(onboardingScenarioRegistry.register(createAutomationsTour(visible)));
	}
}

registerWorkbenchContribution2(AutomationsTourContribution.ID, AutomationsTourContribution, WorkbenchPhase.AfterRestored);
