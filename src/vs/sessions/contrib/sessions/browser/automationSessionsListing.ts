/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { AutomationSessionsListMode, SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING } from '../../../common/sessionConfig.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Shows an automation session in the sessions list once the user sends a message
 * in it, when {@link SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING} is `afterReply`.
 * The automation's own prompts never reach this window's chat service, so an
 * accepted request that is neither system-initiated nor hidden is the user's.
 */
export class AutomationSessionsListingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.automationSessionsListing';

	constructor(
		@IChatService chatService: IChatService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this._register(chatService.onDidAcceptRequest(({ chatSessionResource }) => {
			const session = sessionsManagementService.getSessionForChatResource(chatSessionResource)?.session;
			if (!session?.isAutomation?.get()) {
				return;
			}
			logSettingExperimentTrigger(telemetryService, SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING);
			if (configurationService.getValue<AutomationSessionsListMode>(SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING) === AutomationSessionsListMode.AfterReply) {
				sessionsListModelService.showRepliedAutomationSession(session);
			}
		}));
	}
}
