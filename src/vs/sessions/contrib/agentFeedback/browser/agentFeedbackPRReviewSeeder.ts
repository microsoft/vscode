/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { isAgentHostProviderId } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ICodeReviewService, IPRReviewComment, PRReviewStateKind } from '../../../../workbench/contrib/sessions/browser/codeReviewService.js';
import { IAgentFeedbackService } from '../../../../workbench/contrib/sessions/browser/agentFeedback.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from '../../../../workbench/contrib/sessions/browser/agentFeedbackModel.js';

/**
 * Mirrors un-accepted pull request review comments onto the active agent-host
 * session's feedback (annotations) channel as {@link AgentFeedbackState.Created}
 * {@link AgentFeedbackKind.PRReview} items.
 *
 * PR review comments otherwise live only client-side in
 * {@link ICodeReviewService} and are invisible to the agent. The agent-host
 * `listComments` tool surfaces a "there are N pull request comments which the
 * user has not reviewed yet" note and the `viewUnreviewedComments` tool reveals
 * them, but both read ONLY annotations of a reviewable kind in the `created`
 * state. Seeding a mirror annotation per PR comment is what makes those tools
 * aware of the comments so the user can reveal and accept them.
 *
 * The mirror carries {@link IAgentFeedback.sourcePRReviewCommentId} (the GitHub
 * review thread id) so it replaces the raw PR comment in the editor and so
 * resolving the agent feedback resolves the originating GitHub thread (see
 * {@link import('./agentFeedbackPRThreadResolver.js').AgentFeedbackPRThreadResolverContribution}).
 *
 * Seeding is keyed off the session resource (the same key every other feedback
 * operation uses), so a session's comments stay on one annotations channel even
 * when it contains multiple chats.
 *
 * Only the active session is seeded: {@link ICodeReviewService} loads PR review
 * threads exclusively for the active session, so no PR comment data exists for
 * background sessions to mirror. Because mirrors are persisted as annotations on
 * the server, a session keeps its mirrors after it stops being active.
 */
export class AgentFeedbackPRReviewSeederContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentFeedbackPRReviewSeeder';

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
	) {
		super();

		// Re-evaluate when the feedback set changes so seeding waits for the
		// session's annotations snapshot (and reacts to mirrors being accepted,
		// removed, or to a comment's mirror disappearing).
		const feedbackChanged = observableSignalFromEvent(this, this._agentFeedbackService.onDidChangeFeedback);

		this._register(autorun(reader => {
			const activeSession = this._focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			if (!activeSession || !isAgentHostProviderId(activeSession.providerId)) {
				return;
			}
			const sessionResource = activeSession.resource;
			const prReviewState = this._codeReviewService.getPRReviewState(sessionResource).read(reader);
			feedbackChanged.read(reader);
			if (prReviewState.kind !== PRReviewStateKind.Loaded) {
				return;
			}
			syncPRReviewFeedback(this._agentFeedbackService, sessionResource, prReviewState.comments, prReviewState.incompletePullRequests);
		}));
	}
}

export function syncPRReviewFeedback(agentFeedbackService: IAgentFeedbackService, sessionResource: URI, comments: readonly IPRReviewComment[], incompletePullRequests: readonly Pick<IPRReviewComment['pullRequest'], 'owner' | 'repo' | 'number'>[]): void {
	// Only act once the authoritative feedback set is available; seeding off
	// a transiently-empty list would create duplicate mirrors on reload.
	if (!agentFeedbackService.hasLoadedFeedback(sessionResource)) {
		return;
	}

	const feedback = agentFeedbackService.getFeedback(sessionResource);
	const mirroredSourceIds = new Set<string>();
	const mirrorBySource = new Map<string, IAgentFeedback>();
	const createdMirrorBySource = new Map<string, IAgentFeedback>();
	// Extra created mirrors that share a source with one already seen. These
	// arise from a benign race (a second seed dispatched before the first
	// echoed back, or two windows seeding the same session) and are collapsed
	// to a single mirror below.
	const duplicateCreatedMirrors: IAgentFeedback[] = [];
	for (const item of feedback) {
		if (item.kind === AgentFeedbackKind.PRReview && item.sourcePRReviewCommentId) {
			mirroredSourceIds.add(item.sourcePRReviewCommentId);
			if (!mirrorBySource.has(item.sourcePRReviewCommentId)) {
				mirrorBySource.set(item.sourcePRReviewCommentId, item);
			}
			if (item.state === AgentFeedbackState.Created) {
				if (createdMirrorBySource.has(item.sourcePRReviewCommentId)) {
					duplicateCreatedMirrors.push(item);
				} else {
					createdMirrorBySource.set(item.sourcePRReviewCommentId, item);
				}
			}
		}
	}
	for (const duplicate of duplicateCreatedMirrors) {
		agentFeedbackService.removeFeedback(sessionResource, duplicate.id);
	}

	for (const comment of comments) {
		const mirror = mirrorBySource.get(comment.id);
		if (mirror && (!mirror.sourcePullRequest || (!mirror.sourcePRReviewCommentAuthor && comment.author))) {
			agentFeedbackService.updateFeedbackSourcePullRequest(sessionResource, mirror.id, {
				owner: comment.pullRequest.owner,
				repo: comment.pullRequest.repo,
				number: comment.pullRequest.number,
			}, comment.author || undefined);
		}
		const createdMirror = createdMirrorBySource.get(comment.id);
		if (createdMirror) {
			// Keep an existing un-accepted mirror in sync with edits to the
			// upstream comment body so the agent reads the latest text.
			if (createdMirror.text !== comment.body) {
				agentFeedbackService.updateFeedback(sessionResource, createdMirror.id, comment.body);
			}
			continue;
		}
		// Any existing mirror supersedes the raw PR comment in the editor.
		if (!mirroredSourceIds.has(comment.id)) {
			agentFeedbackService.addFeedback(
				sessionResource,
				comment.uri,
				comment.range,
				comment.body,
				undefined,
				undefined,
				comment.id,
				AgentFeedbackKind.PRReview,
				AgentFeedbackState.Created,
				{
					owner: comment.pullRequest.owner,
					repo: comment.pullRequest.repo,
					number: comment.pullRequest.number,
				},
				comment.author || undefined,
			);
		}
	}

	// Drop mirrors whose PR comment is gone (resolved upstream, converted to
	// a separate accepted item from the editor, or dismissed) while still
	// un-accepted; accepted/submitted mirrors are kept since the user acted
	// on them.
	const incompletePullRequestKeys = new Set(incompletePullRequests.map(pullRequest => pullRequestKey(pullRequest)));
	const liveSourceIds = new Set(comments.map(comment => comment.id));
	for (const item of feedback) {
		if (item.kind === AgentFeedbackKind.PRReview
			&& item.state === AgentFeedbackState.Created
			&& item.sourcePRReviewCommentId
			&& !liveSourceIds.has(item.sourcePRReviewCommentId)
		) {
			if (!item.sourcePullRequest
				? incompletePullRequestKeys.size > 0
				: incompletePullRequestKeys.has(pullRequestKey(item.sourcePullRequest))
			) {
				continue;
			}
			agentFeedbackService.removeFeedback(sessionResource, item.id);
		}
	}
}

function pullRequestKey(pullRequest: Pick<IPRReviewComment['pullRequest'], 'owner' | 'repo' | 'number'>): string {
	return `${pullRequest.owner.toLowerCase()}/${pullRequest.repo.toLowerCase()}#${pullRequest.number}`;
}
