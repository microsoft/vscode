/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';

export const AgentHostElementAttachmentDisplayKind = 'element';
export const AgentHostElementAttachmentMetadataKey = 'vscode.agentHost.elementAttachment';

export interface IAgentHostElementAttachmentMetadata {
	readonly correlationId: string;
}

export function toElementAttachmentMeta(correlationId: string): Record<string, IAgentHostElementAttachmentMetadata> {
	return {
		[AgentHostElementAttachmentMetadataKey]: { correlationId }
	};
}

export function getElementAttachmentCorrelationId(attachment: { readonly _meta?: Record<string, unknown> }): string | undefined {
	const metadata = attachment._meta?.[AgentHostElementAttachmentMetadataKey];
	if (!metadata || typeof metadata !== 'object' || !hasKey(metadata, { correlationId: true }) || typeof metadata.correlationId !== 'string') {
		return undefined;
	}
	return metadata.correlationId;
}
