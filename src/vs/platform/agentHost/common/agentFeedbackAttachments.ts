/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from '../../../base/common/types.js';
import { MessageAttachmentKind, type MessageAttachment, type SimpleMessageAttachment, type TextRange } from './state/protocol/state.js';

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
}

export function isAgentFeedbackAttachment(attachment: MessageAttachment): attachment is SimpleMessageAttachment {
	return attachment.type === MessageAttachmentKind.Simple && attachment.displayKind === AgentFeedbackAttachmentDisplayKind;
}

export function getAgentFeedbackAttachmentMetadata(attachment: MessageAttachment): IAgentFeedbackAttachmentMetadata | undefined {
	if (!isAgentFeedbackAttachment(attachment)) {
		return undefined;
	}
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
	return {
		id: item.id,
		text: item.text,
		resourceUri: item.resourceUri,
		range,
	};
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
