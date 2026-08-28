/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
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
			override readonly onDidChangeFeedbackVisibility = Event.None;
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
			override getVisibleResolvedFeedbackIds(): ReadonlySet<string> {
				return new Set();
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

	test('reveals a comment after its resource scope becomes available', () => {
		const resource = URI.parse('file:///document.md');
		const sessionResource = URI.parse('test://session/1');
		const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };
		const onDidChangeFeedbackScope = store.add(new Emitter<void>());
		const onDidRevealSessionComment = store.add(new Emitter<{ sessionResource: URI; commentId: string; resourceUri: URI }>());
		let scopeAvailable = false;
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeFeedbackScope = onDidChangeFeedbackScope.event;
			override readonly onDidRevealSessionComment = onDidRevealSessionComment.event;
			override getFeedbackSessionResource(): URI | undefined {
				return scopeAvailable ? sessionResource : undefined;
			}
			override getFeedback() {
				return [
					{ id: 'feedback', text: 'Feedback', resourceUri: resource, range, sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Created },
				];
			}
			override getVisibleResolvedFeedbackIds(): ReadonlySet<string> {
				return new Set();
			}
		}();
		const planReviewFeedbackService = new class extends mock<IPlanReviewFeedbackService>() {
			override readonly onDidChangePlanReviewScope = Event.None;
		}();
		const bridge = store.add(new AgentEditorCommentsBridge());
		store.add(new AgentEditorCommentsProviderContribution(feedbackService, planReviewFeedbackService, bridge));

		const events: string[] = [];
		store.add(bridge.onDidChangeComments(() => events.push(`comments:${bridge.getCommentIds(resource).join(',')}`)));
		store.add(bridge.onDidRevealComment(event => events.push(`reveal:${event.id}`)));

		onDidRevealSessionComment.fire({ sessionResource, commentId: 'agentFeedback:feedback', resourceUri: resource });
		scopeAvailable = true;
		onDidChangeFeedbackScope.fire();

		assert.deepStrictEqual(events, [
			'comments:agentFeedback:feedback',
			'reveal:agentFeedback:feedback',
		]);
	});

	test('hides resolved comments instead of deleting them', () => {
		const resource = URI.parse('file:///document.md');
		const sessionResource = URI.parse('test://session/1');
		const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };
		const hiddenFeedbackIds: string[] = [];
		const removedFeedbackIds: string[] = [];
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
			override readonly onDidRevealSessionComment = Event.None;
			override getFeedbackSessionResource(): URI {
				return sessionResource;
			}
			override getFeedback() {
				return [
					{ id: 'resolved', text: 'Resolved', resourceUri: resource, range, sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Resolved },
				];
			}
			override getVisibleResolvedFeedbackIds(): ReadonlySet<string> {
				return new Set(['resolved']);
			}
			override hideFeedbackInEditor(_sessionResource: URI, feedbackId: string): void {
				hiddenFeedbackIds.push(feedbackId);
			}
			override removeFeedback(_sessionResource: URI, feedbackId: string): void {
				removedFeedbackIds.push(feedbackId);
			}
		}();
		const planReviewFeedbackService = new class extends mock<IPlanReviewFeedbackService>() {
			override readonly onDidChangePlanReviewScope = Event.None;
		}();
		const bridge = store.add(new AgentEditorCommentsBridge());
		store.add(new AgentEditorCommentsProviderContribution(feedbackService, planReviewFeedbackService, bridge));

		bridge.deleteComment(resource, 'agentFeedback:resolved');

		assert.deepStrictEqual({ hiddenFeedbackIds, removedFeedbackIds }, {
			hiddenFeedbackIds: ['resolved'],
			removedFeedbackIds: [],
		});
	});
});
