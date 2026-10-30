/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { AutomationSessionsListMode, SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AutomationSessionsListingContribution } from '../../browser/automationSessionsListing.js';
import { createTestSession } from './sessionsListTestUtils.js';

suite('AutomationSessionsListingContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const mode of [AutomationSessionsListMode.Always, AutomationSessionsListMode.AfterReply, AutomationSessionsListMode.Never]) {
		test(`shows an automation session once the user sends a message in it only when the setting is afterReply (${mode})`, () => {
			const automation: ISession = { ...createTestSession('Automation').session, isAutomation: constObservable(true) };
			const regular = createTestSession('Regular').session;
			const accepted = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
			const shown: string[] = [];
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IChatService, new class extends mock<IChatService>() {
				override readonly onDidAcceptRequest = accepted.event;
			});
			instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override getSessionForChatResource(resource: URI) {
					const session = [automation, regular].find(candidate => candidate.mainChat.get().resource.toString() === resource.toString());
					return session && { session, chat: session.mainChat.get() };
				}
			});
			instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
				override showRepliedAutomationSession(session: ISession): void {
					shown.push(session.sessionId);
				}
			});
			instantiationService.stub(IConfigurationService, new TestConfigurationService({ [SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING]: mode }));
			instantiationService.stub(ITelemetryService, telemetryService);
			disposables.add(instantiationService.createInstance(AutomationSessionsListingContribution));
			const accept = (chatSessionResource: URI) => accepted.fire({ chatSessionResource, isNewSession: false });

			accept(regular.mainChat.get().resource);
			accept(URI.parse('test-session://unknown'));
			const beforeAutomation = { shown: [...shown], triggers: [...telemetryService.triggers] };
			accept(automation.mainChat.get().resource);
			accept(automation.mainChat.get().resource);

			assert.deepStrictEqual({ beforeAutomation, shown, triggers: telemetryService.triggers }, {
				beforeAutomation: { shown: [], triggers: [] },
				shown: mode === AutomationSessionsListMode.AfterReply ? ['Automation', 'Automation'] : [],
				triggers: [`config.${SESSIONS_LIST_SHOW_AUTOMATION_SESSIONS_SETTING}`],
			});
		});
	}
});
