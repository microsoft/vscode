/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Well-known `_meta` key carried by a `#session` reference message attachment.
 * A session reference lets the user point the built-in `/troubleshoot` skill at
 * a session **other than** the current one; the harness reads this meta at send
 * time to resolve the referenced session's on-disk event log.
 *
 * Kept in the platform layer so both the harness (which produces the `#session`
 * completion and consumes it at send time) and the workbench (which renders the
 * attachment pill and restores it on reload) share one contract.
 */
export const AgentHostSessionReferenceAttachmentMetadataKey = 'vscode.agentHost.sessionReference';

/**
 * Typed view over the {@link AgentHostSessionReferenceAttachmentMetadataKey}
 * payload on a session-reference attachment's `_meta` bag.
 */
export interface IAgentHostSessionReferenceAttachmentMetadata {
	/** The referenced session's resource URI, serialized via `URI.toString()`. */
	readonly sessionResource: string;
	/** The referenced session's id (the `chatSessionResourceToId` of the resource). */
	readonly sessionID: string;
}

/**
 * Builds the `_meta` bag for a session-reference attachment. Producers (the
 * `#session` completion provider) MUST go through this so the shape stays in
 * lock-step with {@link readSessionReferenceAttachmentMeta}.
 */
export function toSessionReferenceAttachmentMeta(metadata: IAgentHostSessionReferenceAttachmentMetadata): Record<string, unknown> {
	return {
		[AgentHostSessionReferenceAttachmentMetadataKey]: {
			sessionResource: metadata.sessionResource,
			sessionID: metadata.sessionID,
		} satisfies IAgentHostSessionReferenceAttachmentMetadata,
	};
}

/**
 * Reads the {@link IAgentHostSessionReferenceAttachmentMetadata} from an
 * attachment's `_meta` bag, returning `undefined` when the bag is missing or
 * malformed.
 */
export function readSessionReferenceAttachmentMeta(meta: Record<string, unknown> | undefined): IAgentHostSessionReferenceAttachmentMetadata | undefined {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	const raw = meta[AgentHostSessionReferenceAttachmentMetadataKey];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return undefined;
	}
	const typed = raw as Partial<IAgentHostSessionReferenceAttachmentMetadata>;
	if (typeof typed.sessionResource !== 'string' || typeof typed.sessionID !== 'string') {
		return undefined;
	}
	return { sessionResource: typed.sessionResource, sessionID: typed.sessionID };
}
