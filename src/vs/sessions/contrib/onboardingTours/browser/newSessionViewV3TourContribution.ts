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
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { NewSessionViewTourTrigger } from './newSessionViewTourTrigger.js';
import { createNewSessionViewV3Tour, NEW_SESSION_VIEW_V3_TOUR_ID } from './tours/newSessionViewV3Tour.js';

class NewSessionViewV3TourContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.onboardingTours.newSessionViewV3Tour';

	constructor(
		@IOnboardingScenarioService onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
	) {
		super();

		const trigger = this._register(new NewSessionViewTourTrigger(
			NEW_SESSION_VIEW_V3_TOUR_ID,
			onboardingScenarioService,
			this._sessionsService,
			storageService,
			configurationService,
			contextKeyService,
			chatEntitlementService,
		));
		this._register(onboardingScenarioRegistry.register(createNewSessionViewV3Tour(
			trigger.signal,
			(prompt, durationMs, taskPlaceholder) => this._animatePrompt(prompt, durationMs, taskPlaceholder),
		)));
	}

	private _animatePrompt(prompt: string, durationMs: number, taskPlaceholder: string): void {
		const activeSession = this._sessionsService.activeSession.get();
		if (activeSession?.isCreated.get()) {
			return;
		}
		this._sessionsPartService.getSessionView(activeSession?.sessionId)?.animateInput(prompt, durationMs, taskPlaceholder);
	}
}

registerWorkbenchContribution2(NewSessionViewV3TourContribution.ID, NewSessionViewV3TourContribution, WorkbenchPhase.AfterRestored);
