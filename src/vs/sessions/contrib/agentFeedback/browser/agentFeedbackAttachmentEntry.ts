/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAgentFeedback } from './agentFeedbackModel.js';

/**
 * Stable prefix used for the id of the agent feedback chat attachment. One
 * attachment exists per session resource, so the id is the prefix plus the
 * session resource string.
 */
export const ATTACHMENT_ID_PREFIX = 'agentFeedback:';

/**
 * Builds the chat attachment variable entry that carries the given feedback
 * items into a chat request. The shape is shared between the reactive
 * attachment contribution (non-agent-host sessions) and the agent-host submit
 * flow so both produce identical attachments.
 *
 * For agent-host sessions, pass {@link annotationsResource} (the session's
 * annotations channel URI) so the request emits
 * {@link MessageAnnotationsAttachment}s referencing the specific comments.
 */
export function createAgentFeedbackVariableEntry(sessionResource: URI, feedbackItems: readonly IAgentFeedback[], annotationsResource?: URI): IAgentFeedbackVariableEntry {
	return {
		kind: 'agentFeedback',
		id: ATTACHMENT_ID_PREFIX + sessionResource.toString(),
		name: feedbackItems.length === 1
			? localize('agentFeedback.one', "1 comment")
			: localize('agentFeedback.many', "{0} comments", feedbackItems.length),
		icon: Codicon.comment,
		sessionResource,
		annotationsResource,
		feedbackItems: feedbackItems.map(f => ({
			id: f.id,
			text: f.text,
			resourceUri: f.resourceUri,
			range: f.range,
			codeSelection: f.codeSelection,
			diffHunks: f.diffHunks,
			sourcePRReviewCommentId: f.sourcePRReviewCommentId,
			replies: f.replies,
		})),
		value: buildAgentFeedbackValue(feedbackItems),
	};
}

/**
 * Builds a rich string value for the agent feedback attachment from the
 * selection and diff context already stored on each feedback item. This value
 * is what the agent ultimately reads as the textual representation of the
 * feedback.
 */
export function buildAgentFeedbackValue(feedbackItems: readonly IAgentFeedback[]): string {
	const parts: string[] = ['The following comments were made on the code changes:'];
	for (const item of feedbackItems) {
		const fileName = basename(item.resourceUri);
		const lineRef = item.range.startLineNumber === item.range.endLineNumber
			? `${item.range.startLineNumber}`
			: `${item.range.startLineNumber}-${item.range.endLineNumber}`;

		let part = `[${fileName}:${lineRef}]`;
		if (item.sourcePRReviewCommentId) {
			part += `\n(PR review comment, thread ID: ${item.sourcePRReviewCommentId} — resolve this thread when addressed)`;
		}
		if (item.codeSelection) {
			part += `\nSelection:\n\`\`\`\n${item.codeSelection}\n\`\`\``;
		}
		if (item.diffHunks) {
			part += `\nDiff Hunks:\n\`\`\`diff\n${item.diffHunks}\n\`\`\``;
		}
		part += `\nComment: ${item.text}`;
		if (item.replies?.length) {
			for (const reply of item.replies) {
				part += `\nReply: ${reply}`;
			}
		}
		parts.push(part);
	}

	return parts.join('\n\n');
}
