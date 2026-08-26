/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { NewSessionViewTourTrigger } from './newSessionViewTourTrigger.js';
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_TOUR_ID } from './tours/newSessionViewV2Tour.js';

class NewSessionViewV2TourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.newSessionViewV2Tour';

	constructor(
		@IOnboardingScenarioService onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsService sessionsService: ISessionsService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();

		const trigger = this._register(new NewSessionViewTourTrigger(
			NEW_SESSION_VIEW_V2_TOUR_ID,
			onboardingScenarioService,
			sessionsService,
			storageService,
			configurationService,
			contextKeyService,
			chatEntitlementService,
		));
		this._register(onboardingScenarioRegistry.register(createNewSessionViewV2Tour(trigger.signal)));
	}
}

registerWorkbenchContribution2(NewSessionViewV2TourContribution.ID, NewSessionViewV2TourContribution, WorkbenchPhase.AfterRestored);
