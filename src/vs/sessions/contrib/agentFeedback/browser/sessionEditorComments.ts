/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback } from './agentFeedbackModel.js';
import { ICodeReviewSuggestion, IPRReviewComment, IPRReviewState, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';

export const enum SessionEditorCommentSource {
	AgentFeedback = 'agentFeedback',
	PRReview = 'prReview',
}

export interface ISessionEditorComment {
	readonly id: string;
	readonly sourceId: string;
	readonly source: SessionEditorCommentSource;
	/** Origin of this comment, used to render its type label. */
	readonly kind: AgentFeedbackKind;
	readonly sessionResource: URI;
	readonly resourceUri: URI;
	readonly range: IRange;
	readonly text: string;
	readonly suggestion?: ICodeReviewSuggestion;
	readonly canConvertToAgentFeedback: boolean;
	/**
	 * Replies that belong to the same comment thread as this comment. They
	 * talk about the same code region as {@link text}. Only set for agent
	 * feedback comments today.
	 */
	readonly replies?: readonly string[];
	/**
	 * Lifecycle state of this comment. Only set for agent feedback comments.
	 */
	readonly state?: AgentFeedbackState;
}

export function getPRReviewComments(prReviewState: IPRReviewState | undefined): readonly IPRReviewComment[] {
	return prReviewState?.kind === PRReviewStateKind.Loaded ? prReviewState.comments : [];
}

export function getSessionEditorComments(
	sessionResource: URI,
	agentFeedbackItems: readonly IAgentFeedback[],
	prReviewState?: IPRReviewState,
): readonly ISessionEditorComment[] {
	const comments: ISessionEditorComment[] = [];

	// PR review comments are mirrored onto the feedback channel as `created`
	// `prReview` items so the agent can see them (see
	// `agentFeedbackPRReviewSeeder.ts`). Deduplicate the two representations by
	// the originating PR thread id: while a mirror is still `created` the raw PR
	// comment is shown (preserving its native actions) and the mirror is hidden;
	// once the user accepts the mirror it supersedes the raw PR comment.
	const supersededPRCommentIds = new Set<string>();
	for (const item of agentFeedbackItems) {
		if (item.kind === AgentFeedbackKind.PRReview && item.sourcePRReviewCommentId && item.state !== AgentFeedbackState.Created) {
			supersededPRCommentIds.add(item.sourcePRReviewCommentId);
		}
	}

	for (const item of agentFeedbackItems) {
		// Resolved feedback is hidden from the editor UI.
		if (item.state === AgentFeedbackState.Resolved) {
			continue;
		}
		// Hide the still-unaccepted PR review mirror; the raw PR comment is
		// shown instead.
		if (item.kind === AgentFeedbackKind.PRReview && item.state === AgentFeedbackState.Created && item.sourcePRReviewCommentId) {
			continue;
		}
		comments.push({
			id: toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, item.id),
			sourceId: item.id,
			source: SessionEditorCommentSource.AgentFeedback,
			kind: item.kind,
			sessionResource,
			resourceUri: item.resourceUri,
			range: item.range,
			text: item.text,
			suggestion: item.suggestion,
			canConvertToAgentFeedback: false,
			replies: item.replies,
			state: item.state,
		});
	}

	for (const item of getPRReviewComments(prReviewState)) {
		// Hide raw PR comments that the user has already accepted into agent
		// feedback (shown via the accepted mirror above).
		if (supersededPRCommentIds.has(item.id)) {
			continue;
		}
		comments.push({
			id: toSessionEditorCommentId(SessionEditorCommentSource.PRReview, item.id),
			sourceId: item.id,
			source: SessionEditorCommentSource.PRReview,
			kind: AgentFeedbackKind.PRReview,
			sessionResource,
			resourceUri: item.uri,
			range: item.range,
			text: item.body,
			canConvertToAgentFeedback: true,
		});
	}

	comments.sort(compareSessionEditorComments);
	return comments;
}

export function compareSessionEditorComments(a: ISessionEditorComment, b: ISessionEditorComment): number {
	return a.resourceUri.toString().localeCompare(b.resourceUri.toString())
		|| Range.compareRangesUsingStarts(Range.lift(a.range), Range.lift(b.range))
		|| a.source.localeCompare(b.source)
		|| a.sourceId.localeCompare(b.sourceId);
}

/**
 * Approximates the vertical space (in editor lines) a comment occupies when
 * rendered expanded inside the agent feedback widget. Used so that grouping
 * accounts for very long comments that would otherwise visually overlap with
 * the next nearby widget.
 */
function estimateExpandedCommentLines(comment: ISessionEditorComment): number {
	// Rough number of characters that fit on one line in the widget body.
	const charsPerLine = 50;
	const textLines = Math.ceil(Math.max(1, comment.text.length) / charsPerLine);
	// Add a small overhead for the item header (line info, action bar) and
	// for suggestion blocks which render additional lines of code.
	let suggestionLines = 0;
	if (comment.suggestion?.edits.length) {
		for (const edit of comment.suggestion.edits) {
			suggestionLines += 2 + Math.max(1, edit.newText.split('\n').length);
		}
	}
	let replyLines = 0;
	if (comment.replies?.length) {
		for (const reply of comment.replies) {
			replyLines += Math.ceil(Math.max(1, reply.length) / charsPerLine);
		}
	}
	return textLines + 1 + suggestionLines + replyLines;
}

export function groupNearbySessionEditorComments(items: readonly ISessionEditorComment[], lineThreshold: number = 5): ISessionEditorComment[][] {
	if (items.length === 0) {
		return [];
	}

	const sorted = [...items].sort(compareSessionEditorComments);
	const groups: ISessionEditorComment[][] = [];
	let currentGroup: ISessionEditorComment[] = [sorted[0]];
	let currentGroupExpandedLines = estimateExpandedCommentLines(sorted[0]);

	for (let i = 1; i < sorted.length; i++) {
		const firstItem = currentGroup[0];
		const currentItem = sorted[i];

		const sameResource = currentItem.resourceUri.toString() === firstItem.resourceUri.toString();
		const verticalSpan = currentItem.range.startLineNumber - firstItem.range.startLineNumber;
		// Account for the estimated vertical space already taken by the
		// expanded group so that a long comment pulls in items below it.
		const effectiveThreshold = lineThreshold + currentGroupExpandedLines;

		if (sameResource && verticalSpan <= effectiveThreshold) {
			currentGroup.push(currentItem);
			currentGroupExpandedLines += estimateExpandedCommentLines(currentItem);
		} else {
			groups.push(currentGroup);
			currentGroup = [currentItem];
			currentGroupExpandedLines = estimateExpandedCommentLines(currentItem);
		}
	}

	groups.push(currentGroup);
	return groups;
}

export function getResourceEditorComments(resourceUri: URI, comments: readonly ISessionEditorComment[]): readonly ISessionEditorComment[] {
	const resource = resourceUri.toString();
	return comments.filter(comment => comment.resourceUri.toString() === resource);
}

export function toSessionEditorCommentId(source: SessionEditorCommentSource, sourceId: string): string {
	return `${source}:${sourceId}`;
}

/**
 * Inverse of {@link toSessionEditorCommentId}. Returns `undefined` when the id
 * does not match the `${source}:${sourceId}` shape produced above.
 */
export function fromSessionEditorCommentId(id: string): { readonly source: SessionEditorCommentSource; readonly sourceId: string } | undefined {
	const separatorIndex = id.indexOf(':');
	if (separatorIndex === -1) {
		return undefined;
	}
	const source = id.slice(0, separatorIndex);
	if (source !== SessionEditorCommentSource.AgentFeedback && source !== SessionEditorCommentSource.PRReview) {
		return undefined;
	}
	return { source, sourceId: id.slice(separatorIndex + 1) };
}

export function getAcceptedAgentFeedbackCommentCount(comments: readonly ISessionEditorComment[]): number {
	let count = 0;
	for (const comment of comments) {
		if (comment.source === SessionEditorCommentSource.AgentFeedback && comment.state === AgentFeedbackState.Accepted) {
			count++;
		}
	}
	return count;
}

export function hasAcceptedAgentFeedbackComments(comments: readonly ISessionEditorComment[]): boolean {
	return comments.some(comment => comment.source === SessionEditorCommentSource.AgentFeedback && comment.state === AgentFeedbackState.Accepted);
}
