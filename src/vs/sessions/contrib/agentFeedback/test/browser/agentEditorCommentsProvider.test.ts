/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IPlanReviewFeedbackService } from '../../../../../workbench/contrib/chat/browser/planReviewFeedback/planReviewFeedbackService.js';
import { AgentEditorCommentsBridge } from '../../../../../workbench/services/agentEditorComments/common/agentEditorComments.js';
import { AgentEditorCommentsProviderContribution } from '../../browser/agentEditorCommentsProvider.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';

suite('AgentEditorCommentsProviderContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('related plan feedback includes only accepted agent feedback', () => {
		const planUri = URI.parse('file:///plan.md');
		const relatedUri = URI.parse('file:///related.ts');
		const sessionResource = URI.parse('test://session/1');
		const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
			override readonly onDidRevealSessionComment = Event.None;
			override getFeedbackSessionResource(): URI {
				return sessionResource;
			}
			override getFeedback() {
				return [
					{ id: 'accepted', text: 'Accepted', resourceUri: planUri, range, sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
					{ id: 'submitted', text: 'Submitted', resourceUri: relatedUri, range, sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Submitted },
					{ id: 'created', text: 'Created', resourceUri: relatedUri, range, sessionResource, kind: AgentFeedbackKind.AgentReview, state: AgentFeedbackState.Created },
				];
			}
		}();
		const planReviewFeedbackService = new class extends mock<IPlanReviewFeedbackService>() {
			override readonly onDidChangePlanReviewScope = Event.None;
		}();
		const bridge = store.add(new AgentEditorCommentsBridge());
		store.add(new AgentEditorCommentsProviderContribution(feedbackService, planReviewFeedbackService, bridge));

		assert.deepStrictEqual(
			{
				visible: bridge.getComments(planUri, true).map(comment => comment.body),
				allIds: bridge.getCommentIds(planUri, true),
			},
			{
				visible: ['Accepted'],
				allIds: [
					'agentFeedback:accepted',
					'agentFeedback:created',
					'agentFeedback:submitted',
				],
			},
		);
	});
});
