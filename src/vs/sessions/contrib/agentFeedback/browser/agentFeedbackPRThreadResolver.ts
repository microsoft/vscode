/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackChangeEvent, IAgentFeedbackService } from './agentFeedbackService.js';

interface ISeenPRComment {
	readonly state: AgentFeedbackState;
	readonly threadId: string;
}

/**
 * Resolves the originating GitHub pull request review thread when a PR-review
 * feedback comment is resolved or deleted.
 *
 * PR-review feedback items carry {@link IAgentFeedback.sourcePRReviewCommentId}
 * (the GraphQL review thread id). Resolution and deletion can be driven either
 * by the user (via {@link IAgentFeedbackService.setFeedbackResolved} /
 * {@link IAgentFeedbackService.removeFeedback}) or by the agent's
 * `resolveComments` / `deleteComments` server tools, which mutate the
 * annotations channel. Both ultimately surface as
 * {@link IAgentFeedbackService.onDidChangeFeedback}, so observing that single
 * signal covers every source.
 *
 * Detection rules (kept conservative to avoid resolving threads the user never
 * acted upon):
 * - Resolve transition: a PR comment that was previously observed in a
 *   non-resolved state moves into {@link AgentFeedbackState.Resolved}. Requiring
 *   a prior observation means a history replay of an already-resolved comment
 *   does not trigger a resolution.
 * - Deletion: a PR comment whose last observed state was
 *   {@link AgentFeedbackState.Submitted} or {@link AgentFeedbackState.Resolved}
 *   disappears. Unsubmitted ({@link AgentFeedbackState.Accepted} /
 *   {@link AgentFeedbackState.Created}) comments are excluded so clearing or
 *   discarding unsubmitted feedback never resolves a GitHub thread.
 *
 * Each thread is resolved at most once per session.
 */
export class AgentFeedbackPRThreadResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentFeedbackPRThreadResolver';

	/** Per session: last-seen PR-review comments by feedback id. */
	private readonly _seenBySession = new Map<string, Map<string, ISeenPRComment>>();
	/** Per session: thread ids we have already requested resolution for. */
	private readonly _requestedBySession = new Map<string, Set<string>>();

	constructor(
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._agentFeedbackService.onDidChangeFeedback(e => this._onDidChangeFeedback(e)));
	}

	private _onDidChangeFeedback(e: IAgentFeedbackChangeEvent): void {
		const key = e.sessionResource.toString();
		const previous = this._seenBySession.get(key) ?? new Map<string, ISeenPRComment>();
		const next = new Map<string, ISeenPRComment>();
		const threadsToResolve = new Set<string>();

		for (const item of e.feedbackItems) {
			if (item.kind !== AgentFeedbackKind.PRReview || !item.sourcePRReviewCommentId) {
				continue;
			}
			const threadId = item.sourcePRReviewCommentId;
			next.set(item.id, { state: item.state, threadId });

			const before = previous.get(item.id);
			// Resolve transition (requires a prior non-resolved observation).
			if (item.state === AgentFeedbackState.Resolved && before && before.state !== AgentFeedbackState.Resolved) {
				threadsToResolve.add(threadId);
			}
		}

		// Deletion of a previously submitted/resolved PR comment.
		for (const [id, before] of previous) {
			if (next.has(id)) {
				continue;
			}
			if (before.state === AgentFeedbackState.Submitted || before.state === AgentFeedbackState.Resolved) {
				threadsToResolve.add(before.threadId);
			}
		}

		this._seenBySession.set(key, next);

		if (threadsToResolve.size === 0) {
			return;
		}

		let requested = this._requestedBySession.get(key);
		if (!requested) {
			requested = new Set<string>();
			this._requestedBySession.set(key, requested);
		}
		for (const threadId of threadsToResolve) {
			if (requested.has(threadId)) {
				continue;
			}
			requested.add(threadId);
			this._resolveThread(e.sessionResource, threadId);
		}
	}

	private _resolveThread(sessionResource: URI, threadId: string): void {
		this._codeReviewService.resolvePRReviewThread(sessionResource, threadId)
			.catch(err => this._logService.warn('[AgentFeedback] Failed to resolve PR review thread on GitHub', threadId, err));
	}
}
