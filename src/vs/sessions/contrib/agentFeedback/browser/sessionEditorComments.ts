/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentFeedback } from './agentFeedbackService.js';
import { CodeReviewStateKind, ICodeReviewComment, ICodeReviewState, ICodeReviewSuggestion, IPRReviewComment, IPRReviewState, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';

export const enum SessionEditorCommentSource {
	AgentFeedback = 'agentFeedback',
	CodeReview = 'codeReview',
	PRReview = 'prReview',
}

export interface ISessionEditorComment {
	readonly id: string;
	readonly sourceId: string;
	readonly source: SessionEditorCommentSource;
	readonly sessionResource: URI;
	readonly resourceUri: URI;
	readonly range: IRange;
	readonly text: string;
	readonly suggestion?: ICodeReviewSuggestion;
	readonly severity?: string;
	readonly canConvertToAgentFeedback: boolean;
}

export function getCodeReviewComments(reviewState: ICodeReviewState): readonly ICodeReviewComment[] {
	return reviewState.kind === CodeReviewStateKind.Result ? reviewState.comments : [];
}

export function getPRReviewComments(prReviewState: IPRReviewState | undefined): readonly IPRReviewComment[] {
	return prReviewState?.kind === PRReviewStateKind.Loaded ? prReviewState.comments : [];
}

export function getSessionEditorComments(
	sessionResource: URI,
	agentFeedbackItems: readonly IAgentFeedback[],
	reviewState: ICodeReviewState,
	prReviewState?: IPRReviewState,
): readonly ISessionEditorComment[] {
	const comments: ISessionEditorComment[] = [];

	for (const item of agentFeedbackItems) {
		comments.push({
			id: toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, item.id),
			sourceId: item.id,
			source: SessionEditorCommentSource.AgentFeedback,
			sessionResource,
			resourceUri: item.resourceUri,
			range: item.range,
			text: item.text,
			suggestion: item.suggestion,
			canConvertToAgentFeedback: false,
		});
	}

	for (const item of getCodeReviewComments(reviewState)) {
		comments.push({
			id: toSessionEditorCommentId(SessionEditorCommentSource.CodeReview, item.id),
			sourceId: item.id,
			source: SessionEditorCommentSource.CodeReview,
			sessionResource,
			resourceUri: item.uri,
			range: item.range,
			text: item.body,
			suggestion: item.suggestion,
			severity: item.severity,
			canConvertToAgentFeedback: true,
		});
	}

	for (const item of getPRReviewComments(prReviewState)) {
		comments.push({
			id: toSessionEditorCommentId(SessionEditorCommentSource.PRReview, item.id),
			sourceId: item.id,
			source: SessionEditorCommentSource.PRReview,
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
	return textLines + 1 + suggestionLines;
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

export function hasAgentFeedbackComments(comments: readonly ISessionEditorComment[]): boolean {
	return comments.some(comment => comment.source === SessionEditorCommentSource.AgentFeedback);
}
