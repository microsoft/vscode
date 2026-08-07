/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposerService } from '../../chat/browser/newSessionComposerService.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { NewSessionViewV3PromptRunner } from './newSessionViewV3Prompt.js';
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
		@INewSessionComposerService private readonly _newSessionComposerService: INewSessionComposerService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@IGitService gitService: IGitService,
		@IFileService fileService: IFileService,
		@IGitHubService gitHubService: IGitHubService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
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
		const promptRunner = new NewSessionViewV3PromptRunner(
			assignmentService,
			configurationService,
			this._sessionsService,
			this._newSessionComposerService,
			gitService,
			fileService,
			gitHubService,
			telemetryService,
			logService,
		);
		this._register(onboardingScenarioRegistry.register(createNewSessionViewV3Tour(
			trigger.signal,
			token => promptRunner.run(token),
		)));
	}
}

registerWorkbenchContribution2(NewSessionViewV3TourContribution.ID, NewSessionViewV3TourContribution, WorkbenchPhase.AfterRestored);
