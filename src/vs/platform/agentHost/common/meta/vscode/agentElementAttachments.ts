/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	return isElementAttachmentMetadata(metadata) ? metadata.correlationId : undefined;
}

function isElementAttachmentMetadata(value: unknown): value is IAgentHostElementAttachmentMetadata {
	return typeof value === 'object'
		&& value !== null
		&& 'correlationId' in value
		&& typeof value.correlationId === 'string';
}
