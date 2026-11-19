/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { createAutomationsTour } from './tours/automationsTour.js';

export class AutomationsTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.automationsTour';

	constructor() {
		super();

		this._register(onboardingScenarioRegistry.register(createAutomationsTour()));
	}
}

registerWorkbenchContribution2(AutomationsTourContribution.ID, AutomationsTourContribution, WorkbenchPhase.AfterRestored);
