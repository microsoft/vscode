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
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced element attachment slot; validated below.
	const metadata = attachment._meta?.[AgentHostElementAttachmentMetadataKey];
	// eslint-disable-next-line local/code-no-in-operator
	if (!metadata || typeof metadata !== 'object' || !('correlationId' in metadata) || typeof metadata.correlationId !== 'string') {
		return undefined;
	}
	return metadata.correlationId;
}
