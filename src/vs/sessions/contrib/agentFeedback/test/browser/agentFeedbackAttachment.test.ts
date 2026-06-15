/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentFeedbackAttachmentContribution } from '../../browser/agentFeedbackAttachment.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';

suite('AgentFeedbackAttachmentContribution', () => {
	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('skips chat widget attachments for agent host sessions', () => {
		const sessionResource = URI.parse('agent-host-copilot:/session-1');
		const feedback: IAgentFeedback = {
			id: 'feedback-1',
			text: 'Check this',
			resourceUri: URI.file('/workspace/a.ts'),
			range: new Range(1, 1, 1, 5),
			sessionResource,
			kind: AgentFeedbackKind.UserReview,
			state: AgentFeedbackState.Accepted,
		};
		let getWidgetCallCount = 0;
		let listener: ((event: IAgentFeedbackChangeEvent) => void) | undefined;

		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override onDidChangeFeedback = (callback: (event: IAgentFeedbackChangeEvent) => void) => {
				listener = callback;
				return { dispose: () => { listener = undefined; } };
			};
			override getFeedback(): readonly IAgentFeedback[] { return [feedback]; }
		};
		const widgetService = new class extends mock<IChatWidgetService>() {
			override getWidgetBySessionResource(_sessionResource: URI): IChatWidget | undefined {
				getWidgetCallCount++;
				throw new Error('attachments should not be read for agent host sessions');
			}
		};
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
			override onDidChangeSessions = Event.None;
			override getSession(resource: URI): ISession | undefined {
				return resource.toString() === sessionResource.toString()
					? { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, status: observableValue('status', SessionStatus.InProgress) } as unknown as ISession
					: undefined;
			}
		};

		store.add(new AgentFeedbackAttachmentContribution(feedbackService, widgetService, sessionsManagementService));
		assert.ok(listener, 'expected feedback listener to be registered');

		listener!({ sessionResource, feedbackItems: [feedback] });

		assert.strictEqual(getWidgetCallCount, 0);
	});
});
