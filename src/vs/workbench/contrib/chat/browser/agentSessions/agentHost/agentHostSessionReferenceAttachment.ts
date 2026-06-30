/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { truncateMiddle } from '../../../../../../platform/agentHost/common/agentHostConversationContext.js';
import { type SimpleMessageAttachment } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type IChatRequestSessionReferenceVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { type IChatDebugEvent, type IChatDebugMessageSection, type IChatDebugResolvedEventContent } from '../../../common/chatDebugService.js';
import { type IChatProgress } from '../../../common/chatService/chatService.js';
import { type IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { chatSessionResourceToId } from '../../../common/model/chatUri.js';

export const AgentHostSessionReferenceAttachmentDisplayKind = 'sessionReference';
export const AgentHostSessionReferenceAttachmentMetadataKey = 'vscode.agentHost.sessionReference';

// Soft bound for transcript text embedded into a Simple attachment; matches existing Agent Host utility-model context budgets.
const SessionReferenceTranscriptMaxChars = 20000;

interface IAgentHostSessionReferenceAttachmentMetadata {
	readonly sessionResource: string;
	readonly sessionID: string;
}

export function toSessionReferenceModelRepresentation(label: string, sessionResource: URI, transcript?: string): string {
	const sessionID = chatSessionResourceToId(sessionResource);
	const header = [
		`Attached chat session: ${label}`,
		`Session ID: ${sessionID}`,
		`Session URI: ${sessionResource.toString()}`,
	].join('\n');
	if (!transcript) {
		return header;
	}
	return [
		header,
		'',
		'Attached session transcript:',
		transcript,
	].join('\n');
}

export function toSessionReferenceHistoryTranscript(history: readonly IChatSessionHistoryItem[]): string | undefined {
	const blocks: string[] = [];
	for (const item of history) {
		if (item.type === 'request') {
			const prompt = item.prompt.trim();
			if (prompt) {
				blocks.push(`User:\n${prompt}`);
			}
			continue;
		}

		const response = toSessionReferenceResponse(item.parts);
		if (response) {
			blocks.push(`Assistant:\n${response}`);
		}
		if (item.errorDetails?.message) {
			blocks.push(`Assistant error:\n${item.errorDetails.message}`);
		}
	}

	return toSessionReferenceTranscript(blocks);
}

export async function toSessionReferenceDebugTranscript(events: readonly IChatDebugEvent[], resolveEvent: (eventId: string) => Promise<IChatDebugResolvedEventContent | undefined>): Promise<string | undefined> {
	const blocks: string[] = [];
	for (const event of events) {
		if (event.kind === 'userMessage') {
			const message = toSessionReferenceDebugMessage(event.message, event.sections);
			if (message) {
				blocks.push(`User:\n${message}`);
			}
		} else if (event.kind === 'agentResponse') {
			const message = toSessionReferenceDebugMessage(event.message, event.sections);
			if (message) {
				blocks.push(`Assistant:\n${message}`);
			}
		} else if (event.kind === 'modelTurn' && event.id) {
			const resolved = await resolveEvent(event.id);
			if (resolved?.kind === 'modelTurn') {
				const message = toSessionReferenceDebugSections(resolved.sections);
				if (message) {
					blocks.push(`Assistant:\n${message}`);
				}
			}
		}
	}

	return toSessionReferenceTranscript(blocks);
}

export function toSessionReferenceAttachmentMeta(sessionResource: URI): NonNullable<SimpleMessageAttachment['_meta']> {
	return {
		[AgentHostSessionReferenceAttachmentMetadataKey]: {
			sessionResource: sessionResource.toString(),
			sessionID: chatSessionResourceToId(sessionResource),
		} satisfies IAgentHostSessionReferenceAttachmentMetadata,
	};
}

export function restoreSessionReferenceVariableEntryFromAttachment(attachment: SimpleMessageAttachment): IChatRequestSessionReferenceVariableEntry | undefined {
	if (attachment.displayKind !== AgentHostSessionReferenceAttachmentDisplayKind) {
		return undefined;
	}

	const metadata = getSessionReferenceAttachmentMetadata(attachment);
	if (!metadata) {
		return undefined;
	}

	try {
		const sessionResource = URI.parse(metadata.sessionResource);
		return {
			kind: 'sessionReference',
			id: sessionResource.toString(),
			name: attachment.label,
			value: sessionResource,
			_meta: attachment._meta,
		};
	} catch {
		return undefined;
	}
}

function getSessionReferenceAttachmentMetadata(attachment: SimpleMessageAttachment): IAgentHostSessionReferenceAttachmentMetadata | undefined {
	const meta = attachment._meta;
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	const metadata = meta[AgentHostSessionReferenceAttachmentMetadataKey];
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return undefined;
	}
	const typedMetadata = metadata as Partial<IAgentHostSessionReferenceAttachmentMetadata>;
	const sessionResource = typedMetadata.sessionResource;
	if (typeof sessionResource !== 'string') {
		return undefined;
	}
	const sessionID = typedMetadata.sessionID;
	if (typeof sessionID !== 'string') {
		return undefined;
	}
	return {
		sessionResource,
		sessionID,
	};
}

function toSessionReferenceTranscript(blocks: readonly string[]): string | undefined {
	const transcript = blocks.join('\n\n').trim();
	if (!transcript) {
		return undefined;
	}
	return transcript.length > SessionReferenceTranscriptMaxChars ? truncateMiddle(transcript, SessionReferenceTranscriptMaxChars) : transcript;
}

function toSessionReferenceResponse(parts: readonly IChatProgress[]): string | undefined {
	const chunks: string[] = [];
	for (const part of parts) {
		switch (part.kind) {
			case 'markdownContent':
			case 'markdownVuln':
			case 'progressMessage':
			case 'warning':
			case 'info':
				if (part.content.value.trim()) {
					chunks.push(part.content.value.trim());
				}
				break;
			case 'progressTaskResult':
				if (part.content?.value.trim()) {
					chunks.push(part.content.value.trim());
				}
				break;
		}
	}
	const response = chunks.join('\n\n').trim();
	return response || undefined;
}

function toSessionReferenceDebugMessage(message: string, sections: readonly IChatDebugMessageSection[]): string | undefined {
	const renderedSections = toSessionReferenceDebugSections(sections);
	if (renderedSections) {
		return renderedSections;
	}
	const trimmedMessage = message.trim();
	return trimmedMessage || undefined;
}

function toSessionReferenceDebugSections(sections: readonly IChatDebugMessageSection[] | undefined): string | undefined {
	const chunks = sections
		?.map(section => section.content.trim())
		.filter(content => !!content);
	return chunks?.length ? chunks.join('\n\n') : undefined;
}
