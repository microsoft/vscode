/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SimpleMessageAttachment } from '../state/protocol/state.js';

export const AgentHostSessionReferenceAttachmentMetadataKey = 'vscode.agentHost.sessionReference';

export interface IAgentHostSessionReferenceAttachmentMetadata {
	readonly sessionResource: string;
	readonly sessionID: string;
}

export function createSessionReferenceAttachmentMeta(sessionResource: string, sessionID: string): NonNullable<SimpleMessageAttachment['_meta']> {
	return {
		[AgentHostSessionReferenceAttachmentMetadataKey]: {
			sessionResource,
			sessionID,
		} satisfies IAgentHostSessionReferenceAttachmentMetadata,
	};
}

export function readSessionReferenceAttachmentMeta(attachment: SimpleMessageAttachment): IAgentHostSessionReferenceAttachmentMetadata | undefined {
	const meta = attachment._meta;
	const metadata = meta?.[AgentHostSessionReferenceAttachmentMetadataKey];
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return undefined;
	}
	const raw = metadata as Record<string, unknown>;
	if (typeof raw['sessionResource'] !== 'string' || typeof raw['sessionID'] !== 'string') {
		return undefined;
	}
	return {
		sessionResource: raw['sessionResource'],
		sessionID: raw['sessionID'],
	};
}
