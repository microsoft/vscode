/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from '../../../../base/common/types.js';
import { MessageAttachmentKind, type MessageAnnotationsAttachment, type MessageAttachment, type SimpleMessageAttachment, type TextRange } from '../state/protocol/state.js';

export const AgentFeedbackAttachmentDisplayKind = 'agentFeedback';
export const AgentFeedbackAttachmentMetadataKey = 'agentFeedback';

export interface IAgentFeedbackAttachmentMetadata {
	readonly sessionResource: string;
	readonly feedbackItems: readonly IAgentFeedbackAttachmentItemMetadata[];
}

export interface IAgentFeedbackAttachmentItemMetadata {
	readonly id: string;
	readonly text: string;
	readonly resourceUri: string;
	readonly range: TextRange;
	readonly replies?: readonly string[];
}

export function isAgentFeedbackAttachment(attachment: MessageAttachment): attachment is SimpleMessageAttachment {
	return attachment.type === MessageAttachmentKind.Simple && attachment.displayKind === AgentFeedbackAttachmentDisplayKind;
}

/**
 * Agent feedback is sent to agent-host sessions as one
 * {@link MessageAnnotationsAttachment} per submitted comment, each referencing
 * the specific annotation(s) on the session's annotations channel. The agent
 * reads the comment content via the `listComments` tool and should act on the
 * referenced comments.
 */
export function isAgentFeedbackAnnotationsAttachment(attachment: MessageAttachment): attachment is MessageAnnotationsAttachment {
	return attachment.type === MessageAttachmentKind.Annotations && attachment.displayKind === AgentFeedbackAttachmentDisplayKind;
}

/**
 * Renders an agent-feedback annotations attachment into the textual hint shown
 * to the agent. The hint references the attached comment ids and points the
 * agent at the `listComments` tool to read their content.
 */
export function renderAgentFeedbackAnnotationsAttachment(attachment: MessageAnnotationsAttachment): string | undefined {
	const ids = attachment.annotationIds?.filter(isString) ?? [];
	if (ids.length === 0) {
		return undefined;
	}
	const idList = ids.map(id => `- ${id}`).join('\n');
	return `The user attached specific feedback comments to act on (comment ids):\n${idList}\n\n` +
		'Use the `listComments` tool to read their content and focus on these comments.';
}

export function getAgentFeedbackAttachmentMetadata(attachment: MessageAttachment): IAgentFeedbackAttachmentMetadata | undefined {
	if (!isAgentFeedbackAttachment(attachment) && !isAgentFeedbackAnnotationsAttachment(attachment)) {
		return undefined;
	}
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced feedback slot; validated below.
	const metadata = attachment._meta?.[AgentFeedbackAttachmentMetadataKey];
	if (!isRecord(metadata) || !isString(metadata.sessionResource) || !Array.isArray(metadata.feedbackItems)) {
		return undefined;
	}

	const feedbackItems: IAgentFeedbackAttachmentItemMetadata[] = [];
	for (const item of metadata.feedbackItems) {
		const parsedItem = parseAgentFeedbackAttachmentItem(item);
		if (parsedItem) {
			feedbackItems.push(parsedItem);
		}
	}

	return {
		sessionResource: metadata.sessionResource,
		feedbackItems,
	};
}

function parseAgentFeedbackAttachmentItem(item: unknown): IAgentFeedbackAttachmentItemMetadata | undefined {
	if (!isRecord(item) || !isString(item.id) || !isString(item.text) || !isString(item.resourceUri)) {
		return undefined;
	}
	const range = parseTextRange(item.range);
	if (!range) {
		return undefined;
	}
	const replies = parseReplies(item.replies);
	return {
		id: item.id,
		text: item.text,
		resourceUri: item.resourceUri,
		range,
		replies,
	};
}

function parseReplies(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const replies = value.filter(isString);
	return replies.length > 0 ? replies : undefined;
}

function parseTextRange(range: unknown): TextRange | undefined {
	if (!isRecord(range) || !isRecord(range.start) || !isRecord(range.end)) {
		return undefined;
	}
	const start = parseTextPosition(range.start);
	const end = parseTextPosition(range.end);
	if (!start || !end) {
		return undefined;
	}
	return { start, end };
}

function parseTextPosition(position: Record<string, unknown>): TextRange['start'] | undefined {
	if (typeof position.line !== 'number' || typeof position.character !== 'number') {
		return undefined;
	}
	return { line: position.line, character: position.character };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
