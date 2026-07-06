/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { type SimpleMessageAttachment } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type IChatRequestSessionReferenceVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { chatSessionResourceToId } from '../../../common/model/chatUri.js';

export const AgentHostSessionReferenceAttachmentDisplayKind = 'sessionReference';
export const AgentHostSessionReferenceTrajectoryAttachmentDisplayKind = 'sessionReferenceTrajectory';
export const AgentHostSessionReferenceAttachmentMetadataKey = 'vscode.agentHost.sessionReference';

interface IAgentHostSessionReferenceAttachmentMetadata {
	readonly sessionResource: string;
	readonly sessionID: string;
}

export function toSessionReferenceModelRepresentation(label: string, sessionResource: URI, trajectoryPath?: string): string {
	const sessionID = chatSessionResourceToId(sessionResource);
	const lines = [
		`Attached chat session: ${label}`,
		`Session ID: ${sessionID}`,
		`Session resource: ${sessionResource.toString()}`,
	];
	if (trajectoryPath) {
		lines.push(`Session events file attached: ${trajectoryPath}`);
	}
	return lines.join('\n');
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

export function isSessionReferenceTrajectoryAttachment(attachment: { readonly displayKind?: string }): boolean {
	return attachment.displayKind === AgentHostSessionReferenceTrajectoryAttachmentDisplayKind;
}
