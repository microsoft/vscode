/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getOnboardingDeveloperModeVariation } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { NEW_SESSION_VIEW_V2_TOUR_ID, NEW_SESSION_VIEW_V2_VARIATION_TREATMENT, NewSessionViewV2Variation } from './tours/newSessionViewV2Tour.js';

export async function resolveNewSessionViewV2TourVariation(configurationService: IConfigurationService, assignmentService: IWorkbenchAssignmentService, logService: ILogService): Promise<NewSessionViewV2Variation> {
	const variation = getOnboardingDeveloperModeVariation(configurationService, NEW_SESSION_VIEW_V2_TOUR_ID)
		?? await assignmentService.getTreatment<string>(NEW_SESSION_VIEW_V2_VARIATION_TREATMENT);
	if (variation === 'workspaceAndModel') {
		return variation;
	}
	if (variation !== undefined && variation !== '' && variation !== 'default') {
		logService.warn(`[NewSessionViewV2Tour] Unsupported variation '${variation}'; using 'default'.`);
	}
	return 'default';
}
