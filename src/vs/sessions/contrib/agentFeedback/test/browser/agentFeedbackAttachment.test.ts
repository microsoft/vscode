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
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentFeedbackAttachmentContribution } from '../../browser/agentFeedbackAttachment.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { buildNewSessionPrompt } from '../../browser/agentFeedbackAttachmentEntry.js';

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

	test('formats new-session prompts with comment locations and nested replies', () => {
		const sessionResource = URI.parse('agent-feedback:/new-session');
		const feedback = (id: string, text: string, path: string, range: Range, replies?: readonly string[]): IAgentFeedback => ({
			id,
			text,
			resourceUri: URI.file(path),
			range,
			sessionResource,
			kind: AgentFeedbackKind.UserReview,
			state: AgentFeedbackState.Accepted,
			replies,
		});
		const roots = [URI.file('/workspace'), URI.file('/second-root')];
		const first = feedback('one', 'Fix this', '/workspace/src/a.ts', new Range(10, 2, 12, 4), ['Also cover null', 'Keep the\nerror detail']);
		const second = feedback('two', 'Rename this', '/workspace/src/b.ts', new Range(3, 1, 3, 8));
		const inSecondRoot = feedback('three', 'Update this', '/second-root/lib/c.ts', new Range(7, 1, 7, 5));
		const outsideWorkspace = feedback('four', 'Check this', '/elsewhere/d.ts', new Range(1, 1, 1, 2));

		assert.deepStrictEqual({
			promptAndComments: buildNewSessionPrompt('Implement the change', [first, second], roots),
			singleComment: buildNewSessionPrompt('', [first], roots),
			multipleComments: buildNewSessionPrompt('', [first, second], roots),
			multiRoot: buildNewSessionPrompt('', [second, inSecondRoot, outsideWorkspace], roots),
		}, {
			promptAndComments: 'Implement the change\n- Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail\n- Rename this (src/b.ts:3:1-3:8)',
			singleComment: 'Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail',
			multipleComments: '- Fix this (src/a.ts:10:2-12:4)\n  - reply: Also cover null\n  - reply: Keep the\n    error detail\n- Rename this (src/b.ts:3:1-3:8)',
			multiRoot: '- Rename this (src/b.ts:3:1-3:8)\n- Update this (lib/c.ts:7:1-7:5)\n- Check this (/elsewhere/d.ts:1:1-1:2)',
		});
	});
});
