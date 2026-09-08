/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { createSessionReferenceAttachmentMeta, readSessionReferenceAttachmentMeta } from '../../../../../../platform/agentHost/common/meta/sessionReferenceAttachmentMeta.js';
import { type SimpleMessageAttachment } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type IChatRequestSessionReferenceVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { chatSessionResourceToId } from '../../../common/model/chatUri.js';

export { AgentHostSessionReferenceAttachmentMetadataKey } from '../../../../../../platform/agentHost/common/meta/sessionReferenceAttachmentMeta.js';

export const AgentHostSessionReferenceAttachmentDisplayKind = 'sessionReference';
export const AgentHostSessionReferenceTrajectoryAttachmentDisplayKind = 'sessionReferenceTrajectory';

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
	return createSessionReferenceAttachmentMeta(sessionResource.toString(), chatSessionResourceToId(sessionResource));
}

export function restoreSessionReferenceVariableEntryFromAttachment(attachment: SimpleMessageAttachment): IChatRequestSessionReferenceVariableEntry | undefined {
	if (attachment.displayKind !== AgentHostSessionReferenceAttachmentDisplayKind) {
		return undefined;
	}

	const metadata = readSessionReferenceAttachmentMeta(attachment);
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

export function isSessionReferenceTrajectoryAttachment(attachment: { readonly displayKind?: string }): boolean {
	return attachment.displayKind === AgentHostSessionReferenceTrajectoryAttachmentDisplayKind;
}
