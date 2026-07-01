/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Range, type IRange } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackReviewComment } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from './agentFeedbackService.js';

/**
 * Feedback kinds that originate from a review the user triages (a pull request
 * review or an in-product code review). Mirrors the server-side reviewable
 * kinds and excludes user-authored feedback.
 */
const REVIEWABLE_KINDS: ReadonlySet<AgentFeedbackKind> = new Set([AgentFeedbackKind.PRReview, AgentFeedbackKind.AgentReview]);

/**
 * Localized origin label for a reviewable feedback item, matching the labels
 * the agent feedback editor widget shows.
 */
function kindLabel(kind: AgentFeedbackKind): string | undefined {
	switch (kind) {
		case AgentFeedbackKind.PRReview:
			return localize('agentFeedbackReview.prReview', "PR Review");
		case AgentFeedbackKind.AgentReview:
			return localize('agentFeedbackReview.agentReview', "Agent Review");
		default:
			return undefined;
	}
}

/**
 * Registers the commands the chat `viewUnreviewedComments` confirmation
 * renderer (in `vs/workbench/contrib/chat`) uses to fetch unreviewed comments
 * and apply the user's selection. Keeping the logic here means the chat layer
 * never depends on the `vs/sessions` feedback model.
 */
export function registerAgentFeedbackReviewCommands(): void {
	CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.GetComments, (accessor, sessionResource: UriComponents): IChatAgentFeedbackReviewComment[] => {
		const feedbackService = accessor.get(IAgentFeedbackService);
		const resource = URI.revive(sessionResource);
		return feedbackService.getFeedback(resource)
			.filter(item => item.state === AgentFeedbackState.Created && REVIEWABLE_KINDS.has(item.kind))
			.map(item => ({
				id: item.id,
				kindLabel: kindLabel(item.kind),
				text: item.text,
				fileUri: item.resourceUri,
			}));
	});

	CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.Reveal, async (accessor, sessionResource: UriComponents, commentId: string): Promise<void> => {
		const feedbackService = accessor.get(IAgentFeedbackService);
		await feedbackService.revealFeedback(URI.revive(sessionResource), commentId);
	});

	CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.RevealAt, async (accessor, resourceUri: string, range: IRange): Promise<void> => {
		const feedbackService = accessor.get(IAgentFeedbackService);
		const resource = URI.parse(resourceUri);
		// A rendered `addComment` tool call links here without knowing the
		// session URI, so resolve the owning session from the file it commented
		// on. Prefer the session the file belongs to (which falls back to the
		// active session for in-scope files, so the "open file at range"
		// affordance works even before the resource has accumulated feedback);
		// fall back to the most recent session that has feedback for it.
		const sessionResource = feedbackService.getSessionForFile(resource)?.resource
			?? feedbackService.getMostRecentSessionForResource(resource);
		if (!sessionResource) {
			return;
		}
		// Prefer revealing via the matching feedback item so its editor widget
		// expands (the navigation anchor is set from the item id); fall back to
		// opening the file at the range when no item matches.
		const match = feedbackService.getFeedback(sessionResource).find(item => isEqual(item.resourceUri, resource) && Range.equalsRange(item.range, range));
		if (match) {
			await feedbackService.revealFeedback(sessionResource, match.id);
		} else {
			await feedbackService.revealSessionComment(sessionResource, '', resource, range);
		}
	});

	CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.Delete, (accessor, sessionResource: UriComponents, commentId: string): void => {
		const feedbackService = accessor.get(IAgentFeedbackService);
		const codeReviewService = accessor.get(ICodeReviewService);
		const resource = URI.revive(sessionResource);
		// Suppress the originating PR comment first (before removing the mirror)
		// so the PR-review seeder does not immediately re-create the mirror the
		// user just deleted.
		const item = feedbackService.getFeedback(resource).find(f => f.id === commentId);
		if (item?.kind === AgentFeedbackKind.PRReview && item.sourcePRReviewCommentId) {
			codeReviewService.dismissPRReviewComment(resource, item.sourcePRReviewCommentId);
		}
		feedbackService.removeFeedback(resource, commentId);
	});

	CommandsRegistry.registerCommand(AgentFeedbackReviewCommandId.Accept, (accessor, sessionResource: UriComponents, commentIds: readonly string[]): void => {
		const feedbackService = accessor.get(IAgentFeedbackService);
		const resource = URI.revive(sessionResource);
		for (const id of commentIds) {
			feedbackService.acceptFeedback(resource, id, { revealToAgent: true });
		}
	});
}
