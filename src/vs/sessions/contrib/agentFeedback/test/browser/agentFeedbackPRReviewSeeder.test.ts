/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ICodeReviewService, ICodeReviewSuggestion, IPRReviewComment, IPRReviewState, PRReviewStateKind } from '../../../codeReview/browser/codeReviewService.js';
import { IAgentFeedbackContext } from '../../browser/agentFeedbackEditorUtils.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { AgentFeedbackPRReviewSeederContribution } from '../../browser/agentFeedbackPRReviewSeeder.js';

suite('AgentFeedbackPRReviewSeederContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('local-agent-host:/session-1');
	const fileA = URI.file('/workspace/a.ts');
	const pullRequest = { owner: 'owner', repo: 'repo', number: 42, uri: URI.parse('https://github.com/owner/repo/pull/42') };

	let feedbackItems: IAgentFeedback[];
	let loaded: boolean;
	let onDidChangeFeedback: Emitter<{ sessionResource: URI; feedbackItems: readonly IAgentFeedback[] }>;
	let prReviewState: ISettableObservable<IPRReviewState>;
	let activeSession: ISettableObservable<IActiveSession | undefined>;

	function prComment(id: string, line: number, body: string): IPRReviewComment {
		return { id, pullRequest, uri: fileA, range: new Range(line, 1, line, 1), body, author: 'reviewer' };
	}

	function setComments(comments: readonly IPRReviewComment[], incompletePullRequests: readonly typeof pullRequest[] = []): void {
		prReviewState.set({ kind: PRReviewStateKind.Loaded, comments, incompletePullRequests }, undefined);
	}

	function mirrors(): { sourceId: string | undefined; prNumber: number | undefined; state: AgentFeedbackState; text: string }[] {
		return feedbackItems
			.filter(i => i.kind === AgentFeedbackKind.PRReview)
			.map(i => ({ sourceId: i.sourcePRReviewCommentId, prNumber: i.sourcePullRequest?.number, state: i.state, text: i.text }));
	}

	function makeActiveSession(providerId: string): IActiveSession {
		return new class extends mock<IActiveSession>() {
			override readonly resource = session;
			override readonly providerId = providerId;
		};
	}

	setup(() => {
		feedbackItems = [];
		loaded = true;
		onDidChangeFeedback = store.add(new Emitter());
		prReviewState = observableValue<IPRReviewState>('prReviewState', { kind: PRReviewStateKind.None });
		activeSession = observableValue<IActiveSession | undefined>('activeSession', makeActiveSession(LOCAL_AGENT_HOST_PROVIDER_ID));

		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override onDidChangeFeedback = onDidChangeFeedback.event;
			override hasLoadedFeedback(_sessionResource: URI): boolean { return loaded; }
			override getFeedback(_sessionResource: URI): readonly IAgentFeedback[] { return feedbackItems; }
			override addFeedback(sessionResource: URI, resourceUri: URI, range: IRange, text: string, _suggestion?: ICodeReviewSuggestion, _context?: IAgentFeedbackContext, sourcePRReviewCommentId?: string, _kind?: AgentFeedbackKind, state: AgentFeedbackState = AgentFeedbackState.Accepted, sourcePullRequest?: IAgentFeedback['sourcePullRequest']): IAgentFeedback {
				const feedback: IAgentFeedback = { id: generateUuid(), text, resourceUri, range, sessionResource, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId, sourcePullRequest, state };
				feedbackItems.push(feedback);
				onDidChangeFeedback.fire({ sessionResource, feedbackItems });
				return feedback;
			}
			override removeFeedback(_sessionResource: URI, feedbackId: string): void {
				const idx = feedbackItems.findIndex(i => i.id === feedbackId);
				if (idx >= 0) {
					feedbackItems.splice(idx, 1);
					onDidChangeFeedback.fire({ sessionResource: session, feedbackItems });
				}
			}
			override updateFeedback(_sessionResource: URI, feedbackId: string, newText: string): void {
				const idx = feedbackItems.findIndex(i => i.id === feedbackId);
				if (idx >= 0) {
					feedbackItems[idx] = { ...feedbackItems[idx], text: newText };
					onDidChangeFeedback.fire({ sessionResource: session, feedbackItems });
				}
			}
			override updateFeedbackSourcePullRequest(_sessionResource: URI, feedbackId: string, sourcePullRequest: IAgentFeedback['sourcePullRequest']): void {
				const idx = feedbackItems.findIndex(i => i.id === feedbackId);
				if (idx >= 0) {
					feedbackItems[idx] = { ...feedbackItems[idx], sourcePullRequest };
					onDidChangeFeedback.fire({ sessionResource: session, feedbackItems });
				}
			}
		};
		const codeReviewService = new class extends mock<ICodeReviewService>() {
			override getPRReviewState(_sessionResource: URI) { return prReviewState; }
		};
		const sessionsService = new class extends mock<ISessionsService>() {
			override activeSession = activeSession;
		};

		store.add(new AgentFeedbackPRReviewSeederContribution(feedbackService, codeReviewService, sessionsService));
	});

	test('seeds a created PR-review mirror for each un-accepted PR comment', () => {
		setComments([prComment('thread-1', 5, 'Fix this'), prComment('thread-2', 9, 'And this')]);

		assert.deepStrictEqual(mirrors(), [
			{ sourceId: 'thread-1', prNumber: 42, state: AgentFeedbackState.Created, text: 'Fix this' },
			{ sourceId: 'thread-2', prNumber: 42, state: AgentFeedbackState.Created, text: 'And this' },
		]);
	});

	test('does not duplicate mirrors when the PR review state re-emits', () => {
		setComments([prComment('thread-1', 5, 'Fix this')]);
		setComments([prComment('thread-1', 5, 'Fix this'), prComment('thread-2', 9, 'And this')]);

		assert.deepStrictEqual(mirrors().map(m => m.sourceId), ['thread-1', 'thread-2']);
	});

	test('refreshes a created mirror when the upstream comment body changes', () => {
		setComments([prComment('thread-1', 5, 'Fix this')]);
		setComments([prComment('thread-1', 5, 'Fix this differently')]);

		assert.deepStrictEqual(mirrors(), [
			{ sourceId: 'thread-1', prNumber: 42, state: AgentFeedbackState.Created, text: 'Fix this differently' },
		]);
	});

	test('does not refresh an accepted mirror when the upstream comment body changes', () => {
		setComments([prComment('thread-1', 5, 'Fix this')]);
		feedbackItems[0] = { ...feedbackItems[0], state: AgentFeedbackState.Accepted };
		setComments([prComment('thread-1', 5, 'Fix this differently')]);

		assert.deepStrictEqual(mirrors(), [
			{ sourceId: 'thread-1', prNumber: 42, state: AgentFeedbackState.Accepted, text: 'Fix this' },
		]);
	});

	test('removes a created mirror when its PR comment disappears', () => {
		setComments([prComment('thread-1', 5, 'Fix this'), prComment('thread-2', 9, 'And this')]);
		setComments([prComment('thread-1', 5, 'Fix this')]);

		assert.deepStrictEqual(mirrors().map(m => m.sourceId), ['thread-1']);
	});

	test('keeps an accepted mirror even after its PR comment disappears', () => {
		setComments([prComment('thread-1', 5, 'Fix this')]);
		// Simulate the user accepting the mirror.
		feedbackItems[0] = { ...feedbackItems[0], state: AgentFeedbackState.Accepted };
		setComments([]);

		assert.deepStrictEqual(mirrors(), [
			{ sourceId: 'thread-1', prNumber: 42, state: AgentFeedbackState.Accepted, text: 'Fix this' },
		]);
	});

	test('collapses duplicate created mirrors for the same PR comment', () => {
		// Two windows (or a benign echo race) seeded the same comment twice.
		feedbackItems.push(
			{ id: 'mirror-a', text: 'Fix this', resourceUri: fileA, range: new Range(5, 1, 5, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'thread-1', state: AgentFeedbackState.Created },
			{ id: 'mirror-b', text: 'Fix this', resourceUri: fileA, range: new Range(5, 1, 5, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'thread-1', state: AgentFeedbackState.Created },
		);
		setComments([prComment('thread-1', 5, 'Fix this')]);

		assert.deepStrictEqual(mirrors().map(m => m.sourceId), ['thread-1']);
	});

	test('does not seed until the feedback set has loaded', () => {
		loaded = false;
		setComments([prComment('thread-1', 5, 'Fix this')]);
		assert.deepStrictEqual(mirrors(), []);

		// Once loaded, a feedback change re-evaluates and seeds.
		loaded = true;
		onDidChangeFeedback.fire({ sessionResource: session, feedbackItems });
		assert.deepStrictEqual(mirrors().map(m => m.sourceId), ['thread-1']);
	});

	test('does not seed for non-agent-host sessions', () => {
		activeSession.set(makeActiveSession('copilot-chat'), undefined);
		setComments([prComment('thread-1', 5, 'Fix this')]);

		assert.deepStrictEqual(mirrors(), []);
	});

	test('backfills the pull request on a legacy mirror', () => {
		feedbackItems.push({
			id: 'legacy',
			text: 'Fix this',
			resourceUri: fileA,
			range: new Range(5, 1, 5, 1),
			sessionResource: session,
			kind: AgentFeedbackKind.PRReview,
			sourcePRReviewCommentId: 'thread-1',
			state: AgentFeedbackState.Created,
		});

		setComments([prComment('thread-1', 5, 'Fix this')]);

		assert.deepStrictEqual(mirrors(), [
			{ sourceId: 'thread-1', prNumber: 42, state: AgentFeedbackState.Created, text: 'Fix this' },
		]);
	});

	test('removes an absent legacy mirror once every pull request has loaded', () => {
		feedbackItems.push({
			id: 'legacy',
			text: 'Fix this',
			resourceUri: fileA,
			range: new Range(5, 1, 5, 1),
			sessionResource: session,
			kind: AgentFeedbackKind.PRReview,
			sourcePRReviewCommentId: 'thread-1',
			state: AgentFeedbackState.Created,
		});

		setComments([]);

		assert.deepStrictEqual(mirrors(), []);
	});

	test('keeps mirrors omitted by an incomplete pull request snapshot', () => {
		feedbackItems.push(
			{ id: 'one', text: 'One', resourceUri: fileA, range: new Range(5, 1, 5, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'thread-1', sourcePullRequest: pullRequest, state: AgentFeedbackState.Created },
			{ id: 'two', text: 'Two', resourceUri: fileA, range: new Range(9, 1, 9, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'thread-2', sourcePullRequest: pullRequest, state: AgentFeedbackState.Created },
			{ id: 'three', text: 'Three', resourceUri: fileA, range: new Range(12, 1, 12, 1), sessionResource: session, kind: AgentFeedbackKind.PRReview, sourcePRReviewCommentId: 'thread-3', sourcePullRequest: pullRequest, state: AgentFeedbackState.Created },
		);

		const incompletePullRequest = { ...pullRequest, number: 43, uri: URI.parse('https://github.com/owner/repo/pull/43') };
		feedbackItems[1] = { ...feedbackItems[1], sourcePullRequest: incompletePullRequest };
		setComments([prComment('thread-1', 5, 'One')], [incompletePullRequest]);

		assert.deepStrictEqual(mirrors().map(mirror => mirror.sourceId), ['thread-1', 'thread-2']);
	});
});
